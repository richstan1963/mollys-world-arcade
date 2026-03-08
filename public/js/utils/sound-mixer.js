/* Sound Mixer — Sound & Visual Controls Panel */
window.SoundMixer = {
    prefs: {
        volume: 70,
        muted: false,
        crtMode: 'off',
        particles: true,
    },

    render() {
        this.loadPrefs();
        const p = this.prefs;
        return `
            <div class="smixer-panel">
                <div class="smixer-header">
                    <span class="smixer-icon">\u{1F50A}</span>
                    <span class="smixer-title">Sound &amp; Visual</span>
                </div>

                <div class="smixer-section">
                    <label class="smixer-label">Volume</label>
                    <div class="smixer-slider-row">
                        <input type="range" id="smixerVolume" class="smixer-slider" min="0" max="100" value="${p.volume}"
                            oninput="SoundMixer.setVolume(parseInt(this.value))">
                        <span class="smixer-value" id="smixerVolumeVal">${p.volume}%</span>
                    </div>
                </div>

                <div class="smixer-section">
                    <label class="smixer-label">Mute</label>
                    <button class="smixer-toggle ${p.muted ? 'smixer-toggle-on' : ''}" id="smixerMuteBtn"
                        onclick="SoundMixer.toggleMute()">
                        ${p.muted ? '\u{1F507} Muted' : '\u{1F50A} On'}
                    </button>
                </div>

                <div class="smixer-section">
                    <label class="smixer-label">CRT Filter</label>
                    <div class="smixer-crt-row">
                        <button class="smixer-crt-btn ${p.crtMode === 'off' ? 'smixer-crt-active' : ''}"
                            onclick="SoundMixer.setCRTMode('off')">Off</button>
                        <button class="smixer-crt-btn ${p.crtMode === 'light' ? 'smixer-crt-active' : ''}"
                            onclick="SoundMixer.setCRTMode('light')">Light</button>
                        <button class="smixer-crt-btn ${p.crtMode === 'heavy' ? 'smixer-crt-active' : ''}"
                            onclick="SoundMixer.setCRTMode('heavy')">Heavy</button>
                    </div>
                </div>

                <div class="smixer-section">
                    <label class="smixer-label">Particles</label>
                    <button class="smixer-toggle ${p.particles ? 'smixer-toggle-on' : ''}" id="smixerParticlesBtn"
                        onclick="SoundMixer.setParticles(!SoundMixer.prefs.particles)">
                        ${p.particles ? '\u2728 On' : '\u26AB Off'}
                    </button>
                </div>
            </div>
        `;
    },

    init() {
        this.loadPrefs();
        this.applyAll();
    },

    loadPrefs() {
        try {
            const stored = localStorage.getItem('mollys_mixer_prefs');
            if (stored) {
                Object.assign(this.prefs, JSON.parse(stored));
            }
        } catch (e) { /* use defaults */ }
    },

    savePrefs() {
        try {
            localStorage.setItem('mollys_mixer_prefs', JSON.stringify(this.prefs));
        } catch (e) { /* silent */ }
    },

    applyAll() {
        this.applyVolume();
        this.applyMute();
        this.applyCRT();
        this.applyParticles();
    },

    setVolume(vol) {
        this.prefs.volume = Math.max(0, Math.min(100, vol));
        this.savePrefs();
        this.applyVolume();

        // Update UI
        const valEl = document.getElementById('smixerVolumeVal');
        if (valEl) valEl.textContent = this.prefs.volume + '%';
    },

    applyVolume() {
        // Set SFX master gain if available
        if (typeof SFX !== 'undefined' && SFX.setVolume) {
            SFX.setVolume(this.prefs.volume / 100);
        }
        // Also try to set the AudioContext gain directly
        try {
            if (window.SFX && window.SFX._masterGain) {
                window.SFX._masterGain.gain.value = this.prefs.volume / 100 * 0.35;
            }
        } catch (e) { /* silent */ }
    },

    toggleMute() {
        this.prefs.muted = !this.prefs.muted;
        this.savePrefs();
        this.applyMute();

        // Update UI
        const btn = document.getElementById('smixerMuteBtn');
        if (btn) {
            btn.classList.toggle('smixer-toggle-on', this.prefs.muted);
            btn.textContent = this.prefs.muted ? '\u{1F507} Muted' : '\u{1F50A} On';
        }
    },

    applyMute() {
        try {
            localStorage.setItem('mollys_sfx', this.prefs.muted ? 'false' : 'true');
        } catch (e) { /* silent */ }
    },

    setCRTMode(mode) {
        this.prefs.crtMode = mode;
        this.savePrefs();
        this.applyCRT();

        // Update UI
        document.querySelectorAll('.smixer-crt-btn').forEach(btn => {
            btn.classList.remove('smixer-crt-active');
        });
        const activeBtn = document.querySelector(`.smixer-crt-btn[onclick*="'${mode}'"]`);
        if (activeBtn) activeBtn.classList.add('smixer-crt-active');
    },

    applyCRT() {
        const body = document.body;
        body.classList.remove('crt-light', 'crt-heavy');
        if (this.prefs.crtMode === 'light') body.classList.add('crt-light');
        if (this.prefs.crtMode === 'heavy') body.classList.add('crt-heavy');
    },

    setParticles(on) {
        this.prefs.particles = !!on;
        this.savePrefs();
        this.applyParticles();

        // Update UI
        const btn = document.getElementById('smixerParticlesBtn');
        if (btn) {
            btn.classList.toggle('smixer-toggle-on', this.prefs.particles);
            btn.textContent = this.prefs.particles ? '\u2728 On' : '\u26AB Off';
        }
    },

    applyParticles() {
        const particleEl = document.getElementById('particles');
        if (particleEl) {
            particleEl.style.display = this.prefs.particles ? '' : 'none';
        }
        // Also toggle Confetti availability
        if (typeof Confetti !== 'undefined') {
            Confetti._disabled = !this.prefs.particles;
        }
    },
};
