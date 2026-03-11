/* Retro Stars — Game Character Encyclopedia View */
window.RetroStarsView = {
    data: null,
    activeCategory: null,
    searchTerm: '',

    async render() {
        const app = document.getElementById('app');
        app.innerHTML = `<div class="rs-page">
            <div class="rs-loading">${GameCard.renderSkeleton(9)}</div>
        </div>`;

        try {
            const data = await API.get('/api/library/retro-stars');
            this.data = data;
            this.activeCategory = null;
            this.searchTerm = '';
            this._renderPage();
        } catch (e) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⭐</div>
                <h3>Could not load Retro Stars</h3><p>${e.message}</p></div>`;
        }
    },

    _renderPage() {
        const { characters, categories } = this.data;
        const filtered = this._getFiltered();
        const app = document.getElementById('app');

        // Stats
        const totalGames = characters.reduce((s, c) => s + (c.game_count || 0), 0);

        app.innerHTML = `<div class="rs-page">
            <header class="rs-header">
                <div class="rs-header-badge">⭐</div>
                <div class="rs-header-text">
                    <h1 class="rs-title">RETRO STARS</h1>
                    <p class="rs-subtitle">CLASSIC GAME ICONS · SPOTLIGHT ARCHIVE</p>
                </div>
                <nav class="rs-header-nav">
                    <span>Stars</span><span>Franchises</span><span>Legend Status</span><span>About</span>
                </nav>
            </header>

            <section class="rs-intro">
                <h2 class="rs-intro-title">Featured retro stars</h2>
                <p class="rs-intro-desc">${characters.length} iconic characters spanning ${totalGames} games in your library. The definitive entertainment-style encyclopedia for classic gaming.</p>

                <div class="rs-filters">
                    <button class="rs-filter-btn ${!this.activeCategory ? 'active' : ''}" onclick="RetroStarsView.setCategory(null)">All Stars</button>
                    ${categories.map(c => `<button class="rs-filter-btn ${this.activeCategory === c ? 'active' : ''}" onclick="RetroStarsView.setCategory('${c}')">${c}</button>`).join('')}
                </div>

                <div class="rs-search-row">
                    <input type="text" class="rs-search" placeholder="Search characters..." value="${H.escHtml(this.searchTerm)}"
                        oninput="RetroStarsView.setSearch(this.value)">
                </div>
            </section>

            <section class="rs-grid">
                ${filtered.length === 0
                    ? '<div class="rs-empty"><p>No characters match your filters.</p></div>'
                    : filtered.map((ch, i) => this._renderCard(ch, i)).join('')}
            </section>

            <div class="rs-download-row">
                <button class="rs-download-btn" onclick="RetroStarsView.downloadImages()">🖼️ Download Character Portraits</button>
            </div>
        </div>`;
    },

    _getFiltered() {
        let list = this.data.characters;
        if (this.activeCategory) list = list.filter(c => c.category === this.activeCategory);
        if (this.searchTerm) {
            const q = this.searchTerm.toLowerCase();
            list = list.filter(c =>
                c.name.toLowerCase().includes(q) ||
                c.franchise.toLowerCase().includes(q) ||
                c.category.toLowerCase().includes(q) ||
                (c.bio || '').toLowerCase().includes(q)
            );
        }
        return list;
    },

    _renderCard(ch, idx) {
        const num = String(ch.rank_order || idx + 1).padStart(2, '0');
        const hasImage = ch.image_path && ch.image_path !== '';
        const imgStyle = hasImage ? `background-image: url('${ch.image_path}')` : '';

        // Build gameography (top 8)
        const games = (ch.gameography || []).slice(0, 8);
        const gameList = games.map((g, gi) => `
            <div class="rs-game-entry">
                <span class="rs-game-num">${gi + 1}</span>
                <div class="rs-game-info">
                    <span class="rs-game-title">${H.escHtml(g.display_title)}${g.year ? ` (${Math.round(parseFloat(g.year))})` : ''}</span>
                    ${g.note ? `<span class="rs-game-note">${H.escHtml(g.note)}</span>` : `<span class="rs-game-note">${H.escHtml(g.system_name || g.system_id || '')}</span>`}
                </div>
            </div>
        `).join('');

        return `<div class="rs-card" data-char-id="${ch.id}">
            <div class="rs-card-hero ${hasImage ? 'has-image' : ''}" ${imgStyle ? `style="${imgStyle}"` : ''}>
                <span class="rs-rank">${num}</span>
                <span class="rs-genre-tag">${H.escHtml(ch.genre_tag || '')}</span>
            </div>
            <div class="rs-card-body">
                <div class="rs-card-title-label">${H.escHtml(ch.title || '')}</div>
                <h3 class="rs-card-name">${H.escHtml(ch.name)}</h3>
                <p class="rs-card-bio">${H.escHtml(ch.bio || '')}</p>

                <div class="rs-stats-row">
                    <div class="rs-stat-box">
                        <div class="rs-stat-label">DEBUT</div>
                        <div class="rs-stat-value">${H.escHtml(ch.debut_game || '—')}</div>
                    </div>
                    <div class="rs-stat-box">
                        <div class="rs-stat-label">ERA</div>
                        <div class="rs-stat-value">${H.escHtml(ch.era || '—')}</div>
                    </div>
                    <div class="rs-stat-box">
                        <div class="rs-stat-label">FRANCHISE</div>
                        <div class="rs-stat-value">${H.escHtml(ch.franchise || '—')}</div>
                    </div>
                </div>

                ${games.length > 0 ? `
                <div class="rs-gameography">
                    <div class="rs-gameography-header">
                        <span>Gameography</span>
                        <span class="rs-gameography-count">${ch.game_count || games.length} in Library</span>
                    </div>
                    ${gameList}
                </div>` : `
                <div class="rs-gameography rs-no-games">
                    <div class="rs-gameography-header"><span>Gameography</span></div>
                    <p class="rs-game-note" style="padding:12px 16px;opacity:0.5">No matching games in your library yet</p>
                </div>`}
            </div>
        </div>`;
    },

    setCategory(cat) {
        this.activeCategory = cat;
        this._renderPage();
    },

    setSearch(val) {
        this.searchTerm = val;
        // Debounce re-render
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => this._renderPage(), 200);
    },

    async downloadImages() {
        try {
            H.toast('📥 Downloading character portraits from Wikipedia...', 'info');
            await API.post('/api/library/retro-stars/download-images');
            H.toast('✅ Image download started! Refresh in a minute to see portraits.', 'success');
        } catch (e) {
            H.toast('Failed: ' + e.message, 'error');
        }
    },
};
