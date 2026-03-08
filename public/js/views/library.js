/* Library View — Browse all games with search, filter, sort, pagination */
window.LibraryView = {
    state: { page: 1, search: '', system: '', sort: 'name', order: 'asc', tag: '' },

    async render() {
        const app = document.getElementById('app');

        // Check for system/tag filter from URL
        const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
        if (hashParams.has('system')) this.state.system = hashParams.get('system');
        if (hashParams.has('tag')) this.state.tag = hashParams.get('tag');
        else this.state.tag = '';

        app.innerHTML = '<div class="loading">Loading...</div>';

        try {
            const [systems, data] = await Promise.all([
                API.systems(),
                API.library(this.state),
            ]);

            const tagTitles = { neogeo: '🔥 Neo Geo Collection', beatemup: '👊 Beat-Em-Ups' };
            const pageTitle = this.state.tag ? tagTitles[this.state.tag] || 'Game Library' : 'Game Library';
            const pageSubtitle = this.state.tag
                ? `${data.total} ${this.state.tag === 'neogeo' ? 'Neo Geo' : 'Beat-Em-Up'} games — MOTU's Favs`
                : `${data.total} games in your collection`;

            let html = `
                <div class="page-header">
                    <h1 class="page-title">${pageTitle}</h1>
                    <p class="page-subtitle">${pageSubtitle}</p>
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
