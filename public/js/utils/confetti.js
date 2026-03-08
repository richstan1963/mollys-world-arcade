/* Confetti & Particle Effects — Zero-dependency canvas celebration system */
window.Confetti = (() => {
    let canvas, ctx, particles = [], animId = null;

    function ensureCanvas() {
        if (canvas) return;
        canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;';
        document.body.appendChild(canvas);
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
    }

    function resize() {
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function animate() {
        if (!ctx || particles.length === 0) {
            if (animId) { cancelAnimationFrame(animId); animId = null; }
            if (canvas) { canvas.style.opacity = '0'; }
            return;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.opacity = '1';

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.rotation += p.rotationSpeed;
            p.life -= p.decay;

            if (p.life <= 0 || p.y > canvas.height + 20) {
                particles.splice(i, 1);
                continue;
            }

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.globalAlpha = Math.min(1, p.life * 2);

            if (p.shape === 'star') {
                drawStar(ctx, 0, 0, 5, p.size, p.size * 0.5, p.color);
            } else if (p.shape === 'circle') {
                ctx.beginPath();
                ctx.arc(0, 0, p.size, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.fill();
            } else if (p.shape === 'emoji') {
                ctx.font = `${p.size * 3}px serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(p.emoji, 0, 0);
            } else {
                // Rectangle confetti
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size * 1.5 / 2, p.size, p.size * 1.5);
            }

            ctx.restore();
        }

        animId = requestAnimationFrame(animate);
    }

    function drawStar(ctx, cx, cy, spikes, outerR, innerR, color) {
        let rot = Math.PI / 2 * 3, step = Math.PI / spikes;
        ctx.beginPath();
        ctx.moveTo(cx, cy - outerR);
        for (let i = 0; i < spikes; i++) {
            ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
            rot += step;
            ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
            rot += step;
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }

    const COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A78BFA', '#F472B6', '#38BDF8', '#34D399', '#FB923C'];

    function burst(x, y, count = 50, opts = {}) {
        ensureCanvas();
        const spread = opts.spread || 360;
        const speed = opts.speed || 8;
        const shapes = opts.shapes || ['rect', 'circle', 'star'];
        const colors = opts.colors || COLORS;

        for (let i = 0; i < count; i++) {
            const angle = (Math.random() * spread - spread / 2) * (Math.PI / 180) - Math.PI / 2;
            const v = Math.random() * speed + 2;
            particles.push({
                x, y,
                vx: Math.cos(angle) * v + (Math.random() - 0.5) * 2,
                vy: Math.sin(angle) * v,
                size: Math.random() * 5 + 3,
                color: colors[Math.floor(Math.random() * colors.length)],
                shape: shapes[Math.floor(Math.random() * shapes.length)],
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.2,
                gravity: 0.12,
                life: 1,
                decay: 0.008 + Math.random() * 0.008,
            });
        }

        if (!animId) animate();
    }

    function rain(duration = 3000) {
        ensureCanvas();
        const end = Date.now() + duration;

        function addWave() {
            if (Date.now() > end) return;
            for (let i = 0; i < 5; i++) {
                particles.push({
                    x: Math.random() * canvas.width,
                    y: -10,
                    vx: (Math.random() - 0.5) * 2,
                    vy: Math.random() * 3 + 2,
                    size: Math.random() * 5 + 3,
                    color: COLORS[Math.floor(Math.random() * COLORS.length)],
                    shape: ['rect', 'circle', 'star'][Math.floor(Math.random() * 3)],
                    rotation: Math.random() * Math.PI * 2,
                    rotationSpeed: (Math.random() - 0.5) * 0.15,
                    gravity: 0.05,
                    life: 1,
                    decay: 0.003,
                });
            }
            if (!animId) animate();
            setTimeout(addWave, 80);
        }
        addWave();
    }

    function emoji(x, y, emojis = ['🎉', '🏆', '⭐', '🔥'], count = 15) {
        ensureCanvas();
        for (let i = 0; i < count; i++) {
            const angle = (Math.random() * 360 - 180) * (Math.PI / 180) - Math.PI / 2;
            const v = Math.random() * 6 + 3;
            particles.push({
                x, y,
                vx: Math.cos(angle) * v,
                vy: Math.sin(angle) * v,
                size: Math.random() * 6 + 4,
                color: '#fff',
                shape: 'emoji',
                emoji: emojis[Math.floor(Math.random() * emojis.length)],
                rotation: 0,
                rotationSpeed: (Math.random() - 0.5) * 0.1,
                gravity: 0.1,
                life: 1,
                decay: 0.006,
            });
        }
        if (!animId) animate();
    }

    // Pre-built celebration combos
    function celebrate() {
        const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
        burst(cx, cy, 80);
        SFX?.coin();
        setTimeout(() => rain(2000), 200);
    }

    function achievement(playerEmoji = '🏆') {
        const cx = window.innerWidth / 2, cy = window.innerHeight / 3;
        emoji(cx, cy, [playerEmoji, '🏆', '⭐', '🎉'], 20);
        burst(cx, cy, 40, { speed: 5 });
    }

    function highScore() {
        const cx = window.innerWidth / 2, cy = window.innerHeight / 3;
        emoji(cx, cy, ['🏆', '👑', '🥇', '💯'], 25);
        burst(cx, cy, 60, { colors: ['#FFD700', '#FFA500', '#FF6347', '#FFE66D'] });
    }

    function streakMilestone(days) {
        const cx = window.innerWidth / 2, cy = window.innerHeight / 3;
        const fires = ['🔥', '🔥', '🔥', '💪', '⚡'];
        emoji(cx, cy, fires, 20);
        burst(cx, cy, 50, { colors: ['#FF6B6B', '#FF8C42', '#FFD700', '#FF4500'] });
    }

    return { burst, rain, emoji, celebrate, achievement, highScore, streakMilestone };
})();
