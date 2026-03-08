/* Daily Challenges View */
window.DailyView = {
    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading daily challenges...</div>';

        try {
            const [todayData, players, historyData] = await Promise.all([
                API.get('/api/daily-challenges/today'),
                API.players().catch(() => []),
                API.get('/api/daily-challenges/history?days=7').catch(() => []),
            ]);

            const challenge = todayData.challenge;
            const leaderboard = todayData.leaderboard || [];
            const game = todayData.game || null;
            const art = game ? H.artworkSrc(game) : null;
            const allPlayers = Array.isArray(players) ? players : (players.players || arcade.players || []);

            const typeIcons = {
                high_score: '\u{1F3C6}', speed_run: '\u23F1\uFE0F', endurance: '\u{1F4AA}',
                no_death: '\u{1F480}', pacifist: '\u{1F54A}\uFE0F', completionist: '\u2705',
            };

            let html = `
                <div class="section-header" style="margin-bottom:24px;">
                    <span class="section-title">\u{1F4C5} Daily Challenge</span>
                </div>
            `;

            // Hero challenge card
            if (challenge) {
                const icon = typeIcons[challenge.type] || '\u{1F3AF}';
                html += `
                    <div class="daily-hero-card">
                        <div class="daily-hero-badge">${icon} Today's Challenge</div>
                        <h2 class="daily-hero-title">${H.escHtml(challenge.title)}</h2>
                        <p class="daily-hero-desc">${H.escHtml(challenge.description)}</p>
                        ${game ? `
                            <div class="daily-hero-game">
                                <div class="daily-hero-art">
                                    ${art
                                        ? `<img src="${art}" alt="${H.escHtml(game.clean_name)}" loading="lazy">`
                                        : `<span class="no-art">${H.systemEmoji(game.system_id)}</span>`
                                    }
                                </div>
                                <div class="daily-hero-game-info">
                                    <div class="daily-hero-game-name">${H.escHtml(game.clean_name || game.title)}</div>
                                    <div class="daily-hero-game-sys">${H.escHtml(game.system_name || game.system_id)}</div>
                                </div>
                                <button class="btn btn-yellow" onclick="window.arcade.playGame(${game.id})">
                                    \u25B6 Play Now
                                </button>
                            </div>
                        ` : ''}
                        ${challenge.target ? `
                            <div class="daily-hero-target">
                                <span class="daily-target-label">Target:</span>
                                <span class="daily-target-value">${H.escHtml(String(challenge.target))}</span>
                            </div>
                        ` : ''}

                        <div class="daily-submit-form">
                            <h4>Submit Your Score</h4>
                            <div class="daily-submit-row">
                                <select id="dailyPlayer" class="form-select">
                                    <option value="">-- Player --</option>
                                    ${allPlayers.map(p => `<option value="${p.id}">${p.emoji} ${H.escHtml(p.name)}</option>`).join('')}
                                </select>
                                <input type="number" id="dailyValue" class="form-input" placeholder="Your score / time">
                                <button class="btn btn-purple" onclick="DailyView.submitScore()">Submit</button>
                            </div>
                        </div>
                    </div>
                `;

                // Today's leaderboard
                if (leaderboard.length > 0) {
                    html += `
                        <div class="section-header" style="margin-top:28px;">
                            <span class="section-title">\u{1F3C5} Today's Leaderboard</span>
                        </div>
                        <div class="daily-leaderboard">
                    `;
                    leaderboard.forEach((entry, i) => {
                        html += `
                            <div class="daily-lb-row ${i === 0 ? 'daily-lb-first' : ''}">
                                <span class="daily-lb-rank">${i === 0 ? '\u{1F947}' : i === 1 ? '\u{1F948}' : i === 2 ? '\u{1F949}' : '#' + (i + 1)}</span>
                                <span class="daily-lb-avatar" style="border-color:${entry.color || '#666'}">${entry.emoji || '\u{1F3AE}'}</span>
                                <span class="daily-lb-name" style="color:${entry.color || '#E2E8F0'}">${H.escHtml(entry.player_name)}</span>
                                <span class="daily-lb-value">${(entry.value || 0).toLocaleString()}</span>
                                <span class="daily-lb-time">${H.timeAgo(entry.submitted_at)}</span>
                            </div>
                        `;
                    });
                    html += '</div>';
                }
            } else {
                html += `
                    <div class="empty-state">
                        <div class="empty-state-icon">\u{1F4C5}</div>
                        <h3>No Challenge Today</h3>
                        <p>Check back tomorrow for a new daily challenge!</p>
                    </div>
                `;
            }

            // Past challenges
            const pastChallenges = Array.isArray(historyData) ? historyData : (historyData.challenges || []);
            if (pastChallenges.length > 0) {
                html += `
                    <div class="section-header" style="margin-top:36px;">
                        <span class="section-title">\u{1F4DC} Past Challenges</span>
                    </div>
                    <div class="daily-history">
                `;
                for (const past of pastChallenges) {
                    const pastIcon = typeIcons[past.type] || '\u{1F3AF}';
                    const winner = past.winner;
                    html += `
                        <div class="daily-history-card">
                            <div class="daily-history-date">${H.escHtml(past.date || '')}</div>
                            <div class="daily-history-info">
                                <span class="daily-history-icon">${pastIcon}</span>
                                <span class="daily-history-title">${H.escHtml(past.title)}</span>
                            </div>
                            ${winner ? `
                                <div class="daily-history-winner">
                                    \u{1F947} <span style="color:${winner.color}">${winner.emoji} ${H.escHtml(winner.name)}</span>
                                    <span class="daily-history-score">${(winner.value || 0).toLocaleString()}</span>
                                </div>
                            ` : '<div class="daily-history-winner" style="opacity:0.5">No submissions</div>'}
                        </div>
                    `;
                }
                html += '</div>';
            }

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F4A5}</div><h3>Error loading challenges</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    async submitScore() {
        const playerId = document.getElementById('dailyPlayer')?.value;
        const value = document.getElementById('dailyValue')?.value;
        if (!playerId || !value) {
            H.toast('Pick a player and enter a score', 'error');
            return;
        }
        try {
            await API.post('/api/daily-challenges/submit', {
                player_id: parseInt(playerId),
                value: parseInt(value),
            });
            H.toast('Score submitted!', 'success');
            SFX?.click?.();
            this.render();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },
};
