/* WordleGame — Kenney CC0 sprite rendering — Wordle-style word guessing for Your World Arcade
 * Canvas 2D, zero dependencies. Daily & Free Play modes.
 * IIFE pattern matching Your World Arcade originals. */
window.WordleGame = (() => {

    // ══════════════════════════════════════════
    //  SPRITE SYSTEM — Kenney tiles for letter tiles
    // ══════════════════════════════════════════
    const WG_SPRITES = {};
    let wgSpritesLoaded = false;
    let wgSpriteLoadTotal = 0, wgSpriteLoadDone = 0;
    const WG_SPRITE_OK = {};
    const WG_SPRITE_MANIFEST = {
        'tileGreen':  '/img/game-assets/kenney-tiles/tileGreen_01.png',
        'tileYellow': '/img/game-assets/kenney-tiles/tileYellow_01.png',
        'tileGrey':   '/img/game-assets/kenney-tiles/tileBlue_03.png',
        'tileEmpty':  '/img/game-assets/kenney-tiles/tileBlue_05.png',
        'tilePink':   '/img/game-assets/kenney-tiles/tilePink_01.png',
        'star':       '/img/game-assets/kenney-ui/star.png',
    };

    function wgPreloadSprites(onProgress, onDone) {
        const keys = Object.keys(WG_SPRITE_MANIFEST);
        wgSpriteLoadTotal = keys.length;
        wgSpriteLoadDone = 0;
        if (keys.length === 0) { wgSpritesLoaded = true; onDone(); return; }
        for (const key of keys) {
            const img = new Image();
            img.onload = () => { WG_SPRITE_OK[key] = true; wgSpriteLoadDone++; onProgress(wgSpriteLoadDone / wgSpriteLoadTotal); if (wgSpriteLoadDone >= wgSpriteLoadTotal) { wgSpritesLoaded = true; onDone(); } };
            img.onerror = () => { WG_SPRITE_OK[key] = false; wgSpriteLoadDone++; onProgress(wgSpriteLoadDone / wgSpriteLoadTotal); if (wgSpriteLoadDone >= wgSpriteLoadTotal) { wgSpritesLoaded = true; onDone(); } };
            img.src = WG_SPRITE_MANIFEST[key];
            WG_SPRITES[key] = img;
        }
    }

    function wgSpr(key) { return WG_SPRITE_OK[key] ? WG_SPRITES[key] : null; }

    // Map tile state -> sprite key
    function getStateSpriteKey(state) {
        if (state === 'correct') return 'tileGreen';
        if (state === 'present') return 'tileYellow';
        if (state === 'absent') return 'tileGrey';
        return 'tileEmpty';
    }

    let wgLoadingProgress = 0;
    let wgIsLoading = true;

    function wgDrawLoadingScreen() {
        if (!canvas || !ctx) return;
        ctx.fillStyle = '#121213';
        ctx.fillRect(0, 0, GAME_W, GAME_H);
        ctx.fillStyle = '#538D4E';
        ctx.font = 'bold 28px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('WORDLE', GAME_W / 2, GAME_H / 2 - 40);
        const barW = GAME_W * 0.5, barH = 12;
        const barX = (GAME_W - barW) / 2, barY = GAME_H / 2;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#538D4E';
        ctx.fillRect(barX, barY, barW * wgLoadingProgress, barH);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '12px "Segoe UI", system-ui, sans-serif';
        ctx.fillText('Loading sprites...', GAME_W / 2, barY + barH + 20);
    }

    // ── Constants ──
    const GAME_W = 480, GAME_H = 640;
    const WORD_LEN = 5, MAX_GUESSES = 6;
    const TILE_SIZE = 58, TILE_GAP = 6;
    const GRID_TOP = 80;
    const KB_TOP = 440;
    const KB_KEY_W = 36, KB_KEY_H = 48, KB_KEY_GAP = 4;
    const FLIP_DURATION = 400;
    const BOUNCE_DURATION = 300;
    const SHAKE_DURATION = 500;
    const CONFETTI_COUNT = 80;

    // ── Word List (200+ arcade/game-themed 5-letter words) ──
    const WORDS = [
        'GAMES','WORLD','SCORE','BLOCK','LEVEL','PIXEL','POWER','QUEST','STAGE','BONUS',
        'ARENA','MAGIC','SWORD','ARMOR','BEAST','BLAZE','BRAVE','CLASH','CRAFT','CRYPT',
        'DODGE','DRIFT','DRIVE','DUNGS','ELITE','EMBER','EXTRA','FLAME','FLASH','FORGE',
        'FROST','GHOST','GIANT','GLEAM','GLIDE','GLOBE','GLOOM','GRACE','GRAND','GUARD',
        'GUILD','HAVEN','HEART','JOUST','KNAVE','KNIFE','LASER','LEAPS','LIGHT','LUNAR',
        'MATCH','METAL','MIGHT','MINES','MORPH','NIGHT','NINJA','NOBLE','ORBIT','PEARL',
        'PHASE','PILOT','PIPER','PLANT','PLATE','PLUME','PRIME','PRISM','PULSE','PUNCH',
        'QUEEN','QUICK','RADAR','RACER','REALM','REIGN','RIDER','RISEN','ROGUE','ROYAL',
        'RUINS','SCALE','SCOUT','SHADE','SHARK','SHELL','SHIFT','SHINE','SHOCK','SIEGE',
        'SKILL','SLASH','SLIDE','SMASH','SNARE','SOLAR','SONIC','SPACE','SPARK','SPEED',
        'SPELL','SPIKE','SPINE','STAFF','STAKE','STARS','STEAL','STEAM','STEEL','STONE',
        'STORM','STORY','STUNT','SURGE','SWIFT','SWORN','THORN','TITAN','TOKEN','TORCH',
        'TOWER','TRACE','TRAIN','TRICK','TROOP','ULTRA','UNITY','VAULT','VIGOR','VIPER',
        'VITAL','VIVID','VOICE','WATCH','WATER','WHEEL','WINGS','WITCH','WRATH','YOUTH',
        'ALIEN','ANGEL','BADGE','BLADE','BLAST','BLISS','BLOWN','BOARD','BOUND','BREAK',
        'BRICK','CABIN','CANDY','CHAIN','CHARM','CHASE','CHIEF','CLIMB','CLOUD','COBRA',
        'COLOR','CORAL','COVER','CRANE','CRASH','CROWN','CRUSH','CURVE','DANCE','DEMON',
        'DEPTH','DREAM','EAGLE','EARTH','ENTRY','FABLE','FEAST','FIBER','FIELD','FINAL',
        'FLAIR','FLOAT','FLOOD','FLOOR','FLUTE','FORCE','FORMS','FOUND','FRAME','FRESH',
        'FRUIT','GRAIL','GRAPE','GREEN','GRILL','GRIND','GROVE','HAPPY','HASTE','HEAVY',
        'HONOR','HOVER','HYPER','IMAGE','IVORY','JEWEL','JUDGE','JUICE','LABOR','LANCE',
        'LARGE','LEMON','LLAMA','LOTUS','LOWER','LUCKY','MEDAL','MERCY','MERRY','METRO',
        'MINOR','MOCHA','MODEL','MONEY','MOUNT','MOVIE','MURAL','MUSIC','MISTY','NERVE',
        'NORTH','OCEAN','OLIVE','OPERA','ORDER','OTHER','OUTER','OXIDE','PAINT','PANEL',
        'PARTY','PEACE','PEACH','PIANO','PITCH','PLAID','PLAZA','POINT','POLAR','POUND',
        'PRESS','PRIDE','PRIZE','PROOF','PROUD','PROXY','PUPIL','QUIET','QUILT','QUOTE',
        'RADIO','RALLY','RANCH','RANGE','RAPID','RATIO','RAVEN','REACH','REBEL','RELAX',
        'REMIX','RIDER','RIGID','RIVAL','RIVER','ROBIN','ROBOT','ROCKY','ROUGE','ROUGH',
        'ROUND','ROUTE','ROVER','SABER','SAINT','SALSA','SATIN','SAVOR','SCENE','SCOPE',
        'SETUP','SEVEN','SHARE','SHARP','SHEEP','SHORE','SHOUT','SIGMA','SIREN','SLATE'
    ];

    // Valid 5-letter words for guess validation (includes WORDS + common extras)
    const VALID_GUESSES = new Set(WORDS.map(w => w.toUpperCase()));
    // Add common English words so players aren't too restricted
    const EXTRA_VALID = [
        'ABOUT','ABOVE','AFTER','AGAIN','ALONG','AMONG','BEGAN','BEGIN','BEING','BELOW',
        'BRING','BUILD','CARRY','CAUSE','CHECK','CHILD','CLEAN','CLEAR','CLOSE','COULD',
        'EARLY','EIGHT','ENJOY','ENTER','EQUAL','EVENT','EVERY','EXACT','EXIST','EXTRA',
        'FAITH','FALSE','FAVOR','FIFTY','FIGHT','FINAL','FIRST','FIXED','FLOOR','FORTH',
        'FRONT','FULLY','GIVEN','GLASS','GOING','GONNA','GRACE','GRAIN','GRANT','GRASS',
        'GREAT','GROUP','GROWN','GUESS','HAPPY','HELLO','HENCE','HORSE','HOTEL','HOUSE',
        'HUMAN','HURRY','IDEAL','INDEX','INNER','INPUT','ISSUE','JOINT','KNOWN','LAUGH',
        'LAYER','LEARN','LEAST','LEAVE','LIGHT','LIMIT','LIVES','LOCAL','LOOSE','LOVER',
        'LOWER','LUCKY','LUNCH','MAGIC','MAJOR','MAKER','MARCH','MAYBE','MAYOR','MEDIA',
        'MIGHT','MORAL','MOUTH','MOVED','NAMED','NERVE','NEVER','NOISE','NORTH','NOTED',
        'NOVEL','NURSE','OCCUR','OFFER','OFTEN','OLDER','ONSET','OPENS','ORDER','OTHER',
        'OUGHT','OUTER','OWNED','OWNER','PAINT','PAPER','PATCH','PAUSE','PHASE','PHONE',
        'PHOTO','PIANO','PIECE','PITCH','PLACE','PLAIN','PLANE','PLANT','PLATE','PLAZA',
        'PLEAD','PLUMB','POEMS','POINT','POUND','PRESS','PRICE','PRIDE','PRIME','PRINT',
        'PRIOR','PROVE','PUPIL','QUEEN','QUIET','QUITE','QUOTA','QUOTE','RAISE','RALLY',
        'RANGE','RAPID','RATIO','REACH','REACT','READY','REFER','REIGN','RELAX','REPLY',
        'RIDER','RIGHT','RIVAL','RIVER','ROUGH','ROUND','ROUTE','ROYAL','RURAL','SADLY',
        'SAINT','SCALE','SCENE','SCOPE','SERVE','SEVEN','SHALL','SHAPE','SHARE','SHARP',
        'SHEET','SHELF','SHELL','SHIFT','SHIRT','SHOCK','SHOOT','SHORT','SHOUT','SIGHT',
        'SINCE','SIXTH','SIXTY','SIZED','SKILL','SLEEP','SLIDE','SMALL','SMART','SMILE',
        'SMOKE','SOLVE','SORRY','SOUND','SOUTH','SPEAK','SPEED','SPEND','SPLIT','SPOKE',
        'SPORT','SPRAY','SQUAD','STACK','STAFF','STAGE','STAIR','STAKE','STAND','STARE',
        'START','STATE','STAYS','STEAM','STEEL','STEEP','STEMS','STICK','STILL','STOCK',
        'STOOD','STORE','STORY','STRIP','STUCK','STUDY','STUFF','STYLE','SUGAR','SUITE',
        'SUPER','SWEET','SWIFT','SWING','TAKEN','TASTE','TEACH','TEETH','THANK','THEME',
        'THERE','THICK','THING','THINK','THIRD','THOSE','THREE','THROW','TIGHT','TIMES',
        'TIRED','TITLE','TODAY','TOPIC','TOTAL','TOUCH','TOUGH','TOWER','TRACE','TRACK',
        'TRADE','TRAIL','TRAIT','TREAT','TREND','TRIAL','TRIBE','TRIED','TROOP','TRUCK',
        'TRULY','TRUST','TRUTH','TWICE','TYPED','UNDER','UNION','UNITE','UNITY','UNTIL',
        'UPPER','UPSET','URBAN','USAGE','USUAL','VALID','VALUE','VIDEO','VIGOR','VIRUS',
        'VISIT','VITAL','VOCAL','VOICE','VOTER','WASTE','WATCH','WATER','WEIGH','WEIRD',
        'WHEEL','WHERE','WHICH','WHILE','WHITE','WHOLE','WHOSE','WOMAN','WOMEN','WORLD',
        'WORRY','WORSE','WORST','WORTH','WOULD','WOUND','WRITE','WRONG','WROTE','YIELD',
        'YOUNG','YOURS','ZEBRA','CRANE','BLINK','TRICK','FLINT','SWIRL','CLING','GRIND'
    ];
    EXTRA_VALID.forEach(w => VALID_GUESSES.add(w.toUpperCase()));

    // Keyboard layout
    const KB_ROWS = [
        ['Q','W','E','R','T','Y','U','I','O','P'],
        ['A','S','D','F','G','H','J','K','L'],
        ['ENTER','Z','X','C','V','B','N','M','DEL']
    ];

    // ── State ──
    let canvas, ctx;
    let player = null, onGameOver = null;
    let gameActive = false;
    let animFrame = null;
    let frameCount = 0;
    let SCALE = 1;

    // Theme colors
    let BG_GRAD = ['#0A0A1A', '#1A0A2E'];
    let THEME_COLORS = ['#22C55E', '#EAB308', '#6B7280', '#3B82F6', '#F43F5E'];
    let TILE_BG = '#374151';
    let TILE_BORDER = '#4B5563';
    let KEY_BG = '#6B7280';
    let KEY_TEXT = '#FFFFFF';

    // Game state
    let targetWord = '';
    let guesses = [];         // Array of strings
    let currentGuess = '';
    let currentRow = 0;
    let letterStates = {};    // {letter: 'correct'|'present'|'absent'}
    let gameWon = false;
    let gameLost = false;
    let dailyMode = true;
    let statsKey = 'wordleGameStats';

    // Animation state
    let flipAnims = [];       // {row, col, progress, phase:'shrink'|'grow', color}
    let bounceAnims = [];     // {row, col, progress}
    let shakeAnim = { active: false, startTime: 0 };
    let confetti = [];
    let floatingTexts = [];
    let showStats = false;
    let revealRow = -1;       // Row currently being revealed
    let revealCol = -1;       // Current column in reveal
    let revealStartTime = 0;
    let tileResults = [];     // [{row, col, state:'correct'|'present'|'absent'}]
    let messageText = '';
    let messageTimer = 0;

    // Stats
    let stats = { played: 0, won: 0, streak: 0, maxStreak: 0, guessDistribution: [0,0,0,0,0,0] };

    // ══════════════════════════════════════════════
    // AUDIO
    // ══════════════════════════════════════════════
    let audioCtx = null;
    function getAudioCtx() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
        }
        return audioCtx;
    }

    function playKeyTap() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.value = 800; osc.type = 'sine';
            gain.gain.setValueAtTime(0.06, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.05);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.05);
        } catch {}
    }

    function playFlip() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.value = 500; osc.type = 'triangle';
            gain.gain.setValueAtTime(0.08, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.1);
        } catch {}
    }

    function playCorrect() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.value = 880; osc.type = 'sine';
            gain.gain.setValueAtTime(0.1, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.15);
        } catch {}
    }

    function playWrong() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.value = 200; osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0.08, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.2);
        } catch {}
    }

    function playWinFanfare() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const notes = [523, 659, 784, 1047, 784, 1047, 1319];
            notes.forEach((freq, i) => {
                const osc = ac.createOscillator();
                const gain = ac.createGain();
                osc.connect(gain); gain.connect(ac.destination);
                osc.frequency.value = freq; osc.type = 'sine';
                const t = ac.currentTime + i * 0.08;
                gain.gain.setValueAtTime(0.1, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
                osc.start(t); osc.stop(t + 0.2);
            });
        } catch {}
    }

    // ══════════════════════════════════════════════
    // THEME SETUP
    // ══════════════════════════════════════════════
    function loadTheme() {
        let theme = null;
        if (window.ArcadeThemes && player) {
            const tid = (player.theme || player.character || 'candy');
            theme = window.ArcadeThemes.themes[tid];
        }
        if (theme) {
            BG_GRAD = theme.bgGradient || BG_GRAD;
            const c = theme.colors || [];
            if (c.length >= 3) {
                THEME_COLORS = [c[0], c[1], c[2], c[3] || c[0], c[4] || c[1]];
            }
        }
    }

    // ══════════════════════════════════════════════
    // WORD SELECTION
    // ══════════════════════════════════════════════
    function getDailyWord() {
        const now = new Date();
        const start = new Date(2024, 0, 1);
        const dayIndex = Math.floor((now - start) / (24 * 60 * 60 * 1000));
        return WORDS[dayIndex % WORDS.length];
    }

    function getRandomWord() {
        return WORDS[Math.floor(Math.random() * WORDS.length)];
    }

    // ══════════════════════════════════════════════
    // STATS
    // ══════════════════════════════════════════════
    function loadStats() {
        try {
            const raw = localStorage.getItem(statsKey);
            if (raw) stats = JSON.parse(raw);
        } catch {}
    }

    function saveStats() {
        try { localStorage.setItem(statsKey, JSON.stringify(stats)); } catch {}
    }

    function updateStats(won, guessCount) {
        stats.played++;
        if (won) {
            stats.won++;
            stats.streak++;
            if (stats.streak > stats.maxStreak) stats.maxStreak = stats.streak;
            if (guessCount >= 1 && guessCount <= 6) {
                stats.guessDistribution[guessCount - 1]++;
            }
        } else {
            stats.streak = 0;
        }
        saveStats();
    }

    // ══════════════════════════════════════════════
    // SHARE
    // ══════════════════════════════════════════════
    function generateShareText() {
        const dayNum = dailyMode ? Math.floor((new Date() - new Date(2024,0,1)) / 86400000) : '?';
        const result = gameWon ? currentRow : 'X';
        let text = `Wordle Game #${dayNum} ${result}/${MAX_GUESSES}\n\n`;
        for (let r = 0; r < guesses.length; r++) {
            let line = '';
            for (let c = 0; c < WORD_LEN; c++) {
                const res = getTileResult(r, c);
                if (res === 'correct') line += '🟩';
                else if (res === 'present') line += '🟨';
                else line += '⬛';
            }
            text += line + '\n';
        }
        return text.trim();
    }

    function getTileResult(row, col) {
        const found = tileResults.find(t => t.row === row && t.col === col);
        return found ? found.state : null;
    }

    // ══════════════════════════════════════════════
    // GUESS EVALUATION
    // ══════════════════════════════════════════════
    function evaluateGuess(guess) {
        const results = [];
        const target = targetWord.split('');
        const guessArr = guess.split('');
        const targetCounts = {};

        // Count letters in target
        for (const ch of target) targetCounts[ch] = (targetCounts[ch] || 0) + 1;

        // First pass: correct positions
        for (let i = 0; i < WORD_LEN; i++) {
            if (guessArr[i] === target[i]) {
                results[i] = 'correct';
                targetCounts[guessArr[i]]--;
            } else {
                results[i] = null;
            }
        }

        // Second pass: present but wrong position
        for (let i = 0; i < WORD_LEN; i++) {
            if (results[i]) continue;
            if (targetCounts[guessArr[i]] && targetCounts[guessArr[i]] > 0) {
                results[i] = 'present';
                targetCounts[guessArr[i]]--;
            } else {
                results[i] = 'absent';
            }
        }

        return results;
    }

    // ══════════════════════════════════════════════
    // LAYOUT HELPERS
    // ══════════════════════════════════════════════
    function getGridX() {
        return (GAME_W - (WORD_LEN * (TILE_SIZE + TILE_GAP) - TILE_GAP)) / 2;
    }

    function getTileRect(row, col) {
        const gx = getGridX();
        return {
            x: gx + col * (TILE_SIZE + TILE_GAP),
            y: GRID_TOP + row * (TILE_SIZE + TILE_GAP),
            w: TILE_SIZE,
            h: TILE_SIZE
        };
    }

    function getKBKeyRect(rowIdx, colIdx) {
        const row = KB_ROWS[rowIdx];
        const totalW = row.reduce((sum, key) => {
            const w = (key === 'ENTER' || key === 'DEL') ? KB_KEY_W * 1.5 : KB_KEY_W;
            return sum + w + KB_KEY_GAP;
        }, -KB_KEY_GAP);
        let startX = (GAME_W - totalW) / 2;
        let x = startX;
        for (let i = 0; i < colIdx; i++) {
            const w = (row[i] === 'ENTER' || row[i] === 'DEL') ? KB_KEY_W * 1.5 : KB_KEY_W;
            x += w + KB_KEY_GAP;
        }
        const w = (row[colIdx] === 'ENTER' || row[colIdx] === 'DEL') ? KB_KEY_W * 1.5 : KB_KEY_W;
        return { x, y: KB_TOP + rowIdx * (KB_KEY_H + KB_KEY_GAP), w, h: KB_KEY_H };
    }

    // ══════════════════════════════════════════════
    // COLORS
    // ══════════════════════════════════════════════
    function getStateColor(state) {
        switch (state) {
            case 'correct': return '#22C55E';
            case 'present': return '#EAB308';
            case 'absent':  return '#4B5563';
            default:        return TILE_BG;
        }
    }

    function getStateBorder(state) {
        switch (state) {
            case 'correct': return '#16A34A';
            case 'present': return '#CA8A04';
            case 'absent':  return '#374151';
            default:        return TILE_BORDER;
        }
    }

    // ══════════════════════════════════════════════
    // DRAWING
    // ══════════════════════════════════════════════
    function roundRect(x, y, w, h, r) {
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function drawBackground() {
        const grad = ctx.createLinearGradient(0, 0, 0, GAME_H);
        grad.addColorStop(0, BG_GRAD[0]);
        grad.addColorStop(1, BG_GRAD[1]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, GAME_W, GAME_H);
    }

    function drawTitle() {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Title
        ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('WORDLE', GAME_W / 2, 30);

        // Mode indicator
        ctx.font = '14px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#9CA3AF';
        ctx.fillText(dailyMode ? '📅 Daily' : '🎲 Free Play', GAME_W / 2, 52);

        // Stats button area (top-right)
        ctx.font = '20px Arial';
        ctx.fillStyle = '#9CA3AF';
        ctx.textAlign = 'right';
        ctx.fillText('📊', GAME_W - 20, 30);
        ctx.textAlign = 'center';
    }

    function drawGrid() {
        const now = performance.now();

        for (let r = 0; r < MAX_GUESSES; r++) {
            for (let c = 0; c < WORD_LEN; c++) {
                const rect = getTileRect(r, c);
                let { x, y, w, h } = rect;

                // Apply shake
                if (shakeAnim.active && r === currentRow) {
                    const elapsed = now - shakeAnim.startTime;
                    if (elapsed < SHAKE_DURATION) {
                        const progress = elapsed / SHAKE_DURATION;
                        const amp = 8 * (1 - progress);
                        x += Math.sin(progress * Math.PI * 8) * amp;
                    } else {
                        shakeAnim.active = false;
                    }
                }

                // Check if this tile is being flipped
                const flipAnim = flipAnims.find(f => f.row === r && f.col === c);
                const result = getTileResult(r, c);
                const isRevealed = result !== null;

                let letter = '';
                if (r < guesses.length) {
                    letter = guesses[r][c] || '';
                } else if (r === currentRow && c < currentGuess.length) {
                    letter = currentGuess[c];
                }

                ctx.save();

                if (flipAnim) {
                    // Flip animation: scale Y
                    const elapsed = now - flipAnim.startTime;
                    const halfDur = FLIP_DURATION / 2;
                    let scaleY;
                    let bgColor, borderColor;

                    if (elapsed < halfDur) {
                        // Shrinking
                        scaleY = 1 - (elapsed / halfDur);
                        bgColor = TILE_BG;
                        borderColor = TILE_BORDER;
                    } else if (elapsed < FLIP_DURATION) {
                        // Growing back with new color
                        scaleY = (elapsed - halfDur) / halfDur;
                        bgColor = getStateColor(flipAnim.state);
                        borderColor = getStateBorder(flipAnim.state);
                    } else {
                        scaleY = 1;
                        bgColor = getStateColor(flipAnim.state);
                        borderColor = getStateBorder(flipAnim.state);
                        // Remove completed flip
                        flipAnims = flipAnims.filter(f => f !== flipAnim);
                    }

                    const cy = y + h / 2;
                    ctx.translate(0, cy);
                    ctx.scale(1, Math.max(0.01, scaleY));
                    ctx.translate(0, -cy);

                    // Draw tile
                    roundRect(x, y, w, h, 4);
                    ctx.fillStyle = bgColor;
                    ctx.fill();
                    ctx.strokeStyle = borderColor;
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    // Letter
                    if (letter && scaleY > 0.3) {
                        ctx.font = 'bold 30px "Segoe UI", Arial, sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillText(letter, x + w / 2, y + h / 2);
                    }
                } else {
                    // Bounce animation for winning row
                    const bounceAnim = bounceAnims.find(b => b.row === r && b.col === c);
                    if (bounceAnim) {
                        const elapsed = now - bounceAnim.startTime;
                        if (elapsed < BOUNCE_DURATION) {
                            const progress = elapsed / BOUNCE_DURATION;
                            const bounce = Math.sin(progress * Math.PI) * 15;
                            y -= bounce;
                        } else {
                            bounceAnims = bounceAnims.filter(b => b !== bounceAnim);
                        }
                    }

                    // Background color
                    let bgColor = TILE_BG;
                    let borderColor = TILE_BORDER;

                    if (isRevealed) {
                        bgColor = getStateColor(result);
                        borderColor = getStateBorder(result);
                    } else if (r === currentRow && c < currentGuess.length) {
                        borderColor = '#9CA3AF';
                    }

                    // TRY SPRITE for tile background
                    const sprKey = isRevealed ? getStateSpriteKey(result) : 'tileEmpty';
                    const tileSpr = wgSpr(sprKey);
                    if (tileSpr && (isRevealed || letter)) {
                        ctx.drawImage(tileSpr, x, y, w, h);
                        // Color overlay for revealed tiles
                        if (isRevealed) {
                            ctx.globalAlpha = 0.3;
                            ctx.fillStyle = bgColor;
                            roundRect(x, y, w, h, 4);
                            ctx.fill();
                            ctx.globalAlpha = 1;
                        }
                        ctx.strokeStyle = borderColor;
                        ctx.lineWidth = 1;
                        roundRect(x, y, w, h, 4);
                        ctx.stroke();
                    } else {
                        // FALLBACK
                        roundRect(x, y, w, h, 4);
                        ctx.fillStyle = bgColor;
                        ctx.fill();
                        ctx.strokeStyle = borderColor;
                        ctx.lineWidth = 2;
                        ctx.stroke();
                    }

                    // Letter
                    if (letter) {
                        ctx.font = 'bold 30px "Segoe UI", Arial, sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = '#FFFFFF';
                        ctx.shadowColor = 'rgba(0,0,0,0.5)';
                        ctx.shadowBlur = 3;
                        ctx.fillText(letter, x + w / 2, y + h / 2);
                        ctx.shadowBlur = 0;
                    }
                }

                ctx.restore();
            }
        }
    }

    function drawKeyboard() {
        for (let r = 0; r < KB_ROWS.length; r++) {
            for (let c = 0; c < KB_ROWS[r].length; c++) {
                const key = KB_ROWS[r][c];
                const rect = getKBKeyRect(r, c);
                const { x, y, w, h } = rect;

                // Key color based on letter state
                let bgColor = '#6B7280';
                let textColor = '#FFFFFF';

                if (key.length === 1 && letterStates[key]) {
                    bgColor = getStateColor(letterStates[key]);
                }

                roundRect(x, y, w, h, 6);
                ctx.fillStyle = bgColor;
                ctx.fill();

                // Key label
                ctx.font = (key === 'ENTER' || key === 'DEL') ? 'bold 12px "Segoe UI", Arial, sans-serif' : 'bold 16px "Segoe UI", Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = textColor;
                const label = key === 'DEL' ? '⌫' : key;
                ctx.fillText(label, x + w / 2, y + h / 2);
            }
        }
    }

    function drawMessage() {
        if (!messageText || performance.now() > messageTimer) {
            messageText = '';
            return;
        }
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
        const tw = ctx.measureText(messageText).width + 24;
        const mx = GAME_W / 2, my = GRID_TOP - 15;
        roundRect(mx - tw / 2, my - 16, tw, 32, 8);
        ctx.fillStyle = '#1F2937';
        ctx.fill();
        ctx.strokeStyle = '#4B5563';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(messageText, mx, my);
        ctx.restore();
    }

    function drawConfetti() {
        const now = performance.now();
        for (let i = confetti.length - 1; i >= 0; i--) {
            const p = confetti[i];
            const age = now - p.born;
            if (age > 3000) { confetti.splice(i, 1); continue; }
            const alpha = Math.max(0, 1 - age / 3000);
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05;
            p.rotation += p.spin;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        }
    }

    function drawFloatingTexts() {
        const now = performance.now();
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            const ft = floatingTexts[i];
            const age = now - ft.born;
            if (age > 1500) { floatingTexts.splice(i, 1); continue; }
            const alpha = Math.max(0, 1 - age / 1500);
            const y = ft.y - age * 0.04;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = `bold ${ft.size || 20}px "Segoe UI", Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = ft.color || '#FFFFFF';
            ctx.fillText(ft.text, ft.x, y);
            ctx.restore();
        }
    }

    function drawGameOver() {
        if (!gameWon && !gameLost) return;

        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, GAME_H - 140, GAME_W, 140);
        ctx.globalAlpha = 1;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (gameWon) {
            ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
            ctx.fillStyle = '#22C55E';
            ctx.fillText('🎉 Brilliant!', GAME_W / 2, GAME_H - 115);
        } else {
            ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
            ctx.fillStyle = '#EF4444';
            ctx.fillText('The word was:', GAME_W / 2, GAME_H - 120);
            ctx.font = 'bold 32px "Segoe UI", Arial, sans-serif';
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(targetWord, GAME_W / 2, GAME_H - 90);
        }

        // Buttons
        ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';

        // Share button
        roundRect(GAME_W / 2 - 120, GAME_H - 60, 110, 36, 8);
        ctx.fillStyle = '#22C55E';
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('📋 Share', GAME_W / 2 - 65, GAME_H - 42);

        // Play Again button
        roundRect(GAME_W / 2 + 10, GAME_H - 60, 110, 36, 8);
        ctx.fillStyle = '#3B82F6';
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('🔄 Play Again', GAME_W / 2 + 65, GAME_H - 42);

        // Stats line
        ctx.font = '12px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#9CA3AF';
        const winPct = stats.played > 0 ? Math.round(stats.won / stats.played * 100) : 0;
        ctx.fillText(`Played: ${stats.played} | Win: ${winPct}% | Streak: ${stats.streak} | Max: ${stats.maxStreak}`, GAME_W / 2, GAME_H - 12);

        ctx.restore();
    }

    // ══════════════════════════════════════════════
    // GAME LOGIC
    // ══════════════════════════════════════════════
    function submitGuess() {
        if (currentGuess.length !== WORD_LEN) {
            showMessage('Not enough letters');
            shakeAnim = { active: true, startTime: performance.now() };
            playWrong();
            return;
        }

        if (!VALID_GUESSES.has(currentGuess.toUpperCase())) {
            showMessage('Not in word list');
            shakeAnim = { active: true, startTime: performance.now() };
            playWrong();
            return;
        }

        const guess = currentGuess.toUpperCase();
        guesses.push(guess);
        const results = evaluateGuess(guess);

        // Start flip animations staggered per column
        const now = performance.now();
        for (let c = 0; c < WORD_LEN; c++) {
            flipAnims.push({
                row: currentRow,
                col: c,
                startTime: now + c * 200,
                state: results[c]
            });
            tileResults.push({
                row: currentRow,
                col: c,
                state: results[c]
            });
        }

        // Update letter states (keep best state)
        for (let c = 0; c < WORD_LEN; c++) {
            const letter = guess[c];
            const result = results[c];
            const current = letterStates[letter];
            if (!current || result === 'correct' || (result === 'present' && current === 'absent')) {
                letterStates[letter] = result;
            }
        }

        // Schedule result check after all flips complete
        const totalFlipTime = WORD_LEN * 200 + FLIP_DURATION;
        setTimeout(() => {
            playFlip();

            if (guess === targetWord) {
                // WIN!
                gameWon = true;
                updateStats(true, currentRow + 1);
                playWinFanfare();
                spawnConfetti();
                // Bounce animation on winning row
                for (let c = 0; c < WORD_LEN; c++) {
                    bounceAnims.push({
                        row: currentRow,
                        col: c,
                        startTime: performance.now() + c * 80
                    });
                }
                const msgs = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];
                showMessage(msgs[Math.min(currentRow, msgs.length - 1)]);
                endGame();
            } else if (currentRow >= MAX_GUESSES - 1) {
                // LOSE
                gameLost = true;
                updateStats(false, 0);
                shakeAnim = { active: true, startTime: performance.now() };
                playWrong();
                endGame();
            }

            currentRow++;
            currentGuess = '';
        }, totalFlipTime);

        currentGuess = '';
    }

    function showMessage(text) {
        messageText = text;
        messageTimer = performance.now() + 2000;
    }

    function spawnConfetti() {
        const now = performance.now();
        const colors = ['#22C55E', '#EAB308', '#3B82F6', '#EC4899', '#F97316', '#8B5CF6'];
        for (let i = 0; i < CONFETTI_COUNT; i++) {
            confetti.push({
                x: GAME_W / 2 + (Math.random() - 0.5) * 200,
                y: GAME_H / 3,
                vx: (Math.random() - 0.5) * 8,
                vy: -Math.random() * 10 - 3,
                w: Math.random() * 8 + 4,
                h: Math.random() * 4 + 2,
                color: colors[Math.floor(Math.random() * colors.length)],
                rotation: Math.random() * Math.PI * 2,
                spin: (Math.random() - 0.5) * 0.3,
                born: now
            });
        }
    }

    function endGame() {
        setTimeout(() => {
            if (onGameOver) {
                const score = gameWon ? (MAX_GUESSES - currentRow + 1) * 100 : 0;
                onGameOver({
                    score,
                    time: Math.floor((performance.now() - (stats._startTime || 0)) / 1000),
                    won: gameWon,
                    guesses: guesses.length
                });
            }
        }, 2000);
    }

    function resetGame(daily) {
        dailyMode = daily !== false;
        targetWord = dailyMode ? getDailyWord() : getRandomWord();
        guesses = [];
        currentGuess = '';
        currentRow = 0;
        letterStates = {};
        gameWon = false;
        gameLost = false;
        flipAnims = [];
        bounceAnims = [];
        shakeAnim = { active: false, startTime: 0 };
        confetti = [];
        floatingTexts = [];
        tileResults = [];
        messageText = '';
        messageTimer = 0;
        showStats = false;
        stats._startTime = performance.now();
    }

    // ══════════════════════════════════════════════
    // INPUT
    // ══════════════════════════════════════════════
    function handleKeyDown(e) {
        if (!gameActive || gameWon || gameLost) return;
        if (flipAnims.length > 0) return; // Wait for animations

        const key = e.key.toUpperCase();

        if (key === 'ENTER') {
            submitGuess();
        } else if (key === 'BACKSPACE' || key === 'DELETE') {
            if (currentGuess.length > 0) {
                currentGuess = currentGuess.slice(0, -1);
                playKeyTap();
            }
        } else if (/^[A-Z]$/.test(key) && currentGuess.length < WORD_LEN) {
            currentGuess += key;
            playKeyTap();
        }
    }

    function handleClick(e) {
        if (!gameActive) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const scaleX = GAME_W / rect.width;
        const scaleY = GAME_H / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;

        // Game over buttons
        if (gameWon || gameLost) {
            // Share button
            if (mx >= GAME_W / 2 - 120 && mx <= GAME_W / 2 - 10 &&
                my >= GAME_H - 60 && my <= GAME_H - 24) {
                const shareText = generateShareText();
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(shareText).then(() => {
                        showMessage('Copied to clipboard!');
                    });
                }
                return;
            }
            // Play Again button
            if (mx >= GAME_W / 2 + 10 && mx <= GAME_W / 2 + 120 &&
                my >= GAME_H - 60 && my <= GAME_H - 24) {
                resetGame(false); // Free play for "play again"
                return;
            }
            return;
        }

        if (flipAnims.length > 0) return;

        // Keyboard clicks
        for (let r = 0; r < KB_ROWS.length; r++) {
            for (let c = 0; c < KB_ROWS[r].length; c++) {
                const rect2 = getKBKeyRect(r, c);
                if (mx >= rect2.x && mx <= rect2.x + rect2.w &&
                    my >= rect2.y && my <= rect2.y + rect2.h) {
                    const key = KB_ROWS[r][c];
                    if (key === 'ENTER') {
                        submitGuess();
                    } else if (key === 'DEL') {
                        if (currentGuess.length > 0) {
                            currentGuess = currentGuess.slice(0, -1);
                            playKeyTap();
                        }
                    } else if (currentGuess.length < WORD_LEN) {
                        currentGuess += key;
                        playKeyTap();
                    }
                    return;
                }
            }
        }
    }

    function handleTouch(e) {
        e.preventDefault();
        const touch = e.touches[0];
        handleClick({ clientX: touch.clientX, clientY: touch.clientY });
    }

    // ══════════════════════════════════════════════
    // GAME LOOP
    // ══════════════════════════════════════════════
    function gameLoop() {
        if (!gameActive) return;
        frameCount++;

        ctx.save();
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        drawBackground();
        drawTitle();
        drawGrid();
        drawKeyboard();
        drawMessage();
        drawConfetti();
        drawFloatingTexts();
        drawGameOver();

        ctx.restore();

        animFrame = requestAnimationFrame(gameLoop);
    }

    // ══════════════════════════════════════════════
    // INIT / DESTROY
    // ══════════════════════════════════════════════
    function fitCanvas() {
        if (!canvas || !canvas.parentElement) return;
        const parent = canvas.parentElement;
        const pw = parent.clientWidth || 480;
        const ph = parent.clientHeight || 640;
        const aspect = GAME_W / GAME_H;
        let cw, ch;
        if (pw / ph > aspect) { ch = ph; cw = ch * aspect; }
        else { cw = pw; ch = cw / aspect; }
        const dpr = window.devicePixelRatio || 1;
        canvas.style.width = cw + 'px';
        canvas.style.height = ch + 'px';
        canvas.width = Math.round(GAME_W * dpr);
        canvas.height = Math.round(GAME_H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        SCALE = cw / GAME_W;
    }

    function init(cvs, pl, cb) {
        canvas = cvs;
        player = pl;
        onGameOver = cb;
        ctx = canvas.getContext('2d');

        loadTheme();
        loadStats();

        // Show loading screen and preload sprites
        wgIsLoading = true;
        wgLoadingProgress = 0;
        fitCanvas();
        wgDrawLoadingScreen();

        wgPreloadSprites(
            (progress) => { wgLoadingProgress = progress; if (wgIsLoading) wgDrawLoadingScreen(); },
            () => {
                wgIsLoading = false;
                resetGame(true); // Start with daily mode
                gameActive = true;

                fitCanvas();
                requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

                // Bind events
                canvas._wg_keydown = handleKeyDown;
                canvas._wg_click = handleClick;
                canvas._wg_touch = handleTouch;
                canvas._wg_resize = fitCanvas;
                document.addEventListener('keydown', canvas._wg_keydown);
                canvas.addEventListener('click', canvas._wg_click);
                canvas.addEventListener('touchstart', canvas._wg_touch, { passive: false });
                window.addEventListener('resize', canvas._wg_resize);

                animFrame = requestAnimationFrame(gameLoop);
            }
        );
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;

        if (canvas) {
            if (canvas._wg_keydown) document.removeEventListener('keydown', canvas._wg_keydown);
            if (canvas._wg_click) canvas.removeEventListener('click', canvas._wg_click);
            if (canvas._wg_touch) canvas.removeEventListener('touchstart', canvas._wg_touch);
            if (canvas._wg_resize) window.removeEventListener('resize', canvas._wg_resize);
            delete canvas._wg_keydown;
            delete canvas._wg_click;
            delete canvas._wg_touch;
            delete canvas._wg_resize;
        }

        if (audioCtx) {
            try { audioCtx.close(); } catch {}
            audioCtx = null;
        }

        confetti = [];
        floatingTexts = [];
        flipAnims = [];
        bounceAnims = [];
    }

    return { init, destroy };
})();
