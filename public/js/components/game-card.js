/* Reusable game card component — Level 5.0 + Metacritic badges + skeleton loading */
window.GameCard = {
    render(game) {
        const art = H.artworkSrc(game);
        const title = H.escHtml(game.title || game.clean_name || game.filename);
        const sysColor = game.system_color || '#7B2D8E';
        const sysName = game.system_short_name || game.system_name || game.system_id || '';
        const fav = game.is_favorite ? '<span class="game-card-fav">⭐</span>' : '';
        const played = game.last_played
            ? `<span class="game-card-played" title="Played ${H.timeAgo(game.last_played)}">✓</span>`
            : '';

        // Metacritic + rating badges
        let badges = '';
        if (game.metacritic_score || game.rawg_rating) {
            let badgeHtml = '';
            if (game.metacritic_score) {
                const mc = game.metacritic_score;
                const cls = mc >= 75 ? 'mc-green' : mc >= 50 ? 'mc-yellow' : 'mc-red';
                badgeHtml += `<span class="metacritic-badge ${cls}" title="Metacritic: ${mc}">${mc}</span>`;
            }
            if (game.rawg_rating && game.rawg_rating >= 3.0) {
                badgeHtml += `<span class="rating-badge" title="Rating: ${game.rawg_rating}/5"><span class="star">★</span>${game.rawg_rating.toFixed(1)}</span>`;
            }
            if (badgeHtml) badges = `<div class="game-card-badge">${badgeHtml}</div>`;
        }

        return `
            <div class="game-card" data-rom-id="${game.id}">
                <div class="game-card-art">
                    ${art
                        ? `<img src="${art}" alt="${title}" loading="lazy" decoding="async" onerror="this.parentNode.innerHTML='<span class=\\'no-art\\'>${H.systemEmoji(game.system_id)}</span>'">`
                        : `<span class="no-art">${H.systemEmoji(game.system_id)}</span>`
                    }
                    <div class="game-card-play-overlay">
                        <div class="game-card-actions">
                            <button class="game-card-action-btn game-card-action-play" onclick="event.stopPropagation(); window.arcade.playGame(${game.id})" title="Play Game">▶ Play</button>
                            <button class="game-card-action-btn game-card-action-info" onclick="event.stopPropagation(); Router.navigate('#/game/${game.id}')" title="Get Info">ℹ Info</button>
                        </div>
                    </div>
                    <span class="game-card-system" style="background:${sysColor}CC">${H.escHtml(sysName)}</span>
                    ${fav}
                    ${played}
                    ${badges}
                </div>
                <div class="game-card-info">
                    <div class="game-card-title">${title}</div>
                    <div class="game-card-meta">
                        <span>${H.formatBytes(game.size_bytes)}</span>
                        ${game.region ? `<span>· ${H.escHtml(game.region)}</span>` : ''}
                        ${game.genre ? `<span>· ${H.escHtml(game.genre)}</span>` : ''}
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

    /** Render N skeleton placeholder cards */
    renderSkeleton(count = 12) {
        const cards = Array.from({ length: count }, () => `
            <div class="skeleton-card">
                <div class="skeleton-art"></div>
                <div class="skeleton-info">
                    <div class="skeleton-title"></div>
                    <div class="skeleton-meta"></div>
                </div>
            </div>
        `).join('');
        return `<div class="skeleton-grid">${cards}</div>`;
    },

    /** Render N system skeleton cards */
    renderSystemSkeleton(count = 8) {
        const cards = Array.from({ length: count }, () => `
            <div class="skeleton-system-card">
                <div class="skeleton-sysname"></div>
                <div class="skeleton-syscount"></div>
            </div>
        `).join('');
        return `<div class="skeleton-system-grid">${cards}</div>`;
    },
};
