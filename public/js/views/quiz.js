/* "What Should I Play?" Quiz — Fun game picker */
window.QuizView = {
    answers: {},
    step: 0,

    questions: [
        {
            key: 'mood',
            title: 'How are you feeling?',
            options: [
                { value: 'chill', emoji: '😌', label: 'Chill & Relaxing' },
                { value: 'hyped', emoji: '🔥', label: 'Pumped & Competitive' },
                { value: 'nostalgic', emoji: '🕹️', label: 'Nostalgic & Classic' },
                { value: 'adventurous', emoji: '🗺️', label: 'Adventurous' },
            ],
        },
        {
            key: 'genre',
            title: 'What kind of game?',
            options: [
                { value: 'action', emoji: '⚔️', label: 'Action / Fighting' },
                { value: 'platform', emoji: '🏃', label: 'Platformer' },
                { value: 'puzzle', emoji: '🧩', label: 'Puzzle / Strategy' },
                { value: 'sports', emoji: '🏈', label: 'Sports / Racing' },
                { value: 'rpg', emoji: '🐉', label: 'RPG / Adventure' },
                { value: 'any', emoji: '🎲', label: 'Surprise Me!' },
            ],
        },
        {
            key: 'era',
            title: 'Pick an era:',
            options: [
                { value: '8bit', emoji: '👾', label: '8-bit (NES, SMS, GB)' },
                { value: '16bit', emoji: '🎮', label: '16-bit (SNES, Genesis)' },
                { value: '32bit', emoji: '💿', label: '32-bit+ (PS1, N64, GBA)' },
                { value: 'arcade', emoji: '🕹️', label: 'Arcade Classics' },
                { value: 'any', emoji: '🎲', label: 'Any Era' },
            ],
        },
    ],

    render() {
        this.answers = {};
        this.step = 0;
        this.renderStep();
    },

    renderStep() {
        const app = document.getElementById('app');

        if (this.step >= this.questions.length) {
            this.showResults();
            return;
        }

        const q = this.questions[this.step];
        const progress = ((this.step / this.questions.length) * 100).toFixed(0);

        app.innerHTML = `
            <div class="quiz-container">
                <div class="quiz-progress">
                    <div class="quiz-progress-bar" style="width:${progress}%"></div>
                </div>
                <div class="quiz-step">
                    <h2 class="quiz-question">${q.title}</h2>
                    <div class="quiz-options">
                        ${q.options.map(o => `
                            <button class="quiz-option" onclick="QuizView.selectAnswer('${q.key}', '${o.value}')">
                                <span class="quiz-option-emoji">${o.emoji}</span>
                                <span class="quiz-option-label">${o.label}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    },

    selectAnswer(key, value) {
        this.answers[key] = value;
        this.step++;
        SFX?.click();
        this.renderStep();
    },

    async showResults() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Finding your perfect game...</div>';

        try {
            // Build search params based on answers
            const params = { limit: 100 };

            // Map era to systems
            const eraMap = {
                '8bit': 'nes,sms,gb,gbc,atari2600,atari7800',
                '16bit': 'snes,genesis,tg16',
                '32bit': 'psx,n64,gba,psp,saturn',
                'arcade': 'arcade,fbneo',
            };
            if (this.answers.era && this.answers.era !== 'any') {
                params.system = eraMap[this.answers.era] || '';
            }

            const data = await API.library(params);
            let games = data.games || [];

            // Filter by genre keywords if possible
            if (this.answers.genre && this.answers.genre !== 'any') {
                const genreKeywords = {
                    action: ['fight', 'action', 'battle', 'warrior', 'combat', 'street', 'mortal', 'tekken', 'dragon ball'],
                    platform: ['mario', 'sonic', 'kirby', 'donkey kong', 'mega man', 'metroid', 'castlevania', 'rayman'],
                    puzzle: ['tetris', 'puzzle', 'bust', 'columns', 'dr.', 'puyo', 'brain'],
                    sports: ['soccer', 'football', 'baseball', 'basketball', 'racing', 'nba', 'nfl', 'fifa', 'madden', 'kart', 'wave race'],
                    rpg: ['quest', 'fantasy', 'legend', 'pokemon', 'zelda', 'fire emblem', 'chrono', 'tales'],
                };
                const kw = genreKeywords[this.answers.genre] || [];
                if (kw.length > 0) {
                    const filtered = games.filter(g => {
                        const name = (g.clean_name || g.filename || '').toLowerCase();
                        const genre = (g.genre || '').toLowerCase();
                        return kw.some(k => name.includes(k) || genre.includes(k));
                    });
                    if (filtered.length >= 3) games = filtered;
                }
            }

            // Shuffle and pick top 3
            games.sort(() => Math.random() - 0.5);
            const picks = games.slice(0, 3);

            if (picks.length === 0) {
                app.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🤔</div>
                        <h3>No matches found</h3>
                        <p>Try different answers!</p>
                        <button class="btn btn-yellow" onclick="QuizView.render()">Try Again</button>
                    </div>
                `;
                return;
            }

            const moodEmoji = { chill: '😌', hyped: '🔥', nostalgic: '🕹️', adventurous: '🗺️' };

            app.innerHTML = `
                <div class="quiz-results">
                    <h2 class="quiz-results-title">${moodEmoji[this.answers.mood] || '🎮'} We found your games!</h2>
                    <div class="quiz-picks">
                        ${picks.map((g, i) => {
                            const art = H.artworkSrc(g);
                            const title = H.escHtml(g.clean_name || g.filename);
                            return `
                                <div class="quiz-pick-card" style="animation-delay:${i * 0.2}s">
                                    <div class="quiz-pick-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</div>
                                    <div class="quiz-pick-art">
                                        ${art ? `<img src="${art}" alt="${title}">` : `<span class="no-art">${H.systemEmoji(g.system_id)}</span>`}
                                    </div>
                                    <div class="quiz-pick-info">
                                        <h3>${title}</h3>
                                        <p>${H.escHtml(g.system_name || g.system_id)}</p>
                                    </div>
                                    <div class="quiz-pick-actions">
                                        <button class="btn btn-yellow" onclick="window.arcade.playGame(${g.id})">▶ Play</button>
                                        <button class="btn btn-ghost btn-sm" onclick="Router.navigate('#/game/${g.id}')">Details</button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    <div style="text-align:center;margin-top:24px;">
                        <button class="btn btn-ghost" onclick="QuizView.render()">🔄 Try Again</button>
                    </div>
                </div>
            `;

            Confetti?.burst(window.innerWidth / 2, 100, 30);
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },
};
