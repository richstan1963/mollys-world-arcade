/* Molly's World Arcade — Retro Sound Engine
   All sounds synthesized via Web Audio API — zero audio files needed.
   Respects the sound_effects setting toggle. */

window.SFX = (() => {
    let ctx = null;
    let enabled = true;
    let masterGain = null;

    function getCtx() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = ctx.createGain();
            masterGain.gain.value = 0.35;
            masterGain.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function isEnabled() {
        if (!enabled) return false;
        try {
            const stored = localStorage.getItem('mollys_sfx');
            if (stored === 'false') return false;
        } catch (e) {}
        return true;
    }

    // ── Static / White Noise ──
    // TV static hiss — plays during splash boot
    function playStatic(duration = 2.0, volume = 0.12) {
        if (!isEnabled()) return null;
        const ac = getCtx();
        const bufferSize = ac.sampleRate * duration;
        const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
        const data = buffer.getChannelData(0);

        // Generate white noise with slight crackle variation
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
            // Occasional loud crackle pops
            if (Math.random() < 0.001) data[i] *= 3;
        }

        const source = ac.createBufferSource();
        source.buffer = buffer;

        // Bandpass filter to sound more like TV static (not pure white noise)
        const filter = ac.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 3000;
        filter.Q.value = 0.5;

        const gain = ac.createGain();
        gain.gain.setValueAtTime(volume, ac.currentTime);
        // Fade out over last 0.5s
        gain.gain.setValueAtTime(volume, ac.currentTime + duration - 0.5);
        gain.gain.linearRampToValueAtTime(0, ac.currentTime + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        source.start();
        source.stop(ac.currentTime + duration);

        return { source, gain };
    }

    // ── Power-On Hum ──
    // Low CRT power-on buzz
    function playPowerOn() {
        if (!isEnabled()) return;
        const ac = getCtx();
        const osc = ac.createOscillator();
        const gain = ac.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(60, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(120, ac.currentTime + 0.3);

        gain.gain.setValueAtTime(0, ac.currentTime);
        gain.gain.linearRampToValueAtTime(0.06, ac.currentTime + 0.05);
        gain.gain.linearRampToValueAtTime(0.03, ac.currentTime + 0.3);
        gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.8);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start();
        osc.stop(ac.currentTime + 0.8);
    }

    // ── Theme Jingle ──
    // Catchy 8-bit chiptune jingle — "Molly's World" power-up fanfare
    function playTheme() {
        if (!isEnabled()) return;
        const ac = getCtx();

        // Melody: bright ascending arpeggio with a bouncy finish
        // Notes in Hz — pentatonic feel, major key, uplifting
        const melody = [
            // Ascending intro (quick)
            { f: 523.25, t: 0.00, d: 0.12 },  // C5
            { f: 659.25, t: 0.12, d: 0.12 },  // E5
            { f: 783.99, t: 0.24, d: 0.12 },  // G5
            { f: 1046.5, t: 0.36, d: 0.20 },  // C6 (hold)
            // Bounce down
            { f: 880.00, t: 0.60, d: 0.10 },  // A5
            { f: 783.99, t: 0.72, d: 0.10 },  // G5
            // Final flourish — triumphant
            { f: 1046.5, t: 0.86, d: 0.14 },  // C6
            { f: 1174.7, t: 1.02, d: 0.14 },  // D6
            { f: 1318.5, t: 1.18, d: 0.35 },  // E6 (long hold — the landing)
        ];

        // Bass line — simple root notes
        const bass = [
            { f: 130.81, t: 0.00, d: 0.30 },  // C3
            { f: 164.81, t: 0.36, d: 0.22 },  // E3
            { f: 130.81, t: 0.60, d: 0.20 },  // C3
            { f: 196.00, t: 0.86, d: 0.30 },  // G3
            { f: 130.81, t: 1.18, d: 0.40 },  // C3 (root landing)
        ];

        function playNote(freq, startTime, dur, type = 'square', vol = 0.10) {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, ac.currentTime + startTime);

            gain.gain.setValueAtTime(0, ac.currentTime + startTime);
            gain.gain.linearRampToValueAtTime(vol, ac.currentTime + startTime + 0.01);
            gain.gain.setValueAtTime(vol, ac.currentTime + startTime + dur * 0.7);
            gain.gain.linearRampToValueAtTime(0, ac.currentTime + startTime + dur);

            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(ac.currentTime + startTime);
            osc.stop(ac.currentTime + startTime + dur);
        }

        melody.forEach(n => playNote(n.f, n.t, n.d, 'square', 0.09));
        bass.forEach(n => playNote(n.f, n.t, n.d, 'triangle', 0.07));

        // Tiny cymbal/noise hit on the landing note
        setTimeout(() => {
            const bufLen = ac.sampleRate * 0.15;
            const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < bufLen; i++) {
                d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.04));
            }
            const src = ac.createBufferSource();
            src.buffer = buf;
            const g = ac.createGain();
            g.gain.value = 0.04;
            src.connect(g);
            g.connect(masterGain);
            src.start();
        }, 1180);
    }

    // ── UI Sounds ──

    // Menu click — short blip
    function click() {
        if (!isEnabled()) return;
        const ac = getCtx();
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ac.currentTime + 0.04);
        gain.gain.setValueAtTime(0.06, ac.currentTime);
        gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.06);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start();
        osc.stop(ac.currentTime + 0.06);
    }

    // Nav hover — subtle tick
    function hover() {
        if (!isEnabled()) return;
        const ac = getCtx();
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = 1400;
        gain.gain.setValueAtTime(0.025, ac.currentTime);
        gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.03);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start();
        osc.stop(ac.currentTime + 0.03);
    }

    // Favorite toggle — coin-pickup chirp
    function coin() {
        if (!isEnabled()) return;
        const ac = getCtx();
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(988, ac.currentTime);          // B5
        osc.frequency.setValueAtTime(1319, ac.currentTime + 0.07);  // E6
        gain.gain.setValueAtTime(0.08, ac.currentTime);
        gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start();
        osc.stop(ac.currentTime + 0.15);
    }

    // Unfavorite — descending blip
    function uncoin() {
        if (!isEnabled()) return;
        const ac = getCtx();
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1319, ac.currentTime);
        osc.frequency.setValueAtTime(988, ac.currentTime + 0.07);
        gain.gain.setValueAtTime(0.06, ac.currentTime);
        gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start();
        osc.stop(ac.currentTime + 0.12);
    }

    // Toast notification — gentle ding
    function toast() {
        if (!isEnabled()) return;
        const ac = getCtx();
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = 1047; // C6
        gain.gain.setValueAtTime(0.05, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start();
        osc.stop(ac.currentTime + 0.25);
    }

    // Game launch — dramatic power-up sweep
    function launch() {
        if (!isEnabled()) return;
        const ac = getCtx();
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1600, ac.currentTime + 0.4);
        gain.gain.setValueAtTime(0.08, ac.currentTime);
        gain.gain.setValueAtTime(0.08, ac.currentTime + 0.3);
        gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start();
        osc.stop(ac.currentTime + 0.5);
    }

    // Error — low buzz
    function error() {
        if (!isEnabled()) return;
        const ac = getCtx();
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, ac.currentTime);
        gain.gain.setValueAtTime(0.06, ac.currentTime);
        gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start();
        osc.stop(ac.currentTime + 0.2);
    }

    // ── Enable/Disable ──
    function setEnabled(val) {
        enabled = !!val;
        localStorage.setItem('mollys_sfx', enabled ? 'true' : 'false');
    }

    // ── Level Up Fanfare — triumphant ascending power chord ──
    function levelUp() {
        if (!isEnabled()) return;
        const ac = getCtx();
        function note(freq, start, dur, type = 'square', vol = 0.08) {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, ac.currentTime + start);
            gain.gain.setValueAtTime(0, ac.currentTime + start);
            gain.gain.linearRampToValueAtTime(vol, ac.currentTime + start + 0.02);
            gain.gain.setValueAtTime(vol, ac.currentTime + start + dur * 0.6);
            gain.gain.linearRampToValueAtTime(0, ac.currentTime + start + dur);
            osc.connect(gain); gain.connect(masterGain);
            osc.start(ac.currentTime + start);
            osc.stop(ac.currentTime + start + dur);
        }
        // Power-up arpeggio → triumphant chord
        note(523.25, 0.0, 0.12);   // C5
        note(659.25, 0.08, 0.12);  // E5
        note(783.99, 0.16, 0.12);  // G5
        note(1046.5, 0.24, 0.12);  // C6
        note(1318.5, 0.32, 0.15);  // E6
        // Sustained power chord
        note(1046.5, 0.50, 0.50, 'square', 0.07);  // C6
        note(1318.5, 0.50, 0.50, 'square', 0.06);  // E6
        note(1568.0, 0.50, 0.55, 'square', 0.06);  // G6
        // Bass rumble
        note(130.81, 0.50, 0.50, 'triangle', 0.06); // C3
        note(65.41, 0.50, 0.50, 'sawtooth', 0.04);  // C2
    }

    // ── Achievement Unlocked — Xbox-style discovery chime ──
    function achievementSound() {
        if (!isEnabled()) return;
        const ac = getCtx();
        function note(freq, start, dur, type = 'sine', vol = 0.06) {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, ac.currentTime + start);
            gain.gain.setValueAtTime(0, ac.currentTime + start);
            gain.gain.linearRampToValueAtTime(vol, ac.currentTime + start + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + start + dur);
            osc.connect(gain); gain.connect(masterGain);
            osc.start(ac.currentTime + start);
            osc.stop(ac.currentTime + start + dur);
        }
        // Two-tone discovery chime (like Xbox achievement)
        note(880, 0.0, 0.25, 'sine', 0.07);    // A5
        note(1108.7, 0.15, 0.35, 'sine', 0.08); // C#6
        // Shimmer overtone
        note(1760, 0.15, 0.40, 'sine', 0.03);   // A6 (octave shimmer)
    }

    return {
        playStatic, playPowerOn, playTheme,
        click, hover, coin, uncoin, toast, launch, error,
        levelUp, achievement: achievementSound,
        setEnabled, isEnabled,
        // Allow unlocking AudioContext on first interaction
        unlock() { getCtx(); },
    };
})();
