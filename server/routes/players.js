import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// List all players
router.get('/', (req, res) => {
    const db = getDB();
    const players = db.prepare(`
        SELECT p.*,
               (SELECT COUNT(*) FROM player_favorites pf WHERE pf.player_id = p.id) as fav_count
        FROM players p
        ORDER BY p.sort_order
    `).all();
    res.json(players);
});

// Get a player's favorites
router.get('/:id/favorites', (req, res) => {
    const db = getDB();
    const { limit = 60, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const playerId = parseInt(req.params.id);

    const countRow = db.prepare(
        "SELECT COUNT(*) as total FROM player_favorites pf JOIN roms r ON r.id = pf.rom_id WHERE pf.player_id = ? AND r.source != 'test'"
    ).get(playerId);

    const rows = db.prepare(`
        SELECT r.*, m.title, m.artwork_path, m.region, m.year, m.genre,
               s.short_name as system_name, s.color as system_color,
               1 as is_favorite,
               pf.added_at as favorited_at,
               (SELECT MAX(started_at) FROM play_history ph WHERE ph.rom_id = r.id) as last_played,
               (SELECT pr.rating FROM player_ratings pr WHERE pr.player_id = pf.player_id AND pr.rom_id = r.id) as player_rating
        FROM player_favorites pf
        JOIN roms r ON r.id = pf.rom_id
        LEFT JOIN metadata m ON m.rom_id = r.id
        LEFT JOIN systems s ON s.id = r.system_id
        WHERE pf.player_id = ? AND r.source != 'test'
        ORDER BY pf.added_at DESC
        LIMIT ? OFFSET ?
    `).all(playerId, parseInt(limit), offset);

    res.json({
        games: rows,
        total: countRow.total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countRow.total / parseInt(limit)),
    });
});

// Toggle a favorite for a player
router.post('/:id/favorites/:romId', (req, res) => {
    const db = getDB();
    const playerId = parseInt(req.params.id);
    const romId = parseInt(req.params.romId);

    const existing = db.prepare(
        'SELECT id FROM player_favorites WHERE player_id = ? AND rom_id = ?'
    ).get(playerId, romId);

    if (existing) {
        db.prepare('DELETE FROM player_favorites WHERE player_id = ? AND rom_id = ?').run(playerId, romId);
        res.json({ favorited: false });
    } else {
        db.prepare('INSERT INTO player_favorites (player_id, rom_id) VALUES (?, ?)').run(playerId, romId);
        res.json({ favorited: true });
    }
});

// Update player profile (name, emoji, color)
router.patch('/:id', (req, res) => {
    const db = getDB();
    const playerId = parseInt(req.params.id);
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const { name, emoji, color, theme, character_theme, preferences } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined && name.trim()) {
        if (name.trim().length > 30) return res.status(400).json({ error: 'Name must be 30 characters or less' });
        updates.push('name = ?'); values.push(name.trim());
    }
    if (emoji !== undefined) { updates.push('emoji = ?'); values.push(emoji); }
    if (color !== undefined) { updates.push('color = ?'); values.push(color); }
    if (theme !== undefined) { updates.push('theme = ?'); values.push(theme); }
    if (character_theme !== undefined) { updates.push('character_theme = ?'); values.push(character_theme); }
    if (preferences !== undefined) { updates.push('preferences = ?'); values.push(JSON.stringify(preferences)); }

    if (updates.length === 0) return res.json(player);

    values.push(playerId);
    db.prepare(`UPDATE players SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
    res.json(updated);
});

// Get/update player preferences
router.get('/:id/preferences', (req, res) => {
    const db = getDB();
    const player = db.prepare('SELECT preferences FROM players WHERE id = ?').get(parseInt(req.params.id));
    if (!player) return res.status(404).json({ error: 'Player not found' });
    try { res.json(JSON.parse(player.preferences || '{}')); }
    catch { res.json({}); }
});

router.put('/:id/preferences', (req, res) => {
    const db = getDB();
    const playerId = parseInt(req.params.id);
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const json = JSON.stringify(req.body);
    if (json.length > 10000) return res.status(400).json({ error: 'Preferences too large' });
    db.prepare('UPDATE players SET preferences = ? WHERE id = ?').run(json, playerId);
    res.json(req.body);
});

// Get player stats summary
router.get('/:id/stats', (req, res) => {
    const db = getDB();
    const playerId = parseInt(req.params.id);
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    // Consolidated stats query — 6 queries → 1
    const agg = db.prepare(`
        SELECT
            (SELECT COUNT(*) FROM player_favorites WHERE player_id = ?) as fav_count,
            (SELECT COUNT(*) FROM player_ratings WHERE player_id = ?) as rating_count,
            (SELECT AVG(rating) FROM player_ratings WHERE player_id = ?) as avg_rating,
            (SELECT COUNT(*) FROM high_scores WHERE player_id = ?) as score_count,
            (SELECT MAX(score) FROM high_scores WHERE player_id = ?) as top_score,
            (SELECT COUNT(*) FROM achievements WHERE player_id = ?) as achievement_count
    `).get(playerId, playerId, playerId, playerId, playerId, playerId);

    const favCount = agg.fav_count;
    const ratingCount = agg.rating_count;
    const avgRating = agg.avg_rating || 0;
    const scoreCount = agg.score_count;
    const topScore = agg.top_score || 0;
    const achievementCount = agg.achievement_count;

    // Top 5 favorited systems
    const topSystems = db.prepare(`
        SELECT s.short_name, s.color, s.id, COUNT(*) as count
        FROM player_favorites pf
        JOIN roms r ON r.id = pf.rom_id
        JOIN systems s ON s.id = r.system_id
        WHERE pf.player_id = ?
        GROUP BY s.id
        ORDER BY count DESC
        LIMIT 5
    `).all(playerId);

    // Recent favorites (last 8)
    const recentFavorites = db.prepare(`
        SELECT r.id, r.clean_name, r.system_id, m.title, m.artwork_path,
               s.short_name as system_name, s.color as system_color
        FROM player_favorites pf
        JOIN roms r ON r.id = pf.rom_id
        LEFT JOIN metadata m ON m.rom_id = r.id
        LEFT JOIN systems s ON s.id = r.system_id
        WHERE pf.player_id = ? AND r.source != 'test'
        ORDER BY pf.added_at DESC
        LIMIT 8
    `).all(playerId);

    // Recently played games (for Quick Play section)
    const recentPlayed = db.prepare(`
        SELECT DISTINCT r.id, r.clean_name, r.filename, r.system_id, r.size_bytes,
               m.title, m.artwork_path, m.region,
               s.short_name as system_short_name, s.name as system_name, s.color as system_color,
               MAX(ph.started_at) as last_played_at,
               SUM(ph.duration_seconds) as total_play_time
        FROM play_history ph
        JOIN roms r ON r.id = ph.rom_id
        LEFT JOIN metadata m ON m.rom_id = r.id
        LEFT JOIN systems s ON s.id = r.system_id
        WHERE ph.player_id = ?
        GROUP BY r.id
        ORDER BY MAX(ph.started_at) DESC
        LIMIT 8
    `).all(playerId);

    // If player has no personal history, get global recent (for new players)
    const recentToShow = recentPlayed.length > 0 ? recentPlayed : db.prepare(`
        SELECT DISTINCT r.id, r.clean_name, r.filename, r.system_id, r.size_bytes,
               m.title, m.artwork_path, m.region,
               s.short_name as system_short_name, s.name as system_name, s.color as system_color,
               MAX(ph.started_at) as last_played_at,
               SUM(ph.duration_seconds) as total_play_time
        FROM play_history ph
        JOIN roms r ON r.id = ph.rom_id
        LEFT JOIN metadata m ON m.rom_id = r.id
        LEFT JOIN systems s ON s.id = r.system_id
        GROUP BY r.id
        ORDER BY MAX(ph.started_at) DESC
        LIMIT 8
    `).all();

    // Random picks from favorites for "Quick Picks" (shuffle 4)
    const quickPicks = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.system_id, r.size_bytes,
               m.title, m.artwork_path, m.region,
               s.short_name as system_short_name, s.name as system_name, s.color as system_color
        FROM player_favorites pf
        JOIN roms r ON r.id = pf.rom_id
        LEFT JOIN metadata m ON m.rom_id = r.id
        LEFT JOIN systems s ON s.id = r.system_id
        WHERE pf.player_id = ? AND r.source != 'test'
        ORDER BY RANDOM()
        LIMIT 4
    `).all(playerId);

    // Arcade Originals — all games + player's best score per game (single query)
    let originalGames = [];
    try {
        originalGames = db.prepare(`
            SELECT og.*,
                   COALESCE(MAX(os.score), 0) as best_score,
                   COALESCE(MAX(os.level), 0) as best_level,
                   COUNT(os.id) as play_count
            FROM original_games og
            LEFT JOIN original_scores os ON os.game_id = og.id AND os.player_id = ?
            GROUP BY og.id
            ORDER BY og.added_at
        `).all(playerId);
    } catch {}

    let prefs = {};
    try { prefs = JSON.parse(player.preferences || '{}'); } catch {}

    res.json({
        ...player,
        preferences: prefs,
        stats: {
            favorites: favCount,
            ratings: ratingCount,
            avg_rating: Math.round(avgRating * 10) / 10,
            scores: scoreCount,
            top_score: topScore,
            achievements: achievementCount,
        },
        top_systems: topSystems,
        recent_favorites: recentFavorites,
        recent_played: recentToShow,
        quick_picks: quickPicks,
        original_games: originalGames,
    });
});

// Family achievements — computed from shared favorites & activity
router.get('/:id/family', (req, res) => {
    const db = getDB();
    const playerId = parseInt(req.params.id);
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const allPlayers = db.prepare("SELECT * FROM players WHERE name != 'Guest' ORDER BY sort_order").all();
    const achievements = [];

    // 1. Shared favorites with each other player ("Game Buddies")
    for (const other of allPlayers) {
        if (other.id === playerId) continue;
        const shared = db.prepare(`
            SELECT COUNT(*) as c FROM player_favorites a
            JOIN player_favorites b ON a.rom_id = b.rom_id
            WHERE a.player_id = ? AND b.player_id = ?
        `).get(playerId, other.id);

        if (shared.c >= 1) {
            // Get top 3 shared games for display
            const sharedGames = db.prepare(`
                SELECT r.clean_name FROM player_favorites a
                JOIN player_favorites b ON a.rom_id = b.rom_id
                JOIN roms r ON r.id = a.rom_id
                WHERE a.player_id = ? AND b.player_id = ?
                ORDER BY a.added_at DESC LIMIT 3
            `).all(playerId, other.id);

            let tier, icon, title;
            if (shared.c >= 50) { tier = 'legendary'; icon = '👑'; title = `Legendary Duo`; }
            else if (shared.c >= 20) { tier = 'gold'; icon = '💛'; title = `Best Friends`; }
            else if (shared.c >= 10) { tier = 'silver'; icon = '🤝'; title = `Game Buddies`; }
            else if (shared.c >= 3) { tier = 'bronze'; icon = '🎮'; title = `Shared Taste`; }
            else { tier = 'starter'; icon = '✨'; title = `First Match`; }

            achievements.push({
                type: 'shared_favorites',
                tier,
                icon,
                title,
                with_player: { id: other.id, name: other.name, emoji: other.emoji, color: other.color },
                count: shared.c,
                desc: `${shared.c} games in common with ${other.name}`,
                games: sharedGames.map(g => g.clean_name),
            });
        }
    }

    // 2. Same-week activity ("Family Game Night")
    const thisWeekPlayers = db.prepare(`
        SELECT DISTINCT p.id, p.name, p.emoji, p.color
        FROM player_favorites pf
        JOIN players p ON p.id = pf.player_id
        WHERE date(pf.added_at) >= date('now', '-7 days')
          AND p.name != 'Guest'
    `).all();
    if (thisWeekPlayers.length >= 3) {
        achievements.push({
            type: 'family_night',
            tier: thisWeekPlayers.length >= 6 ? 'legendary' : thisWeekPlayers.length >= 4 ? 'gold' : 'silver',
            icon: '🏠',
            title: thisWeekPlayers.length >= 6 ? 'Full House!' : 'Family Game Night',
            count: thisWeekPlayers.length,
            desc: `${thisWeekPlayers.length} players active this week`,
            players: thisWeekPlayers,
        });
    }

    // 3. System explorer — how many systems this player has favorites in
    const systemCount = db.prepare(`
        SELECT COUNT(DISTINCT r.system_id) as c
        FROM player_favorites pf JOIN roms r ON r.id = pf.rom_id
        WHERE pf.player_id = ?
    `).get(playerId).c;
    if (systemCount >= 2) {
        let tier, icon, title;
        if (systemCount >= 10) { tier = 'legendary'; icon = '🌌'; title = 'System Master'; }
        else if (systemCount >= 7) { tier = 'gold'; icon = '🗺️'; title = 'System Explorer'; }
        else if (systemCount >= 4) { tier = 'silver'; icon = '🧭'; title = 'System Hopper'; }
        else { tier = 'bronze'; icon = '🎯'; title = 'Getting Around'; }
        achievements.push({
            type: 'system_explorer',
            tier, icon, title,
            count: systemCount,
            desc: `Favorites across ${systemCount} different systems`,
        });
    }

    // 4. Collection size milestones
    const favTotal = db.prepare('SELECT COUNT(*) as c FROM player_favorites WHERE player_id = ?').get(playerId).c;
    if (favTotal >= 10) {
        let tier, icon, title;
        if (favTotal >= 200) { tier = 'legendary'; icon = '🏆'; title = 'Mega Collector'; }
        else if (favTotal >= 100) { tier = 'gold'; icon = '📦'; title = 'Power Collector'; }
        else if (favTotal >= 50) { tier = 'silver'; icon = '⭐'; title = 'Growing Collection'; }
        else { tier = 'bronze'; icon = '🌱'; title = 'Starter Collection'; }
        achievements.push({
            type: 'collection',
            tier, icon, title,
            count: favTotal,
            desc: `${favTotal} games in the collection`,
        });
    }

    // 5. Genre variety — unique genres in favorites
    const genreCount = db.prepare(`
        SELECT COUNT(DISTINCT m.genre) as c
        FROM player_favorites pf
        JOIN metadata m ON m.rom_id = pf.rom_id
        WHERE pf.player_id = ? AND m.genre IS NOT NULL AND m.genre != ''
    `).get(playerId).c;
    if (genreCount >= 3) {
        achievements.push({
            type: 'genre_variety',
            tier: genreCount >= 8 ? 'gold' : genreCount >= 5 ? 'silver' : 'bronze',
            icon: '🎭',
            title: genreCount >= 8 ? 'Genre Master' : 'Mixed Taste',
            count: genreCount,
            desc: `Plays across ${genreCount} different genres`,
        });
    }

    // Sort: legendary first, then gold, silver, bronze, starter
    const tierOrder = { legendary: 0, gold: 1, silver: 2, bronze: 3, starter: 4 };
    achievements.sort((a, b) => (tierOrder[a.tier] ?? 5) - (tierOrder[b.tier] ?? 5));

    res.json({ player, achievements });
});

// Check if a game is favorited by a player
router.get('/:id/favorites/:romId', (req, res) => {
    const db = getDB();
    const existing = db.prepare(
        'SELECT id FROM player_favorites WHERE player_id = ? AND rom_id = ?'
    ).get(parseInt(req.params.id), parseInt(req.params.romId));
    res.json({ favorited: !!existing });
});

// Create a new player
router.post('/', (req, res) => {
    const db = getDB();
    const { name, emoji, color } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    if (name.trim().length > 30) return res.status(400).json({ error: 'Name must be 30 characters or less' });

    // Check for duplicate name
    const existing = db.prepare('SELECT id FROM players WHERE LOWER(name) = LOWER(?)').get(name.trim());
    if (existing) return res.status(409).json({ error: 'A player with that name already exists' });

    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM players').get().m || 0;
    const result = db.prepare(
        'INSERT INTO players (name, emoji, color, sort_order) VALUES (?, ?, ?, ?)'
    ).run(name.trim(), emoji || '🎮', color || '#A855F7', maxOrder + 1);

    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(result.lastInsertRowid);
    res.json(player);
});

// Delete a player (and their favorites, ratings, scores, achievements)
router.delete('/:id', (req, res) => {
    const db = getDB();
    const playerId = parseInt(req.params.id);
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    db.prepare('DELETE FROM player_favorites WHERE player_id = ?').run(playerId);
    db.prepare('DELETE FROM player_ratings WHERE player_id = ?').run(playerId);
    db.prepare('DELETE FROM high_scores WHERE player_id = ?').run(playerId);
    db.prepare('DELETE FROM achievements WHERE player_id = ?').run(playerId);
    db.prepare('DELETE FROM players WHERE id = ?').run(playerId);

    res.json({ deleted: true, player });
});

// Bulk remove favorites for a player
router.post('/:id/favorites/bulk-remove', (req, res) => {
    const db = getDB();
    const playerId = parseInt(req.params.id);
    const { rom_ids } = req.body;
    if (!rom_ids || !Array.isArray(rom_ids)) return res.status(400).json({ error: 'rom_ids array required' });

    const stmt = db.prepare('DELETE FROM player_favorites WHERE player_id = ? AND rom_id = ?');
    const removeMany = db.transaction((ids) => {
        for (const id of ids) stmt.run(playerId, id);
    });
    removeMany(rom_ids);
    res.json({ removed: rom_ids.length });
});

export default router;
