/* ═══════════════════════════════════════════════════════
   Post-Game Modal — Score submission + Star rating
   + Quick actions: Report, Favorite, Play Again
   Shows after exiting a ROM game if played 30+ seconds
   ═══════════════════════════════════════════════════════ */

window.PostGame = {
    show(romId, gameName, durationSec, opts = {}) {
        // Only show if played at least 30 seconds
        if (durationSec < 30) return;

        const activePlayer = window.ArcadeEngine?.getActivePlayer();
        const playerName = activePlayer?.name || 'Player';
        const playerEmoji = activePlayer?.emoji || '🎮';

        const mins = Math.floor(durationSec / 60);
        const secs = durationSec % 60;
        const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

        this._romId = romId;
        this._rating = 0;
        this._playerId = activePlayer?.id;
        this._isFav = !!opts.isFavorite;

        // Build modal
        const overlay = document.createElement('div');
        overlay.className = 'postgame-overlay';
        overlay.id = 'postgameOverlay';
        overlay.innerHTML = `
            <div class="postgame-card">
                <div class="postgame-emoji">${playerEmoji}</div>
                <div class="postgame-title">Good Game, ${H.escHtml(playerName)}!</div>
                <div class="postgame-game">${H.escHtml(gameName)}</div>
                <div class="postgame-duration">${timeStr}</div>
                <div class="postgame-duration-label">Play Time</div>

                <div class="postgame-stars-label">Rate this game</div>
                <div class="postgame-stars" id="postgameStars">
                    ${[1,2,3,4,5].map(n => `<span class="postgame-star" data-rating="${n}" onclick="PostGame.setRating(${n})">⭐</span>`).join('')}
                </div>

                <div class="postgame-quick-actions">
                    <button class="postgame-quick-btn" id="pgFavBtn" onclick="PostGame.toggleFav()" title="Favorite">
                        <span class="postgame-quick-icon">${this._isFav ? '⭐' : '☆'}</span>
                        <span class="postgame-quick-label">${this._isFav ? 'Favorited' : 'Favorite'}</span>
                    </button>
                    <button class="postgame-quick-btn" onclick="PostGame.playAgain()" title="Play Again">
                        <span class="postgame-quick-icon">🔄</span>
                        <span class="postgame-quick-label">Play Again</span>
                    </button>
                    <button class="postgame-quick-btn postgame-quick-btn-report" onclick="PostGame.toggleReport()" title="Report Issue">
                        <span class="postgame-quick-icon">🚩</span>
                        <span class="postgame-quick-label">Report</span>
                    </button>
                </div>

                <div class="postgame-report-form" id="pgReportForm" style="display:none;">
                    <select class="postgame-report-select" id="pgReportType">
                        <option value="">What's wrong?</option>
                        <option value="broken">Game won't load</option>
                        <option value="crashes">Crashes during play</option>
                        <option value="wrong_art">Wrong artwork</option>
                        <option value="wrong_info">Wrong info</option>
                        <option value="other">Other</option>
                    </select>
                    <textarea class="postgame-report-text" id="pgReportDesc" rows="2" placeholder="Details (optional)"></textarea>
                    <button class="postgame-btn postgame-btn-report-submit" onclick="PostGame.submitReport()">Submit Report</button>
                </div>

                <div class="postgame-actions">
                    <button class="postgame-btn" onclick="PostGame.dismiss()">Skip</button>
                    <button class="postgame-btn postgame-btn-primary" onclick="PostGame.submit()">Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
    },

    _romId: null,
    _rating: 0,
    _playerId: null,
    _isFav: false,

    setRating(n) {
        this._rating = n;
        const stars = document.querySelectorAll('#postgameStars .postgame-star');
        stars.forEach((star, i) => {
            star.classList.toggle('active', i < n);
        });
        SFX.click();
    },

    async toggleFav() {
        try {
            this._isFav = !this._isFav;
            await API.toggleFavorite(this._romId, this._isFav);
            const btn = document.getElementById('pgFavBtn');
            if (btn) {
                btn.querySelector('.postgame-quick-icon').textContent = this._isFav ? '⭐' : '☆';
                btn.querySelector('.postgame-quick-label').textContent = this._isFav ? 'Favorited' : 'Favorite';
            }
            H.toast(this._isFav ? 'Added to favorites ⭐' : 'Removed from favorites', 'success');
            SFX.click();
        } catch (err) {
            H.toast('Could not update favorite', 'error');
        }
    },

    playAgain() {
        this.dismiss();
        Router.navigate(`#/game/${this._romId}`);
    },

    toggleReport() {
        const form = document.getElementById('pgReportForm');
        if (form) form.style.display = form.style.display === 'none' ? '' : 'none';
    },

    async submitReport() {
        const type = document.getElementById('pgReportType')?.value;
        if (!type) { H.toast('Select what\'s wrong', 'error'); return; }

        try {
            await API.submitGameReport({
                rom_id: this._romId,
                player_id: this._playerId,
                type,
                description: document.getElementById('pgReportDesc')?.value || '',
            });
            H.toast('Report submitted — thanks! 🚩', 'success');
            document.getElementById('pgReportForm').style.display = 'none';
        } catch (err) {
            H.toast('Could not submit report', 'error');
        }
    },

    async submit() {
        try {
            if (this._rating > 0 && this._playerId && this._romId) {
                await API.setPlayerRating(this._romId, this._playerId, this._rating);
                H.toast('Rating saved! ⭐', 'success');
            }
        } catch (err) {
            console.error('PostGame submit error:', err);
        }
        this.dismiss();
    },

    dismiss() {
        const overlay = document.getElementById('postgameOverlay');
        if (overlay) {
            overlay.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => overlay.remove(), 200);
        }
    },
};
