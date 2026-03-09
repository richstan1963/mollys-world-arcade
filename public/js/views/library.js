/* Library View — Browse all games with search, filter, sort, pagination */
window.LibraryView = {
    state: { page: 1, search: '', system: '', sort: 'name', order: 'asc', tag: '', genre: '' },

    async render() {
        const app = document.getElementById('app');

        // Check for system/tag/genre filter from URL
        const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
        if (hashParams.has('system')) this.state.system = hashParams.get('system');
        if (hashParams.has('tag')) this.state.tag = hashParams.get('tag');
        else this.state.tag = '';
        if (hashParams.has('genre')) this.state.genre = hashParams.get('genre');
        else if (!this.state.genre) this.state.genre = '';
        if (hashParams.has('search')) this.state.search = hashParams.get('search');

        app.innerHTML = '<div class="loading">Loading...</div>';

        try {
            const [systems, data] = await Promise.all([
                API.systems(),
                API.library(this.state),
            ]);

            const tagTitles = { neogeo: '🔥 Neo Geo Collection', beatemup: '👊 Beat-Em-Ups' };
            let pageTitle = 'Game Library';
            let pageSubtitle = `${data.total} games in your collection`;

            if (this.state.tag) {
                pageTitle = tagTitles[this.state.tag] || 'Game Library';
                pageSubtitle = `${data.total} ${this.state.tag === 'neogeo' ? 'Neo Geo' : 'Beat-Em-Up'} games`;
            } else if (this.state.genre) {
                pageTitle = `🎭 ${this.state.genre}`;
                pageSubtitle = `${data.total} ${this.state.genre} games`;
            }

            let html = `
                <div class="page-header">
                    <h1 class="page-title">${pageTitle}</h1>
                    <p class="page-subtitle">${pageSubtitle}</p>
                    ${this.state.genre ? `<button class="btn btn-sm btn-ghost" onclick="LibraryView.clearGenre()" style="margin-top:8px">✕ Clear Genre Filter</button>` : ''}
                </div>

                <div class="toolbar">
                    ${SearchBar.render('Search your library...', this.state.search)}
                    <select id="systemFilter" onchange="LibraryView.filterSystem(this.value)">
                        <option value="">All Systems</option>
                        ${systems.filter(s => s.rom_count > 0).map(s =>
                            `<option value="${s.id}" ${this.state.system === s.id ? 'selected' : ''}>${H.escHtml(s.short_name)} (${s.rom_count})</option>`
                        ).join('')}
                    </select>
                    <select id="sortSelect" onchange="LibraryView.changeSort(this.value)">
                        <option value="name" ${this.state.sort === 'name' ? 'selected' : ''}>Name</option>
                        <option value="added" ${this.state.sort === 'added' ? 'selected' : ''}>Date Added</option>
                        <option value="system" ${this.state.sort === 'system' ? 'selected' : ''}>System</option>
                        <option value="size" ${this.state.sort === 'size' ? 'selected' : ''}>Size</option>
                    </select>
                    <button class="btn btn-sm btn-ghost" onclick="LibraryView.toggleOrder()">
                        ${this.state.order === 'asc' ? '↑ A-Z' : '↓ Z-A'}
                    </button>
                    <button class="btn btn-sm btn-teal" onclick="API.batchArtwork().then(r => H.toast(r.message, 'success')).catch(e => H.toast(e.message, 'error'))">
                        🖼️ Fetch Art
                    </button>
                </div>

                ${GameCard.renderGrid(data.games)}
                ${Pagination.render(data.page, data.pages, data.total)}
            `;

            app.innerHTML = html;

            // Bind search
            SearchBar.bind((val) => {
                this.state.search = val;
                this.state.page = 1;
                this.render();
            });

            // Bind pagination
            Pagination.onNavigate = (page) => {
                this.state.page = page;
                this.render();
            };
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    filterSystem(val) {
        this.state.system = val;
        this.state.page = 1;
        this.render();
    },

    clearGenre() {
        this.state.genre = '';
        this.state.page = 1;
        window.location.hash = '#/library';
        this.render();
    },

    changeSort(val) {
        this.state.sort = val;
        this.state.page = 1;
        this.render();
    },

    toggleOrder() {
        this.state.order = this.state.order === 'asc' ? 'desc' : 'asc';
        this.render();
    },
};
