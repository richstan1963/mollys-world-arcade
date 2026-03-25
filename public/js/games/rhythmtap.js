/* RhythmTap — Theme-aware rhythm / music tap game for Your World Arcade
 * Procedurally-generated beats via Web Audio oscillators & noise.
 * 4 lanes, neon aesthetic, combo system, S–F grading.
 * Canvas 2D, zero external dependencies. */
window.RhythmTap = (() => {
    // ── Constants ──
    const GAME_W = 480, GAME_H = 640;
    const HIT_Y_RATIO = 0.82;          // hit-zone position (fraction of GAME_H)
    const HIT_TOLERANCE_PX = 38;       // pixels from centre for Perfect
    const GREAT_TOL = 60;
    const GOOD_TOL = 90;
    const NOTE_SPEED_BASE = 3.2;       // px per tick at Normal
    const SPAWN_Y = -30;
    const JUDGEMENT_FADE = 600;         // ms for judgement text to fade
    const COMBO_FIRE_THRESHOLD = 10;
    const BPM_BASE = 120;

    // Difficulty presets  { lanes, speed multiplier, spawn density }
    const DIFFICULTIES = {
        easy:   { lanes: 2, speedMul: 0.55, density: 0.38, label: 'EASY', toleranceMul: 1.5 },
        normal: { lanes: 3, speedMul: 1.0,  density: 0.75, label: 'NORMAL' },
        hard:   { lanes: 4, speedMul: 1.3,  density: 1.0,  label: 'HARD' }
    };

    // Lane colors (neon palette)
    const LANE_NEON = ['#FF2D87', '#00E5FF', '#76FF03', '#FFD600'];
    const LANE_KEYS = ['d', 'f', 'j', 'k'];

    // ── State ──
    let canvas, ctx;
    let W, H, DPR;
    let player = null, onGameOver = null;
    let gameActive = false, paused = false;
    let animFrame = null;
    let frameCount = 0, lastTime = 0, startTime = 0;
    let score = 0, combo = 0, maxCombo = 0;
    let perfects = 0, greats = 0, goods = 0, misses = 0, totalNotes = 0;
    let difficulty = 'normal';
    let diffConfig = DIFFICULTIES.normal;
    let phase = 'menu';               // menu | playing | results
    let menuSel = 1;                  // 0=easy,1=normal,2=hard
    let laneCount = 4;
    let laneW = 0, hitY = 0;
    let noteSpeed = NOTE_SPEED_BASE;
    let notes = [];                    // {lane, y, hit:false, missed:false, time}
    let judgements = [];               // {text, x, y, color, alpha, time}
    let hitEffects = [];               // {x, y, color, t, type}
    let particles = [];
    let bgPulse = 0;
    let beatTimer = 0, beatInterval = 0;
    let songTimer = 0;
    let songDuration = 60;             // seconds
    let nextSpawnBeat = 0;
    let patternBank = [];
    let patternIdx = 0;
    let keyStates = {};

    // Theme
    let theme = null;
    let BG_GRAD = ['#0A001A', '#050010'];
    let ACCENT = '#FF2D87';

    // ── Audio ──
    let audioCtx = null;
    let masterGain = null;
    let kickOsc = null;
    let bassLine = null;
    let melodyTimer = null;
    let audioStartTime = 0;
    let lastKickTime = 0;
    let melodyNotes = [];
    let melodyIdx = 0;

    function getAudioCtx() {
        if (!audioCtx) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                masterGain = audioCtx.createGain();
                masterGain.gain.value = 0.35;
                masterGain.connect(audioCtx.destination);
            } catch (e) { /* no audio */ }
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
    //  PROCEDURAL MUSIC ENGINE
    // ══════════════════════════════════════════════

    // Kick drum: short sine sweep + noise burst
    function playKick(time) {
        const ac = getAudioCtx(); if (!ac || !masterGain) return;
        try {
            const osc = ac.createOscillator();
            const g = ac.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, time);
            osc.frequency.exponentialRampToValueAtTime(30, time + 0.12);
            g.gain.setValueAtTime(0.7, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
            osc.connect(g); g.connect(masterGain);
            osc.start(time); osc.stop(time + 0.2);
        } catch {}
    }

    // Hi-hat: filtered noise
    function playHiHat(time, accent) {
        const ac = getAudioCtx(); if (!ac || !masterGain) return;
        try {
            const bufSize = ac.sampleRate * 0.04;
            const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
            const src = ac.createBufferSource();
            src.buffer = buf;
            const hp = ac.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.value = 7000;
            const g = ac.createGain();
            g.gain.setValueAtTime(accent ? 0.18 : 0.09, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + (accent ? 0.06 : 0.03));
            src.connect(hp); hp.connect(g); g.connect(masterGain);
            src.start(time); src.stop(time + 0.06);
        } catch {}
    }

    // Snare: noise + tone
    function playSnare(time) {
        const ac = getAudioCtx(); if (!ac || !masterGain) return;
        try {
            // Noise part
            const bufSize = ac.sampleRate * 0.1;
            const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
            const nSrc = ac.createBufferSource();
            nSrc.buffer = buf;
            const bp = ac.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = 4000;
            const nG = ac.createGain();
            nG.gain.setValueAtTime(0.25, time);
            nG.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
            nSrc.connect(bp); bp.connect(nG); nG.connect(masterGain);
            nSrc.start(time); nSrc.stop(time + 0.12);
            // Tone part
            const osc = ac.createOscillator();
            const g = ac.createGain();
            osc.type = 'triangle';
            osc.frequency.value = 180;
            g.gain.setValueAtTime(0.3, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
            osc.connect(g); g.connect(masterGain);
            osc.start(time); osc.stop(time + 0.1);
        } catch {}
    }

    // Synth melody note
    function playMelody(time, freq, dur) {
        const ac = getAudioCtx(); if (!ac || !masterGain) return;
        try {
            const osc = ac.createOscillator();
            const osc2 = ac.createOscillator();
            const g = ac.createGain();
            osc.type = 'sawtooth';
            osc.frequency.value = freq;
            osc2.type = 'square';
            osc2.frequency.value = freq * 1.005; // slight detune
            const lp = ac.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.setValueAtTime(2000, time);
            lp.frequency.exponentialRampToValueAtTime(400, time + dur);
            g.gain.setValueAtTime(0.08, time);
            g.gain.setValueAtTime(0.08, time + dur * 0.7);
            g.gain.exponentialRampToValueAtTime(0.001, time + dur);
            osc.connect(lp); osc2.connect(lp);
            lp.connect(g); g.connect(masterGain);
            osc.start(time); osc.stop(time + dur);
            osc2.start(time); osc2.stop(time + dur);
        } catch {}
    }

    // Bass line note
    function playBass(time, freq, dur) {
        const ac = getAudioCtx(); if (!ac || !masterGain) return;
        try {
            const osc = ac.createOscillator();
            const g = ac.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            g.gain.setValueAtTime(0.15, time);
            g.gain.setValueAtTime(0.15, time + dur * 0.6);
            g.gain.exponentialRampToValueAtTime(0.001, time + dur);
            osc.connect(g); g.connect(masterGain);
            osc.start(time); osc.stop(time + dur);
        } catch {}
    }

    // Sound for note hit
    function playHitSound(lane, judgement) {
        const ac = getAudioCtx(); if (!ac || !masterGain) return;
        try {
            const freq = [330, 440, 550, 660][lane % 4];
            const mul = judgement === 'PERFECT' ? 1.5 : judgement === 'GREAT' ? 1.2 : 1.0;
            const osc = ac.createOscillator();
            const g = ac.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq * mul;
            g.gain.setValueAtTime(0.12, ac.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
            osc.connect(g); g.connect(masterGain);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.15);
        } catch {}
    }

    function playMissSound() {
        const ac = getAudioCtx(); if (!ac || !masterGain) return;
        try {
            const osc = ac.createOscillator();
            const g = ac.createGain();
            osc.type = 'sawtooth';
            osc.frequency.value = 80;
            g.gain.setValueAtTime(0.06, ac.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
            osc.connect(g); g.connect(masterGain);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.2);
        } catch {}
    }

    // ── Generate procedural beat schedule ──
    // Each "beat" triggers drum sounds; melody & bass are pre-scheduled
    const SCALE_FREQS = [261.6, 293.7, 329.6, 349.2, 392.0, 440.0, 493.9, 523.3]; // C major
    const BASS_FREQS  = [65.4, 73.4, 82.4, 87.3, 98.0, 110.0];

    function buildMelody() {
        melodyNotes = [];
        const count = Math.floor(songDuration * 2); // ~2 notes/sec
        for (let i = 0; i < count; i++) {
            melodyNotes.push({
                freq: SCALE_FREQS[Math.floor(Math.random() * SCALE_FREQS.length)],
                time: i * 0.5 + Math.random() * 0.15,
                dur: 0.2 + Math.random() * 0.3
            });
        }
    }

    function scheduleMusicChunk(fromTime, toTime) {
        const ac = getAudioCtx(); if (!ac) return;
        const secPerBeat = 60 / BPM_BASE;
        // Drums
        for (let t = fromTime; t < toTime; t += secPerBeat) {
            const beatInMeasure = Math.round((t % (secPerBeat * 4)) / secPerBeat);
            const absT = audioStartTime + t;
            if (absT <= ac.currentTime) continue;
            playKick(absT);
            if (beatInMeasure === 2) playSnare(absT);
            playHiHat(absT, beatInMeasure === 0);
            // Offbeat hi-hat
            if (Math.random() > 0.3) playHiHat(absT + secPerBeat * 0.5, false);
        }
        // Melody
        for (const n of melodyNotes) {
            if (n.time >= fromTime && n.time < toTime) {
                const absT = audioStartTime + n.time;
                if (absT > ac.currentTime) playMelody(absT, n.freq, n.dur);
            }
        }
        // Bass (every 2 beats)
        for (let t = fromTime; t < toTime; t += (60 / BPM_BASE) * 2) {
            const absT = audioStartTime + t;
            if (absT <= ac.currentTime) continue;
            playBass(absT, BASS_FREQS[Math.floor(Math.random() * BASS_FREQS.length)], 0.4);
        }
    }

    let lastScheduledTime = 0;
    function scheduleAhead() {
        const ac = getAudioCtx(); if (!ac) return;
        const elapsed = ac.currentTime - audioStartTime;
        const lookAhead = elapsed + 2.0; // schedule 2s ahead
        if (lookAhead > lastScheduledTime) {
            scheduleMusicChunk(lastScheduledTime, lookAhead);
            lastScheduledTime = lookAhead;
        }
    }

    function startMusic() {
        const ac = getAudioCtx(); if (!ac) return;
        if (ac.state === 'suspended') ac.resume();
        audioStartTime = ac.currentTime + 0.1;
        lastScheduledTime = 0;
        buildMelody();
        scheduleMusicChunk(0, 3.0);
        lastScheduledTime = 3.0;
    }

    // ══════════════════════════════════════════════
    //  NOTE PATTERN GENERATION
    // ══════════════════════════════════════════════

    function buildPatterns() {
        patternBank = [];
        const secPerBeat = 60 / BPM_BASE;
        const totalBeats = Math.floor(songDuration / secPerBeat);
        let t = 1.5; // start after short intro
        const lanes = diffConfig.lanes;
        const laneOffset = Math.floor((4 - lanes) / 2); // centre the lanes

        for (let b = 0; b < totalBeats; b++) {
            // Probability of spawning a note on this beat
            if (Math.random() < diffConfig.density) {
                const lane = laneOffset + Math.floor(Math.random() * lanes);
                patternBank.push({ time: t, lane: lane });
                // Occasional doubles on hard
                if (difficulty === 'hard' && Math.random() < 0.2) {
                    let lane2 = laneOffset + Math.floor(Math.random() * lanes);
                    if (lane2 === lane) lane2 = laneOffset + ((lane - laneOffset + 1) % lanes);
                    patternBank.push({ time: t, lane: lane2 });
                }
            }
            // Occasional off-beat notes
            if (Math.random() < diffConfig.density * 0.35) {
                const lane = laneOffset + Math.floor(Math.random() * lanes);
                patternBank.push({ time: t + secPerBeat * 0.5, lane: lane });
            }
            t += secPerBeat;
        }
        patternBank.sort((a, b) => a.time - b.time);
        totalNotes = patternBank.length;
        patternIdx = 0;
    }

    // ══════════════════════════════════════════════
    //  THEME SETUP
    // ══════════════════════════════════════════════

    function loadTheme() {
        const themeId = player?.theme || 'retro';
        theme = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (theme) {
            const c = theme.colors || {};
            BG_GRAD = [c.bgDark || '#0A001A', c.bgLight || '#050010'];
            ACCENT = c.accent || c.primary || '#FF2D87';
        } else {
            BG_GRAD = ['#0A001A', '#050010'];
            ACCENT = '#FF2D87';
        }
    }

    // ══════════════════════════════════════════════
    //  DRAWING HELPERS
    // ══════════════════════════════════════════════

    function laneX(lane) {
        const totalLanes = 4;
        const totalW = totalLanes * laneW;
        const startX = (W - totalW) / 2;
        return startX + lane * laneW + laneW / 2;
    }

    function drawBg() {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, BG_GRAD[0]);
        grad.addColorStop(1, BG_GRAD[1]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Subtle beat pulse overlay
        if (bgPulse > 0) {
            ctx.fillStyle = `rgba(255,255,255,${bgPulse * 0.04})`;
            ctx.fillRect(0, 0, W, H);
        }

        // Vertical lane separators
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        const totalLanes = 4;
        const totalW = totalLanes * laneW;
        const startX = (W - totalW) / 2;
        for (let i = 0; i <= totalLanes; i++) {
            const x = startX + i * laneW;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }

        // Lane highlight for active lanes
        const lanes = diffConfig.lanes;
        const laneOff = Math.floor((4 - lanes) / 2);
        for (let i = 0; i < lanes; i++) {
            const lane = laneOff + i;
            const x = startX + lane * laneW;
            const grad2 = ctx.createLinearGradient(x, 0, x, H);
            grad2.addColorStop(0, 'rgba(255,255,255,0)');
            grad2.addColorStop(0.7, `rgba(${hexToRgb(LANE_NEON[lane])},0.03)`);
            grad2.addColorStop(1, `rgba(${hexToRgb(LANE_NEON[lane])},0.08)`);
            ctx.fillStyle = grad2;
            ctx.fillRect(x, 0, laneW, H);
        }
    }

    function hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r},${g},${b}`;
    }

    function drawHitZone() {
        // Glowing line across hit zone
        const y = hitY;
        const pulseIntensity = 0.5 + Math.sin(frameCount * 0.08) * 0.3;

        // Outer glow
        ctx.shadowColor = ACCENT;
        ctx.shadowBlur = 20 * pulseIntensity;
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.6 + pulseIntensity * 0.3;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // Lane target circles
        const lanes = diffConfig.lanes;
        const laneOff = Math.floor((4 - lanes) / 2);
        for (let i = 0; i < lanes; i++) {
            const lane = laneOff + i;
            const x = laneX(lane);
            const color = LANE_NEON[lane];
            // Outer ring
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.globalAlpha = 0.35 + pulseIntensity * 0.15;
            ctx.beginPath();
            ctx.arc(x, y, laneW * 0.3, 0, Math.PI * 2);
            ctx.stroke();
            // Inner dim circle
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.08;
            ctx.beginPath();
            ctx.arc(x, y, laneW * 0.28, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            // Key label
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.font = `bold ${Math.round(14 * DPR)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(LANE_KEYS[lane].toUpperCase(), x, y + laneW * 0.45);
        }
    }

    function drawNote(note) {
        const x = laneX(note.lane);
        const y = note.y;
        const color = LANE_NEON[note.lane];
        const r = laneW * 0.22;

        if (note.hit || note.missed) return;

        ctx.save();
        // Glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;

        // Diamond shape for every 4th note, circle otherwise
        const isDiamond = (notes.indexOf(note) % 4 === 0);
        ctx.fillStyle = color;
        ctx.beginPath();
        if (isDiamond) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.PI / 4);
            const s = r * 0.75;
            ctx.fillRect(-s, -s, s * 2, s * 2);
            ctx.restore();
            // Inner shine
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.PI / 4);
            const s2 = r * 0.35;
            ctx.fillRect(-s2, -s2, s2 * 2, s2 * 2);
            ctx.restore();
        } else {
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            // Inner highlight
            const hGrad = ctx.createRadialGradient(x - r * 0.2, y - r * 0.3, 0, x, y, r);
            hGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
            hGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = hGrad;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    }

    function drawJudgements() {
        const now = Date.now();
        judgements = judgements.filter(j => {
            const elapsed = now - j.time;
            if (elapsed > JUDGEMENT_FADE) return false;
            const alpha = 1 - elapsed / JUDGEMENT_FADE;
            const rise = elapsed * 0.06;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = j.color;
            ctx.font = `bold ${Math.round(18 * DPR)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = j.color;
            ctx.shadowBlur = 8;
            ctx.fillText(j.text, j.x, j.y - rise);
            ctx.shadowBlur = 0;
            ctx.restore();
            return true;
        });
    }

    function drawHitEffects() {
        const now = Date.now();
        hitEffects = hitEffects.filter(e => {
            const elapsed = now - e.t;
            if (elapsed > 400) return false;
            const p = elapsed / 400;
            const x = e.x, y = e.y;
            ctx.save();
            if (e.type === 'hit') {
                // Screen-wide pulse on Perfect hits (signature "whoa" moment)
                if (e.isPerfect) {
                    ctx.fillStyle = e.color;
                    ctx.globalAlpha = (1 - p) * 0.12;
                    ctx.fillRect(0, 0, W, H);
                    // Horizontal light beam sweep
                    const beamGrad = ctx.createLinearGradient(0, y - 30, 0, y + 30);
                    beamGrad.addColorStop(0, 'rgba(255,255,255,0)');
                    beamGrad.addColorStop(0.5, `rgba(255,255,255,${(1 - p) * 0.15})`);
                    beamGrad.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.fillStyle = beamGrad;
                    ctx.fillRect(0, y - 30, W, 60);
                }
                // Expanding ring — brighter
                ctx.strokeStyle = e.color;
                ctx.lineWidth = 4 * (1 - p);
                ctx.globalAlpha = 1 - p;
                ctx.shadowColor = e.color;
                ctx.shadowBlur = 15 * (1 - p);
                ctx.beginPath();
                ctx.arc(x, y, laneW * 0.3 + p * laneW * 0.7, 0, Math.PI * 2);
                ctx.stroke();
                ctx.shadowBlur = 0;
                // Inner flash — bigger
                ctx.fillStyle = e.color;
                ctx.globalAlpha = (1 - p) * 0.4;
                ctx.beginPath();
                ctx.arc(x, y, laneW * 0.35 * (1 - p), 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Miss X — MORE visible with red flash
                ctx.fillStyle = 'rgba(255,0,0,0.06)';
                ctx.globalAlpha = 1 - p;
                ctx.fillRect(0, 0, W, H);
                ctx.strokeStyle = '#FF3333';
                ctx.lineWidth = 4;
                ctx.shadowColor = '#FF0000';
                ctx.shadowBlur = 10 * (1 - p);
                const s = 16;
                ctx.beginPath();
                ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
                ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
            ctx.restore();
            return true;
        });
    }

    function drawParticles() {
        const now = Date.now();
        particles = particles.filter(p => {
            const elapsed = now - p.t;
            if (elapsed > p.life) return false;
            const prog = elapsed / p.life;
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05; // gravity
            ctx.save();
            ctx.globalAlpha = 1 - prog;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (1 - prog * 0.5), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return true;
        });
    }

    function spawnHitParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 3;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2,
                size: 2 + Math.random() * 3,
                color: color,
                life: 400 + Math.random() * 300,
                t: Date.now()
            });
        }
    }

    // Combo fire effect behind hit zone
    function drawComboFire() {
        if (combo < COMBO_FIRE_THRESHOLD) return;
        const intensity = Math.min((combo - COMBO_FIRE_THRESHOLD) / 30, 1);
        const lanes = diffConfig.lanes;
        const laneOff = Math.floor((4 - lanes) / 2);
        for (let i = 0; i < lanes; i++) {
            const lane = laneOff + i;
            const x = laneX(lane);
            const flicker = Math.sin(frameCount * 0.3 + i) * 8;
            const fireH = 120 + intensity * 40;
            const grad = ctx.createRadialGradient(x, hitY, 0, x, hitY - fireH * 0.5, fireH + flicker);
            grad.addColorStop(0, `rgba(255,${Math.floor(120 + intensity * 120)},0,${intensity * 0.55})`);
            grad.addColorStop(0.3, `rgba(255,${Math.floor(80 + intensity * 80)},0,${intensity * 0.3})`);
            grad.addColorStop(0.6, `rgba(255,${Math.floor(30 + intensity * 30)},0,${intensity * 0.12})`);
            grad.addColorStop(1, 'rgba(255,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(x - laneW * 0.6, hitY - fireH, laneW * 1.2, fireH);
            // Rising embers
            for (let e = 0; e < 3; e++) {
                const ey = hitY - 20 - ((frameCount * 2 + e * 25 + i * 17) % 80);
                const ex = x + Math.sin(frameCount * 0.1 + e * 2 + i) * 12;
                ctx.fillStyle = `rgba(255,200,50,${intensity * 0.5})`;
                ctx.beginPath();
                ctx.arc(ex, ey, 1.5 + Math.random(), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    function drawHUD() {
        const pad = 10;
        // Score
        ctx.fillStyle = '#FFF';
        ctx.font = `bold ${Math.round(22 * DPR)}px monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`${score}`, pad, pad);

        // Combo
        if (combo > 1) {
            ctx.fillStyle = ACCENT;
            ctx.font = `bold ${Math.round(16 * DPR)}px monospace`;
            ctx.textAlign = 'left';
            ctx.fillText(`${combo}x COMBO`, pad, pad + 28 * DPR);
        }

        // Multiplier
        const mul = getMultiplier();
        if (mul > 1) {
            ctx.fillStyle = '#FFD600';
            ctx.font = `bold ${Math.round(14 * DPR)}px monospace`;
            ctx.textAlign = 'left';
            ctx.fillText(`x${mul}`, pad, pad + 50 * DPR);
        }

        // Progress bar
        const ac = getAudioCtx();
        let progress = 0;
        if (ac && audioStartTime > 0) {
            progress = Math.min((ac.currentTime - audioStartTime) / songDuration, 1);
        }
        const barW = W - pad * 2;
        const barH = 4;
        const barY = H - pad - barH;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        roundRect(ctx, pad, barY, barW, barH, 2);
        ctx.fill();
        ctx.fillStyle = ACCENT;
        roundRect(ctx, pad, barY, barW * progress, barH, 2);
        ctx.fill();

        // Time remaining
        const remaining = Math.max(0, songDuration - (ac ? (ac.currentTime - audioStartTime) : 0));
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `${Math.round(12 * DPR)}px monospace`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        const mins = Math.floor(remaining / 60);
        const secs = Math.floor(remaining % 60);
        ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, W - pad, pad);

        // Difficulty label
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = `${Math.round(11 * DPR)}px monospace`;
        ctx.textAlign = 'right';
        ctx.fillText(diffConfig.label, W - pad, pad + 18 * DPR);
    }

    function getMultiplier() {
        if (combo >= 50) return 8;
        if (combo >= 30) return 4;
        if (combo >= 15) return 3;
        if (combo >= 8)  return 2;
        return 1;
    }

    // ══════════════════════════════════════════════
    //  MENU SCREEN
    // ══════════════════════════════════════════════

    function drawMenu() {
        drawBg();
        const cx = W / 2;

        // Title
        ctx.fillStyle = '#FFF';
        ctx.font = `bold ${Math.round(36 * DPR)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = ACCENT;
        ctx.shadowBlur = 20;
        ctx.fillText('RHYTHM TAP', cx, H * 0.2);
        ctx.shadowBlur = 0;

        // Subtitle
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `${Math.round(14 * DPR)}px sans-serif`;
        ctx.fillText('Tap to the beat!', cx, H * 0.2 + 40 * DPR);

        // Difficulty buttons
        const diffs = ['easy', 'normal', 'hard'];
        const labels = ['EASY (2 Lanes)', 'NORMAL (3 Lanes)', 'HARD (4 Lanes)'];
        const btnW = W * 0.6;
        const btnH = 50 * DPR;
        const gap = 16 * DPR;
        const startY = H * 0.4;

        for (let i = 0; i < 3; i++) {
            const y = startY + i * (btnH + gap);
            const selected = i === menuSel;

            ctx.save();
            if (selected) {
                ctx.shadowColor = ACCENT;
                ctx.shadowBlur = 15;
            }
            ctx.fillStyle = selected ? ACCENT : 'rgba(255,255,255,0.1)';
            roundRect(ctx, cx - btnW / 2, y, btnW, btnH, 10);
            ctx.fill();
            ctx.shadowBlur = 0;

            if (!selected) {
                ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                ctx.lineWidth = 1;
                roundRect(ctx, cx - btnW / 2, y, btnW, btnH, 10);
                ctx.stroke();
            }

            ctx.fillStyle = selected ? '#FFF' : 'rgba(255,255,255,0.7)';
            ctx.font = `bold ${Math.round(16 * DPR)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labels[i], cx, y + btnH / 2);
            ctx.restore();
        }

        // Controls hint
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = `${Math.round(12 * DPR)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('Keys: D F J K  |  Arrows + Enter', cx, H * 0.85);
        ctx.fillText('Tap lanes or touch to play', cx, H * 0.85 + 20 * DPR);

        // Animated notes decoration
        const t = frameCount * 0.02;
        for (let i = 0; i < 4; i++) {
            const nx = W * 0.15 + i * W * 0.22;
            const ny = H * 0.92 + Math.sin(t + i * 1.5) * 10;
            ctx.fillStyle = LANE_NEON[i];
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.arc(nx, ny, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    // ══════════════════════════════════════════════
    //  RESULTS SCREEN
    // ══════════════════════════════════════════════

    function getGrade() {
        const total = perfects + greats + goods + misses;
        if (total === 0) return 'F';
        const accuracy = (perfects * 1.0 + greats * 0.7 + goods * 0.4) / total;
        if (accuracy >= 0.95) return 'S';
        if (accuracy >= 0.85) return 'A';
        if (accuracy >= 0.70) return 'B';
        if (accuracy >= 0.50) return 'C';
        return 'F';
    }

    function gradeColor(g) {
        const map = { S: '#FFD700', A: '#76FF03', B: '#00E5FF', C: '#FF9800', F: '#FF3333' };
        return map[g] || '#FFF';
    }

    function drawResults() {
        drawBg();
        const cx = W / 2;
        const grade = getGrade();

        // Grade
        ctx.fillStyle = gradeColor(grade);
        ctx.font = `bold ${Math.round(72 * DPR)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = gradeColor(grade);
        ctx.shadowBlur = 30;
        ctx.fillText(grade, cx, H * 0.18);
        ctx.shadowBlur = 0;

        // Score
        ctx.fillStyle = '#FFF';
        ctx.font = `bold ${Math.round(28 * DPR)}px monospace`;
        ctx.fillText(`${score}`, cx, H * 0.3);

        // Stats
        const stats = [
            { label: 'PERFECT', val: perfects, color: '#FFD700' },
            { label: 'GREAT',   val: greats,   color: '#76FF03' },
            { label: 'GOOD',    val: goods,    color: '#00E5FF' },
            { label: 'MISS',    val: misses,   color: '#FF3333' },
            { label: 'MAX COMBO', val: maxCombo, color: '#FF2D87' },
        ];
        const startY = H * 0.4;
        const lineH = 32 * DPR;
        for (let i = 0; i < stats.length; i++) {
            const y = startY + i * lineH;
            ctx.textAlign = 'left';
            ctx.fillStyle = stats[i].color;
            ctx.font = `bold ${Math.round(14 * DPR)}px monospace`;
            ctx.fillText(stats[i].label, W * 0.2, y);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#FFF';
            ctx.fillText(`${stats[i].val}`, W * 0.8, y);
        }

        // Accuracy
        const total = perfects + greats + goods + misses;
        const acc = total > 0 ? Math.round(((perfects * 1.0 + greats * 0.7 + goods * 0.4) / total) * 100) : 0;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `${Math.round(14 * DPR)}px monospace`;
        ctx.fillText(`Accuracy: ${acc}%`, cx, H * 0.73);

        // Replay prompt
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = `${Math.round(13 * DPR)}px sans-serif`;
        ctx.fillText('Tap or press Enter to play again', cx, H * 0.82);
        ctx.fillText('Press Escape for menu', cx, H * 0.82 + 22 * DPR);
    }

    // ══════════════════════════════════════════════
    //  GAME LOGIC
    // ══════════════════════════════════════════════

    function spawnNotes() {
        const ac = getAudioCtx();
        if (!ac) return;
        const elapsed = ac.currentTime - audioStartTime;
        const leadTime = (hitY - SPAWN_Y) / (noteSpeed * 60); // seconds for note to travel to hit zone

        while (patternIdx < patternBank.length) {
            const p = patternBank[patternIdx];
            if (p.time - leadTime <= elapsed) {
                notes.push({
                    lane: p.lane,
                    y: SPAWN_Y,
                    hit: false,
                    missed: false,
                    time: p.time
                });
                patternIdx++;
            } else {
                break;
            }
        }
    }

    function updateNotes() {
        const speed = noteSpeed;
        for (const note of notes) {
            if (note.hit || note.missed) continue;
            note.y += speed;
            // Check if note passed hit zone
            if (note.y > hitY + GOOD_TOL + 20) {
                note.missed = true;
                misses++;
                combo = 0;
                judgements.push({
                    text: 'MISS', x: laneX(note.lane), y: hitY - 20,
                    color: '#FF3333', time: Date.now()
                });
                hitEffects.push({
                    x: laneX(note.lane), y: hitY,
                    color: '#FF3333', t: Date.now(), type: 'miss'
                });
                playMissSound();
            }
        }
        // Remove old notes that scrolled past
        notes = notes.filter(n => n.y < H + 50 || (!n.hit && !n.missed));
    }

    function tryHitLane(lane) {
        if (phase !== 'playing') return;
        // Find closest unhit note in this lane near the hit zone
        let closest = null;
        let closestDist = Infinity;
        for (const note of notes) {
            if (note.hit || note.missed || note.lane !== lane) continue;
            const dist = Math.abs(note.y - hitY);
            const tolMul2 = diffConfig.toleranceMul || 1;
            if (dist < (GOOD_TOL + 20) * tolMul2 && dist < closestDist) {
                closest = note;
                closestDist = dist;
            }
        }
        if (!closest) return;

        closest.hit = true;
        const dist = closestDist;
        const tolMul = diffConfig.toleranceMul || 1;
        let judgement, pts, color;
        if (dist <= HIT_TOLERANCE_PX * tolMul) {
            judgement = 'PERFECT'; pts = 300; color = '#FFD700'; perfects++;
        } else if (dist <= GREAT_TOL * tolMul) {
            judgement = 'GREAT'; pts = 200; color = '#76FF03'; greats++;
        } else {
            judgement = 'GOOD'; pts = 100; color = '#00E5FF'; goods++;
        }

        combo++;
        if (combo > maxCombo) maxCombo = combo;
        const mul = getMultiplier();
        score += pts * mul;

        judgements.push({
            text: judgement, x: laneX(lane), y: hitY - 30,
            color: color, time: Date.now()
        });
        hitEffects.push({
            x: laneX(lane), y: hitY,
            color: color, t: Date.now(), type: 'hit',
            isPerfect: judgement === 'PERFECT'
        });

        spawnHitParticles(laneX(lane), hitY, color, judgement === 'PERFECT' ? 20 : 8);
        playHitSound(lane, judgement);

        // Beat pulse
        bgPulse = 1;
    }

    function checkSongEnd() {
        const ac = getAudioCtx();
        if (!ac) return;
        const elapsed = ac.currentTime - audioStartTime;
        if (elapsed >= songDuration && patternIdx >= patternBank.length) {
            // Check all remaining notes are resolved
            const unresolved = notes.filter(n => !n.hit && !n.missed);
            if (unresolved.length === 0 || elapsed >= songDuration + 3) {
                unresolved.forEach(n => { n.missed = true; misses++; });
                endGame();
            }
        }
    }

    function endGame() {
        phase = 'results';
        gameActive = false;
        if (onGameOver) {
            onGameOver({
                score,
                level: difficulty === 'easy' ? 1 : difficulty === 'normal' ? 2 : 3,
                duration: Math.floor(songDuration),
                grade: getGrade(),
                combo: maxCombo,
                perfects, greats, goods, misses
            });
        }
    }

    // ══════════════════════════════════════════════
    //  MAIN LOOP
    // ══════════════════════════════════════════════

    function render(timestamp) {
        animFrame = requestAnimationFrame(render);
        if (!canvas || !ctx) return;

        const now = timestamp || performance.now();
        const dt = now - (lastTime || now);
        lastTime = now;
        frameCount++;

        if (phase === 'menu') {
            drawMenu();
            return;
        }

        if (phase === 'results') {
            drawResults();
            drawParticles();
            return;
        }

        // Playing phase
        scheduleAhead();
        spawnNotes();
        updateNotes();
        checkSongEnd();

        // Decay pulse
        bgPulse *= 0.92;

        // Beat pulse from music timer
        const ac = getAudioCtx();
        if (ac) {
            const elapsed = ac.currentTime - audioStartTime;
            const secPerBeat = 60 / BPM_BASE;
            const beatFrac = (elapsed % secPerBeat) / secPerBeat;
            if (beatFrac < 0.1) bgPulse = Math.max(bgPulse, 0.8);
        }

        // Draw
        drawBg();
        drawComboFire();
        drawHitZone();

        // Draw notes
        for (const note of notes) drawNote(note);

        drawHitEffects();
        drawJudgements();
        drawParticles();
        drawHUD();
    }

    // ══════════════════════════════════════════════
    //  INPUT
    // ══════════════════════════════════════════════

    function handleKeyDown(e) {
        if (keyStates[e.key]) return; // prevent repeat
        keyStates[e.key] = true;

        if (phase === 'menu') {
            if (e.key === 'ArrowUp') { menuSel = Math.max(0, menuSel - 1); }
            else if (e.key === 'ArrowDown') { menuSel = Math.min(2, menuSel + 1); }
            else if (e.key === 'Enter' || e.key === ' ') { startGame(); }
            return;
        }

        if (phase === 'results') {
            if (e.key === 'Enter' || e.key === ' ') { startGame(); }
            else if (e.key === 'Escape') { phase = 'menu'; }
            return;
        }

        // Playing — lane keys
        const keyMap = { d: 0, f: 1, j: 2, k: 3 };
        const lane = keyMap[e.key.toLowerCase()];
        if (lane !== undefined) {
            tryHitLane(lane);
        }
    }

    function handleKeyUp(e) {
        keyStates[e.key] = false;
    }

    function handleTouchStart(e) {
        if (phase === 'menu') {
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            const tx = (touch.clientX - rect.left) * (W / rect.width);
            const ty = (touch.clientY - rect.top) * (H / rect.height);

            // Check difficulty buttons
            const cx = W / 2;
            const btnW = W * 0.6;
            const btnH = 50 * DPR;
            const gap = 16 * DPR;
            const startY = H * 0.4;
            for (let i = 0; i < 3; i++) {
                const y = startY + i * (btnH + gap);
                if (tx >= cx - btnW / 2 && tx <= cx + btnW / 2 && ty >= y && ty <= y + btnH) {
                    menuSel = i;
                    startGame();
                    return;
                }
            }
            return;
        }

        if (phase === 'results') {
            startGame();
            return;
        }

        // Playing — detect which lane was tapped
        if (phase === 'playing') {
            for (let t = 0; t < e.touches.length; t++) {
                const touch = e.touches[t];
                const rect = canvas.getBoundingClientRect();
                const tx = (touch.clientX - rect.left) * (W / rect.width);
                // Determine lane
                const totalLanes = 4;
                const totalW = totalLanes * laneW;
                const startX = (W - totalW) / 2;
                const lane = Math.floor((tx - startX) / laneW);
                if (lane >= 0 && lane < 4) {
                    tryHitLane(lane);
                }
            }
        }
    }

    function handleClick(e) {
        if (phase === 'menu') {
            const rect = canvas.getBoundingClientRect();
            const tx = (e.clientX - rect.left) * (W / rect.width);
            const ty = (e.clientY - rect.top) * (H / rect.height);

            const cx = W / 2;
            const btnW = W * 0.6;
            const btnH = 50 * DPR;
            const gap = 16 * DPR;
            const startY = H * 0.4;
            for (let i = 0; i < 3; i++) {
                const y = startY + i * (btnH + gap);
                if (tx >= cx - btnW / 2 && tx <= cx + btnW / 2 && ty >= y && ty <= y + btnH) {
                    menuSel = i;
                    startGame();
                    return;
                }
            }
        } else if (phase === 'results') {
            startGame();
        }
    }

    // ══════════════════════════════════════════════
    //  START / INIT / DESTROY
    // ══════════════════════════════════════════════

    function startGame() {
        const diffs = ['easy', 'normal', 'hard'];
        difficulty = diffs[menuSel];
        diffConfig = DIFFICULTIES[difficulty];
        laneCount = diffConfig.lanes;
        noteSpeed = NOTE_SPEED_BASE * diffConfig.speedMul;

        score = 0; combo = 0; maxCombo = 0;
        perfects = 0; greats = 0; goods = 0; misses = 0;
        notes = []; judgements = []; hitEffects = []; particles = [];
        bgPulse = 0; totalNotes = 0; patternIdx = 0;
        keyStates = {};

        phase = 'playing';
        gameActive = true;

        buildPatterns();
        startMusic();
    }

    function init(canvasEl, activePlayer, gameOverCallback) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        player = activePlayer;
        onGameOver = gameOverCallback;

        loadTheme();

        // Size canvas
        const container = canvas.parentElement;
        const cw = container ? container.clientWidth : GAME_W;
        const ch = container ? container.clientHeight : GAME_H;
        DPR = window.devicePixelRatio || 1;
        W = Math.max(320, cw);
        H = Math.max(480, ch);
        canvas.width = W * DPR;
        canvas.height = H * DPR;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

        laneW = W / 4;
        hitY = H * HIT_Y_RATIO;

        // Delayed refit
        requestAnimationFrame(() => {
            if (!canvas || !canvas.parentElement) return;
            const p = canvas.parentElement;
            const pw = Math.max(320, p.clientWidth || GAME_W);
            const ph = Math.max(480, p.clientHeight || GAME_H);
            if (pw !== W || ph !== H) {
                W = pw; H = ph;
                canvas.width = W * DPR;
                canvas.height = H * DPR;
                canvas.style.width = W + 'px';
                canvas.style.height = H + 'px';
                ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
                laneW = W / 4;
                hitY = H * HIT_Y_RATIO;
            }
        });

        phase = 'menu';
        menuSel = 1;
        gameActive = false;
        frameCount = 0;
        lastTime = 0;

        // Bind input
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
        canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
        canvas.addEventListener('click', handleClick);
        window.addEventListener('resize', onResize);

        render();
    }

    function onResize() {
        if (!canvas || !canvas.parentElement) return;
        const p = canvas.parentElement;
        const pw = Math.max(320, p.clientWidth || GAME_W);
        const ph = Math.max(480, p.clientHeight || GAME_H);
        if (pw !== W || ph !== H) {
            W = pw; H = ph;
            canvas.width = W * DPR;
            canvas.height = H * DPR;
            canvas.style.width = W + 'px';
            canvas.style.height = H + 'px';
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            laneW = W / laneCount;
            hitY = H * HIT_Y_RATIO;
        }
    }

    function destroy() {
        gameActive = false;
        phase = 'menu';
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('resize', onResize);
        if (canvas) {
            canvas.removeEventListener('touchstart', handleTouchStart);
            canvas.removeEventListener('click', handleClick);
        }
        canvas = null; ctx = null;
        notes = []; judgements = []; hitEffects = []; particles = [];
        patternBank = []; melodyNotes = [];
        if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
        masterGain = null;
        theme = null;
    }

    return {
        init,
        destroy,
        getScore() { return score; },
        getGrade() { return phase === 'results' ? getGrade() : null; },
        isActive() { return gameActive; }
    };
})();
