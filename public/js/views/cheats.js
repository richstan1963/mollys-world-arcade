/* ═══════════════════════════════════════════════════════════
   CHEAT CODES — Molly's World Arcade
   Secret cheat code terminal for unlocking power-ups.
   Two-layer system: UNLOCKED (visible) vs ENABLED (active).
   Type MOLLY to unlock all — then toggle what you want ON.
   Conflicts auto-resolve: strongest effect wins.
   ═══════════════════════════════════════════════════════════ */

window.CheatsView = {
    // ── Master Cheat Database ─────────────────────────
    CHEATS: [
        { code: 'TURBOMAX',    title: 'TURBO MAX',       icon: '⚡', desc: 'TURBO lasts 5 seconds instead of 3',      group: 'power',  effect: { turbo_duration: 5000 } },
        { code: 'BULLETPROOF', title: 'BULLETPROOF',      icon: '🛡️', desc: 'BULLET TIME lasts 5 seconds instead of 3', group: 'power',  effect: { bullet_duration: 5000 } },
        { code: 'GODMODE',     title: 'GOD MODE',         icon: '👑', desc: 'Both powers last 10 seconds!',            group: 'power',  effect: { turbo_duration: 10000, bullet_duration: 10000 } },
        { code: 'SPEEDEMON',   title: 'SPEED DEMON',      icon: '💨', desc: 'TURBO fires at 3x speed (60 presses/sec)', group: 'power', effect: { turbo_rate: 16 } },
        { code: 'SLOWPOKE',    title: 'ULTRA SLOW-MO',    icon: '🐌', desc: 'BULLET TIME runs at 0.25x speed',          group: 'power', effect: { slowmo_speed: 0.25 } },
        { code: 'UUDDLRLRBA', title: 'KONAMI CODE',      icon: '🎮', desc: 'The legendary code! Unlocks rainbow mode', group: 'visual', effect: { rainbow_mode: true } },
        { code: 'IDDQD',       title: 'DOOM MODE',        icon: '💀', desc: 'Classic. Red-tinted bullet time overlay',  group: 'visual', effect: { doom_tint: true } },
        { code: 'BIGHEAD',     title: 'BIG HEAD MODE',    icon: '🤯', desc: 'Just for fun — extra large turbo buttons', group: 'visual', effect: { big_buttons: true } },
        { code: 'CHRISTMAS',   title: 'HOLIDAY MODE',     icon: '🎄', desc: 'Snow particles & festive colors',         group: 'theme',  effect: { holiday_theme: true } },
        { code: 'MOLLYROCKS',  title: 'MOLLY MODE',       icon: '🌸', desc: 'Pink power-up glow & sparkle effects',    group: 'theme',  effect: { molly_theme: true } },
        { code: 'NEONNIGHT',   title: 'NEON NIGHT',       icon: '🌃', desc: 'Cyberpunk neon button glow',              group: 'theme',  effect: { neon_theme: true } },
        { code: 'INFINITE',    title: 'INFINITE POWER',   icon: '♾️', desc: 'No cooldown — activate powers back-to-back', group: 'power', effect: { no_cooldown: true } },
    ],

    MASTER_CODE: 'MOLLY',

    // ── Unlocked = visible (can see the card) ──────────
    getUnlocked() {
        try { return JSON.parse(localStorage.getItem('arcade_cheats') || '[]'); }
        catch { return []; }
    },
    saveUnlocked(list) {
        localStorage.setItem('arcade_cheats', JSON.stringify(list));
    },

    // ── Enabled = active (effect is ON) ────────────────
    getEnabled() {
        try { return JSON.parse(localStorage.getItem('arcade_cheats_enabled') || '[]'); }
        catch { return []; }
    },
    saveEnabled(list) {
        localStorage.setItem('arcade_cheats_enabled', JSON.stringify(list));
    },
    isEnabled(code) {
        return this.getEnabled().includes(code);
    },

    // ── Active Effects (only from ENABLED cheats, strongest wins) ──
    getActiveEffects() {
        const enabled = this.getEnabled();
        const effects = {};
        for (const cheat of this.CHEATS) {
            if (!enabled.includes(cheat.code)) continue;
            for (const [key, val] of Object.entries(cheat.effect)) {
                if (typeof val === 'boolean') {
                    // Booleans: any enabled cheat turns it on
                    effects[key] = true;
                } else if (typeof val === 'number') {
                    // Numbers: strongest (highest) value wins
                    // Exception: lower is stronger for slowmo_speed and turbo_rate
                    const lowerIsBetter = key === 'slowmo_speed' || key === 'turbo_rate';
                    if (effects[key] === undefined) {
                        effects[key] = val;
                    } else if (lowerIsBetter) {
                        effects[key] = Math.min(effects[key], val);
                    } else {
                        effects[key] = Math.max(effects[key], val);
                    }
                }
            }
        }
        return effects;
    },

    // ── Main Render ─────────────────────────────
    render() {
        const app = document.getElementById('app');
        const unlocked = this.getUnlocked();
        const enabled = this.getEnabled();

        app.innerHTML = `
            <div class="cheats-page">
                <div class="cheats-header">
                    <div class="cheats-title-row">
                        <span class="cheats-skull">💀</span>
                        <h1 class="cheats-title">CHEAT CODES</h1>
                        <span class="cheats-skull">💀</span>
                    </div>
                    <p class="cheats-subtitle">Enter a code to unlock secret power-ups and visual effects</p>
                    <div class="cheats-counter">${unlocked.length} / ${this.CHEATS.length} unlocked</div>
                </div>

                <!-- Terminal Input -->
                <div class="cheats-terminal">
                    <div class="terminal-header">
                        <span class="terminal-dot red"></span>
                        <span class="terminal-dot yellow"></span>
                        <span class="terminal-dot green"></span>
                        <span class="terminal-title">CHEAT TERMINAL v1.0</span>
                    </div>
                    <div class="terminal-body">
                        <div class="terminal-output" id="terminalOutput">
                            <div class="terminal-line system">${(() => { try { const p = JSON.parse(localStorage.getItem('arcade_active_player_info') || 'null'); if (!p) return 'YOUR'; const n = p.name.toUpperCase(); return n.endsWith('S') ? n + "'" : n + "'S"; } catch { return "YOUR"; } })()} WORLD ARCADE — CHEAT ENGINE</div>
                            <div class="terminal-line system">Type a cheat code and press ENTER...</div>
                            <div class="terminal-line hint">TIP: Try classic game codes or make something up!</div>
                        </div>
                        <div class="terminal-input-row">
                            <span class="terminal-prompt">&gt;</span>
                            <input type="text" class="terminal-input" id="cheatInput"
                                   placeholder="ENTER CODE..."
                                   autocomplete="off" autocapitalize="characters" spellcheck="false"
                                   maxlength="20">
                        </div>
                    </div>
                </div>

                <!-- Cheats Grid -->
                <div class="cheats-grid-header">
                    <h2>🔓 Unlocked Cheats</h2>
                </div>
                <div class="cheats-grid" id="cheatsGrid">
                    ${this.CHEATS.map(c => this.renderCheatCard(c, unlocked.includes(c.code), enabled.includes(c.code))).join('')}
                </div>
            </div>
        `;

        // Bind input
        const input = document.getElementById('cheatInput');
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.submitCode(input.value.trim().toUpperCase());
                input.value = '';
            }
        });
        input.focus();
    },

    renderCheatCard(cheat, isUnlocked, isEnabled) {
        const groupColors = { power: '#EF4444', visual: '#8B5CF6', theme: '#06B6D4' };
        const groupLabels = { power: 'POWER', visual: 'VISUAL', theme: 'THEME' };
        const color = groupColors[cheat.group] || '#A855F7';

        if (!isUnlocked) {
            // Locked — mystery card
            return `
                <div class="cheat-card locked" data-code="${cheat.code}">
                    <div class="cheat-card-master">
                        <span class="cheat-card-lock">🔒</span>
                        <span class="cheat-card-master-name">???</span>
                    </div>
                    <div class="cheat-card-body">
                        <div class="cheat-card-desc">Enter the correct code to unlock</div>
                    </div>
                </div>
            `;
        }

        // Unlocked — show card with ON/OFF toggle
        const btnClass = isEnabled ? 'cheat-toggle-btn active' : 'cheat-toggle-btn';
        const btnLabel = isEnabled ? 'ON' : 'OFF';
        const cardClass = isEnabled ? 'cheat-card unlocked enabled' : 'cheat-card unlocked';

        return `
            <div class="${cardClass}" data-code="${cheat.code}">
                <div class="cheat-card-master" style="border-color:${color};background:${isEnabled ? color + '15' : 'rgba(255,255,255,0.02)'};">
                    <span class="cheat-card-master-icon">${cheat.icon}</span>
                    <span class="cheat-card-master-name" style="color:${isEnabled ? color : '#6B7280'}">${cheat.title}</span>
                    <span class="cheat-card-group" style="background:${isEnabled ? color : '#374151'};color:${isEnabled ? '#000' : '#9CA3AF'}">${groupLabels[cheat.group] || ''}</span>
                </div>
                <div class="cheat-card-body">
                    <div class="cheat-card-code-row">
                        <span class="cheat-card-code-label">CODE:</span>
                        <span class="cheat-card-code-value">${cheat.code}</span>
                    </div>
                    <div class="cheat-card-desc">${cheat.desc}</div>
                </div>
                <button class="${btnClass}" onclick="CheatsView.toggleCheat('${cheat.code}')">${btnLabel}</button>
            </div>
        `;
    },

    submitCode(code) {
        const output = document.getElementById('terminalOutput');
        const grid = document.getElementById('cheatsGrid');
        if (!code) return;

        // Add input line
        output.innerHTML += `<div class="terminal-line input">> ${H.escHtml(code)}</div>`;

        const unlocked = this.getUnlocked();

        // ★ Master code — unlocks ALL cheats at once (all OFF by default)
        if (code === this.MASTER_CODE) {
            const alreadyAll = this.CHEATS.every(c => unlocked.includes(c.code));
            if (alreadyAll) {
                output.innerHTML += `<div class="terminal-line warn">⚠ All cheats are already unlocked! You're maxed out! 👑</div>`;
            } else {
                let newCount = 0;
                for (const cheat of this.CHEATS) {
                    if (!unlocked.includes(cheat.code)) {
                        unlocked.push(cheat.code);
                        newCount++;
                    }
                }
                this.saveUnlocked(unlocked);
                // Do NOT enable any — they stay OFF until toggled

                output.innerHTML += `<div class="terminal-line master">🌸 ═══════════════════════════════════════</div>`;
                output.innerHTML += `<div class="terminal-line master">🌸  MOLLY'S MASTER CODE ACTIVATED!</div>`;
                output.innerHTML += `<div class="terminal-line master">🌸  ${newCount} cheats unlocked at once!</div>`;
                output.innerHTML += `<div class="terminal-line master">🌸  Toggle ON the ones you want! 👑</div>`;
                output.innerHTML += `<div class="terminal-line master">🌸 ═══════════════════════════════════════</div>`;

                // Big confetti burst
                if (window.Confetti) {
                    Confetti.burst(window.innerWidth * 0.3, 300, '#EC4899');
                    setTimeout(() => Confetti.burst(window.innerWidth * 0.5, 250, '#A855F7'), 200);
                    setTimeout(() => Confetti.burst(window.innerWidth * 0.7, 300, '#06B6D4'), 400);
                }
                SFX.toast();

                // Update counter
                const counter = document.querySelector('.cheats-counter');
                if (counter) counter.textContent = `${unlocked.length} / ${this.CHEATS.length} unlocked`;

                // Re-render all cards (all OFF)
                const enabled = this.getEnabled();
                if (grid) {
                    grid.innerHTML = this.CHEATS.map(c => this.renderCheatCard(c, true, enabled.includes(c.code))).join('');
                }
            }
            output.scrollTop = output.scrollHeight;
            return;
        }

        // Single cheat code
        const cheat = this.CHEATS.find(c => c.code === code);

        if (cheat) {
            if (unlocked.includes(code)) {
                output.innerHTML += `<div class="terminal-line warn">⚠ ${cheat.title} is already unlocked!</div>`;
            } else {
                unlocked.push(code);
                this.saveUnlocked(unlocked);
                // Single code entry also starts OFF
                output.innerHTML += `<div class="terminal-line success">✓ CHEAT UNLOCKED: ${cheat.title} ${cheat.icon}</div>`;
                output.innerHTML += `<div class="terminal-line success">${cheat.desc}</div>`;
                output.innerHTML += `<div class="terminal-line hint">Toggle it ON below to activate!</div>`;

                if (window.Confetti) Confetti.burst(window.innerWidth / 2, 300, cheat.group === 'power' ? '#EF4444' : '#06B6D4');
                SFX.toast();

                const counter = document.querySelector('.cheats-counter');
                if (counter) counter.textContent = `${unlocked.length} / ${this.CHEATS.length} unlocked`;

                const enabled = this.getEnabled();
                if (grid) {
                    grid.innerHTML = this.CHEATS.map(c => this.renderCheatCard(c, unlocked.includes(c.code), enabled.includes(c.code))).join('');
                }
            }
        } else {
            const fails = [
                `"${code}" is not a valid cheat code. Nice try though!`,
                `Nope! "${code}" does nothing. Keep guessing...`,
                `ACCESS DENIED. "${code}" rejected.`,
                `ERROR: "${code}" not found in cheat database.`,
                `🤔 "${code}"? That's not a thing. Try harder!`,
            ];
            output.innerHTML += `<div class="terminal-line error">${fails[Math.floor(Math.random() * fails.length)]}</div>`;
            SFX.error();
        }

        output.scrollTop = output.scrollHeight;
    },

    toggleCheat(code) {
        let enabled = this.getEnabled();
        if (enabled.includes(code)) {
            // Turn OFF
            enabled = enabled.filter(c => c !== code);
        } else {
            // Turn ON
            enabled.push(code);
        }
        this.saveEnabled(enabled);

        // Re-render grid in place (no full page re-render to keep terminal)
        const grid = document.getElementById('cheatsGrid');
        const unlocked = this.getUnlocked();
        if (grid) {
            grid.innerHTML = this.CHEATS.map(c => this.renderCheatCard(c, unlocked.includes(c.code), enabled.includes(c.code))).join('');
        }
    },
};
