/* TriviaTac — Tic Tac Toe where you answer trivia to claim squares */
window.TriviaTac = (() => {
    // ── Constants ──
    const GAME_W = 480, GAME_H = 640;
    const ST_TITLE = 0, ST_PLAY = 1, ST_QUESTION = 2, ST_RESULT = 3,
          ST_AI_TURN = 4, ST_GAMEOVER = 5;
    const DIFF_EASY = 0, DIFF_MED = 1, DIFF_HARD = 2;
    const DIFF_NAMES = ['EASY', 'MEDIUM', 'HARD'];
    const DIFF_TIMERS = [15000, 10000, 7000];
    const DIFF_COLORS = ['#22C55E', '#FBBF24', '#EF4444'];

    // Grid layout (in game coords)
    const GRID_PAD = 40;
    const GRID_TOP = 120;
    const GRID_SIZE = GAME_W - GRID_PAD * 2; // 400
    const CELL_SIZE = GRID_SIZE / 3;
    const CELL_PAD = 6;

    // Question card layout
    const Q_PAD = 24;
    const Q_TOP = 80;
    const Q_W = GAME_W - Q_PAD * 2;
    const Q_H = 460;
    const Q_BTN_H = 52;
    const Q_BTN_GAP = 10;

    // ── State ──
    let canvas, ctx, W, H, SCALE, DPR, animFrame, gameActive = false;
    let activePlayer, gameOverCB, playerColor;
    let state, difficulty, frameCount, lastTime;
    let board; // 0=empty, 1=X(player), 2=O(AI)
    let pendingCell; // cell index player tapped
    let questions, questionIdx, currentQ;
    let timerStart, timerDur;
    let hoveredCell, hoveredAnswer;
    let resultCorrect, resultTimer;
    let aiThinkTimer;
    let xScore, oScore, roundNum, totalRounds;
    let questionsAnswered, questionsCorrect, streak, bestStreak;
    let particles, shakeTimer, shakeIntensity;
    let winLine; // {cells: [i,j,k], timer}
    let starField;
    let titlePulse;
    let audioCtx;

    // ── Built-in fallback trivia (50+) ──
    const FALLBACK_TRIVIA = [
        // Video games
        { question: 'What color is Pac-Man?', options: ['Yellow', 'Red', 'Blue', 'Green'], correct: 0 },
        { question: 'What is the name of Mario\'s dinosaur companion?', options: ['Toad', 'Yoshi', 'Birdo', 'Koopa'], correct: 1 },
        { question: 'How many ghosts chase Pac-Man?', options: ['3', '4', '5', '6'], correct: 1 },
        { question: 'What does Sonic collect?', options: ['Stars', 'Coins', 'Rings', 'Gems'], correct: 2 },
        { question: 'Who is the princess Mario rescues?', options: ['Daisy', 'Rosalina', 'Peach', 'Zelda'], correct: 2 },
        { question: 'What game features a plumber fighting a gorilla?', options: ['Pac-Man', 'Frogger', 'Donkey Kong', 'Q*bert'], correct: 2 },
        { question: 'What shape are Tetris pieces made of?', options: ['Triangles', 'Squares', 'Hexagons', 'Circles'], correct: 1 },
        { question: 'What arcade game has a frog crossing a road?', options: ['Centipede', 'Galaga', 'Dig Dug', 'Frogger'], correct: 3 },
        // Movies
        { question: 'What animal is Simba in The Lion King?', options: ['Tiger', 'Bear', 'Lion', 'Cheetah'], correct: 2 },
        { question: 'What is the name of the snowman in Frozen?', options: ['Sven', 'Olaf', 'Kristoff', 'Marshmallow'], correct: 1 },
        { question: 'Who lives in a pineapple under the sea?', options: ['Nemo', 'Patrick', 'SpongeBob', 'Squidward'], correct: 2 },
        { question: 'What color is the fish Nemo?', options: ['Blue', 'Yellow', 'Orange', 'Red'], correct: 2 },
        { question: 'What fairy helps Peter Pan?', options: ['Flora', 'Tinker Bell', 'Silvermist', 'Rosetta'], correct: 1 },
        { question: 'What toy is Woody in Toy Story?', options: ['Robot', 'Dinosaur', 'Cowboy', 'Spaceman'], correct: 2 },
        // Science
        { question: 'What planet is closest to the Sun?', options: ['Venus', 'Mercury', 'Mars', 'Earth'], correct: 1 },
        { question: 'How many planets are in our solar system?', options: ['7', '8', '9', '10'], correct: 1 },
        { question: 'What gas do plants breathe in?', options: ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Helium'], correct: 2 },
        { question: 'What is the hardest natural substance?', options: ['Gold', 'Iron', 'Diamond', 'Quartz'], correct: 2 },
        { question: 'What force keeps us on the ground?', options: ['Magnetism', 'Gravity', 'Friction', 'Inertia'], correct: 1 },
        { question: 'How many bones are in the human body?', options: ['106', '206', '306', '186'], correct: 1 },
        { question: 'What is the largest organ in the human body?', options: ['Heart', 'Brain', 'Liver', 'Skin'], correct: 3 },
        // Geography
        { question: 'What is the largest ocean?', options: ['Atlantic', 'Indian', 'Pacific', 'Arctic'], correct: 2 },
        { question: 'What is the longest river in the world?', options: ['Amazon', 'Nile', 'Mississippi', 'Yangtze'], correct: 1 },
        { question: 'What continent is Egypt on?', options: ['Asia', 'Europe', 'Africa', 'South America'], correct: 2 },
        { question: 'What is the smallest country in the world?', options: ['Monaco', 'Vatican City', 'San Marino', 'Liechtenstein'], correct: 1 },
        { question: 'How many continents are there?', options: ['5', '6', '7', '8'], correct: 2 },
        { question: 'What country has the most people?', options: ['USA', 'India', 'China', 'Brazil'], correct: 1 },
        // Animals
        { question: 'How many legs does a spider have?', options: ['6', '8', '10', '12'], correct: 1 },
        { question: 'What is the fastest land animal?', options: ['Lion', 'Cheetah', 'Horse', 'Gazelle'], correct: 1 },
        { question: 'What animal is known as the king of the jungle?', options: ['Tiger', 'Elephant', 'Lion', 'Gorilla'], correct: 2 },
        { question: 'How many hearts does an octopus have?', options: ['1', '2', '3', '4'], correct: 2 },
        { question: 'What is a baby dog called?', options: ['Kitten', 'Cub', 'Puppy', 'Foal'], correct: 2 },
        { question: 'What animal has the longest neck?', options: ['Elephant', 'Ostrich', 'Giraffe', 'Camel'], correct: 2 },
        // History
        { question: 'Who was the first US president?', options: ['Lincoln', 'Jefferson', 'Washington', 'Adams'], correct: 2 },
        { question: 'What ancient wonder was in Egypt?', options: ['Colosseum', 'Pyramids', 'Parthenon', 'Stonehenge'], correct: 1 },
        { question: 'What year did humans first walk on the moon?', options: ['1965', '1969', '1972', '1959'], correct: 1 },
        { question: 'Who invented the telephone?', options: ['Edison', 'Tesla', 'Bell', 'Morse'], correct: 2 },
        // Sports
        { question: 'How many players on a basketball team on court?', options: ['4', '5', '6', '7'], correct: 1 },
        { question: 'What sport uses a puck?', options: ['Baseball', 'Hockey', 'Cricket', 'Lacrosse'], correct: 1 },
        { question: 'How many holes in a standard golf round?', options: ['9', '12', '18', '21'], correct: 2 },
        { question: 'What country invented soccer?', options: ['Brazil', 'Spain', 'England', 'Italy'], correct: 2 },
        { question: 'How many bases in baseball?', options: ['3', '4', '5', '6'], correct: 1 },
        // Food
        { question: 'What fruit is on top of an upside-down cake?', options: ['Apple', 'Cherry', 'Pineapple', 'Peach'], correct: 2 },
        { question: 'What is the main ingredient in guacamole?', options: ['Tomato', 'Avocado', 'Lime', 'Onion'], correct: 1 },
        { question: 'What country is pizza originally from?', options: ['France', 'Greece', 'Italy', 'Spain'], correct: 2 },
        { question: 'What nut is used to make marzipan?', options: ['Walnut', 'Almond', 'Cashew', 'Peanut'], correct: 1 },
        // Music
        { question: 'How many strings on a standard guitar?', options: ['4', '5', '6', '8'], correct: 2 },
        { question: 'What instrument has 88 keys?', options: ['Organ', 'Piano', 'Accordion', 'Harpsichord'], correct: 1 },
        { question: 'How many musicians in a quartet?', options: ['3', '4', '5', '6'], correct: 1 },
        // Math
        { question: 'What is 7 x 8?', options: ['54', '56', '58', '48'], correct: 1 },
        { question: 'What is the square root of 144?', options: ['10', '11', '12', '14'], correct: 2 },
        { question: 'How many sides does a hexagon have?', options: ['5', '6', '7', '8'], correct: 1 },
        { question: 'What is 15% of 200?', options: ['20', '25', '30', '35'], correct: 2 },
        { question: 'What is the next prime after 7?', options: ['9', '10', '11', '13'], correct: 2 },
    ];

    // ── Audio ──
    function ensureAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
        }
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }

    function playTone(freq, dur, type, vol, slide) {
        const ac = ensureAudio(); if (!ac) return;
        try {
            const o = ac.createOscillator(), g = ac.createGain();
            o.type = type || 'sine';
            o.frequency.setValueAtTime(freq, ac.currentTime);
            if (slide) o.frequency.linearRampToValueAtTime(slide, ac.currentTime + dur);
            g.gain.setValueAtTime(vol || 0.1, ac.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
            o.connect(g); g.connect(ac.destination);
            o.start(); o.stop(ac.currentTime + dur);
        } catch {}
    }

    function playNoise(dur, vol) {
        const ac = ensureAudio(); if (!ac) return;
        try {
            const bufSize = ac.sampleRate * dur;
            const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
            const src = ac.createBufferSource();
            const g = ac.createGain();
            src.buffer = buf;
            g.gain.setValueAtTime(vol || 0.08, ac.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
            src.connect(g); g.connect(ac.destination);
            src.start(); src.stop(ac.currentTime + dur);
        } catch {}
    }

    function sfxQuestionAppear() {
        playTone(220, 0.15, 'triangle', 0.08);
        setTimeout(() => playTone(330, 0.15, 'triangle', 0.08), 100);
        setTimeout(() => playTone(277, 0.2, 'triangle', 0.06), 200);
    }

    function sfxCorrect() {
        playTone(523, 0.08, 'sine', 0.15);
        setTimeout(() => playTone(659, 0.08, 'sine', 0.15), 70);
        setTimeout(() => playTone(784, 0.1, 'sine', 0.15), 140);
        setTimeout(() => playTone(1047, 0.15, 'sine', 0.12), 220);
        // crowd cheer = noise burst
        setTimeout(() => playNoise(0.3, 0.06), 250);
    }

    function sfxWrong() {
        playTone(300, 0.15, 'sawtooth', 0.12, 100);
        setTimeout(() => playTone(200, 0.2, 'sawtooth', 0.1, 80), 120);
        // sad trombone
        setTimeout(() => {
            playTone(293, 0.2, 'triangle', 0.1);
            setTimeout(() => playTone(277, 0.2, 'triangle', 0.1), 200);
            setTimeout(() => playTone(261, 0.2, 'triangle', 0.1), 400);
            setTimeout(() => playTone(247, 0.4, 'triangle', 0.08), 600);
        }, 250);
    }

    function sfxTick() {
        playTone(1000, 0.03, 'square', 0.06);
    }

    function sfxHover() {
        playTone(600, 0.02, 'sine', 0.04);
    }

    function sfxStamp() {
        playTone(150, 0.12, 'square', 0.1);
        playNoise(0.06, 0.1);
    }

    function sfxWin() {
        playTone(523, 0.1, 'sine', 0.15);
        setTimeout(() => playTone(659, 0.1, 'sine', 0.15), 100);
        setTimeout(() => playTone(784, 0.1, 'sine', 0.15), 200);
        setTimeout(() => playTone(1047, 0.12, 'sine', 0.15), 300);
        setTimeout(() => playTone(1318, 0.15, 'sine', 0.12), 400);
        setTimeout(() => playNoise(0.4, 0.08), 450);
    }

    function sfxLose() {
        playTone(400, 0.15, 'sawtooth', 0.1, 200);
        setTimeout(() => playTone(300, 0.15, 'sawtooth', 0.1, 150), 150);
        setTimeout(() => playTone(200, 0.3, 'sawtooth', 0.08, 80), 300);
    }

    function sfxDraw() {
        playTone(440, 0.15, 'triangle', 0.08);
        setTimeout(() => playTone(440, 0.15, 'triangle', 0.08), 200);
    }

    function sfxAIPlace() {
        playTone(200, 0.08, 'square', 0.06);
        setTimeout(() => playTone(250, 0.08, 'square', 0.06), 60);
    }

    // ── Helpers ──
    const gs = v => v * SCALE;
    const rng = (a, b) => Math.random() * (b - a) + a;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    function hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
    }
    function withAlpha(hex, a) {
        if (hex.startsWith('rgba')) return hex.replace(/,[^,]*\)$/, `,${a})`);
        if (hex.startsWith('rgb(')) return hex.replace('rgb(', 'rgba(').replace(')', `,${a})`);
        const c = hexToRgb(hex);
        return `rgba(${c.r},${c.g},${c.b},${a})`;
    }
    function lighten(hex, amt) {
        const c = hexToRgb(hex);
        return `rgb(${clamp(c.r+amt,0,255)},${clamp(c.g+amt,0,255)},${clamp(c.b+amt,0,255)})`;
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    // ── Starfield ──
    function initStars() {
        starField = [];
        for (let i = 0; i < 80; i++) {
            starField.push({
                x: Math.random() * GAME_W,
                y: Math.random() * GAME_H,
                r: Math.random() * 1.5 + 0.3,
                speed: Math.random() * 0.15 + 0.02,
                twinkle: Math.random() * Math.PI * 2,
            });
        }
    }

    function drawStars(dt) {
        for (const s of starField) {
            s.twinkle += s.speed * 0.05;
            const a = 0.3 + Math.sin(s.twinkle) * 0.3;
            ctx.fillStyle = withAlpha('#FFFFFF', a);
            ctx.beginPath();
            ctx.arc(gs(s.x), gs(s.y), gs(s.r), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── Particles ──
    function spawnConfetti(cx, cy, count) {
        const colors = ['#22C55E', '#3B82F6', '#FBBF24', '#EC4899', '#A855F7', '#06B6D4'];
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = rng(1.5, 5);
            particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2,
                life: 1,
                decay: rng(0.012, 0.025),
                size: rng(2, 5),
                color: pick(colors),
                rot: Math.random() * Math.PI * 2,
                rotSpeed: rng(-0.2, 0.2),
            });
        }
    }

    function spawnExplosion(cx, cy, color) {
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = rng(1, 3.5);
            particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: rng(0.02, 0.04),
                size: rng(2, 4),
                color: color,
                rot: 0, rotSpeed: 0,
            });
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08; // gravity
            p.life -= p.decay;
            p.rot += p.rotSpeed;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.save();
            ctx.translate(gs(p.x), gs(p.y));
            ctx.rotate(p.rot);
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.fillRect(-gs(p.size / 2), -gs(p.size / 2), gs(p.size), gs(p.size));
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    // ── Trivia fetch ──
    async function fetchTrivia() {
        try {
            const resp = await fetch('/api/trivia/random?count=20');
            if (!resp.ok) throw new Error('API error');
            const data = await resp.json();
            if (data.questions && data.questions.length >= 5) {
                questions = data.questions;
                return;
            }
        } catch {}
        // Fallback: shuffle built-in
        questions = shuffleArray([...FALLBACK_TRIVIA]);
    }

    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function getNextQuestion() {
        if (questionIdx >= questions.length) {
            // Reshuffle and reset
            questions = shuffleArray(questions);
            questionIdx = 0;
        }
        return questions[questionIdx++];
    }

    // ── Board logic ──
    function resetBoard() {
        board = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        winLine = null;
    }

    function checkWin(b) {
        const lines = [
            [0,1,2],[3,4,5],[6,7,8], // rows
            [0,3,6],[1,4,7],[2,5,8], // cols
            [0,4,8],[2,4,6],         // diags
        ];
        for (const l of lines) {
            if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) {
                return { winner: b[l[0]], cells: l };
            }
        }
        return null;
    }

    function isBoardFull(b) {
        return b.every(c => c !== 0);
    }

    function getEmptyCells(b) {
        const cells = [];
        for (let i = 0; i < 9; i++) if (b[i] === 0) cells.push(i);
        return cells;
    }

    // AI: minimax with some randomness for fun
    function aiPickCell() {
        const empty = getEmptyCells(board);
        if (empty.length === 0) return -1;

        // Check if AI can win
        for (const i of empty) {
            board[i] = 2;
            if (checkWin(board)) { board[i] = 0; return i; }
            board[i] = 0;
        }
        // Block player win
        for (const i of empty) {
            board[i] = 1;
            if (checkWin(board)) { board[i] = 0; return i; }
            board[i] = 0;
        }
        // Take center if available
        if (board[4] === 0) return 4;
        // Take a corner
        const corners = [0, 2, 6, 8].filter(i => board[i] === 0);
        if (corners.length) return pick(corners);
        // Any empty
        return pick(empty);
    }

    // ── Cell geometry ──
    function cellCenter(idx) {
        const col = idx % 3, row = Math.floor(idx / 3);
        return {
            x: GRID_PAD + col * CELL_SIZE + CELL_SIZE / 2,
            y: GRID_TOP + row * CELL_SIZE + CELL_SIZE / 2,
        };
    }

    function cellFromPos(gx, gy) {
        // gx, gy in game coords
        const col = Math.floor((gx - GRID_PAD) / CELL_SIZE);
        const row = Math.floor((gy - GRID_TOP) / CELL_SIZE);
        if (col < 0 || col > 2 || row < 0 || row > 2) return -1;
        return row * 3 + col;
    }

    // ── Answer button geometry ──
    function answerBtnRect(idx) {
        const bx = Q_PAD + 12;
        const bw = Q_W - 24;
        const startY = Q_TOP + Q_H - 20 - (4 * (Q_BTN_H + Q_BTN_GAP)) + idx * (Q_BTN_H + Q_BTN_GAP);
        return { x: bx, y: startY, w: bw, h: Q_BTN_H };
    }

    function answerFromPos(gx, gy) {
        if (!currentQ) return -1;
        for (let i = 0; i < currentQ.options.length; i++) {
            const r = answerBtnRect(i);
            if (gx >= r.x && gx <= r.x + r.w && gy >= r.y && gy <= r.y + r.h) return i;
        }
        return -1;
    }

    // ── Difficulty button geometry (title screen) ──
    function diffBtnRect(idx) {
        const bw = 130, bh = 44, gap = 16;
        const totalW = 3 * bw + 2 * gap;
        const sx = (GAME_W - totalW) / 2 + idx * (bw + gap);
        return { x: sx, y: 440, w: bw, h: bh };
    }

    function diffFromPos(gx, gy) {
        for (let i = 0; i < 3; i++) {
            const r = diffBtnRect(i);
            if (gx >= r.x && gx <= r.x + r.w && gy >= r.y && gy <= r.y + r.h) return i;
        }
        return -1;
    }

    // Play again button (game over)
    function playAgainRect() {
        return { x: GAME_W / 2 - 90, y: 520, w: 180, h: 48 };
    }

    function isInRect(gx, gy, r) {
        return gx >= r.x && gx <= r.x + r.w && gy >= r.y && gy <= r.y + r.h;
    }

    // ── Canvas coord conversion ──
    function canvasToGame(cx, cy) {
        return { x: cx / SCALE, y: cy / SCALE };
    }

    function getCanvasXY(e) {
        const rect = canvas.getBoundingClientRect();
        let cx, cy;
        if (e.touches && e.touches.length) {
            cx = (e.touches[0].clientX - rect.left) * DPR;
            cy = (e.touches[0].clientY - rect.top) * DPR;
        } else {
            cx = (e.clientX - rect.left) * DPR;
            cy = (e.clientY - rect.top) * DPR;
        }
        return canvasToGame(cx, cy);
    }

    // ── Drawing ──
    function drawBackground() {
        // Dark gradient
        const grad = ctx.createLinearGradient(0, 0, 0, gs(GAME_H));
        grad.addColorStop(0, '#0A0E1A');
        grad.addColorStop(0.5, '#111827');
        grad.addColorStop(1, '#0A0E1A');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        drawStars();
    }

    function drawGrid() {
        // Grid background
        const gOff = shakeTimer > 0 ? Math.sin(shakeTimer * 1.7) * shakeIntensity : 0;
        ctx.save();
        if (gOff) ctx.translate(gs(gOff), gs(gOff * 0.5));

        // Draw cells
        for (let i = 0; i < 9; i++) {
            const col = i % 3, row = Math.floor(i / 3);
            const cx = GRID_PAD + col * CELL_SIZE + CELL_PAD;
            const cy = GRID_TOP + row * CELL_SIZE + CELL_PAD;
            const cw = CELL_SIZE - CELL_PAD * 2;

            // Cell background
            let bg = 'rgba(255,255,255,0.04)';
            if (state === ST_PLAY && hoveredCell === i && board[i] === 0) {
                bg = withAlpha(playerColor, 0.15);
            }
            ctx.fillStyle = bg;
            roundRect(ctx, gs(cx), gs(cy), gs(cw), gs(cw), gs(8));
            ctx.fill();

            // Hover glow
            if (state === ST_PLAY && hoveredCell === i && board[i] === 0) {
                ctx.strokeStyle = withAlpha(playerColor, 0.5);
                ctx.lineWidth = gs(2);
                roundRect(ctx, gs(cx), gs(cy), gs(cw), gs(cw), gs(8));
                ctx.stroke();
            }

            // Draw X or O
            if (board[i] === 1) drawX(cellCenter(i), cw * 0.35);
            if (board[i] === 2) drawO(cellCenter(i), cw * 0.32);
        }

        // Grid lines (glowing)
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = gs(2);
        for (let i = 1; i <= 2; i++) {
            // Vertical
            const vx = GRID_PAD + i * CELL_SIZE;
            ctx.beginPath();
            ctx.moveTo(gs(vx), gs(GRID_TOP + 4));
            ctx.lineTo(gs(vx), gs(GRID_TOP + GRID_SIZE - 4));
            ctx.stroke();
            // Horizontal
            const hy = GRID_TOP + i * CELL_SIZE;
            ctx.beginPath();
            ctx.moveTo(gs(GRID_PAD + 4), gs(hy));
            ctx.lineTo(gs(GRID_PAD + GRID_SIZE - 4), gs(hy));
            ctx.stroke();
        }

        // Win line
        if (winLine) {
            const c0 = cellCenter(winLine.cells[0]);
            const c2 = cellCenter(winLine.cells[2]);
            const progress = clamp(winLine.timer / 20, 0, 1);
            const ex = lerp(c0.x, c2.x, progress);
            const ey = lerp(c0.y, c2.y, progress);

            ctx.save();
            ctx.shadowColor = winLine.winner === 1 ? playerColor : '#EF4444';
            ctx.shadowBlur = gs(20);
            ctx.strokeStyle = winLine.winner === 1 ? playerColor : '#EF4444';
            ctx.lineWidth = gs(6);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(gs(c0.x), gs(c0.y));
            ctx.lineTo(gs(ex), gs(ey));
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore();
    }

    function drawX(center, size) {
        const { x, y } = center;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineWidth = gs(6);
        // Glow
        ctx.shadowColor = playerColor;
        ctx.shadowBlur = gs(12);
        ctx.strokeStyle = playerColor;
        ctx.beginPath();
        ctx.moveTo(gs(x - size), gs(y - size));
        ctx.lineTo(gs(x + size), gs(y + size));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(gs(x + size), gs(y - size));
        ctx.lineTo(gs(x - size), gs(y + size));
        ctx.stroke();
        // Bright core
        ctx.shadowBlur = 0;
        ctx.strokeStyle = lighten(playerColor, 80);
        ctx.lineWidth = gs(2.5);
        ctx.beginPath();
        ctx.moveTo(gs(x - size), gs(y - size));
        ctx.lineTo(gs(x + size), gs(y + size));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(gs(x + size), gs(y - size));
        ctx.lineTo(gs(x - size), gs(y + size));
        ctx.stroke();
        ctx.restore();
    }

    function drawO(center, radius) {
        const { x, y } = center;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineWidth = gs(5.5);
        // Glow
        ctx.shadowColor = '#EF4444';
        ctx.shadowBlur = gs(12);
        ctx.strokeStyle = '#EF4444';
        ctx.beginPath();
        ctx.arc(gs(x), gs(y), gs(radius), 0, Math.PI * 2);
        ctx.stroke();
        // Bright core
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#FCA5A5';
        ctx.lineWidth = gs(2);
        ctx.beginPath();
        ctx.arc(gs(x), gs(y), gs(radius), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function drawHUD() {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Score bar
        ctx.font = `bold ${gs(20)}px monospace`;
        ctx.fillStyle = playerColor;
        ctx.fillText('X: ' + xScore, gs(GAME_W * 0.25), gs(40));
        ctx.fillStyle = '#EF4444';
        ctx.fillText('O: ' + oScore, gs(GAME_W * 0.75), gs(40));

        // Round
        ctx.font = `${gs(13)}px monospace`;
        ctx.fillStyle = '#94A3B8';
        ctx.fillText('Round ' + roundNum, gs(GAME_W / 2), gs(30));

        // Accuracy
        const acc = questionsAnswered > 0 ? Math.round(questionsCorrect / questionsAnswered * 100) : 0;
        ctx.fillText(acc + '% correct', gs(GAME_W / 2), gs(50));

        // Streak
        if (streak >= 2) {
            ctx.fillStyle = '#FBBF24';
            ctx.font = `bold ${gs(12)}px monospace`;
            ctx.fillText(streak + ' streak!', gs(GAME_W / 2), gs(68));
        }

        // Below grid info
        ctx.font = `${gs(12)}px monospace`;
        ctx.fillStyle = '#64748B';
        const diffLabel = DIFF_NAMES[difficulty];
        ctx.fillText(diffLabel + ' | Q: ' + questionsAnswered + ' | Best Streak: ' + bestStreak, gs(GAME_W / 2), gs(GRID_TOP + GRID_SIZE + 24));

        ctx.restore();
    }

    // ── Question overlay ──
    function drawQuestionOverlay() {
        if (!currentQ) return;
        const elapsed = Date.now() - timerStart;
        const remaining = Math.max(0, timerDur - elapsed);
        const timerFrac = remaining / timerDur;

        // Darken background
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, W, H);

        // Card
        ctx.fillStyle = 'rgba(20,24,40,0.97)';
        roundRect(ctx, gs(Q_PAD), gs(Q_TOP), gs(Q_W), gs(Q_H), gs(16));
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = gs(1);
        roundRect(ctx, gs(Q_PAD), gs(Q_TOP), gs(Q_W), gs(Q_H), gs(16));
        ctx.stroke();

        // Timer bar
        const barY = Q_TOP + 10;
        const barW = Q_W - 40;
        const barH = 8;
        const barX = Q_PAD + 20;
        // BG
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        roundRect(ctx, gs(barX), gs(barY), gs(barW), gs(barH), gs(4));
        ctx.fill();
        // Fill
        const timerColor = timerFrac > 0.3 ? '#22C55E' : timerFrac > 0.15 ? '#FBBF24' : '#EF4444';
        ctx.fillStyle = timerColor;
        if (timerFrac > 0) {
            roundRect(ctx, gs(barX), gs(barY), gs(barW * timerFrac), gs(barH), gs(4));
            ctx.fill();
        }
        // Glow when low
        if (timerFrac < 0.3 && timerFrac > 0) {
            ctx.save();
            ctx.shadowColor = '#EF4444';
            ctx.shadowBlur = gs(10);
            ctx.fillStyle = '#EF4444';
            roundRect(ctx, gs(barX), gs(barY), gs(barW * timerFrac), gs(barH), gs(4));
            ctx.fill();
            ctx.restore();
        }

        // Question text
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `bold ${gs(17)}px sans-serif`;
        ctx.fillStyle = '#E0E7FF';
        wrapText(ctx, currentQ.question, gs(GAME_W / 2), gs(Q_TOP + 36), gs(Q_W - 48), gs(22));
        ctx.restore();

        // Answer buttons
        const labels = ['A', 'B', 'C', 'D'];
        for (let i = 0; i < currentQ.options.length; i++) {
            const r = answerBtnRect(i);
            const hovered = hoveredAnswer === i;

            // Button bg
            let btnColor = hovered ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)';
            // Show result highlights
            if (state === ST_RESULT) {
                if (i === currentQ.correct) btnColor = 'rgba(34,197,94,0.35)';
                else if (i === hoveredAnswer && !resultCorrect) btnColor = 'rgba(239,68,68,0.35)';
            }
            ctx.fillStyle = btnColor;
            roundRect(ctx, gs(r.x), gs(r.y), gs(r.w), gs(r.h), gs(10));
            ctx.fill();

            if (hovered && state === ST_QUESTION) {
                ctx.strokeStyle = withAlpha(playerColor, 0.6);
                ctx.lineWidth = gs(2);
                roundRect(ctx, gs(r.x), gs(r.y), gs(r.w), gs(r.h), gs(10));
                ctx.stroke();
            }

            // Label
            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${gs(15)}px monospace`;
            ctx.fillStyle = '#94A3B8';
            ctx.fillText(labels[i] + '.', gs(r.x + 14), gs(r.y + r.h / 2));
            ctx.font = `${gs(14)}px sans-serif`;
            ctx.fillStyle = '#E0E7FF';
            ctx.fillText(currentQ.options[i], gs(r.x + 42), gs(r.y + r.h / 2));
            ctx.restore();
        }

        // Timer tick sound
        if (remaining < 3500 && remaining > 0 && state === ST_QUESTION) {
            if (Math.floor(remaining / 500) !== Math.floor((remaining + 16) / 500)) {
                sfxTick();
            }
        }

        // Time's up check
        if (remaining <= 0 && state === ST_QUESTION) {
            submitAnswer(-1); // timed out = wrong
        }
    }

    function wrapText(ctx, text, x, y, maxW, lineH) {
        const words = text.split(' ');
        let line = '';
        let cy = y;
        for (const word of words) {
            const test = line + (line ? ' ' : '') + word;
            if (ctx.measureText(test).width > maxW && line) {
                ctx.fillText(line, x, cy);
                line = word;
                cy += lineH;
            } else {
                line = test;
            }
        }
        if (line) ctx.fillText(line, x, cy);
    }

    // ── Result animation ──
    function drawResultFlash() {
        if (state !== ST_RESULT) return;
        const progress = resultTimer / 45; // ~0.75 sec at 60fps
        if (resultCorrect) {
            // Green flash fading out
            const a = Math.max(0, 0.25 * (1 - progress));
            ctx.fillStyle = `rgba(34,197,94,${a})`;
            ctx.fillRect(0, 0, W, H);
        } else {
            // Red flash fading out
            const a = Math.max(0, 0.3 * (1 - progress));
            ctx.fillStyle = `rgba(239,68,68,${a})`;
            ctx.fillRect(0, 0, W, H);
        }
    }

    // ── Title screen ──
    function drawTitle() {
        drawBackground();
        titlePulse = (titlePulse || 0) + 0.04;

        // Title
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Glow
        ctx.shadowColor = playerColor;
        ctx.shadowBlur = gs(20 + Math.sin(titlePulse) * 8);
        ctx.font = `bold ${gs(48)}px monospace`;
        ctx.fillStyle = playerColor;
        ctx.fillText('TRIVIA', gs(GAME_W / 2), gs(140));
        ctx.font = `bold ${gs(52)}px monospace`;
        ctx.fillText('TAC', gs(GAME_W / 2), gs(195));
        ctx.shadowBlur = 0;

        // Subtitle
        ctx.font = `${gs(14)}px sans-serif`;
        ctx.fillStyle = '#94A3B8';
        ctx.fillText('Tic Tac Toe meets Trivia', gs(GAME_W / 2), gs(240));

        // Rules
        ctx.font = `${gs(12)}px sans-serif`;
        ctx.fillStyle = '#64748B';
        const rules = [
            'Tap a square to claim it',
            'Answer the trivia question correctly = X is yours!',
            'Answer WRONG = opponent gets the O instead!',
            'First to 3 in a row wins',
        ];
        for (let i = 0; i < rules.length; i++) {
            ctx.fillText(rules[i], gs(GAME_W / 2), gs(290 + i * 22));
        }

        // Difficulty buttons
        ctx.font = `bold ${gs(15)}px monospace`;
        for (let i = 0; i < 3; i++) {
            const r = diffBtnRect(i);
            const hovered = hoveredAnswer === i;
            ctx.fillStyle = hovered ? withAlpha(DIFF_COLORS[i], 0.3) : 'rgba(255,255,255,0.06)';
            roundRect(ctx, gs(r.x), gs(r.y), gs(r.w), gs(r.h), gs(10));
            ctx.fill();
            ctx.strokeStyle = DIFF_COLORS[i];
            ctx.lineWidth = gs(hovered ? 2.5 : 1.5);
            roundRect(ctx, gs(r.x), gs(r.y), gs(r.w), gs(r.h), gs(10));
            ctx.stroke();

            ctx.fillStyle = DIFF_COLORS[i];
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(DIFF_NAMES[i], gs(r.x + r.w / 2), gs(r.y + r.h / 2));
        }

        // Timer info
        ctx.font = `${gs(11)}px sans-serif`;
        ctx.fillStyle = '#475569';
        ctx.fillText('15s / 10s / 7s per question', gs(GAME_W / 2), gs(500));

        // Mini grid decoration
        const mgS = 24, mgP = GAME_W / 2 - mgS * 1.5, mgT = 540;
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = gs(1);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
            roundRect(ctx, gs(mgP + c * mgS + 2), gs(mgT + r * mgS + 2), gs(mgS - 4), gs(mgS - 4), gs(3));
            ctx.stroke();
        }
        // Draw mini X and O
        const miniXO = [[1,0,2],[0,1,0],[2,0,1]];
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
            const v = miniXO[r][c];
            const mx = mgP + c * mgS + mgS / 2, my = mgT + r * mgS + mgS / 2;
            if (v === 1) {
                ctx.strokeStyle = withAlpha(playerColor, 0.5);
                ctx.lineWidth = gs(1.5);
                ctx.beginPath();
                ctx.moveTo(gs(mx - 5), gs(my - 5)); ctx.lineTo(gs(mx + 5), gs(my + 5)); ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(gs(mx + 5), gs(my - 5)); ctx.lineTo(gs(mx - 5), gs(my + 5)); ctx.stroke();
            } else if (v === 2) {
                ctx.strokeStyle = 'rgba(239,68,68,0.5)';
                ctx.lineWidth = gs(1.5);
                ctx.beginPath();
                ctx.arc(gs(mx), gs(my), gs(5), 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    // ── Game Over screen ──
    function drawGameOverScreen() {
        drawBackground();
        drawGrid();
        drawParticles();

        // Overlay
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const winner = xScore > oScore ? 'YOU WIN!' : oScore > xScore ? 'YOU LOSE' : 'DRAW!';
        const wColor = xScore > oScore ? '#22C55E' : oScore > xScore ? '#EF4444' : '#FBBF24';

        // Result
        ctx.shadowColor = wColor;
        ctx.shadowBlur = gs(15);
        ctx.font = `bold ${gs(42)}px monospace`;
        ctx.fillStyle = wColor;
        ctx.fillText(winner, gs(GAME_W / 2), gs(180));
        ctx.shadowBlur = 0;

        // Score
        ctx.font = `bold ${gs(24)}px monospace`;
        ctx.fillStyle = playerColor;
        ctx.fillText('X: ' + xScore, gs(GAME_W * 0.35), gs(240));
        ctx.fillStyle = '#EF4444';
        ctx.fillText('O: ' + oScore, gs(GAME_W * 0.65), gs(240));

        // Stats
        ctx.font = `${gs(15)}px sans-serif`;
        ctx.fillStyle = '#94A3B8';
        const acc = questionsAnswered > 0 ? Math.round(questionsCorrect / questionsAnswered * 100) : 0;
        ctx.fillText('Rounds Played: ' + roundNum, gs(GAME_W / 2), gs(300));
        ctx.fillText('Questions Answered: ' + questionsAnswered, gs(GAME_W / 2), gs(326));
        ctx.fillText('Correct: ' + questionsCorrect + ' / ' + questionsAnswered + ' (' + acc + '%)', gs(GAME_W / 2), gs(352));
        ctx.fillText('Best Streak: ' + bestStreak, gs(GAME_W / 2), gs(378));

        // Trivia grade
        let grade = 'Trivia Newbie';
        if (acc >= 90) grade = 'Trivia Master!';
        else if (acc >= 75) grade = 'Trivia Expert';
        else if (acc >= 50) grade = 'Trivia Student';
        ctx.font = `bold ${gs(16)}px sans-serif`;
        ctx.fillStyle = '#FBBF24';
        ctx.fillText(grade, gs(GAME_W / 2), gs(416));

        // Play Again button
        const par = playAgainRect();
        ctx.fillStyle = withAlpha(playerColor, 0.2);
        roundRect(ctx, gs(par.x), gs(par.y), gs(par.w), gs(par.h), gs(12));
        ctx.fill();
        ctx.strokeStyle = playerColor;
        ctx.lineWidth = gs(2);
        roundRect(ctx, gs(par.x), gs(par.y), gs(par.w), gs(par.h), gs(12));
        ctx.stroke();
        ctx.font = `bold ${gs(18)}px monospace`;
        ctx.fillStyle = playerColor;
        ctx.fillText('PLAY AGAIN', gs(GAME_W / 2), gs(par.y + par.h / 2));

        ctx.restore();
    }

    // ── Game actions ──
    function startGame(diff) {
        difficulty = diff;
        timerDur = DIFF_TIMERS[diff];
        resetBoard();
        xScore = 0;
        oScore = 0;
        roundNum = 1;
        totalRounds = 0;
        questionsAnswered = 0;
        questionsCorrect = 0;
        streak = 0;
        bestStreak = 0;
        particles = [];
        shakeTimer = 0;
        shakeIntensity = 0;
        questionIdx = 0;
        state = ST_PLAY;
        hoveredCell = -1;
        hoveredAnswer = -1;
        sfxHover();
        fetchTrivia(); // async, will populate questions
    }

    function tapCell(idx) {
        if (state !== ST_PLAY || board[idx] !== 0) return;
        pendingCell = idx;
        currentQ = getNextQuestion();
        timerStart = Date.now();
        state = ST_QUESTION;
        hoveredAnswer = -1;
        sfxQuestionAppear();
    }

    function submitAnswer(ansIdx) {
        if (state !== ST_QUESTION) return;
        questionsAnswered++;
        const correct = ansIdx === currentQ.correct;
        resultCorrect = correct;
        hoveredAnswer = ansIdx; // highlight chosen

        if (correct) {
            board[pendingCell] = 1; // player X
            questionsCorrect++;
            streak++;
            if (streak > bestStreak) bestStreak = streak;
            sfxCorrect();
            const cc = cellCenter(pendingCell);
            spawnConfetti(cc.x, cc.y, 25);
        } else {
            board[pendingCell] = 2; // AI O steals it!
            streak = 0;
            sfxWrong();
            shakeTimer = 20;
            shakeIntensity = 4;
            const cc = cellCenter(pendingCell);
            spawnExplosion(cc.x, cc.y, '#EF4444');
        }

        sfxStamp();
        resultTimer = 0;
        state = ST_RESULT;
    }

    function afterResult() {
        currentQ = null;

        // Check win/draw
        const win = checkWin(board);
        if (win) {
            winLine = { cells: win.cells, timer: 0, winner: win.winner };
            if (win.winner === 1) xScore++;
            else oScore++;
            // Determine if match is over (best of 5 = first to 3, or just per-board)
            // Each board is one round. Play until someone is ahead after a board ends.
            setTimeout(() => endRound(win.winner), 800);
            return;
        }
        if (isBoardFull(board)) {
            setTimeout(() => endRound(0), 500);
            return;
        }

        // AI turn
        state = ST_AI_TURN;
        aiThinkTimer = 30 + Math.floor(Math.random() * 20); // slight delay
    }

    function doAITurn() {
        const cell = aiPickCell();
        if (cell >= 0) {
            board[cell] = 2;
            sfxAIPlace();
            const cc = cellCenter(cell);
            spawnExplosion(cc.x, cc.y, 'rgba(239,68,68,0.5)');
        }

        // Check win/draw after AI
        const win = checkWin(board);
        if (win) {
            winLine = { cells: win.cells, timer: 0, winner: win.winner };
            if (win.winner === 1) xScore++;
            else oScore++;
            setTimeout(() => endRound(win.winner), 800);
            return;
        }
        if (isBoardFull(board)) {
            setTimeout(() => endRound(0), 500);
            return;
        }

        state = ST_PLAY;
    }

    function endRound(winner) {
        roundNum++;

        // Check if match over: first to 3 wins, or 5 rounds played
        if (xScore >= 3 || oScore >= 3 || roundNum > 5) {
            if (xScore > oScore) sfxWin();
            else if (oScore > xScore) sfxLose();
            else sfxDraw();
            state = ST_GAMEOVER;
            // Report score
            if (gameOverCB) {
                const finalScore = xScore * 100 + questionsCorrect * 10 + bestStreak * 5;
                gameOverCB(finalScore);
            }
            // Victory confetti
            if (xScore > oScore) {
                for (let i = 0; i < 3; i++) {
                    setTimeout(() => spawnConfetti(GAME_W / 2 + rng(-100, 100), rng(100, 300), 30), i * 200);
                }
            }
            return;
        }

        // Next round
        if (winner === 1) sfxCorrect();
        else if (winner === 2) sfxWrong();
        else sfxDraw();

        setTimeout(() => {
            resetBoard();
            state = ST_PLAY;
        }, 600);
    }

    // ── Input handlers ──
    function onPointerDown(e) {
        e.preventDefault();
        const pos = getCanvasXY(e);

        if (state === ST_TITLE) {
            const d = diffFromPos(pos.x, pos.y);
            if (d >= 0) startGame(d);
            return;
        }

        if (state === ST_PLAY) {
            const cell = cellFromPos(pos.x, pos.y);
            if (cell >= 0 && board[cell] === 0) tapCell(cell);
            return;
        }

        if (state === ST_QUESTION) {
            const ans = answerFromPos(pos.x, pos.y);
            if (ans >= 0) submitAnswer(ans);
            return;
        }

        if (state === ST_GAMEOVER) {
            if (isInRect(pos.x, pos.y, playAgainRect())) {
                state = ST_TITLE;
                hoveredAnswer = -1;
            }
            return;
        }
    }

    function onPointerMove(e) {
        const pos = getCanvasXY(e);

        if (state === ST_TITLE) {
            hoveredAnswer = diffFromPos(pos.x, pos.y);
            return;
        }

        if (state === ST_PLAY) {
            const cell = cellFromPos(pos.x, pos.y);
            hoveredCell = (cell >= 0 && board[cell] === 0) ? cell : -1;
            return;
        }

        if (state === ST_QUESTION) {
            hoveredAnswer = answerFromPos(pos.x, pos.y);
            return;
        }
    }

    function onKeyDown(e) {
        if (state === ST_TITLE) {
            if (e.key === '1') startGame(DIFF_EASY);
            if (e.key === '2') startGame(DIFF_MED);
            if (e.key === '3') startGame(DIFF_HARD);
            return;
        }

        if (state === ST_PLAY) {
            const k = parseInt(e.key);
            if (k >= 1 && k <= 9) {
                // Numpad layout: 7=top-left...9=top-right, 1=bottom-left...3=bottom-right
                const map = [6,7,8,3,4,5,0,1,2]; // 1->cell6, 2->cell7, etc.
                const cell = map[k - 1];
                if (board[cell] === 0) tapCell(cell);
            }
            return;
        }

        if (state === ST_QUESTION) {
            const key = e.key.toUpperCase();
            if (key === 'A') submitAnswer(0);
            if (key === 'B') submitAnswer(1);
            if (key === 'C') submitAnswer(2);
            if (key === 'D') submitAnswer(3);
            return;
        }

        if (state === ST_GAMEOVER) {
            if (e.key === ' ' || e.key === 'Enter') {
                state = ST_TITLE;
                hoveredAnswer = -1;
            }
            return;
        }
    }

    // ── Main loop ──
    function gameLoop(ts) {
        if (!gameActive) return;
        const dt = ts - (lastTime || ts);
        lastTime = ts;
        frameCount++;

        ctx.clearRect(0, 0, W, H);

        if (state === ST_TITLE) {
            drawTitle();
        } else if (state === ST_GAMEOVER) {
            drawGameOverScreen();
        } else {
            drawBackground();

            // Screen shake
            if (shakeTimer > 0) shakeTimer--;

            drawGrid();
            drawHUD();

            if (state === ST_QUESTION || state === ST_RESULT) {
                drawQuestionOverlay();
            }

            if (state === ST_RESULT) {
                drawResultFlash();
                resultTimer++;
                if (resultTimer > 50) {
                    afterResult();
                }
            }

            if (state === ST_AI_TURN) {
                aiThinkTimer--;
                // Show thinking indicator
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `${gs(14)}px sans-serif`;
                ctx.fillStyle = '#EF4444';
                const dots = '.'.repeat(1 + Math.floor(frameCount / 15) % 3);
                ctx.fillText('AI thinking' + dots, gs(GAME_W / 2), gs(GRID_TOP + GRID_SIZE + 50));
                ctx.restore();

                if (aiThinkTimer <= 0) doAITurn();
            }

            // Win line animation
            if (winLine) {
                winLine.timer = Math.min(winLine.timer + 1.2, 20);
            }
        }

        updateParticles();
        drawParticles();

        animFrame = requestAnimationFrame(gameLoop);
    }

    // ── Canvas sizing ──
    function fitCanvas() {
        if (!canvas) return;
        const parent = canvas.parentElement;
        if (!parent) return;
        DPR = Math.min(window.devicePixelRatio || 1, 3);
        const pw = parent.clientWidth, ph = parent.clientHeight;
        const aspect = GAME_W / GAME_H;
        let cw, ch;
        if (pw / ph > aspect) { ch = ph; cw = ch * aspect; }
        else { cw = pw; ch = cw / aspect; }
        canvas.style.width = cw + 'px';
        canvas.style.height = ch + 'px';
        canvas.width = Math.round(cw * DPR);
        canvas.height = Math.round(ch * DPR);
        W = canvas.width;
        H = canvas.height;
        SCALE = W / GAME_W;
    }

    // ── Public API ──
    function init(cvs, playerData, onGameOverCB) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = playerData;
        gameOverCB = onGameOverCB;
        gameActive = true;
        playerColor = playerData?.color || '#06B6D4';

        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(playerData?.theme) : null;
        if (_t) playerColor = _t.colors[0] || playerColor;

        state = ST_TITLE;
        frameCount = 0;
        lastTime = 0;
        titlePulse = 0;
        particles = [];
        shakeTimer = 0;
        hoveredCell = -1;
        hoveredAnswer = -1;
        questions = shuffleArray([...FALLBACK_TRIVIA]);
        questionIdx = 0;
        xScore = 0;
        oScore = 0;
        roundNum = 1;
        questionsAnswered = 0;
        questionsCorrect = 0;
        streak = 0;
        bestStreak = 0;
        winLine = null;

        initStars();

        DPR = Math.min(window.devicePixelRatio || 1, 3);
        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        canvas.addEventListener('mousedown', onPointerDown);
        canvas.addEventListener('mousemove', onPointerMove);
        canvas.addEventListener('touchstart', onPointerDown, { passive: false });
        canvas.addEventListener('touchmove', onPointerMove, { passive: false });
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', fitCanvas);

        animFrame = requestAnimationFrame(gameLoop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
        if (canvas) {
            canvas.removeEventListener('mousedown', onPointerDown);
            canvas.removeEventListener('mousemove', onPointerMove);
            canvas.removeEventListener('touchstart', onPointerDown);
            canvas.removeEventListener('touchmove', onPointerMove);
        }
        document.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('resize', fitCanvas);
    }

    return { init, destroy };
})();
