/* Family Leaderboard */
window.ScoresView = {
    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading leaderboard...</div>';

        try {
            const scores = await API.topScores(50);
            const players = arcade.players.length ? arcade.players : await API.players();

            let html = `
                <div class="section-header" style="margin-bottom:24px;">
                    <span class="section-title">🏆 Family Leaderboard</span>
                </div>
            `;

            if (scores.length === 0) {
                html += `
                    <div class="empty-state">
                        <div class="empty-state-icon">🏆</div>
                        <h3>No Scores Yet</h3>
                        <p>Play some games and submit your high scores!</p>
                    </div>
                `;
            } else {
                html += `
                    <div class="scores-table-wrap">
                        <table class="scores-table">
                            <thead>
                                <tr>
                                    <th class="rank-col">#</th>
                                    <th class="player-col">Player</th>
                                    <th class="game-col">Game</th>
                                    <th class="score-col">Score</th>
                                    <th class="date-col">When</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${scores.map((s, i) => `
                                    <tr class="${i < 3 ? 'top-three rank-' + (i + 1) : ''}">
                                        <td class="rank-col">
                                            ${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                                        </td>
                                        <td class="player-col">
                                            <span style="color:${s.color}">${s.emoji} ${H.escHtml(s.player_name)}</span>
                                        </td>
                                        <td class="game-col">
                                            <a href="#/game/${s.rom_id}" style="color:var(--text-light);text-decoration:none;">
                                                ${H.escHtml(s.game_name)}
                                            </a>
                                        </td>
                                        <td class="score-col">${s.score.toLocaleString()}</td>
                                        <td class="date-col">${H.timeAgo(s.created_at)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }

            // Quick submit form — fetch recent games for picker
            const recentGames = await API.library({ limit: 50, sort: 'recent' }).then(d => d.games || []).catch(() => []);

            html += `
                <div class="score-submit-section">
                    <h3>📝 Submit a Score</h3>
                    <div class="score-submit-form">
                        <select id="scorePlayer" class="form-select">
                            ${players.map(p => `<option value="${p.id}">${p.emoji} ${H.escHtml(p.name)}</option>`).join('')}
                        </select>
                        <select id="scoreGameId" class="form-select" style="max-width:260px;">
                            <option value="">— Pick a Game —</option>
                            ${recentGames.map(g => `<option value="${g.id}">${H.escHtml(g.title || g.clean_name || g.filename)}</option>`).join('')}
                        </select>
                        <input type="number" id="scoreValue" placeholder="Score" class="form-input" style="width:140px;">
                        <button class="btn btn-yellow" onclick="ScoresView.submitScore()">Submit</button>
                    </div>
                </div>
            `;

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    async submitScore() {
        const playerId = document.getElementById('scorePlayer').value;
        const romId = document.getElementById('scoreGameId').value;
        const score = document.getElementById('scoreValue').value;

        if (!playerId || !romId || !score) {
            H.toast('Fill in all fields', 'error');
            return;
        }

        try {
            const result = await API.submitScore(playerId, romId, parseInt(score));
            if (result.is_personal_best) {
                Confetti?.highScore();
                H.toast(`New personal best! Rank #${result.rank}`, 'success');
            } else {
                H.toast(`Score submitted! Rank #${result.rank}`, 'success');
            }
            this.render();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },
};
