/* Archive.org Browser View */
window.ArchiveView = {
    state: { query: '', page: 1, results: null, files: null, currentItem: null },

    async render() {
        const app = document.getElementById('app');

        let html = `
            <div class="page-header">
                <h1 class="page-title">Archive.org Browser</h1>
                <p class="page-subtitle">Search the Internet Archive for retro game collections</p>
            </div>

            <div class="toolbar">
                ${SearchBar.render('Search archive.org...', this.state.query)}
                <button class="btn btn-primary" onclick="ArchiveView.search()">Search</button>
            </div>
        `;

        // Show file listing if viewing an item
        if (this.state.files && this.state.currentItem) {
            html += `
                <div style="margin-bottom:16px;">
                    <button class="btn btn-sm btn-ghost" onclick="ArchiveView.clearFiles()">← Back to results</button>
                    <span style="margin-left:12px;font-size:14px;font-weight:600;">${H.escHtml(this.state.currentItem.title)}</span>
                </div>
                <div class="archive-files">
                    ${this.state.files.map(f => `
                        <div class="archive-file">
                            <span class="archive-file-name">${H.escHtml(f.name)}</span>
                            <span class="archive-file-size">${H.formatBytes(parseInt(f.size) || 0)}</span>
                            <button class="btn btn-xs btn-teal" onclick="ArchiveView.downloadFile('${H.escHtml(this.state.currentItem.identifier)}', '${H.escHtml(f.name)}')">
                                ⬇️ Download
                            </button>
                        </div>
                    `).join('')}
                    ${this.state.files.length === 0 ? '<div class="empty-state"><p>No ROM files found in this item.</p></div>' : ''}
                </div>
            `;
        }
        // Show search results
        else if (this.state.results) {
            html += `
                <div class="archive-results">
                    ${(this.state.results.results || []).map(item => `
                        <div class="archive-item" onclick="ArchiveView.viewFiles('${H.escHtml(item.identifier)}')">
                            <span class="archive-item-icon">📦</span>
                            <div class="archive-item-info">
                                <div class="archive-item-title">${H.escHtml(item.title)}</div>
                                <div class="archive-item-desc">${H.escHtml(item.description || '')}</div>
                            </div>
                            <span class="archive-item-downloads">${item.downloads ? item.downloads.toLocaleString() + ' downloads' : ''}</span>
                        </div>
                    `).join('')}
                    ${(this.state.results.results || []).length === 0 ? '<div class="empty-state"><p>No results found. Try different keywords.</p></div>' : ''}
                </div>
            `;
        }

        app.innerHTML = html;

        // Bind search on enter
        SearchBar.bind((val) => { this.state.query = val; }, 0);
        const input = document.getElementById('searchInput');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.search();
            });
        }
    },

    async search() {
        const input = document.getElementById('searchInput');
        this.state.query = input ? input.value : this.state.query;
        if (!this.state.query.trim()) return;

        this.state.files = null;
        this.state.currentItem = null;

        const app = document.getElementById('app');
        try {
            this.state.results = await API.archiveSearch(this.state.query, this.state.page);
            this.render();
        } catch (err) {
            H.toast('Search failed: ' + err.message, 'error');
        }
    },

    async viewFiles(identifier) {
        try {
            const data = await API.archiveFiles(identifier);
            this.state.files = data.files || [];
            this.state.currentItem = (this.state.results.results || []).find(i => i.identifier === identifier) || { identifier, title: identifier };
            this.render();
        } catch (err) {
            H.toast('Failed to load files: ' + err.message, 'error');
        }
    },

    clearFiles() {
        this.state.files = null;
        this.state.currentItem = null;
        this.render();
    },

    async downloadFile(identifier, filename) {
        try {
            await API.archiveDownload(identifier, filename);
            H.toast(`Downloading ${filename}...`, 'info');
        } catch (err) {
            H.toast('Download failed: ' + err.message, 'error');
        }
    },
};
