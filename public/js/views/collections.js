/* Collections View — Themed Genre Collections (Pinball Parlor, Pool Hall, etc.) */
window.CollectionsView = {
    currentSort: 'name',

    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading collections...</div>';

        try {
            const data = await API.get('/api/collections');
            const collections = Array.isArray(data) ? data : (data.collections || []);
            const themed = collections.filter(c => c.is_system && c.theme);
            const custom = collections.filter(c => !c.is_system);

            let html = `<div class="collections-hero">
                <div class="collections-hero-text">
                    <h1 class="collections-title">🎰 The Arcade</h1>
                    <p class="collections-subtitle">Step inside — every corner has its own vibe</p>
                </div>
            </div>
            <div class="collections-grid">`;

            for (const c of themed) {
                const theme = c.theme || 'default';
                const count = c.game_count || 0;
                html += `
                    <div class="collection-card collection-theme-${theme}" onclick="Router.navigate('/collections/${c.id}')">
                        <div class="collection-card-glow"></div>
                        <div class="collection-card-icon">${c.icon || '🎮'}</div>
                        <div class="collection-card-body">
                            <h3 class="collection-card-name">${H.escHtml(c.name)}</h3>
                            <p class="collection-card-desc">${H.escHtml(c.description || '')}</p>
                            <div class="collection-card-count">${count} game${count !== 1 ? 's' : ''}</div>
                        </div>
                    </div>`;
            }
            html += '</div>';

            // Custom user collections (if any)
            if (custom.length > 0) {
                html += `<div class="section-header" style="margin-top:32px;">
                    <span class="section-title">📁 My Collections</span>
                </div><div class="collections-grid collections-grid-sm">`;
                for (const c of custom) {
                    html += `
                        <div class="collection-card collection-theme-default" onclick="CollectionsView.renderDetail(${c.id})" style="--coll-accent:${c.color || '#A855F7'}">
                            <div class="collection-card-icon">${c.icon || '🎮'}</div>
                            <div class="collection-card-body">
                                <h3 class="collection-card-name">${H.escHtml(c.name)}</h3>
                                <div class="collection-card-count">${c.game_count || 0} games</div>
                            </div>
                        </div>`;
                }
                html += '</div>';
            }

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    async renderDetail(id) {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading collection...</div>';
        this.currentSort = 'name';

        try {
            const data = await API.get(`/api/collections/${id}?sort=name`);
            this._renderDetailHTML(app, data);
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    _renderDetailHTML(app, data) {
        const theme = data.theme || 'default';
        const games = data.games || [];
        const sort = this.currentSort;

        let html = `<div class="collection-detail collection-theme-${theme}">
            <div class="collection-detail-hero">
                <button class="btn btn-ghost collection-back" onclick="Router.navigate('/collections')">← Back</button>
                <div class="collection-detail-icon">${data.icon || '🎮'}</div>
                <h1 class="collection-detail-name">${H.escHtml(data.name)}</h1>
                <p class="collection-detail-desc">${H.escHtml(data.description || '')}</p>
                <div class="collection-detail-stats">${games.length} game${games.length !== 1 ? 's' : ''}</div>
            </div>

            <div class="collection-sort-bar">
                <span class="collection-sort-label">Sort:</span>
                ${['name', 'system', 'most_played', 'favorites', 'newest'].map(s =>
                    `<button class="collection-sort-btn ${sort === s ? 'active' : ''}" onclick="CollectionsView._changeSort(${data.id}, '${s}')">${
                        {name:'A-Z', system:'System', most_played:'Most Played', favorites:'Favorites', newest:'Newest'}[s]
                    }</button>`
                ).join('')}
            </div>`;

        if (games.length > 0) {
            html += '<div class="game-grid collection-game-grid">';
            for (const g of games) {
                // Adapt fields for GameCard
                const cardData = { ...g, id: g.id || g.rom_id };
                html += typeof GameCard !== 'undefined' ? GameCard.render(cardData) : `
                    <div class="game-card" onclick="Router.navigate('/game/${cardData.id}')">
                        <div class="game-card-art">${cardData.artwork_path
                            ? `<img src="${cardData.artwork_path}" alt="${H.escHtml(cardData.title)}" loading="lazy">`
                            : `<div class="game-card-placeholder">${(cardData.title||'?')[0]}</div>`
                        }</div>
                        <div class="game-card-info">
                            <div class="game-card-title">${H.escHtml(cardData.title || cardData.clean_name)}</div>
                            <div class="game-card-meta">${cardData.system_name || ''}</div>
                        </div>
                    </div>`;
            }
            html += '</div>';
        } else {
            html += `<div class="empty-state"><div class="empty-state-icon">📭</div>
                <h3>No Games Yet</h3><p>Games matching this collection will appear once they're in your library.</p></div>`;
        }

        html += '</div>';
        app.innerHTML = html;
    },

    async _changeSort(id, sort) {
        this.currentSort = sort;
        const app = document.getElementById('app');
        try {
            const data = await API.get(`/api/collections/${id}?sort=${sort}`);
            this._renderDetailHTML(app, data);
        } catch (err) {
            H.toast('Sort failed: ' + err.message, 'error');
        }
    },

    toggleCreate() {
        const form = document.getElementById('collCreateForm');
        if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
    },

    async createCollection() {
        const name = document.getElementById('collName')?.value;
        const icon = document.getElementById('collIcon')?.value || '🎮';
        const color = document.getElementById('collColor')?.value || '#A855F7';
        if (!name) { H.toast('Enter a collection name', 'error'); return; }
        try {
            await API.post('/api/collections', { name, icon, color });
            H.toast('Collection created!', 'success');
            this.render();
        } catch (err) { H.toast(err.message, 'error'); }
    },
};
