import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// Global leaderboard (top scores across all games)
router.get('/top', (req, res) => {
    const db = getDB();
    const limit = parseInt(req.query.limit) || 50;
    const scores = db.prepare(`
        SELECT hs.*, p.name as player_name, p.emoji, p.color,
               r.clean_name as game_name, r.system_id, m.artwork_path
        FROM high_scores hs
        JOIN players p ON p.id = hs.player_id
        JOIN roms r ON r.id = hs.rom_id
        LEFT JOIN metadata m ON m.rom_id = r.id
        ORDER BY hs.score DESC
        LIMIT ?
    `).all(limit);
    res.json(scores);
});

// Scores for a specific game
router.get('/game/:romId', (req, res) => {
    const db = getDB();
    const scores = db.prepare(`
        SELECT hs.*, p.name as player_name, p.emoji, p.color
        FROM high_scores hs
        JOIN players p ON p.id = hs.player_id
        WHERE hs.rom_id = ?
        ORDER BY hs.score DESC
        LIMIT 20
    `).all(req.params.romId);
    res.json(scores);
});

// Scores for a specific player
router.get('/player/:playerId', (req, res) => {
    const db = getDB();
    const scores = db.prepare(`
        SELECT hs.*, r.clean_name as game_name, r.system_id, m.artwork_path
        FROM high_scores hs
        JOIN roms r ON r.id = hs.rom_id
        LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE hs.player_id = ?
        ORDER BY hs.created_at DESC
        LIMIT 50
    `).all(req.params.playerId);
    res.json(scores);
});

// Submit a new high score
router.post('/', (req, res) => {
    const db = getDB();
    const { player_id, rom_id, score } = req.body;

    if (!player_id || !rom_id || score == null) {
        return res.status(400).json({ error: 'player_id, rom_id, and score required' });
    }

    const result = db.prepare(
        'INSERT INTO high_scores (player_id, rom_id, score) VALUES (?, ?, ?)'
    ).run(player_id, rom_id, score);

    // Check if it's a new personal best
    const best = db.prepare(
        'SELECT MAX(score) as best FROM high_scores WHERE player_id = ? AND rom_id = ?'
    ).get(player_id, rom_id);

    // Check rank
    const rank = db.prepare(
        'SELECT COUNT(*) + 1 as rank FROM high_scores WHERE rom_id = ? AND score > ?'
    ).get(rom_id, score);

    res.json({
        ok: true,
        id: result.lastInsertRowid,
        is_personal_best: best.best === score,
        rank: rank.rank,
    });
});

export default router;
