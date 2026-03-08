/* Your World Arcade — Player Theme System
   Premade visual themes that customize Arcade Originals per player */

window.ArcadeThemes = {

    // ── 10 Premade Themes ──────────────────────────────────────────
    themes: {
        candy: {
            id: 'candy',
            name: 'Candy Land',
            icon: '🍭',
            description: 'Sweet lollipops, gummies & candy colors',
            colors: ['#F43F5E', '#EC4899', '#F472B6', '#FB923C', '#FBBF24', '#A78BFA'],
            blockEmoji: ['🍬', '🍭', '🧁', '🍩', '🍫', '🍪', '🍡'],
            blockStyle: 'round',     // round = lollipop shapes
            popSound: 'pop',         // bubbly pop
            bgGradient: ['#2D1B3D', '#1A0B2E'],
            particleEmoji: ['🍬', '🍭', '🍡', '✨'],
            scoreName: 'Treats',     // themed score currency
            scoreIcon: '🍭',
            popWords: ['Sweet!', 'Yummy!', 'Delicious!', 'Sugar Rush!'],
            gameNames: { mollypop: 'Pop', tictacmae: 'Tic', maetris: 'Stack', maeteoroids: 'Blast', maekout: 'Break', flappymae: 'Flap', pacmae: 'Chomp', mollypong: 'Pong', molliped: 'Crawl', mollycontrol: 'Guard' }
        },
        racing: {
            id: 'racing',
            name: 'Speed Racer',
            icon: '🚗',
            description: 'Fast cars, checkered flags & nitro boost',
            colors: ['#EF4444', '#3B82F6', '#FBBF24', '#22C55E', '#F97316', '#8B5CF6'],
            blockEmoji: ['🏎️', '🚗', '🏁', '🛞', '⛽', '🚦', '🔧'],
            blockStyle: 'sharp',
            popSound: 'vroom',
            bgGradient: ['#1A1A2E', '#16213E'],
            particleEmoji: ['🏎️', '💨', '🏁', '⚡'],
            scoreName: 'Laps',
            scoreIcon: '🏁',
            popWords: ['Vroom!', 'Nitro!', 'Turbo!', 'Speed Boost!'],
            gameNames: { mollypop: 'Crash', tictacmae: 'Race', maetris: 'Drift', maeteoroids: 'Turbo', maekout: 'Smash', flappymae: 'Fly', pacmae: 'Dash', mollypong: 'Rally', molliped: 'Chase', mollycontrol: 'Nitro' }
        },
        garden: {
            id: 'garden',
            name: 'Secret Garden',
            icon: '🌸',
            description: 'Flowers, butterflies & nature vibes',
            colors: ['#EC4899', '#F9A8D4', '#A78BFA', '#34D399', '#86EFAC', '#FDE68A'],
            blockEmoji: ['🌸', '🌺', '🌻', '🌷', '🦋', '🌹', '🌼'],
            blockStyle: 'round',
            popSound: 'chime',
            bgGradient: ['#1A2E1A', '#0B2E1A'],
            particleEmoji: ['🌸', '🦋', '🌺', '🌿'],
            scoreName: 'Blooms',
            scoreIcon: '🌸',
            popWords: ['Bloom!', 'Beautiful!', 'Gorgeous!', 'Garden Party!'],
            gameNames: { mollypop: 'Bloom', tictacmae: 'Grow', maetris: 'Petals', maeteoroids: 'Comet', maekout: 'Bounce', flappymae: 'Flutter', pacmae: 'Trail', mollypong: 'Pong', molliped: 'Vine', mollycontrol: 'Guard' }
        },
        dinos: {
            id: 'dinos',
            name: 'Dino World',
            icon: '🦖',
            description: 'Dinosaurs, volcanoes & prehistoric power',
            colors: ['#22C55E', '#84CC16', '#EAB308', '#F97316', '#A16207', '#7C3AED'],
            blockEmoji: ['🦖', '🦕', '🌋', '🦴', '🥚', '🪨', '🐾'],
            blockStyle: 'jagged',
            popSound: 'roar',
            bgGradient: ['#1C2E0B', '#2E1A0B'],
            particleEmoji: ['🦖', '🌋', '🦴', '🥚'],
            scoreName: 'Fossils',
            scoreIcon: '🦴',
            popWords: ['RAWR!', 'Stomp!', 'Dino Smash!', 'Extinction!'],
            gameNames: { mollypop: 'Stomp', tictacmae: 'Claw', maetris: 'Rex', maeteoroids: 'Meteor', maekout: 'Smash', flappymae: 'Fly', pacmae: 'Chomp', mollypong: 'Pong', molliped: 'Hunt', mollycontrol: 'Roar' }
        },
        lightning: {
            id: 'lightning',
            name: 'Thunder Strike',
            icon: '⚡',
            description: 'Electric bolts, storms & pure energy',
            colors: ['#FBBF24', '#F59E0B', '#38BDF8', '#818CF8', '#E879F9', '#F472B6'],
            blockEmoji: ['⚡', '🌩️', '💥', '🔋', '✨', '💫', '🌟'],
            blockStyle: 'sharp',
            popSound: 'zap',
            bgGradient: ['#0C1220', '#1E1B4B'],
            particleEmoji: ['⚡', '💥', '🌩️', '✨'],
            scoreName: 'Volts',
            scoreIcon: '⚡',
            popWords: ['ZAP!', 'SHOCK!', 'Thunder!', 'Power Surge!'],
            gameNames: { mollypop: 'Zap', tictacmae: 'Shock', maetris: 'Bolt', maeteoroids: 'Storm', maekout: 'Strike', flappymae: 'Flash', pacmae: 'Dash', mollypong: 'Pong', molliped: 'Surge', mollycontrol: 'Thunder' }
        },
        space: {
            id: 'space',
            name: 'Deep Space',
            icon: '🚀',
            description: 'Planets, stars, rockets & the cosmos',
            colors: ['#6366F1', '#8B5CF6', '#06B6D4', '#14B8A6', '#F43F5E', '#FBBF24'],
            blockEmoji: ['🚀', '⭐', '🪐', '☄️', '🛸', '🌙', '👽'],
            blockStyle: 'round',
            popSound: 'laser',
            bgGradient: ['#030712', '#0F172A'],
            particleEmoji: ['🚀', '⭐', '🪐', '☄️'],
            scoreName: 'Stars',
            scoreIcon: '⭐',
            popWords: ['Blast Off!', 'Cosmic!', 'Stellar!', 'Supernova!'],
            gameNames: { mollypop: 'Blast', tictacmae: 'Star', maetris: 'Orbit', maeteoroids: 'Nova', maekout: 'Launch', flappymae: 'Float', pacmae: 'Warp', mollypong: 'Pong', molliped: 'Crawler', mollycontrol: 'Command' }
        },
        retro: {
            id: 'retro',
            name: 'Retro Arcade',
            icon: '🎮',
            description: 'Pixel art, classic neon & old-school vibes',
            colors: ['#F43F5E', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#06B6D4'],
            blockEmoji: ['👾', '🕹️', '💎', '🔶', '🟣', '🟢', '🔴'],
            blockStyle: 'pixel',
            popSound: 'pop',
            bgGradient: ['#0A0A1A', '#1A0A2E'],
            particleEmoji: ['👾', '🕹️', '💎', '⭐'],
            scoreName: 'Points',
            scoreIcon: '🕹️',
            popWords: ['Nice!', 'Radical!', 'Awesome!', 'High Score!'],
            gameNames: { mollypop: 'Pop', tictacmae: 'Tic', maetris: 'Stack', maeteoroids: 'Blast', maekout: 'Break', flappymae: 'Flap', pacmae: 'Chase', mollypong: 'Pong', molliped: 'Bug', mollycontrol: 'Guard' }
        },
        fantasy: {
            id: 'fantasy',
            name: 'Magic Kingdom',
            icon: '🦄',
            description: 'Unicorns, rainbows, magic & sparkles',
            colors: ['#E879F9', '#C084FC', '#818CF8', '#F9A8D4', '#67E8F9', '#FDE68A'],
            blockEmoji: ['🦄', '✨', '🌈', '💫', '🧚', '🔮', '👑'],
            blockStyle: 'round',
            popSound: 'sparkle',
            bgGradient: ['#1E0B3D', '#2D1B4E'],
            particleEmoji: ['🦄', '✨', '🌈', '💫'],
            scoreName: 'Sparkles',
            scoreIcon: '✨',
            popWords: ['Magic!', 'Enchanted!', 'Legendary!', 'Fairy Dust!'],
            gameNames: { mollypop: 'Sparkle', tictacmae: 'Magic', maetris: 'Crystal', maeteoroids: 'Comet', maekout: 'Bounce', flappymae: 'Wings', pacmae: 'Quest', mollypong: 'Pong', molliped: 'Spell', mollycontrol: 'Shield' }
        },
        fire: {
            id: 'fire',
            name: 'Inferno',
            icon: '🔥',
            description: 'Flames, lava, explosions & heat',
            colors: ['#EF4444', '#F97316', '#FBBF24', '#DC2626', '#B91C1C', '#F59E0B'],
            blockEmoji: ['🔥', '💥', '🌋', '☄️', '💣', '🧨', '⚡'],
            blockStyle: 'jagged',
            popSound: 'explosion',
            bgGradient: ['#1C0A0A', '#2E0A0A'],
            particleEmoji: ['🔥', '💥', '🌋', '☄️'],
            scoreName: 'Flames',
            scoreIcon: '🔥',
            popWords: ['BURN!', 'BOOM!', 'Inferno!', 'Scorched!'],
            gameNames: { mollypop: 'Blaze', tictacmae: 'Flame', maetris: 'Melt', maeteoroids: 'Meteor', maekout: 'Scorch', flappymae: 'Soar', pacmae: 'Burn', mollypong: 'Pong', molliped: 'Ember', mollycontrol: 'Inferno' }
        },
        ocean: {
            id: 'ocean',
            name: 'Ocean Deep',
            icon: '🌊',
            description: 'Waves, sea creatures & underwater adventure',
            colors: ['#06B6D4', '#0EA5E9', '#38BDF8', '#22D3EE', '#2DD4BF', '#6366F1'],
            blockEmoji: ['🌊', '🐠', '🐚', '🦀', '🐙', '🐡', '🦈'],
            blockStyle: 'round',
            popSound: 'bubble',
            bgGradient: ['#0A1628', '#0B2545'],
            particleEmoji: ['🌊', '🐠', '🐚', '💎'],
            scoreName: 'Pearls',
            scoreIcon: '🐚',
            popWords: ['Splash!', 'Wave!', 'Dive Deep!', 'Tidal Wave!'],
            gameNames: { mollypop: 'Splash', tictacmae: 'Reef', maetris: 'Tide', maeteoroids: 'Depth', maekout: 'Wave', flappymae: 'Fin', pacmae: 'Current', mollypong: 'Pong', molliped: 'Dive', mollycontrol: 'Trident' }
        }
    },

    // ── Get a theme by ID (fallback to retro) ──
    get(themeId) {
        return this.themes[themeId] || this.themes.retro;
    },

    // ── Get all themes as array ──
    all() {
        return Object.values(this.themes);
    },

    // ── Generate a player-specific game name ──
    //    e.g. "MollyPop", "JRo Blast", "Lylah Sparkle"
    gameName(playerName, themeId, gameType) {
        const theme = this.get(themeId);
        const suffix = theme.gameNames[gameType] || 'Pop';
        // Short names (≤5 chars) get concatenated: "MollyPop"
        // Longer names get spaced: "Walkerman Crash"
        if (playerName.length <= 5) {
            return playerName + suffix;
        }
        return playerName + ' ' + suffix;
    },

    // ── Get themed score currency name ──
    scoreName(themeId) {
        return this.get(themeId).scoreName || 'Points';
    },

    // ── Get themed score icon ──
    scoreIcon(themeId) {
        return this.get(themeId).scoreIcon || '🏆';
    },

    // ── Get themed colors for a game ──
    colors(themeId) {
        return this.get(themeId).colors;
    },

    // ── Get the active player's theme (from localStorage cache) ──
    activeTheme() {
        try {
            const info = JSON.parse(localStorage.getItem('arcade_active_player_info') || 'null');
            if (info && info.theme) return this.get(info.theme);
        } catch {}
        return this.themes.retro; // Default for guests
    },

    // ── Color helpers (shared across all game engines) ──
    lighten(hex, pct) {
        const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        const nr = Math.min(255, r + Math.round((255-r)*pct/100));
        const ng = Math.min(255, g + Math.round((255-g)*pct/100));
        const nb = Math.min(255, b + Math.round((255-b)*pct/100));
        return `#${nr.toString(16).padStart(2,'0')}${ng.toString(16).padStart(2,'0')}${nb.toString(16).padStart(2,'0')}`;
    },
    darken(hex, pct) {
        const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        const nr = Math.max(0, Math.round(r*(1-pct/100)));
        const ng = Math.max(0, Math.round(g*(1-pct/100)));
        const nb = Math.max(0, Math.round(b*(1-pct/100)));
        return `#${nr.toString(16).padStart(2,'0')}${ng.toString(16).padStart(2,'0')}${nb.toString(16).padStart(2,'0')}`;
    },

    // ── Build block colors from theme (used by multiple games) ──
    buildBlockColors(themeId) {
        const t = this.get(themeId);
        return t.colors.map((hex, i) => ({
            hex,
            light: this.lighten(hex, 30),
            dark: this.darken(hex, 20),
            emoji: (t.blockEmoji && t.blockEmoji[i]) || '🔶'
        }));
    }
};
