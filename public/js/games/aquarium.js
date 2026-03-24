/* Aquarium — Virtual Fish Tank Sim for Your World Arcade
 * Self-contained, no dependencies, canvas-rendered
 * IIFE pattern with init(canvas, player, onGameOver) and destroy() */
window.Aquarium = (() => {

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
    const GAME_W = 640, GAME_H = 480;
    const WATER_TOP = 30;
    const SAND_Y = 430;
    const DAY_CYCLE_DURATION = 120; // seconds for full day
    const FOOD_SINK_SPEED = 0.4;
    const FOOD_LIFETIME = 600; // frames
    const HUNGER_RATE = 0.003; // per frame
    const HAPPINESS_DECAY = 0.001;
    const SCORE_INTERVAL = 300; // frames (5 sec at 60fps)
    const SCORE_CALLBACK_TIME = 18000; // 5 minutes at 60fps
    const MAX_FISH = 12;
    const UNLOCK_THRESHOLDS = [300, 800, 1500, 2500];

    // ══════════════════════════════════════════════════════════
    //  FISH TYPES
    // ══════════════════════════════════════════════════════════
    const FISH_TYPES = {
        goldfish: {
            name: 'Goldfish', color1: '#FF8C00', color2: '#FFD700',
            size: 1.0, speed: 1.0, bodyShape: 'round',
            unlockScore: 0
        },
        angelfish: {
            name: 'Angelfish', color1: '#C0C0C0', color2: '#FFFFFF',
            size: 1.2, speed: 0.8, bodyShape: 'tall',
            stripes: true, unlockScore: 0
        },
        pufferfish: {
            name: 'Pufferfish', color1: '#90EE90', color2: '#F0FFF0',
            size: 0.9, speed: 0.6, bodyShape: 'puffer',
            inflates: true, unlockScore: 300
        },
        clownfish: {
            name: 'Clownfish', color1: '#FF6347', color2: '#FFFFFF',
            size: 0.8, speed: 1.2, bodyShape: 'round',
            clownStripes: true, unlockScore: 800
        },
        bluetang: {
            name: 'Blue Tang', color1: '#1E90FF', color2: '#FFD700',
            size: 1.1, speed: 1.1, bodyShape: 'sleek',
            unlockScore: 1500
        }
    };

    // ══════════════════════════════════════════════════════════
    //  THEME COLORS
    // ══════════════════════════════════════════════════════════
    let ACCENT_CLR = '#3B82F6';
    let UI_CLR = '#ffffff';
    let BG_TOP = '#0a2a4a';
    let BG_BOT = '#0a1628';

    // ══════════════════════════════════════════════════════════
    //  MODULE STATE
    // ══════════════════════════════════════════════════════════
    let canvas, ctx;
    let animFrame = null, audioCtx = null;
    let player = null, onGameOver = null;
    let gameActive = false;

    // Time
    let frameCount = 0;
    let startTime = 0;
    let dayTime = 0; // 0-1 cycle

    // Score
    let score = 0;
    let totalHappiness = 0;
    let scoreCallbackSent = false;

    // Fish
    let fish = [];
    let unlockedTypes = ['goldfish', 'angelfish'];
    let nextUnlock = 0;

    // Food
    let foodPellets = [];

    // Decorations
    let plants = [];
    let bubbles = [];
    let decorations = [];

    // Caustics
    let causticTime = 0;

    // Input
    let touchActive = false;

    // Ambient sound
    let ambientOsc = null;
    let ambientGain = null;
    let bubbleTimer = 0;

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
            o.type = type || 'sine';
            o.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(vol || 0.05, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + (dur || 0.1));
            o.connect(g);
            g.connect(ac.destination);
            o.start(t);
            o.stop(t + (dur || 0.1));
        } catch { /* swallow */ }
    }

    function playBubbleSound() {
        const ac = ensureAudio(); if (!ac) return;
        const freq = 800 + Math.random() * 600;
        tone(freq, 0.08, 'sine', 0.03);
        tone(freq * 1.5, 0.05, 'sine', 0.02, ac.currentTime + 0.03);
    }

    function playFeedSound() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        tone(600, 0.06, 'sine', 0.04, t);
        tone(800, 0.06, 'sine', 0.03, t + 0.05);
    }

    function playEatSound() {
        tone(1200, 0.04, 'sine', 0.04);
    }

    function playUnlockSound() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        [523, 659, 784, 1047].forEach((f, i) => {
            tone(f, 0.2, 'sine', 0.06, t + i * 0.1);
        });
    }

    function startAmbient() {
        const ac = ensureAudio(); if (!ac) return;
        try {
            if (ambientOsc) return;
            ambientOsc = ac.createOscillator();
            ambientGain = ac.createGain();
            const filter = ac.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 200;
            ambientOsc.type = 'sawtooth';
            ambientOsc.frequency.value = 55;
            ambientGain.gain.value = 0.015;
            ambientOsc.connect(filter);
            filter.connect(ambientGain);
            ambientGain.connect(ac.destination);
            ambientOsc.start();
        } catch { /* swallow */ }
    }

    function stopAmbient() {
        try {
            if (ambientOsc) { ambientOsc.stop(); ambientOsc = null; }
            ambientGain = null;
        } catch { /* swallow */ }
    }

    // ══════════════════════════════════════════════════════════
    //  FISH CREATION & BEHAVIOR
    // ══════════════════════════════════════════════════════════
    function createFish(typeKey, x, y) {
        const type = FISH_TYPES[typeKey];
        return {
            type: typeKey,
            x: x || Math.random() * (GAME_W - 100) + 50,
            y: y || WATER_TOP + 40 + Math.random() * (SAND_Y - WATER_TOP - 120),
            vx: (Math.random() - 0.5) * 2,
            vy: 0,
            facing: Math.random() > 0.5 ? 1 : -1,
            size: type.size * (0.9 + Math.random() * 0.2),
            speed: type.speed * (0.8 + Math.random() * 0.4),
            hunger: 0.3 + Math.random() * 0.2,
            happiness: 0.8 + Math.random() * 0.2,
            state: 'idle', // idle, hungry, eating, scared, sleeping
            stateTime: 0,
            animFrame: Math.random() * 100,
            targetFood: null,
            inflated: false,
            scareTimer: 0,
            mouthOpen: false,
            mouthTimer: 0
        };
    }

    function updateFish(f) {
        f.animFrame++;
        f.stateTime++;

        // Day/night sleep behavior
        const isNight = dayTime > 0.7 || dayTime < 0.15;

        // Hunger increases
        f.hunger = Math.min(1, f.hunger + HUNGER_RATE);
        f.happiness = Math.max(0, f.happiness - HAPPINESS_DECAY);

        // Boost happiness when well-fed
        if (f.hunger < 0.3) {
            f.happiness = Math.min(1, f.happiness + 0.0005);
        }

        // State machine
        if (f.scareTimer > 0) {
            f.state = 'scared';
            f.scareTimer--;
            const type = FISH_TYPES[f.type];
            if (type.inflates) f.inflated = true;
        } else if (isNight && Math.random() < 0.001 && f.state !== 'eating') {
            f.state = 'sleeping';
            if (FISH_TYPES[f.type].inflates) f.inflated = false;
        } else if (f.hunger > 0.6) {
            f.state = 'hungry';
            // Look for food
            f.targetFood = findNearestFood(f);
        } else if (f.state === 'sleeping' && !isNight) {
            f.state = 'idle';
        } else if (f.state !== 'eating' && f.state !== 'sleeping') {
            f.state = 'idle';
        }

        // Mouth animation
        f.mouthTimer++;
        if (f.mouthTimer > 40 + Math.random() * 60) {
            f.mouthOpen = !f.mouthOpen;
            f.mouthTimer = 0;
        }

        // Movement based on state
        switch (f.state) {
            case 'idle':
                // Gentle sine wave swimming
                f.vx += (Math.random() - 0.5) * 0.1;
                f.vy = Math.sin(f.animFrame * 0.03) * 0.3;
                f.vx = Math.max(-f.speed, Math.min(f.speed, f.vx));
                break;

            case 'hungry':
                if (f.targetFood) {
                    const dx = f.targetFood.x - f.x;
                    const dy = f.targetFood.y - f.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 15) {
                        // Eat!
                        f.state = 'eating';
                        f.stateTime = 0;
                        f.hunger = Math.max(0, f.hunger - 0.4);
                        f.happiness = Math.min(1, f.happiness + 0.15);
                        f.mouthOpen = true;
                        removeFoodPellet(f.targetFood);
                        f.targetFood = null;
                        playEatSound();
                    } else {
                        f.vx += (dx / dist) * 0.15;
                        f.vy += (dy / dist) * 0.12;
                    }
                } else {
                    // Swim faster looking for food
                    f.vx += (Math.random() - 0.5) * 0.2;
                    f.vy += (Math.random() - 0.5) * 0.15;
                }
                f.vx = Math.max(-f.speed * 1.5, Math.min(f.speed * 1.5, f.vx));
                f.vy = Math.max(-f.speed, Math.min(f.speed, f.vy));
                break;

            case 'eating':
                f.vx *= 0.9;
                f.vy *= 0.9;
                if (f.stateTime > 30) {
                    f.state = 'idle';
                    f.mouthOpen = false;
                }
                break;

            case 'scared':
                // Dart away
                f.vx += (Math.random() - 0.5) * 1.5;
                f.vy += (Math.random() - 0.5) * 1.0;
                f.vx = Math.max(-f.speed * 3, Math.min(f.speed * 3, f.vx));
                f.vy = Math.max(-f.speed * 2, Math.min(f.speed * 2, f.vy));
                break;

            case 'sleeping':
                // Float near bottom, gentle drift
                f.vx *= 0.95;
                f.vy += (SAND_Y - 60 - f.y) * 0.001;
                f.vy *= 0.95;
                break;
        }

        // Apply velocity
        f.x += f.vx;
        f.y += f.vy;

        // Friction
        f.vx *= 0.98;
        f.vy *= 0.97;

        // Bounds
        if (f.x < 30) { f.x = 30; f.vx = Math.abs(f.vx) * 0.5; }
        if (f.x > GAME_W - 30) { f.x = GAME_W - 30; f.vx = -Math.abs(f.vx) * 0.5; }
        if (f.y < WATER_TOP + 20) { f.y = WATER_TOP + 20; f.vy = Math.abs(f.vy) * 0.5; }
        if (f.y > SAND_Y - 30) { f.y = SAND_Y - 30; f.vy = -Math.abs(f.vy) * 0.3; }

        // Face direction of movement
        if (Math.abs(f.vx) > 0.1) {
            f.facing = f.vx > 0 ? 1 : -1;
        }

        // Deflate pufferfish over time
        if (f.inflated && f.scareTimer <= 0) {
            f.inflated = false;
        }
    }

    function findNearestFood(f) {
        let nearest = null, minDist = Infinity;
        for (const p of foodPellets) {
            const dx = p.x - f.x;
            const dy = p.y - f.y;
            const dist = dx * dx + dy * dy;
            if (dist < minDist) {
                minDist = dist;
                nearest = p;
            }
        }
        return minDist < 200 * 200 ? nearest : null;
    }

    function removeFoodPellet(pellet) {
        const idx = foodPellets.indexOf(pellet);
        if (idx >= 0) foodPellets.splice(idx, 1);
    }

    // ══════════════════════════════════════════════════════════
    //  FISH DRAWING
    // ══════════════════════════════════════════════════════════
    function drawFish(f) {
        const type = FISH_TYPES[f.type];
        const sz = f.size * 18;
        const swimWave = Math.sin(f.animFrame * 0.1) * 3;

        ctx.save();
        ctx.translate(f.x, f.y);
        if (f.facing === -1) ctx.scale(-1, 1);

        // Sleeping Z's
        if (f.state === 'sleeping') {
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = UI_CLR;
            ctx.font = '10px monospace';
            const zBob = Math.sin(f.animFrame * 0.05);
            ctx.fillText('z', 10 + zBob * 2, -sz - 5);
            ctx.font = '8px monospace';
            ctx.fillText('z', 16 + zBob * 3, -sz - 12);
            ctx.globalAlpha = 1;
        }

        // Body shape
        if (type.bodyShape === 'puffer' && f.inflated) {
            // Inflated pufferfish
            const puffSz = sz * 1.6;
            ctx.fillStyle = type.color1;
            ctx.beginPath();
            ctx.arc(0, 0, puffSz, 0, Math.PI * 2);
            ctx.fill();
            // Spines
            ctx.strokeStyle = type.color2;
            ctx.lineWidth = 1.5;
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * puffSz, Math.sin(a) * puffSz);
                ctx.lineTo(Math.cos(a) * (puffSz + 6), Math.sin(a) * (puffSz + 6));
                ctx.stroke();
            }
            // Eyes (wide scared)
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(puffSz * 0.35, -puffSz * 0.2, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(puffSz * 0.38, -puffSz * 0.2, 3, 0, Math.PI * 2);
            ctx.fill();
        } else if (type.bodyShape === 'tall') {
            // Angelfish - tall diamond-ish shape
            const bw = sz * 0.7, bh = sz * 1.4;
            ctx.fillStyle = type.color1;
            ctx.beginPath();
            ctx.moveTo(bw, 0);
            ctx.quadraticCurveTo(bw * 0.8, -bh * 0.5, 0, -bh * 0.6);
            ctx.quadraticCurveTo(-bw * 0.3, -bh * 0.3, -bw * 0.5, 0);
            ctx.quadraticCurveTo(-bw * 0.3, bh * 0.3, 0, bh * 0.6);
            ctx.quadraticCurveTo(bw * 0.8, bh * 0.5, bw, 0);
            ctx.fill();

            // Stripes
            if (type.stripes) {
                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.lineWidth = 2;
                for (let i = -2; i <= 2; i++) {
                    const sx = i * bw * 0.25;
                    ctx.beginPath();
                    ctx.moveTo(sx, -bh * 0.3);
                    ctx.lineTo(sx, bh * 0.3);
                    ctx.stroke();
                }
            }

            // Top/bottom fins
            ctx.fillStyle = type.color2;
            ctx.beginPath();
            ctx.moveTo(0, -bh * 0.6);
            ctx.quadraticCurveTo(-bw * 0.2, -bh * 0.9, -bw * 0.1, -bh * 0.6);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(0, bh * 0.6);
            ctx.quadraticCurveTo(-bw * 0.2, bh * 0.9, -bw * 0.1, bh * 0.6);
            ctx.fill();

            // Eye
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(bw * 0.4, -2, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(bw * 0.45, -2, 2, 0, Math.PI * 2);
            ctx.fill();
        } else if (type.bodyShape === 'sleek') {
            // Blue tang - sleek elongated
            const bw = sz * 1.2, bh = sz * 0.6;
            ctx.fillStyle = type.color1;
            ctx.beginPath();
            ctx.ellipse(0, 0, bw, bh, 0, 0, Math.PI * 2);
            ctx.fill();

            // Tail
            ctx.fillStyle = type.color2;
            ctx.beginPath();
            ctx.moveTo(-bw + 3, 0);
            ctx.lineTo(-bw - 8, -bh * 0.8 + swimWave);
            ctx.lineTo(-bw - 8, bh * 0.8 + swimWave);
            ctx.closePath();
            ctx.fill();

            // Dark marking
            ctx.fillStyle = 'rgba(0,0,30,0.3)';
            ctx.beginPath();
            ctx.ellipse(0, 0, bw * 0.6, bh * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();

            // Eye
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(bw * 0.55, -bh * 0.15, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(bw * 0.58, -bh * 0.15, 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Round body (goldfish, clownfish, pufferfish normal)
            const bw = sz * 1.0, bh = sz * 0.65;

            // Body
            ctx.fillStyle = type.color1;
            ctx.beginPath();
            ctx.ellipse(0, 0, bw, bh, 0, 0, Math.PI * 2);
            ctx.fill();

            // Tail fin
            ctx.fillStyle = type.color1;
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.moveTo(-bw + 2, 0);
            ctx.lineTo(-bw - 10, -bh * 0.9 + swimWave);
            ctx.quadraticCurveTo(-bw - 5, 0, -bw - 10, bh * 0.9 + swimWave);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;

            // Top fin
            ctx.fillStyle = type.color1;
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.moveTo(bw * 0.2, -bh);
            ctx.quadraticCurveTo(0, -bh - 8, -bw * 0.3, -bh + 2);
            ctx.lineTo(bw * 0.2, -bh + 3);
            ctx.fill();
            ctx.globalAlpha = 1;

            // Clown stripes
            if (type.clownStripes) {
                ctx.fillStyle = type.color2;
                ctx.beginPath();
                ctx.ellipse(bw * 0.3, 0, 3, bh * 0.85, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(-bw * 0.2, 0, 3, bh * 0.8, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(-bw * 0.65, 0, 2.5, bh * 0.6, 0, 0, Math.PI * 2);
                ctx.fill();
            }

            // Pufferfish spots
            if (type.bodyShape === 'puffer') {
                ctx.fillStyle = 'rgba(0,100,0,0.3)';
                for (let i = 0; i < 6; i++) {
                    const px = (Math.sin(i * 1.7) * bw * 0.5);
                    const py = (Math.cos(i * 2.3) * bh * 0.5);
                    ctx.beginPath();
                    ctx.arc(px, py, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // Eye
            const eyeX = bw * 0.5;
            const eyeY = -bh * 0.2;
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(eyeX, eyeY, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(eyeX + 1, eyeY, 2.2, 0, Math.PI * 2);
            ctx.fill();

            // Mouth
            if (f.mouthOpen || f.state === 'eating') {
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.beginPath();
                ctx.arc(bw * 0.85, bh * 0.1, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Hunger indicator (only when very hungry)
        if (f.hunger > 0.75 && f.state !== 'sleeping') {
            ctx.globalAlpha = (f.hunger - 0.75) * 4;
            ctx.fillStyle = '#FF6B6B';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('!', 0, -sz - 10);
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }

    // ══════════════════════════════════════════════════════════
    //  FOOD PELLETS
    // ══════════════════════════════════════════════════════════
    function dropFood(x, y) {
        if (foodPellets.length > 20) return; // limit
        foodPellets.push({
            x, y: Math.max(y, WATER_TOP + 5),
            vy: FOOD_SINK_SPEED,
            life: FOOD_LIFETIME,
            size: 3 + Math.random() * 2,
            color: Math.random() > 0.5 ? '#8B4513' : '#DAA520'
        });
        playFeedSound();
    }

    function updateFood() {
        for (let i = foodPellets.length - 1; i >= 0; i--) {
            const p = foodPellets[i];
            p.y += p.vy;
            p.vy *= 0.998; // slow down
            p.life--;

            // Gentle drift
            p.x += Math.sin(frameCount * 0.02 + i) * 0.2;

            // Hit sand
            if (p.y > SAND_Y - 5) {
                p.y = SAND_Y - 5;
                p.vy = 0;
            }

            if (p.life <= 0) foodPellets.splice(i, 1);
        }
    }

    function drawFood() {
        for (const p of foodPellets) {
            ctx.globalAlpha = Math.min(1, p.life / 60);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    // ══════════════════════════════════════════════════════════
    //  DECORATIONS
    // ══════════════════════════════════════════════════════════
    function initDecorations() {
        plants = [];
        // Seaweed plants
        for (let i = 0; i < 8; i++) {
            plants.push({
                x: 30 + Math.random() * (GAME_W - 60),
                height: 40 + Math.random() * 80,
                segments: 5 + Math.floor(Math.random() * 4),
                color: `hsl(${120 + Math.random() * 40}, ${50 + Math.random() * 30}%, ${25 + Math.random() * 20}%)`,
                phase: Math.random() * Math.PI * 2,
                width: 4 + Math.random() * 4
            });
        }

        decorations = [];
        // Castle
        decorations.push({
            type: 'castle', x: GAME_W * 0.7, y: SAND_Y
        });
        // Treasure chest
        decorations.push({
            type: 'chest', x: GAME_W * 0.25, y: SAND_Y,
            openTimer: 0, isOpen: false
        });
        // Rocks
        for (let i = 0; i < 4; i++) {
            decorations.push({
                type: 'rock',
                x: 50 + Math.random() * (GAME_W - 100),
                y: SAND_Y,
                size: 8 + Math.random() * 12,
                shade: Math.random() * 0.3
            });
        }
    }

    function drawPlants() {
        for (const p of plants) {
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.width;
            ctx.lineCap = 'round';

            const segH = p.height / p.segments;
            let px = p.x, py = SAND_Y;

            ctx.beginPath();
            ctx.moveTo(px, py);

            for (let s = 0; s < p.segments; s++) {
                const sway = Math.sin(frameCount * 0.02 + p.phase + s * 0.5) * (8 + s * 2);
                py -= segH;
                px = p.x + sway;
                ctx.lineTo(px, py);
            }
            ctx.stroke();

            // Leaf tips
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.ellipse(px, py, p.width * 1.5, 4, 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawDecorations() {
        for (const d of decorations) {
            if (d.type === 'castle') {
                drawCastle(d.x, d.y);
            } else if (d.type === 'chest') {
                d.openTimer++;
                if (d.openTimer > 200 + Math.random() * 200) {
                    d.isOpen = !d.isOpen;
                    d.openTimer = 0;
                    if (d.isOpen) {
                        // Spawn bubble from chest
                        spawnBubble(d.x, d.y - 15);
                    }
                }
                drawChest(d.x, d.y, d.isOpen);
            } else if (d.type === 'rock') {
                drawRock(d.x, d.y, d.size, d.shade);
            }
        }
    }

    function drawCastle(x, y) {
        // Main tower
        ctx.fillStyle = '#8B7355';
        ctx.fillRect(x - 20, y - 60, 40, 60);
        // Turrets
        ctx.fillRect(x - 28, y - 75, 16, 75);
        ctx.fillRect(x + 12, y - 75, 16, 75);
        // Battlements
        ctx.fillStyle = '#7A6248';
        for (let i = 0; i < 3; i++) {
            ctx.fillRect(x - 28 + i * 6, y - 80, 4, 5);
            ctx.fillRect(x + 12 + i * 6, y - 80, 4, 5);
        }
        // Door
        ctx.fillStyle = '#3A2A1A';
        ctx.beginPath();
        ctx.arc(x, y - 12, 8, Math.PI, 0);
        ctx.fillRect(x - 8, y - 12, 16, 12);
        ctx.fill();
        // Window
        ctx.fillStyle = '#4A8BC2';
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(x, y - 38, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    function drawChest(x, y, isOpen) {
        // Body
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(x - 15, y - 15, 30, 15);
        // Lid
        ctx.fillStyle = '#A0522D';
        if (isOpen) {
            ctx.save();
            ctx.translate(x - 15, y - 15);
            ctx.rotate(-0.6);
            ctx.fillRect(0, -12, 30, 12);
            ctx.restore();
        } else {
            ctx.fillRect(x - 15, y - 27, 30, 12);
        }
        // Metal bands
        ctx.strokeStyle = '#DAA520';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 15, y - 15, 30, 15);
        // Lock
        ctx.fillStyle = '#DAA520';
        ctx.beginPath();
        ctx.arc(x, y - 15, 3, 0, Math.PI * 2);
        ctx.fill();
        // Sparkle when open
        if (isOpen) {
            ctx.fillStyle = '#FFD700';
            ctx.globalAlpha = Math.sin(frameCount * 0.1) * 0.3 + 0.5;
            ctx.beginPath();
            ctx.arc(x, y - 20, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    function drawRock(x, y, size, shade) {
        ctx.fillStyle = `hsl(30, 10%, ${35 - shade * 20}%)`;
        ctx.beginPath();
        ctx.ellipse(x, y - size * 0.3, size, size * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.ellipse(x - size * 0.2, y - size * 0.5, size * 0.3, size * 0.15, -0.3, 0, Math.PI * 2);
        ctx.fill();
    }

    // ══════════════════════════════════════════════════════════
    //  BUBBLES
    // ══════════════════════════════════════════════════════════
    function spawnBubble(x, y) {
        bubbles.push({
            x: x || 30 + Math.random() * (GAME_W - 60),
            y: y || SAND_Y - Math.random() * 20,
            size: 2 + Math.random() * 5,
            speed: 0.5 + Math.random() * 1.0,
            wobble: Math.random() * Math.PI * 2
        });
    }

    function updateBubbles() {
        bubbleTimer++;
        if (bubbleTimer > 40 + Math.random() * 60) {
            spawnBubble();
            bubbleTimer = 0;
            if (Math.random() < 0.3) playBubbleSound();
        }

        for (let i = bubbles.length - 1; i >= 0; i--) {
            const b = bubbles[i];
            b.y -= b.speed;
            b.x += Math.sin(frameCount * 0.03 + b.wobble) * 0.3;
            if (b.y < WATER_TOP) bubbles.splice(i, 1);
        }
    }

    function drawBubbles() {
        for (const b of bubbles) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
            ctx.stroke();
            // Highlight
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.beginPath();
            ctx.arc(b.x - b.size * 0.3, b.y - b.size * 0.3, b.size * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ══════════════════════════════════════════════════════════
    //  WATER CAUSTICS
    // ══════════════════════════════════════════════════════════
    function drawCaustics() {
        causticTime += 0.015;
        const nightFactor = getNightFactor();
        const intensity = 0.08 * (1 - nightFactor * 0.7);

        ctx.globalAlpha = intensity;
        ctx.fillStyle = '#FFFFFF';

        for (let i = 0; i < 12; i++) {
            const cx = (Math.sin(causticTime + i * 1.3) * 0.5 + 0.5) * GAME_W;
            const cy = WATER_TOP + 5 + Math.sin(causticTime * 0.7 + i * 0.8) * 15;
            const w = 30 + Math.sin(causticTime * 0.5 + i) * 15;
            const h = 8 + Math.sin(causticTime * 0.8 + i * 1.5) * 4;

            ctx.beginPath();
            ctx.ellipse(cx, cy, w, h, Math.sin(causticTime + i) * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Ripple lines across the top
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            for (let x = 0; x < GAME_W; x += 10) {
                const y = WATER_TOP + 10 + i * 8 + Math.sin(x * 0.02 + causticTime + i) * 3;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
    }

    // ══════════════════════════════════════════════════════════
    //  DAY/NIGHT CYCLE
    // ══════════════════════════════════════════════════════════
    function getNightFactor() {
        // 0 = full day, 1 = full night
        if (dayTime > 0.7 || dayTime < 0.15) {
            if (dayTime > 0.7) return Math.min(1, (dayTime - 0.7) / 0.15);
            return Math.max(0, 1 - dayTime / 0.15);
        }
        return 0;
    }

    function drawBackground() {
        const nightFactor = getNightFactor();

        // Sky/water gradient
        const dayTop = [10, 80, 140];
        const dayBot = [10, 42, 74];
        const nightTop = [5, 10, 30];
        const nightBot = [2, 5, 15];

        const topR = Math.floor(dayTop[0] + (nightTop[0] - dayTop[0]) * nightFactor);
        const topG = Math.floor(dayTop[1] + (nightTop[1] - dayTop[1]) * nightFactor);
        const topB = Math.floor(dayTop[2] + (nightTop[2] - dayTop[2]) * nightFactor);
        const botR = Math.floor(dayBot[0] + (nightBot[0] - dayBot[0]) * nightFactor);
        const botG = Math.floor(dayBot[1] + (nightBot[1] - dayBot[1]) * nightFactor);
        const botB = Math.floor(dayBot[2] + (nightBot[2] - dayBot[2]) * nightFactor);

        const grd = ctx.createLinearGradient(0, 0, 0, GAME_H);
        grd.addColorStop(0, `rgb(${topR},${topG},${topB})`);
        grd.addColorStop(0.7, `rgb(${botR},${botG},${botB})`);
        grd.addColorStop(1, `rgb(${Math.floor(botR*0.7)},${Math.floor(botG*0.6)},${Math.floor(botB*0.5)})`);
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Water surface line
        ctx.strokeStyle = `rgba(150, 200, 255, ${0.3 - nightFactor * 0.2})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 0; x < GAME_W; x += 5) {
            const y = WATER_TOP + Math.sin(x * 0.03 + frameCount * 0.03) * 3;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Sandy bottom
        const sandGrd = ctx.createLinearGradient(0, SAND_Y, 0, GAME_H);
        sandGrd.addColorStop(0, `hsl(35, 50%, ${30 - nightFactor * 15}%)`);
        sandGrd.addColorStop(1, `hsl(30, 40%, ${20 - nightFactor * 10}%)`);
        ctx.fillStyle = sandGrd;
        ctx.fillRect(0, SAND_Y, GAME_W, GAME_H - SAND_Y);

        // Sand texture
        ctx.fillStyle = `rgba(255, 220, 150, ${0.05 - nightFactor * 0.03})`;
        for (let i = 0; i < 40; i++) {
            const sx = (i * 37 + 13) % GAME_W;
            const sy = SAND_Y + 5 + (i * 23) % (GAME_H - SAND_Y - 10);
            ctx.beginPath();
            ctx.arc(sx, sy, 1 + (i % 3), 0, Math.PI * 2);
            ctx.fill();
        }

        // Light rays (daytime only)
        if (nightFactor < 0.5) {
            ctx.globalAlpha = 0.03 * (1 - nightFactor * 2);
            ctx.fillStyle = '#FFFFFF';
            for (let i = 0; i < 4; i++) {
                const rx = 80 + i * 160 + Math.sin(frameCount * 0.005 + i) * 30;
                ctx.beginPath();
                ctx.moveTo(rx - 15, WATER_TOP);
                ctx.lineTo(rx + 40, SAND_Y);
                ctx.lineTo(rx - 40, SAND_Y);
                ctx.closePath();
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
    }

    // ══════════════════════════════════════════════════════════
    //  HUD
    // ══════════════════════════════════════════════════════════
    function drawHUD() {
        // Glass frame top
        ctx.fillStyle = 'rgba(100, 150, 200, 0.15)';
        ctx.fillRect(0, 0, GAME_W, WATER_TOP);

        // Score
        ctx.fillStyle = UI_CLR;
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`Score: ${Math.floor(score)}`, 10, 20);

        // Fish count
        ctx.textAlign = 'center';
        ctx.fillText(`\uD83D\uDC1F ${fish.length}/${MAX_FISH}`, GAME_W / 2, 20);

        // Day/night indicator
        ctx.textAlign = 'right';
        const nightFactor = getNightFactor();
        const timeIcon = nightFactor > 0.5 ? '\u263E' : '\u2600';
        ctx.fillText(`${timeIcon} ${nightFactor > 0.5 ? 'Night' : 'Day'}`, GAME_W - 10, 20);

        // Average happiness bar
        const avgHappy = fish.length > 0
            ? fish.reduce((s, f) => s + f.happiness, 0) / fish.length
            : 0;
        const barW = 100, barH = 6, barX = GAME_W / 2 - barW / 2, barY = 4;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(barX, barY, barW, barH);
        const happyColor = avgHappy > 0.6 ? '#4ADE80' : avgHappy > 0.3 ? '#FBBF24' : '#F87171';
        ctx.fillStyle = happyColor;
        ctx.fillRect(barX, barY, barW * avgHappy, barH);

        // Touch hint
        if (frameCount < 300) {
            ctx.globalAlpha = 1 - frameCount / 300;
            ctx.fillStyle = UI_CLR;
            ctx.font = '12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('Tap to drop food!', GAME_W / 2, GAME_H - 15);
            ctx.globalAlpha = 1;
        }
    }

    // ══════════════════════════════════════════════════════════
    //  TITLE SCREEN
    // ══════════════════════════════════════════════════════════
    let titleState = true;

    function drawTitleScreen() {
        drawBackground();
        drawCaustics();

        // Draw some demo fish
        const demoFish = [
            { x: 200, y: 200, facing: 1, animFrame: frameCount, size: 1.2, state: 'idle', hunger: 0.2, happiness: 0.9, mouthOpen: false, mouthTimer: 0, stateTime: 0, type: 'goldfish', inflated: false, scareTimer: 0, vx: 1, vy: 0 },
            { x: 400, y: 250, facing: -1, animFrame: frameCount + 30, size: 1.0, state: 'idle', hunger: 0.2, happiness: 0.9, mouthOpen: false, mouthTimer: 0, stateTime: 0, type: 'angelfish', inflated: false, scareTimer: 0, vx: -0.5, vy: 0 },
            { x: 320, y: 160, facing: 1, animFrame: frameCount + 60, size: 0.9, state: 'idle', hunger: 0.2, happiness: 0.9, mouthOpen: true, mouthTimer: 0, stateTime: 0, type: 'clownfish', inflated: false, scareTimer: 0, vx: 0.8, vy: 0 },
        ];
        for (const df of demoFish) {
            df.x += Math.sin(frameCount * 0.01 + df.y) * 0.5;
            df.y += Math.cos(frameCount * 0.015 + df.x * 0.01) * 0.3;
            drawFish(df);
        }

        drawBubbles();

        // Title overlay
        ctx.fillStyle = 'rgba(0, 20, 50, 0.5)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.fillStyle = UI_CLR;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Title with wave effect
        ctx.font = 'bold 40px monospace';
        ctx.shadowColor = ACCENT_CLR;
        ctx.shadowBlur = 20;
        const titleY = GAME_H / 2 - 50 + Math.sin(frameCount * 0.03) * 5;
        ctx.fillText('AQUARIUM', GAME_W / 2, titleY);
        ctx.shadowBlur = 0;

        ctx.font = '16px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText('A Zen Fish Tank Experience', GAME_W / 2, titleY + 35);

        // Start prompt
        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink) {
            ctx.fillStyle = UI_CLR;
            ctx.font = '15px monospace';
            ctx.fillText(touchActive ? 'TAP TO START' : 'PRESS ENTER TO START', GAME_W / 2, GAME_H / 2 + 50);
        }

        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '11px monospace';
        ctx.fillText('Click/tap to feed fish \u2022 Keep them happy!', GAME_W / 2, GAME_H / 2 + 85);
        ctx.textBaseline = 'alphabetic';
    }

    // ══════════════════════════════════════════════════════════
    //  UNLOCK SYSTEM
    // ══════════════════════════════════════════════════════════
    let unlockMessage = '';
    let unlockTimer = 0;

    function checkUnlocks() {
        const typeKeys = Object.keys(FISH_TYPES);
        for (const key of typeKeys) {
            if (!unlockedTypes.includes(key) && score >= FISH_TYPES[key].unlockScore) {
                unlockedTypes.push(key);
                unlockMessage = `New fish unlocked: ${FISH_TYPES[key].name}!`;
                unlockTimer = 180;
                playUnlockSound();
                // Auto-add new fish
                if (fish.length < MAX_FISH) {
                    fish.push(createFish(key));
                }
            }
        }

        // Add fish as reward for happiness
        if (fish.length < MAX_FISH && score > 0 && score % 500 < 10 && frameCount % 60 === 0) {
            const available = unlockedTypes.slice();
            const typeKey = available[Math.floor(Math.random() * available.length)];
            fish.push(createFish(typeKey));
            unlockMessage = `A new ${FISH_TYPES[typeKey].name} has arrived!`;
            unlockTimer = 120;
        }
    }

    function drawUnlockMessage() {
        if (unlockTimer <= 0) return;
        unlockTimer--;

        const alpha = unlockTimer > 30 ? 1 : unlockTimer / 30;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.roundRect(GAME_W / 2 - 160, GAME_H / 2 - 25, 320, 50, 10);
        ctx.fill();
        ctx.fillStyle = ACCENT_CLR;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(unlockMessage, GAME_W / 2, GAME_H / 2);
        ctx.textBaseline = 'alphabetic';
        ctx.globalAlpha = 1;
    }

    // ══════════════════════════════════════════════════════════
    //  FISH INFO POPUP
    // ══════════════════════════════════════════════════════════
    let selectedFish = null;
    let infoTimer = 0;

    function showFishInfo(f) {
        selectedFish = f;
        infoTimer = 180;
    }

    function drawFishInfo() {
        if (!selectedFish || infoTimer <= 0) { selectedFish = null; return; }
        infoTimer--;

        const f = selectedFish;
        const type = FISH_TYPES[f.type];
        const alpha = infoTimer > 30 ? 1 : infoTimer / 30;

        ctx.globalAlpha = alpha;

        const px = Math.min(GAME_W - 140, Math.max(10, f.x - 65));
        const py = Math.max(WATER_TOP + 10, f.y - 75);

        ctx.fillStyle = 'rgba(0, 20, 40, 0.85)';
        ctx.beginPath();
        ctx.roundRect(px, py, 130, 60, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = UI_CLR;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(type.name, px + 8, py + 16);

        ctx.font = '9px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        const hungerLabel = f.hunger < 0.3 ? 'Full' : f.hunger < 0.6 ? 'OK' : 'Hungry!';
        const happyLabel = f.happiness > 0.7 ? 'Happy' : f.happiness > 0.4 ? 'OK' : 'Sad';
        ctx.fillText(`Hunger: ${hungerLabel}`, px + 8, py + 32);
        ctx.fillText(`Mood: ${happyLabel}`, px + 8, py + 46);

        // Mini happiness bar
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(px + 80, py + 38, 40, 5);
        ctx.fillStyle = f.happiness > 0.6 ? '#4ADE80' : '#FBBF24';
        ctx.fillRect(px + 80, py + 38, 40 * f.happiness, 5);

        ctx.globalAlpha = 1;
    }

    // ══════════════════════════════════════════════════════════
    //  INPUT
    // ══════════════════════════════════════════════════════════
    function onClick(e) {
        ensureAudio();
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width * GAME_W;
        const y = (e.clientY - rect.top) / rect.height * GAME_H;

        if (titleState) {
            startGame();
            return;
        }

        // Check if clicking a fish
        for (const f of fish) {
            const dist = Math.sqrt((f.x - x) * (f.x - x) + (f.y - y) * (f.y - y));
            if (dist < 25) {
                showFishInfo(f);
                return;
            }
        }

        // Scare nearby fish
        for (const f of fish) {
            const dist = Math.sqrt((f.x - x) * (f.x - x) + (f.y - y) * (f.y - y));
            if (dist < 80) {
                f.scareTimer = 30;
                f.vx += (f.x - x) * 0.1;
                f.vy += (f.y - y) * 0.08;
            }
        }

        // Drop food if in water
        if (y > WATER_TOP && y < SAND_Y - 20) {
            dropFood(x, y);
        }
    }

    function onTouchStart(e) {
        touchActive = true;
        for (const t of e.changedTouches) {
            onClick({ clientX: t.clientX, clientY: t.clientY });
        }
    }

    function onKeyDown(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            if (titleState) {
                ensureAudio();
                startGame();
            }
        }
    }

    // ══════════════════════════════════════════════════════════
    //  GAME FLOW
    // ══════════════════════════════════════════════════════════
    function startGame() {
        titleState = false;
        gameActive = true;
        score = 0;
        totalHappiness = 0;
        scoreCallbackSent = false;
        unlockedTypes = ['goldfish', 'angelfish'];
        nextUnlock = 0;
        frameCount = 0;
        startTime = Date.now();
        foodPellets = [];
        bubbles = [];
        unlockMessage = '';
        unlockTimer = 0;
        selectedFish = null;
        infoTimer = 0;

        // Initial fish
        fish = [];
        fish.push(createFish('goldfish', 200, 200));
        fish.push(createFish('goldfish', 400, 250));
        fish.push(createFish('angelfish', 300, 180));

        initDecorations();
        startAmbient();
    }

    // ══════════════════════════════════════════════════════════
    //  MAIN LOOP
    // ══════════════════════════════════════════════════════════
    function update() {
        frameCount++;
        dayTime = ((frameCount * (1 / 60)) / DAY_CYCLE_DURATION) % 1;

        if (titleState) {
            updateBubbles();
            return;
        }

        // Update fish
        for (const f of fish) {
            updateFish(f);
        }

        updateFood();
        updateBubbles();

        // Score based on happiness
        if (frameCount % SCORE_INTERVAL === 0) {
            const avgHappy = fish.length > 0
                ? fish.reduce((s, f) => s + f.happiness, 0) / fish.length
                : 0;
            score += Math.floor(avgHappy * 50 * fish.length);
            totalHappiness += avgHappy;
        }

        // Check unlocks
        checkUnlocks();

        // Score callback after 5 minutes
        if (!scoreCallbackSent && frameCount >= SCORE_CALLBACK_TIME) {
            scoreCallbackSent = true;
            if (onGameOver) onGameOver(Math.floor(score));
        }
    }

    function draw() {
        if (titleState) {
            drawTitleScreen();
            return;
        }

        drawBackground();
        drawCaustics();
        drawPlants();
        drawDecorations();
        drawFood();

        // Draw fish sorted by y for depth
        const sortedFish = fish.slice().sort((a, b) => a.y - b.y);
        for (const f of sortedFish) {
            drawFish(f);
        }

        drawBubbles();
        drawHUD();
        drawUnlockMessage();
        drawFishInfo();
    }

    function loop() {
        if (!canvas) return;
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
            ACCENT_CLR = _t.colors?.[0] || ACCENT_CLR;
        }

        frameCount = 0;
        titleState = true;
        gameActive = false;
        touchActive = false;
        fish = [];
        foodPellets = [];
        bubbles = [];
        plants = [];
        decorations = [];
        score = 0;
        scoreCallbackSent = false;
        selectedFish = null;
        infoTimer = 0;
        unlockTimer = 0;
        causticTime = 0;
        bubbleTimer = 0;

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        // Bind events
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', onResize);
        canvas.addEventListener('click', onClick);
        canvas.addEventListener('touchstart', onTouchStart, { passive: true });

        animFrame = requestAnimationFrame(loop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;

        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('resize', onResize);

        if (canvas) {
            canvas.removeEventListener('click', onClick);
            canvas.removeEventListener('touchstart', onTouchStart);
        }
        canvas = null;
        ctx = null;

        stopAmbient();
        if (audioCtx) {
            try { audioCtx.close(); } catch { /* ignore */ }
            audioCtx = null;
        }
    }

    return {
        init,
        destroy,
        getScore()  { return Math.floor(score); },
        getLevel()  { return fish.length; },
        isActive()  { return gameActive; }
    };
})();
