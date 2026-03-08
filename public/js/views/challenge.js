/* Challenge Mode — Random game picker with timer */
window.ChallengeView = {
    currentChallenge: null,
    timerInterval: null,
    timeRemaining: 0,

    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading challenge...</div>';

        try {
            const history = await API.challengeHistory();

            let html = `
                <div class="section-header" style="margin-bottom:24px;">
                    <span class="section-title">🎯 Challenge Mode</span>
                </div>

                <div class="challenge-hub">
                    <div class="challenge-card-main" id="challengeMain">
                        <div class="challenge-icon">🎯</div>
                        <h2>Ready for a Challenge?</h2>
                        <p class="challenge-desc">Get a random game and a challenge to complete. Accept the dare!</p>
                        <button class="btn btn-yellow btn-lg" onclick="ChallengeView.getChallenge()">
                            🎲 Roll Challenge
                        </button>
                    </div>

                    ${history.length > 0 ? `
                        <div class="section-header" style="margin-top:32px;">
                            <span class="section-title">🏅 Challenge History</span>
                        </div>
                        <div class="challenge-history">
                            ${history.map(h => `
                                <div class="challenge-history-item">
                                    <span class="challenge-h-emoji" style="color:${h.color}">${h.emoji}</span>
                                    <span class="challenge-h-name">${H.escHtml(h.player_name)}</span>
                                    <span class="challenge-h-title">${H.escHtml(h.title)}</span>
                                    <span class="challenge-h-time">${H.timeAgo(h.unlocked_at)}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    async getChallenge() {
        const main = document.getElementById('challengeMain');
        if (!main) return;
        main.innerHTML = '<div class="loading">Rolling the dice...</div>';

        try {
            const data = await API.randomChallenge();
            this.currentChallenge = data;
            const game = data.game;
            const ch = data.challenge;
            const art = H.artworkSrc(game);
            const title = H.escHtml(game.clean_name);

            main.innerHTML = `
                <div class="challenge-reveal">
                    <div class="challenge-game-art">
                        ${art ? `<img src="${art}" alt="${title}">` : `<span class="no-art" style="font-size:48px">${H.systemEmoji(game.system_id)}</span>`}
                    </div>
                    <div class="challenge-game-info">
                        <div class="challenge-type-badge">${ch.type === 'score' ? '🏆' : ch.type === 'endurance' ? '💪' : ch.type === 'blind' ? '🙈' : '⚡'} ${H.escHtml(ch.title)}</div>
                        <h2 class="challenge-game-title">${title}</h2>
                        <p class="challenge-desc">${H.escHtml(ch.description)}</p>
                        <div class="challenge-timer-display" id="challengeTimer">${Math.floor(ch.duration / 60)}:00</div>
                        <div class="challenge-actions">
                            <button class="btn btn-yellow btn-lg" onclick="ChallengeView.acceptChallenge()">
                                ▶ Accept Challenge
                            </button>
                            <button class="btn btn-ghost" onclick="ChallengeView.getChallenge()">
                                🎲 Re-Roll
                            </button>
                        </div>
                    </div>
                </div>
            `;

            SFX?.launch();
        } catch (err) {
            main.innerHTML = `<p style="color:var(--red)">Failed: ${H.escHtml(err.message)}</p>`;
        }
    },

    acceptChallenge() {
        if (!this.currentChallenge) return;
        const ch = this.currentChallenge.challenge;
        const game = this.currentChallenge.game;

        // Start the timer
        this.timeRemaining = ch.duration;
        this.startTimer();

        // Launch the game
        window.arcade.playGame(game.id);
        Confetti?.burst(window.innerWidth / 2, window.innerHeight / 2, 30);
    },

    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            this.timeRemaining--;
            const el = document.getElementById('challengeTimer');
            if (el) {
                const m = Math.floor(this.timeRemaining / 60);
                const s = this.timeRemaining % 60;
                el.textContent = `${m}:${String(s).padStart(2, '0')}`;
            }
            if (this.timeRemaining <= 0) {
                clearInterval(this.timerInterval);
                this.challengeComplete();
            }
        }, 1000);
    },

    async challengeComplete() {
        if (!this.currentChallenge) return;
        const ch = this.currentChallenge.challenge;
        const game = this.currentChallenge.game;

        // Ask which player completed it
        const players = arcade.players;
        if (players.length > 0) {
            // Auto-assign to first non-guest player for now
            const player = players.find(p => p.name !== 'Guest') || players[0];
            try {
                await API.completeChallenge(player.id, ch.type, game.clean_name, ch.duration);
                Confetti?.celebrate();
                H.toast(`${player.emoji} ${player.name} completed the challenge!`, 'success');
            } catch (e) { /* silent */ }
        }
    },
};
