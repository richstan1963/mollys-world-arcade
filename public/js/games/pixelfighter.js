/* PixelFighter — 2D Fighting Game for Your World Arcade
 * Self-contained, no dependencies, canvas-rendered
 * IIFE pattern with init(canvas, player, onGameOver) and destroy() */
window.PixelFighter = (() => {

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
    //  CONSTANTS
    // ══════════════════════════════════════════════════════════
    const GAME_W = 640, GAME_H = 400;
    const GROUND_Y = 340;
    const GRAVITY = 0.65;
    const MAX_HP = 100;
    const ROUNDS_TO_WIN = 2;
    const ROUND_START_DELAY = 2000;
    const KO_SLOWMO_FRAMES = 60;
    const SPECIAL_CHARGE_MAX = 100;

    // Fighter dimensions
    const BODY_W = 24, BODY_H = 36;
    const HEAD_R = 14;
    const ARM_LEN = 22, LEG_LEN = 22;
    const PUNCH_RANGE = 50, KICK_RANGE = 58;
    const PUNCH_DMG = 8, KICK_DMG = 12, SPECIAL_DMG = 30;

    // ══════════════════════════════════════════════════════════
    //  THEME COLORS (overridden by player theme)
    // ══════════════════════════════════════════════════════════
    let PLAYER_CLR = '#3B82F6';
    let PLAYER_CLR2 = '#60A5FA';
    let AI_CLR = '#EF4444';
    let AI_CLR2 = '#F87171';
    let BG_TOP = '#0a0a1a';
    let BG_BOT = '#1a1a2e';
    let ACCENT_CLR = '#F59E0B';
    let UI_CLR = '#ffffff';

    // ══════════════════════════════════════════════════════════
    //  GAME STATES
    // ══════════════════════════════════════════════════════════
    const ST_TITLE     = 0;
    const ST_ROUND_START = 1;
    const ST_FIGHTING  = 2;
    const ST_KO        = 3;
    const ST_ROUND_END = 4;
    const ST_GAME_OVER = 5;

    // ══════════════════════════════════════════════════════════
    //  MODULE STATE
    // ══════════════════════════════════════════════════════════
    let canvas, ctx;
    let state, animFrame = null, audioCtx = null;
    let player = null, onGameOver = null;
    let gameActive = false;

    // Round tracking
    let round, playerWins, aiWins, score, bestScore;
    let stateTimer;

    // Fighters
    let p1, p2; // { x, y, vx, vy, hp, facing, state, stateTime, special, ... }

    // Stage
    let stageIndex;
    let bgStars = [];

    // Effects
    let particles = [];
    let shakeTimer = 0, shakeX = 0, shakeY = 0;
    let slowMoFrames = 0;
    let flashAlpha = 0;
    let impactStars = [];
    let specialActive = false;

    // Input
    let keys = {};
    let touchBtns = {};
    let touchActive = false;

    // Animation
    let frameCount = 0;
    let startTime = 0;

    // ══════════════════════════════════════════════════════════
    //  AUDIO
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
            o.connect(g);
            g.connect(ac.destination);
            o.start(t);
            o.stop(t + (dur || 0.1));
        } catch { /* swallow */ }
    }

    function noise(dur, vol) {
        const ac = ensureAudio();
        if (!ac) return;
        try {
            const bufSize = ac.sampleRate * dur;
            const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
            const src = ac.createBufferSource();
            src.buffer = buf;
            const g = ac.createGain();
            g.gain.setValueAtTime(vol || 0.08, ac.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
            const filt = ac.createBiquadFilter();
            filt.type = 'lowpass';
            filt.frequency.value = 800;
            src.connect(filt);
            filt.connect(g);
            g.connect(ac.destination);
            src.start();
        } catch { /* swallow */ }
    }

    function playPunch()  { tone(200, 0.08, 'sawtooth', 0.12); noise(0.06, 0.10); }
    function playKick()   { tone(150, 0.10, 'sawtooth', 0.14); noise(0.08, 0.12); }
    function playBlock()  { tone(800, 0.05, 'square', 0.08); tone(600, 0.05, 'square', 0.06); }
    function playHit()    { tone(120, 0.12, 'sawtooth', 0.15); noise(0.10, 0.14); }
    function playKO() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        tone(200, 0.4, 'sine', 0.15, t);
        tone(150, 0.5, 'sine', 0.12, t + 0.2);
        tone(100, 0.8, 'sine', 0.10, t + 0.5);
        noise(0.3, 0.08);
    }
    function playGong() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        tone(220, 1.5, 'sine', 0.12, t);
        tone(330, 1.2, 'sine', 0.08, t);
        tone(440, 0.8, 'sine', 0.06, t);
    }
    function playFight() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        tone(440, 0.15, 'square', 0.12, t);
        tone(660, 0.15, 'square', 0.12, t + 0.12);
        tone(880, 0.25, 'square', 0.14, t + 0.24);
    }
    function playSpecial() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        for (let i = 0; i < 8; i++) {
            tone(300 + i * 100, 0.15, 'sawtooth', 0.10 - i * 0.01, t + i * 0.06);
        }
        noise(0.5, 0.10);
    }
    function playCrowd() {
        const ac = ensureAudio(); if (!ac) return;
        for (let i = 0; i < 5; i++) {
            noise(0.3 + Math.random() * 0.3, 0.03);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  PARTICLES
    // ══════════════════════════════════════════════════════════
    function spawnBurst(x, y, count, color, spread) {
        spread = spread || 5;
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = Math.random() * spread + 1;
            particles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s - 1,
                life: 1.0,
                decay: Math.random() * 0.03 + 0.015,
                r: Math.random() * 3 + 1,
                color: color || '#FFF',
                type: Math.random() > 0.5 ? 'spark' : 'circle'
            });
        }
    }

    function spawnImpactStar(x, y) {
        impactStars.push({
            x, y,
            life: 1.0,
            size: Math.random() * 15 + 10
        });
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08;
            p.vx *= 0.97;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = impactStars.length - 1; i >= 0; i--) {
            impactStars[i].life -= 0.05;
            if (impactStars[i].life <= 0) impactStars.splice(i, 1);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = p.life * 0.85;
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 6;
            if (p.type === 'spark') {
                ctx.save();
                const angle = Math.atan2(p.vy, p.vx);
                ctx.translate(p.x, p.y);
                ctx.rotate(angle);
                ctx.fillRect(-p.r * 2 * p.life, -0.5, p.r * 4 * p.life, 1);
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        // Impact stars
        for (const s of impactStars) {
            ctx.globalAlpha = s.life;
            ctx.strokeStyle = '#FFF';
            ctx.lineWidth = 2;
            const sz = s.size * (1 - s.life * 0.3);
            drawStar(s.x, s.y, 4, sz, sz * 0.3);
            ctx.globalAlpha = 1;
        }
    }

    function drawStar(cx, cy, spikes, outerR, innerR) {
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
            const r = i % 2 === 0 ? outerR : innerR;
            const a = (i * Math.PI / spikes) - Math.PI / 2;
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
    }

    // ══════════════════════════════════════════════════════════
    //  SCREEN SHAKE
    // ══════════════════════════════════════════════════════════
    function startShake(intensity, duration) {
        shakeTimer = duration || 8;
        shakeX = 0; shakeY = 0;
    }

    function updateShake() {
        if (shakeTimer > 0) {
            const mag = shakeTimer * 0.8;
            shakeX = (Math.random() - 0.5) * mag * 2;
            shakeY = (Math.random() - 0.5) * mag * 2;
            shakeTimer--;
        } else {
            shakeX = 0;
            shakeY = 0;
        }
    }

    // ══════════════════════════════════════════════════════════
    //  STAGE BACKGROUNDS
    // ══════════════════════════════════════════════════════════
    function drawStage() {
        const stage = stageIndex % 3;

        if (stage === 0) {
            // Dojo
            const grd = ctx.createLinearGradient(0, 0, 0, GAME_H);
            grd.addColorStop(0, '#2D1B0E');
            grd.addColorStop(1, '#1A0F06');
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, GAME_W, GAME_H);

            // Wooden floor
            ctx.fillStyle = '#5C3A1E';
            ctx.fillRect(0, GROUND_Y, GAME_W, GAME_H - GROUND_Y);
            // Floor planks
            ctx.strokeStyle = '#4A2E16';
            ctx.lineWidth = 1;
            for (let x = 0; x < GAME_W; x += 80) {
                ctx.beginPath();
                ctx.moveTo(x, GROUND_Y);
                ctx.lineTo(x, GAME_H);
                ctx.stroke();
            }
            // Paper wall panels
            ctx.fillStyle = 'rgba(255, 248, 230, 0.08)';
            for (let i = 0; i < 5; i++) {
                ctx.fillRect(40 + i * 120, 30, 100, 200);
            }
            // Shoji grid lines
            ctx.strokeStyle = 'rgba(139, 90, 43, 0.4)';
            ctx.lineWidth = 1;
            for (let i = 0; i < 5; i++) {
                const bx = 40 + i * 120;
                ctx.strokeRect(bx, 30, 100, 200);
                ctx.beginPath();
                ctx.moveTo(bx + 50, 30); ctx.lineTo(bx + 50, 230);
                ctx.moveTo(bx, 130); ctx.lineTo(bx + 100, 130);
                ctx.stroke();
            }
            // Japanese characters decoration
            ctx.fillStyle = 'rgba(200, 50, 50, 0.3)';
            ctx.font = '28px serif';
            ctx.fillText('\u6B66', 20, 280);
            ctx.fillText('\u9053', GAME_W - 45, 280);
        } else if (stage === 1) {
            // Rooftop at sunset
            const grd = ctx.createLinearGradient(0, 0, 0, GAME_H);
            grd.addColorStop(0, '#FF6B35');
            grd.addColorStop(0.3, '#FF8C42');
            grd.addColorStop(0.6, '#C84B31');
            grd.addColorStop(1, '#2D142C');
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, GAME_W, GAME_H);

            // Sun
            ctx.fillStyle = '#FFD700';
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.arc(GAME_W / 2, 80, 50, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(GAME_W / 2, 80, 70, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            // City silhouette
            ctx.fillStyle = '#1A0A1E';
            const buildings = [
                [0, 220, 60, 130], [55, 190, 45, 160], [95, 240, 70, 110],
                [160, 210, 50, 140], [205, 250, 40, 100], [240, 200, 55, 150],
                [290, 230, 65, 120], [350, 180, 40, 170], [385, 220, 60, 130],
                [440, 195, 50, 155], [485, 240, 45, 110], [525, 210, 55, 140],
                [575, 230, 65, 120]
            ];
            for (const [bx, by, bw, bh] of buildings) {
                ctx.fillRect(bx, by, bw, bh);
                // Windows
                ctx.fillStyle = 'rgba(255, 200, 100, 0.3)';
                for (let wy = by + 10; wy < by + bh - 10; wy += 15) {
                    for (let wx = bx + 5; wx < bx + bw - 5; wx += 12) {
                        if (Math.random() > 0.4) ctx.fillRect(wx, wy, 6, 8);
                    }
                }
                ctx.fillStyle = '#1A0A1E';
            }

            // Rooftop floor
            ctx.fillStyle = '#3A2040';
            ctx.fillRect(0, GROUND_Y, GAME_W, GAME_H - GROUND_Y);
            ctx.fillStyle = '#4A2850';
            ctx.fillRect(0, GROUND_Y, GAME_W, 4);
        } else {
            // Neon arena
            const grd = ctx.createLinearGradient(0, 0, 0, GAME_H);
            grd.addColorStop(0, '#0A001A');
            grd.addColorStop(1, '#15002E');
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, GAME_W, GAME_H);

            // Neon grid on floor
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            for (let x = 0; x < GAME_W; x += 40) {
                ctx.beginPath();
                ctx.moveTo(x, GROUND_Y);
                ctx.lineTo(x, GAME_H);
                ctx.stroke();
            }
            for (let y = GROUND_Y; y < GAME_H; y += 15) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(GAME_W, y);
                ctx.stroke();
            }

            // Neon signs
            const pulse = Math.sin(frameCount * 0.05) * 0.3 + 0.7;
            ctx.globalAlpha = pulse;
            ctx.strokeStyle = '#FF00FF';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#FF00FF';
            ctx.shadowBlur = 15;
            ctx.strokeRect(50, 40, 120, 60);
            ctx.strokeStyle = '#00FFFF';
            ctx.shadowColor = '#00FFFF';
            ctx.strokeRect(470, 40, 120, 60);
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;

            // Floor
            ctx.fillStyle = '#1A0030';
            ctx.fillRect(0, GROUND_Y, GAME_W, GAME_H - GROUND_Y);

            // Neon floor edge
            ctx.strokeStyle = 'rgba(255, 0, 255, 0.5)';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#FF00FF';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(0, GROUND_Y);
            ctx.lineTo(GAME_W, GROUND_Y);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Spectator dots in background
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            for (let i = 0; i < 30; i++) {
                const sx = ((i * 73 + frameCount * 0.1) % GAME_W);
                const sy = 250 + Math.sin(i * 2.1) * 30;
                ctx.beginPath();
                ctx.arc(sx, sy, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // ══════════════════════════════════════════════════════════
    //  FIGHTER CREATION
    // ══════════════════════════════════════════════════════════
    function createFighter(x, facing, isAI) {
        return {
            x, y: GROUND_Y,
            vx: 0, vy: 0,
            hp: MAX_HP,
            facing, // 1 = right, -1 = left
            state: 'idle', // idle, walk, jump, punch, kick, block, hit, ko, special
            stateTime: 0,
            special: 0,
            isAI,
            animFrame: 0,
            attackHit: false, // prevent multi-hit per attack
            hitStun: 0,
            blockStun: 0,
            combo: 0,
            lastAttackTime: 0
        };
    }

    // ══════════════════════════════════════════════════════════
    //  AI LOGIC
    // ══════════════════════════════════════════════════════════
    function getAIDifficulty() {
        // Scale per round: 0 = easy, 1 = medium, 2 = hard
        const tier = Math.min(round - 1, 2);
        return {
            reactionTime: [30, 18, 8][tier],    // frames before reacting
            aggressiveness: [0.3, 0.5, 0.75][tier],
            blockChance: [0.15, 0.35, 0.55][tier],
            moveSpeed: [2.0, 2.8, 3.5][tier],
            specialUse: [0.01, 0.03, 0.06][tier]
        };
    }

    let aiDecisionTimer = 0;
    let aiAction = 'idle';

    function updateAI(fighter, target) {
        const diff = getAIDifficulty();
        const dist = Math.abs(fighter.x - target.x);
        const facingTarget = (target.x > fighter.x) ? 1 : -1;

        if (fighter.state === 'hit' || fighter.state === 'ko') return;
        if (fighter.hitStun > 0) return;

        aiDecisionTimer--;
        if (aiDecisionTimer > 0) {
            executeAIAction(fighter, target, diff);
            return;
        }

        aiDecisionTimer = diff.reactionTime + Math.floor(Math.random() * 10);
        fighter.facing = facingTarget;

        // Decide action
        if (target.state === 'punch' || target.state === 'kick') {
            // Defensive
            if (Math.random() < diff.blockChance) {
                aiAction = 'block';
            } else if (Math.random() < 0.3) {
                aiAction = 'jump';
            } else {
                aiAction = 'retreat';
            }
        } else if (dist < PUNCH_RANGE + 10) {
            // In range - attack or block
            if (fighter.special >= SPECIAL_CHARGE_MAX && Math.random() < diff.specialUse * 3) {
                aiAction = 'special';
            } else if (Math.random() < diff.aggressiveness) {
                aiAction = Math.random() < 0.5 ? 'punch' : 'kick';
            } else {
                aiAction = Math.random() < 0.3 ? 'block' : 'retreat';
            }
        } else if (dist < KICK_RANGE + 30) {
            // Close-ish
            if (Math.random() < diff.aggressiveness * 0.8) {
                aiAction = 'approach';
            } else {
                aiAction = Math.random() < 0.4 ? 'kick' : 'approach';
            }
        } else {
            // Far away
            if (Math.random() < diff.aggressiveness) {
                aiAction = 'approach';
            } else if (Math.random() < 0.15) {
                aiAction = 'jump';
            } else {
                aiAction = 'idle';
            }
        }
    }

    function executeAIAction(fighter, target, diff) {
        const facingTarget = (target.x > fighter.x) ? 1 : -1;
        fighter.facing = facingTarget;

        switch (aiAction) {
            case 'approach':
                fighter.vx = diff.moveSpeed * fighter.facing;
                break;
            case 'retreat':
                fighter.vx = -diff.moveSpeed * 0.7 * fighter.facing;
                break;
            case 'punch':
                if (fighter.state === 'idle' || fighter.state === 'walk') {
                    startAttack(fighter, 'punch');
                }
                aiAction = 'idle';
                break;
            case 'kick':
                if (fighter.state === 'idle' || fighter.state === 'walk') {
                    startAttack(fighter, 'kick');
                }
                aiAction = 'idle';
                break;
            case 'block':
                fighter.state = 'block';
                fighter.vx = 0;
                break;
            case 'jump':
                if (fighter.y >= GROUND_Y) {
                    fighter.vy = -12;
                    fighter.vx = diff.moveSpeed * fighter.facing * 0.5;
                }
                aiAction = 'idle';
                break;
            case 'special':
                if (fighter.special >= SPECIAL_CHARGE_MAX) {
                    startSpecial(fighter);
                }
                aiAction = 'idle';
                break;
            default:
                fighter.vx *= 0.8;
                break;
        }
    }

    // ══════════════════════════════════════════════════════════
    //  ATTACK SYSTEM
    // ══════════════════════════════════════════════════════════
    function startAttack(fighter, type) {
        fighter.state = type;
        fighter.stateTime = 0;
        fighter.attackHit = false;
        fighter.vx = fighter.facing * 1.5;
        if (type === 'punch') playPunch();
        else playKick();
    }

    function startSpecial(fighter) {
        fighter.state = 'special';
        fighter.stateTime = 0;
        fighter.attackHit = false;
        fighter.special = 0;
        fighter.vx = 0;
        specialActive = true;
        playSpecial();
    }

    function checkHit(attacker, defender) {
        if (attacker.attackHit) return;
        const range = attacker.state === 'punch' ? PUNCH_RANGE :
                      attacker.state === 'kick' ? KICK_RANGE : 80;
        const dmg = attacker.state === 'punch' ? PUNCH_DMG :
                    attacker.state === 'kick' ? KICK_DMG : SPECIAL_DMG;

        // Check timing window (active frames)
        const activeStart = attacker.state === 'special' ? 15 : 4;
        const activeEnd = attacker.state === 'special' ? 25 : 10;
        if (attacker.stateTime < activeStart || attacker.stateTime > activeEnd) return;

        // Distance check
        const dx = defender.x - attacker.x;
        const hitDist = Math.abs(dx);
        const dy = Math.abs(defender.y - attacker.y);

        if (hitDist < range && dy < 50) {
            // Direction check
            if ((attacker.facing === 1 && dx > 0) || (attacker.facing === -1 && dx < 0)) {
                attacker.attackHit = true;

                if (defender.state === 'block') {
                    // Blocked!
                    playBlock();
                    defender.blockStun = 10;
                    defender.vx = attacker.facing * 3;
                    defender.hp -= Math.max(1, Math.floor(dmg * 0.1));
                    spawnBurst(defender.x - attacker.facing * 15, defender.y - 30, 5, '#88F', 3);
                    startShake(2, 3);
                } else {
                    // Hit!
                    playHit();
                    defender.hp -= dmg;
                    defender.hitStun = 15;
                    defender.state = 'hit';
                    defender.stateTime = 0;
                    defender.vx = attacker.facing * (attacker.state === 'special' ? 8 : 4);
                    defender.vy = attacker.state === 'kick' ? -3 : -1;
                    attacker.special = Math.min(SPECIAL_CHARGE_MAX, attacker.special + dmg * 0.8);
                    attacker.combo++;

                    // Effects
                    const hitX = (attacker.x + defender.x) / 2;
                    const hitY = defender.y - 30;
                    spawnBurst(hitX, hitY, 12, attacker.state === 'special' ? ACCENT_CLR : '#FFF', 6);
                    spawnImpactStar(hitX, hitY);
                    startShake(4, attacker.state === 'special' ? 10 : 6);
                    flashAlpha = 0.3;

                    if (attacker.state === 'special') {
                        // Big special hit effect
                        for (let i = 0; i < 30; i++) {
                            spawnBurst(hitX, hitY, 3, ACCENT_CLR, 10);
                        }
                    }
                }
            }
        }
    }

    // ══════════════════════════════════════════════════════════
    //  FIGHTER UPDATE
    // ══════════════════════════════════════════════════════════
    function updateFighter(f) {
        f.stateTime++;
        f.animFrame++;

        // State machine
        if (f.hitStun > 0) {
            f.hitStun--;
            if (f.hitStun <= 0 && f.hp > 0) {
                f.state = 'idle';
                f.combo = 0;
            }
        }
        if (f.blockStun > 0) {
            f.blockStun--;
            if (f.blockStun <= 0) f.state = 'idle';
        }

        // Attack state durations
        if (f.state === 'punch' && f.stateTime > 15) {
            f.state = 'idle';
            f.vx *= 0.3;
        }
        if (f.state === 'kick' && f.stateTime > 20) {
            f.state = 'idle';
            f.vx *= 0.3;
        }
        if (f.state === 'special' && f.stateTime > 35) {
            f.state = 'idle';
            f.vx *= 0.1;
            specialActive = false;
        }

        // Physics
        f.x += f.vx;
        f.y += f.vy;
        f.vy += GRAVITY;

        // Friction
        if (f.state !== 'walk' && f.state !== 'hit') {
            f.vx *= 0.85;
        }

        // Ground collision
        if (f.y >= GROUND_Y) {
            f.y = GROUND_Y;
            f.vy = 0;
        }

        // Wall bounds
        f.x = Math.max(30, Math.min(GAME_W - 30, f.x));

        // KO check
        if (f.hp <= 0 && f.state !== 'ko') {
            f.hp = 0;
            f.state = 'ko';
            f.stateTime = 0;
            f.vy = -8;
            f.vx = -f.facing * 4;
        }
    }

    // ══════════════════════════════════════════════════════════
    //  FIGHTER DRAWING
    // ══════════════════════════════════════════════════════════
    function drawFighter(f, color1, color2) {
        ctx.save();
        ctx.translate(f.x, f.y);
        if (f.facing === -1) ctx.scale(-1, 1);

        const breathe = Math.sin(f.animFrame * 0.08) * 1.5;
        const isHit = f.state === 'hit';
        const isKO = f.state === 'ko';

        if (isHit && f.stateTime % 4 < 2) {
            ctx.globalAlpha = 0.6;
        }

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 18, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        let bodyOffY = -BODY_H - LEG_LEN + breathe;
        let headOffY = bodyOffY - HEAD_R - 2;
        let armAngle = 0, armAngle2 = 0;
        let legAngle = 0, legAngle2 = 0;
        let leanX = 0;

        // Animation states
        if (f.state === 'idle') {
            armAngle = Math.sin(f.animFrame * 0.04) * 0.1;
            armAngle2 = -armAngle;
        } else if (f.state === 'walk') {
            const walk = Math.sin(f.animFrame * 0.15) * 0.5;
            armAngle = -walk;
            armAngle2 = walk;
            legAngle = walk;
            legAngle2 = -walk;
        } else if (f.state === 'punch') {
            const t = Math.min(f.stateTime / 8, 1);
            if (t < 0.5) {
                armAngle = -Math.PI * 0.4 * (t * 2); // Wind up
            } else {
                armAngle = -Math.PI * 0.1; // Extended
                leanX = 8;
            }
            armAngle2 = -0.3;
        } else if (f.state === 'kick') {
            const t = Math.min(f.stateTime / 10, 1);
            legAngle = -Math.PI * 0.4 * Math.sin(t * Math.PI);
            bodyOffY -= 5;
            leanX = 4;
            armAngle = 0.3;
            armAngle2 = -0.5;
        } else if (f.state === 'block') {
            armAngle = -Math.PI * 0.6;
            armAngle2 = -Math.PI * 0.5;
            leanX = -3;
        } else if (f.state === 'jump') {
            bodyOffY -= 5;
            armAngle = -0.5;
            armAngle2 = -0.5;
            legAngle = 0.4;
            legAngle2 = -0.3;
        } else if (f.state === 'hit') {
            leanX = -6;
            armAngle = 0.4;
            armAngle2 = 0.3;
            bodyOffY += 3;
        } else if (f.state === 'ko') {
            const fall = Math.min(f.stateTime / 20, 1);
            ctx.rotate(-Math.PI * 0.5 * fall);
            bodyOffY += 15 * fall;
        } else if (f.state === 'special') {
            const t = f.stateTime / 35;
            if (t < 0.4) {
                // Charge up
                armAngle = -Math.PI * 0.7;
                armAngle2 = -Math.PI * 0.7;
                bodyOffY -= 3;
            } else {
                // Release
                armAngle = -Math.PI * 0.1;
                leanX = 12;
                armAngle2 = Math.PI * 0.3;
            }
        }

        // In-air offset
        if (f.y < GROUND_Y) {
            const airTime = (GROUND_Y - f.y) / 50;
            legAngle = 0.4 * airTime;
            legAngle2 = -0.2 * airTime;
        }

        ctx.translate(leanX, 0);

        // Legs
        ctx.strokeStyle = color2;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';

        // Right leg
        ctx.save();
        ctx.translate(6, -LEG_LEN);
        ctx.rotate(legAngle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, LEG_LEN);
        ctx.stroke();
        ctx.restore();

        // Left leg
        ctx.save();
        ctx.translate(-4, -LEG_LEN);
        ctx.rotate(legAngle2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, LEG_LEN);
        ctx.stroke();
        ctx.restore();

        // Body
        ctx.fillStyle = color1;
        ctx.beginPath();
        ctx.roundRect(-BODY_W / 2, bodyOffY, BODY_W, BODY_H, 4);
        ctx.fill();

        // Belt
        ctx.fillStyle = color2;
        ctx.fillRect(-BODY_W / 2, bodyOffY + BODY_H - 8, BODY_W, 4);

        // Arms
        ctx.strokeStyle = color1;
        ctx.lineWidth = 5;

        // Right arm (front)
        ctx.save();
        ctx.translate(BODY_W / 2 - 2, bodyOffY + 6);
        ctx.rotate(armAngle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(ARM_LEN, 6);
        ctx.stroke();
        // Fist
        ctx.fillStyle = color2;
        ctx.beginPath();
        ctx.arc(ARM_LEN, 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Left arm (back)
        ctx.save();
        ctx.translate(-BODY_W / 2 + 2, bodyOffY + 6);
        ctx.rotate(armAngle2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-ARM_LEN * 0.7, 6);
        ctx.stroke();
        ctx.fillStyle = color2;
        ctx.beginPath();
        ctx.arc(-ARM_LEN * 0.7, 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Head
        ctx.fillStyle = color2;
        ctx.beginPath();
        ctx.arc(0, headOffY, HEAD_R, 0, Math.PI * 2);
        ctx.fill();

        // Face
        ctx.fillStyle = '#FFF';
        const eyeOff = f.state === 'ko' ? 0 : 2;
        // Eyes
        if (f.state === 'ko') {
            // X eyes
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-5, headOffY - 3); ctx.lineTo(-1, headOffY + 1);
            ctx.moveTo(-1, headOffY - 3); ctx.lineTo(-5, headOffY + 1);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(2, headOffY - 3); ctx.lineTo(6, headOffY + 1);
            ctx.moveTo(6, headOffY - 3); ctx.lineTo(2, headOffY + 1);
            ctx.stroke();
        } else if (f.state === 'hit') {
            // Hurt eyes
            ctx.fillStyle = '#FFF';
            ctx.fillRect(-6, headOffY - 3, 5, 2);
            ctx.fillRect(2, headOffY - 3, 5, 2);
        } else {
            // Normal eyes
            ctx.beginPath();
            ctx.arc(-3 + eyeOff, headOffY - 2, 2.5, 0, Math.PI * 2);
            ctx.arc(4 + eyeOff, headOffY - 2, 2.5, 0, Math.PI * 2);
            ctx.fill();
            // Pupils
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(-2 + eyeOff, headOffY - 2, 1.2, 0, Math.PI * 2);
            ctx.arc(5 + eyeOff, headOffY - 2, 1.2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Mouth
        if (f.state === 'special') {
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(2, headOffY + 5, 4, 0, Math.PI);
            ctx.fill();
        } else if (f.state === 'hit' || f.state === 'ko') {
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(2, headOffY + 4, 3, 0.2, Math.PI - 0.2);
            ctx.stroke();
        }

        // Special move glow
        if (f.state === 'special' && f.stateTime > 10) {
            const pulse = Math.sin(f.stateTime * 0.5) * 0.3 + 0.5;
            ctx.globalAlpha = pulse;
            ctx.fillStyle = ACCENT_CLR;
            ctx.shadowColor = ACCENT_CLR;
            ctx.shadowBlur = 30;
            ctx.beginPath();
            ctx.arc(ARM_LEN + 10, bodyOffY + 6, 12 + f.stateTime * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
        }

        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // ══════════════════════════════════════════════════════════
    //  HUD
    // ══════════════════════════════════════════════════════════
    function drawHUD() {
        const barW = 200, barH = 16, barY = 15;
        const gap = 50;

        // Player HP bar (left)
        const p1BarX = GAME_W / 2 - gap / 2 - barW;
        drawHPBar(p1BarX, barY, barW, barH, p1.hp, MAX_HP, PLAYER_CLR, true);

        // AI HP bar (right)
        const p2BarX = GAME_W / 2 + gap / 2;
        drawHPBar(p2BarX, barY, barW, barH, p2.hp, MAX_HP, AI_CLR, false);

        // VS text
        ctx.fillStyle = UI_CLR;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('VS', GAME_W / 2, barY + 13);

        // Names
        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('PLAYER', p1BarX, barY - 3);
        ctx.textAlign = 'right';
        ctx.fillText('CPU', p2BarX + barW, barY - 3);

        // Round indicator
        ctx.textAlign = 'center';
        ctx.font = 'bold 12px monospace';
        ctx.fillText(`ROUND ${round}`, GAME_W / 2, barY + 32);

        // Round win dots
        for (let i = 0; i < ROUNDS_TO_WIN; i++) {
            ctx.fillStyle = i < playerWins ? PLAYER_CLR : 'rgba(255,255,255,0.2)';
            ctx.beginPath();
            ctx.arc(GAME_W / 2 - 30 + i * 12, barY + 44, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        for (let i = 0; i < ROUNDS_TO_WIN; i++) {
            ctx.fillStyle = i < aiWins ? AI_CLR : 'rgba(255,255,255,0.2)';
            ctx.beginPath();
            ctx.arc(GAME_W / 2 + 20 + i * 12, barY + 44, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // Special meter
        drawSpecialMeter(p1BarX, barY + barH + 4, barW, 6, p1.special, PLAYER_CLR);
        drawSpecialMeter(p2BarX, barY + barH + 4, barW, 6, p2.special, AI_CLR);

        // Score
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText(`SCORE: ${score}`, 10, GAME_H - 8);
    }

    function drawHPBar(x, y, w, h, hp, maxHP, color, leftAlign) {
        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 3);
        ctx.fill();

        // HP fill
        const ratio = Math.max(0, hp / maxHP);
        const fillW = w * ratio;
        const hpColor = ratio > 0.5 ? color : ratio > 0.25 ? '#F59E0B' : '#EF4444';

        if (leftAlign) {
            ctx.fillStyle = hpColor;
            ctx.beginPath();
            ctx.roundRect(x, y, fillW, h, 3);
            ctx.fill();
        } else {
            ctx.fillStyle = hpColor;
            ctx.beginPath();
            ctx.roundRect(x + w - fillW, y, fillW, h, 3);
            ctx.fill();
        }

        // HP flash on low health
        if (ratio < 0.25 && frameCount % 20 < 10) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, 3);
            ctx.fill();
        }

        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 3);
        ctx.stroke();
    }

    function drawSpecialMeter(x, y, w, h, charge, color) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x, y, w, h);

        const ratio = charge / SPECIAL_CHARGE_MAX;
        ctx.fillStyle = ratio >= 1 ? ACCENT_CLR : color;
        ctx.fillRect(x, y, w * ratio, h);

        if (ratio >= 1) {
            ctx.globalAlpha = Math.sin(frameCount * 0.15) * 0.3 + 0.7;
            ctx.fillStyle = '#FFF';
            ctx.font = '8px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('SPECIAL!', x + w / 2, y + h - 1);
            ctx.globalAlpha = 1;
        }
    }

    // ══════════════════════════════════════════════════════════
    //  TITLE SCREEN
    // ══════════════════════════════════════════════════════════
    function drawTitle() {
        drawStage();

        // Darken overlay
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Title
        ctx.fillStyle = UI_CLR;
        ctx.font = 'bold 42px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Glow
        ctx.shadowColor = PLAYER_CLR;
        ctx.shadowBlur = 20;
        ctx.fillText('PIXEL', GAME_W / 2 - 80, GAME_H / 2 - 50);
        ctx.shadowColor = AI_CLR;
        ctx.fillText('FIGHTER', GAME_W / 2 + 40, GAME_H / 2 - 50);
        ctx.shadowBlur = 0;

        // VS fighters silhouette
        drawFighter({
            x: GAME_W / 2 - 100, y: GROUND_Y,
            facing: 1, state: 'idle', stateTime: 0,
            animFrame: frameCount, hp: MAX_HP
        }, PLAYER_CLR, PLAYER_CLR2);
        drawFighter({
            x: GAME_W / 2 + 100, y: GROUND_Y,
            facing: -1, state: 'idle', stateTime: 0,
            animFrame: frameCount, hp: MAX_HP
        }, AI_CLR, AI_CLR2);

        // Start prompt
        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink) {
            ctx.fillStyle = UI_CLR;
            ctx.font = '16px monospace';
            ctx.fillText(touchActive ? 'TAP TO FIGHT' : 'PRESS ENTER TO FIGHT', GAME_W / 2, GAME_H / 2 + 50);
        }

        // Controls
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '11px monospace';
        ctx.fillText('\u2190\u2192 Move  \u2191 Jump  \u2193 Block  Z Punch  X Kick  Z+X Special', GAME_W / 2, GAME_H / 2 + 80);

        ctx.textBaseline = 'alphabetic';
    }

    // ══════════════════════════════════════════════════════════
    //  ROUND START / KO SCREENS
    // ══════════════════════════════════════════════════════════
    function drawRoundStart() {
        drawStage();
        drawFighter(p1, PLAYER_CLR, PLAYER_CLR2);
        drawFighter(p2, AI_CLR, AI_CLR2);
        drawHUD();

        // Round text
        const t = stateTimer / ROUND_START_DELAY;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (t < 0.5) {
            const scale = 1 + (1 - t * 2) * 2;
            ctx.save();
            ctx.translate(GAME_W / 2, GAME_H / 2);
            ctx.scale(scale, scale);
            ctx.globalAlpha = Math.min(1, t * 4);
            ctx.fillStyle = UI_CLR;
            ctx.font = 'bold 36px monospace';
            ctx.fillText(`ROUND ${round}`, 0, 0);
            ctx.globalAlpha = 1;
            ctx.restore();
        } else {
            const fightScale = 1 + Math.sin((t - 0.5) * Math.PI * 4) * 0.1;
            ctx.save();
            ctx.translate(GAME_W / 2, GAME_H / 2);
            ctx.scale(fightScale, fightScale);
            ctx.fillStyle = ACCENT_CLR;
            ctx.shadowColor = ACCENT_CLR;
            ctx.shadowBlur = 25;
            ctx.font = 'bold 52px monospace';
            ctx.fillText('FIGHT!', 0, 0);
            ctx.shadowBlur = 0;
            ctx.restore();
        }
        ctx.textBaseline = 'alphabetic';
    }

    function drawKO() {
        drawStage();
        drawFighter(p1, PLAYER_CLR, PLAYER_CLR2);
        drawFighter(p2, AI_CLR, AI_CLR2);
        drawHUD();

        // Darken
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // KO text
        const t = Math.min(stateTimer / 60, 1);
        const scale = 1 + (1 - t) * 3;
        ctx.save();
        ctx.translate(GAME_W / 2, GAME_H / 2 - 20);
        ctx.scale(scale, scale);
        ctx.globalAlpha = t;
        ctx.fillStyle = '#FF0000';
        ctx.shadowColor = '#FF0000';
        ctx.shadowBlur = 30;
        ctx.font = 'bold 60px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('K.O.!', 0, 0);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.restore();
        ctx.textBaseline = 'alphabetic';
    }

    function drawGameOver() {
        drawStage();
        drawFighter(p1, PLAYER_CLR, PLAYER_CLR2);
        drawFighter(p2, AI_CLR, AI_CLR2);
        drawHUD();

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const won = playerWins >= ROUNDS_TO_WIN;
        ctx.fillStyle = won ? ACCENT_CLR : AI_CLR;
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 20;
        ctx.font = 'bold 40px monospace';
        ctx.fillText(won ? 'YOU WIN!' : 'DEFEATED', GAME_W / 2, GAME_H / 2 - 30);
        ctx.shadowBlur = 0;

        ctx.fillStyle = UI_CLR;
        ctx.font = '18px monospace';
        ctx.fillText(`SCORE: ${score}`, GAME_W / 2, GAME_H / 2 + 10);

        if (bestScore > 0) {
            ctx.font = '14px monospace';
            ctx.fillStyle = score >= bestScore ? '#FFD700' : '#888';
            ctx.fillText(score >= bestScore ? `NEW BEST: ${bestScore}` : `BEST: ${bestScore}`, GAME_W / 2, GAME_H / 2 + 30);
        }

        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink) {
            ctx.font = '14px monospace';
            ctx.fillText(touchActive ? 'TAP TO CONTINUE' : 'PRESS ENTER', GAME_W / 2, GAME_H / 2 + 45);
        }

        ctx.textBaseline = 'alphabetic';
    }

    // ══════════════════════════════════════════════════════════
    //  TOUCH CONTROLS
    // ══════════════════════════════════════════════════════════
    const TOUCH_BTN_SIZE = 44;
    const DPAD_SIZE = 40;

    function drawTouchControls() {
        if (!touchActive) return;
        ctx.globalAlpha = 0.35;

        // D-pad (left side)
        const dpadCX = 70, dpadCY = GAME_H - 70;

        // Up
        drawTouchBtn(dpadCX, dpadCY - DPAD_SIZE, DPAD_SIZE - 4, '\u25B2', touchBtns.up);
        // Down
        drawTouchBtn(dpadCX, dpadCY + DPAD_SIZE, DPAD_SIZE - 4, '\u25BC', touchBtns.down);
        // Left
        drawTouchBtn(dpadCX - DPAD_SIZE, dpadCY, DPAD_SIZE - 4, '\u25C0', touchBtns.left);
        // Right
        drawTouchBtn(dpadCX + DPAD_SIZE, dpadCY, DPAD_SIZE - 4, '\u25B6', touchBtns.right);

        // Action buttons (right side)
        const abCX = GAME_W - 80, abCY = GAME_H - 70;
        drawTouchBtn(abCX - 30, abCY, TOUCH_BTN_SIZE / 2, 'P', touchBtns.punch);   // Punch
        drawTouchBtn(abCX + 30, abCY, TOUCH_BTN_SIZE / 2, 'K', touchBtns.kick);    // Kick
        drawTouchBtn(abCX, abCY - 40, TOUCH_BTN_SIZE / 2, 'SP', touchBtns.special); // Special

        ctx.globalAlpha = 1;
    }

    function drawTouchBtn(cx, cy, r, label, active) {
        ctx.fillStyle = active ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#FFF';
        ctx.font = `bold ${r * 0.7}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, cy);
        ctx.textBaseline = 'alphabetic';
    }

    function getTouchZone(tx, ty) {
        // Convert from CSS coords to game coords
        const rect = canvas.getBoundingClientRect();
        const x = (tx - rect.left) / rect.width * GAME_W;
        const y = (ty - rect.top) / rect.height * GAME_H;

        const dpadCX = 70, dpadCY = GAME_H - 70;
        const abCX = GAME_W - 80, abCY = GAME_H - 70;

        const dist = (ax, ay, bx, by) => Math.sqrt((ax-bx)*(ax-bx) + (ay-by)*(ay-by));

        if (dist(x, y, dpadCX, dpadCY - DPAD_SIZE) < DPAD_SIZE) return 'up';
        if (dist(x, y, dpadCX, dpadCY + DPAD_SIZE) < DPAD_SIZE) return 'down';
        if (dist(x, y, dpadCX - DPAD_SIZE, dpadCY) < DPAD_SIZE) return 'left';
        if (dist(x, y, dpadCX + DPAD_SIZE, dpadCY) < DPAD_SIZE) return 'right';
        if (dist(x, y, abCX - 30, abCY) < TOUCH_BTN_SIZE) return 'punch';
        if (dist(x, y, abCX + 30, abCY) < TOUCH_BTN_SIZE) return 'kick';
        if (dist(x, y, abCX, abCY - 40) < TOUCH_BTN_SIZE) return 'special';

        return null;
    }

    let activeTouches = {};

    function onTouchStart(e) {
        touchActive = true;
        for (const t of e.changedTouches) {
            const zone = getTouchZone(t.clientX, t.clientY);
            if (zone) {
                activeTouches[t.identifier] = zone;
                touchBtns[zone] = true;
            }
        }
        handleTouchInput();
        if (state === ST_TITLE || state === ST_GAME_OVER) {
            handleStart();
        }
    }

    function onTouchMove(e) {
        e.preventDefault();
        for (const t of e.changedTouches) {
            const oldZone = activeTouches[t.identifier];
            const newZone = getTouchZone(t.clientX, t.clientY);
            if (oldZone && oldZone !== newZone) {
                touchBtns[oldZone] = false;
            }
            if (newZone) {
                activeTouches[t.identifier] = newZone;
                touchBtns[newZone] = true;
            }
        }
    }

    function onTouchEnd(e) {
        for (const t of e.changedTouches) {
            const zone = activeTouches[t.identifier];
            if (zone) {
                touchBtns[zone] = false;
                delete activeTouches[t.identifier];
            }
        }
    }

    function handleTouchInput() {
        if (state !== ST_FIGHTING) return;
        if (touchBtns.special || (touchBtns.punch && touchBtns.kick)) {
            if (p1.special >= SPECIAL_CHARGE_MAX && (p1.state === 'idle' || p1.state === 'walk')) {
                startSpecial(p1);
            }
        } else if (touchBtns.punch) {
            if (p1.state === 'idle' || p1.state === 'walk') startAttack(p1, 'punch');
        } else if (touchBtns.kick) {
            if (p1.state === 'idle' || p1.state === 'walk') startAttack(p1, 'kick');
        }
    }

    // ══════════════════════════════════════════════════════════
    //  KEYBOARD INPUT
    // ══════════════════════════════════════════════════════════
    function onKeyDown(e) {
        keys[e.key] = true;
        keys[e.code] = true;

        if (e.key === 'Enter' || e.key === ' ') {
            if (state === ST_TITLE || state === ST_GAME_OVER) {
                handleStart();
            }
        }

        // Attack on press (not hold)
        if (state === ST_FIGHTING && p1.state !== 'hit' && p1.state !== 'ko' && p1.hitStun <= 0) {
            if ((keys['KeyZ'] || keys['z']) && (keys['KeyX'] || keys['x'])) {
                // Special
                if (p1.special >= SPECIAL_CHARGE_MAX && (p1.state === 'idle' || p1.state === 'walk')) {
                    startSpecial(p1);
                }
            } else if (e.key === 'z' || e.code === 'KeyZ') {
                if (p1.state === 'idle' || p1.state === 'walk') startAttack(p1, 'punch');
            } else if (e.key === 'x' || e.code === 'KeyX') {
                if (p1.state === 'idle' || p1.state === 'walk') startAttack(p1, 'kick');
            }
        }
    }

    function onKeyUp(e) {
        keys[e.key] = false;
        keys[e.code] = false;
    }

    function handlePlayerInput() {
        if (state !== ST_FIGHTING) return;
        if (p1.state === 'hit' || p1.state === 'ko' || p1.hitStun > 0) return;
        if (p1.state === 'punch' || p1.state === 'kick' || p1.state === 'special') return;

        const moveSpeed = 3.5;
        let moving = false;

        // Block (down arrow)
        if (keys['ArrowDown'] || keys['s'] || touchBtns.down) {
            p1.state = 'block';
            p1.vx = 0;
            return;
        }

        // Movement
        if (keys['ArrowLeft'] || keys['a'] || touchBtns.left) {
            p1.vx = -moveSpeed;
            p1.facing = -1;
            moving = true;
        } else if (keys['ArrowRight'] || keys['d'] || touchBtns.right) {
            p1.vx = moveSpeed;
            p1.facing = 1;
            moving = true;
        } else {
            p1.vx *= 0.7;
        }

        // Jump
        if ((keys['ArrowUp'] || keys['w'] || touchBtns.up) && p1.y >= GROUND_Y) {
            p1.vy = -12;
        }

        // Idle/walk state
        if (p1.state !== 'jump' && p1.y >= GROUND_Y) {
            p1.state = moving ? 'walk' : 'idle';
        }
        if (p1.y < GROUND_Y) {
            p1.state = 'jump';
        }
    }

    // ══════════════════════════════════════════════════════════
    //  GAME FLOW
    // ══════════════════════════════════════════════════════════
    function handleStart() {
        ensureAudio();
        if (state === ST_TITLE) {
            startGame();
        } else if (state === ST_GAME_OVER) {
            if (onGameOver) onGameOver(score);
        }
    }

    function startGame() {
        round = 1;
        playerWins = 0;
        aiWins = 0;
        score = 0;
        stageIndex = 0;
        startRound();
    }

    function startRound() {
        p1 = createFighter(180, 1, false);
        p2 = createFighter(460, -1, true);
        particles = [];
        impactStars = [];
        shakeTimer = 0;
        slowMoFrames = 0;
        flashAlpha = 0;
        specialActive = false;
        aiDecisionTimer = 0;
        aiAction = 'idle';
        state = ST_ROUND_START;
        stateTimer = ROUND_START_DELAY;
        gameActive = true;
        playGong();
    }

    function endRound(winner) {
        state = ST_KO;
        stateTimer = 0;
        slowMoFrames = KO_SLOWMO_FRAMES;
        playKO();
        playCrowd();

        if (winner === 'player') {
            playerWins++;
            score += 500 + Math.floor(p1.hp * 10);
        } else {
            aiWins++;
        }
    }

    function checkRoundOver() {
        if (state !== ST_KO) return;
        stateTimer++;

        if (stateTimer > 90) {
            if (playerWins >= ROUNDS_TO_WIN || aiWins >= ROUNDS_TO_WIN) {
                state = ST_GAME_OVER;
                stateTimer = 0;
                if (score > bestScore) {
                    bestScore = score;
                    try { localStorage.setItem('ywa_pixelfighter_best', bestScore); } catch(e) {}
                }
            } else {
                round++;
                stageIndex++;
                startRound();
            }
        }
    }

    // ══════════════════════════════════════════════════════════
    //  MAIN LOOP
    // ══════════════════════════════════════════════════════════
    function update() {
        frameCount++;

        if (state === ST_ROUND_START) {
            stateTimer -= 16;
            if (stateTimer <= 0) {
                state = ST_FIGHTING;
                playFight();
            }
            return;
        }

        if (state === ST_FIGHTING) {
            handlePlayerInput();
            updateAI(p2, p1);
            updateFighter(p1);
            updateFighter(p2);

            // Hit detection
            if (p1.state === 'punch' || p1.state === 'kick' || p1.state === 'special') {
                checkHit(p1, p2);
            }
            if (p2.state === 'punch' || p2.state === 'kick' || p2.state === 'special') {
                checkHit(p2, p1);
            }

            // Push apart (prevent overlap)
            const dx = p2.x - p1.x;
            if (Math.abs(dx) < 35) {
                const push = (35 - Math.abs(dx)) * 0.5;
                p1.x -= Math.sign(dx) * push;
                p2.x += Math.sign(dx) * push;
            }

            // Auto-face opponent
            if (p1.state === 'idle' || p1.state === 'walk') {
                p1.facing = p2.x > p1.x ? 1 : -1;
            }

            // KO check
            if (p1.hp <= 0 && p1.state === 'ko' && p1.y >= GROUND_Y && p1.stateTime > 30) {
                endRound('ai');
            }
            if (p2.hp <= 0 && p2.state === 'ko' && p2.y >= GROUND_Y && p2.stateTime > 30) {
                endRound('player');
            }

            // Score tick
            if (frameCount % 60 === 0) score += 10;
        }

        if (state === ST_KO) {
            updateFighter(p1);
            updateFighter(p2);
            checkRoundOver();
        }

        updateParticles();
        updateShake();

        if (flashAlpha > 0) flashAlpha -= 0.05;
        if (slowMoFrames > 0) slowMoFrames--;
    }

    function draw() {
        ctx.save();
        ctx.translate(shakeX, shakeY);

        if (state === ST_TITLE) {
            drawTitle();
        } else if (state === ST_ROUND_START) {
            drawRoundStart();
        } else if (state === ST_KO) {
            drawKO();
        } else if (state === ST_GAME_OVER) {
            drawGameOver();
        } else {
            drawStage();
            drawFighter(p1, PLAYER_CLR, PLAYER_CLR2);
            drawFighter(p2, AI_CLR, AI_CLR2);
            drawHUD();
        }

        drawParticles();
        drawTouchControls();

        // Flash effect
        if (flashAlpha > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
            ctx.fillRect(-10, -10, GAME_W + 20, GAME_H + 20);
        }

        // Special darkening
        if (specialActive) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.fillRect(-10, -10, GAME_W + 20, GAME_H + 20);
        }

        ctx.restore();
    }

    function loop() {
        if (!canvas) return;

        // Slow-mo: skip frames
        if (slowMoFrames > 0 && frameCount % 3 !== 0) {
            animFrame = requestAnimationFrame(loop);
            frameCount++;
            return;
        }

        update();
        draw();
        animFrame = requestAnimationFrame(loop);
    }

    // ══════════════════════════════════════════════════════════
    //  CANVAS SIZING
    // ══════════════════════════════════════════════════════════
    function fitCanvas() {
        if (!canvas) return;
        const container = canvas.parentElement;
        if (!container) return;

        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const aspect = GAME_W / GAME_H;
        let w, h;
        if (cw / ch > aspect) {
            h = ch;
            w = ch * aspect;
        } else {
            w = cw;
            h = cw / aspect;
        }

        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        canvas.width = GAME_W;
        canvas.height = GAME_H;
    }

    function onResize() { fitCanvas(); }

    // ══════════════════════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════════════════════
    function init(canvasEl, activePlayer, gameOverCallback) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        player = activePlayer || null;
        onGameOver = gameOverCallback || null;

        // Load player theme
        const themeId = activePlayer?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) {
            BG_TOP = _t.bgGradient?.[0] || BG_TOP;
            BG_BOT = _t.bgGradient?.[1] || BG_BOT;
            PLAYER_CLR = _t.colors?.[0] || PLAYER_CLR;
            PLAYER_CLR2 = _t.colors?.[1] || PLAYER_CLR2;
            ACCENT_CLR = _t.colors?.[2] || ACCENT_CLR;
        }

        keys = {};
        touchBtns = {};
        activeTouches = {};
        particles = [];
        impactStars = [];
        shakeTimer = 0;
        shakeX = 0;
        shakeY = 0;
        frameCount = 0;
        touchActive = false;
        state = ST_TITLE;
        bestScore = parseInt(localStorage.getItem('ywa_pixelfighter_best') || '0', 10);
        stageIndex = 0;
        gameActive = false;

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        // Bind events
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('resize', onResize);
        canvas.addEventListener('touchstart', onTouchStart, { passive: true });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: true });

        animFrame = requestAnimationFrame(loop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;

        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('resize', onResize);

        if (canvas) {
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        }
        canvas = null;
        ctx = null;

        if (audioCtx) {
            try { audioCtx.close(); } catch { /* ignore */ }
            audioCtx = null;
        }
    }

    return {
        init,
        destroy,
        getScore()  { return score; },
        getLevel()  { return round; },
        isActive()  { return gameActive; }
    };
})();
