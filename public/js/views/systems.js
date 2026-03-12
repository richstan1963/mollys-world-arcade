/* Systems View — Browse all supported consoles */
window.SystemsView = {
    async render() {
        const app = document.getElementById('app');
        app.innerHTML = `<div class="page-header" style="opacity:0.2"><h1 class="page-title">Systems</h1></div>${GameCard.renderSystemSkeleton(8)}`;

        try {
            const systems = await API.systems();

            const MIN_GAMES = 10;
            const withGames = systems.filter(s => s.rom_count >= MIN_GAMES);

            let html = `
                <div class="page-header">
                    <h1 class="page-title">Systems</h1>
                    <p class="page-subtitle">${withGames.length} systems · ${systems.reduce((a,s)=>a+s.rom_count,0).toLocaleString()} games</p>
                </div>
            `;

            if (withGames.length > 0) {
                html += `
                    <div class="section-header">
                        <span class="section-title">With Games</span>
                    </div>
                    <div class="system-grid">
                        ${withGames.map(s => this.renderCard(s)).join('')}
                    </div>
                `;
            }

            // Systems under 100 games are not shown in the public browser

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    renderCard(s) {
        const color = s.color || '#7B2D8E';
        return `
            <div class="system-card">
                <div class="system-icon">
                    <img src="${H.systemImg(s.id)}" alt="${H.escHtml(s.name)}" loading="lazy"
                         onerror="this.style.display='none';this.nextElementSibling.style.display=''"
                         class="system-photo">
                    <span class="system-emoji-fallback" style="display:none">${H.systemEmoji(s.id)}</span>
                </div>
                <div class="system-info">
                    <h3>${H.escHtml(s.name)}</h3>
                    <div class="rom-count">
                        ${s.rom_count > 0
                            ? `<strong>${s.rom_count}</strong> games`
                            : '<span style="color:var(--text-muted)">No games yet</span>'
                        }
                    </div>
                </div>
                <div class="system-card-actions">
                    <a href="#/library?system=${s.id}" class="sys-btn sys-btn-play"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5,3 19,12 5,21"/></svg> Play</a>
                    <a href="#/system/${s.id}" class="sys-btn sys-btn-info"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> Info</a>
                </div>
            </div>
        `;
    },
};
