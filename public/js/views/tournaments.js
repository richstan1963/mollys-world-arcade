/* Tournaments View — Tournament Brackets */
window.TournamentsView = {
    currentView: 'list',
    tournamentId: null,

    async render(params) {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading tournaments...</div>';

        if (params?.id) {
            return this.renderDetail(params.id);
        }

        try {
            const [tournamentsData, playersData, gamesData] = await Promise.all([
                API.get('/api/tournaments'),
                API.players().catch(() => []),
                API.library({ limit: 200, sort: 'name' }).catch(() => ({ games: [] })),
            ]);

            const tournaments = tournamentsData.tournaments || tournamentsData || [];
            const allPlayers = Array.isArray(playersData) ? playersData : (playersData.players || arcade.players || []);
            const games = gamesData.games || [];
            const active = tournaments.filter(t => t.status === 'active' || t.status === 'registration');
            const past = tournaments.filter(t => t.status === 'completed');

            let html = `
                <div class="section-header" style="margin-bottom:24px;">
                    <span class="section-title">\u{1F3C6} Tournaments</span>
                    <button class="btn btn-purple btn-sm" onclick="TournamentsView.toggleCreate()">+ New Tournament</button>
                </div>

                <div class="tourney-create-form" id="tourneyCreateForm" style="display:none;">
                    <h3>Create Tournament</h3>
                    <div class="tourney-form-grid">
                        <input type="text" id="tourneyName" class="form-input" placeholder="Tournament name">
                        <select id="tourneyGame" class="form-select">
                            <option value="">-- Pick a Game --</option>
                            ${games.map(g => `<option value="${g.id}">${H.escHtml(g.title || g.clean_name)}</option>`).join('')}
                        </select>
                        <input type="number" id="tourneyMaxPlayers" class="form-input" placeholder="Max players (4/8/16)" value="8">
                        <button class="btn btn-yellow" onclick="TournamentsView.createTournament()">Create</button>
                    </div>
                </div>
            `;

            // Active tournaments
            if (active.length > 0) {
                html += `<div class="section-header"><span class="section-title">\u26A1 Active</span></div>`;
                html += '<div class="tourney-grid">';
                for (const t of active) {
                    html += this.renderTournamentCard(t);
                }
                html += '</div>';
            }

            // Past tournaments
            if (past.length > 0) {
                html += `<div class="section-header" style="margin-top:28px;"><span class="section-title">\u{1F4DC} Completed</span></div>`;
                html += '<div class="tourney-grid">';
                for (const t of past) {
                    html += this.renderTournamentCard(t);
                }
                html += '</div>';
            }

            if (tournaments.length === 0) {
                html += `
                    <div class="empty-state">
                        <div class="empty-state-icon">\u{1F3C6}</div>
                        <h3>No Tournaments Yet</h3>
                        <p>Create the first tournament and challenge your family!</p>
                    </div>
                `;
            }

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F4A5}</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    renderTournamentCard(t) {
        const statusColors = { registration: '#22C55E', active: '#F59E0B', completed: '#6B7280' };
        const statusLabel = { registration: 'Open', active: 'In Progress', completed: 'Finished' };
        return `
            <div class="tourney-card" onclick="TournamentsView.renderDetail(${t.id})">
                <div class="tourney-card-status" style="background:${statusColors[t.status] || '#6B7280'}">${statusLabel[t.status] || t.status}</div>
                <h3 class="tourney-card-title">${H.escHtml(t.name)}</h3>
                <div class="tourney-card-game">\u{1F3AE} ${H.escHtml(t.game_name || 'TBD')}</div>
                <div class="tourney-card-meta">
                    <span>${t.player_count || 0}/${t.max_players || 8} players</span>
                    <span>${H.timeAgo(t.created_at)}</span>
                </div>
                ${t.winner_name ? `<div class="tourney-card-winner">\u{1F947} ${H.escHtml(t.winner_name)}</div>` : ''}
            </div>
        `;
    },

    async renderDetail(id) {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading tournament...</div>';

        try {
            const [detail, playersData] = await Promise.all([
                API.get(`/api/tournaments/${id}`),
                API.players().catch(() => []),
            ]);

            const t = detail.tournament || detail;
            const matches = detail.matches || [];
            const participants = detail.participants || [];
            const allPlayers = Array.isArray(playersData) ? playersData : (playersData.players || arcade.players || []);
            const isRegistration = t.status === 'registration';
            const isActive = t.status === 'active';

            let html = `
                <div class="section-header" style="margin-bottom:24px;">
                    <button class="btn btn-ghost btn-sm" onclick="TournamentsView.render()" style="margin-right:12px;">\u2190 Back</button>
                    <span class="section-title">\u{1F3C6} ${H.escHtml(t.name)}</span>
                </div>

                <div class="tourney-detail-header">
                    <div class="tourney-detail-game">\u{1F3AE} ${H.escHtml(t.game_name || 'TBD')}</div>
                    <div class="tourney-detail-status" style="color:${isActive ? '#F59E0B' : isRegistration ? '#22C55E' : '#6B7280'}">
                        ${isRegistration ? 'Registration Open' : isActive ? 'In Progress' : 'Completed'}
                    </div>
                    <div class="tourney-detail-players">${participants.length}/${t.max_players || 8} players</div>
                </div>
            `;

            // Registration: Join button
            if (isRegistration) {
                html += `
                    <div class="tourney-join-section">
                        <select id="tourneyJoinPlayer" class="form-select">
                            <option value="">-- Select Player --</option>
                            ${allPlayers.filter(p => !participants.find(pp => pp.player_id === p.id)).map(p =>
                                `<option value="${p.id}">${p.emoji} ${H.escHtml(p.name)}</option>`
                            ).join('')}
                        </select>
                        <button class="btn btn-yellow" onclick="TournamentsView.joinTournament(${t.id})">Join Tournament</button>
                    </div>
                `;
            }

            // Bracket visualization
            if (matches.length > 0) {
                const rounds = {};
                for (const m of matches) {
                    const r = m.round || 1;
                    if (!rounds[r]) rounds[r] = [];
                    rounds[r].push(m);
                }
                const roundNums = Object.keys(rounds).map(Number).sort((a, b) => a - b);

                html += `
                    <div class="section-header" style="margin-top:28px;"><span class="section-title">\u{1F3AF} Bracket</span></div>
                    <div class="tourney-bracket">
                `;
                for (const rn of roundNums) {
                    const roundLabel = rn === roundNums[roundNums.length - 1] ? 'Final' : `Round ${rn}`;
                    html += `<div class="tourney-round">`;
                    html += `<div class="tourney-round-label">${roundLabel}</div>`;
                    for (const m of rounds[rn]) {
                        const p1Name = m.player1_name ? H.escHtml(m.player1_name) : 'TBD';
                        const p2Name = m.player2_name ? H.escHtml(m.player2_name) : 'TBD';
                        const p1Win = m.winner_id === m.player1_id;
                        const p2Win = m.winner_id === m.player2_id;
                        html += `
                            <div class="tourney-match-card">
                                <div class="tourney-match-player ${p1Win ? 'tourney-match-winner' : ''}">
                                    <span>${m.player1_emoji || ''} ${p1Name}</span>
                                    <span class="tourney-match-score">${m.player1_score != null ? m.player1_score.toLocaleString() : '-'}</span>
                                </div>
                                <div class="tourney-match-vs">VS</div>
                                <div class="tourney-match-player ${p2Win ? 'tourney-match-winner' : ''}">
                                    <span>${m.player2_emoji || ''} ${p2Name}</span>
                                    <span class="tourney-match-score">${m.player2_score != null ? m.player2_score.toLocaleString() : '-'}</span>
                                </div>
                                ${isActive && !m.winner_id && m.player1_id && m.player2_id ? `
                                    <button class="btn btn-sm btn-purple" onclick="TournamentsView.showScoreForm(${m.id}, ${t.id})">Submit Scores</button>
                                ` : ''}
                            </div>
                        `;
                    }
                    html += `</div>`;
                }
                html += '</div>';
            }

            // Participants list
            if (participants.length > 0) {
                html += `
                    <div class="section-header" style="margin-top:28px;"><span class="section-title">\u{1F465} Participants</span></div>
                    <div class="tourney-participants">
                `;
                for (const pp of participants) {
                    html += `
                        <div class="tourney-participant">
                            <span class="tourney-p-avatar" style="border-color:${pp.color || '#666'}">${pp.emoji || '\u{1F3AE}'}</span>
                            <span style="color:${pp.color || '#E2E8F0'}">${H.escHtml(pp.player_name || pp.name)}</span>
                        </div>
                    `;
                }
                html += '</div>';
            }

            // Score submission modal container
            html += '<div id="tourneyScoreModal"></div>';

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F4A5}</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    toggleCreate() {
        const form = document.getElementById('tourneyCreateForm');
        if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
    },

    async createTournament() {
        const name = document.getElementById('tourneyName')?.value;
        const gameId = document.getElementById('tourneyGame')?.value;
        const maxPlayers = parseInt(document.getElementById('tourneyMaxPlayers')?.value) || 8;
        if (!name) { H.toast('Enter a tournament name', 'error'); return; }

        try {
            await API.post('/api/tournaments', { name, game_id: gameId ? parseInt(gameId) : null, max_players: maxPlayers });
            H.toast('Tournament created!', 'success');
            SFX?.click?.();
            this.render();
        } catch (err) { H.toast(err.message, 'error'); }
    },

    async joinTournament(tournamentId) {
        const playerId = document.getElementById('tourneyJoinPlayer')?.value;
        if (!playerId) { H.toast('Select a player', 'error'); return; }
        try {
            await API.post(`/api/tournaments/${tournamentId}/join`, { player_id: parseInt(playerId) });
            H.toast('Joined tournament!', 'success');
            this.renderDetail(tournamentId);
        } catch (err) { H.toast(err.message, 'error'); }
    },

    showScoreForm(matchId, tournamentId) {
        const modal = document.getElementById('tourneyScoreModal');
        if (!modal) return;
        modal.innerHTML = `
            <div class="tourney-score-overlay">
                <div class="tourney-score-box">
                    <h3>Submit Match Scores</h3>
                    <div class="tourney-score-inputs">
                        <input type="number" id="tourneyP1Score" class="form-input" placeholder="Player 1 score">
                        <input type="number" id="tourneyP2Score" class="form-input" placeholder="Player 2 score">
                    </div>
                    <div class="tourney-score-actions">
                        <button class="btn btn-yellow" onclick="TournamentsView.submitMatchScore(${matchId}, ${tournamentId})">Submit</button>
                        <button class="btn btn-ghost" onclick="document.getElementById('tourneyScoreModal').innerHTML=''">Cancel</button>
                    </div>
                </div>
            </div>
        `;
    },

    async submitMatchScore(matchId, tournamentId) {
        const p1Score = parseInt(document.getElementById('tourneyP1Score')?.value);
        const p2Score = parseInt(document.getElementById('tourneyP2Score')?.value);
        if (isNaN(p1Score) || isNaN(p2Score)) { H.toast('Enter both scores', 'error'); return; }
        try {
            await API.post(`/api/tournaments/matches/${matchId}/score`, { player1_score: p1Score, player2_score: p2Score });
            H.toast('Scores submitted!', 'success');
            document.getElementById('tourneyScoreModal').innerHTML = '';
            this.renderDetail(tournamentId);
        } catch (err) { H.toast(err.message, 'error'); }
    },
};
