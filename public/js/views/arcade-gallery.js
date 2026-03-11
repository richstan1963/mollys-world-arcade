/* ═══════════════════════════════════════════════════════════
   ARCADE GALLERY — Cabinet Art, Marquees & Flyers
   Showcases artwork from Progetto-SNAPS & Archive.org
   for MAME/FBNeo/Neo Geo arcade ROMs
   ═══════════════════════════════════════════════════════════ */

window.ArcadeGalleryView = {
    _filter: 'all',     // all | cabinets | marquees | flyers
    _search: '',

    async render() {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="page-header" style="opacity:0.2">
                <h1 class="page-title">Arcade Gallery</h1>
            </div>
            ${GameCard.renderSkeleton(12)}
        `;

        try {
            const data = await API.get('/api/library/arcade-gallery');
            this._games = data.games || [];
            this._renderPage(app);
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    _renderPage(app) {
        const games = this._getFiltered();
        const totalCabinets = this._games.filter(g => g.cabinet_path).length;
        const totalMarquees = this._games.filter(g => g.marquee_path).length;
        const totalFlyers   = this._games.filter(g => g.flyer_path).length;
        const totalSnaps    = this._games.filter(g => g.snap_path).length;

        let html = `
            <div class="page-header">
                <h1 class="page-title">🕹️ Arcade Gallery</h1>
                <p class="page-subtitle">${this._games.length} arcade games · ${totalCabinets} cabinets · ${totalMarquees} marquees · ${totalFlyers} flyers</p>
            </div>

            <div class="ag-controls">
                <div class="ag-filters">
                    <button class="ag-filter ${this._filter === 'all' ? 'active' : ''}" onclick="ArcadeGalleryView.setFilter('all')">All Art</button>
                    <button class="ag-filter ${this._filter === 'cabinets' ? 'active' : ''}" onclick="ArcadeGalleryView.setFilter('cabinets')">🗄️ Cabinets (${totalCabinets})</button>
                    <button class="ag-filter ${this._filter === 'marquees' ? 'active' : ''}" onclick="ArcadeGalleryView.setFilter('marquees')">🎪 Marquees (${totalMarquees})</button>
                    <button class="ag-filter ${this._filter === 'flyers' ? 'active' : ''}" onclick="ArcadeGalleryView.setFilter('flyers')">📄 Flyers (${totalFlyers})</button>
                    <button class="ag-filter ${this._filter === 'snaps' ? 'active' : ''}" onclick="ArcadeGalleryView.setFilter('snaps')">📸 Screenshots (${totalSnaps})</button>
                </div>
                <input type="text" class="ag-search" placeholder="Search arcade games..." value="${H.escHtml(this._search)}" oninput="ArcadeGalleryView.setSearch(this.value)">
            </div>
        `;

        if (games.length === 0) {
            html += `
                <div class="empty-state">
                    <div class="empty-state-icon">🕹️</div>
                    <h3>No Arcade Art Found</h3>
                    <p>${this._search ? 'No matches for your search.' : 'Run the Progetto-SNAPS or Archive.org enrichment to import arcade artwork.'}</p>
                </div>
            `;
        } else {
            html += `<div class="ag-grid">`;
            for (const game of games) {
                html += this._renderGalleryCard(game);
            }
            html += `</div>`;
        }

        app.innerHTML = html;
    },

    _getFiltered() {
        let games = this._games;

        // Filter by art type
        if (this._filter === 'cabinets') games = games.filter(g => g.cabinet_path);
        else if (this._filter === 'marquees') games = games.filter(g => g.marquee_path);
        else if (this._filter === 'flyers') games = games.filter(g => g.flyer_path);
        else if (this._filter === 'snaps') games = games.filter(g => g.snap_path);
        else games = games.filter(g => g.cabinet_path || g.marquee_path || g.flyer_path || g.snap_path);

        // Search filter
        if (this._search) {
            const q = this._search.toLowerCase();
            games = games.filter(g => (g.title || g.clean_name || '').toLowerCase().includes(q));
        }

        return games;
    },

    _renderGalleryCard(game) {
        const title = H.escHtml(game.title || game.clean_name || game.filename);
        // Pick best image: cabinet > marquee > snap > flyer > boxart
        const img = game.cabinet_path || game.marquee_path || game.snap_path || game.flyer_path || game.artwork_path;
        const artTypes = [];
        if (game.cabinet_path) artTypes.push('🗄️');
        if (game.marquee_path) artTypes.push('🎪');
        if (game.flyer_path) artTypes.push('📄');
        if (game.snap_path) artTypes.push('📸');

        return `
            <div class="ag-card" onclick="ArcadeGalleryView.openLightbox(${game.id})">
                <div class="ag-card-art">
                    ${img
                        ? `<img src="${img}" alt="${title}" loading="lazy" onerror="this.parentNode.innerHTML='<span class=\\'ag-no-art\\'>🕹️</span>'">`
                        : `<span class="ag-no-art">🕹️</span>`
                    }
                    <div class="ag-card-overlay">
                        <span class="ag-card-zoom">🔍 View All Art</span>
                    </div>
                </div>
                <div class="ag-card-info">
                    <div class="ag-card-title">${title}</div>
                    <div class="ag-card-badges">${artTypes.join(' ')}</div>
                </div>
            </div>
        `;
    },

    openLightbox(romId) {
        const game = this._games.find(g => g.id === romId);
        if (!game) return;

        const title = H.escHtml(game.title || game.clean_name || game.filename);
        const images = [];
        if (game.cabinet_path) images.push({ src: game.cabinet_path, label: '🗄️ Cabinet' });
        if (game.marquee_path) images.push({ src: game.marquee_path, label: '🎪 Marquee' });
        if (game.flyer_path)   images.push({ src: game.flyer_path,   label: '📄 Flyer' });
        if (game.snap_path)    images.push({ src: game.snap_path,    label: '📸 Screenshot' });
        if (game.artwork_path) images.push({ src: game.artwork_path, label: '🎨 Artwork' });

        if (images.length === 0) { H.toast('No artwork available', 'info'); return; }

        const overlay = document.createElement('div');
        overlay.className = 'ag-lightbox-overlay';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        overlay.innerHTML = `
            <div class="ag-lightbox">
                <div class="ag-lightbox-header">
                    <h2>${title}</h2>
                    <button class="ag-lightbox-close" onclick="this.closest('.ag-lightbox-overlay').remove()">✕</button>
                </div>
                <div class="ag-lightbox-tabs">
                    ${images.map((img, i) => `
                        <button class="ag-lightbox-tab ${i === 0 ? 'active' : ''}" onclick="ArcadeGalleryView.switchTab(this, ${i})">${img.label}</button>
                    `).join('')}
                </div>
                <div class="ag-lightbox-images">
                    ${images.map((img, i) => `
                        <div class="ag-lightbox-img ${i === 0 ? 'active' : ''}" data-idx="${i}">
                            <img src="${img.src}" alt="${img.label}">
                        </div>
                    `).join('')}
                </div>
                <div class="ag-lightbox-actions">
                    <a href="#/game/${game.id}" class="ag-lightbox-play" onclick="this.closest('.ag-lightbox-overlay').remove()">🎮 Play Game</a>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    },

    switchTab(btn, idx) {
        const lb = btn.closest('.ag-lightbox');
        lb.querySelectorAll('.ag-lightbox-tab').forEach(t => t.classList.remove('active'));
        lb.querySelectorAll('.ag-lightbox-img').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        lb.querySelector(`.ag-lightbox-img[data-idx="${idx}"]`)?.classList.add('active');
    },

    setFilter(f) {
        this._filter = f;
        this._renderPage(document.getElementById('app'));
    },

    setSearch(q) {
        this._search = q;
        this._renderPage(document.getElementById('app'));
    },
};
