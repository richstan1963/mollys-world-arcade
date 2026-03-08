import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// GET / — aggregated stats: most plays, highest scores, longest streaks, most achievements, most XP, most favorites
router.get('/', (req, res) => {
    try {
        const db = getDB();

        // Most plays
        const mostPlays = db.prepare(`
            SELECT p.id, p.name, p.emoji, p.color, COUNT(ph.id) as total_plays
            FROM players p
            JOIN play_history ph ON ph.player_id = p.id
            GROUP BY p.id
            ORDER BY total_plays DESC
            LIMIT 5
        `).all();

        // Highest single scores
        const highestScores = db.prepare(`
            SELECT hs.score, p.id as player_id, p.name, p.emoji, p.color,
                   r.clean_name as game_name, r.system_id
            FROM high_scores hs
            JOIN players p ON p.id = hs.player_id
            JOIN roms r ON r.id = hs.rom_id
            ORDER BY hs.score DESC
            LIMIT 5
        `).all();

        // Most total play time
        const longestPlaytime = db.prepare(`
            SELECT p.id, p.name, p.emoji, p.color,
                   SUM(ph.duration_seconds) as total_seconds
            FROM players p
            JOIN play_history ph ON ph.player_id = p.id
            GROUP BY p.id
            ORDER BY total_seconds DESC
            LIMIT 5
        `).all();

        // Most achievements
        const mostAchievements = db.prepare(`
            SELECT p.id, p.name, p.emoji, p.color, COUNT(a.id) as total_achievements
            FROM players p
            JOIN achievements a ON a.player_id = p.id
            GROUP BY p.id
            ORDER BY total_achievements DESC
            LIMIT 5
        `).all();

        // Most XP
        const mostXP = db.prepare(`
            SELECT id, name, emoji, color, xp, level
            FROM players
            WHERE name != 'Guest'
            ORDER BY xp DESC
            LIMIT 5
        `).all();

        // Most favorites
        const mostFavorites = db.prepare(`
            SELECT p.id, p.name, p.emoji, p.color, COUNT(pf.id) as total_favorites
            FROM players p
            JOIN player_favorites pf ON pf.player_id = p.id
            GROUP BY p.id
            ORDER BY total_favorites DESC
            LIMIT 5
        `).all();

        res.json({
            most_plays: mostPlays,
            highest_scores: highestScores,
            longest_playtime: longestPlaytime,
            most_achievements: mostAchievements,
            most_xp: mostXP,
            most_favorites: mostFavorites,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /records — game-specific records (first to play, longest session, etc.)
router.get('/records', (req, res) => {
    try {
        const db = getDB();

        // First ever play session
        const firstPlay = db.prepare(`
            SELECT ph.id, ph.started_at, p.name as player_name, p.emoji, p.color,
                   r.clean_name as game_name, r.system_id
            FROM play_history ph
            JOIN roms r ON r.id = ph.rom_id
            LEFT JOIN players p ON p.id = ph.player_id
            ORDER BY ph.started_at ASC
            LIMIT 1
        `).get();

        // Longest single session
        const longestSession = db.prepare(`
            SELECT ph.id, ph.duration_seconds, ph.started_at,
                   p.name as player_name, p.emoji, p.color,
                   r.clean_name as game_name, r.system_id
            FROM play_history ph
            JOIN roms r ON r.id = ph.rom_id
            LEFT JOIN players p ON p.id = ph.player_id
            ORDER BY ph.duration_seconds DESC
            LIMIT 1
        `).get();

        // Most played game
        const mostPlayedGame = db.prepare(`
            SELECT r.id as rom_id, r.clean_name as game_name, r.system_id,
                   COUNT(ph.id) as play_count,
                   SUM(ph.duration_seconds) as total_seconds
            FROM roms r
            JOIN play_history ph ON ph.rom_id = r.id
            GROUP BY r.id
            ORDER BY play_count DESC
            LIMIT 1
        `).get();

        // Highest rated game (by average rating)
        const highestRated = db.prepare(`
            SELECT r.id as rom_id, r.clean_name as game_name, r.system_id,
                   ROUND(AVG(pr.rating), 2) as avg_rating,
                   COUNT(pr.rating) as rating_count
            FROM roms r
            JOIN player_ratings pr ON pr.rom_id = r.id
            GROUP BY r.id
            HAVING rating_count >= 2
            ORDER BY avg_rating DESC
            LIMIT 1
        `).get();

        // Most systems played by a single player
        const systemExplorer = db.prepare(`
            SELECT p.id, p.name, p.emoji, p.color,
                   COUNT(DISTINCT r.system_id) as systems_played
            FROM players p
            JOIN play_history ph ON ph.player_id = p.id
            JOIN roms r ON r.id = ph.rom_id
            GROUP BY p.id
            ORDER BY systems_played DESC
            LIMIT 1
        `).get();

        res.json({
            first_play: firstPlay || null,
            longest_session: longestSession || null,
            most_played_game: mostPlayedGame || null,
            highest_rated: highestRated || null,
            system_explorer: systemExplorer || null,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /legends — top 3 players per category with stats
router.get('/legends', (req, res) => {
    try {
        const db = getDB();

        // Score legends — players with highest cumulative scores
        const scoreLegends = db.prepare(`
            SELECT p.id, p.name, p.emoji, p.color,
                   SUM(hs.score) as total_score,
                   COUNT(hs.id) as score_count,
                   MAX(hs.score) as best_score
            FROM players p
            JOIN high_scores hs ON hs.player_id = p.id
            GROUP BY p.id
            ORDER BY total_score DESC
            LIMIT 3
        `).all();

        // Marathon legends — most total play time
        const marathonLegends = db.prepare(`
            SELECT p.id, p.name, p.emoji, p.color,
                   SUM(ph.duration_seconds) as total_seconds,
                   COUNT(ph.id) as session_count
            FROM players p
            JOIN play_history ph ON ph.player_id = p.id
            GROUP BY p.id
            ORDER BY total_seconds DESC
            LIMIT 3
        `).all();

        // Explorer legends — most unique games played
        const explorerLegends = db.prepare(`
            SELECT p.id, p.name, p.emoji, p.color,
                   COUNT(DISTINCT ph.rom_id) as unique_games,
                   COUNT(DISTINCT r.system_id) as unique_systems
            FROM players p
            JOIN play_history ph ON ph.player_id = p.id
            JOIN roms r ON r.id = ph.rom_id
            GROUP BY p.id
            ORDER BY unique_games DESC
            LIMIT 3
        `).all();

        // Achievement legends
        const achievementLegends = db.prepare(`
            SELECT p.id, p.name, p.emoji, p.color,
                   COUNT(a.id) as total_achievements
            FROM players p
            JOIN achievements a ON a.player_id = p.id
            GROUP BY p.id
            ORDER BY total_achievements DESC
            LIMIT 3
        `).all();

        // XP legends
        const xpLegends = db.prepare(`
            SELECT id, name, emoji, color, xp, level
            FROM players
            WHERE name != 'Guest'
            ORDER BY xp DESC
            LIMIT 3
        `).all();

        res.json({
            score_legends: scoreLegends,
            marathon_legends: marathonLegends,
            explorer_legends: explorerLegends,
            achievement_legends: achievementLegends,
            xp_legends: xpLegends,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
