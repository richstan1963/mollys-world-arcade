/* ═══════════════════════════════════════════════════════════
   Themed Reward — Game Over celebration screen
   Uses player's theme for score currency, icons, and colors
   ═══════════════════════════════════════════════════════════ */
window.MollyPopsReward = {
    show(result, game, onAwardXP) {
        const container = document.getElementById('emulator-container');
        const goDiv = document.createElement('div');
        goDiv.className = 'original-gameover mollypops-gameover';

        // ── Get active theme ──
        let th = null;
        try {
            const pi = JSON.parse(localStorage.getItem('arcade_active_player_info') || 'null');
            if (pi && pi.theme && typeof ArcadeThemes !== 'undefined') {
                th = ArcadeThemes.get(pi.theme);
            }
        } catch {}
        if (!th && typeof ArcadeThemes !== 'undefined') th = ArcadeThemes.get('retro');

        const scoreCurrency = th ? th.scoreName : 'Points';
        const scoreEmoji = th ? th.scoreIcon : '🏆';
        const themeIcon = th ? th.icon : '🎮';
        const themeColors = th ? th.colors : ['#F43F5E', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#06B6D4'];
        const themeParticles = th ? th.particleEmoji : ['⭐', '✨', '🎉', '💎'];

        // ── Reward Tier ──
        const score = result.score || 0;
        const popsEarned = Math.max(1, Math.floor(score / 100));
        let tier, tierLabel, tierGlow;
        if (score >= 10000) { tier = 'rainbow'; tierLabel = '🌈 RAINBOW'; tierGlow = '#FFD700'; }
        else if (score >= 5000) { tier = 'gold'; tierLabel = '🥇 GOLD'; tierGlow = '#FFD700'; }
        else if (score >= 2000) { tier = 'silver'; tierLabel = '🥈 SILVER'; tierGlow = '#C0C0C0'; }
        else if (score >= 500) { tier = 'bronze'; tierLabel = '🥉 BRONZE'; tierGlow = '#CD7F32'; }
        else { tier = 'starter'; tierLabel = `${themeIcon} NICE START`; tierGlow = '#FF69B4'; }

        const mins = Math.floor((result.duration || 0) / 60);
        const secs = (result.duration || 0) % 60;
        const timeStr = `${mins}:${String(secs).padStart(2, '0')}`;

        // Emoji rain using theme particles
        let emojiRainHTML = '';
        for (let i = 0; i < 20; i++) {
            const emoji = themeParticles[Math.floor(Math.random() * themeParticles.length)];
            const left = Math.random() * 100;
            const delay = Math.random() * 3;
            const dur = 2.5 + Math.random() * 3;
            const size = 28 + Math.random() * 24;
            emojiRainHTML += `<span class="mp-rain-emoji" style="left:${left}%;animation-delay:${delay}s;animation-duration:${dur}s;font-size:${size}px">${emoji}</span>`;
        }

        // Floating sparkle emojis
        let starsHTML = '';
        const starCount = tier === 'rainbow' ? 8 : tier === 'gold' ? 6 : tier === 'silver' ? 4 : tier === 'bronze' ? 3 : 2;
        for (let i = 0; i < starCount; i++) {
            const emoji = themeParticles[Math.floor(Math.random() * themeParticles.length)];
            const left = 10 + Math.random() * 80;
            const top = 5 + Math.random() * 30;
            const delay = Math.random() * 2;
            starsHTML += `<span class="mp-float-star-emoji" style="left:${left}%;top:${top}%;animation-delay:${delay}s;font-size:28px">${emoji}</span>`;
        }

        goDiv.innerHTML = `
            <div class="mp-rain-container">${emojiRainHTML}</div>
            <div class="mp-stars-container">${starsHTML}</div>
            <div class="mp-gameover-content">
                <div class="mp-tier-badge mp-tier-${tier}">
                    <span class="mp-hero-emoji">${themeIcon}</span>
                </div>
                <div class="mp-title">${scoreCurrency} Earned!</div>
                <div class="mp-pops-count" data-target="${popsEarned}">
                    <span class="mp-pops-number">0</span>
                    <span class="mp-pops-label">${scoreEmoji}</span>
                </div>
                <div class="mp-tier-label" style="--tier-glow:${tierGlow}">${tierLabel}</div>
                <div class="mp-score-display">${score.toLocaleString()} pts</div>
                <div class="mp-stats-row">
                    <div class="mp-stat">
                        <span class="mp-stat-emoji">⭐</span>
                        <span class="mp-stat-val">Lv.${result.level || 1}</span>
                    </div>
                    <div class="mp-stat">
                        <span class="mp-stat-emoji">${scoreEmoji}</span>
                        <span class="mp-stat-val">${(result.totalPopped || result.linesCleared || result.bricksSmashed || result.asteroidsDestroyed || result.fliesSwatted || result.citiesSaved || 0).toLocaleString()}</span>
                    </div>
                    <div class="mp-stat">
                        <span class="mp-stat-emoji">🔥</span>
                        <span class="mp-stat-val">×${result.maxCombo || result.maxChain || 1}</span>
                    </div>
                    <div class="mp-stat">
                        <span class="mp-stat-emoji">⏱️</span>
                        <span class="mp-stat-val">${timeStr}</span>
                    </div>
                </div>
                <div class="mp-actions">
                    <button class="mp-play-again" onclick="arcade.restartOriginal()">
                        ${themeIcon} Play Again
                    </button>
                    <button class="mp-exit" onclick="arcade.exitOriginal()">← Exit</button>
                </div>
            </div>
        `;
        container.appendChild(goDiv);

        // ── Animate the reward counter ──
        setTimeout(() => {
            const numEl = goDiv.querySelector('.mp-pops-number');
            if (numEl) {
                let current = 0;
                const step = Math.max(1, Math.ceil(popsEarned / 40));
                const interval = setInterval(() => {
                    current = Math.min(current + step, popsEarned);
                    numEl.textContent = current.toLocaleString();
                    if (current >= popsEarned) clearInterval(interval);
                }, 30);
            }
        }, 600);

        // ── Confetti burst (themed) ──
        setTimeout(() => {
            if (window.Confetti) {
                const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
                if (tier === 'rainbow') {
                    Confetti.burst(cx, cy, 80, { speed: 10, colors: themeColors });
                    setTimeout(() => Confetti.rain(3000), 200);
                    setTimeout(() => Confetti.emoji(cx, cy - 80, [...themeParticles, '🎉', '✨'], 25), 400);
                } else if (tier === 'gold') {
                    Confetti.burst(cx, cy, 60, { speed: 8, colors: themeColors.slice(0,4) });
                    setTimeout(() => Confetti.emoji(cx, cy - 80, [...themeParticles.slice(0,2), '🥇', '✨'], 15), 300);
                } else if (tier === 'silver') {
                    Confetti.burst(cx, cy, 40, { speed: 6 });
                    setTimeout(() => Confetti.emoji(cx, cy - 60, [themeParticles[0], '🥈', '✨'], 10), 300);
                } else {
                    Confetti.burst(cx, cy, 20, { speed: 4 });
                }
            }
            if (tier === 'rainbow' || tier === 'gold') SFX?.achievement?.();
            else SFX?.levelUp?.();
        }, 400);

        // Award XP via callback
        if (onAwardXP) {
            setTimeout(() => onAwardXP(result, popsEarned), 1500);
        }
    },
};
