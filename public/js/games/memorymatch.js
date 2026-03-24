/* MemoryMatch — Theme-aware memory card matching game for Your World Arcade
 * Flip-two-at-a-time card matching with 10 progressive levels.
 * Canvas 2D, zero external dependencies. */
window.MemoryMatch = (() => {
    // ── Constants ──
    const GAME_W = 480, GAME_H = 640;
    const FLIP_SPEED = 0.08;           // scaleX change per frame
    const MISMATCH_DELAY = 800;        // ms before flipping back
    const MATCH_GLOW_DUR = 600;        // ms for match glow anim
    const CARD_GAP = 8;
    const CARD_RADIUS = 8;
    const HEADER_H = 70;
    const FOOTER_H = 50;

    // Level configs: { cols, rows }
    const LEVELS = [
        { cols: 4, rows: 3 },   // L1:  6 pairs
        { cols: 4, rows: 4 },   // L2:  8 pairs
        { cols: 5, rows: 4 },   // L3: 10 pairs
        { cols: 6, rows: 4 },   // L4: 12 pairs
        { cols: 6, rows: 5 },   // L5: 15 pairs
        { cols: 6, rows: 5 },   // L6: 15 pairs (shuffle)
        { cols: 6, rows: 6 },   // L7: 18 pairs
        { cols: 7, rows: 6 },   // L8: 21 pairs
        { cols: 8, rows: 6 },   // L9: 24 pairs
        { cols: 6, rows: 5 },   // L10: 15 pairs (speed)
    ];

    // Icon draw functions (drawn on canvas) indexed by type
    const ICON_NAMES = [
        'controller', 'star', 'heart', 'gem', 'coin', 'bomb',
        'rocket', 'ghost', 'crown', 'lightning', 'shield', 'music',
        'flame', 'moon', 'diamond', 'cherry', 'bell', 'fish',
        'anchor', 'leaf', 'sun', 'skull', 'potion', 'sword'
    ];
    const ICON_COLORS = [
        '#FF2D87', '#FFD600', '#FF4444', '#00E5FF', '#76FF03', '#FF6B00',
        '#E040FB', '#B0BEC5', '#FFD700', '#FFEA00', '#42A5F5', '#CE93D8',
        '#FF7043', '#90CAF9', '#00BCD4', '#EF5350', '#FFAB40', '#26C6DA',
        '#5C6BC0', '#66BB6A', '#FFA726', '#BDBDBD', '#AB47BC', '#EF5350'
    ];

    // High score tracking
    const LS_KEY = 'memorymatch_highscore';
    function loadHighScore() { try { return parseInt(localStorage.getItem(LS_KEY)) || 0; } catch { return 0; } }
    function saveHighScore(s) { try { localStorage.setItem(LS_KEY, s); } catch {} }
    let highScore = 0;

    // ── State ──
    let canvas, ctx;
    let W, H, DPR;
    let player = null, onGameOver = null;
    let gameActive = false;
    let animFrame = null;
    let frameCount = 0, lastTime = 0;
    let score = 0, moves = 0, matches = 0, consecutiveMatches = 0;
    let level = 1;
    let timer = 0;        // seconds elapsed
    let timerStart = 0;
    let cards = [];        // flat array of card objects
    let cols = 4, rows = 3;
    let cardW = 0, cardH = 0;
    let gridOffsetX = 0, gridOffsetY = 0;
    let flipped = [];      // indices of currently flipped cards (max 2)
    let locked = false;    // lock during mismatch delay
    let mismatchTimer = 0;
    let phase = 'playing'; // playing | levelComplete | gameOver
    let levelCompleteTimer = 0;
    let confettiParticles = [];
    let sparkles = [];
    let shakeCards = [];   // {idx, startTime}
    let selectedIdx = -1;  // keyboard nav cursor
    let totalPairs = 0;

    // Theme
    let theme = null;
    let BG_GRAD = ['#0A0A1A', '#1A0A2E'];
    let ACCENT = '#E040FB';
    let CARD_BACK_COLOR = '#1E1E3F';
    let CARD_BACK_PATTERN_COLOR = 'rgba(255,255,255,0.06)';

    // Audio
    let audioCtx = null;
    function getAudioCtx() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
        }
        return audioCtx;
    }

    // ── roundRect polyfill ──
    function roundRect(c, x, y, w, h, r) {
        if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, r); return; }
        c.beginPath();
        c.moveTo(x + r, y);
        c.lineTo(x + w - r, y);
        c.quadraticCurveTo(x + w, y, x + w, y + r);
        c.lineTo(x + w, y + h - r);
        c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        c.lineTo(x + r, y + h);
        c.quadraticCurveTo(x, y + h, x, y + h - r);
        c.lineTo(x, y + r);
        c.quadraticCurveTo(x, y, x + r, y);
        c.closePath();
    }

    // ══════════════════════════════════════════════
    //  SOUNDS
    // ══════════════════════════════════════════════

    function playFlipSound() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const g = ac.createGain();
            osc.type = 'sine';
            osc.frequency.value = 600;
            osc.frequency.exponentialRampToValueAtTime(900, ac.currentTime + 0.08);
            g.gain.setValueAtTime(0.08, ac.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1);
            osc.connect(g); g.connect(ac.destination);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.1);
        } catch {}
    }

    function playMatchSound() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            [0, 0.08, 0.16].forEach((t, i) => {
                const osc = ac.createOscillator();
                const g = ac.createGain();
                osc.type = 'sine';
                osc.frequency.value = [523, 659, 784][i];
                g.gain.setValueAtTime(0.1, ac.currentTime + t);
                g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.15);
                osc.connect(g); g.connect(ac.destination);
                osc.start(ac.currentTime + t); osc.stop(ac.currentTime + t + 0.15);
            });
        } catch {}
    }

    function playMismatchSound() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const g = ac.createGain();
            osc.type = 'sawtooth';
            osc.frequency.value = 200;
            osc.frequency.exponentialRampToValueAtTime(100, ac.currentTime + 0.15);
            g.gain.setValueAtTime(0.05, ac.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
            osc.connect(g); g.connect(ac.destination);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.15);
        } catch {}
    }

    function playLevelComplete() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            [0, 0.1, 0.2, 0.3, 0.5].forEach((t, i) => {
                const osc = ac.createOscillator();
                const g = ac.createGain();
                osc.type = 'sine';
                osc.frequency.value = [523, 587, 659, 784, 1047][i];
                g.gain.setValueAtTime(0.12, ac.currentTime + t);
                g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.25);
                osc.connect(g); g.connect(ac.destination);
                osc.start(ac.currentTime + t); osc.stop(ac.currentTime + t + 0.25);
            });
        } catch {}
    }

    // ══════════════════════════════════════════════
    //  ICON DRAWING
    // ══════════════════════════════════════════════

    function drawIcon(iconIdx, cx, cy, size) {
        const color = ICON_COLORS[iconIdx % ICON_COLORS.length];
        const s = size * 0.4;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        switch (ICON_NAMES[iconIdx % ICON_NAMES.length]) {
            case 'controller':
                // Game controller shape
                roundRect(ctx, -s * 0.9, -s * 0.35, s * 1.8, s * 0.7, s * 0.2);
                ctx.fill();
                // D-pad
                ctx.fillStyle = '#000';
                ctx.fillRect(-s * 0.55, -s * 0.08, s * 0.35, s * 0.16);
                ctx.fillRect(-s * 0.47, -s * 0.2, s * 0.16, s * 0.4);
                // Buttons
                ctx.beginPath();
                ctx.arc(s * 0.35, -s * 0.05, s * 0.07, 0, Math.PI * 2);
                ctx.arc(s * 0.55, -s * 0.05, s * 0.07, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'star':
                drawStar(0, 0, 5, s, s * 0.4);
                ctx.fill();
                break;
            case 'heart':
                ctx.beginPath();
                ctx.moveTo(0, s * 0.35);
                ctx.bezierCurveTo(-s * 0.7, -s * 0.3, -s * 0.9, -s * 0.8, 0, -s * 0.35);
                ctx.bezierCurveTo(s * 0.9, -s * 0.8, s * 0.7, -s * 0.3, 0, s * 0.35);
                ctx.fill();
                break;
            case 'gem':
                ctx.beginPath();
                ctx.moveTo(0, -s * 0.6);
                ctx.lineTo(s * 0.5, -s * 0.15);
                ctx.lineTo(s * 0.35, s * 0.6);
                ctx.lineTo(-s * 0.35, s * 0.6);
                ctx.lineTo(-s * 0.5, -s * 0.15);
                ctx.closePath();
                ctx.fill();
                // Facet line
                ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                ctx.beginPath();
                ctx.moveTo(-s * 0.5, -s * 0.15);
                ctx.lineTo(0, s * 0.15);
                ctx.lineTo(s * 0.5, -s * 0.15);
                ctx.stroke();
                break;
            case 'coin':
                ctx.beginPath();
                ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.beginPath();
                ctx.arc(0, 0, s * 0.35, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = 'rgba(0,0,0,0.15)';
                ctx.font = `bold ${s * 0.5}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('$', 0, 0);
                break;
            case 'bomb':
                ctx.beginPath();
                ctx.arc(0, s * 0.1, s * 0.45, 0, Math.PI * 2);
                ctx.fill();
                // Fuse
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(s * 0.15, -s * 0.3);
                ctx.quadraticCurveTo(s * 0.3, -s * 0.6, s * 0.1, -s * 0.65);
                ctx.stroke();
                // Spark
                ctx.fillStyle = '#FFD600';
                ctx.beginPath();
                ctx.arc(s * 0.1, -s * 0.65, s * 0.08, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'rocket':
                ctx.beginPath();
                ctx.moveTo(0, -s * 0.7);
                ctx.quadraticCurveTo(s * 0.3, -s * 0.2, s * 0.25, s * 0.4);
                ctx.lineTo(-s * 0.25, s * 0.4);
                ctx.quadraticCurveTo(-s * 0.3, -s * 0.2, 0, -s * 0.7);
                ctx.fill();
                // Fins
                ctx.fillStyle = ICON_COLORS[(iconIdx + 3) % ICON_COLORS.length];
                ctx.beginPath();
                ctx.moveTo(-s * 0.25, s * 0.2);
                ctx.lineTo(-s * 0.45, s * 0.5);
                ctx.lineTo(-s * 0.15, s * 0.4);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(s * 0.25, s * 0.2);
                ctx.lineTo(s * 0.45, s * 0.5);
                ctx.lineTo(s * 0.15, s * 0.4);
                ctx.fill();
                // Flame
                ctx.fillStyle = '#FF6B00';
                ctx.beginPath();
                ctx.moveTo(-s * 0.12, s * 0.4);
                ctx.lineTo(0, s * 0.7);
                ctx.lineTo(s * 0.12, s * 0.4);
                ctx.fill();
                break;
            case 'ghost':
                ctx.beginPath();
                ctx.arc(0, -s * 0.1, s * 0.4, Math.PI, 0);
                ctx.lineTo(s * 0.4, s * 0.45);
                ctx.lineTo(s * 0.2, s * 0.3);
                ctx.lineTo(0, s * 0.45);
                ctx.lineTo(-s * 0.2, s * 0.3);
                ctx.lineTo(-s * 0.4, s * 0.45);
                ctx.closePath();
                ctx.fill();
                // Eyes
                ctx.fillStyle = '#FFF';
                ctx.beginPath();
                ctx.arc(-s * 0.15, -s * 0.15, s * 0.1, 0, Math.PI * 2);
                ctx.arc(s * 0.15, -s * 0.15, s * 0.1, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.arc(-s * 0.12, -s * 0.12, s * 0.05, 0, Math.PI * 2);
                ctx.arc(s * 0.18, -s * 0.12, s * 0.05, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'crown':
                ctx.beginPath();
                ctx.moveTo(-s * 0.5, s * 0.3);
                ctx.lineTo(-s * 0.5, -s * 0.1);
                ctx.lineTo(-s * 0.25, s * 0.1);
                ctx.lineTo(0, -s * 0.4);
                ctx.lineTo(s * 0.25, s * 0.1);
                ctx.lineTo(s * 0.5, -s * 0.1);
                ctx.lineTo(s * 0.5, s * 0.3);
                ctx.closePath();
                ctx.fill();
                // Gems
                ctx.fillStyle = '#FF2D87';
                ctx.beginPath();
                ctx.arc(0, -s * 0.1, s * 0.06, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'lightning':
                ctx.beginPath();
                ctx.moveTo(s * 0.1, -s * 0.7);
                ctx.lineTo(-s * 0.15, -s * 0.05);
                ctx.lineTo(s * 0.1, -s * 0.05);
                ctx.lineTo(-s * 0.1, s * 0.7);
                ctx.lineTo(s * 0.15, s * 0.05);
                ctx.lineTo(-s * 0.1, s * 0.05);
                ctx.closePath();
                ctx.fill();
                break;
            case 'shield':
                ctx.beginPath();
                ctx.moveTo(0, -s * 0.55);
                ctx.quadraticCurveTo(s * 0.5, -s * 0.45, s * 0.45, -s * 0.1);
                ctx.quadraticCurveTo(s * 0.4, s * 0.35, 0, s * 0.6);
                ctx.quadraticCurveTo(-s * 0.4, s * 0.35, -s * 0.45, -s * 0.1);
                ctx.quadraticCurveTo(-s * 0.5, -s * 0.45, 0, -s * 0.55);
                ctx.fill();
                // Inner stripe
                ctx.fillStyle = 'rgba(255,255,255,0.2)';
                ctx.fillRect(-s * 0.05, -s * 0.4, s * 0.1, s * 0.8);
                break;
            case 'music':
                // Music note
                ctx.beginPath();
                ctx.arc(-s * 0.15, s * 0.25, s * 0.18, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillRect(s * 0.0, -s * 0.55, s * 0.06, s * 0.8);
                ctx.fillRect(s * 0.0, -s * 0.55, s * 0.35, s * 0.06);
                ctx.beginPath();
                ctx.arc(s * 0.25, -s * 0.15, s * 0.12, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'flame':
                ctx.beginPath();
                ctx.moveTo(0, -s * 0.6);
                ctx.quadraticCurveTo(s * 0.5, -s * 0.2, s * 0.3, s * 0.3);
                ctx.quadraticCurveTo(s * 0.15, s * 0.55, 0, s * 0.55);
                ctx.quadraticCurveTo(-s * 0.15, s * 0.55, -s * 0.3, s * 0.3);
                ctx.quadraticCurveTo(-s * 0.5, -s * 0.2, 0, -s * 0.6);
                ctx.fill();
                // Inner flame
                ctx.fillStyle = '#FFD600';
                ctx.beginPath();
                ctx.moveTo(0, -s * 0.2);
                ctx.quadraticCurveTo(s * 0.2, s * 0.1, s * 0.1, s * 0.35);
                ctx.quadraticCurveTo(0, s * 0.45, -s * 0.1, s * 0.35);
                ctx.quadraticCurveTo(-s * 0.2, s * 0.1, 0, -s * 0.2);
                ctx.fill();
                break;
            case 'moon':
                ctx.beginPath();
                ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = BG_GRAD[0];
                ctx.beginPath();
                ctx.arc(s * 0.2, -s * 0.1, s * 0.35, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'diamond':
                ctx.beginPath();
                ctx.moveTo(0, -s * 0.6);
                ctx.lineTo(s * 0.45, 0);
                ctx.lineTo(0, s * 0.6);
                ctx.lineTo(-s * 0.45, 0);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.2)';
                ctx.beginPath();
                ctx.moveTo(0, -s * 0.6);
                ctx.lineTo(s * 0.15, 0);
                ctx.lineTo(0, s * 0.6);
                ctx.lineTo(-s * 0.15, 0);
                ctx.closePath();
                ctx.fill();
                break;
            case 'cherry':
                ctx.beginPath();
                ctx.arc(-s * 0.18, s * 0.15, s * 0.22, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(s * 0.18, s * 0.25, s * 0.2, 0, Math.PI * 2);
                ctx.fill();
                // Stems
                ctx.strokeStyle = '#66BB6A';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(-s * 0.18, -s * 0.05);
                ctx.quadraticCurveTo(0, -s * 0.5, s * 0.1, -s * 0.4);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(s * 0.18, s * 0.05);
                ctx.quadraticCurveTo(s * 0.15, -s * 0.35, s * 0.1, -s * 0.4);
                ctx.stroke();
                break;
            case 'bell':
                ctx.beginPath();
                ctx.moveTo(-s * 0.35, s * 0.25);
                ctx.quadraticCurveTo(-s * 0.35, -s * 0.35, 0, -s * 0.5);
                ctx.quadraticCurveTo(s * 0.35, -s * 0.35, s * 0.35, s * 0.25);
                ctx.lineTo(-s * 0.35, s * 0.25);
                ctx.fill();
                ctx.fillRect(-s * 0.45, s * 0.25, s * 0.9, s * 0.08);
                // Clapper
                ctx.beginPath();
                ctx.arc(0, s * 0.42, s * 0.08, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'fish':
                ctx.beginPath();
                ctx.moveTo(s * 0.5, 0);
                ctx.quadraticCurveTo(s * 0.15, -s * 0.4, -s * 0.3, -s * 0.2);
                ctx.lineTo(-s * 0.5, -s * 0.35);
                ctx.lineTo(-s * 0.35, 0);
                ctx.lineTo(-s * 0.5, s * 0.35);
                ctx.lineTo(-s * 0.3, s * 0.2);
                ctx.quadraticCurveTo(s * 0.15, s * 0.4, s * 0.5, 0);
                ctx.fill();
                // Eye
                ctx.fillStyle = '#FFF';
                ctx.beginPath();
                ctx.arc(s * 0.2, -s * 0.05, s * 0.07, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.arc(s * 0.22, -s * 0.05, s * 0.035, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'anchor':
                ctx.beginPath();
                ctx.arc(0, -s * 0.35, s * 0.12, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, -s * 0.23);
                ctx.lineTo(0, s * 0.45);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(-s * 0.3, s * 0.1);
                ctx.lineTo(s * 0.3, s * 0.1);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(-s * 0.3, s * 0.3, s * 0.2, Math.PI, Math.PI * 1.5);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(s * 0.3, s * 0.3, s * 0.2, Math.PI * 1.5, 0);
                ctx.stroke();
                break;
            case 'leaf':
                ctx.beginPath();
                ctx.moveTo(0, -s * 0.5);
                ctx.quadraticCurveTo(s * 0.5, -s * 0.3, s * 0.3, s * 0.2);
                ctx.quadraticCurveTo(s * 0.1, s * 0.5, 0, s * 0.5);
                ctx.quadraticCurveTo(-s * 0.1, s * 0.5, -s * 0.3, s * 0.2);
                ctx.quadraticCurveTo(-s * 0.5, -s * 0.3, 0, -s * 0.5);
                ctx.fill();
                // Vein
                ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                ctx.beginPath();
                ctx.moveTo(0, -s * 0.4);
                ctx.lineTo(0, s * 0.4);
                ctx.stroke();
                break;
            case 'sun':
                ctx.beginPath();
                ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2);
                ctx.fill();
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * s * 0.35, Math.sin(a) * s * 0.35);
                    ctx.lineTo(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55);
                    ctx.stroke();
                }
                break;
            case 'skull':
                ctx.beginPath();
                ctx.arc(0, -s * 0.1, s * 0.38, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillRect(-s * 0.25, s * 0.15, s * 0.5, s * 0.25);
                // Eyes
                ctx.fillStyle = BG_GRAD[0];
                ctx.beginPath();
                ctx.arc(-s * 0.14, -s * 0.12, s * 0.1, 0, Math.PI * 2);
                ctx.arc(s * 0.14, -s * 0.12, s * 0.1, 0, Math.PI * 2);
                ctx.fill();
                // Teeth
                ctx.fillStyle = BG_GRAD[0];
                for (let i = 0; i < 3; i++) {
                    ctx.fillRect(-s * 0.18 + i * s * 0.15, s * 0.25, s * 0.04, s * 0.12);
                }
                break;
            case 'potion':
                // Bottle body
                ctx.beginPath();
                ctx.moveTo(-s * 0.08, -s * 0.45);
                ctx.lineTo(-s * 0.08, -s * 0.2);
                ctx.lineTo(-s * 0.3, s * 0.1);
                ctx.quadraticCurveTo(-s * 0.3, s * 0.5, 0, s * 0.5);
                ctx.quadraticCurveTo(s * 0.3, s * 0.5, s * 0.3, s * 0.1);
                ctx.lineTo(s * 0.08, -s * 0.2);
                ctx.lineTo(s * 0.08, -s * 0.45);
                ctx.closePath();
                ctx.fill();
                // Cork
                ctx.fillStyle = '#8D6E63';
                ctx.fillRect(-s * 0.1, -s * 0.55, s * 0.2, s * 0.12);
                break;
            case 'sword':
                ctx.fillRect(-s * 0.03, -s * 0.65, s * 0.06, s * 0.9);
                // Guard
                ctx.fillRect(-s * 0.2, s * 0.1, s * 0.4, s * 0.06);
                // Handle
                ctx.fillStyle = '#8D6E63';
                ctx.fillRect(-s * 0.04, s * 0.16, s * 0.08, s * 0.25);
                // Pommel
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(0, s * 0.48, s * 0.06, 0, Math.PI * 2);
                ctx.fill();
                break;
            default:
                // Fallback circle
                ctx.beginPath();
                ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2);
                ctx.fill();
        }
        ctx.restore();
    }

    function drawStar(cx, cy, points, outer, inner) {
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const r = i % 2 === 0 ? outer : inner;
            const a = (i * Math.PI / points) - Math.PI / 2;
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
    }

    // ══════════════════════════════════════════════
    //  CARD MANAGEMENT
    // ══════════════════════════════════════════════

    function initCards() {
        const cfg = LEVELS[Math.min(level - 1, LEVELS.length - 1)];
        cols = cfg.cols; rows = cfg.rows;
        const numCells = cols * rows;
        const numPairs = Math.floor(numCells / 2);
        totalPairs = numPairs;

        // Pick icons
        const icons = [];
        for (let i = 0; i < numPairs; i++) {
            icons.push(i % ICON_NAMES.length, i % ICON_NAMES.length);
        }
        // If odd number of cells, add one extra (will be auto-matched)
        if (numCells % 2 !== 0) icons.push(-1); // blank/wild

        // Shuffle (Fisher-Yates)
        for (let i = icons.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [icons[i], icons[j]] = [icons[j], icons[i]];
        }

        // Calculate card dimensions
        const gridW = W - CARD_GAP * 2;
        const gridH = H - HEADER_H - FOOTER_H - CARD_GAP * 2;
        cardW = Math.floor((gridW - CARD_GAP * (cols - 1)) / cols);
        cardH = Math.floor((gridH - CARD_GAP * (rows - 1)) / rows);
        // Limit aspect ratio
        if (cardH > cardW * 1.4) cardH = Math.floor(cardW * 1.4);
        if (cardW > cardH * 1.2) cardW = Math.floor(cardH * 1.2);
        gridOffsetX = (W - (cardW * cols + CARD_GAP * (cols - 1))) / 2;
        gridOffsetY = HEADER_H + (gridH - (cardH * rows + CARD_GAP * (rows - 1))) / 2 + CARD_GAP;

        cards = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const idx = r * cols + c;
                if (idx >= icons.length) continue;
                cards.push({
                    row: r, col: c,
                    icon: icons[idx],
                    faceUp: false,
                    matched: false,
                    flipProgress: 0,   // 0=face down, 1=face up
                    flipDir: 0,        // 1=opening, -1=closing
                    matchGlow: 0,      // 0-1 for glow effect
                    matchTime: 0,
                    shakeX: 0,
                    shakeTime: 0
                });
            }
        }

        // Auto-match wild card if present
        const wild = cards.find(c => c.icon === -1);
        if (wild) { wild.matched = true; wild.faceUp = true; wild.flipProgress = 1; }

        flipped = [];
        locked = false;
        matches = 0;
        selectedIdx = 0;
    }

    function cardRect(card) {
        const x = gridOffsetX + card.col * (cardW + CARD_GAP);
        const y = gridOffsetY + card.row * (cardH + CARD_GAP);
        return { x, y, w: cardW, h: cardH };
    }

    // ══════════════════════════════════════════════
    //  DRAWING
    // ══════════════════════════════════════════════

    function drawBg() {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, BG_GRAD[0]);
        grad.addColorStop(1, BG_GRAD[1]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    function drawCardBack(x, y, w, h, scaleX) {
        ctx.save();
        const cx = x + w / 2;
        const cy = y + h / 2;
        ctx.translate(cx, cy);
        ctx.scale(scaleX, 1);

        // Card body
        ctx.fillStyle = CARD_BACK_COLOR;
        roundRect(ctx, -w / 2, -h / 2, w, h, CARD_RADIUS);
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, -w / 2, -h / 2, w, h, CARD_RADIUS);
        ctx.stroke();

        // Decorative pattern — diamond grid
        ctx.save();
        ctx.clip(); // clip to card shape
        ctx.strokeStyle = CARD_BACK_PATTERN_COLOR;
        ctx.lineWidth = 1;
        const step = Math.min(w, h) * 0.2;
        for (let i = -w; i < w * 2; i += step) {
            ctx.beginPath();
            ctx.moveTo(-w / 2 + i, -h / 2);
            ctx.lineTo(-w / 2 + i + h, h / 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-w / 2 + i, -h / 2);
            ctx.lineTo(-w / 2 + i - h, h / 2);
            ctx.stroke();
        }
        ctx.restore();

        // Centre accent dot
        ctx.fillStyle = ACCENT;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.arc(0, 0, Math.min(w, h) * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    function drawCardFront(x, y, w, h, scaleX, card) {
        ctx.save();
        const cx = x + w / 2;
        const cy = y + h / 2;
        ctx.translate(cx, cy);
        ctx.scale(scaleX, 1);

        // Card body — lighter
        ctx.fillStyle = '#1A1A3A';
        roundRect(ctx, -w / 2, -h / 2, w, h, CARD_RADIUS);
        ctx.fill();

        // Border
        const bColor = ICON_COLORS[card.icon % ICON_COLORS.length] || ACCENT;
        ctx.strokeStyle = bColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        roundRect(ctx, -w / 2, -h / 2, w, h, CARD_RADIUS);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Draw icon
        if (card.icon >= 0) {
            drawIcon(card.icon, 0, 0, Math.min(w, h));
        }

        ctx.restore();
    }

    function drawCard(card, idx) {
        const { x, y, w, h } = cardRect(card);

        // Shake offset
        let sx = 0;
        if (card.shakeTime > 0) {
            const elapsed = Date.now() - card.shakeTime;
            if (elapsed < 300) {
                sx = Math.sin(elapsed * 0.05) * 4 * (1 - elapsed / 300);
            } else {
                card.shakeTime = 0;
            }
        }

        const drawX = x + sx;

        // Flip animation: scaleX goes 1 -> 0 (back) -> 1 (front) or reverse
        const progress = card.flipProgress;
        const scaleX = Math.abs(Math.cos(progress * Math.PI));
        const showFront = progress > 0.5;

        // Match glow
        if (card.matched && card.matchGlow > 0) {
            ctx.save();
            ctx.shadowColor = ICON_COLORS[card.icon % ICON_COLORS.length] || ACCENT;
            ctx.shadowBlur = 15 * card.matchGlow;
            ctx.fillStyle = 'rgba(255,255,255,0.01)';
            roundRect(ctx, drawX - 2, y - 2, w + 4, h + 4, CARD_RADIUS + 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        if (showFront) {
            drawCardFront(drawX, y, w, h, scaleX, card);
        } else {
            drawCardBack(drawX, y, w, h, scaleX);
        }

        // Keyboard selection highlight
        if (idx === selectedIdx && phase === 'playing') {
            ctx.strokeStyle = '#FFF';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.5 + Math.sin(frameCount * 0.1) * 0.3;
            roundRect(ctx, drawX - 2, y - 2, w + 4, h + 4, CARD_RADIUS + 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // Matched sparkle
        if (card.matched) {
            const elapsed = Date.now() - card.matchTime;
            if (elapsed < 2000) {
                const alpha = Math.max(0, 1 - elapsed / 2000);
                const cx = drawX + w / 2;
                const cy = y + h / 2;
                ctx.save();
                ctx.globalAlpha = alpha * 0.6;
                const sparkleR = Math.min(w, h) * 0.08;
                for (let i = 0; i < 4; i++) {
                    const a = (frameCount * 0.03 + i * Math.PI / 2);
                    const sr = Math.min(w, h) * 0.35;
                    const sx2 = cx + Math.cos(a) * sr;
                    const sy = cy + Math.sin(a) * sr;
                    ctx.fillStyle = '#FFF';
                    ctx.beginPath();
                    ctx.arc(sx2, sy, sparkleR, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
        }
    }

    function drawHUD() {
        const pad = 12;
        // Level
        ctx.fillStyle = ACCENT;
        ctx.font = `bold ${Math.round(16 * DPR)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`Level ${level}`, pad, pad);

        // Score
        ctx.fillStyle = '#FFF';
        ctx.font = `bold ${Math.round(20 * DPR)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`${score}`, W / 2, pad);

        // Timer
        const elapsed = timer;
        const mins = Math.floor(elapsed / 60);
        const secs = Math.floor(elapsed % 60);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `${Math.round(14 * DPR)}px monospace`;
        ctx.textAlign = 'right';
        ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, W - pad, pad);

        // Moves
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `${Math.round(12 * DPR)}px sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(`Moves: ${moves}`, W - pad, pad + 20 * DPR);

        // Pairs found
        ctx.textAlign = 'left';
        ctx.fillText(`Pairs: ${matches}/${totalPairs}`, pad, pad + 22 * DPR);

        // Star rating hint
        const stars = getStars();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFD600';
        ctx.font = `${Math.round(13 * DPR)}px sans-serif`;
        let starStr = '';
        for (let i = 0; i < 3; i++) starStr += i < stars ? '\u2605' : '\u2606';
        ctx.fillText(starStr, W / 2, H - FOOTER_H / 2 + 5);

        // Combo indicator
        if (consecutiveMatches > 1) {
            ctx.fillStyle = '#76FF03';
            ctx.font = `bold ${Math.round(12 * DPR)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(`${consecutiveMatches}x Match Streak!`, W / 2, HEADER_H - 10);
        }
    }

    function getStars() {
        // Star rating based on moves relative to pairs
        const par = totalPairs; // "perfect" = one move per pair
        const ratio = moves / Math.max(par, 1);
        if (ratio <= 1.3) return 3;
        if (ratio <= 1.8) return 2;
        if (ratio <= 2.5) return 1;
        return 0;
    }

    function drawConfetti() {
        const now = Date.now();
        confettiParticles = confettiParticles.filter(p => {
            const elapsed = now - p.t;
            if (elapsed > p.life) return false;
            const prog = elapsed / p.life;
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08;
            p.rot += p.rotSpeed;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.globalAlpha = 1 - prog;
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
            return true;
        });
    }

    function spawnConfetti(cx, cy, count) {
        const colors = ['#FF2D87', '#FFD600', '#00E5FF', '#76FF03', '#E040FB', '#FF6B00'];
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 4;
            confettiParticles.push({
                x: cx, y: cy,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed - 3,
                w: 4 + Math.random() * 6,
                h: 3 + Math.random() * 4,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.15,
                color: colors[Math.floor(Math.random() * colors.length)],
                life: 1200 + Math.random() * 800,
                t: Date.now()
            });
        }
    }

    // ══════════════════════════════════════════════
    //  LEVEL COMPLETE OVERLAY
    // ══════════════════════════════════════════════

    function drawLevelComplete() {
        const elapsed = Date.now() - levelCompleteTimer;
        const alpha = Math.min(elapsed / 500, 1);

        // Dim overlay
        ctx.fillStyle = `rgba(0,0,0,${alpha * 0.6})`;
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.globalAlpha = alpha;

        const cx = W / 2;

        // Title
        ctx.fillStyle = '#FFD600';
        ctx.font = `bold ${Math.round(32 * DPR)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#FFD600';
        ctx.shadowBlur = 20;
        ctx.fillText(level >= LEVELS.length ? 'YOU WIN!' : 'LEVEL CLEAR!', cx, H * 0.3);
        ctx.shadowBlur = 0;

        // Stars
        const stars = getStars();
        ctx.font = `${Math.round(36 * DPR)}px sans-serif`;
        ctx.fillStyle = '#FFD600';
        let starStr = '';
        for (let i = 0; i < 3; i++) starStr += i < stars ? '\u2605' : '\u2606';
        ctx.fillText(starStr, cx, H * 0.42);

        // Stats
        ctx.fillStyle = '#FFF';
        ctx.font = `${Math.round(16 * DPR)}px monospace`;
        ctx.fillText(`Score: ${score}`, cx, H * 0.54);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = `${Math.round(14 * DPR)}px monospace`;
        ctx.fillText(`Moves: ${moves}  |  Time: ${Math.floor(timer)}s`, cx, H * 0.6);

        // High score
        if (highScore > 0) {
            ctx.fillStyle = score >= highScore ? '#FFD700' : 'rgba(255,255,255,0.5)';
            ctx.font = `${Math.round(13 * DPR)}px monospace`;
            ctx.fillText(score >= highScore ? '\u2B50 NEW HIGH SCORE!' : `Best: ${highScore}`, cx, H * 0.66);
        }

        // Continue prompt
        if (elapsed > 1500) {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = `${Math.round(13 * DPR)}px sans-serif`;
            if (level >= LEVELS.length) {
                ctx.fillText('Tap or press Enter to play again', cx, H * 0.75);
            } else {
                ctx.fillText('Tap or press Enter for next level', cx, H * 0.75);
            }
        }

        ctx.restore();
    }

    // ══════════════════════════════════════════════
    //  GAME LOGIC
    // ══════════════════════════════════════════════

    function flipCard(idx) {
        if (locked || !gameActive) return;
        const card = cards[idx];
        if (!card || card.faceUp || card.matched) return;

        card.flipDir = 1;
        card.faceUp = true;
        flipped.push(idx);
        playFlipSound();

        if (flipped.length === 2) {
            moves++;
            locked = true;
            const a = cards[flipped[0]];
            const b = cards[flipped[1]];

            if (a.icon === b.icon && a.icon >= 0) {
                // Match!
                setTimeout(() => {
                    a.matched = true; b.matched = true;
                    a.matchGlow = 1; b.matchGlow = 1;
                    a.matchTime = Date.now(); b.matchTime = Date.now();
                    matches++;
                    consecutiveMatches++;

                    // Score: base + combo bonus + time bonus
                    const comboBonus = Math.min(consecutiveMatches, 5) * 50;
                    const timeBonus = Math.max(0, 100 - Math.floor(timer));
                    score += 100 + comboBonus + timeBonus;

                    playMatchSound();

                    // Sparkle particles
                    const ra = cardRect(a);
                    const rb = cardRect(b);
                    spawnConfetti(ra.x + ra.w / 2, ra.y + ra.h / 2, 8);
                    spawnConfetti(rb.x + rb.w / 2, rb.y + rb.h / 2, 8);

                    flipped = [];
                    locked = false;

                    // Check level complete
                    if (matches >= totalPairs) {
                        onLevelComplete();
                    }
                }, 300);
            } else {
                // Mismatch
                consecutiveMatches = 0;
                playMismatchSound();
                setTimeout(() => {
                    a.flipDir = -1; a.faceUp = false;
                    b.flipDir = -1; b.faceUp = false;
                    a.shakeTime = Date.now();
                    b.shakeTime = Date.now();
                    flipped = [];
                    locked = false;
                }, MISMATCH_DELAY);
            }
        }
    }

    function onLevelComplete() {
        phase = 'levelComplete';
        levelCompleteTimer = Date.now();
        playLevelComplete();
        spawnConfetti(W / 2, H / 2, 40);

        // Track high score
        if (score > highScore) { highScore = score; saveHighScore(highScore); }

        if (onGameOver && level >= LEVELS.length) {
            onGameOver({
                score,
                level,
                moves,
                time: Math.floor(timer),
                stars: getStars()
            });
        }
    }

    function nextLevel() {
        if (level >= LEVELS.length) {
            // Restart from level 1
            level = 1;
            score = 0;
            moves = 0;
            timer = 0;
        } else {
            level++;
        }
        consecutiveMatches = 0;
        timerStart = Date.now();
        phase = 'playing';
        gameActive = true;
        initCards();
    }

    // ══════════════════════════════════════════════
    //  UPDATE
    // ══════════════════════════════════════════════

    function update() {
        // Timer
        if (phase === 'playing' && gameActive) {
            timer = (Date.now() - timerStart) / 1000;
        }

        // Animate card flips
        for (const card of cards) {
            if (card.flipDir > 0 && card.flipProgress < 1) {
                card.flipProgress = Math.min(1, card.flipProgress + FLIP_SPEED);
            } else if (card.flipDir < 0 && card.flipProgress > 0) {
                card.flipProgress = Math.max(0, card.flipProgress - FLIP_SPEED);
                if (card.flipProgress === 0) card.flipDir = 0;
            }

            // Match glow decay
            if (card.matched && card.matchGlow > 0) {
                card.matchGlow = Math.max(0, card.matchGlow - 0.008);
            }
        }
    }

    // ══════════════════════════════════════════════
    //  MAIN LOOP
    // ══════════════════════════════════════════════

    function render(timestamp) {
        animFrame = requestAnimationFrame(render);
        if (!canvas || !ctx) return;

        frameCount++;
        update();

        drawBg();

        // Draw all cards
        for (let i = 0; i < cards.length; i++) {
            drawCard(cards[i], i);
        }

        drawConfetti();
        drawHUD();

        if (phase === 'levelComplete') {
            drawLevelComplete();
        }
    }

    // ══════════════════════════════════════════════
    //  INPUT
    // ══════════════════════════════════════════════

    function handleClick(e) {
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * (W / rect.width);
        const my = (e.clientY - rect.top) * (H / rect.height);

        if (phase === 'levelComplete') {
            const elapsed = Date.now() - levelCompleteTimer;
            if (elapsed > 1500) nextLevel();
            return;
        }

        if (phase !== 'playing') return;

        // Find clicked card
        for (let i = 0; i < cards.length; i++) {
            const { x, y, w, h } = cardRect(cards[i]);
            if (mx >= x && mx <= x + w && my >= y && my <= y + h) {
                selectedIdx = i;
                flipCard(i);
                return;
            }
        }
    }

    function handleTouch(e) {
        if (!e.touches.length) return;
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const mx = (touch.clientX - rect.left) * (W / rect.width);
        const my = (touch.clientY - rect.top) * (H / rect.height);

        if (phase === 'levelComplete') {
            const elapsed = Date.now() - levelCompleteTimer;
            if (elapsed > 1500) nextLevel();
            return;
        }

        if (phase !== 'playing') return;

        for (let i = 0; i < cards.length; i++) {
            const { x, y, w, h } = cardRect(cards[i]);
            if (mx >= x && mx <= x + w && my >= y && my <= y + h) {
                selectedIdx = i;
                flipCard(i);
                return;
            }
        }
    }

    function handleKeyDown(e) {
        if (phase === 'levelComplete') {
            if (e.key === 'Enter' || e.key === ' ') {
                const elapsed = Date.now() - levelCompleteTimer;
                if (elapsed > 1500) nextLevel();
            }
            return;
        }

        if (phase !== 'playing') return;

        const total = cards.length;
        if (total === 0) return;

        switch (e.key) {
            case 'ArrowRight':
                selectedIdx = (selectedIdx + 1) % total;
                break;
            case 'ArrowLeft':
                selectedIdx = (selectedIdx - 1 + total) % total;
                break;
            case 'ArrowDown':
                selectedIdx = Math.min(total - 1, selectedIdx + cols);
                break;
            case 'ArrowUp':
                selectedIdx = Math.max(0, selectedIdx - cols);
                break;
            case 'Enter':
            case ' ':
                if (selectedIdx >= 0 && selectedIdx < total) {
                    flipCard(selectedIdx);
                }
                break;
        }
    }

    // ══════════════════════════════════════════════
    //  THEME
    // ══════════════════════════════════════════════

    function loadTheme() {
        const themeId = player?.theme || 'retro';
        theme = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (theme) {
            const c = theme.colors || {};
            BG_GRAD = [c.bgDark || '#0A0A1A', c.bgLight || '#1A0A2E'];
            ACCENT = c.accent || c.primary || '#E040FB';
            CARD_BACK_COLOR = c.cardBg || '#1E1E3F';
        } else {
            BG_GRAD = ['#0A0A1A', '#1A0A2E'];
            ACCENT = '#E040FB';
            CARD_BACK_COLOR = '#1E1E3F';
        }
    }

    // ══════════════════════════════════════════════
    //  CANVAS SIZING
    // ══════════════════════════════════════════════

    function fitCanvas() {
        if (!canvas || !canvas.parentElement) return;
        const parent = canvas.parentElement;
        const pw = parent.clientWidth || 480;
        const ph = parent.clientHeight || 640;
        DPR = window.devicePixelRatio || 1;
        W = Math.max(320, pw);
        H = Math.max(480, ph);
        canvas.width = W * DPR;
        canvas.height = H * DPR;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        if (cards.length) initCards();
    }

    // ══════════════════════════════════════════════
    //  INIT / DESTROY
    // ══════════════════════════════════════════════

    function init(canvasEl, activePlayer, gameOverCallback) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        player = activePlayer;
        onGameOver = gameOverCallback;

        loadTheme();
        highScore = loadHighScore();

        // Reset state
        level = 1; score = 0; moves = 0; timer = 0;
        consecutiveMatches = 0; matches = 0;
        confettiParticles = [];
        phase = 'playing';
        gameActive = true;
        timerStart = Date.now();
        frameCount = 0;

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        initCards();

        // Bind input
        canvas.addEventListener('click', handleClick);
        canvas.addEventListener('touchstart', handleTouch, { passive: true });
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', fitCanvas);

        render();
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        if (canvas) {
            canvas.removeEventListener('click', handleClick);
            canvas.removeEventListener('touchstart', handleTouch);
        }
        document.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('resize', fitCanvas);
        canvas = null; ctx = null;
        cards = []; confettiParticles = [];
        flipped = []; shakeCards = [];
        if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
        theme = null;
    }

    return {
        init,
        destroy,
        getScore() { return score; },
        getLevel() { return level; },
        isActive() { return gameActive; }
    };
})();
