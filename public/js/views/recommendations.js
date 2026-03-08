/* Recommendations View — V5: Mood Picker + You Might Like */
window.RecommendationsView = {
    currentMood: null,

    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading picks...</div>';

        try {
            const [moodsData, forYouData, undiscoveredData] = await Promise.all([
                API.get('/api/recommendations/moods').catch(() => []),
                API.get('/api/recommendations/for-you?limit=20').catch(() => ({ games: [] })),
                API.get('/api/recommendations/undiscovered?limit=16').catch(() => ({ games: [] })),
            ]);

            let html = `
                <div class="mollypop-hero" style="padding-bottom:24px;">
                    <div class="mollypop-hero-center">
                        <div class="hero-theme-icon">🎯</div>
                        <h1 class="mollypop-hero-title hero-title-xl">For You</h1>
                        <p class="mollypop-hero-sub">Picks based on what you love</p>
                    </div>
                </div>
            `;

            // ── Mood Picker ───────────────────────────────────────────────
            if (moodsData.length > 0) {
                html += `
                    <div class="section-header">
                        <span class="section-title">🎭 What's Your Mood?</span>
                    </div>
                    <div class="mood-picker" id="moodPicker">
                        ${moodsData.map(m => `
                            <button class="mood-chip" data-mood="${m.id}" style="--mc:${m.color}"
                                    onclick="RecommendationsView.selectMood('${m.id}', this)">
                                <span class="mood-chip-icon">${m.icon}</span>
                                <span class="mood-chip-label">${m.label}</span>
                            </button>
                        `).join('')}
                    </div>
                    <div id="moodResults" class="mood-results-wrap"></div>
                `;
            }

            // ── You Might Like ────────────────────────────────────────────
            if (forYouData.games?.length > 0) {
                html += `
                    <div class="section-header">
                        <span class="section-title">✨ You Might Like</span>
                        <span class="section-sub">Based on your play history</span>
                    </div>
                    <div class="arrivals-shelf">
                        ${forYouData.games.map(g => this._card(g, g.reason)).join('')}
                    </div>
                `;
            }

            // ── Undiscovered ──────────────────────────────────────────────
            if (undiscoveredData.games?.length > 0) {
                html += `
                    <div class="section-header">
                        <span class="section-title">🔭 Never Played</span>
                        <span class="section-sub">Fresh territory</span>
                    </div>
                    <div class="arrivals-shelf">
                        ${undiscoveredData.games.map(g => this._card(g, 'Uncharted')).join('')}
                    </div>
                `;
            }

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    _card(g, reason = '') {
        const art = H.artworkSrc(g);
        const title = H.escHtml(g.title || g.clean_name);
        const sysColor = g.system_color || '#7B2D8E';
        return `
            <div class="arrival-card" onclick="Router.navigate('#/game/${g.id}')" title="${title}">
                <div class="arrival-art" style="background:${sysColor}18;">
                    ${art
                        ? `<img src="${art}" alt="${title}" loading="lazy" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`
                        : ''
                    }
                    <span class="arrival-emoji" style="${art ? 'display:none' : ''}">${H.systemEmoji(g.system_id)}</span>
                </div>
                <div class="arrival-info">
                    <div class="arrival-title">${title}</div>
                    <div class="arrival-sys" style="color:${sysColor}">${H.escHtml(g.system_name || g.system_id)}</div>
                    ${reason ? `<div class="arrival-reason">${H.escHtml(reason)}</div>` : ''}
                </div>
            </div>
        `;
    },

    async selectMood(moodId, btn) {
        // Toggle off if already selected
        if (this.currentMood === moodId) {
            this.currentMood = null;
            document.querySelectorAll('.mood-chip').forEach(c => c.classList.remove('active'));
            document.getElementById('moodResults').innerHTML = '';
            return;
        }

        this.currentMood = moodId;
        document.querySelectorAll('.mood-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');

        const wrap = document.getElementById('moodResults');
        wrap.innerHTML = '<div class="loading" style="padding:16px;">Loading mood picks...</div>';

        try {
            const data = await API.get(`/api/recommendations/mood/${moodId}?limit=20`);
            if (!data.games?.length) {
                wrap.innerHTML = '<p style="color:var(--text-muted);padding:12px 0;">No picks found for this mood.</p>';
                return;
            }
            const m = data.mood;
            wrap.innerHTML = `
                <div class="mood-results-header" style="--mc:${m.color}">
                    <span>${m.icon}</span>
                    <strong>${m.label}</strong>
                    <span class="mood-results-count">${data.count} picks</span>
                </div>
                <div class="arrivals-shelf">
                    ${data.games.map(g => this._card(g)).join('')}
                </div>
            `;
        } catch (err) {
            wrap.innerHTML = `<p style="color:var(--clr-error)">Error: ${H.escHtml(err.message)}</p>`;
        }
    },
};
