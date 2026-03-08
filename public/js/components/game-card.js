/* Reusable game card component — Level 4.0 + completion tracking */
window.GameCard = {
    render(game) {
        const art = H.artworkSrc(game);
        const title = H.escHtml(game.title || game.clean_name || game.filename);
        const sysColor = game.system_color || '#7B2D8E';
        const sysName = game.system_short_name || game.system_name || game.system_id || '';
        const fav = game.is_favorite ? '<span class="game-card-fav">⭐</span>' : '';
        // Played indicator — green dot when last_played is set
        const played = game.last_played
            ? `<span class="game-card-played" title="Played ${H.timeAgo(game.last_played)}">✓</span>`
            : '';

        return `
            <div class="game-card" onclick="Router.navigate('#/game/${game.id}')">
                <div class="game-card-art">
                    ${art
                        ? `<img src="${art}" alt="${title}" loading="lazy" onerror="this.parentNode.innerHTML='<span class=\\'no-art\\'>${H.systemEmoji(game.system_id)}</span>'">`
                        : `<span class="no-art">${H.systemEmoji(game.system_id)}</span>`
                    }
                    <div class="game-card-play-overlay" onclick="event.stopPropagation(); window.arcade.playGame(${game.id})">
                        <div class="game-card-play-btn">▶</div>
                    </div>
                    <span class="game-card-system" style="background:${sysColor}CC">${H.escHtml(sysName)}</span>
                    ${fav}
                    ${played}
                </div>
                <div class="game-card-info">
                    <div class="game-card-title">${title}</div>
                    <div class="game-card-meta">
                        <span>${H.formatBytes(game.size_bytes)}</span>
                        ${game.region ? `<span>· ${H.escHtml(game.region)}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    renderGrid(games) {
        if (!games || games.length === 0) {
            return `<div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <h3>No games found</h3>
                <p>Try adjusting your search or add ROMs to your library.</p>
            </div>`;
        }
        return `<div class="game-grid">${games.map(g => this.render(g)).join('')}</div>`;
    },
};
