/* Arcade OS — V8: Cabinet Mode + Operator Menu */

// ── Cabinet Mode ─────────────────────────────────────────────────────────────
window.CabinetMode = {
    active: false,
    credits: 3,

    init() {
        // Restore state from previous session
        if (localStorage.getItem('cabinet_mode') === '1') this._activate(true);

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+K → toggle cabinet mode
            if (e.ctrlKey && !e.altKey && e.key === 'k') {
                e.preventDefault();
                this.toggle();
                return;
            }
            // Ctrl+Alt+O → operator menu
            if (e.ctrlKey && e.altKey && (e.key === 'o' || e.key === 'O')) {
                e.preventDefault();
                OperatorMenu.toggle();
                return;
            }
            // 'C' → insert coin (only in cabinet mode, only when not in a game)
            if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.altKey && !e.metaKey) {
                if (this.active) {
                    const overlay = document.getElementById('playerOverlay');
                    const inGame = overlay && overlay.style.display !== 'none';
                    if (!inGame) { e.preventDefault(); this.insertCoin(); }
                }
            }
        });
    },

    toggle() { this.active ? this._deactivate() : this._activate(); },

    _activate(silent = false) {
        this.active = true;
        document.body.classList.add('cabinet-mode');
        this._syncMarquee();
        this._updateCoinDisplay();
        if (!silent) H.toast('🕹️ Cabinet Mode ON — Press C to insert a coin!', 'success');
        localStorage.setItem('cabinet_mode', '1');
    },

    _deactivate() {
        this.active = false;
        document.body.classList.remove('cabinet-mode');
        localStorage.removeItem('cabinet_mode');
        H.toast('Cabinet Mode OFF', 'info');
    },

    _syncMarquee() {
        const el = document.getElementById('cabinetMarqueeText');
        if (!el) return;
        let pInfo = null;
        try { pInfo = JSON.parse(localStorage.getItem('arcade_active_player_info') || 'null'); } catch {}
        const name = pInfo?.name || 'YOUR';
        const poss = name.endsWith('s') ? name + "'" : name + "'s";
        const arcade = `${poss.toUpperCase()} WORLD ARCADE`;
        el.textContent =
            `🕹️ ${arcade}  ●  INSERT COIN TO PLAY  ●  PRESS C FOR CREDIT  ●  ` +
            `🕹️ ${arcade}  ●  INSERT COIN TO PLAY  ●  PRESS C FOR CREDIT  ●`;
    },

    insertCoin() {
        if (this.credits >= 9) return; // cap at 9
        this.credits++;
        this._updateCoinDisplay();
        // Use click SFX (coin sound)
        if (window.SFX?.click) SFX.click();
        // Flash coin display
        const display = document.getElementById('coinDisplay');
        if (display) {
            display.classList.add('coin-flash');
            setTimeout(() => display.classList.remove('coin-flash'), 500);
        }
        H.toast(`🪙 Credit inserted! (${this.credits} total)`, 'success');
    },

    useCredit() {
        if (!this.active) return true; // free play when not in cabinet mode
        if (this.credits <= 0) {
            const banner = document.getElementById('insertCoinBanner');
            if (banner) {
                banner.classList.add('coin-bounce');
                setTimeout(() => banner.classList.remove('coin-bounce'), 600);
            }
            H.toast('🪙 Insert coin to play! Press C', 'error');
            return false;
        }
        this.credits = Math.max(0, this.credits - 1);
        this._updateCoinDisplay();
        return true;
    },

    _updateCoinDisplay() {
        const el = document.getElementById('coinCredits');
        if (el) el.textContent = this.credits;
        const insertMsg = document.getElementById('insertCoinBanner');
        if (insertMsg) {
            insertMsg.style.opacity = this.credits <= 0 ? '1' : '0';
        }
    },
};

// ── Operator Menu ─────────────────────────────────────────────────────────────
window.OperatorMenu = {
    visible: false,

    toggle() { this.visible ? this.hide() : this.show(); },

    async show() {
        this.visible = true;
        const overlay = document.getElementById('operatorOverlay');
        if (!overlay) return;
        overlay.classList.add('visible');

        // Update live time
        const updateTime = () => {
            const el = document.getElementById('opStatTime');
            if (el) el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        };
        updateTime();
        this._timeInterval = setInterval(updateTime, 1000);

        // Fetch quick stats
        try {
            const [weekData, libData] = await Promise.all([
                API.get('/api/stats/weekly').catch(() => null),
                API.library({ limit: 1 }).catch(() => null),
            ]);
            if (libData?.total != null) {
                const el = document.getElementById('opStatGames');
                if (el) el.textContent = libData.total;
            }
            if (weekData?.totals) {
                const s = document.getElementById('opStatSessions');
                const p = document.getElementById('opStatPlayers');
                if (s) s.textContent = weekData.totals.total_sessions;
                if (p) p.textContent = weekData.totals.active_players;
            }
            if (weekData?.leaderboard?.[0]) {
                const leader = weekData.leaderboard[0];
                const el = document.getElementById('opLeader');
                if (el) el.textContent = `${leader.emoji} ${leader.name} leads`;
            }
        } catch {}
    },

    hide() {
        this.visible = false;
        const overlay = document.getElementById('operatorOverlay');
        if (overlay) overlay.classList.remove('visible');
        if (this._timeInterval) { clearInterval(this._timeInterval); this._timeInterval = null; }
    },
};
