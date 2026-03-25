/* Pickleball — Side-view pickleball game for Your World Arcade
 * Kenney Platform + Physics sprite edition */
window.Pickleball = (() => {

    // ══════════════════════════════════════════════════════════
    //  SPRITE PRELOADER — Kenney Platform + Physics Packs
    // ══════════════════════════════════════════════════════════
    const PHYS_BASE = '/img/game-assets/kenney-physics';
    const PLAT_BASE = '/img/game-assets/kenney-platform';
    const spriteCache = {};
    let spritesLoaded = 0;
    let spritesTotal  = 0;
    let allSpritesReady = false;

    const SPRITE_MANIFEST = {
        // Court surface tiles
        grassMid:       `${PLAT_BASE}/ground/Grass/grassMid.png`,
        grassCenter:    `${PLAT_BASE}/ground/Grass/grassCenter.png`,
        stoneMid:       `${PLAT_BASE}/ground/Stone/stoneMid.png`,
        stoneCenter:    `${PLAT_BASE}/ground/Stone/stoneCenter.png`,
        // Net/fence sprites
        fence:          `${PLAT_BASE}/tiles/fence.png`,
        fenceBroken:    `${PLAT_BASE}/tiles/fenceBroken.png`,
        chain:          `${PLAT_BASE}/tiles/chain.png`,
        // Background
        bgGrass:        `${PLAT_BASE}/backgrounds/colored_grass.png`,
        bgLand:         `${PLAT_BASE}/backgrounds/blue_land.png`,
        // Metal for net post
        metalPlate:     `${PHYS_BASE}/metal/elementMetal010.png`,
        metalBolt:      `${PHYS_BASE}/metal/elementMetal029.png`,
        // Wood for fence/posts
        woodBlock:      `${PHYS_BASE}/wood/elementWood010.png`,
        woodThin:       `${PHYS_BASE}/wood/elementWood018.png`,
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
                if (spritesLoaded >= spritesTotal) { allSpritesReady = true; if (onComplete) onComplete(); }
            };
            img.onerror = () => {
                spriteCache[key] = null;
                spritesLoaded++;
                if (spritesLoaded >= spritesTotal) { allSpritesReady = true; if (onComplete) onComplete(); }
            };
            img.src = SPRITE_MANIFEST[key];
        });
    }

    function spr(name) { return spriteCache[name] || null; }

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

    // ── Constants ──
    const GAME_W = 640, GAME_H = 400;
    const GRAVITY = 0.28;
    const BOUNCE_COEFF = 0.55;       // wiffle ball — less bouncy
    const NET_X = GAME_W / 2;
    const NET_H = 58;
    const NET_TOP = GAME_H - 60 - NET_H; // court ground minus net height
    const COURT_Y = GAME_H - 60;         // ground level
    const KITCHEN_W = 70;                 // 7ft zone each side of net
    const PLAYER_W = 18, PLAYER_H = 44;
    const PADDLE_W = 6, PADDLE_H = 22;
    const BALL_R = 5;
    const SERVE_SPEED = 4.5;
    const WIN_SCORE = 11;
    const BEST_OF = 3;

    // Swing timing windows (frames from swing start)
    const SWING_EARLY = 6;   // lob window
    const SWING_PERFECT = 12; // drive window
    const SWING_LATE = 18;    // drop shot window
    const SWING_DURATION = 22;

    // States
    const ST_LOADING = -1, ST_TITLE = 0, ST_SERVE = 1, ST_PLAY = 2, ST_POINT = 3, ST_GAMEOVER = 4;

    // ── State ──
    let canvas, ctx, animFrame, gameActive = false;
    let activePlayer, gameOverCB, playerColor;
    let state, frameCount, lastTime;
    let keys = {};
    let score, opponentScore, games, opponentGames;
    let servingPlayer; // 0 = player, 1 = AI
    let serveBouncedPlayer, serveBouncedOpponent; // double bounce rule
    let rallyCount;
    let pointMessageTimer, pointMessage;
    let difficulty; // 0=easy, 1=med, 2=hard
    let titlePulse;

    // Player (left side)
    let pX, pY, pVY, pSwinging, pSwingFrame, pSwingType;
    let pFacing; // 1 = right

    // AI opponent (right side)
    let aiX, aiY, aiVY, aiSwinging, aiSwingFrame, aiSwingType;
    let aiTargetY, aiReactDelay, aiReactTimer;

    // Ball
    let ball; // { x, y, vx, vy, spin, active, shadow, trail, lastHitBy }
    let ballTrail;

    // Particles / effects
    let particles, scorePopups;
    let crowdWave;

    // Audio
    let audioCtx = null;

    // Touch controls
    let touchY = null, touchSwing = false;
    let touchStartX = 0, touchStartY = 0;

    // Canvas scaling
    let SCALE = 1, DPR = 1;

    // ── Audio System ──
    function getAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
        }
        return audioCtx;
    }

    function playPaddleHit(power) {
        // Signature pickleball hollow pop
        const ac = getAudio(); if (!ac) return;
        try {
            const t = ac.currentTime;
            // Noise burst for the pop
            const bufLen = ac.sampleRate * 0.06;
            const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufLen; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.15));
            }
            const noise = ac.createBufferSource();
            noise.buffer = buf;

            // Bandpass for hollow sound
            const bp = ac.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = 1800 + power * 600;
            bp.Q.value = 2.5;

            const gain = ac.createGain();
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

            noise.connect(bp); bp.connect(gain); gain.connect(ac.destination);
            noise.start(t); noise.stop(t + 0.08);

            // Tonal click
            const osc = ac.createOscillator();
            const g2 = ac.createGain();
            osc.frequency.setValueAtTime(900 + power * 400, t);
            osc.frequency.exponentialRampToValueAtTime(400, t + 0.04);
            osc.type = 'triangle';
            g2.gain.setValueAtTime(0.12, t);
            g2.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
            osc.connect(g2); g2.connect(ac.destination);
            osc.start(t); osc.stop(t + 0.05);
        } catch (e) {}
    }

    function playBounce() {
        const ac = getAudio(); if (!ac) return;
        try {
            const t = ac.currentTime;
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.frequency.setValueAtTime(300, t);
            osc.frequency.exponentialRampToValueAtTime(150, t + 0.06);
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.1, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
            osc.connect(gain); gain.connect(ac.destination);
            osc.start(t); osc.stop(t + 0.08);
        } catch (e) {}
    }

    function playNetHit() {
        const ac = getAudio(); if (!ac) return;
        try {
            const t = ac.currentTime;
            const bufLen = ac.sampleRate * 0.12;
            const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufLen; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.3)) * Math.sin(i * 0.05);
            }
            const src = ac.createBufferSource();
            src.buffer = buf;
            const gain = ac.createGain();
            gain.gain.setValueAtTime(0.15, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            src.connect(gain); gain.connect(ac.destination);
            src.start(t); src.stop(t + 0.12);
        } catch (e) {}
    }

    function playPointScored() {
        const ac = getAudio(); if (!ac) return;
        try {
            const t = ac.currentTime;
            [523, 659, 784].forEach((f, i) => {
                const osc = ac.createOscillator();
                const gain = ac.createGain();
                osc.frequency.value = f;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.1, t + i * 0.1);
                gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.15);
                osc.connect(gain); gain.connect(ac.destination);
                osc.start(t + i * 0.1); osc.stop(t + i * 0.1 + 0.15);
            });
        } catch (e) {}
    }

    function playFault() {
        const ac = getAudio(); if (!ac) return;
        try {
            const t = ac.currentTime;
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.frequency.setValueAtTime(400, t);
            osc.frequency.exponentialRampToValueAtTime(200, t + 0.3);
            osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0.08, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            osc.connect(gain); gain.connect(ac.destination);
            osc.start(t); osc.stop(t + 0.3);
        } catch (e) {}
    }

    function playCrowdCheer() {
        const ac = getAudio(); if (!ac) return;
        try {
            const t = ac.currentTime;
            for (let i = 0; i < 3; i++) {
                const bufLen = ac.sampleRate * 0.4;
                const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
                const data = buf.getChannelData(0);
                for (let j = 0; j < bufLen; j++) {
                    data[j] = (Math.random() * 2 - 1) * 0.5 * Math.sin(j / bufLen * Math.PI);
                }
                const src = ac.createBufferSource();
                src.buffer = buf;
                const bp = ac.createBiquadFilter();
                bp.type = 'bandpass';
                bp.frequency.value = 800 + i * 400;
                bp.Q.value = 0.5;
                const gain = ac.createGain();
                gain.gain.setValueAtTime(0.03, t + i * 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
                src.connect(bp); bp.connect(gain); gain.connect(ac.destination);
                src.start(t + i * 0.05); src.stop(t + 0.5);
            }
        } catch (e) {}
    }

    function playServeToss() {
        const ac = getAudio(); if (!ac) return;
        try {
            const t = ac.currentTime;
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.frequency.setValueAtTime(500, t);
            osc.frequency.exponentialRampToValueAtTime(800, t + 0.15);
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.06, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            osc.connect(gain); gain.connect(ac.destination);
            osc.start(t); osc.stop(t + 0.15);
        } catch (e) {}
    }

    // ── Particle System ──
    function spawnHitBurst(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1,
                life: 20 + Math.random() * 15,
                maxLife: 35,
                r: 2 + Math.random() * 3,
                color
            });
        }
    }

    function spawnScorePopup(x, y, text, color) {
        scorePopups.push({ x, y, text, color, life: 60, maxLife: 60 });
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08;
            p.life--;
            if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const s = scorePopups[i];
            s.y -= 0.8;
            s.life--;
            if (s.life <= 0) scorePopups.splice(i, 1);
        }
    }

    // ── Ball Physics ──
    function resetBall() {
        const sx = servingPlayer === 0 ? pX + PLAYER_W + 10 : aiX - 10;
        const sy = COURT_Y - 80;
        ball = {
            x: sx, y: sy,
            vx: 0, vy: 0,
            spin: 0,
            active: false,
            lastHitBy: -1,
            bounceCount: 0,
            bouncedOnPlayerSide: false,
            bouncedOnOpponentSide: false,
            outOfPlay: false
        };
        ballTrail = [];
        serveBouncedPlayer = false;
        serveBouncedOpponent = false;
        rallyCount = 0;
    }

    function serveBall() {
        playServeToss();
        ball.active = true;
        if (servingPlayer === 0) {
            ball.x = pX + PLAYER_W + 10;
            ball.y = COURT_Y - 60;
            ball.vx = SERVE_SPEED + Math.random() * 0.5;
            ball.vy = -3.5 - Math.random() * 0.5;
            ball.lastHitBy = 0;
        } else {
            ball.x = aiX - 10;
            ball.y = COURT_Y - 60;
            ball.vx = -(SERVE_SPEED + Math.random() * 0.5);
            ball.vy = -3.5 - Math.random() * 0.5;
            ball.lastHitBy = 1;
        }
        ball.spin = 0;
        ball.bounceCount = 0;
        ball.bouncedOnPlayerSide = false;
        ball.bouncedOnOpponentSide = false;
    }

    function updateBall() {
        if (!ball.active) return;

        // Apply gravity
        ball.vy += GRAVITY;

        // Apply spin to horizontal movement
        ball.vx += ball.spin * 0.01;

        // Move
        ball.x += ball.vx;
        ball.y += ball.vy;

        // Trail
        if (frameCount % 2 === 0) {
            ballTrail.push({ x: ball.x, y: ball.y, life: 12 });
        }
        for (let i = ballTrail.length - 1; i >= 0; i--) {
            ballTrail[i].life--;
            if (ballTrail[i].life <= 0) ballTrail.splice(i, 1);
        }

        // Court bounce
        if (ball.y + BALL_R >= COURT_Y) {
            ball.y = COURT_Y - BALL_R;
            ball.vy = -Math.abs(ball.vy) * BOUNCE_COEFF;
            ball.vx *= 0.92;
            ball.spin *= 0.7;
            ball.bounceCount++;
            playBounce();

            // Track which side it bounced on
            if (ball.x < NET_X) {
                ball.bouncedOnPlayerSide = true;
                if (ball.lastHitBy === 1) serveBouncedPlayer = true;
            } else {
                ball.bouncedOnOpponentSide = true;
                if (ball.lastHitBy === 0) serveBouncedOpponent = true;
            }

            // Double bounce = point lost
            if (ball.x < NET_X && ball.bounceCount >= 2 && ball.lastHitBy === 1) {
                awardPoint(1, 'Double bounce!');
                return;
            }
            if (ball.x >= NET_X && ball.bounceCount >= 2 && ball.lastHitBy === 0) {
                awardPoint(0, 'Double bounce!');
                return;
            }
        }

        // Ceiling
        if (ball.y - BALL_R < 0) {
            ball.y = BALL_R;
            ball.vy = Math.abs(ball.vy) * 0.5;
        }

        // Net collision
        if (ball.x > NET_X - 4 && ball.x < NET_X + 4 && ball.y > NET_TOP) {
            playNetHit();
            spawnHitBurst(NET_X, ball.y, '#ffffff', 6);
            if (ball.vx > 0) {
                ball.x = NET_X - 4;
                ball.vx = -ball.vx * 0.3;
            } else {
                ball.x = NET_X + 4;
                ball.vx = -ball.vx * 0.3;
            }
            ball.vy *= 0.8;
            // If ball dies at net, point to other side
            if (Math.abs(ball.vx) < 0.3 && Math.abs(ball.vy) < 0.5) {
                if (ball.lastHitBy === 0) awardPoint(1, 'Net!');
                else awardPoint(0, 'Net!');
                return;
            }
        }

        // Out of bounds (left/right)
        if (ball.x < -20) {
            if (ball.lastHitBy === 1) awardPoint(1, 'Out!');
            else awardPoint(0, 'Out!');
            return;
        }
        if (ball.x > GAME_W + 20) {
            if (ball.lastHitBy === 0) awardPoint(0, 'Out!');
            else awardPoint(1, 'Out!');
            return;
        }

        // Ball slowed to stop on ground
        if (ball.y >= COURT_Y - BALL_R - 1 && Math.abs(ball.vy) < 0.5 && Math.abs(ball.vx) < 0.3) {
            if (ball.x < NET_X) {
                awardPoint(1, ball.lastHitBy === 0 ? 'Out!' : 'IN!');
            } else {
                awardPoint(0, ball.lastHitBy === 1 ? 'Out!' : 'IN!');
            }
        }
    }

    // ── Swing / Hit Detection ──
    function getPaddleHitbox(px, py, facing) {
        const padX = facing > 0 ? px + PLAYER_W : px - PADDLE_W;
        const padY = py + 4;
        return { x: padX, y: padY, w: PADDLE_W + 12, h: PADDLE_H + 8 };
    }

    function attemptHit(px, py, facing, swingFrame, isAI) {
        const hb = getPaddleHitbox(px, py, facing);
        if (ball.x + BALL_R > hb.x && ball.x - BALL_R < hb.x + hb.w &&
            ball.y + BALL_R > hb.y && ball.y - BALL_R < hb.y + hb.h) {

            const hitter = isAI ? 1 : 0;
            if (ball.lastHitBy === hitter && rallyCount > 0) return false; // can't hit twice

            // Check kitchen rule — can't smash in kitchen
            const inKitchen = isAI
                ? (px < NET_X + KITCHEN_W)
                : (px + PLAYER_W > NET_X - KITCHEN_W);

            // Determine shot type based on timing
            let shotType, power, vy, vx;
            const dir = isAI ? -1 : 1;

            if (swingFrame <= SWING_EARLY) {
                // Lob — high arc
                shotType = 'Lob';
                power = 0.5;
                vx = dir * (2.5 + Math.random() * 0.5);
                vy = -6 - Math.random();
            } else if (swingFrame <= SWING_PERFECT) {
                // Drive — fast flat
                shotType = 'Drive';
                power = 1.0;
                vx = dir * (5 + Math.random() * 1.5);
                vy = -2 - Math.random() * 0.5;
                if (inKitchen) {
                    // Dink instead of drive in kitchen
                    shotType = 'Dink';
                    power = 0.3;
                    vx = dir * (2 + Math.random() * 0.5);
                    vy = -3 - Math.random() * 0.3;
                }
            } else if (swingFrame <= SWING_LATE) {
                // Drop shot
                shotType = 'Drop';
                power = 0.4;
                vx = dir * (2 + Math.random() * 0.3);
                vy = -2.5 - Math.random() * 0.3;
            } else {
                // Late whiff — weak return
                shotType = 'Weak';
                power = 0.2;
                vx = dir * (1.5 + Math.random() * 0.5);
                vy = -1.5;
            }

            // Smash — when ball is high and pressing up (player) or AI decides
            if (!inKitchen && ball.y < NET_TOP - 10) {
                const doSmash = isAI ? (Math.random() < 0.3 + difficulty * 0.15) : keys['ArrowUp'];
                if (doSmash) {
                    shotType = 'Smash!';
                    power = 1.2;
                    vx = dir * (6 + Math.random());
                    vy = 2 + Math.random();
                }
            }

            ball.vx = vx;
            ball.vy = vy;
            ball.spin = (Math.random() - 0.5) * power * 0.5;
            ball.lastHitBy = hitter;
            ball.bounceCount = 0;
            rallyCount++;

            playPaddleHit(power);
            const color = isAI ? '#EF4444' : (playerColor || '#3B82F6');
            spawnHitBurst(ball.x, ball.y, color, 8 + Math.floor(power * 6));
            if (shotType !== 'Weak') {
                spawnScorePopup(ball.x, ball.y - 20, shotType, color);
            }

            return true;
        }
        return false;
    }

    // ── Point Scoring ──
    function awardPoint(toPlayer, msg) {
        if (state !== ST_PLAY && state !== ST_SERVE) return;
        state = ST_POINT;
        ball.active = false;

        // Rally scoring — only server scores (traditional)
        if (toPlayer === 0 && servingPlayer === 0) {
            score++;
            playPointScored();
            playCrowdCheer();
        } else if (toPlayer === 1 && servingPlayer === 1) {
            opponentScore++;
            playFault();
        } else {
            // Side out — switch server
            servingPlayer = toPlayer;
            playFault();
        }

        pointMessage = msg || '';
        pointMessageTimer = 90;

        const msgColor = toPlayer === 0 ? '#22C55E' : '#EF4444';
        spawnScorePopup(GAME_W / 2, GAME_H / 2 - 40, msg, msgColor);

        // Check for game win
        if (score >= WIN_SCORE && score - opponentScore >= 2) {
            games++;
            if (games >= Math.ceil(BEST_OF / 2) + 1) {
                // Match won
                setTimeout(() => endMatch(true), 1500);
                return;
            }
            pointMessage = 'Game!';
            score = 0; opponentScore = 0;
            servingPlayer = 0;
        } else if (opponentScore >= WIN_SCORE && opponentScore - score >= 2) {
            opponentGames++;
            if (opponentGames >= Math.ceil(BEST_OF / 2) + 1) {
                setTimeout(() => endMatch(false), 1500);
                return;
            }
            pointMessage = 'Game!';
            score = 0; opponentScore = 0;
            servingPlayer = 1;
        }
    }

    function endMatch(playerWon) {
        state = ST_GAMEOVER;
        pointMessage = playerWon ? 'You Win!' : 'Game Over';
        pointMessageTimer = 999;
        if (playerWon) playCrowdCheer();
        const finalScore = score + games * WIN_SCORE;
        gameActive = false;
        setTimeout(() => {
            if (gameOverCB) gameOverCB({
                score: finalScore,
                level: games,
                duration: Math.floor((Date.now() - _startTime) / 1000),
            });
        }, 2500);
    }

    // ── AI Logic ──
    function updateAI() {
        if (!ball.active) {
            // Return to center
            const centerY = COURT_Y - PLAYER_H / 2 - 40;
            if (Math.abs(aiY - centerY) > 2) {
                aiY += (centerY - aiY) * 0.03;
            }
            return;
        }

        // React delay based on difficulty
        const baseReact = [40, 22, 8][difficulty] || 22;
        aiReactTimer++;
        if (aiReactTimer < aiReactDelay) return;

        // Predict where ball will be
        let targetY = ball.y;
        if (ball.vx < 0) {
            // Ball going away — return to ready position
            targetY = COURT_Y - PLAYER_H - 30;
        } else {
            // Ball coming — predict landing
            const timeToReach = Math.max(1, (aiX - ball.x) / Math.max(0.5, ball.vx));
            targetY = ball.y + ball.vy * timeToReach + 0.5 * GRAVITY * timeToReach * timeToReach;
            targetY = Math.min(targetY, COURT_Y - PLAYER_H);
            targetY -= PLAYER_H / 2;
        }

        // Movement speed based on difficulty
        const moveSpeed = [1.8, 2.8, 4.0][difficulty] || 2.8;
        const dy = targetY - aiY;
        if (Math.abs(dy) > 3) {
            aiY += Math.sign(dy) * Math.min(Math.abs(dy), moveSpeed);
        }

        // Clamp
        aiY = Math.max(20, Math.min(COURT_Y - PLAYER_H, aiY));

        // AI swing decision
        if (!aiSwinging && ball.active && ball.vx > 0) {
            const hb = getPaddleHitbox(aiX, aiY, -1);
            const dist = Math.sqrt((ball.x - hb.x) ** 2 + (ball.y - (hb.y + hb.h / 2)) ** 2);
            const swingThreshold = [50, 40, 32][difficulty] || 40;
            if (dist < swingThreshold) {
                aiSwinging = true;
                aiSwingFrame = 0;
                // AI picks swing timing based on difficulty
                const r = Math.random();
                if (difficulty >= 2) {
                    // Hard: strategic shots
                    if (ball.y < NET_TOP - 20) aiSwingType = 'smash';
                    else if (r < 0.3) aiSwingType = 'drop';
                    else if (r < 0.6) aiSwingType = 'drive';
                    else aiSwingType = 'lob';
                } else if (difficulty === 1) {
                    aiSwingType = r < 0.5 ? 'drive' : 'lob';
                } else {
                    aiSwingType = 'drive';
                }
            }
        }

        // AI swing execution
        if (aiSwinging) {
            aiSwingFrame++;
            const targetFrame = aiSwingType === 'lob' ? SWING_EARLY - 1
                : aiSwingType === 'drive' ? SWING_PERFECT - 2
                : aiSwingType === 'drop' ? SWING_LATE - 2
                : SWING_PERFECT - 1;
            if (aiSwingFrame >= targetFrame) {
                attemptHit(aiX, aiY, -1, aiSwingFrame, true);
            }
            if (aiSwingFrame >= SWING_DURATION) {
                aiSwinging = false;
                aiSwingFrame = 0;
            }
        }
    }

    // ── Player Input ──
    function updatePlayer() {
        const moveSpeed = 3.5;
        if (keys['ArrowUp'] || keys['w'] || keys['W']) {
            pY -= moveSpeed;
        }
        if (keys['ArrowDown'] || keys['s'] || keys['S']) {
            pY += moveSpeed;
        }

        // Touch Y override
        if (touchY !== null) {
            const targetY = touchY / SCALE - PLAYER_H / 2;
            pY += (targetY - pY) * 0.15;
        }

        // Clamp
        pY = Math.max(20, Math.min(COURT_Y - PLAYER_H, pY));

        // Swing
        if (pSwinging) {
            pSwingFrame++;
            attemptHit(pX, pY, 1, pSwingFrame, false);
            if (pSwingFrame >= SWING_DURATION) {
                pSwinging = false;
                pSwingFrame = 0;
            }
        }
    }

    function startSwing() {
        if (!pSwinging && state === ST_PLAY) {
            pSwinging = true;
            pSwingFrame = 0;
        }
        if (state === ST_SERVE && servingPlayer === 0) {
            state = ST_PLAY;
            serveBall();
        }
    }

    // ── Drawing ──
    function drawCourt() {
        // Sky - use sprite background or gradient fallback
        const bgImg = spr('bgLand');
        if (bgImg) {
            ctx.drawImage(bgImg, 0, 0, GAME_W, GAME_H);
        } else {
            const skyGrad = ctx.createLinearGradient(0, 0, 0, GAME_H);
            skyGrad.addColorStop(0, '#87CEEB');
            skyGrad.addColorStop(0.6, '#B0E0E6');
            skyGrad.addColorStop(1, '#E0F0FF');
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, GAME_W, GAME_H);
        }

        // Crowd silhouettes in background
        drawCrowd();

        // Court surface - tiled stone sprite or gradient fallback
        drawTiledSprite('stoneCenter', 30, COURT_Y, GAME_W - 60, GAME_H - COURT_Y, 48, 48, '#2D8B57');
        // Green tint overlay for court color
        ctx.fillStyle = 'rgba(45,139,87,0.35)';
        ctx.fillRect(30, COURT_Y, GAME_W - 60, GAME_H - COURT_Y);

        // Court outline
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(30, COURT_Y, GAME_W - 60, GAME_H - COURT_Y - 2);

        // Center line (service)
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(NET_X, COURT_Y);
        ctx.lineTo(NET_X, GAME_H);
        ctx.stroke();
        ctx.setLineDash([]);

        // Kitchen zones (no-volley zone)
        ctx.fillStyle = 'rgba(255, 200, 50, 0.15)';
        ctx.fillRect(NET_X - KITCHEN_W, COURT_Y, KITCHEN_W, GAME_H - COURT_Y);
        ctx.fillRect(NET_X, COURT_Y, KITCHEN_W, GAME_H - COURT_Y);

        // Kitchen lines
        ctx.strokeStyle = 'rgba(255, 200, 50, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(NET_X - KITCHEN_W, COURT_Y);
        ctx.lineTo(NET_X - KITCHEN_W, GAME_H - 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(NET_X + KITCHEN_W, COURT_Y);
        ctx.lineTo(NET_X + KITCHEN_W, GAME_H - 2);
        ctx.stroke();

        // Kitchen label
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(255, 200, 50, 0.5)';
        ctx.textAlign = 'center';
        ctx.fillText('KITCHEN', NET_X - KITCHEN_W / 2, GAME_H - 6);
        ctx.fillText('KITCHEN', NET_X + KITCHEN_W / 2, GAME_H - 6);

        // Net
        drawNet();
    }

    function drawCrowd() {
        // Simple crowd silhouettes
        ctx.fillStyle = 'rgba(60, 60, 80, 0.3)';
        const crowdY = COURT_Y - 25;
        for (let i = 0; i < 30; i++) {
            const cx = 20 + i * 20 + Math.sin(i * 1.7) * 5;
            const cy = crowdY - Math.abs(Math.sin(i * 0.8)) * 12;
            const bobble = Math.sin(frameCount * 0.04 + i * 0.5) * 1.5;
            // Head
            ctx.beginPath();
            ctx.arc(cx, cy - 10 + bobble, 5, 0, Math.PI * 2);
            ctx.fill();
            // Body
            ctx.fillRect(cx - 4, cy - 5 + bobble, 8, 12);
        }
    }

    function drawNet() {
        // Net post - use metal sprite or fallback
        const metalImg = spr('metalPlate');
        if (metalImg) {
            ctx.drawImage(metalImg, NET_X - 4, NET_TOP - 4, 8, COURT_Y - NET_TOP + 4);
        } else {
            ctx.fillStyle = '#888';
            ctx.fillRect(NET_X - 2, NET_TOP - 4, 4, COURT_Y - NET_TOP + 4);
        }

        // Net mesh - use fence sprite tiled vertically or fallback
        const fenceImg = spr('fence');
        if (fenceImg) {
            ctx.save();
            ctx.globalAlpha = 0.7;
            const fenceH = 28;
            for (let y = NET_TOP; y < COURT_Y; y += fenceH) {
                const h = Math.min(fenceH, COURT_Y - y);
                ctx.drawImage(fenceImg, NET_X - 10, y, 20, h);
            }
            ctx.globalAlpha = 1;
            ctx.restore();
        } else {
            // Net cord (top)
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(NET_X - 2, NET_TOP);
            ctx.quadraticCurveTo(NET_X, NET_TOP + 3, NET_X + 2, NET_TOP);
            ctx.stroke();

            // Mesh lines
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 0.5;
            for (let y = NET_TOP + 6; y < COURT_Y; y += 8) {
                ctx.beginPath();
                ctx.moveTo(NET_X - 1.5, y);
                ctx.lineTo(NET_X + 1.5, y);
                ctx.stroke();
            }
        }
    }

    function drawPlayer(x, y, facing, swinging, swingFrame, color, isAI) {
        const s = SCALE;
        ctx.save();

        // Body
        const bodyColor = isAI ? '#E74C3C' : (color || '#3B82F6');
        ctx.fillStyle = bodyColor;

        // Torso
        ctx.fillRect(x + 3, y + 12, PLAYER_W - 6, 20);

        // Head
        ctx.fillStyle = isAI ? '#FDB0A0' : '#FDBCB4';
        ctx.beginPath();
        ctx.arc(x + PLAYER_W / 2, y + 8, 8, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#333';
        const eyeDir = facing > 0 ? 2 : -2;
        ctx.beginPath();
        ctx.arc(x + PLAYER_W / 2 + eyeDir, y + 7, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Hat/visor
        ctx.fillStyle = isAI ? '#C0392B' : bodyColor;
        ctx.fillRect(x + PLAYER_W / 2 - 7, y + 1, 14, 4);

        // Legs
        ctx.fillStyle = '#333';
        const legBob = Math.sin(frameCount * 0.15) * 2;
        ctx.fillRect(x + 4, y + 32, 4, 10 + legBob);
        ctx.fillRect(x + PLAYER_W - 8, y + 32, 4, 10 - legBob);

        // Shoes
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 3, y + 41 + legBob, 6, 3);
        ctx.fillRect(x + PLAYER_W - 9, y + 41 - legBob, 6, 3);

        // Arm + paddle
        const armX = facing > 0 ? x + PLAYER_W - 2 : x - 4;
        let armAngle = 0;
        if (swinging) {
            // Swing animation
            const progress = swingFrame / SWING_DURATION;
            armAngle = facing * (-0.8 + progress * 2.5);
        }

        ctx.save();
        ctx.translate(armX + 3, y + 16);
        ctx.rotate(armAngle);

        // Arm
        ctx.fillStyle = isAI ? '#FDB0A0' : '#FDBCB4';
        ctx.fillRect(0, -2, facing * 14, 4);

        // Paddle
        ctx.fillStyle = isAI ? '#8B0000' : '#1E40AF';
        ctx.fillRect(facing * 12, -PADDLE_H / 2, facing * PADDLE_W, PADDLE_H);
        ctx.fillStyle = '#333';
        ctx.fillRect(facing * 10, -2, facing * 4, 4); // grip

        ctx.restore();
        ctx.restore();
    }

    function drawBall() {
        if (!ball.active && state !== ST_SERVE) return;

        // Ball shadow on court
        if (ball.y < COURT_Y) {
            const shadowScale = Math.max(0.3, 1 - (COURT_Y - ball.y) / 200);
            ctx.fillStyle = `rgba(0,0,0,${0.2 * shadowScale})`;
            ctx.beginPath();
            ctx.ellipse(ball.x, COURT_Y + 2, BALL_R * shadowScale * 1.5, BALL_R * shadowScale * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Trail
        for (let i = 0; i < ballTrail.length; i++) {
            const t = ballTrail[i];
            const alpha = t.life / 12 * 0.3;
            ctx.fillStyle = `rgba(200, 220, 50, ${alpha})`;
            ctx.beginPath();
            ctx.arc(t.x, t.y, BALL_R * (t.life / 12) * 0.7, 0, Math.PI * 2);
            ctx.fill();
        }

        // Ball body (wiffle ball — yellow-green)
        ctx.fillStyle = '#CDDC39';
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
        ctx.fill();

        // Wiffle ball holes
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        const holeAngle = frameCount * 0.08;
        for (let i = 0; i < 6; i++) {
            const a = holeAngle + (Math.PI * 2 * i / 6);
            const hx = ball.x + Math.cos(a) * BALL_R * 0.55;
            const hy = ball.y + Math.sin(a) * BALL_R * 0.55;
            ctx.beginPath();
            ctx.arc(hx, hy, 1.2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(ball.x - 1.5, ball.y - 1.5, 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Serve indicator
        if (state === ST_SERVE) {
            const bobble = Math.sin(frameCount * 0.08) * 4;
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            const sx = servingPlayer === 0 ? pX + PLAYER_W + 20 : aiX - 20;
            ctx.fillText('SERVE', sx, ball.y - 15 + bobble);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        for (const s of scorePopups) {
            const alpha = s.life / s.maxLife;
            ctx.globalAlpha = alpha;
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#000';
            ctx.fillText(s.text, s.x + 1, s.y + 1);
            ctx.fillStyle = s.color;
            ctx.fillText(s.text, s.x, s.y);
        }
        ctx.globalAlpha = 1;
    }

    function drawScoreboard() {
        // Scoreboard background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        roundRect(ctx, GAME_W / 2 - 110, 4, 220, 36, 6);
        ctx.fill();

        // Player score
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = playerColor || '#3B82F6';
        ctx.fillText('YOU', GAME_W / 2 - 100, 18);
        ctx.font = 'bold 18px monospace';
        ctx.fillText(String(score), GAME_W / 2 - 100, 35);

        // Games won
        ctx.font = '9px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(`G:${games}`, GAME_W / 2 - 55, 18);

        // Serve indicator
        ctx.fillStyle = '#FFD700';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        if (servingPlayer === 0) ctx.fillText('\u25CF', GAME_W / 2 - 15, 28);
        else ctx.fillText('\u25CF', GAME_W / 2 + 15, 28);

        // Separator
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('-', GAME_W / 2, 32);

        // AI score
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#EF4444';
        ctx.fillText('CPU', GAME_W / 2 + 100, 18);
        ctx.font = 'bold 18px monospace';
        ctx.fillText(String(opponentScore), GAME_W / 2 + 100, 35);

        ctx.font = '9px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(`G:${opponentGames}`, GAME_W / 2 + 55, 18);
    }

    function drawPointMessage() {
        if (pointMessageTimer <= 0) return;
        pointMessageTimer--;
        const alpha = Math.min(1, pointMessageTimer / 30);
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText(pointMessage, GAME_W / 2 + 2, GAME_H / 2 - 20 + 2);
        ctx.fillStyle = '#fff';
        ctx.fillText(pointMessage, GAME_W / 2, GAME_H / 2 - 20);
        ctx.globalAlpha = 1;
    }

    function drawTitleScreen() {
        drawCourt();

        // Overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Title
        titlePulse += 0.04;
        const scale = 1 + Math.sin(titlePulse) * 0.03;
        ctx.save();
        ctx.translate(GAME_W / 2, GAME_H / 2 - 50);
        ctx.scale(scale, scale);

        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText('PICKLEBALL', 2, 2);
        ctx.fillStyle = '#CDDC39';
        ctx.fillText('PICKLEBALL', 0, 0);

        ctx.restore();

        // Subtitle
        ctx.font = '14px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.textAlign = 'center';
        ctx.fillText('Rally scoring to 11 \u2022 Win by 2 \u2022 Best of 3', GAME_W / 2, GAME_H / 2 - 10);

        // Controls
        const blink = Math.sin(frameCount * 0.06) > 0;
        if (blink) {
            ctx.font = 'bold 16px monospace';
            ctx.fillStyle = '#fff';
            ctx.fillText('PRESS SPACE or TAP to Start', GAME_W / 2, GAME_H / 2 + 30);
        }

        ctx.font = '11px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('\u2191\u2193 Move  |  SPACE Swing  |  Timing = Shot Type', GAME_W / 2, GAME_H / 2 + 55);
        ctx.fillText('Early=Lob  Perfect=Drive  Late=Drop  \u2191+Swing=Smash', GAME_W / 2, GAME_H / 2 + 72);

        // Difficulty
        ctx.font = '12px monospace';
        ctx.fillStyle = '#FFD700';
        const diffNames = ['EASY', 'MEDIUM', 'HARD'];
        ctx.fillText(`Difficulty: ${diffNames[difficulty]}`, GAME_W / 2, GAME_H / 2 + 100);
        ctx.font = '10px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('(increases each game)', GAME_W / 2, GAME_H / 2 + 115);
    }

    function drawGameOverScreen() {
        drawCourt();
        drawPlayer(pX, pY, 1, false, 0, playerColor, false);
        drawPlayer(aiX, aiY, -1, false, 0, '#E74C3C', true);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.font = 'bold 32px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText(pointMessage, GAME_W / 2 + 2, GAME_H / 2 - 30 + 2);
        ctx.fillStyle = games > opponentGames ? '#22C55E' : '#EF4444';
        ctx.fillText(pointMessage, GAME_W / 2, GAME_H / 2 - 30);

        ctx.font = '16px monospace';
        ctx.fillStyle = '#fff';
        ctx.fillText(`Games: ${games} - ${opponentGames}`, GAME_W / 2, GAME_H / 2 + 10);

        const totalScore = score + games * WIN_SCORE;
        ctx.font = '14px monospace';
        ctx.fillStyle = '#FFD700';
        ctx.fillText(`Score: ${totalScore}`, GAME_W / 2, GAME_H / 2 + 35);
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    // ── Canvas Scaling ──
    function fitCanvas() {
        if (!canvas) return;
        const parent = canvas.parentElement;
        if (!parent) return;
        DPR = Math.min(window.devicePixelRatio || 1, 3);
        const pw = parent.clientWidth;
        const ph = parent.clientHeight;
        const aspect = GAME_W / GAME_H;
        let w, h;
        if (pw / ph > aspect) {
            h = ph; w = h * aspect;
        } else {
            w = pw; h = w / aspect;
        }
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        canvas.width = Math.round(w * DPR);
        canvas.height = Math.round(h * DPR);
        SCALE = w / GAME_W;
    }

    // ── Input Handlers ──
    function onKeyDown(e) {
        keys[e.key] = true;
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (state === ST_TITLE) {
                startGame();
            } else {
                startSwing();
            }
        }
    }

    function onKeyUp(e) {
        keys[e.key] = false;
    }

    function onTouchStart(e) {
        e.preventDefault();
        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
        const rect = canvas.getBoundingClientRect();
        touchY = t.clientY - rect.top;

        if (state === ST_TITLE) {
            startGame();
        } else {
            startSwing();
        }
    }

    function onTouchMove(e) {
        e.preventDefault();
        const t = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        touchY = t.clientY - rect.top;
    }

    function onTouchEnd(e) {
        e.preventDefault();
        touchY = null;
    }

    function onMouseDown(e) {
        getAudio();
        if (state === ST_TITLE) {
            startGame();
        } else {
            startSwing();
        }
    }

    function onMouseMove(e) {
        if (state === ST_PLAY || state === ST_SERVE) {
            const rect = canvas.getBoundingClientRect();
            const my = (e.clientY - rect.top) / SCALE;
            pY = Math.max(20, Math.min(COURT_Y - PLAYER_H, my - PLAYER_H / 2));
        }
    }

    // ── Game Flow ──
    let _startTime = 0;

    function startGame() {
        _startTime = Date.now();
        state = ST_SERVE;
        score = 0;
        opponentScore = 0;
        games = 0;
        opponentGames = 0;
        difficulty = 0;
        servingPlayer = 0;
        rallyCount = 0;

        pX = 80;
        pY = COURT_Y - PLAYER_H - 20;
        pSwinging = false;
        pSwingFrame = 0;

        aiX = GAME_W - 80 - PLAYER_W;
        aiY = COURT_Y - PLAYER_H - 20;
        aiSwinging = false;
        aiSwingFrame = 0;
        aiReactDelay = 30;
        aiReactTimer = 0;

        particles = [];
        scorePopups = [];
        pointMessageTimer = 0;

        resetBall();
    }

    function startNextPoint() {
        if (state === ST_GAMEOVER) return;
        state = ST_SERVE;
        pX = 80;
        pY = COURT_Y - PLAYER_H - 20;
        aiX = GAME_W - 80 - PLAYER_W;
        aiY = COURT_Y - PLAYER_H - 20;
        pSwinging = false;
        aiSwinging = false;
        aiReactTimer = 0;
        aiReactDelay = [35, 18, 6][difficulty] || 18;
        resetBall();

        // AI serve
        if (servingPlayer === 1) {
            setTimeout(() => {
                if (state === ST_SERVE) {
                    state = ST_PLAY;
                    serveBall();
                }
            }, 800);
        }
    }

    // ── Game Loop ──
    function update() {
        frameCount++;

        if (state === ST_LOADING || state === ST_TITLE) return;

        if (state === ST_POINT) {
            updateParticles();
            if (pointMessageTimer <= 0) {
                // Increase difficulty per game
                difficulty = Math.min(2, games + opponentGames);
                startNextPoint();
            }
            return;
        }

        if (state === ST_GAMEOVER) {
            updateParticles();
            return;
        }

        updatePlayer();
        updateAI();
        updateBall();
        updateParticles();
    }

    function draw() {
        if (state === ST_LOADING) { drawLoadingScreen(); return; }

        ctx.save();
        ctx.scale(canvas.width / GAME_W, canvas.height / GAME_H);

        if (state === ST_TITLE) {
            drawTitleScreen();
            ctx.restore();
            return;
        }

        if (state === ST_GAMEOVER) {
            drawGameOverScreen();
            drawScoreboard();
            ctx.restore();
            return;
        }

        drawCourt();
        drawBall();
        drawPlayer(pX, pY, 1, pSwinging, pSwingFrame, playerColor, false);
        drawPlayer(aiX, aiY, -1, aiSwinging, aiSwingFrame, '#E74C3C', true);
        drawParticles();
        drawScoreboard();
        drawPointMessage();

        // Double bounce rule reminder
        if (state === ST_PLAY && rallyCount === 0 && ball.active) {
            ctx.font = '9px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText('Ball must bounce once on each side', GAME_W / 2, GAME_H - 4);
        }

        ctx.restore();
    }

    function gameLoop(ts) {
        if (!gameActive) return;
        if (!lastTime) lastTime = ts;
        const dt = ts - lastTime;
        lastTime = ts;

        // Fixed timestep ~60fps
        update();
        draw();

        animFrame = requestAnimationFrame(gameLoop);
    }

    // ── Init / Destroy ──
    function drawLoadingScreen() {
        ctx.save();
        ctx.scale(canvas.width / GAME_W, canvas.height / GAME_H);
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, GAME_W, GAME_H);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 28px monospace';
        ctx.fillStyle = '#CDDC39';
        ctx.fillText('PICKLEBALL', GAME_W / 2, GAME_H * 0.35);
        ctx.font = '14px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        const pct = spritesTotal > 0 ? Math.floor((spritesLoaded / spritesTotal) * 100) : 0;
        ctx.fillText(`Loading sprites... ${pct}%`, GAME_W / 2, GAME_H * 0.48);
        const barW = 200, barH = 6;
        const barX = (GAME_W - barW) / 2, barY = GAME_H * 0.55;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#CDDC39';
        ctx.fillRect(barX, barY, barW * (spritesLoaded / Math.max(1, spritesTotal)), barH);
        ctx.restore();
    }

    function init(cvs, playerData, onGameOver) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = playerData;
        gameOverCB = onGameOver;
        gameActive = true;
        playerColor = playerData?.color || '#3B82F6';
        const playerTheme = playerData?.theme || 'retro';

        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(playerTheme) : null;
        if (_t) playerColor = _t.colors[0] || playerColor;

        state = ST_LOADING;
        frameCount = 0;
        lastTime = 0;
        keys = {};
        titlePulse = 0;
        particles = [];
        scorePopups = [];
        score = 0;
        opponentScore = 0;
        games = 0;
        opponentGames = 0;
        difficulty = 0;
        servingPlayer = 0;
        ball = { x: 0, y: 0, vx: 0, vy: 0, spin: 0, active: false, lastHitBy: -1, bounceCount: 0, bouncedOnPlayerSide: false, bouncedOnOpponentSide: false };
        ballTrail = [];
        pointMessageTimer = 0;
        pointMessage = '';
        crowdWave = 0;

        pX = 80;
        pY = COURT_Y - PLAYER_H - 20;
        pSwinging = false;
        pSwingFrame = 0;

        aiX = GAME_W - 80 - PLAYER_W;
        aiY = COURT_Y - PLAYER_H - 20;
        aiSwinging = false;
        aiSwingFrame = 0;
        aiReactDelay = 30;
        aiReactTimer = 0;

        DPR = Math.min(window.devicePixelRatio || 1, 3);

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: false });
        window.addEventListener('resize', fitCanvas);

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        // Preload sprites then show title
        preloadSprites(() => {
            state = ST_TITLE;
        });

        animFrame = requestAnimationFrame(gameLoop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        if (canvas) {
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        }
        window.removeEventListener('resize', fitCanvas);
    }

    return {
        init,
        destroy,
        getScore() { return score + games * WIN_SCORE; },
        getLevel() { return games; },
        isActive() { return gameActive; }
    };
})();
