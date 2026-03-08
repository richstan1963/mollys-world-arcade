/* Game Requests View — V6 Social Arcade Community Requests & Reports */
window.GameRequestsView = {
    currentTab: 'requests',

    reportTypes: [
        { value: 'broken_rom',    icon: '\u{1F534}', label: 'Broken ROM' },
        { value: 'wrong_artwork', icon: '\u{1F5BC}\uFE0F', label: 'Wrong Artwork' },
        { value: 'wrong_info',    icon: '\u2139\uFE0F', label: 'Wrong Info' },
        { value: 'crashes',       icon: '\u{1F4A5}', label: 'Crashes' },
        { value: 'other',         icon: '\u2753', label: 'Other' },
    ],

    statusColors: {
        open: '#3B82F6',
        approved: '#10B981',
        fulfilled: '#FFD700',
        declined: '#EF4444',
        investigating: '#F59E0B',
        resolved: '#10B981',
    },

    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading game requests...</div>';

        try {
            const [requestsData, reportsData, systemsData] = await Promise.all([
                API.gameRequests('open').catch(() => []),
                API.gameReports('open').catch(() => []),
                API.systems().catch(() => []),
            ]);

            const requests = Array.isArray(requestsData) ? requestsData : (requestsData.requests || []);
            const reports = Array.isArray(reportsData) ? reportsData : (reportsData.reports || []);
            const systems = Array.isArray(systemsData) ? systemsData : (systemsData.systems || []);

            app.innerHTML = `
                <div class="pro-view game-requests-view">
                    <div class="pro-view-header">
                        <h1>\u{1F4E3} Community Board</h1>
                        <p class="pro-view-sub">Request games & report problems</p>
                    </div>

                    <div class="messages-tabs">
                        <button class="msg-tab ${this.currentTab === 'requests' ? 'active' : ''}" onclick="GameRequestsView.switchTab('requests')">
                            \u{1F3AE} Game Requests (${requests.length})
                        </button>
                        <button class="msg-tab ${this.currentTab === 'reports' ? 'active' : ''}" onclick="GameRequestsView.switchTab('reports')">
                            \u{1F6A9} Reports (${reports.length})
                        </button>
                    </div>

                    <div id="grTabContent">
                        ${this.currentTab === 'requests' ? this.renderRequests(requests, systems) : this.renderReports(reports)}
                    </div>
                </div>
            `;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F4A5}</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    renderRequests(requests, systems) {
        // Sort by votes descending
        const sorted = [...requests].sort((a, b) => (b.votes || 0) - (a.votes || 0));

        return `
            <div class="gr-form-section">
                <div class="gr-form-title">\u2795 Request a Game</div>
                <div class="gr-form-row">
                    <input type="text" id="grName" class="form-input" placeholder="Game name...">
                    <select id="grSystem" class="form-select">
                        <option value="">System...</option>
                        ${systems.map(s => `<option value="${H.escHtml(s.id || s.system_id)}">${H.escHtml(s.name || s.id)}</option>`).join('')}
                    </select>
                </div>
                <textarea id="grDesc" class="form-textarea" placeholder="Why do you want this game? (optional)" rows="2" maxlength="500"></textarea>
                <button class="btn btn-purple btn-sm" onclick="GameRequestsView.submitRequest()">Submit Request</button>
            </div>

            ${sorted.length === 0 ? `
                <div class="empty-state" style="margin-top:24px">
                    <div class="empty-state-icon">\u{1F3AE}</div>
                    <h3>No Requests Yet</h3>
                    <p>Be the first to request a game!</p>
                </div>
            ` : `
                <div class="req-list">
                    ${sorted.map(r => `
                        <div class="req-card">
                            <div class="req-vote-col">
                                <button class="vote-btn vote-up" onclick="event.stopPropagation();GameRequestsView.vote(${r.id}, 1)" title="Upvote">\u25B2</button>
                                <span class="vote-count">${r.votes || 0}</span>
                                <button class="vote-btn vote-down" onclick="event.stopPropagation();GameRequestsView.vote(${r.id}, -1)" title="Downvote">\u25BC</button>
                            </div>
                            <div class="req-card-body">
                                <div class="req-card-header">
                                    <span class="req-game-name">${H.escHtml(r.game_name)}</span>
                                    ${r.system_id ? `<span class="req-system-badge">${H.escHtml(r.system_id)}</span>` : ''}
                                    <span class="status-badge" style="background:${this.statusColors[r.status] || '#3B82F6'}20;color:${this.statusColors[r.status] || '#3B82F6'};border:1px solid ${this.statusColors[r.status] || '#3B82F6'}40">${H.escHtml(r.status || 'open')}</span>
                                </div>
                                ${r.description ? `<div class="req-description">${H.escHtml(r.description)}</div>` : ''}
                                <div class="req-meta">
                                    <span>by ${H.escHtml(r.requester_name || 'Anonymous')}</span>
                                    <span>\u2022 ${H.timeAgo(r.created_at)}</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `}
        `;
    },

    renderReports(reports) {
        return `
            <div class="gr-form-section">
                <div class="gr-form-title">\u{1F6A9} Report a Problem</div>
                <div class="gr-form-row">
                    <input type="text" id="reportGameSearch" class="form-input" placeholder="Search for a game..." oninput="GameRequestsView.searchGames(this.value)">
                    <select id="reportType" class="form-select">
                        <option value="">Report type...</option>
                        ${this.reportTypes.map(t => `<option value="${t.value}">${t.icon} ${t.label}</option>`).join('')}
                    </select>
                </div>
                <div id="reportGameResults" class="gr-search-results"></div>
                <input type="hidden" id="reportRomId">
                <textarea id="reportDesc" class="form-textarea" placeholder="Describe the problem..." rows="3" maxlength="1000"></textarea>
                <button class="btn btn-purple btn-sm" onclick="GameRequestsView.submitReport()">Submit Report</button>
            </div>

            ${reports.length === 0 ? `
                <div class="empty-state" style="margin-top:24px">
                    <div class="empty-state-icon">\u2705</div>
                    <h3>No Open Reports</h3>
                    <p>Everything looks good! Report issues if you find any.</p>
                </div>
            ` : `
                <div class="report-list">
                    ${reports.map(r => {
                        const typeObj = this.reportTypes.find(t => t.value === r.type) || { icon: '\u2753', label: 'Other' };
                        return `
                            <div class="report-card">
                                ${r.artwork_path ? `<img class="report-thumb" src="/artwork/${H.escHtml(r.artwork_path)}" alt="" onerror="this.style.display='none'">` : ''}
                                <div class="report-card-body">
                                    <div class="report-card-header">
                                        <span class="report-type-badge" style="color:${this.statusColors[r.status] || '#F59E0B'}">${typeObj.icon} ${typeObj.label}</span>
                                        <span class="status-badge" style="background:${this.statusColors[r.status] || '#F59E0B'}20;color:${this.statusColors[r.status] || '#F59E0B'};border:1px solid ${this.statusColors[r.status] || '#F59E0B'}40">${H.escHtml(r.status || 'open')}</span>
                                    </div>
                                    <div class="report-game-name">${H.escHtml(r.game_name || 'Unknown Game')}</div>
                                    <div class="report-description">${H.escHtml(r.description || '')}</div>
                                    <div class="report-meta">
                                        <span>by ${H.escHtml(r.reporter_name || 'Anonymous')}</span>
                                        <span>\u2022 ${H.timeAgo(r.created_at)}</span>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `}
        `;
    },

    switchTab(tab) {
        this.currentTab = tab;
        this.render();
    },

    async vote(requestId, direction) {
        const activePlayer = ArcadeEngine?.getActivePlayer?.();
        if (!activePlayer?.id) return H.toast('Select a player first', 'warning');

        try {
            const result = await API.voteGameRequest(requestId, activePlayer.id, direction);
            // Update vote count in-place
            const card = event?.target?.closest('.req-card');
            if (card) {
                const countEl = card.querySelector('.vote-count');
                if (countEl && result.votes !== undefined) {
                    countEl.textContent = result.votes;
                }
            }
            if (typeof SFX !== 'undefined') SFX.click?.();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    async submitRequest() {
        const activePlayer = ArcadeEngine?.getActivePlayer?.();
        if (!activePlayer?.id) return H.toast('Select a player first', 'warning');

        const name = document.getElementById('grName')?.value?.trim();
        const system = document.getElementById('grSystem')?.value;
        const desc = document.getElementById('grDesc')?.value?.trim();

        if (!name) return H.toast('Enter a game name', 'warning');

        try {
            await API.submitGameRequest({
                player_id: activePlayer.id,
                game_name: name,
                system_id: system || null,
                description: desc || null,
            });
            H.toast('Game request submitted!', 'success');
            if (typeof SFX !== 'undefined') SFX.click?.();
            this.render();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    async searchGames(query) {
        const container = document.getElementById('reportGameResults');
        if (!container) return;
        if (!query || query.length < 2) { container.innerHTML = ''; return; }

        try {
            const results = await API.search(query);
            const games = Array.isArray(results) ? results : (results.results || results.games || []);
            container.innerHTML = games.slice(0, 8).map(g => `
                <button class="gr-search-item" onclick="GameRequestsView.selectReportGame(${g.id}, '${H.escHtml(g.name)}')">
                    ${H.escHtml(g.name)} <span class="gr-search-sys">${H.escHtml(g.system_id || '')}</span>
                </button>
            `).join('');
        } catch { container.innerHTML = ''; }
    },

    selectReportGame(romId, name) {
        document.getElementById('reportRomId').value = romId;
        const searchInput = document.getElementById('reportGameSearch');
        if (searchInput) searchInput.value = name;
        document.getElementById('reportGameResults').innerHTML = '';
    },

    async submitReport() {
        const activePlayer = ArcadeEngine?.getActivePlayer?.();
        if (!activePlayer?.id) return H.toast('Select a player first', 'warning');

        const romId = document.getElementById('reportRomId')?.value;
        const type = document.getElementById('reportType')?.value;
        const desc = document.getElementById('reportDesc')?.value?.trim();

        if (!romId) return H.toast('Search and select a game first', 'warning');
        if (!type) return H.toast('Select a report type', 'warning');
        if (!desc) return H.toast('Describe the problem', 'warning');

        try {
            await API.submitGameReport({
                player_id: activePlayer.id,
                rom_id: parseInt(romId),
                type: type,
                description: desc,
            });
            H.toast('Report submitted! Thanks for helping.', 'success');
            if (typeof SFX !== 'undefined') SFX.click?.();
            this.render();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },
};
