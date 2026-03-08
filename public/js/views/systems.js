/* Systems View — Browse all supported consoles */
window.SystemsView = {
    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading...</div>';

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
            <a class="system-card" href="#/library?system=${s.id}">
                <div class="system-icon" style="background:${color}22;color:${color}">
                    ${H.systemEmoji(s.id)}
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
            </a>
        `;
    },
};
