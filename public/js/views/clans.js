/* Clans View — Manage Clan Battles, players, and rosters (multi-clan) */
window.ClansView = {
    data: null,

    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading clans...</div>';

        try {
            this.data = await API.clans();
            this.paint();
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    paint() {
        const app = document.getElementById('app');
        const { clans } = this.data;

        let html = `
            <div class="page-header">
                <h1 class="page-title">⚔️ Clan Battles</h1>
                <p class="page-subtitle">Organize your squads and prepare for war — players can join multiple clans</p>
            </div>

            <div class="clans-actions">
                <button class="btn btn-sm btn-teal" onclick="ClansView.showAddClan()">+ New Clan</button>
                <button class="btn btn-sm btn-purple" onclick="ClansView.showAddPlayer()">+ New Player</button>
            </div>

            <div id="clansAddForm"></div>

            <div class="clans-grid">
                ${clans.map(clan => this.renderClan(clan)).join('')}
            </div>
        `;

        app.innerHTML = html;
    },

    renderClan(clan) {
        const isUnassigned = clan.id === 0;
        const playerCount = clan.players.length;
        const totalFavs = clan.players.reduce((s, p) => s + (p.fav_count || 0), 0);

        return `
            <div class="clan-card" data-clan-id="${clan.id}" style="--clan-color:${clan.color}">
                <div class="clan-header">
                    <div class="clan-identity">
                        <span class="clan-emoji">${clan.emoji}</span>
                        <div>
                            <h3 class="clan-name" style="color:${clan.color}">${H.escHtml(clan.name)}</h3>
                            <span class="clan-stats">${playerCount} player${playerCount !== 1 ? 's' : ''} · ${totalFavs} favorites</span>
                        </div>
                    </div>
                    ${!isUnassigned ? `
                        <div class="clan-actions">
                            <button class="btn btn-xs" onclick="ClansView.editClan(${clan.id})" title="Edit">✏️</button>
                            <button class="btn btn-xs btn-danger" onclick="ClansView.deleteClan(${clan.id}, '${H.escHtml(clan.name)}')" title="Delete">🗑️</button>
                        </div>
                    ` : ''}
                </div>
                <div class="clan-roster">
                    ${clan.players.map(p => this.renderPlayerCard(p, clan, isUnassigned)).join('')}
                    ${playerCount === 0 ? '<div class="clan-empty">No players yet</div>' : ''}
                </div>
            </div>
        `;
    },

    renderPlayerCard(player, clan, isUnassigned) {
        // Show which other clans this player is in
        const otherClanIds = (player.clan_ids || []).filter(id => id !== clan.id);
        const otherClanNames = otherClanIds.map(id => {
            const c = this.data.clans.find(cl => cl.id === id);
            return c ? `${c.emoji} ${c.name}` : '';
        }).filter(Boolean);

        // Build "Join clan" options (clans they're NOT in)
        const joinableClans = this.data.clans.filter(c => c.id !== 0 && !(player.clan_ids || []).includes(c.id));
        const joinOpts = joinableClans.map(c =>
            `<option value="${c.id}">${c.emoji} ${H.escHtml(c.name)}</option>`
        ).join('');

        return `
            <div class="clan-player" data-player-id="${player.id}">
                <div class="clan-player-avatar" style="border-color:${player.color}">${player.emoji}</div>
                <div class="clan-player-info">
                    <a href="#/player/${player.id}" class="clan-player-name" style="color:${player.color}">${H.escHtml(player.name)}</a>
                    <span class="clan-player-favs">${player.fav_count || 0} favs${otherClanNames.length ? ' · also in ' + otherClanNames.join(', ') : ''}</span>
                </div>
                <div class="clan-player-actions">
                    ${joinableClans.length ? `
                        <select class="clan-move-select" onchange="ClansView.joinClan(${player.id}, this.value); this.value=''">
                            <option value="">+ Join...</option>
                            ${joinOpts}
                        </select>
                    ` : ''}
                    ${!isUnassigned ? `
                        <button class="btn btn-xs" onclick="ClansView.leaveClan(${player.id}, ${clan.id})" title="Leave clan">❌</button>
                    ` : ''}
                    <button class="btn btn-xs" onclick="ClansView.editPlayer(${player.id})" title="Edit">✏️</button>
                </div>
            </div>
        `;
    },

    // ── Join / Leave Clan ──
    async joinClan(playerId, clanId) {
        if (!clanId) return;
        try {
            await API.addClanMember(playerId, parseInt(clanId));
            H.toast('Joined clan!', 'success');
            this.render();
            if (window.arcade) arcade.loadPlayers();
        } catch (err) { H.toast(err.message, 'error'); }
    },

    async leaveClan(playerId, clanId) {
        try {
            await API.removeClanMember(playerId, clanId);
            H.toast('Left clan', 'success');
            this.render();
            if (window.arcade) arcade.loadPlayers();
        } catch (err) { H.toast(err.message, 'error'); }
    },

    // ── Add Clan ──
    showAddClan() {
        const form = document.getElementById('clansAddForm');
        form.innerHTML = `
            <div class="clans-form-card">
                <h4>New Clan</h4>
                <div class="clans-form-row">
                    <input type="text" id="newClanName" placeholder="Clan name" class="clans-input">
                    <input type="text" id="newClanEmoji" placeholder="Emoji" value="⚔️" class="clans-input clans-input-sm">
                    <input type="color" id="newClanColor" value="#A855F7" class="clans-color-input">
                    <button class="btn btn-sm btn-teal" onclick="ClansView.createClan()">Create</button>
                    <button class="btn btn-sm" onclick="document.getElementById('clansAddForm').innerHTML=''">Cancel</button>
                </div>
            </div>
        `;
        document.getElementById('newClanName').focus();
    },

    async createClan() {
        const name = document.getElementById('newClanName').value.trim();
        const emoji = document.getElementById('newClanEmoji').value.trim() || '⚔️';
        const color = document.getElementById('newClanColor').value;
        if (!name) { H.toast('Enter a clan name', 'error'); return; }
        try {
            await API.createClan({ name, emoji, color });
            H.toast(`${emoji} ${name} created!`, 'success');
            this.render();
        } catch (err) { H.toast(err.message, 'error'); }
    },

    // ── Add Player ──
    showAddPlayer() {
        const form = document.getElementById('clansAddForm');
        const clanOpts = this.data.clans
            .filter(c => c.id !== 0)
            .map(c => `<option value="${c.id}">${c.emoji} ${H.escHtml(c.name)}</option>`)
            .join('');

        form.innerHTML = `
            <div class="clans-form-card">
                <h4>New Player</h4>
                <div class="clans-form-row">
                    <input type="text" id="newPlayerName" placeholder="Player name" class="clans-input">
                    <input type="text" id="newPlayerEmoji" placeholder="Emoji" value="🎮" class="clans-input clans-input-sm">
                    <input type="color" id="newPlayerColor" value="#A855F7" class="clans-color-input">
                    <select id="newPlayerClan" class="clans-input">
                        <option value="">No clan</option>
                        ${clanOpts}
                    </select>
                    <button class="btn btn-sm btn-purple" onclick="ClansView.createPlayer()">Add</button>
                    <button class="btn btn-sm" onclick="document.getElementById('clansAddForm').innerHTML=''">Cancel</button>
                </div>
            </div>
        `;
        document.getElementById('newPlayerName').focus();
    },

    async createPlayer() {
        const name = document.getElementById('newPlayerName').value.trim();
        const emoji = document.getElementById('newPlayerEmoji').value.trim() || '🎮';
        const color = document.getElementById('newPlayerColor').value;
        const clanId = document.getElementById('newPlayerClan').value;
        if (!name) { H.toast('Enter a player name', 'error'); return; }
        try {
            const player = await API.createPlayer({ name, emoji, color });
            if (clanId) await API.addClanMember(player.id, parseInt(clanId));
            H.toast(`${emoji} ${name} added!`, 'success');
            this.render();
            if (window.arcade) arcade.loadPlayers();
        } catch (err) { H.toast(err.message, 'error'); }
    },

    // ── Edit Clan ──
    async editClan(clanId) {
        const clan = this.data.clans.find(c => c.id === clanId);
        if (!clan) return;

        const form = document.getElementById('clansAddForm');
        form.innerHTML = `
            <div class="clans-form-card">
                <h4>Edit Clan: ${H.escHtml(clan.name)}</h4>
                <div class="clans-form-row">
                    <input type="text" id="editClanName" value="${H.escHtml(clan.name)}" class="clans-input">
                    <input type="text" id="editClanEmoji" value="${clan.emoji}" class="clans-input clans-input-sm">
                    <input type="color" id="editClanColor" value="${clan.color}" class="clans-color-input">
                    <button class="btn btn-sm btn-teal" onclick="ClansView.saveClan(${clanId})">Save</button>
                    <button class="btn btn-sm" onclick="document.getElementById('clansAddForm').innerHTML=''">Cancel</button>
                </div>
            </div>
        `;
    },

    async saveClan(clanId) {
        const name = document.getElementById('editClanName').value.trim();
        const emoji = document.getElementById('editClanEmoji').value.trim();
        const color = document.getElementById('editClanColor').value;
        if (!name) { H.toast('Clan name required', 'error'); return; }
        try {
            await API.updateClan(clanId, { name, emoji, color });
            H.toast('Clan updated!', 'success');
            this.render();
            if (window.arcade) arcade.loadPlayers();
        } catch (err) { H.toast(err.message, 'error'); }
    },

    // ── Edit Player ──
    async editPlayer(playerId) {
        const player = this.data.players.find(p => p.id === playerId);
        if (!player) return;

        const form = document.getElementById('clansAddForm');
        form.innerHTML = `
            <div class="clans-form-card">
                <h4>Edit Player: ${H.escHtml(player.name)}</h4>
                <div class="clans-form-row">
                    <input type="text" id="editPlayerName" value="${H.escHtml(player.name)}" class="clans-input">
                    <input type="text" id="editPlayerEmoji" value="${player.emoji}" class="clans-input clans-input-sm">
                    <input type="color" id="editPlayerColor" value="${player.color}" class="clans-color-input">
                    <button class="btn btn-sm btn-teal" onclick="ClansView.savePlayer(${playerId})">Save</button>
                    <button class="btn btn-sm" onclick="document.getElementById('clansAddForm').innerHTML=''">Cancel</button>
                    <button class="btn btn-sm btn-danger" onclick="ClansView.deletePlayer(${playerId}, '${H.escHtml(player.name)}')">Delete</button>
                </div>
            </div>
        `;
    },

    async savePlayer(playerId) {
        const name = document.getElementById('editPlayerName').value.trim();
        const emoji = document.getElementById('editPlayerEmoji').value.trim();
        const color = document.getElementById('editPlayerColor').value;
        if (!name) { H.toast('Name required', 'error'); return; }
        try {
            await API.updatePlayer(playerId, { name, emoji, color });
            H.toast('Player updated!', 'success');
            this.render();
            if (window.arcade) arcade.loadPlayers();
        } catch (err) { H.toast(err.message, 'error'); }
    },

    // ── Delete ──
    async deleteClan(clanId, clanName) {
        if (!confirm(`Delete "${clanName}"? Players will be removed from this clan.`)) return;
        try {
            await API.deleteClan(clanId);
            H.toast(`${clanName} deleted`, 'success');
            this.render();
            if (window.arcade) arcade.loadPlayers();
        } catch (err) { H.toast(err.message, 'error'); }
    },

    async deletePlayer(playerId, playerName) {
        if (!confirm(`Delete "${playerName}"? All their favorites, scores, and achievements will be lost.`)) return;
        try {
            await API.deletePlayer(playerId);
            H.toast(`${playerName} deleted`, 'success');
            this.render();
            if (window.arcade) arcade.loadPlayers();
        } catch (err) { H.toast(err.message, 'error'); }
    },
};
