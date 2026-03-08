/* ═══════════════════════════════════════════════════════════
   TURBO + BULLET TIME ENGINE — Molly's World Arcade
   Custom touch buttons for iPad/mobile:
   🔴 TURBO — tap to auto-fire action button at 2x speed (3 sec)
   🔵 BULLET TIME — tap for slow-mo + turbo fire (3 sec)
   Both are tap-to-activate with 3-second countdown timers.
   ═══════════════════════════════════════════════════════════ */

class TurboEngine {
    constructor(iframe) {
        this.iframe = iframe;
        this.iframeWin = iframe.contentWindow;
        this.iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

        // State
        this.turboActive = false;
        this.bulletTimeActive = false;
        this.turboInterval = null;
        this.turboTimeout = null;
        this.bulletTimeout = null;
        this.slowmoInterval = null;

        // Config (defaults, may be overridden by cheat codes)
        const fx = (window.CheatsView && CheatsView.getActiveEffects) ? CheatsView.getActiveEffects() : {};
        this.DURATION_MS = fx.turbo_duration || 3000;
        this.BULLET_DURATION_MS = fx.bullet_duration || 3000;
        this.TURBO_RATE_MS = fx.turbo_rate || 33;
        this.SLOWMO_SPEED = fx.slowmo_speed || 0.5;
        this.NO_COOLDOWN = fx.no_cooldown || false;
        this.BIG_BUTTONS = fx.big_buttons || false;
        this.FIRE_KEYS = [
            { key: 'x', keyCode: 88, code: 'KeyX' },  // B button (primary fire)
            { key: 'z', keyCode: 90, code: 'KeyZ' },  // A button (secondary)
        ];
        this.activeFireKey = 0;

        // Build UI
        this.container = null;
        this.buildControls();
    }

    buildControls() {
        this.container = document.createElement('div');
        this.container.id = 'turbo-controls';
        this.container.innerHTML = `
            <div class="turbo-panel">
                <button class="turbo-btn turbo-fire" id="turboBtnFire">
                    <svg class="turbo-ring" viewBox="0 0 100 100">
                        <circle class="turbo-ring-bg" cx="50" cy="50" r="46"/>
                        <circle class="turbo-ring-fill turbo-ring-red" cx="50" cy="50" r="46" id="turboRingFire"/>
                    </svg>
                    <span class="turbo-btn-icon">⚡</span>
                    <span class="turbo-btn-label">TURBO</span>
                    <span class="turbo-btn-timer" id="turboTimerFire"></span>
                </button>
                <button class="turbo-btn turbo-bullet" id="turboBtnBullet">
                    <svg class="turbo-ring" viewBox="0 0 100 100">
                        <circle class="turbo-ring-bg" cx="50" cy="50" r="46"/>
                        <circle class="turbo-ring-fill turbo-ring-blue" cx="50" cy="50" r="46" id="turboRingBullet"/>
                    </svg>
                    <span class="turbo-btn-icon">🕐</span>
                    <span class="turbo-btn-label">BULLET</span>
                    <span class="turbo-btn-timer" id="turboTimerBullet"></span>
                </button>
                <button class="turbo-btn turbo-swap" id="turboBtnSwap" title="Switch fire button (A/B)">
                    <span class="turbo-btn-icon">🔄</span>
                    <span class="turbo-btn-label" id="turboSwapLabel">B</span>
                </button>
            </div>
            <div class="bullet-time-overlay" id="bulletTimeOverlay"></div>
        `;

        const style = document.createElement('style');
        style.id = 'turbo-styles';
        style.textContent = this.getStyles();
        document.head.appendChild(style);

        const overlay = document.getElementById('playerOverlay');
        overlay.appendChild(this.container);

        // Apply cheat visual effects
        if (this.BIG_BUTTONS) {
            this.container.classList.add('turbo-big');
        }

        this.bindEvents();
    }

    bindEvents() {
        const fireBtn = document.getElementById('turboBtnFire');
        const bulletBtn = document.getElementById('turboBtnBullet');
        const swapBtn = document.getElementById('turboBtnSwap');

        // TURBO — tap to activate 3 sec
        fireBtn.addEventListener('touchstart', (e) => e.preventDefault());
        fireBtn.addEventListener('click', (e) => { e.preventDefault(); this.activateTurbo(); });

        // BULLET TIME — tap to activate 3 sec
        bulletBtn.addEventListener('touchstart', (e) => e.preventDefault());
        bulletBtn.addEventListener('click', (e) => { e.preventDefault(); this.activateBulletTime(); });

        // SWAP — cycle fire button
        swapBtn.addEventListener('touchstart', (e) => e.preventDefault());
        swapBtn.addEventListener('click', (e) => { e.preventDefault(); this.swapFireKey(); });
    }

    // ── TURBO FIRE ──────────────────────────────
    activateTurbo() {
        if (this.turboActive && !this.NO_COOLDOWN) return;
        if (this.turboActive) this.deactivateTurbo(); // reset if no cooldown
        this.turboActive = true;

        const btn = document.getElementById('turboBtnFire');
        const ring = document.getElementById('turboRingFire');
        const timer = document.getElementById('turboTimerFire');
        btn.classList.add('active');

        if (navigator.vibrate) navigator.vibrate(40);

        const dur = this.DURATION_MS;
        const secs = Math.ceil(dur / 1000);

        // Start countdown ring animation
        ring.style.transition = 'none';
        ring.style.strokeDashoffset = '0';
        ring.getBoundingClientRect();
        ring.style.transition = `stroke-dashoffset ${dur}ms linear`;
        ring.style.strokeDashoffset = '289';

        // Countdown text
        let remaining = secs;
        timer.textContent = String(secs);
        const countInterval = setInterval(() => {
            remaining--;
            timer.textContent = remaining > 0 ? remaining : '';
        }, 1000);

        // Start rapid fire
        const fk = this.FIRE_KEYS[this.activeFireKey];
        this.turboInterval = setInterval(() => {
            this.sendKey(fk, 'keydown');
            setTimeout(() => this.sendKey(fk, 'keyup'), 16);
        }, this.TURBO_RATE_MS);

        // Auto-deactivate
        this.turboTimeout = setTimeout(() => {
            this.deactivateTurbo();
            clearInterval(countInterval);
        }, dur);
    }

    deactivateTurbo() {
        if (!this.turboActive) return;
        this.turboActive = false;

        const btn = document.getElementById('turboBtnFire');
        const timer = document.getElementById('turboTimerFire');
        btn.classList.remove('active');
        timer.textContent = '';

        clearInterval(this.turboInterval);
        clearTimeout(this.turboTimeout);
        this.turboInterval = null;
        this.turboTimeout = null;

        // Release the key
        const fk = this.FIRE_KEYS[this.activeFireKey];
        this.sendKey(fk, 'keyup');
    }

    // ── BULLET TIME ──────────────────────────────
    activateBulletTime() {
        if (this.bulletTimeActive && !this.NO_COOLDOWN) return;
        if (this.bulletTimeActive) this.deactivateBulletTime();
        this.bulletTimeActive = true;

        const btn = document.getElementById('turboBtnBullet');
        const ring = document.getElementById('turboRingBullet');
        const timer = document.getElementById('turboTimerBullet');
        const overlay = document.getElementById('bulletTimeOverlay');

        btn.classList.add('active');
        overlay.classList.add('active');

        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);

        const dur = this.BULLET_DURATION_MS;
        const secs = Math.ceil(dur / 1000);

        // Countdown ring
        ring.style.transition = 'none';
        ring.style.strokeDashoffset = '0';
        ring.getBoundingClientRect();
        ring.style.transition = `stroke-dashoffset ${dur}ms linear`;
        ring.style.strokeDashoffset = '289';

        // Countdown text
        let remaining = secs;
        timer.textContent = String(secs);
        const countInterval = setInterval(() => {
            remaining--;
            timer.textContent = remaining > 0 ? remaining : '';
        }, 1000);

        // Slow down emulation
        this.setEmulatorSpeed(this.SLOWMO_SPEED);

        // Auto-engage turbo fire during bullet time
        if (!this.turboActive) {
            const fk = this.FIRE_KEYS[this.activeFireKey];
            this.turboInterval = setInterval(() => {
                this.sendKey(fk, 'keydown');
                setTimeout(() => this.sendKey(fk, 'keyup'), 16);
            }, this.TURBO_RATE_MS);
        }

        // Auto-deactivate
        this.bulletTimeout = setTimeout(() => {
            this.deactivateBulletTime();
            clearInterval(countInterval);
        }, dur);
    }

    deactivateBulletTime() {
        if (!this.bulletTimeActive) return;
        this.bulletTimeActive = false;

        const btn = document.getElementById('turboBtnBullet');
        const timer = document.getElementById('turboTimerBullet');
        const overlay = document.getElementById('bulletTimeOverlay');

        btn.classList.remove('active');
        overlay.classList.remove('active');
        timer.textContent = '';

        clearTimeout(this.bulletTimeout);
        this.bulletTimeout = null;

        // Restore normal speed
        this.setEmulatorSpeed(1.0);

        // Stop turbo (unless turbo was independently active)
        if (!this.turboActive) {
            clearInterval(this.turboInterval);
            this.turboInterval = null;
            const fk = this.FIRE_KEYS[this.activeFireKey];
            this.sendKey(fk, 'keyup');
        }
    }

    // ── EMULATOR SPEED CONTROL ──────────────────
    setEmulatorSpeed(speed) {
        if (!this.iframeWin) return;

        try {
            const emu = this.iframeWin.EJS_emulator;
            if (emu) {
                // Try RetroArch Module speed control
                if (emu.Module) {
                    if (typeof emu.Module._set_speed === 'function') {
                        emu.Module._set_speed(speed);
                        return;
                    }
                    if (typeof emu.Module.ccall === 'function') {
                        try {
                            emu.Module.ccall('cmd_set_speed', 'void', ['number'], [speed]);
                            return;
                        } catch (e) { /* fallback */ }
                    }
                }
                // Try gameManager
                if (emu.gameManager) {
                    if (typeof emu.gameManager.setSpeed === 'function') {
                        emu.gameManager.setSpeed(speed);
                        return;
                    }
                    emu.gameManager.speed = speed;
                    return;
                }
            }
        } catch (e) {
            console.warn('[TurboEngine] Speed API not available, using frame-skip fallback');
        }

        // Fallback: frame-skip slow motion
        this.frameSkipSlowmo(speed);
    }

    frameSkipSlowmo(speed) {
        if (this.slowmoInterval) {
            clearInterval(this.slowmoInterval);
            this.slowmoInterval = null;
        }
        if (speed >= 1.0) return;

        const emu = this.iframeWin?.EJS_emulator;
        if (!emu) return;

        const runMs = 16;
        const pauseMs = Math.round(runMs * ((1 / speed) - 1));

        this.slowmoInterval = setInterval(() => {
            try {
                if (typeof emu.pause === 'function') emu.pause();
                setTimeout(() => {
                    if (typeof emu.play === 'function') emu.play();
                }, pauseMs);
            } catch (e) { /* silent */ }
        }, runMs + pauseMs);
    }

    // ── INPUT SIMULATION ────────────────────────
    sendKey(keyDef, eventType) {
        if (!this.iframeDoc) return;
        try {
            const event = new KeyboardEvent(eventType, {
                key: keyDef.key,
                keyCode: keyDef.keyCode,
                code: keyDef.code,
                which: keyDef.keyCode,
                bubbles: true,
                cancelable: true,
            });
            this.iframeDoc.dispatchEvent(event);
            this.iframeDoc.body?.dispatchEvent(event);
            this.iframeWin?.dispatchEvent(event);
        } catch (e) { /* cross-origin safety */ }
    }

    // ── SWAP FIRE KEY ───────────────────────────
    swapFireKey() {
        const wasActive = this.turboActive;
        if (wasActive) this.deactivateTurbo();

        this.activeFireKey = (this.activeFireKey + 1) % this.FIRE_KEYS.length;
        const labels = ['B', 'A'];
        const label = document.getElementById('turboSwapLabel');
        if (label) label.textContent = labels[this.activeFireKey] || '?';
        if (navigator.vibrate) navigator.vibrate(15);
    }

    // ── CLEANUP ─────────────────────────────────
    destroy() {
        this.deactivateTurbo();
        this.deactivateBulletTime();
        if (this.slowmoInterval) {
            clearInterval(this.slowmoInterval);
            this.slowmoInterval = null;
        }
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        const style = document.getElementById('turbo-styles');
        if (style) style.remove();
    }

    // ── STYLES ───────────────────────────────────
    getStyles() {
        return `
/* ═══ TURBO + BULLET TIME CONTROLS ═══ */
#turbo-controls {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1002;
}

.turbo-panel {
    position: absolute;
    top: 56px;
    left: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: auto;
    z-index: 1003;
}

@media (min-width: 768px) and (orientation: landscape) {
    .turbo-panel { top: 60px; left: 16px; gap: 12px; }
}
@media (max-width: 480px) {
    .turbo-panel { top: 48px; left: 8px; gap: 6px; }
    .turbo-btn { width: 56px !important; height: 56px !important; }
}

.turbo-btn {
    width: 74px;
    height: 74px;
    border-radius: 50%;
    border: 3px solid rgba(255, 255, 255, 0.25);
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    position: relative;
    overflow: visible;
}

/* ── Countdown Ring (SVG) ── */
.turbo-ring {
    position: absolute;
    inset: -4px;
    width: calc(100% + 8px);
    height: calc(100% + 8px);
    transform: rotate(-90deg);
    pointer-events: none;
}
.turbo-ring-bg {
    fill: none;
    stroke: rgba(255,255,255,0.08);
    stroke-width: 4;
}
.turbo-ring-fill {
    fill: none;
    stroke-width: 5;
    stroke-linecap: round;
    stroke-dasharray: 289;
    stroke-dashoffset: 289;
}
.turbo-ring-red { stroke: #ff3333; filter: drop-shadow(0 0 4px rgba(255,50,50,0.5)); }
.turbo-ring-blue { stroke: #33aaff; filter: drop-shadow(0 0 4px rgba(50,150,255,0.5)); }

.turbo-btn-icon {
    font-size: 22px;
    line-height: 1;
    filter: drop-shadow(0 0 4px rgba(255,255,255,0.3));
    z-index: 1;
}

.turbo-btn-label {
    font-family: 'Press Start 2P', monospace;
    font-size: 6.5px;
    color: #fff;
    letter-spacing: 0.5px;
    margin-top: 2px;
    text-shadow: 0 0 6px rgba(255,255,255,0.4);
    z-index: 1;
}

.turbo-btn-timer {
    position: absolute;
    top: -6px;
    right: -6px;
    font-family: 'Press Start 2P', monospace;
    font-size: 10px;
    color: #fff;
    background: rgba(0,0,0,0.7);
    border-radius: 50%;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-shadow: 0 0 6px rgba(255,255,255,0.5);
    z-index: 2;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
}

/* ── TURBO FIRE BUTTON ── */
.turbo-fire { border-color: rgba(255, 50, 50, 0.4); background: rgba(150, 20, 20, 0.4); }
.turbo-fire.active {
    border-color: #ff3333;
    background: rgba(255, 50, 50, 0.45);
    box-shadow: 0 0 20px rgba(255, 50, 50, 0.5), 0 0 40px rgba(255, 50, 50, 0.2);
    animation: turbo-pulse 0.1s ease-in-out infinite alternate;
}
.turbo-fire.active .turbo-btn-icon { animation: turbo-shake 0.05s linear infinite; }
.turbo-fire.active .turbo-btn-timer { opacity: 1; }
.turbo-fire.active .turbo-ring-red { stroke-dashoffset: 0 !important; }

/* ── BULLET TIME BUTTON ── */
.turbo-bullet { border-color: rgba(50, 150, 255, 0.4); background: rgba(20, 60, 150, 0.4); }
.turbo-bullet.active {
    border-color: #33aaff;
    background: rgba(50, 150, 255, 0.45);
    box-shadow: 0 0 20px rgba(50, 150, 255, 0.5), 0 0 40px rgba(50, 150, 255, 0.2);
    animation: bullet-glow 1s ease-in-out infinite alternate;
}
.turbo-bullet.active .turbo-btn-icon { animation: bullet-spin 2s linear infinite; }
.turbo-bullet.active .turbo-btn-timer { opacity: 1; }

/* ── SWAP BUTTON (smaller) ── */
.turbo-swap {
    width: 48px !important;
    height: 48px !important;
    border-color: rgba(255, 200, 50, 0.3);
    background: rgba(100, 80, 0, 0.3);
    align-self: center;
}
.turbo-swap .turbo-btn-icon { font-size: 14px; }
.turbo-swap .turbo-btn-label { font-size: 9px; color: #ffd700; }

/* ── BULLET TIME SCREEN OVERLAY ── */
.bullet-time-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1001;
    opacity: 0;
    transition: opacity 0.3s ease;
    background: radial-gradient(ellipse at center, transparent 40%, rgba(0, 40, 120, 0.18) 100%);
    border: 3px solid transparent;
}
.bullet-time-overlay.active {
    opacity: 1;
    border-color: rgba(50, 150, 255, 0.15);
    animation: bt-vignette 2s ease-in-out infinite alternate;
}

/* ── ANIMATIONS ── */
@keyframes turbo-pulse {
    from { box-shadow: 0 0 15px rgba(255, 50, 50, 0.5), 0 0 30px rgba(255, 50, 50, 0.2); }
    to   { box-shadow: 0 0 25px rgba(255, 50, 50, 0.7), 0 0 50px rgba(255, 50, 50, 0.4); }
}
@keyframes turbo-shake {
    0%   { transform: translateX(-1px); }
    50%  { transform: translateX(1px); }
    100% { transform: translateX(-1px); }
}
@keyframes bullet-glow {
    from { box-shadow: 0 0 15px rgba(50, 150, 255, 0.4), 0 0 30px rgba(50, 150, 255, 0.2); }
    to   { box-shadow: 0 0 25px rgba(50, 150, 255, 0.7), 0 0 60px rgba(50, 150, 255, 0.3); }
}
@keyframes bullet-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
}
@keyframes bt-vignette {
    from { background: radial-gradient(ellipse at center, transparent 40%, rgba(0, 40, 120, 0.12) 100%); }
    to   { background: radial-gradient(ellipse at center, transparent 30%, rgba(0, 40, 120, 0.22) 100%); }
}

/* ── BIG HEAD MODE (cheat) ── */
.turbo-big .turbo-btn { width: 100px !important; height: 100px !important; }
.turbo-big .turbo-btn-icon { font-size: 32px; }
.turbo-big .turbo-btn-label { font-size: 8px; }
.turbo-big .turbo-swap { width: 64px !important; height: 64px !important; }

/* ── DESKTOP: subtle until hovered ── */
@media (hover: hover) and (pointer: fine) {
    .turbo-panel { opacity: 0.45; transform: scale(0.8); transform-origin: top left; transition: all 0.2s; }
    .turbo-panel:hover { opacity: 1; transform: scale(1); }
    /* Always full opacity when a power-up is active */
    .turbo-panel:has(.active) { opacity: 1; transform: scale(1); }
}
`;
    }
}

window.TurboEngine = TurboEngine;
