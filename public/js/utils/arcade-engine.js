/**
 * ARCADE ENGINE — The RPG soul of Molly's World Arcade
 * Handles XP tracking, level-up animations, achievement toasts,
 * and the attract mode screensaver.
 */
window.ArcadeEngine = (() => {
    let idleTimer = null;
    const IDLE_TIMEOUT = 120000; // 2 min → attract mode

    // ── Active Player ──
    function getActivePlayer() {
        try {
            return JSON.parse(localStorage.getItem('arcade_active_player_info') || 'null');
        } catch { return null; }
    }

    // ── Award XP after an action ──
    async function award(action, romId = null, meta = {}) {
        const player = getActivePlayer();
        if (!player?.id) return null;
        try {
            const result = await API.post('/api/progression/action', {
                playerId: player.id, action, romId, meta,
            });
            // Show XP toast
            showXPToast(result.xp_gained, result.total_xp, result.level, result.level_title, result.xp_progress);
            // Level up?
            if (result.leveled_up) {
                await showLevelUp(result.level, result.level_title, result.level_badge, player);
            }
            // New achievements?
            if (result.new_achievements?.length) {
                for (const ach of result.new_achievements) {
                    await showAchievementToast(ach, player);
                }
            }
            return result;
        } catch (e) {
            console.warn('[ArcadeEngine] XP award failed:', e.message);
            return null;
        }
    }

    // ── XP Popup (subtle, bottom-right) ──
    function showXPToast(xpGained, totalXp, level, title, progress) {
        if (!xpGained) return;
        const el = document.createElement('div');
        el.className = 'xp-toast';
        el.innerHTML = `
            <div class="xp-toast-amount">+${xpGained} XP</div>
            <div class="xp-toast-bar">
                <div class="xp-toast-fill" style="width:${Math.round(progress * 100)}%"></div>
            </div>
            <div class="xp-toast-level">Lv.${level} ${title}</div>
        `;
        document.body.appendChild(el);
        setTimeout(() => {
            el.classList.add('exit');
            setTimeout(() => el.remove(), 400);
        }, 2500);
    }

    // ── LEVEL UP — Full-screen cinematic celebration ──
    function showLevelUp(level, title, badge, player) {
        return new Promise(resolve => {
            SFX?.levelUp?.();
            const overlay = document.createElement('div');
            overlay.className = 'levelup-overlay';
            overlay.innerHTML = `
                <div class="levelup-content">
                    <div class="levelup-flash"></div>
                    <div class="levelup-badge">${badge}</div>
                    <div class="levelup-text">LEVEL UP!</div>
                    <div class="levelup-level">Level ${level}</div>
                    <div class="levelup-title">${title}</div>
                    <div class="levelup-player">
                        <span style="color:${player.color}">${player.emoji} ${player.name}</span>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            // Trigger animation
            requestAnimationFrame(() => {
                overlay.classList.add('active');
                // Confetti explosion
                const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
                Confetti.burst(cx, cy, 100, { speed: 10, colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#A78BFA', '#F472B6'] });
                setTimeout(() => Confetti.rain(2000), 300);
                setTimeout(() => Confetti.emoji(cx, cy - 100, [badge, '⭐', '🎉', '✨'], 20), 500);
            });

            // Auto-dismiss after 4 seconds
            setTimeout(() => {
                overlay.classList.add('fade-out');
                setTimeout(() => { overlay.remove(); resolve(); }, 600);
            }, 4000);

            // Click to dismiss early
            overlay.addEventListener('click', () => {
                overlay.classList.add('fade-out');
                setTimeout(() => { overlay.remove(); resolve(); }, 300);
            });
        });
    }

    // ── Achievement Toast — Xbox-style slide-in ──
    function showAchievementToast(achievement, player) {
        return new Promise(resolve => {
            SFX?.achievement?.();
            const el = document.createElement('div');
            el.className = 'achievement-toast';
            el.innerHTML = `
                <div class="achievement-toast-icon">${achievement.icon}</div>
                <div class="achievement-toast-info">
                    <div class="achievement-toast-header">🏆 Achievement Unlocked!</div>
                    <div class="achievement-toast-title">${achievement.title}</div>
                    <div class="achievement-toast-desc">${achievement.desc}</div>
                </div>
            `;
            document.body.appendChild(el);

            // Small confetti burst at toast location
            setTimeout(() => {
                Confetti.burst(window.innerWidth - 180, window.innerHeight - 80, 25, { speed: 4 });
            }, 300);

            setTimeout(() => {
                el.classList.add('exit');
                setTimeout(() => { el.remove(); resolve(); }, 500);
            }, 4000);
        });
    }

    // ═══════════════════════════════════════════════════
    // ATTRACT MODE — The screensaver that draws you in
    // ═══════════════════════════════════════════════════
    let attractActive = false;

    // ── Multiple-Choice Trivia Questions ──
    const TRIVIA = [
        { q: "What was Mario's original name in Donkey Kong?",
          a: ["Jumpman", "Plumber Boy", "Mr. Video", "Little Italian"],
          correct: 0 },
        { q: "How many levels does the original Pac-Man have before the kill screen?",
          a: ["128", "256", "512", "999"],
          correct: 1 },
        { q: "What caused a coin shortage in Japan in 1978?",
          a: ["Donkey Kong", "Galaga", "Space Invaders", "Pong"],
          correct: 2 },
        { q: "Which game featured the first known video game Easter egg?",
          a: ["Pac-Man", "Adventure (Atari)", "Pitfall!", "Asteroids"],
          correct: 1 },
        { q: "What code first appeared in Gradius for NES in 1986?",
          a: ["The Konami Code", "The Capcom Trick", "IDDQD", "ABACABB"],
          correct: 0 },
        { q: "How many bytes of RAM did the Atari 2600 have?",
          a: ["64 bytes", "128 bytes", "256 bytes", "512 bytes"],
          correct: 1 },
        { q: "The PlayStation was originally designed as an add-on for which console?",
          a: ["Sega Genesis", "Super Nintendo", "Atari Jaguar", "Neo Geo"],
          correct: 1 },
        { q: "What was Tetris inventor Alexey Pajitnov's nationality?",
          a: ["Japanese", "American", "Russian", "German"],
          correct: 2 },
        { q: "Which gaming handheld famously survived a Gulf War bombing?",
          a: ["Atari Lynx", "Sega Game Gear", "Game Boy", "Neo Geo Pocket"],
          correct: 2 },
        { q: "What was Q*bert almost named instead?",
          a: ["@!#?@!", "Jumpy Joe", "Cube Dude", "Bouncer"],
          correct: 0 },
        { q: "Which game is credited as the first to have combo moves?",
          a: ["Mortal Kombat", "Street Fighter II", "Fatal Fury", "Tekken"],
          correct: 1 },
        { q: "What was the first console game to feature a battery save?",
          a: ["Super Mario Bros.", "Metroid", "The Legend of Zelda", "Dragon Quest"],
          correct: 2 },
        { q: "Why doesn't the NES Zapper work on modern TVs?",
          a: ["Wrong voltage", "No CRT scan lines", "Infrared interference", "Too fast refresh rate"],
          correct: 1 },
        { q: "Who created the Neo Geo hardware?",
          a: ["Sega", "Capcom", "SNK", "Konami"],
          correct: 2 },
        { q: "What year was the original Street Fighter released?",
          a: ["1985", "1987", "1989", "1991"],
          correct: 1 },
        { q: "What does 'NES' stand for?",
          a: ["Nintendo Entertainment System", "New Electronic System", "National Entertainment Set", "Nintendo Electric Station"],
          correct: 0 },
        { q: "Which Metal Slug game was the first in the series?",
          a: ["Metal Slug X", "Metal Slug", "Metal Slug 2", "Super Vehicle-001"],
          correct: 1 },
        { q: "What company made the TurboGrafx-16?",
          a: ["Sega", "NEC", "Atari", "Bandai"],
          correct: 1 },
        { q: "How many buttons does an original NES controller have?",
          a: ["4", "6", "8", "10"],
          correct: 2 },
        { q: "What was Sega's last home console?",
          a: ["Saturn", "Dreamcast", "Genesis 2", "Master System II"],
          correct: 1 },
        { q: "Which arcade game was the highest-grossing of all time by 1982?",
          a: ["Donkey Kong", "Pac-Man", "Space Invaders", "Asteroids"],
          correct: 1 },
        { q: "The Game Boy Advance was released in what year?",
          a: ["1999", "2000", "2001", "2002"],
          correct: 2 },
        { q: "What was the name of the Atari 2600's predecessor?",
          a: ["Atari 1600", "Atari Pong", "Atari VCS", "Atari 800"],
          correct: 2 },
        { q: "Which company developed Bubble Bobble?",
          a: ["Namco", "Taito", "Konami", "Capcom"],
          correct: 1 },
        { q: "How many fighters were in the original Street Fighter II roster?",
          a: ["6", "8", "10", "12"],
          correct: 1 },
        { q: "What was the first commercially sold video game console?",
          a: ["Atari 2600", "Magnavox Odyssey", "ColecoVision", "Intellivision"],
          correct: 1 },
        { q: "What color is the ghost Blinky in Pac-Man?",
          a: ["Pink", "Blue", "Orange", "Red"],
          correct: 3 },
        { q: "Which King of Fighters game is considered the series peak by fans?",
          a: ["KOF '97", "KOF '98", "KOF 2002", "KOF XIII"],
          correct: 1 },
        { q: "What does 'RPG' stand for in gaming?",
          a: ["Rocket Propelled Grenade", "Role-Playing Game", "Random Player Generator", "Real Player Graphics"],
          correct: 1 },
        { q: "Which Samurai Shodown game introduced Ukyo Tachibana?",
          a: ["Samurai Shodown", "Samurai Shodown II", "Samurai Shodown III", "Samurai Shodown IV"],
          correct: 0 },
    ];

    function startAttractMode() {
        if (attractActive) return;
        // Don't activate during game play — check if overlay is visible (display not explicitly 'none')
        const po = document.getElementById('playerOverlay');
        if (po && po.style.display !== 'none') return;

        attractActive = true;
        const overlay = document.createElement('div');
        overlay.id = 'attractOverlay';
        overlay.className = 'attract-overlay';
        overlay.innerHTML = `
            <div class="attract-content">
                <div class="attract-marquee">🕹️ ${(() => { const p = getActivePlayer(); if (!p) return 'YOUR WORLD ARCADE'; const n = p.name.toUpperCase(); return (n.endsWith('S') ? n + "'" : n + "'S") + ' WORLD ARCADE'; })()} 🕹️</div>
                <div class="attract-timer-ring" id="attractTimerRing">
                    <svg viewBox="0 0 120 120" class="attract-ring-svg">
                        <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="4"/>
                        <circle cx="60" cy="60" r="52" fill="none" stroke="#a855f7" stroke-width="4" id="attractRingFill"
                            stroke-dasharray="${2 * Math.PI * 52}" stroke-dashoffset="0"
                            stroke-linecap="round" transform="rotate(-90 60 60)"/>
                    </svg>
                    <div class="attract-timer-num" id="attractTimerNum">15</div>
                </div>
                <div class="attract-trivia" id="attractTrivia">
                    <div class="trivia-question" id="triviaQ"></div>
                    <div class="trivia-options" id="triviaOpts"></div>
                    <div class="trivia-result" id="triviaResult"></div>
                </div>
                <div class="attract-prompt">
                    <span class="attract-blink">▶ TAP ANYWHERE TO PLAY ◀</span>
                </div>
            </div>
            <div class="attract-scanlines"></div>
        `;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('active'));

        // ── Multiple-Choice Trivia Engine ──
        const triviaQ = overlay.querySelector('#triviaQ');
        const triviaOpts = overlay.querySelector('#triviaOpts');
        const triviaResult = overlay.querySelector('#triviaResult');
        const shuffled = [...TRIVIA].sort(() => Math.random() - 0.5);
        let triviaIdx = 0;
        let triviaLocked = false;

        function showTrivia() {
            const t = shuffled[triviaIdx % shuffled.length];
            triviaLocked = false;
            triviaResult.textContent = '';
            triviaResult.className = 'trivia-result';
            triviaQ.textContent = `🧠 ${t.q}`;
            triviaQ.style.opacity = '0';
            triviaOpts.style.opacity = '0';
            setTimeout(() => {
                triviaQ.style.opacity = '1';
                const labels = ['A', 'B', 'C', 'D'];
                triviaOpts.innerHTML = t.a.map((ans, i) => `
                    <button class="trivia-btn" data-idx="${i}">
                        <span class="trivia-label">${labels[i]}</span>
                        <span class="trivia-text">${ans}</span>
                    </button>
                `).join('');
                triviaOpts.style.opacity = '1';

                // Add click + touch handlers (touch stops dismiss on iPad)
                triviaOpts.querySelectorAll('.trivia-btn').forEach(btn => {
                    btn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation(); // Don't dismiss attract mode
                        if (triviaLocked) return;
                        triviaLocked = true;
                        const picked = parseInt(btn.dataset.idx);
                        const isCorrect = picked === t.correct;

                        // Highlight correct/wrong
                        triviaOpts.querySelectorAll('.trivia-btn').forEach((b, idx) => {
                            if (idx === t.correct) b.classList.add('correct');
                            if (idx === picked && !isCorrect) b.classList.add('wrong');
                            b.classList.add('revealed');
                        });

                        triviaResult.textContent = isCorrect ? '✅ Correct!' : `❌ The answer is ${labels[t.correct]}: ${t.a[t.correct]}`;
                        triviaResult.className = `trivia-result ${isCorrect ? 'correct' : 'wrong'}`;

                        // Reset timer — show answer for 8 seconds then advance
                        clearTimeout(triviaTimer);
                        clearInterval(countdownInterval);
                        startCountdown(8);
                        triviaTimer = setTimeout(() => { triviaIdx++; showTrivia(); scheduleNext(); }, 8000);
                    });
                });
            }, 400);
        }

        let triviaTimer;
        const TRIVIA_INTERVAL = 15; // seconds between auto-advance
        const circumference = 2 * Math.PI * 52;
        const ringFill = overlay.querySelector('#attractRingFill');
        const timerNum = overlay.querySelector('#attractTimerNum');
        let countdownLeft = TRIVIA_INTERVAL;
        let countdownInterval = null;

        function startCountdown(seconds) {
            countdownLeft = seconds;
            if (timerNum) timerNum.textContent = countdownLeft;
            if (ringFill) ringFill.style.strokeDashoffset = '0';
            clearInterval(countdownInterval);
            countdownInterval = setInterval(() => {
                countdownLeft--;
                if (timerNum) timerNum.textContent = Math.max(0, countdownLeft);
                if (ringFill) {
                    const progress = 1 - (countdownLeft / seconds);
                    ringFill.style.strokeDashoffset = (circumference * progress).toFixed(1);
                }
                if (countdownLeft <= 3 && timerNum) timerNum.classList.add('attract-timer-urgent');
                if (countdownLeft <= 0) {
                    clearInterval(countdownInterval);
                    if (timerNum) timerNum.classList.remove('attract-timer-urgent');
                }
            }, 1000);
        }

        function scheduleNext() {
            clearTimeout(triviaTimer);
            startCountdown(TRIVIA_INTERVAL);
            triviaTimer = setTimeout(() => { triviaIdx++; showTrivia(); scheduleNext(); }, TRIVIA_INTERVAL * 1000);
        }
        showTrivia();
        scheduleNext();

        // Artwork removed — clean wait screen

        // Dismiss on any interaction
        function dismiss() {
            clearTimeout(triviaTimer);
            clearInterval(countdownInterval);
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 500);
            attractActive = false;
            resetIdleTimer();
            document.removeEventListener('keydown', dismiss);
            document.removeEventListener('click', dismissOnClick);
            document.removeEventListener('mousemove', dismissOnMove);
            document.removeEventListener('touchstart', dismissOnTouch);
        }
        let moveCount = 0;
        function dismissOnMove() {
            moveCount++;
            if (moveCount > 3) dismiss(); // need deliberate movement
        }
        function dismissOnClick(e) {
            // Don't dismiss if clicking trivia buttons or trivia area
            if (e.target.closest('.trivia-btn, .attract-trivia')) return;
            dismiss();
        }
        function dismissOnTouch(e) {
            if (e.target.closest('.trivia-btn, .attract-trivia')) return;
            dismiss();
        }
        setTimeout(() => {
            document.addEventListener('keydown', dismiss, { once: true });
            document.addEventListener('click', dismissOnClick);
            document.addEventListener('mousemove', dismissOnMove);
            document.addEventListener('touchstart', dismissOnTouch);
        }, 500);
    }

    async function loadAttractArtwork(container) {
        if (!container) return;
        try {
            const game = await API.randomGame();
            if (!game) return;
            const art = game.artwork_path || game.artwork_url;
            const title = game.title || game.clean_name || 'Unknown';
            container.style.opacity = '0';
            setTimeout(() => {
                container.innerHTML = art
                    ? `<img src="${art.startsWith('http') ? art : '/artwork/' + art}" alt="${title}"
                         onerror="this.parentNode.innerHTML='<div class=\\'attract-no-art\\'>${game.system_id?.toUpperCase() || '🎮'}</div>'" />
                       <div class="attract-game-title">${title}</div>`
                    : `<div class="attract-no-art">🎮</div><div class="attract-game-title">${title}</div>`;
                container.style.opacity = '1';
            }, 300);
        } catch {}
    }

    // ── Idle Timer Management ──
    function resetIdleTimer() {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => startAttractMode(), IDLE_TIMEOUT);
    }

    function initIdleTracking() {
        ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(evt => {
            document.addEventListener(evt, () => {
                if (!attractActive) resetIdleTimer();
            }, { passive: true });
        });
        resetIdleTimer();
    }

    // ── Init ──
    function init() {
        initIdleTracking();
        // Update XP bar in sidebar if player is set
        updateSidebarXP();
    }

    async function updateSidebarXP() {
        const player = getActivePlayer();
        const container = document.getElementById('sidebarXP');
        if (!player?.id || !container) return;
        try {
            const data = await API.get(`/api/progression/${player.id}`);
            container.innerHTML = `
                <div class="sidebar-xp-row">
                    <span class="sidebar-xp-level" title="${data.level_title}">
                        ${data.level_badge} Lv.${data.level}
                    </span>
                    <span class="sidebar-xp-title">${data.level_title}</span>
                </div>
                <div class="sidebar-xp-bar">
                    <div class="sidebar-xp-fill" style="width:${Math.round(data.xp_progress * 100)}%"></div>
                </div>
                <div class="sidebar-xp-text">${data.xp} / ${data.next_xp} XP</div>
            `;
            container.style.display = '';
        } catch {
            container.style.display = 'none';
        }
    }

    return {
        init,
        award,
        getActivePlayer,
        updateSidebarXP,
        showLevelUp,
        showAchievementToast,
        startAttractMode,
        resetIdleTimer,
    };
})();
