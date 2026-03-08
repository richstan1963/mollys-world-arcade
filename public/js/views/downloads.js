/* Downloads View — Download status + URL downloader */
window.DownloadsView = {
    refreshTimer: null,

    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading...</div>';

        try {
            const [downloads, systems] = await Promise.all([
                API.downloadStatus(),
                API.systems(),
            ]);

            let html = `
                <div class="page-header">
                    <h1 class="page-title">Downloads</h1>
                    <p class="page-subtitle">${downloads.length} recent downloads</p>
                </div>

                <div class="settings-section">
                    <h3>Download ROM from URL</h3>
                    <div class="url-download-form">
                        <input type="text" id="dlUrl" placeholder="https://example.com/game.nes">
                        <select id="dlSystem">
                            <option value="">Select System</option>
                            ${systems.map(s => `<option value="${s.id}">${H.escHtml(s.short_name)} — ${H.escHtml(s.name)}</option>`).join('')}
                        </select>
                        <button class="btn btn-teal" onclick="DownloadsView.downloadUrl()">⬇️ Download</button>
                    </div>
                </div>

                <div class="download-list">
                    ${downloads.length === 0
                        ? '<div class="empty-state"><div class="empty-state-icon">📭</div><h3>No downloads yet</h3><p>Download ROMs from Archive.org, MAMEdev, or paste a URL above.</p></div>'
                        : downloads.map(d => `
                            <div class="download-item">
                                <span style="font-size:16px;">${d.status === 'complete' ? '✅' : d.status === 'downloading' ? '⏳' : d.status === 'failed' ? '❌' : '⏸️'}</span>
                                <span class="download-item-file">${H.escHtml(d.filename || d.url)}</span>
                                <span style="font-size:12px;color:var(--text-dim)">${d.system_id || ''}</span>
                                ${d.size_bytes ? `<span style="font-size:12px;color:var(--text-dim)">${H.formatBytes(d.size_bytes)}</span>` : ''}
                                <span class="download-status ${d.status}">${d.status}</span>
                                ${d.status === 'downloading' && d.progress ? `<span style="font-size:11px;color:var(--teal)">${Math.round(d.progress * 100)}%</span>` : ''}
                            </div>
                        `).join('')
                    }
                </div>
            `;

            app.innerHTML = html;

            // Auto-refresh if any downloads are in progress
            const hasActive = downloads.some(d => d.status === 'downloading' || d.status === 'pending');
            if (hasActive) {
                this.refreshTimer = setTimeout(() => this.render(), 3000);
            }
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    async downloadUrl() {
        const url = document.getElementById('dlUrl')?.value?.trim();
        const system_id = document.getElementById('dlSystem')?.value;

        if (!url) { H.toast('Enter a URL', 'error'); return; }
        if (!system_id) { H.toast('Select a system', 'error'); return; }

        try {
            await API.downloadUrl(url, system_id);
            H.toast('Download started!', 'success');
            this.render();
        } catch (err) {
            H.toast('Download failed: ' + err.message, 'error');
        }
    },

    cleanup() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    },
};
