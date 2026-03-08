import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// Deterministic pseudo-random from date string
function dateHash(dateStr) {
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) {
        hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

// GET / — today's featured game (deterministic based on date)
router.get('/', (req, res) => {
    try {
        const db = getDB();
        const today = new Date().toISOString().slice(0, 10);
        const hash = dateHash(today);

        // Get games with artwork, cycling through all systems
        const systems = db.prepare('SELECT id, short_name, color FROM systems ORDER BY sort_order').all();
        const systemIndex = hash % systems.length;
        const featuredSystem = systems[systemIndex];

        // Try to find a game with artwork from the selected system
        let candidates = db.prepare(`
            SELECT r.id as rom_id, r.clean_name, r.system_id, r.filename,
                   m.title, m.genre, m.description, m.artwork_path, m.artwork_url, m.rating, m.year, m.publisher,
                   s.short_name as system_name, s.name as system_full_name, s.color as system_color
            FROM roms r
            JOIN metadata m ON m.rom_id = r.id
            JOIN systems s ON s.id = r.system_id
            WHERE r.system_id = ? AND (m.artwork_path IS NOT NULL OR m.artwork_url IS NOT NULL)
            ORDER BY r.clean_name
        `).all(featuredSystem.id);

        // Fallback: if no artwork games for that system, pick from all systems
        if (candidates.length === 0) {
            candidates = db.prepare(`
                SELECT r.id as rom_id, r.clean_name, r.system_id, r.filename,
                       m.title, m.genre, m.description, m.artwork_path, m.artwork_url, m.rating, m.year, m.publisher,
                       s.short_name as system_name, s.name as system_full_name, s.color as system_color
                FROM roms r
                JOIN metadata m ON m.rom_id = r.id
                JOIN systems s ON s.id = r.system_id
                WHERE m.artwork_path IS NOT NULL OR m.artwork_url IS NOT NULL
                ORDER BY r.clean_name
            `).all();
        }

        if (candidates.length === 0) {
            // Last fallback: any game with metadata
            candidates = db.prepare(`
                SELECT r.id as rom_id, r.clean_name, r.system_id, r.filename,
                       m.title, m.genre, m.description, m.artwork_path, m.artwork_url, m.rating, m.year, m.publisher,
                       s.short_name as system_name, s.name as system_full_name, s.color as system_color
                FROM roms r
                JOIN metadata m ON m.rom_id = r.id
                JOIN systems s ON s.id = r.system_id
                WHERE m.title IS NOT NULL
                ORDER BY r.clean_name
            `).all();
        }

        if (candidates.length === 0) {
            return res.json({ date: today, game: null, message: 'No games available' });
        }

        const game = candidates[hash % candidates.length];

        // Get play stats for this game
        const playStats = db.prepare(`
            SELECT COUNT(*) as total_plays,
                   SUM(duration_seconds) as total_seconds,
                   COUNT(DISTINCT player_id) as unique_players
            FROM play_history
            WHERE rom_id = ?
        `).get(game.rom_id);

        // Get average rating
        const avgRating = db.prepare(`
            SELECT AVG(rating) as avg_rating, COUNT(*) as rating_count
            FROM player_ratings
            WHERE rom_id = ?
        `).get(game.rom_id);

        res.json({
            date: today,
            game: {
                ...game,
                play_count: playStats.total_plays,
                total_play_seconds: playStats.total_seconds || 0,
                unique_players: playStats.unique_players,
                avg_rating: avgRating.avg_rating ? Math.round(avgRating.avg_rating * 10) / 10 : null,
                rating_count: avgRating.rating_count,
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /history — past featured games (reconstructed from date hashes)
router.get('/history', (req, res) => {
    try {
        const db = getDB();
        const days = Math.min(parseInt(req.query.days) || 14, 60);
        const history = [];

        // Get all candidates once
        const candidates = db.prepare(`
            SELECT r.id as rom_id, r.clean_name, r.system_id,
                   m.artwork_path, m.artwork_url,
                   s.short_name as system_name, s.color as system_color
            FROM roms r
            JOIN metadata m ON m.rom_id = r.id
            JOIN systems s ON s.id = r.system_id
            WHERE m.title IS NOT NULL
            ORDER BY r.clean_name
        `).all();

        if (candidates.length === 0) {
            return res.json([]);
        }

        const now = new Date();
        for (let i = 0; i < days; i++) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            const hash = dateHash(dateStr);
            const game = candidates[hash % candidates.length];

            history.push({
                date: dateStr,
                rom_id: game.rom_id,
                clean_name: game.clean_name,
                system_id: game.system_id,
                system_name: game.system_name,
                system_color: game.system_color,
                artwork_path: game.artwork_path,
                artwork_url: game.artwork_url,
            });
        }

        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
