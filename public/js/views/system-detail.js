/* System Detail View — full system page with LLM bio */
window.SystemDetailView = {
    current: null,

    async render(params) {
        const app = document.getElementById('app');
        app.innerHTML = `<div style="padding:32px">${GameCard.renderSkeleton(8)}</div>`;

        try {
            const system = await API.systemDetail(params.id);
            this.current = system;

            const color = system.color || '#7B2D8E';
            const hasBio = !!system.bio;

            app.innerHTML = `
                <div class="system-detail-page">
                    <!-- Hero -->
                    <div class="system-detail-hero" style="--sys-color:${color}">
                        <button class="back-btn" onclick="location.hash='#/systems'">← Systems</button>
                        <div class="system-detail-hero-inner">
                            <div class="system-detail-photo" style="background:${color}15">
                                <img src="${H.systemImg(system.id)}" alt="${H.escHtml(system.name)}" loading="lazy"
                                     onerror="this.style.display='none';this.nextElementSibling.style.display=''"
                                     class="system-photo-lg">
                                <span class="system-emoji-fallback-lg" style="display:none">${H.systemEmoji(system.id)}</span>
                            </div>
                            <div class="system-detail-info">
                                <h1 class="system-detail-name">${H.escHtml(system.name)}</h1>
                                <div class="system-detail-stats">
                                    <span class="sys-stat"><strong>${system.rom_count}</strong> games</span>
                                    ${system.genres?.length ? `<span class="sys-stat">${system.genres.length} genres</span>` : ''}
                                </div>
                                ${system.genres?.length ? `
                                    <div class="system-genre-pills">
                                        ${system.genres.slice(0, 6).map(g => `<span class="genre-pill" style="--pill-color:${color}">${H.escHtml(g.genre)} <small>(${g.count})</small></span>`).join('')}
                                    </div>
                                ` : ''}
                                <div class="system-detail-actions">
                                    <a href="#/library?system=${system.id}" class="btn btn-primary">🎮 Play Games</a>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Bio Section -->
                    <div class="system-bio-section" id="system-bio-wrap">
                        ${hasBio ? this.renderBio(system) : this.renderEmptyBio()}
                    </div>

                    <!-- Top Games -->
                    ${system.topGames?.length ? `
                        <div class="system-top-games">
                            <h2 class="section-title">Top Games</h2>
                            <div class="system-games-grid">
                                ${system.topGames.map(g => this.renderGameCard(g)).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    renderBio(system) {
        const ts  = system.bio_generated_at ? new Date(system.bio_generated_at).toLocaleDateString() : '';
        const mdl = system.bio_model ? system.bio_model.split('-').slice(0,3).join('-') : '';
        return `
            <div class="intel-content">
                ${GameView.mdToHtml(system.bio)}
                <div class="intel-footer">
                    <div class="intel-footer-meta">
                        ${mdl ? `<span class="intel-model">${mdl}</span>` : ''}
                        ${ts  ? `<span class="intel-date">${ts}</span>` : ''}
                    </div>
                    <button class="intel-regen-btn" onclick="SystemDetailView.generateBio()">↺ Re-download</button>
                </div>
            </div>`;
    },

    renderEmptyBio() {
        return `
            <div class="intel-empty-state">
                <div class="intel-empty-glow"></div>
                <div class="intel-empty-text">
                    <span class="intel-empty-title">No system bio yet</span>
                    <span class="intel-empty-sub">Download one — takes about 15 seconds</span>
                </div>
                <button class="btn btn-yellow intel-gen-btn" onclick="SystemDetailView.generateBio()">
                    ✨ Download Bio
                </button>
            </div>`;
    },

    renderGameCard(g) {
        const art = g.artwork_url
            ? `<img src="${g.artwork_url}" alt="" class="sys-game-art" loading="lazy" onerror="this.style.display='none'">`
            : '';
        return `
            <a class="sys-game-card" href="#/game/${g.id}">
                ${art}
                <div class="sys-game-info">
                    <span class="sys-game-title">${H.escHtml(g.title)}</span>
                    ${g.genre ? `<span class="sys-game-genre">${H.escHtml(g.genre)}</span>` : ''}
                    ${g.play_count > 0 ? `<span class="sys-game-plays">${g.play_count} plays</span>` : ''}
                </div>
            </a>`;
    },

    async generateBio() {
        if (!this.current) return;
        const wrap = document.getElementById('system-bio-wrap');
        if (!wrap) return;

        const name = H.escHtml(this.current.name);
        const facts = [
            'Scanning cartridge slot...',
            'Inserting coin...',
            'Blowing on the cartridge...',
            'Reading ROM headers...',
            'Decoding sprite tables...',
            'Warming up the CRT...',
            'Calibrating D-pad...',
            'Loading save state...',
            'Mapping memory banks...',
            'Checking power supply...',
            'Tuning RF adapter...',
            'Dusting off the manual...',
            'Rewinding VHS tape...',
            'Flipping the power switch...',
            'Adjusting tracking...',
        ];
        // Pick 5 random unique facts
        const picked = facts.sort(() => Math.random() - 0.5).slice(0, 5);

        wrap.innerHTML = `
            <div class="bio-loading-screen">
                <div class="bio-loading-cabinet">
                    <div class="bio-loading-screen-inner">
                        <div class="bio-loading-scanlines"></div>
                        <div class="bio-loading-content">
                            <div class="bio-loading-title">${name}</div>
                            <div class="bio-loading-bar-wrap">
                                <div class="bio-loading-bar"></div>
                            </div>
                            <div class="bio-loading-status" id="bio-load-status">${picked[0]}</div>
                        </div>
                    </div>
                </div>
            </div>`;

        // Cycle through status messages
        let idx = 0;
        const statusEl = document.getElementById('bio-load-status');
        const statusInterval = setInterval(() => {
            idx = (idx + 1) % picked.length;
            if (statusEl) statusEl.textContent = picked[idx];
        }, 2800);

        try {
            const result = await API.generateSystemBio(this.current.id);
            clearInterval(statusInterval);
            this.current.bio = result.bio;
            this.current.bio_model = result.bio_model;
            this.current.bio_generated_at = result.bio_generated_at;
            wrap.innerHTML = this.renderBio(this.current);
            H.toast(`${this.current.name} bio downloaded!`, 'success');
        } catch (err) {
            clearInterval(statusInterval);
            wrap.innerHTML = this.renderEmptyBio();
            H.toast(err.message, 'error');
        }
    },
};
