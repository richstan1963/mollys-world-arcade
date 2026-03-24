/* WhackAMole — Theme-aware Whac-A-Mole for Your World Arcade
 * Canvas 2D, zero dependencies. 60-second timed rounds.
 * IIFE pattern matching Your World Arcade originals. */
window.WhackAMole = (() => {
    // ── Constants ──
    const GAME_W = 480, GAME_H = 640;
    const GRID_COLS = 3, GRID_ROWS = 3;
    const HOLE_W = 110, HOLE_H = 50;
    const MOLE_W = 80, MOLE_H = 70;
    const GRID_START_X = 50, GRID_START_Y = 180;
    const GRID_SPACE_X = 145, GRID_SPACE_Y = 130;
    const ROUND_TIME = 60; // seconds
    const MOLE_NORMAL = 0, MOLE_GOLDEN = 1, MOLE_BOMB = 2;
    const STUN_DURATION = 1500;
    const COMBO_WINDOW = 800;

    // ── State ──
    let canvas, ctx;
    let player = null, onGameOver = null;
    let gameActive = false;
    let animFrame = null;
    let frameCount = 0;
    let startTime = 0;
    let lastTime = 0;
    let SCALE = 1;

    // Theme colors
    let BG_GRAD = ['#0A1A0A', '#1A2E0A'];
    let THEME_COLORS = ['#22C55E', '#84CC16', '#EAB308', '#F97316', '#A16207'];
    let THEME_EMOJI = ['🐹', '🐿️', '💣', '⭐'];

    // Game state
    let score = 0;
    let timeLeft = ROUND_TIME;
    let combo = 0;
    let maxCombo = 0;
    let lastHitTime = 0;
    let totalHits = 0;
    let totalMisses = 0;
    let stunned = false;
    let stunEndTime = 0;
    let gameOver = false;
    let spawnInterval = 1200;    // ms between spawns (decreases over time)
    let moleUpTime = 1500;       // ms moles stay up (decreases over time)
    let lastSpawnTime = 0;

    // Holes and moles
    let holes = [];   // [{x, y, mole: null|{type, state, progress, spawnTime, hitTime}}]

    // Hammer state
    let hammerX = GAME_W / 2, hammerY = GAME_H / 2;
    let hammerSwing = false;
    let hammerSwingTime = 0;
    const HAMMER_SWING_DUR = 200;

    // Visual effects
    let particles = [];
    let floatingTexts = [];
    let bgFlowers = [];
    let screenFlash = 0;
    let screenFlashColor = '';
    let starRating = 0;

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

    function playMolePop() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.setValueAtTime(300, ac.currentTime);
            osc.frequency.exponentialRampToValueAtTime(600, ac.currentTime + 0.08);
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.08, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.1);
        } catch {}
    }

    function playWhack() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            // Thump
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.value = 150; osc.type = 'sine';
            gain.gain.setValueAtTime(0.15, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.12);
            // Noise burst
            const buf = ac.createBuffer(1, ac.sampleRate * 0.05, ac.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
            const noise = ac.createBufferSource();
            const noiseGain = ac.createGain();
            noise.buffer = buf;
            noise.connect(noiseGain); noiseGain.connect(ac.destination);
            noiseGain.gain.setValueAtTime(0.12, ac.currentTime);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.05);
            noise.start(ac.currentTime);
        } catch {}
    }

    function playMiss() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.value = 100; osc.type = 'triangle';
            gain.gain.setValueAtTime(0.06, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.15);
        } catch {}
    }

    function playGoldenDing() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            [880, 1100, 1320].forEach((f, i) => {
                const osc = ac.createOscillator();
                const gain = ac.createGain();
                osc.connect(gain); gain.connect(ac.destination);
                osc.frequency.value = f; osc.type = 'sine';
                const t = ac.currentTime + i * 0.06;
                gain.gain.setValueAtTime(0.1, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
                osc.start(t); osc.stop(t + 0.2);
            });
        } catch {}
    }

    function playBombExplosion() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.setValueAtTime(200, ac.currentTime);
            osc.frequency.exponentialRampToValueAtTime(40, ac.currentTime + 0.4);
            osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0.15, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.4);
            // Noise
            const buf = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
            const noise = ac.createBufferSource();
            const noiseGain = ac.createGain();
            noise.buffer = buf;
            noise.connect(noiseGain); noiseGain.connect(ac.destination);
            noiseGain.gain.setValueAtTime(0.1, ac.currentTime);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3);
            noise.start(ac.currentTime);
        } catch {}
    }

    function playComboChime(level) {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const freq = 600 + Math.min(level, 10) * 60;
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.value = freq; osc.type = 'sine';
            gain.gain.setValueAtTime(0.08, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.15);
        } catch {}
    }

    // ══════════════════════════════════════════════
    // THEME SETUP
    // ══════════════════════════════════════════════
    function loadTheme() {
        let theme = null;
        if (window.ArcadeThemes && player) {
            const tid = (player.theme || player.character || 'garden');
            theme = window.ArcadeThemes.themes[tid];
        }
        if (theme) {
            BG_GRAD = theme.bgGradient || BG_GRAD;
            const c = theme.colors || [];
            if (c.length >= 3) THEME_COLORS = c.slice(0, 5);
            if (theme.blockEmoji) THEME_EMOJI = theme.blockEmoji.slice(0, 4);
        }
    }

    // ══════════════════════════════════════════════
    // HELPERS
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

    function holeCenter(idx) {
        const row = Math.floor(idx / GRID_COLS);
        const col = idx % GRID_COLS;
        return {
            x: GRID_START_X + col * GRID_SPACE_X + HOLE_W / 2,
            y: GRID_START_Y + row * GRID_SPACE_Y + HOLE_H / 2
        };
    }

    // ══════════════════════════════════════════════
    // INIT SCENE
    // ══════════════════════════════════════════════
    function initHoles() {
        holes = [];
        for (let i = 0; i < GRID_ROWS * GRID_COLS; i++) {
            const c = holeCenter(i);
            holes.push({ x: c.x, y: c.y, mole: null });
        }
    }

    function initBgFlowers() {
        bgFlowers = [];
        for (let i = 0; i < 25; i++) {
            bgFlowers.push({
                x: Math.random() * GAME_W,
                y: 120 + Math.random() * (GAME_H - 180),
                size: 8 + Math.random() * 12,
                emoji: ['🌸', '🌼', '🌻', '🌺', '🌷', '🌿', '🍀'][Math.floor(Math.random() * 7)],
                sway: Math.random() * Math.PI * 2
            });
        }
    }

    // ══════════════════════════════════════════════
    // MOLE MANAGEMENT
    // ══════════════════════════════════════════════
    function spawnMole() {
        // Find empty holes
        const empties = holes.map((h, i) => h.mole === null ? i : -1).filter(i => i >= 0);
        if (empties.length === 0) return;

        const idx = empties[Math.floor(Math.random() * empties.length)];

        // Mole type selection
        const roll = Math.random();
        let type = MOLE_NORMAL;
        if (roll < 0.08) type = MOLE_GOLDEN;
        else if (roll < 0.18) type = MOLE_BOMB;

        holes[idx].mole = {
            type,
            state: 'rising',  // rising, up, ducking, hit, gone
            progress: 0,
            spawnTime: performance.now(),
            hitTime: 0,
            riseHeight: 0,
            spinAngle: 0
        };

        playMolePop();
    }

    function updateMoles(now, dt) {
        const elapsed = (ROUND_TIME - timeLeft) / ROUND_TIME; // 0..1 progress through round

        // Dynamic difficulty
        spawnInterval = Math.max(400, 1200 - elapsed * 700);
        moleUpTime = Math.max(600, 1500 - elapsed * 800);

        // Spawn new moles
        if (now - lastSpawnTime > spawnInterval && !stunned) {
            spawnMole();
            lastSpawnTime = now;
            // Sometimes spawn two at once later in the game
            if (elapsed > 0.4 && Math.random() < 0.3) {
                spawnMole();
            }
            if (elapsed > 0.7 && Math.random() < 0.2) {
                spawnMole();
            }
        }

        // Update each mole
        for (const hole of holes) {
            const mole = hole.mole;
            if (!mole) continue;

            const age = now - mole.spawnTime;

            switch (mole.state) {
                case 'rising':
                    mole.riseHeight = Math.min(1, age / 300);
                    if (mole.riseHeight >= 1) mole.state = 'up';
                    break;
                case 'up':
                    if (age > moleUpTime + 300) {
                        mole.state = 'ducking';
                        mole.progress = 0;
                    }
                    // Subtle bob
                    mole.riseHeight = 1 + Math.sin(age * 0.005) * 0.05;
                    break;
                case 'ducking':
                    mole.progress += dt * 3;
                    mole.riseHeight = Math.max(0, 1 - mole.progress);
                    if (mole.riseHeight <= 0) {
                        hole.mole = null;
                    }
                    break;
                case 'hit':
                    const hitAge = now - mole.hitTime;
                    mole.spinAngle += dt * 15;
                    mole.riseHeight = Math.max(0, 1 - hitAge / 500);
                    if (hitAge > 500) {
                        hole.mole = null;
                    }
                    break;
            }
        }
    }

    // ══════════════════════════════════════════════
    // HIT DETECTION
    // ══════════════════════════════════════════════
    function tryHitMole(mx, my) {
        if (stunned || gameOver) return false;

        let hitSomething = false;

        for (const hole of holes) {
            if (!hole.mole) continue;
            if (hole.mole.state !== 'rising' && hole.mole.state !== 'up') continue;

            const moleY = hole.y - hole.mole.riseHeight * MOLE_H;
            const dx = mx - hole.x;
            const dy = my - moleY;

            if (Math.abs(dx) < MOLE_W / 2 + 10 && Math.abs(dy) < MOLE_H / 2 + 10) {
                const mole = hole.mole;
                const now = performance.now();

                if (mole.type === MOLE_BOMB) {
                    // Hit a bomb!
                    score = Math.max(0, score - 200);
                    stunned = true;
                    stunEndTime = now + STUN_DURATION;
                    combo = 0;
                    playBombExplosion();
                    screenFlash = 1;
                    screenFlashColor = '#FF0000';
                    spawnExplosion(hole.x, moleY);
                    addFloatingText(hole.x, moleY - 30, '-200', '#EF4444', 28);
                    mole.state = 'hit';
                    mole.hitTime = now;
                    hitSomething = true;
                } else {
                    // Regular or golden hit
                    const isGolden = mole.type === MOLE_GOLDEN;
                    let pts = isGolden ? 300 : 100;

                    // Combo check
                    if (now - lastHitTime < COMBO_WINDOW) {
                        combo++;
                        if (combo > maxCombo) maxCombo = combo;
                        pts += combo * 25;
                        playComboChime(combo);
                    } else {
                        combo = 1;
                    }
                    lastHitTime = now;

                    score += pts;
                    totalHits++;

                    if (isGolden) {
                        playGoldenDing();
                        spawnSparkles(hole.x, moleY);
                        screenFlash = 0.5;
                        screenFlashColor = '#FFD700';
                    } else {
                        playWhack();
                    }

                    spawnHitStars(hole.x, moleY);
                    const ptsText = combo > 1 ? `+${pts} x${combo}` : `+${pts}`;
                    const color = isGolden ? '#FFD700' : '#22C55E';
                    addFloatingText(hole.x, moleY - 30, ptsText, color, isGolden ? 26 : 20);

                    mole.state = 'hit';
                    mole.hitTime = now;
                    hitSomething = true;
                }

                break; // Only hit one mole per click
            }
        }

        if (!hitSomething) {
            totalMisses++;
            playMiss();
            spawnDustCloud(mx, my);
        }

        return hitSomething;
    }

    // ══════════════════════════════════════════════
    // PARTICLES & EFFECTS
    // ══════════════════════════════════════════════
    function spawnHitStars(x, y) {
        const now = performance.now();
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 / 8) * i + Math.random() * 0.3;
            particles.push({
                x, y,
                vx: Math.cos(angle) * (3 + Math.random() * 3),
                vy: Math.sin(angle) * (3 + Math.random() * 3),
                size: 6 + Math.random() * 6,
                color: ['#FFD700', '#FFA500', '#FFFFFF', '#FF6347'][Math.floor(Math.random() * 4)],
                type: 'star',
                born: now,
                life: 600
            });
        }
    }

    function spawnSparkles(x, y) {
        const now = performance.now();
        for (let i = 0; i < 15; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 5;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2,
                size: 4 + Math.random() * 4,
                color: '#FFD700',
                type: 'sparkle',
                born: now,
                life: 800
            });
        }
    }

    function spawnExplosion(x, y) {
        const now = performance.now();
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 6;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 5 + Math.random() * 8,
                color: ['#FF4444', '#FF8800', '#FFCC00', '#FF6600'][Math.floor(Math.random() * 4)],
                type: 'explosion',
                born: now,
                life: 700
            });
        }
    }

    function spawnDustCloud(x, y) {
        const now = performance.now();
        for (let i = 0; i < 5; i++) {
            particles.push({
                x: x + (Math.random() - 0.5) * 20,
                y: y + (Math.random() - 0.5) * 10,
                vx: (Math.random() - 0.5) * 2,
                vy: -Math.random() * 2,
                size: 8 + Math.random() * 8,
                color: '#A0855B',
                type: 'dust',
                born: now,
                life: 400
            });
        }
    }

    function addFloatingText(x, y, text, color, size) {
        floatingTexts.push({
            x, y, text, color,
            size: size || 20,
            born: performance.now()
        });
    }

    function updateParticles(now) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            const age = now - p.born;
            if (age > p.life) { particles.splice(i, 1); continue; }
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1; // gravity
            p.vx *= 0.98;
        }

        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            const ft = floatingTexts[i];
            if (now - ft.born > 1200) floatingTexts.splice(i, 1);
        }
    }

    // ══════════════════════════════════════════════
    // DRAWING
    // ══════════════════════════════════════════════
    function drawBackground() {
        // Sky gradient
        const grad = ctx.createLinearGradient(0, 0, 0, GAME_H);
        grad.addColorStop(0, '#87CEEB');
        grad.addColorStop(0.3, '#68B8DE');
        grad.addColorStop(0.5, '#4CAF50');
        grad.addColorStop(1, '#2E7D32');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Fence
        ctx.fillStyle = '#8B6914';
        for (let x = 0; x < GAME_W; x += 40) {
            ctx.fillRect(x + 5, 100, 8, 60);
            ctx.fillRect(x + 25, 100, 8, 60);
        }
        ctx.fillRect(0, 115, GAME_W, 6);
        ctx.fillRect(0, 140, GAME_W, 6);

        // Grass
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(0, 155, GAME_W, GAME_H - 155);

        // Background flowers
        for (const f of bgFlowers) {
            f.sway += 0.01;
            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.font = `${f.size}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const swayX = Math.sin(f.sway) * 2;
            ctx.fillText(f.emoji, f.x + swayX, f.y);
            ctx.restore();
        }
    }

    function drawHUD() {
        // Score
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        ctx.fillText(`Score: ${score}`, 20, 40);

        // Time
        ctx.textAlign = 'right';
        const timeColor = timeLeft <= 10 ? '#EF4444' : '#FFFFFF';
        ctx.fillStyle = timeColor;
        ctx.fillText(`⏱️ ${Math.ceil(timeLeft)}s`, GAME_W - 20, 40);

        // Combo
        if (combo > 1) {
            ctx.textAlign = 'center';
            ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
            ctx.fillStyle = '#FFD700';
            const pulseScale = 1 + Math.sin(frameCount * 0.15) * 0.1;
            ctx.save();
            ctx.translate(GAME_W / 2, 40);
            ctx.scale(pulseScale, pulseScale);
            ctx.fillText(`🔥 x${combo} Combo!`, 0, 0);
            ctx.restore();
        }

        // Stun indicator
        if (stunned) {
            ctx.textAlign = 'center';
            ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
            ctx.fillStyle = '#EF4444';
            ctx.fillText('💫 STUNNED! 💫', GAME_W / 2, 75);
        }

        ctx.restore();
    }

    function drawHoles() {
        for (let i = 0; i < holes.length; i++) {
            const hole = holes[i];
            const { x, y } = hole;

            // Dirt mound / rim behind mole
            ctx.save();

            // Hole shadow (ellipse)
            ctx.beginPath();
            ctx.ellipse(x, y + 10, HOLE_W / 2, HOLE_H / 2, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#2D1B0E';
            ctx.fill();

            // Hole opening
            ctx.beginPath();
            ctx.ellipse(x, y + 5, HOLE_W / 2 - 5, HOLE_H / 2 - 5, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#1A0F06';
            ctx.fill();

            // Draw mole if present
            if (hole.mole) {
                drawMole(hole);
            }

            // Grass rim on top (drawn OVER the mole bottom half for peek effect)
            ctx.beginPath();
            ctx.ellipse(x, y + 5, HOLE_W / 2 + 5, HOLE_H / 2 + 2, 0, 0, Math.PI);
            ctx.fillStyle = '#388E3C';
            ctx.fill();

            // Dirt rim highlight
            ctx.beginPath();
            ctx.ellipse(x, y + 8, HOLE_W / 2 + 3, 8, 0, 0, Math.PI);
            ctx.fillStyle = '#6D4C2A';
            ctx.fill();

            ctx.restore();
        }
    }

    function drawMole(hole) {
        const mole = hole.mole;
        if (!mole) return;

        const { x, y } = hole;
        const riseH = mole.riseHeight;
        if (riseH <= 0) return;

        const moleY = y - riseH * MOLE_H + 10;

        ctx.save();

        // Clip to hole area (mole hides below rim)
        ctx.beginPath();
        ctx.rect(x - MOLE_W / 2 - 10, y - MOLE_H * 1.5, MOLE_W + 20, MOLE_H * 1.5 + 5);
        ctx.clip();

        // Apply spin if hit
        if (mole.state === 'hit') {
            ctx.translate(x, moleY);
            ctx.rotate(mole.spinAngle);
            ctx.translate(-x, -moleY);
            ctx.globalAlpha = Math.max(0, riseH);
        }

        // Body colors based on type
        let bodyColor, bodyDark, eyeColor, noseColor;
        switch (mole.type) {
            case MOLE_GOLDEN:
                bodyColor = '#FFD700';
                bodyDark = '#DAA520';
                eyeColor = '#FFFFFF';
                noseColor = '#FF6347';
                break;
            case MOLE_BOMB:
                bodyColor = '#333333';
                bodyDark = '#1A1A1A';
                eyeColor = '#FF0000';
                noseColor = '#FF0000';
                break;
            default:
                bodyColor = '#8B6914';
                bodyDark = '#6B4F12';
                eyeColor = '#FFFFFF';
                noseColor = '#FF69B4';
        }

        // Body (rounded rectangle)
        const bx = x - MOLE_W / 2;
        const by = moleY - MOLE_H / 2 + 10;
        roundRect(bx, by, MOLE_W, MOLE_H, 20);
        ctx.fillStyle = bodyColor;
        ctx.fill();
        ctx.strokeStyle = bodyDark;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Belly
        ctx.beginPath();
        ctx.ellipse(x, moleY + 15, MOLE_W / 3, MOLE_H / 4, 0, 0, Math.PI * 2);
        ctx.fillStyle = mole.type === MOLE_BOMB ? '#444' : '#D4A853';
        ctx.fill();

        // Eyes
        const eyeY = moleY - 5;
        // White
        ctx.beginPath();
        ctx.arc(x - 14, eyeY, 10, 0, Math.PI * 2);
        ctx.fillStyle = eyeColor;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 14, eyeY, 10, 0, Math.PI * 2);
        ctx.fillStyle = eyeColor;
        ctx.fill();
        // Pupils
        ctx.beginPath();
        ctx.arc(x - 12, eyeY, 5, 0, Math.PI * 2);
        ctx.fillStyle = mole.type === MOLE_BOMB ? '#FF0000' : '#1A1A1A';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 16, eyeY, 5, 0, Math.PI * 2);
        ctx.fillStyle = mole.type === MOLE_BOMB ? '#FF0000' : '#1A1A1A';
        ctx.fill();
        // Eye shine
        if (mole.type !== MOLE_BOMB) {
            ctx.beginPath();
            ctx.arc(x - 10, eyeY - 3, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x + 18, eyeY - 3, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
        }

        // Nose
        ctx.beginPath();
        ctx.ellipse(x, moleY + 5, 6, 4, 0, 0, Math.PI * 2);
        ctx.fillStyle = noseColor;
        ctx.fill();

        // Mouth
        if (mole.state === 'hit') {
            // Dizzy mouth
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('😵', x, moleY + 18);
        } else if (mole.type === MOLE_BOMB) {
            // Angry mouth
            ctx.beginPath();
            ctx.arc(x, moleY + 14, 6, 0, Math.PI);
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 2;
            ctx.stroke();
            // Fuse
            ctx.beginPath();
            ctx.moveTo(x, moleY - MOLE_H / 2 + 10);
            ctx.lineTo(x + 5, moleY - MOLE_H / 2);
            ctx.strokeStyle = '#FF6600';
            ctx.lineWidth = 3;
            ctx.stroke();
            // Spark
            if (frameCount % 6 < 3) {
                ctx.font = '10px Arial';
                ctx.fillText('💥', x + 5, moleY - MOLE_H / 2 - 3);
            }
        } else {
            // Happy mouth
            ctx.beginPath();
            ctx.arc(x, moleY + 12, 5, 0, Math.PI);
            ctx.strokeStyle = bodyDark;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Whiskers
        if (mole.type !== MOLE_BOMB) {
            ctx.strokeStyle = bodyDark;
            ctx.lineWidth = 1;
            // Left
            ctx.beginPath(); ctx.moveTo(x - 20, moleY + 3); ctx.lineTo(x - 38, moleY - 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x - 20, moleY + 7); ctx.lineTo(x - 38, moleY + 10); ctx.stroke();
            // Right
            ctx.beginPath(); ctx.moveTo(x + 20, moleY + 3); ctx.lineTo(x + 38, moleY - 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x + 20, moleY + 7); ctx.lineTo(x + 38, moleY + 10); ctx.stroke();
        }

        // Golden sparkle effect
        if (mole.type === MOLE_GOLDEN && mole.state !== 'hit') {
            const sparkleTime = performance.now() * 0.003;
            for (let s = 0; s < 5; s++) {
                const angle = sparkleTime + s * Math.PI * 2 / 5;
                const sx = x + Math.cos(angle) * 35;
                const sy = moleY + Math.sin(angle) * 25;
                const sparkAlpha = 0.5 + Math.sin(sparkleTime * 3 + s) * 0.5;
                ctx.save();
                ctx.globalAlpha = sparkAlpha * riseH;
                ctx.font = '10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('✨', sx, sy);
                ctx.restore();
            }
        }

        ctx.restore();
    }

    function drawHammer() {
        const now = performance.now();
        let angle = -0.3;

        if (hammerSwing) {
            const elapsed = now - hammerSwingTime;
            if (elapsed < HAMMER_SWING_DUR) {
                const progress = elapsed / HAMMER_SWING_DUR;
                angle = -0.3 + Math.sin(progress * Math.PI) * 1.2;
            } else {
                hammerSwing = false;
            }
        }

        ctx.save();
        ctx.translate(hammerX, hammerY);
        ctx.rotate(angle);

        // Handle
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(-3, 0, 6, 40);

        // Head
        roundRect(-18, -20, 36, 24, 4);
        ctx.fillStyle = '#777777';
        ctx.fill();
        ctx.strokeStyle = '#555555';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Head highlight
        roundRect(-15, -18, 30, 8, 2);
        ctx.fillStyle = '#999999';
        ctx.fill();

        // Impact stars if swinging
        if (hammerSwing) {
            const elapsed = now - hammerSwingTime;
            if (elapsed > HAMMER_SWING_DUR * 0.4 && elapsed < HAMMER_SWING_DUR * 0.8) {
                ctx.font = '16px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('💥', -5, -25);
            }
        }

        ctx.restore();
    }

    function drawParticles() {
        const now = performance.now();
        for (const p of particles) {
            const age = now - p.born;
            const alpha = Math.max(0, 1 - age / p.life);

            ctx.save();
            ctx.globalAlpha = alpha;

            if (p.type === 'star') {
                // Draw a star shape
                const size = p.size * (1 - age / p.life * 0.5);
                ctx.fillStyle = p.color;
                ctx.translate(p.x, p.y);
                ctx.rotate(age * 0.01);
                drawStarShape(0, 0, size / 2, size, 5);
                ctx.fill();
            } else if (p.type === 'sparkle') {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'explosion') {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * (0.5 + alpha * 0.5), 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'dust') {
                ctx.fillStyle = p.color;
                ctx.globalAlpha = alpha * 0.6;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    }

    function drawStarShape(cx, cy, innerR, outerR, points) {
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const angle = (i * Math.PI) / points - Math.PI / 2;
            const r = i % 2 === 0 ? outerR : innerR;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
    }

    function drawFloatingTexts() {
        const now = performance.now();
        for (const ft of floatingTexts) {
            const age = now - ft.born;
            const alpha = Math.max(0, 1 - age / 1200);
            const y = ft.y - age * 0.06;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = `bold ${ft.size}px "Segoe UI", Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = ft.color;
            ctx.shadowColor = '#000000';
            ctx.shadowBlur = 3;
            ctx.fillText(ft.text, ft.x, y);
            ctx.restore();
        }
    }

    function drawScreenFlash() {
        if (screenFlash > 0) {
            ctx.save();
            ctx.globalAlpha = screenFlash * 0.3;
            ctx.fillStyle = screenFlashColor;
            ctx.fillRect(0, 0, GAME_W, GAME_H);
            ctx.restore();
            screenFlash *= 0.9;
            if (screenFlash < 0.01) screenFlash = 0;
        }
    }

    function drawStunOverlay() {
        if (!stunned) return;
        ctx.save();
        const pulse = Math.sin(frameCount * 0.2) * 0.1 + 0.15;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(0, 0, GAME_W, GAME_H);
        ctx.restore();
    }

    function drawGameOver() {
        if (!gameOver) return;

        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, GAME_W, GAME_H);
        ctx.globalAlpha = 1;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Title
        ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('⏱️ Time\'s Up!', GAME_W / 2, GAME_H / 2 - 120);

        // Score
        ctx.font = 'bold 48px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`${score}`, GAME_W / 2, GAME_H / 2 - 60);
        ctx.font = '18px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#9CA3AF';
        ctx.fillText('POINTS', GAME_W / 2, GAME_H / 2 - 30);

        // Star rating
        starRating = score >= 3000 ? 3 : score >= 1500 ? 2 : score >= 500 ? 1 : 0;
        ctx.font = '40px Arial';
        let starsStr = '';
        for (let i = 0; i < 3; i++) starsStr += i < starRating ? '⭐' : '☆';
        ctx.fillText(starsStr, GAME_W / 2, GAME_H / 2 + 20);

        // Stats
        ctx.font = '16px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#D1D5DB';
        ctx.fillText(`Hits: ${totalHits} | Misses: ${totalMisses} | Max Combo: ${maxCombo}`, GAME_W / 2, GAME_H / 2 + 70);

        const accuracy = totalHits + totalMisses > 0 ? Math.round(totalHits / (totalHits + totalMisses) * 100) : 0;
        ctx.fillText(`Accuracy: ${accuracy}%`, GAME_W / 2, GAME_H / 2 + 95);

        // Play Again button
        roundRect(GAME_W / 2 - 70, GAME_H / 2 + 130, 140, 44, 12);
        ctx.fillStyle = '#22C55E';
        ctx.fill();
        ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('🔄 Play Again', GAME_W / 2, GAME_H / 2 + 152);

        ctx.restore();
    }

    // ══════════════════════════════════════════════
    // INPUT
    // ══════════════════════════════════════════════
    function handleMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = GAME_W / rect.width;
        const scaleY = GAME_H / rect.height;
        hammerX = (e.clientX - rect.left) * scaleX;
        hammerY = (e.clientY - rect.top) * scaleY;
    }

    function handleClick(e) {
        if (!gameActive) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = GAME_W / rect.width;
        const scaleY = GAME_H / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;

        hammerX = mx;
        hammerY = my;

        if (gameOver) {
            // Play Again button
            if (mx >= GAME_W / 2 - 70 && mx <= GAME_W / 2 + 70 &&
                my >= GAME_H / 2 + 130 && my <= GAME_H / 2 + 174) {
                resetGame();
                return;
            }
            return;
        }

        // Swing hammer
        hammerSwing = true;
        hammerSwingTime = performance.now();

        tryHitMole(mx, my);
    }

    function handleTouch(e) {
        e.preventDefault();
        const touch = e.touches[0];
        if (!touch) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = GAME_W / rect.width;
        const scaleY = GAME_H / rect.height;
        const mx = (touch.clientX - rect.left) * scaleX;
        const my = (touch.clientY - rect.top) * scaleY;

        hammerX = mx;
        hammerY = my;

        if (gameOver) {
            if (mx >= GAME_W / 2 - 70 && mx <= GAME_W / 2 + 70 &&
                my >= GAME_H / 2 + 130 && my <= GAME_H / 2 + 174) {
                resetGame();
                return;
            }
            return;
        }

        hammerSwing = true;
        hammerSwingTime = performance.now();
        tryHitMole(mx, my);
    }

    function handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        if (!touch) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = GAME_W / rect.width;
        const scaleY = GAME_H / rect.height;
        hammerX = (touch.clientX - rect.left) * scaleX;
        hammerY = (touch.clientY - rect.top) * scaleY;
    }

    // ══════════════════════════════════════════════
    // GAME LOOP
    // ══════════════════════════════════════════════
    function gameLoop(timestamp) {
        if (!gameActive) return;
        const now = performance.now();
        const dt = lastTime ? (now - lastTime) / 1000 : 0.016;
        lastTime = now;
        frameCount++;

        // Update timer
        if (!gameOver) {
            timeLeft -= dt;
            if (timeLeft <= 0) {
                timeLeft = 0;
                gameOver = true;
                // Clear all moles
                for (const hole of holes) hole.mole = null;

                if (onGameOver) {
                    setTimeout(() => {
                        onGameOver({
                            score,
                            time: ROUND_TIME,
                            hits: totalHits,
                            misses: totalMisses,
                            maxCombo,
                            stars: starRating
                        });
                    }, 2000);
                }
            }
        }

        // Update stun
        if (stunned && now > stunEndTime) {
            stunned = false;
        }

        // Update moles
        if (!gameOver) {
            updateMoles(now, dt);
        }

        // Update effects
        updateParticles(now);

        // ── DRAW ──
        ctx.save();
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        drawBackground();
        drawHUD();
        drawHoles();
        drawParticles();
        drawFloatingTexts();
        drawHammer();
        drawScreenFlash();
        drawStunOverlay();
        drawGameOver();

        ctx.restore();

        animFrame = requestAnimationFrame(gameLoop);
    }

    // ══════════════════════════════════════════════
    // RESET
    // ══════════════════════════════════════════════
    function resetGame() {
        score = 0;
        timeLeft = ROUND_TIME;
        combo = 0;
        maxCombo = 0;
        lastHitTime = 0;
        totalHits = 0;
        totalMisses = 0;
        stunned = false;
        stunEndTime = 0;
        gameOver = false;
        lastSpawnTime = performance.now();
        spawnInterval = 1200;
        moleUpTime = 1500;
        particles = [];
        floatingTexts = [];
        screenFlash = 0;
        starRating = 0;
        lastTime = 0;
        frameCount = 0;

        initHoles();
    }

    // ══════════════════════════════════════════════
    // INIT / DESTROY
    // ══════════════════════════════════════════════
    function init(cvs, pl, cb) {
        canvas = cvs;
        player = pl;
        onGameOver = cb;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = GAME_W * dpr;
        canvas.height = GAME_H * dpr;
        canvas.style.width = GAME_W + 'px';
        canvas.style.height = GAME_H + 'px';
        ctx = canvas.getContext('2d');
        canvas.style.cursor = 'none';

        loadTheme();
        initBgFlowers();
        resetGame();

        gameActive = true;
        startTime = performance.now();

        // Bind events
        canvas._wam_mousemove = handleMouseMove;
        canvas._wam_click = handleClick;
        canvas._wam_touchstart = handleTouch;
        canvas._wam_touchmove = handleTouchMove;
        canvas.addEventListener('mousemove', canvas._wam_mousemove);
        canvas.addEventListener('click', canvas._wam_click);
        canvas.addEventListener('touchstart', canvas._wam_touchstart, { passive: false });
        canvas.addEventListener('touchmove', canvas._wam_touchmove, { passive: false });

        animFrame = requestAnimationFrame(gameLoop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;

        if (canvas) {
            canvas.style.cursor = '';
            if (canvas._wam_mousemove) canvas.removeEventListener('mousemove', canvas._wam_mousemove);
            if (canvas._wam_click) canvas.removeEventListener('click', canvas._wam_click);
            if (canvas._wam_touchstart) canvas.removeEventListener('touchstart', canvas._wam_touchstart);
            if (canvas._wam_touchmove) canvas.removeEventListener('touchmove', canvas._wam_touchmove);
            delete canvas._wam_mousemove;
            delete canvas._wam_click;
            delete canvas._wam_touchstart;
            delete canvas._wam_touchmove;
        }

        if (audioCtx) {
            try { audioCtx.close(); } catch {}
            audioCtx = null;
        }

        particles = [];
        floatingTexts = [];
        holes = [];
    }

    return { init, destroy };
})();
