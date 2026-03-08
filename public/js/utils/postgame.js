/* ═══════════════════════════════════════════════════════
   Post-Game Modal — Score submission + Star rating
   Shows after exiting a ROM game if played 30+ seconds
   ═══════════════════════════════════════════════════════ */

window.PostGame = {
    show(romId, gameName, durationSec) {
        // Only show if played at least 30 seconds
        if (durationSec < 30) return;

        const activePlayer = window.ArcadeEngine?.getActivePlayer();
        const playerName = activePlayer?.name || 'Player';
        const playerEmoji = activePlayer?.emoji || '🎮';

        const mins = Math.floor(durationSec / 60);
        const secs = durationSec % 60;
        const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

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

                <div class="postgame-actions">
                    <button class="postgame-btn" onclick="PostGame.dismiss()">Skip</button>
                    <button class="postgame-btn postgame-btn-primary" onclick="PostGame.submit()">Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this._romId = romId;
        this._rating = 0;
        this._playerId = activePlayer?.id;
    },

    _romId: null,
    _rating: 0,
    _playerId: null,

    setRating(n) {
        this._rating = n;
        const stars = document.querySelectorAll('#postgameStars .postgame-star');
        stars.forEach((star, i) => {
            star.classList.toggle('active', i < n);
        });
        SFX.click();
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
