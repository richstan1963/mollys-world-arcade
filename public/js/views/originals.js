/* Originals View — Themed Custom HTML5 Arcade Games */
window.OriginalsView = {

    // Get active player info for theming
    _player() {
        try {
            return JSON.parse(localStorage.getItem('arcade_active_player_info') || 'null');
        } catch { return null; }
    },

    // Get theme object
    _theme() {
        const p = this._player();
        if (p && typeof ArcadeThemes !== 'undefined') {
            return ArcadeThemes.get(p.theme || 'retro');
        }
        return (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get('retro') : null;
    },

    // Get themed game name: "MollyPop", "JRo Blast", "ElijahStomp", etc.
    _themedName(gameId) {
        const p = this._player();
        if (p && p.name && typeof ArcadeThemes !== 'undefined') {
            return ArcadeThemes.gameName(p.name, p.theme || 'retro', gameId);
        }
        return null; // No active player — use default game name
    },

    // Get themed score currency: "Fossils", "Stars", etc.
    _scoreName() {
        const th = this._theme();
        return th ? th.scoreName : 'Points';
    },
    _scoreIcon() {
        const th = this._theme();
        return th ? th.scoreIcon : '🏆';
    },

    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading...</div>';

        try {
            const games = await API.originals();
            const p = this._player();
            const themeObj = this._theme();
            const heroIcon = themeObj ? themeObj.icon : '🕹️';
            const heroTitle = p ? `${p.name}'s Originals` : 'Arcade Originals';
            const heroSub = themeObj ? `${themeObj.name} theme — ${themeObj.description}` : 'Custom games built just for this arcade';

            let html = `
                <div class="originals-hero">
                    <div class="originals-hero-icon">${heroIcon}</div>
                    <h1 class="originals-hero-title">${H.escHtml(heroTitle)}</h1>
                    <p class="originals-hero-subtitle">${H.escHtml(heroSub)}</p>
                </div>

                <div class="originals-grid">
                    ${games.map(g => this.renderGameCard(g)).join('')}
                </div>
            `;

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    renderGameCard(game) {
        const p = this._player();
        const themeObj = this._theme();
        const themedName = this._themedName(game.id);
        const displayName = themedName || game.name;
        const color = themeObj ? themeObj.colors[0] : (game.color || '#F43F5E');
        const cardIcon = themeObj ? themeObj.icon : (game.icon || '🎮');
        const topScores = (game.top_scores || []).slice(0, 3);
        const scoreName = this._scoreName();
        const scoreIcon = this._scoreIcon();

        // Per-game tags (themed)
        const GAME_TAGS = {
            mollypop:    [`${scoreIcon} Match`, '⚡ Combos', '🏆 Leaderboard'],
            tictacmae:   [`${cardIcon} Tic Tac Toe`, '🤖 vs AI', '🏆 Best of 5'],
            maetris:     ['🧱 Blocks', '⚡ Speed', '📈 Classic'],
            maeteoroids: ['🚀 Shooter', '💫 Arcade', '🎯 Reflexes'],
            maekout:     ['🏓 Breakout', '✨ Power-Ups', '🧱 Bricks'],
            flappymae:   ['🐦 One-Touch', `${cardIcon} Pipes`, '😤 Hard'],
            pacmae:      ['👻 Maze Chase', '⚡ Power Pellets', '🕹️ Classic'],
            mollypong:   ['🏓 Pong', '🤖 vs AI', '⚡ Fast'],
            molliped:    ['🐛 Centipede', '🍄 Mushrooms', '🕷️ Spiders'],
            mollycontrol:['🎯 Missile Command', '💥 Explosions', '🏙️ Defend'],
        };
        const tags = GAME_TAGS[game.id] || ['🎮 Game'];

        // Per-game themed subtitle
        const GAME_SUBS = {
            mollypop:    `Tap matching blocks to pop them! Earn ${scoreName}!`,
            tictacmae:   'Challenge the AI to a battle of wits!',
            maetris:     'Stack blocks, clear lines, beat your best!',
            maeteoroids: 'Blast asteroids in deep space!',
            maekout:     'Break all the bricks with power-ups!',
            flappymae:   'One-touch flying through pipes!',
            pacmae:      'Chomp pellets, dodge ghosts!',
            mollypong:   'Classic pong with AI opponent!',
            molliped:    'Blast centipedes and spiders!',
            mollycontrol:'Defend cities from incoming missiles!',
        };
        const subtitle = GAME_SUBS[game.id] || game.description || '';

        return `
            <div class="original-card candy-card" style="--card-color:${color}">
                <div class="candy-card-banner">
                    <div class="candy-banner-bg"></div>
                    <div class="candy-banner-emoji">${cardIcon}</div>
                </div>
                <div class="original-card-header">
                    <div class="original-card-info">
                        <h2 class="original-card-title">${H.escHtml(displayName)}</h2>
                        <p class="original-card-desc">${H.escHtml(subtitle)}</p>
                        <div class="candy-tags">${tags.map(t => `<span class="candy-tag">${t}</span>`).join('')}</div>
                    </div>
                </div>

                ${topScores.length > 0 ? `
                    <div class="original-card-scores candy-scores">
                        <div class="original-scores-label">${scoreIcon} ${H.escHtml(displayName)} High Scores</div>
                        ${topScores.map((s, i) => {
                            const pops = Math.max(1, Math.floor(s.score / 100));
                            return `
                            <div class="original-score-row">
                                <span class="original-score-rank">${['🥇','🥈','🥉'][i]}</span>
                                <span class="original-score-player">${s.emoji || '🎮'} ${H.escHtml(s.player_name)}</span>
                                <span class="original-score-value mp-score-inline">
                                    ${pops.toLocaleString()} ${scoreIcon}
                                </span>
                            </div>`;
                        }).join('')}
                    </div>
                ` : `
                    <div class="original-card-scores candy-scores">
                        <div class="original-scores-label" style="text-align:center;color:var(--text-muted)">
                            ${scoreIcon} No ${scoreName} earned yet — be the first!
                        </div>
                    </div>
                `}

                <div class="original-card-actions">
                    <button class="btn btn-lg original-play-btn candy-play-btn" style="background:linear-gradient(135deg, ${color}, #A855F7)" onclick="arcade.playOriginal('${game.id}')">
                        ${cardIcon} Play ${H.escHtml(displayName)}
                    </button>
                    <button class="btn btn-sm btn-ghost" onclick="OriginalsView.showLeaderboard('${game.id}', '${H.escHtml(displayName)}')">
                        📊 Leaderboard
                    </button>
                </div>
            </div>
        `;
    },

    async showLeaderboard(gameId, gameName) {
        try {
            const scores = await API.originalScores(gameId);
            const modal = document.createElement('div');
            modal.className = 'original-leaderboard-modal';
            modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

            const scoreName = this._scoreName();
            const scoreIcon = this._scoreIcon();
            modal.innerHTML = `
                <div class="original-leaderboard-content">
                    <div class="original-leaderboard-header">
                        <h2>${scoreIcon} ${gameName} ${scoreName}</h2>
                        <button class="btn btn-sm btn-ghost" onclick="this.closest('.original-leaderboard-modal').remove()">✕</button>
                    </div>
                    ${scores.length > 0 ? `
                        <table class="original-leaderboard-table">
                            <thead><tr><th>#</th><th>Player</th><th>${scoreName}</th><th>Score</th><th>Level</th><th>Date</th></tr></thead>
                            <tbody>
                                ${scores.map((s, i) => {
                                    const pops = Math.max(1, Math.floor(s.score / 100));
                                    return `
                                    <tr>
                                        <td>${i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}</td>
                                        <td><span style="color:${s.color || '#fff'}">${s.emoji || '🎮'} ${H.escHtml(s.player_name)}</span></td>
                                        <td class="score-val mp-score-inline">
                                            ${pops.toLocaleString()} ${scoreIcon}
                                        </td>
                                        <td style="color:#94A3B8;font-size:12px">${s.score.toLocaleString()}</td>
                                        <td>${s.level || 1}</td>
                                        <td>${H.timeAgo(s.created_at)}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    ` : `<p style="text-align:center;color:var(--text-muted);padding:24px">${scoreIcon} No ${scoreName} earned yet!</p>`}
                </div>
            `;
            document.body.appendChild(modal);
        } catch (err) {
            H.toast('Failed to load leaderboard: ' + err.message, 'error');
        }
    },
};
