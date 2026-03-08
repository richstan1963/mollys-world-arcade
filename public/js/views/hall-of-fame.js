/* Hall of Fame — All-Time Greatest Players */
window.HallOfFameView = {
    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading Hall of Fame...</div>';

        try {
            const [hofData, legendsData] = await Promise.all([
                API.get('/api/hall-of-fame'),
                API.get('/api/hall-of-fame/legends').catch(() => ({ records: [] })),
            ]);

            const categories = [
                { key: 'most_xp', icon: '\u{1F3C6}', title: 'Most XP', color: '#F59E0B', valKey: 'xp', format: v => v.toLocaleString() + ' XP' },
                { key: 'most_played', icon: '\u{1F3AE}', title: 'Most Games Played', color: '#A855F7', valKey: 'play_count', format: v => v.toLocaleString() + ' plays' },
                { key: 'most_time', icon: '\u23F1\uFE0F', title: 'Most Time Played', color: '#06B6D4', valKey: 'total_seconds', format: v => H.formatDuration(v) },
                { key: 'most_favorites', icon: '\u2B50', title: 'Most Favorites', color: '#EC4899', valKey: 'favorite_count', format: v => v.toLocaleString() },
                { key: 'most_achievements', icon: '\u{1F3C5}', title: 'Most Achievements', color: '#22C55E', valKey: 'achievement_count', format: v => v + ' badges' },
                { key: 'longest_streak', icon: '\u{1F525}', title: 'Longest Streak', color: '#EF4444', valKey: 'streak_days', format: v => v + ' days' },
            ];

            let html = `
                <div class="section-header" style="margin-bottom:24px;">
                    <span class="section-title">\u{1F3C6} Hall of Fame</span>
                </div>
                <div class="hof-grid">
            `;

            for (const cat of categories) {
                const players = hofData[cat.key] || [];
                html += `
                    <div class="hof-category-card" style="--cat-color:${cat.color}">
                        <div class="hof-category-header">
                            <span class="hof-category-icon">${cat.icon}</span>
                            <span class="hof-category-title">${cat.title}</span>
                        </div>
                        <div class="hof-category-list">
                `;

                if (players.length === 0) {
                    html += '<div class="hof-empty">No data yet</div>';
                } else {
                    const maxVal = players[0]?.[cat.valKey] || 1;
                    players.slice(0, 5).forEach((p, i) => {
                        const val = p[cat.valKey] || 0;
                        const pct = Math.max(5, Math.round((val / maxVal) * 100));
                        const isFirst = i === 0;
                        const isStreakActive = cat.key === 'longest_streak' && p.streak_active;
                        html += `
                            <div class="hof-row ${isFirst ? 'hof-row-gold' : ''}">
                                <span class="hof-rank">${i === 0 ? '\u{1F947}' : i === 1 ? '\u{1F948}' : i === 2 ? '\u{1F949}' : '#' + (i + 1)}</span>
                                <span class="hof-player-avatar" style="border-color:${p.color || '#666'}">${p.emoji || '\u{1F3AE}'}</span>
                                <div class="hof-player-info">
                                    <div class="hof-player-name" style="color:${p.color || '#E2E8F0'}">${H.escHtml(p.name)}</div>
                                    <div class="hof-bar-wrap">
                                        <div class="hof-bar" style="width:${pct}%;background:${cat.color}"></div>
                                    </div>
                                </div>
                                <span class="hof-value ${isStreakActive ? 'hof-streak-active' : ''}">${cat.format(val)}${isStreakActive ? ' \u{1F525}' : ''}</span>
                            </div>
                        `;
                    });
                }

                html += `
                        </div>
                    </div>
                `;
            }

            html += '</div>';

            // Records section
            const records = legendsData.records || [];
            if (records.length > 0) {
                html += `
                    <div class="section-header" style="margin-top:36px;margin-bottom:16px;">
                        <span class="section-title">\u{1F4DC} Game Records</span>
                    </div>
                    <div class="hof-records-grid">
                `;
                for (const rec of records) {
                    html += `
                        <div class="hof-record-card">
                            <div class="hof-record-game">${H.escHtml(rec.game_name)}</div>
                            <div class="hof-record-type">${H.escHtml(rec.record_type)}</div>
                            <div class="hof-record-holder">
                                <span style="color:${rec.color}">${rec.emoji} ${H.escHtml(rec.player_name)}</span>
                            </div>
                            <div class="hof-record-value">${H.escHtml(String(rec.value))}</div>
                            <div class="hof-record-date">${H.timeAgo(rec.achieved_at)}</div>
                        </div>
                    `;
                }
                html += '</div>';
            }

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F4A5}</div><h3>Error loading Hall of Fame</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },
};
