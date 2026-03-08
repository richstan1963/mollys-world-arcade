/* Speed Run View — Speed Run Leaderboards */
window.SpeedrunView = {
    selectedGame: null,

    formatTime(ms) {
        if (!ms && ms !== 0) return '--:--:---';
        const totalMs = Math.abs(ms);
        const minutes = Math.floor(totalMs / 60000);
        const seconds = Math.floor((totalMs % 60000) / 1000);
        const millis = totalMs % 1000;
        return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
    },

    parseTime(str) {
        // Parse mm:ss.ms or mm:ss format
        if (!str) return null;
        const parts = str.split(':');
        if (parts.length !== 2) return null;
        const minutes = parseInt(parts[0]) || 0;
        const secParts = parts[1].split('.');
        const seconds = parseInt(secParts[0]) || 0;
        const millis = secParts[1] ? parseInt(secParts[1].padEnd(3, '0').slice(0, 3)) : 0;
        return (minutes * 60000) + (seconds * 1000) + millis;
    },

    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading speed runs...</div>';

        try {
            const [runsData, gamesData, playersData] = await Promise.all([
                API.get('/api/speedruns'),
                API.library({ limit: 200, sort: 'name' }).catch(() => ({ games: [] })),
                API.players().catch(() => []),
            ]);

            const runs = runsData.runs || runsData || [];
            const games = gamesData.games || [];
            const allPlayers = Array.isArray(playersData) ? playersData : (playersData.players || arcade.players || []);
            const activePlayer = ArcadeEngine?.getActivePlayer?.();

            let html = `
                <div class="section-header" style="margin-bottom:24px;">
                    <span class="section-title">\u23F1\uFE0F Speed Run Leaderboard</span>
                </div>
            `;

            // Filter by game
            html += `
                <div class="speedrun-filter-row">
                    <select id="speedrunGameFilter" class="form-select" onchange="SpeedrunView.filterByGame(this.value)">
                        <option value="">All Games</option>
                        ${games.map(g => `<option value="${g.id}" ${this.selectedGame == g.id ? 'selected' : ''}>${H.escHtml(g.title || g.clean_name)}</option>`).join('')}
                    </select>
                </div>
            `;

            // Global leaderboard
            const filtered = this.selectedGame
                ? runs.filter(r => r.rom_id == this.selectedGame || r.game_id == this.selectedGame)
                : runs;

            if (filtered.length > 0) {
                html += `
                    <div class="speedrun-table-wrap">
                        <table class="speedrun-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Player</th>
                                    <th>Game</th>
                                    <th>Time</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                `;
                filtered.slice(0, 50).forEach((r, i) => {
                    const isTop3 = i < 3;
                    html += `
                        <tr class="${isTop3 ? 'speedrun-top-' + (i + 1) : ''}">
                            <td>${i === 0 ? '\u{1F947}' : i === 1 ? '\u{1F948}' : i === 2 ? '\u{1F949}' : i + 1}</td>
                            <td><span style="color:${r.color || '#E2E8F0'}">${r.emoji || ''} ${H.escHtml(r.player_name)}</span></td>
                            <td>${H.escHtml(r.game_name)}</td>
                            <td class="speedrun-time">${this.formatTime(r.time_ms)}</td>
                            <td>${H.timeAgo(r.created_at)}</td>
                        </tr>
                    `;
                });
                html += '</tbody></table></div>';
            } else {
                html += `
                    <div class="empty-state" style="margin:24px 0;">
                        <div class="empty-state-icon">\u23F1\uFE0F</div>
                        <h3>No Speed Runs Yet</h3>
                        <p>Be the first to submit a speed run time!</p>
                    </div>
                `;
            }

            // Submit time form
            html += `
                <div class="speedrun-submit-section">
                    <h3>\u{1F4DD} Submit a Time</h3>
                    <div class="speedrun-submit-form">
                        <select id="speedrunPlayer" class="form-select">
                            <option value="">-- Player --</option>
                            ${allPlayers.map(p => `<option value="${p.id}" ${activePlayer?.id === p.id ? 'selected' : ''}>${p.emoji} ${H.escHtml(p.name)}</option>`).join('')}
                        </select>
                        <select id="speedrunGame" class="form-select" style="max-width:260px;">
                            <option value="">-- Game --</option>
                            ${games.map(g => `<option value="${g.id}">${H.escHtml(g.title || g.clean_name)}</option>`).join('')}
                        </select>
                        <input type="text" id="speedrunTime" class="form-input" placeholder="mm:ss.ms (e.g. 1:23.456)" style="width:160px;">
                        <button class="btn btn-yellow" onclick="SpeedrunView.submitTime()">Submit</button>
                    </div>
                </div>
            `;

            // Personal records for active player
            if (activePlayer?.id) {
                const myRuns = runs.filter(r => r.player_id === activePlayer.id);
                if (myRuns.length > 0) {
                    // Group by game, show best per game
                    const bestByGame = {};
                    for (const r of myRuns) {
                        const key = r.rom_id || r.game_id;
                        if (!bestByGame[key] || r.time_ms < bestByGame[key].time_ms) {
                            bestByGame[key] = r;
                        }
                    }
                    const personalBests = Object.values(bestByGame).sort((a, b) => a.time_ms - b.time_ms);

                    html += `
                        <div class="section-header" style="margin-top:32px;">
                            <span class="section-title">\u{1F3C5} My Personal Records</span>
                        </div>
                        <div class="speedrun-personal">
                    `;
                    for (const pb of personalBests) {
                        html += `
                            <div class="speedrun-pb-card">
                                <div class="speedrun-pb-game">${H.escHtml(pb.game_name)}</div>
                                <div class="speedrun-pb-time">${this.formatTime(pb.time_ms)}</div>
                                <div class="speedrun-pb-date">${H.timeAgo(pb.created_at)}</div>
                            </div>
                        `;
                    }
                    html += '</div>';
                }
            }

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F4A5}</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    filterByGame(gameId) {
        this.selectedGame = gameId || null;
        this.render();
    },

    async submitTime() {
        const playerId = document.getElementById('speedrunPlayer')?.value;
        const gameId = document.getElementById('speedrunGame')?.value;
        const timeStr = document.getElementById('speedrunTime')?.value;
        if (!playerId || !gameId || !timeStr) {
            H.toast('Fill in all fields', 'error');
            return;
        }
        const timeMs = this.parseTime(timeStr);
        if (timeMs === null || timeMs <= 0) {
            H.toast('Invalid time format. Use mm:ss.ms (e.g. 1:23.456)', 'error');
            return;
        }

        try {
            const result = await API.post('/api/speedruns', {
                player_id: parseInt(playerId),
                rom_id: parseInt(gameId),
                time_ms: timeMs,
            });
            if (result.is_personal_best) {
                Confetti?.highScore?.();
                H.toast('New personal best!', 'success');
            } else {
                H.toast('Time submitted!', 'success');
            }
            SFX?.click?.();
            this.render();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },
};
