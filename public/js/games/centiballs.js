/* CentiBalls — Centipede meets Billiards
   A chain of billiard balls snakes down the screen like a centipede.
   You aim and shoot a cue ball from the bottom to knock segments loose.
   Loose balls roll toward pockets (corners + sides). Match colors to
   break the chain faster. Clear all segments to win the level. */
window.CentiBalls = (() => {
    // ── Constants ──
    const BALL_R = 14;
    const CUE_R = 14;
    const POCKET_R = 22;
    const FRICTION = 0.992;
    const WALL_COR = 0.7;
    const BALL_COR = 0.92;
    const MAX_POWER = 22;
    const SPEED_THRESH = 0.08;
    const CHAIN_SPEED = 1.2;
    const COLORS = ['#FBBF24','#3B82F6','#EF4444','#22C55E','#7C3AED','#F97316'];
    const COLOR_NAMES = ['gold','blue','red','green','purple','orange'];

    // Game states
    const ST_TITLE = 0, ST_AIMING = 1, ST_ROLLING = 2, ST_LEVEL_CLEAR = 3, ST_GAME_OVER = 4;

    let canvas, ctx, W, H, animId;
    let state, level, score, lives, chain, looseBalls, pockets, cue;
    let aimAngle, aimPower, dragging, dragStart;
    let particles, comboCount, comboTimer;
    let gameOverCb;
    let highScore = parseInt(localStorage.getItem('centiballs_hi') || '0');

    // ── Chain path (snake pattern) ──
    function buildPath() {
        const pts = [];
        const rowH = BALL_R * 2.8;
        const rows = Math.ceil(H * 0.65 / rowH);
        const margin = BALL_R * 3;
        const step = BALL_R * 0.8; // bigger steps = faster traversal
        for (let r = 0; r < rows; r++) {
            const y = margin + r * rowH;
            if (r % 2 === 0) {
                for (let x = margin; x <= W - margin; x += step) pts.push({x, y});
            } else {
                for (let x = W - margin; x >= margin; x -= step) pts.push({x, y});
            }
        }
        return pts;
    }

    // ── Pockets (6 pool-table style) ──
    function makePockets() {
        return [
            {x: POCKET_R, y: POCKET_R},
            {x: W/2, y: POCKET_R * 0.7},
            {x: W - POCKET_R, y: POCKET_R},
            {x: POCKET_R, y: H - POCKET_R},
            {x: W/2, y: H - POCKET_R * 0.7},
            {x: W - POCKET_R, y: H - POCKET_R},
        ];
    }

    // ── Build chain for a level ──
    function buildChain(lvl) {
        const path = buildPath();
        const count = Math.min(20 + lvl * 8, 60);
        const numColors = Math.min(3 + Math.floor(lvl / 2), COLORS.length);
        const segments = [];
        const spacing = BALL_R * 2.6 / (BALL_R * 0.8); // path indices between balls
        for (let i = 0; i < count; i++) {
            const ci = Math.floor(Math.random() * numColors);
            segments.push({
                color: ci,
                pathIdx: 0,
                x: -50,
                y: path[0] ? path[0].y : 40,
                vx: 0, vy: 0,
                alive: true,
                inChain: true,
                flash: 0,
            });
        }
        // Start with most of the chain already visible on the path
        const startIdx = count * spacing * 0.8;
        return { segments, path, headIdx: startIdx, spacing, speed: CHAIN_SPEED + lvl * 0.12 };
    }

    // ── Advance chain along path ──
    function advanceChain(dt) {
        if (!chain || !chain.segments.length) return;
        const segs = chain.segments.filter(s => s.alive && s.inChain);
        if (segs.length === 0) return;

        chain.headIdx += chain.speed * dt;
        const path = chain.path;
        for (let i = 0; i < segs.length; i++) {
            const pidx = chain.headIdx - i * chain.spacing;
            if (pidx < 0) {
                segs[i].x = -50;
                segs[i].y = path[0] ? path[0].y : 40;
                continue;
            }
            const pi = Math.floor(pidx);
            const frac = pidx - pi;
            if (pi >= path.length - 1) {
                // Chain reached end — game over
                state = ST_GAME_OVER;
                return;
            }
            const a = path[Math.min(pi, path.length - 1)];
            const b = path[Math.min(pi + 1, path.length - 1)];
            segs[i].x = a.x + (b.x - a.x) * frac;
            segs[i].y = a.y + (b.y - a.y) * frac;
        }
    }

    // ── Collision detection ──
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

    function collideBalls(a, b) {
        const d = dist(a, b);
        const minD = BALL_R * 2;
        if (d >= minD || d < 0.01) return false;
        // Elastic collision
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        const dvx = a.vx - b.vx;
        const dvy = a.vy - b.vy;
        const dvn = dvx * nx + dvy * ny;
        if (dvn <= 0) return false;
        const j = dvn * BALL_COR;
        a.vx -= j * nx; a.vy -= j * ny;
        b.vx += j * nx; b.vy += j * ny;
        // Separate
        const overlap = minD - d;
        a.x -= overlap * 0.5 * nx; a.y -= overlap * 0.5 * ny;
        b.x += overlap * 0.5 * nx; b.y += overlap * 0.5 * ny;
        return true;
    }

    // ── Check chain for color matches (3+) ──
    function checkMatches(hitSeg) {
        if (!hitSeg || !hitSeg.inChain) return;
        const segs = chain.segments.filter(s => s.alive && s.inChain);
        const idx = segs.indexOf(hitSeg);
        if (idx < 0) return;
        // Find contiguous same-color run
        let lo = idx, hi = idx;
        while (lo > 0 && segs[lo-1].color === hitSeg.color) lo--;
        while (hi < segs.length - 1 && segs[hi+1].color === hitSeg.color) hi++;
        const run = hi - lo + 1;
        if (run >= 3) {
            comboCount++;
            const pts = run * 10 * comboCount;
            score += pts;
            for (let i = lo; i <= hi; i++) {
                segs[i].alive = false;
                segs[i].inChain = false;
                // Spawn particles
                for (let p = 0; p < 6; p++) {
                    const angle = Math.random() * Math.PI * 2;
                    const spd = 1 + Math.random() * 3;
                    particles.push({
                        x: segs[i].x, y: segs[i].y,
                        vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
                        color: COLORS[segs[i].color],
                        life: 1, decay: 0.02 + Math.random() * 0.02,
                        r: 3 + Math.random() * 4,
                    });
                }
            }
            comboTimer = 60;
        } else {
            comboCount = 0;
        }
    }

    // ── Shoot cue ball ──
    function shootCue() {
        if (state !== ST_AIMING || !cue) return;
        cue.vx = Math.cos(aimAngle) * aimPower;
        cue.vy = Math.sin(aimAngle) * aimPower;
        state = ST_ROLLING;
    }

    // ── Reset cue ──
    function resetCue() {
        cue = { x: W / 2, y: H - BALL_R * 3, vx: 0, vy: 0, active: true };
        state = ST_AIMING;
        aimAngle = -Math.PI / 2;
        aimPower = 8;
        dragging = false;
    }

    // ── Init level ──
    function initLevel(lvl) {
        level = lvl;
        chain = buildChain(lvl);
        looseBalls = [];
        particles = [];
        pockets = makePockets();
        comboCount = 0;
        comboTimer = 0;
        resetCue();
    }

    // ── Physics update ──
    function updatePhysics() {
        // Move cue with sub-stepping to prevent tunneling
        if (cue && cue.active && state === ST_ROLLING) {
            const speed = Math.hypot(cue.vx, cue.vy);
            const steps = Math.max(1, Math.ceil(speed / BALL_R));
            const svx = cue.vx / steps;
            const svy = cue.vy / steps;
            for (let step = 0; step < steps; step++) {
                cue.x += svx; cue.y += svy;
                // Wall bounce
                if (cue.x < BALL_R) { cue.x = BALL_R; cue.vx *= -WALL_COR; }
                if (cue.x > W - BALL_R) { cue.x = W - BALL_R; cue.vx *= -WALL_COR; }
                if (cue.y < BALL_R) { cue.y = BALL_R; cue.vy *= -WALL_COR; }
                if (cue.y > H - BALL_R) { cue.y = H - BALL_R; cue.vy *= -WALL_COR; }

                // Collide cue with chain segments
                const segs = chain.segments.filter(s => s.alive && s.inChain);
                for (const seg of segs) {
                    if (dist(cue, seg) < BALL_R * 2) {
                    // Knock segment out of chain
                    seg.inChain = false;
                    seg.vx = (seg.x - cue.x) * 0.3;
                    seg.vy = (seg.y - cue.y) * 0.3;
                    cue.vx *= 0.5; cue.vy *= 0.5;
                    looseBalls.push(seg);
                    // Check matches around the hit point
                    checkMatches(seg);
                    // Spawn hit flash
                    for (let p = 0; p < 4; p++) {
                        particles.push({
                            x: seg.x, y: seg.y,
                            vx: (Math.random()-0.5)*4, vy: (Math.random()-0.5)*4,
                            color: '#fff', life: 1, decay: 0.05, r: 3,
                        });
                    }
                }
            }
            } // end sub-step loop
            cue.vx *= FRICTION; cue.vy *= FRICTION;

            // Cue stops
            if (Math.abs(cue.vx) < SPEED_THRESH && Math.abs(cue.vy) < SPEED_THRESH) {
                // Check if loose balls have also stopped
                const allStopped = looseBalls.every(b =>
                    Math.abs(b.vx) < SPEED_THRESH && Math.abs(b.vy) < SPEED_THRESH
                );
                if (allStopped) resetCue();
            }
        }

        // Move loose balls
        for (let i = looseBalls.length - 1; i >= 0; i--) {
            const b = looseBalls[i];
            if (!b.alive) { looseBalls.splice(i, 1); continue; }
            b.x += b.vx; b.y += b.vy;
            b.vx *= FRICTION; b.vy *= FRICTION;
            // Wall bounce
            if (b.x < BALL_R) { b.x = BALL_R; b.vx *= -WALL_COR; }
            if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx *= -WALL_COR; }
            if (b.y < BALL_R) { b.y = BALL_R; b.vy *= -WALL_COR; }
            if (b.y > H - BALL_R) { b.y = H - BALL_R; b.vy *= -WALL_COR; }

            // Check pockets
            for (const p of pockets) {
                if (dist(b, p) < POCKET_R) {
                    b.alive = false;
                    score += 25;
                    for (let pp = 0; pp < 8; pp++) {
                        particles.push({
                            x: p.x, y: p.y,
                            vx: (Math.random()-0.5)*5, vy: (Math.random()-0.5)*5,
                            color: COLORS[b.color], life: 1, decay: 0.03, r: 4,
                        });
                    }
                    break;
                }
            }

            // Collide loose balls with each other
            for (let j = i - 1; j >= 0; j--) {
                if (looseBalls[j] && looseBalls[j].alive) collideBalls(b, looseBalls[j]);
            }
            // Collide with cue
            if (cue && cue.active) collideBalls(b, cue);
        }

        // Cue in pocket = lose a shot (reset cue)
        if (cue && cue.active && state === ST_ROLLING) {
            for (const p of pockets) {
                if (dist(cue, p) < POCKET_R) {
                    lives--;
                    if (lives <= 0) { state = ST_GAME_OVER; return; }
                    resetCue();
                    break;
                }
            }
        }

        // Advance chain
        if (state !== ST_GAME_OVER && state !== ST_TITLE && state !== ST_LEVEL_CLEAR) {
            advanceChain(1);
        }

        // Check level clear
        const alive = chain.segments.filter(s => s.alive);
        if (alive.length === 0 && state !== ST_LEVEL_CLEAR && state !== ST_TITLE) {
            state = ST_LEVEL_CLEAR;
            comboTimer = 120;
        }

        // Particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy;
            p.vy += 0.05;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }

        if (comboTimer > 0) comboTimer--;
    }

    // ── Drawing ──
    function drawTable() {
        // Dark green felt background
        const grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.7);
        grad.addColorStop(0, '#1a5c30');
        grad.addColorStop(1, '#0f3d1e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Felt texture dots
        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        for (let i = 0; i < 200; i++) {
            const fx = (i * 137.5) % W;
            const fy = (i * 97.3) % H;
            ctx.fillRect(fx, fy, 1, 1);
        }

        // Rail edges
        ctx.strokeStyle = '#5a3a1e';
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, W - 4, H - 4);
        ctx.strokeStyle = '#8B5E3C';
        ctx.lineWidth = 2;
        ctx.strokeRect(5, 5, W - 10, H - 10);
    }

    function drawPockets() {
        for (const p of pockets) {
            // Pocket shadow
            ctx.beginPath();
            ctx.arc(p.x, p.y, POCKET_R + 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fill();
            // Pocket hole
            ctx.beginPath();
            ctx.arc(p.x, p.y, POCKET_R, 0, Math.PI * 2);
            ctx.fillStyle = '#111';
            ctx.fill();
            // Rim
            ctx.strokeStyle = '#5a3a1e';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    function drawBall(x, y, colorIdx, r, glow) {
        const color = COLORS[colorIdx] || '#fff';
        if (glow) {
            ctx.save();
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
        }
        // Ball body
        ctx.beginPath();
        ctx.arc(x, y, r || BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
        // Highlight
        ctx.beginPath();
        ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();
        if (glow) ctx.restore();
    }

    function drawCueBall() {
        if (!cue || !cue.active) return;
        ctx.save();
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(cue.x, cue.y, CUE_R, 0, Math.PI * 2);
        ctx.fillStyle = '#F5F5F0';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
        // Highlight
        ctx.beginPath();
        ctx.arc(cue.x - CUE_R * 0.25, cue.y - CUE_R * 0.3, CUE_R * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fill();
        ctx.restore();
    }

    function drawAimLine() {
        if (state !== ST_AIMING || !cue) return;
        const len = 40 + aimPower * 8;
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cue.x, cue.y);
        ctx.lineTo(cue.x + Math.cos(aimAngle) * len, cue.y + Math.sin(aimAngle) * len);
        ctx.stroke();
        ctx.setLineDash([]);
        // Power indicator
        const pw = aimPower / MAX_POWER;
        ctx.fillStyle = `hsl(${120 - pw * 120}, 80%, 50%)`;
        ctx.fillRect(W - 30, H - 10 - pw * 80, 15, pw * 80);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(W - 30, H - 90, 15, 80);
        ctx.restore();
    }

    function drawChain() {
        if (!chain) return;
        const segs = chain.segments.filter(s => s.alive && s.inChain);
        // Draw connecting spine
        if (segs.length > 1) {
            ctx.beginPath();
            ctx.moveTo(segs[0].x, segs[0].y);
            for (let i = 1; i < segs.length; i++) {
                ctx.lineTo(segs[i].x, segs[i].y);
            }
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = BALL_R * 1.5;
            ctx.lineCap = 'round';
            ctx.stroke();
        }
        // Draw balls
        for (const seg of segs) {
            if (seg.x > -BALL_R) drawBall(seg.x, seg.y, seg.color, BALL_R, false);
        }
        // Head indicator (eyes)
        if (segs.length > 0 && segs[0].x > 0) {
            const h = segs[0];
            // Direction for eyes
            const nx = segs.length > 1 ? segs[0].x - segs[1].x : 1;
            const ny = segs.length > 1 ? segs[0].y - segs[1].y : 0;
            const nl = Math.hypot(nx, ny) || 1;
            const dx = nx / nl, dy = ny / nl;
            // Eyes
            const ex1x = h.x + dx * 4 + dy * 4;
            const ex1y = h.y + dy * 4 - dx * 4;
            const ex2x = h.x + dx * 4 - dy * 4;
            const ex2y = h.y + dy * 4 + dx * 4;
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(ex1x, ex1y, 3.5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(ex2x, ex2y, 3.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#111';
            ctx.beginPath(); ctx.arc(ex1x + dx * 1.5, ex1y + dy * 1.5, 2, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(ex2x + dx * 1.5, ex2y + dy * 1.5, 2, 0, Math.PI * 2); ctx.fill();
        }
    }

    function drawLoose() {
        for (const b of looseBalls) {
            if (b.alive) drawBall(b.x, b.y, b.color, BALL_R, true);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawHUD() {
        ctx.fillStyle = '#F0E6D2';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`SCORE: ${score}`, 10, 20);
        ctx.textAlign = 'center';
        ctx.fillText(`LEVEL ${level}`, W / 2, 20);
        ctx.textAlign = 'right';
        // Lives as cue balls
        for (let i = 0; i < lives; i++) {
            ctx.beginPath();
            ctx.arc(W - 15 - i * 20, 15, 7, 0, Math.PI * 2);
            ctx.fillStyle = '#F5F5F0';
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        // Combo text
        if (comboCount > 1 && comboTimer > 0) {
            ctx.textAlign = 'center';
            ctx.font = `bold ${20 + comboCount * 2}px monospace`;
            ctx.fillStyle = '#FBBF24';
            ctx.shadowColor = '#FBBF24';
            ctx.shadowBlur = 10;
            ctx.fillText(`${comboCount}x COMBO!`, W / 2, H / 2 - 20);
            ctx.shadowBlur = 0;
        }
        // Chain remaining
        const remaining = chain ? chain.segments.filter(s => s.alive).length : 0;
        ctx.textAlign = 'left';
        ctx.font = '12px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(`${remaining} balls left`, 10, H - 8);
    }

    function drawTitle() {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FBBF24';
        ctx.font = 'bold 36px monospace';
        ctx.shadowColor = '#FBBF24';
        ctx.shadowBlur = 15;
        ctx.fillText('CENTIBALLS', W / 2, H * 0.25);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.font = '16px monospace';
        ctx.fillText('Centipede meets Billiards!', W / 2, H * 0.33);
        ctx.font = '13px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        const lines = [
            'A chain of billiard balls snakes across the table.',
            'Shoot the cue ball to knock segments loose!',
            'Loose balls roll toward pockets for points.',
            'Hit 3+ same-color in a row for combo bonus.',
            'Clear all segments to advance.',
            '',
            'Drag to aim & set power, release to shoot.',
        ];
        lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.42 + i * 20));
        // Animate demo balls
        const t = Date.now() * 0.002;
        for (let i = 0; i < 8; i++) {
            const x = W * 0.2 + i * BALL_R * 2.5 + Math.sin(t + i * 0.5) * 5;
            const y = H * 0.78 + Math.cos(t + i * 0.7) * 8;
            drawBall(x, y, i % COLORS.length, BALL_R, false);
        }
        ctx.fillStyle = '#22C55E';
        ctx.font = 'bold 18px monospace';
        ctx.fillText('TAP TO START', W / 2, H * 0.9);
        if (highScore > 0) {
            ctx.fillStyle = '#F59E0B';
            ctx.font = '14px monospace';
            ctx.fillText(`HIGH SCORE: ${highScore}`, W / 2, H * 0.95);
        }
    }

    function drawLevelClear() {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#22C55E';
        ctx.font = 'bold 32px monospace';
        ctx.shadowColor = '#22C55E';
        ctx.shadowBlur = 15;
        ctx.fillText('LEVEL CLEAR!', W / 2, H * 0.4);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.font = '18px monospace';
        ctx.fillText(`Score: ${score}`, W / 2, H * 0.5);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '14px monospace';
        ctx.fillText('Tap for next level', W / 2, H * 0.6);
    }

    function drawGameOver() {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#EF4444';
        ctx.font = 'bold 32px monospace';
        ctx.shadowColor = '#EF4444';
        ctx.shadowBlur = 15;
        ctx.fillText('GAME OVER', W / 2, H * 0.35);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.font = '20px monospace';
        ctx.fillText(`Final Score: ${score}`, W / 2, H * 0.47);
        ctx.fillText(`Level: ${level}`, W / 2, H * 0.54);
        if (score >= highScore && score > 0) {
            ctx.fillStyle = '#FBBF24';
            ctx.font = 'bold 16px monospace';
            ctx.fillText('NEW HIGH SCORE!', W / 2, H * 0.63);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '14px monospace';
        ctx.fillText('Tap to play again', W / 2, H * 0.73);
    }

    // ── Main loop ──
    function frame() {
        ctx.clearRect(0, 0, W, H);
        drawTable();
        drawPockets();

        if (state === ST_TITLE) {
            drawTitle();
        } else if (state === ST_LEVEL_CLEAR) {
            drawChain(); drawLoose(); drawCueBall(); drawParticles(); drawHUD();
            drawLevelClear();
            if (comboTimer <= 0) {
                // Auto-advance after display
            }
        } else if (state === ST_GAME_OVER) {
            drawChain(); drawLoose(); drawCueBall(); drawParticles(); drawHUD();
            drawGameOver();
        } else {
            updatePhysics();
            drawChain();
            drawLoose();
            drawCueBall();
            drawAimLine();
            drawParticles();
            drawHUD();
        }

        animId = requestAnimationFrame(frame);
    }

    // ── Input ──
    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = W / rect.width;
        const scaleY = H / rect.height;
        const t = e.touches ? e.touches[0] || e.changedTouches[0] : e;
        return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }

    function onDown(e) {
        e.preventDefault();
        const pos = getPos(e);

        if (state === ST_TITLE) {
            state = ST_AIMING;
            score = 0; lives = 5; level = 1;
            initLevel(1);
            return;
        }
        if (state === ST_GAME_OVER) {
            if (score > highScore) {
                highScore = score;
                localStorage.setItem('centiballs_hi', String(highScore));
            }
            if (gameOverCb) gameOverCb(score);
            state = ST_TITLE;
            return;
        }
        if (state === ST_LEVEL_CLEAR) {
            level++;
            initLevel(level);
            return;
        }
        if (state === ST_AIMING && cue) {
            // If clicking above cue ball, quick-shoot directly at click point
            if (pos.y < cue.y - BALL_R * 3) {
                const dx = pos.x - cue.x;
                const dy = pos.y - cue.y;
                aimAngle = Math.atan2(dy, dx);
                aimPower = MAX_POWER;
                shootCue();
                return;
            }
            dragging = true;
            dragStart = pos;
        }
    }

    function onMove(e) {
        e.preventDefault();
        if (!dragging || state !== ST_AIMING || !cue) return;
        const pos = getPos(e);
        const dx = pos.x - cue.x;
        const dy = pos.y - cue.y;
        aimAngle = Math.atan2(dy, dx);
        // Power from drag distance
        const dd = Math.hypot(pos.x - dragStart.x, pos.y - dragStart.y);
        aimPower = Math.min(MAX_POWER, Math.max(4, dd * 0.5));
    }

    function onUp(e) {
        e.preventDefault();
        if (dragging && state === ST_AIMING) {
            dragging = false;
            shootCue();
        }
    }

    // ── Public API ──
    function init(canvasEl, player, gameOverCallback) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        W = canvas.width;
        H = canvas.height;
        gameOverCb = gameOverCallback;
        state = ST_TITLE;
        score = 0; lives = 5; level = 1;
        chain = buildChain(1); // For title screen demo
        looseBalls = []; particles = [];
        pockets = makePockets();
        comboCount = 0; comboTimer = 0;
        highScore = parseInt(localStorage.getItem('centiballs_hi') || '0');

        canvas.addEventListener('mousedown', onDown);
        canvas.addEventListener('mousemove', onMove);
        canvas.addEventListener('mouseup', onUp);
        canvas.addEventListener('touchstart', onDown, { passive: false });
        canvas.addEventListener('touchmove', onMove, { passive: false });
        canvas.addEventListener('touchend', onUp, { passive: false });

        frame();
    }

    function cleanup() {
        if (animId) cancelAnimationFrame(animId);
        if (canvas) {
            canvas.removeEventListener('mousedown', onDown);
            canvas.removeEventListener('mousemove', onMove);
            canvas.removeEventListener('mouseup', onUp);
            canvas.removeEventListener('touchstart', onDown);
            canvas.removeEventListener('touchmove', onMove);
            canvas.removeEventListener('touchend', onUp);
        }
    }

    return { init, cleanup, destroy: cleanup };
})();
