/* Collections View — Game Collections / Playlists */
window.CollectionsView = {
    currentCollection: null,

    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading collections...</div>';

        try {
            const data = await API.get('/api/collections');
            const collections = data.collections || data || [];
            const systemCollections = collections.filter(c => c.is_system);
            const userCollections = collections.filter(c => !c.is_system);

            let html = `
                <div class="section-header" style="margin-bottom:24px;">
                    <span class="section-title">\u{1F4DA} Game Collections</span>
                    <button class="btn btn-purple btn-sm" onclick="CollectionsView.toggleCreate()">+ New Collection</button>
                </div>

                <div class="coll-create-form" id="collCreateForm" style="display:none;">
                    <h3>Create Collection</h3>
                    <div class="coll-form-row">
                        <input type="text" id="collName" class="form-input" placeholder="Collection name">
                        <input type="text" id="collIcon" class="form-input" placeholder="Icon emoji" style="width:80px;" value="\u{1F3AE}">
                        <input type="color" id="collColor" class="form-input" value="#A855F7" style="width:60px;padding:4px;">
                        <button class="btn btn-yellow" onclick="CollectionsView.createCollection()">Create</button>
                    </div>
                </div>
            `;

            // System collections
            if (systemCollections.length > 0) {
                html += `<div class="section-header"><span class="section-title">\u{1F3AE} System Collections</span></div>`;
                html += '<div class="coll-grid">';
                for (const c of systemCollections) {
                    html += this.renderCollectionCard(c);
                }
                html += '</div>';
            }

            // User collections
            if (userCollections.length > 0) {
                html += `<div class="section-header" style="margin-top:24px;"><span class="section-title">\u{1F4C1} My Collections</span></div>`;
                html += '<div class="coll-grid">';
                for (const c of userCollections) {
                    html += this.renderCollectionCard(c);
                }
                html += '</div>';
            }

            if (collections.length === 0) {
                html += `
                    <div class="empty-state">
                        <div class="empty-state-icon">\u{1F4DA}</div>
                        <h3>No Collections Yet</h3>
                        <p>Create a collection to organize your favorite games!</p>
                    </div>
                `;
            }

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F4A5}</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    renderCollectionCard(c) {
        const color = c.color || '#A855F7';
        return `
            <div class="coll-card" onclick="CollectionsView.renderDetail(${c.id})" style="--coll-color:${color}">
                <div class="coll-card-icon">${c.icon || '\u{1F3AE}'}</div>
                <div class="coll-card-info">
                    <div class="coll-card-name">${H.escHtml(c.name)}</div>
                    <div class="coll-card-count">${(c.game_count || 0)} games</div>
                </div>
            </div>
        `;
    },

    async renderDetail(id) {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading collection...</div>';
        this.currentCollection = id;

        try {
            const [detail, gamesData] = await Promise.all([
                API.get(`/api/collections/${id}`),
                API.library({ limit: 300, sort: 'name' }).catch(() => ({ games: [] })),
            ]);

            const collection = detail.collection || detail;
            const games = detail.games || [];
            const allGames = gamesData.games || [];

            let html = `
                <div class="section-header" style="margin-bottom:24px;">
                    <button class="btn btn-ghost btn-sm" onclick="CollectionsView.render()" style="margin-right:12px;">\u2190 Back</button>
                    <span class="section-title">${collection.icon || '\u{1F3AE}'} ${H.escHtml(collection.name)}</span>
                    <span class="coll-detail-count">${games.length} games</span>
                </div>
            `;

            // Add game form
            if (!collection.is_system) {
                html += `
                    <div class="coll-add-game-row">
                        <select id="collAddGame" class="form-select" style="max-width:300px;">
                            <option value="">-- Add a Game --</option>
                            ${allGames.filter(g => !games.find(gg => gg.id === g.id)).map(g =>
                                `<option value="${g.id}">${H.escHtml(g.title || g.clean_name)}</option>`
                            ).join('')}
                        </select>
                        <button class="btn btn-purple btn-sm" onclick="CollectionsView.addGame(${id})">Add</button>
                    </div>
                `;
            }

            // Game grid
            if (games.length > 0) {
                html += '<div class="game-grid">';
                for (const g of games) {
                    html += GameCard.render(g);
                    if (!collection.is_system) {
                        // Inject a small remove button that overlays the card
                        html += `<button class="coll-remove-btn" onclick="event.stopPropagation(); CollectionsView.removeGame(${id}, ${g.id})" title="Remove">\u2716</button>`;
                    }
                }
                html += '</div>';
            } else {
                html += `
                    <div class="empty-state">
                        <div class="empty-state-icon">\u{1F4ED}</div>
                        <h3>Empty Collection</h3>
                        <p>Add some games to this collection!</p>
                    </div>
                `;
            }

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F4A5}</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    toggleCreate() {
        const form = document.getElementById('collCreateForm');
        if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
    },

    async createCollection() {
        const name = document.getElementById('collName')?.value;
        const icon = document.getElementById('collIcon')?.value || '\u{1F3AE}';
        const color = document.getElementById('collColor')?.value || '#A855F7';
        if (!name) { H.toast('Enter a collection name', 'error'); return; }

        try {
            await API.post('/api/collections', { name, icon, color });
            H.toast('Collection created!', 'success');
            SFX?.click?.();
            this.render();
        } catch (err) { H.toast(err.message, 'error'); }
    },

    async addGame(collectionId) {
        const gameId = document.getElementById('collAddGame')?.value;
        if (!gameId) { H.toast('Select a game', 'error'); return; }
        try {
            await API.post(`/api/collections/${collectionId}/games`, { game_id: parseInt(gameId) });
            H.toast('Game added!', 'success');
            this.renderDetail(collectionId);
        } catch (err) { H.toast(err.message, 'error'); }
    },

    async removeGame(collectionId, gameId) {
        try {
            await API.del(`/api/collections/${collectionId}/games/${gameId}`);
            H.toast('Game removed', 'info');
            this.renderDetail(collectionId);
        } catch (err) { H.toast(err.message, 'error'); }
    },
};
