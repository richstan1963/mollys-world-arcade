/* MAME Dev Free ROMs View */
window.MamedevView = {
    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading...</div>';

        try {
            const roms = await API.mamedevList();

            let html = `
                <div class="page-header">
                    <h1 class="page-title">Free Arcade ROMs</h1>
                    <p class="page-subtitle">${roms.length} free, rights-holder-approved ROMs from MAMEdev.org</p>
                </div>

                <div style="margin-bottom:20px;">
                    <button class="btn btn-yellow" onclick="MamedevView.downloadAll()" id="downloadAllBtn">
                        ⬇️ Download All Missing
                    </button>
                </div>

                <div class="mame-grid">
                    ${roms.map(rom => `
                        <div class="mame-card">
                            <div class="mame-card-icon">👾</div>
                            <div class="mame-card-info">
                                <div class="mame-card-title">${H.escHtml(rom.title)}</div>
                                <div class="mame-card-slug">${H.escHtml(rom.slug)}</div>
                            </div>
                            ${rom.downloaded
                                ? '<span class="badge-downloaded">✓ Downloaded</span>'
                                : `<button class="btn btn-xs btn-teal" onclick="MamedevView.download('${H.escHtml(rom.slug)}', this)">⬇️</button>`
                            }
                        </div>
                    `).join('')}
                </div>
            `;

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    async download(slug, btn) {
        if (btn) { btn.disabled = true; btn.textContent = '...'; }
        try {
            await API.mamedevDownload(slug);
            H.toast(`Downloaded ${slug}`, 'success');
            if (btn) { btn.textContent = '✓'; btn.className = 'badge-downloaded'; }
        } catch (err) {
            H.toast(`Failed: ${err.message}`, 'error');
            if (btn) { btn.disabled = false; btn.textContent = '⬇️'; }
        }
    },

    async downloadAll() {
        const btn = document.getElementById('downloadAllBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Downloading...'; }

        try {
            const roms = await API.mamedevList();
            const missing = roms.filter(r => !r.downloaded);

            for (const rom of missing) {
                try {
                    await API.mamedevDownload(rom.slug);
                    H.toast(`Downloaded ${rom.title}`, 'success');
                } catch (e) {
                    H.toast(`Failed: ${rom.slug} - ${e.message}`, 'error');
                }
            }

            H.toast('All downloads complete!', 'success');
            this.render();
        } catch (err) {
            H.toast('Download all failed: ' + err.message, 'error');
            if (btn) { btn.disabled = false; btn.textContent = '⬇️ Download All Missing'; }
        }
    },
};
