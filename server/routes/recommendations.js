import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// GET /trending — most played games recently (no auth needed)
router.get('/trending', (req, res) => {
    try {
        const db = getDB();
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);

        const trending = db.prepare(`
            SELECT r.id as rom_id, r.clean_name, r.system_id,
                   s.short_name as system_name, s.color as system_color,
                   m.artwork_path, m.artwork_url, m.genre,
                   COUNT(ph.id) as play_count,
                   COUNT(DISTINCT ph.player_id) as unique_players
            FROM play_history ph
            JOIN roms r ON r.id = ph.rom_id
            LEFT JOIN systems s ON s.id = r.system_id
            LEFT JOIN metadata m ON m.rom_id = r.id
            WHERE ph.started_at >= datetime('now', '-14 days')
            GROUP BY r.id
            ORDER BY play_count DESC
            LIMIT ?
        `).all(limit);

        res.json(trending);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /similar/:romId — find similar games
router.get('/similar/:romId', (req, res) => {
    try {
        const db = getDB();
        const romId = req.params.romId;

        const rom = db.prepare(`
            SELECT r.id, r.clean_name, r.system_id, m.genre
            FROM roms r LEFT JOIN metadata m ON m.rom_id = r.id
            WHERE r.id = ?
        `).get(romId);
        if (!rom) return res.status(404).json({ error: 'Game not found' });

        const results = [];
        const seen = new Set([parseInt(romId)]);

        // Same system + genre
        if (rom.genre) {
            const matches = db.prepare(`
                SELECT r.id as rom_id, r.clean_name, r.system_id,
                       s.short_name as system_name, s.color as system_color,
                       m.artwork_path, m.artwork_url, m.genre
                FROM roms r
                LEFT JOIN systems s ON s.id = r.system_id
                LEFT JOIN metadata m ON m.rom_id = r.id
                WHERE r.system_id = ? AND m.genre = ? AND r.id != ?
                LIMIT 8
            `).all(rom.system_id, rom.genre, romId);
            for (const g of matches) {
                if (!seen.has(g.rom_id)) { seen.add(g.rom_id); results.push({ ...g, reason: 'Same system & genre' }); }
            }
        }

        // Same system (fill to 15)
        const sameSystem = db.prepare(`
            SELECT r.id as rom_id, r.clean_name, r.system_id,
                   s.short_name as system_name, s.color as system_color,
                   m.artwork_path, m.artwork_url, m.genre
            FROM roms r
            LEFT JOIN systems s ON s.id = r.system_id
            LEFT JOIN metadata m ON m.rom_id = r.id
            WHERE r.system_id = ? AND r.id != ?
            ORDER BY RANDOM() LIMIT 10
        `).all(rom.system_id, romId);
        for (const g of sameSystem) {
            if (!seen.has(g.rom_id) && results.length < 15) { seen.add(g.rom_id); results.push({ ...g, reason: 'Same system' }); }
        }

        res.json({ source: rom, similar: results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Keyword extractor for series/genre detection ──────────────────────────
function extractKeywords(name = '') {
    const SERIES = [
        'street fighter','mortal kombat','king of fighters','fatal fury','art of fighting',
        'samurai shodown','darkstalkers','marvel vs','capcom vs','tekken',
        'mario','donkey kong','zelda','metroid','kirby','star fox','f-zero','pokemon',
        'sonic','streets of rage','golden axe','afterburner','outrun','shinobi',
        'mega man','castlevania','contra','double dragon','final fight','r-type','gradius',
        'pac-man','galaga','dig dug','xevious','phoenix','1942','1943',
        'final fantasy','dragon quest','chrono','secret of mana','earthbound',
        'nba','nfl','fifa','madden','nhl','mlb','tony hawk','nba jam','tecmo',
        'tmnt','x-men','simpsons','spider-man','batman','punisher',
        'mslug','metal slug','kof','garou','sengoku',
    ];
    const lower = name.toLowerCase();
    const matched = SERIES.filter(s => lower.includes(s));
    const words = lower.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    return [...new Set([...matched, ...words.slice(0, 4)])];
}

// GET /for-you — personalized "You Might Like" shelf (uses most recent player)
router.get('/for-you', (req, res) => {
    try {
        const db = getDB();
        const limit = Math.min(parseInt(req.query.limit) || 16, 50);

        // Find most recently active player
        const recentPlayer = db.prepare(`
            SELECT player_id FROM play_history
            WHERE player_id IS NOT NULL
            ORDER BY started_at DESC LIMIT 1
        `).get();

        const playedIds = new Set();
        let topSystems = [];

        if (recentPlayer) {
            const pid = recentPlayer.player_id;
            db.prepare(`SELECT DISTINCT rom_id FROM play_history WHERE player_id = ?`)
                .all(pid).forEach(r => playedIds.add(r.rom_id));
            topSystems = db.prepare(`
                SELECT r.system_id, COUNT(*) as cnt
                FROM play_history ph JOIN roms r ON r.id = ph.rom_id
                WHERE ph.player_id = ?
                GROUP BY r.system_id ORDER BY cnt DESC LIMIT 5
            `).all(pid).map(s => s.system_id);
        }

        const results = [];
        const seen = new Set(playedIds);

        // Pull candidates from top played systems first
        for (const sysId of topSystems) {
            if (results.length >= limit) break;
            const candidates = db.prepare(`
                SELECT r.id, COALESCE(m.title, r.clean_name) as title, r.clean_name,
                       r.system_id, s.short_name as system_name, s.color as system_color,
                       m.artwork_path, m.genre, m.year
                FROM roms r
                LEFT JOIN metadata m ON m.rom_id = r.id
                LEFT JOIN systems s ON s.id = r.system_id
                WHERE r.system_id = ? AND m.artwork_path IS NOT NULL
                ORDER BY RANDOM() LIMIT 12
            `).all(sysId);
            for (const g of candidates) {
                if (!seen.has(g.id) && results.length < limit) {
                    seen.add(g.id);
                    results.push({ ...g, reason: `Because you play ${g.system_name}` });
                }
            }
        }

        // Top-up with artwork-rich random games from any system
        if (results.length < limit) {
            const filler = db.prepare(`
                SELECT r.id, COALESCE(m.title, r.clean_name) as title, r.clean_name,
                       r.system_id, s.short_name as system_name, s.color as system_color,
                       m.artwork_path, m.genre, m.year
                FROM roms r
                LEFT JOIN metadata m ON m.rom_id = r.id
                LEFT JOIN systems s ON s.id = r.system_id
                WHERE m.artwork_path IS NOT NULL
                ORDER BY RANDOM() LIMIT 60
            `).all();
            for (const g of filler) {
                if (!seen.has(g.id) && results.length < limit) {
                    seen.add(g.id);
                    results.push({ ...g, reason: 'You might enjoy this' });
                }
            }
        }

        res.json({ games: results, count: results.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Mood definitions ──────────────────────────────────────────────────────
const MOODS = {
    action:      { id:'action',      label:'Fast & Intense',    icon:'💥', color:'#ef4444',
                   keywords:['fighter','fight','shoot','blast','battle','combat','war','ninja','commando','vs','mortal','street','rage','slug','commando','ninja','beat'], systems:['arcade','fbneo','snes','genesis'] },
    chill:       { id:'chill',       label:'Chill & Explore',   icon:'🌿', color:'#10b981',
                   keywords:['zelda','adventure','rpg','quest','fantasy','world','land','island','king','legend','tale','saga','mana','chrono','donkey'], systems:['snes','gba','nes','genesis','psx'] },
    compete:     { id:'compete',     label:'Beat Your Score',   icon:'🏆', color:'#f59e0b',
                   keywords:['tetris','puzzle','pinball','pac','galaga','breakout','arkanoid','columns','puyo','panel','bust','dr.mario'], systems:['arcade','fbneo','nes','gameboy','snes'] },
    explore:     { id:'explore',     label:'Something New',     icon:'🔭', color:'#8b5cf6',
                   keywords:[], systems:[] },
    multiplayer: { id:'multiplayer', label:'Play Together',     icon:'👥', color:'#06b6d4',
                   keywords:['nba','nfl','nhl','mlb','soccer','tennis','golf','hockey','olympic','sports','volleyball','football','baseball','basketball','wrestling','party','doubles','two'], systems:['snes','genesis','arcade','psx','n64'] },
};

// GET /moods — list available moods
router.get('/moods', (req, res) => {
    res.json(Object.values(MOODS).map(({ id, label, icon, color }) => ({ id, label, icon, color })));
});

// GET /mood/:mood — mood-based game picks
router.get('/mood/:mood', (req, res) => {
    try {
        const db = getDB();
        const mood = MOODS[req.params.mood];
        if (!mood) return res.status(404).json({ error: 'Unknown mood', valid: Object.keys(MOODS) });

        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        let games = [];

        if (mood.id === 'explore') {
            // Pure random unplayed games with artwork
            games = db.prepare(`
                SELECT r.id, COALESCE(m.title, r.clean_name) as title, r.clean_name,
                       r.system_id, s.short_name as system_name, s.color as system_color,
                       m.artwork_path, m.genre, m.year
                FROM roms r
                LEFT JOIN metadata m ON m.rom_id = r.id
                LEFT JOIN systems s ON s.id = r.system_id
                WHERE m.artwork_path IS NOT NULL
                  AND r.id NOT IN (SELECT DISTINCT rom_id FROM play_history WHERE rom_id IS NOT NULL)
                ORDER BY RANDOM() LIMIT ?
            `).all(limit);
        } else {
            const sysPh = mood.systems.length > 0
                ? `AND r.system_id IN (${mood.systems.map(() => '?').join(',')})`
                : '';
            const candidates = db.prepare(`
                SELECT r.id, COALESCE(m.title, r.clean_name) as title, r.clean_name,
                       r.system_id, s.short_name as system_name, s.color as system_color,
                       m.artwork_path, m.genre, m.year
                FROM roms r
                LEFT JOIN metadata m ON m.rom_id = r.id
                LEFT JOIN systems s ON s.id = r.system_id
                WHERE m.artwork_path IS NOT NULL ${sysPh}
                ORDER BY RANDOM() LIMIT 400
            `).all(...mood.systems);

            // Score by keyword hits
            const scored = candidates.map(g => {
                const nameLow = (g.title || g.clean_name || '').toLowerCase();
                const hits = mood.keywords.filter(kw => nameLow.includes(kw)).length;
                const sysBonus = mood.systems.includes(g.system_id) ? 0.5 : 0;
                return { ...g, _score: hits + sysBonus };
            }).sort((a, b) => b._score - a._score);

            games = scored.slice(0, limit);
        }

        res.json({ mood: { id: mood.id, label: mood.label, icon: mood.icon, color: mood.color }, games, count: games.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /undiscovered — unplayed games with artwork (discovery shelf)
router.get('/undiscovered', (req, res) => {
    try {
        const db = getDB();
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);

        const games = db.prepare(`
            SELECT r.id, COALESCE(m.title, r.clean_name) as title, r.clean_name,
                   r.system_id, s.short_name as system_name, s.color as system_color,
                   m.artwork_path, m.genre, m.year
            FROM roms r
            LEFT JOIN metadata m ON m.rom_id = r.id
            LEFT JOIN systems s ON s.id = r.system_id
            WHERE m.artwork_path IS NOT NULL
              AND r.id NOT IN (SELECT DISTINCT rom_id FROM play_history WHERE rom_id IS NOT NULL)
            ORDER BY RANDOM()
            LIMIT ?
        `).all(limit);

        res.json({ games, count: games.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /:playerId — get personalized recommendations
router.get('/:playerId', (req, res) => {
    try {
        const db = getDB();
        const playerId = req.params.playerId;

        // Verify player exists
        const player = db.prepare('SELECT id, name FROM players WHERE id = ?').get(playerId);
        if (!player) return res.status(404).json({ error: 'Player not found' });

        // Get player's favorite system IDs
        const favSystems = db.prepare(`
            SELECT DISTINCT r.system_id, COUNT(*) as cnt
            FROM player_favorites pf
            JOIN roms r ON r.id = pf.rom_id
            WHERE pf.player_id = ?
            GROUP BY r.system_id
            ORDER BY cnt DESC
        `).all(playerId);

        // Get player's favorite genres
        const favGenres = db.prepare(`
            SELECT DISTINCT m.genre, COUNT(*) as cnt
            FROM player_favorites pf
            JOIN metadata m ON m.rom_id = pf.rom_id
            WHERE pf.player_id = ? AND m.genre IS NOT NULL AND m.genre != ''
            GROUP BY m.genre
            ORDER BY cnt DESC
        `).all(playerId);

        // Get most played system IDs
        const playedSystems = db.prepare(`
            SELECT DISTINCT r.system_id, COUNT(*) as cnt
            FROM play_history ph
            JOIN roms r ON r.id = ph.rom_id
            WHERE ph.player_id = ?
            GROUP BY r.system_id
            ORDER BY cnt DESC
        `).all(playerId);

        // Get games the player has already played or favorited
        const playedGames = db.prepare(`
            SELECT DISTINCT rom_id FROM play_history WHERE player_id = ?
            UNION
            SELECT DISTINCT rom_id FROM player_favorites WHERE player_id = ?
        `).all(playerId, playerId);
        const playedSet = new Set(playedGames.map(g => g.rom_id));

        // Get friend favorites (popular with friends)
        const friendFavs = db.prepare(`
            SELECT pf.rom_id, COUNT(*) as friend_count
            FROM player_favorites pf
            WHERE pf.player_id IN (SELECT friend_id FROM friends WHERE player_id = ?)
            GROUP BY pf.rom_id
            ORDER BY friend_count DESC
            LIMIT 50
        `).all(playerId);

        // Get highly rated games overall
        const topRated = db.prepare(`
            SELECT rom_id, AVG(rating) as avg_rating, COUNT(*) as rating_count
            FROM player_ratings
            GROUP BY rom_id
            HAVING rating_count >= 2
            ORDER BY avg_rating DESC
            LIMIT 50
        `).all();

        // Build all candidate games with metadata
        const allGames = db.prepare(`
            SELECT r.id as rom_id, r.clean_name, r.system_id,
                   m.genre, m.artwork_path, m.artwork_url, m.rating,
                   s.short_name as system_name, s.color as system_color
            FROM roms r
            LEFT JOIN metadata m ON m.rom_id = r.id
            LEFT JOIN systems s ON s.id = r.system_id
            WHERE m.title IS NOT NULL
        `).all();

        // Merge all systems the player likes
        const likedSystems = new Map();
        for (const s of favSystems) likedSystems.set(s.system_id, (likedSystems.get(s.system_id) || 0) + s.cnt);
        for (const s of playedSystems) likedSystems.set(s.system_id, (likedSystems.get(s.system_id) || 0) + s.cnt);

        const likedGenres = new Set(favGenres.map(g => g.genre));
        const friendFavSet = new Map(friendFavs.map(f => [f.rom_id, f.friend_count]));
        const ratedMap = new Map(topRated.map(r => [r.rom_id, r.avg_rating]));

        // Score each candidate
        const scored = [];
        for (const game of allGames) {
            if (playedSet.has(game.rom_id)) continue; // Must be unplayed

            let score = 0;
            const reasons = [];

            // Same system as favorites (weight 3)
            if (likedSystems.has(game.system_id)) {
                score += 3 * Math.min(likedSystems.get(game.system_id), 5);
                reasons.push(`Because you love ${game.system_name} games`);
            }

            // Same genre as favorites (weight 2)
            if (game.genre && likedGenres.has(game.genre)) {
                score += 2;
                reasons.push(`Matches your favorite genre: ${game.genre}`);
            }

            // Popular with friends (weight 2)
            if (friendFavSet.has(game.rom_id)) {
                score += 2 * friendFavSet.get(game.rom_id);
                reasons.push(`Popular with your friends`);
            }

            // Highly rated overall (weight 1)
            if (ratedMap.has(game.rom_id)) {
                score += ratedMap.get(game.rom_id);
                reasons.push(`Highly rated by the family`);
            }

            if (score > 0) {
                scored.push({
                    ...game,
                    recommendation_score: Math.round(score * 100) / 100,
                    reason: reasons[0] || 'Recommended for you',
                    reasons,
                });
            }
        }

        // Sort by score descending, take top 20
        scored.sort((a, b) => b.recommendation_score - a.recommendation_score);
        const top = scored.slice(0, 20);

        res.json({
            player: player.name,
            recommendation_count: top.length,
            recommendations: top,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
