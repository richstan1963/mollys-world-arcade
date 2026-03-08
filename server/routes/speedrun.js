import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// GET /leaderboard — top speed runs across all games
router.get('/leaderboard', (req, res) => {
    try {
        const db = getDB();
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const category = req.query.category || null;

        let sql = `
            SELECT sr.*, p.name as player_name, p.emoji, p.color,
                   r.clean_name as game_name, r.system_id,
                   s.short_name as system_name,
                   m.artwork_path
            FROM speedrun_records sr
            JOIN players p ON p.id = sr.player_id
            JOIN roms r ON r.id = sr.rom_id
            LEFT JOIN systems s ON s.id = r.system_id
            LEFT JOIN metadata m ON m.rom_id = r.id
        `;
        const params = [];

        if (category) {
            sql += ' WHERE sr.category = ?';
            params.push(category);
        }

        sql += ' ORDER BY sr.time_ms ASC LIMIT ?';
        params.push(limit);

        const runs = db.prepare(sql).all(...params);

        // Format times
        const formatted = runs.map(r => ({
            ...r,
            time_formatted: formatTime(r.time_ms),
        }));

        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /game/:romId — speed runs for a specific game
router.get('/game/:romId', (req, res) => {
    try {
        const db = getDB();
        const category = req.query.category || null;

        let sql = `
            SELECT sr.*, p.name as player_name, p.emoji, p.color
            FROM speedrun_records sr
            JOIN players p ON p.id = sr.player_id
            WHERE sr.rom_id = ?
        `;
        const params = [req.params.romId];

        if (category) {
            sql += ' AND sr.category = ?';
            params.push(category);
        }

        sql += ' ORDER BY sr.time_ms ASC';

        const runs = db.prepare(sql).all(...params);

        // Get categories available for this game
        const categories = db.prepare(`
            SELECT DISTINCT category FROM speedrun_records WHERE rom_id = ? ORDER BY category
        `).all(req.params.romId);

        const formatted = runs.map(r => ({
            ...r,
            time_formatted: formatTime(r.time_ms),
        }));

        res.json({ runs: formatted, categories: categories.map(c => c.category) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST / — submit a speed run
router.post('/', (req, res) => {
    try {
        const db = getDB();
        const { player_id, rom_id, time_ms, category } = req.body;

        if (!player_id || !rom_id || !time_ms) {
            return res.status(400).json({ error: 'player_id, rom_id, and time_ms are required' });
        }
        if (typeof time_ms !== 'number' || time_ms <= 0) {
            return res.status(400).json({ error: 'time_ms must be a positive number' });
        }

        const cat = category || 'any%';

        const result = db.prepare(`
            INSERT INTO speedrun_records (player_id, rom_id, time_ms, category)
            VALUES (?, ?, ?, ?)
        `).run(player_id, rom_id, time_ms, cat);

        // Check if it's a new personal best
        const pb = db.prepare(`
            SELECT MIN(time_ms) as best FROM speedrun_records
            WHERE player_id = ? AND rom_id = ? AND category = ?
        `).get(player_id, rom_id, cat);

        // Check rank
        const rank = db.prepare(`
            SELECT COUNT(*) + 1 as rank FROM speedrun_records
            WHERE rom_id = ? AND category = ? AND time_ms < ?
        `).get(rom_id, cat, time_ms);

        // Check if it's the world record
        const wr = db.prepare(`
            SELECT MIN(time_ms) as best FROM speedrun_records
            WHERE rom_id = ? AND category = ?
        `).get(rom_id, cat);

        res.json({
            ok: true,
            id: result.lastInsertRowid,
            time_formatted: formatTime(time_ms),
            is_personal_best: pb.best === time_ms,
            is_world_record: wr.best === time_ms,
            rank: rank.rank,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /player/:playerId — player's speed run records
router.get('/player/:playerId', (req, res) => {
    try {
        const db = getDB();

        const runs = db.prepare(`
            SELECT sr.*, r.clean_name as game_name, r.system_id,
                   s.short_name as system_name, m.artwork_path
            FROM speedrun_records sr
            JOIN roms r ON r.id = sr.rom_id
            LEFT JOIN systems s ON s.id = r.system_id
            LEFT JOIN metadata m ON m.rom_id = r.id
            WHERE sr.player_id = ?
            ORDER BY sr.created_at DESC
        `).all(req.params.playerId);

        // Get personal bests per game+category
        const pbs = db.prepare(`
            SELECT rom_id, category, MIN(time_ms) as best_time
            FROM speedrun_records
            WHERE player_id = ?
            GROUP BY rom_id, category
        `).all(req.params.playerId);

        const pbMap = new Map();
        for (const pb of pbs) pbMap.set(`${pb.rom_id}:${pb.category}`, pb.best_time);

        const formatted = runs.map(r => ({
            ...r,
            time_formatted: formatTime(r.time_ms),
            is_personal_best: pbMap.get(`${r.rom_id}:${r.category}`) === r.time_ms,
        }));

        res.json({
            runs: formatted,
            personal_bests: pbs.map(p => ({ ...p, time_formatted: formatTime(p.best_time) })),
            total_runs: runs.length,
            unique_games: new Set(runs.map(r => r.rom_id)).size,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const millis = ms % 1000;
    if (minutes > 0) {
        return `${minutes}m ${seconds}.${String(millis).padStart(3, '0')}s`;
    }
    return `${seconds}.${String(millis).padStart(3, '0')}s`;
}

export default router;
