/* Trophies View — Trophy Case & Badge Collection */
window.TrophiesView = {
    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading trophies...</div>';

        try {
            const activePlayer = ArcadeEngine?.getActivePlayer?.();
            const [allAchievements, progressionData] = await Promise.all([
                API.allAchievements(),
                activePlayer?.id
                    ? API.playerProgression(activePlayer.id).catch(() => null)
                    : Promise.resolve(null),
            ]);

            const achievements = allAchievements || [];
            const earned = progressionData?.achievements || [];
            const earnedMap = {};
            for (const e of earned) {
                earnedMap[e.id || e.achievement_id] = e;
            }

            const totalCount = achievements.length || 20;
            const earnedCount = earned.length;
            const pct = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0;

            // Group by category
            const groups = {};
            const categoryOrder = ['Play', 'Scoring', 'Systems', 'Dedication', 'Milestones'];
            for (const ach of achievements) {
                const cat = ach.category || 'Milestones';
                if (!groups[cat]) groups[cat] = [];
                groups[cat].push(ach);
            }

            const playerLabel = activePlayer
                ? `<span style="color:${activePlayer.color}">${activePlayer.emoji} ${H.escHtml(activePlayer.name)}</span>'s`
                : 'Family';

            let html = `
                <div class="section-header" style="margin-bottom:24px;">
                    <span class="section-title">\u{1F3C6} ${playerLabel} Trophy Case</span>
                </div>

                <div class="trophies-summary">
                    <div class="trophies-ring" style="--pct:${pct};--ring-color:${activePlayer?.color || '#A855F7'}">
                        <div class="trophies-ring-inner">
                            <span class="trophies-ring-value">${pct}%</span>
                            <span class="trophies-ring-label">Complete</span>
                        </div>
                    </div>
                    <div class="trophies-summary-stats">
                        <div class="trophies-stat">
                            <span class="trophies-stat-value">${earnedCount}</span>
                            <span class="trophies-stat-label">Earned</span>
                        </div>
                        <div class="trophies-stat">
                            <span class="trophies-stat-value">${totalCount - earnedCount}</span>
                            <span class="trophies-stat-label">Locked</span>
                        </div>
                        <div class="trophies-stat">
                            <span class="trophies-stat-value">${totalCount}</span>
                            <span class="trophies-stat-label">Total</span>
                        </div>
                    </div>
                </div>
            `;

            // Render each category
            const orderedCats = categoryOrder.filter(c => groups[c]);
            const extraCats = Object.keys(groups).filter(c => !categoryOrder.includes(c));
            for (const cat of [...orderedCats, ...extraCats]) {
                const achs = groups[cat];
                const catIcons = { Play: '\u{1F3AE}', Scoring: '\u{1F3C6}', Systems: '\u{1F5A5}\uFE0F', Dedication: '\u{1F525}', Milestones: '\u{1F3AF}' };
                html += `
                    <div class="trophies-category">
                        <h3 class="trophies-category-title">${catIcons[cat] || '\u{1F3C5}'} ${H.escHtml(cat)}</h3>
                        <div class="trophies-grid">
                `;

                for (const ach of achs) {
                    const isEarned = !!earnedMap[ach.id];
                    const earnedData = earnedMap[ach.id];
                    html += `
                        <div class="trophy-card ${isEarned ? 'trophy-earned' : 'trophy-locked'}">
                            <div class="trophy-icon">${isEarned ? (ach.icon || '\u{1F3C6}') : '\u{1F512}'}</div>
                            <div class="trophy-title">${isEarned ? H.escHtml(ach.title) : '???'}</div>
                            <div class="trophy-desc">${isEarned ? H.escHtml(ach.description || '') : 'Keep playing to unlock!'}</div>
                            ${isEarned && earnedData?.unlocked_at
                                ? `<div class="trophy-date">${H.timeAgo(earnedData.unlocked_at)}</div>`
                                : ''
                            }
                        </div>
                    `;
                }

                html += `
                        </div>
                    </div>
                `;
            }

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F4A5}</div><h3>Error loading trophies</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },
};
