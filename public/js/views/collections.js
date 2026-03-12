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

            let html = `
                <div class="page-header" style="text-align:center;">
                    <h1 class="page-title">🎰 The Arcade</h1>
                    <p class="page-subtitle">Step inside — every corner has its own vibe</p>
                </div>
                <div class="coll-overview-grid">`;

            for (const c of themed) {
                const theme = c.theme || 'default';
                const count = c.game_count || 0;
                html += `
                    <div class="coll-overview-card coll-theme-${theme}" onclick="Router.navigate('/collections/${c.id}')">
                        <div class="coll-overview-accent"></div>
                        <div class="coll-overview-top">
                            <span class="coll-overview-icon">${c.icon || '🎮'}</span>
                            <span class="coll-overview-count">${count}</span>
                        </div>
                        <h3 class="coll-overview-name">${H.escHtml(c.name)}</h3>
                        <p class="coll-overview-desc">${H.escHtml(c.description || '')}</p>
                    </div>`;
            }
            html += '</div>';

            if (custom.length > 0) {
                html += `<div class="section-header" style="margin-top:32px;">
                    <span class="section-title">📁 My Collections</span>
                </div><div class="coll-overview-grid coll-overview-sm">`;
                for (const c of custom) {
                    html += `
                        <div class="coll-overview-card coll-theme-default" onclick="Router.navigate('/collections/${c.id}')" style="--coll-accent:${c.color || '#A855F7'}">
                            <span class="coll-overview-icon">${c.icon || '🎮'}</span>
                            <h3 class="coll-overview-name">${H.escHtml(c.name)}</h3>
                            <span class="coll-overview-count">${c.game_count || 0} games</span>
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

        let html = `
            <div class="coll-detail-header coll-theme-${theme}">
                <button class="btn btn-ghost" onclick="Router.navigate('/collections')" style="position:absolute;left:12px;top:12px;font-size:0.85rem;">← Back</button>
                <span class="coll-detail-icon">${data.icon || '🎮'}</span>
                <h1 class="coll-detail-title">${H.escHtml(data.name)}</h1>
                <p class="coll-detail-desc">${H.escHtml(data.description || '')}</p>
                <span class="coll-detail-count">${games.length} game${games.length !== 1 ? 's' : ''}</span>
            </div>

            <div class="coll-sort-bar">
                <span class="coll-sort-label">SORT:</span>
                ${['name', 'system', 'most_played', 'favorites', 'newest'].map(s =>
                    `<button class="coll-sort-btn${sort === s ? ' active' : ''} coll-theme-${theme}" onclick="CollectionsView._changeSort(${data.id}, '${s}')">${
                        {name:'A-Z', system:'System', most_played:'Most Played', favorites:'Favorites', newest:'Newest'}[s]
                    }</button>`
                ).join('')}
            </div>`;

        if (games.length > 0) {
            html += '<div class="game-grid">';
            for (const g of games) {
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
