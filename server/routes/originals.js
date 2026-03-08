import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// List all original games
router.get('/', (req, res) => {
    const db = getDB();
    const games = db.prepare('SELECT * FROM original_games ORDER BY added_at').all();

    // Attach top 3 scores per game
    const topScores = db.prepare(`
        SELECT os.*, p.name as player_name, p.emoji, p.color
        FROM original_scores os
        JOIN players p ON p.id = os.player_id
        WHERE os.game_id = ?
        ORDER BY os.score DESC
        LIMIT 3
    `);

    for (const game of games) {
        game.top_scores = topScores.all(game.id);
    }
    res.json(games);
});

// Scores for a specific original game
router.get('/:gameId/scores', (req, res) => {
    const db = getDB();
    const scores = db.prepare(`
        SELECT os.*, p.name as player_name, p.emoji, p.color
        FROM original_scores os
        JOIN players p ON p.id = os.player_id
        WHERE os.game_id = ?
        ORDER BY os.score DESC
        LIMIT 50
    `).all(req.params.gameId);
    res.json(scores);
});

// Submit a score for an original game
router.post('/:gameId/scores', (req, res) => {
    const db = getDB();
    const { player_id, score, level, meta } = req.body;
    const game_id = req.params.gameId;

    if (!player_id || score == null) {
        return res.status(400).json({ error: 'player_id and score required' });
    }

    // Verify game exists
    const game = db.prepare('SELECT id FROM original_games WHERE id = ?').get(game_id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const result = db.prepare(
        'INSERT INTO original_scores (player_id, game_id, score, level, meta) VALUES (?, ?, ?, ?, ?)'
    ).run(player_id, game_id, score, level || 1, meta ? JSON.stringify(meta) : null);

    // Check personal best
    const best = db.prepare(
        'SELECT MAX(score) as best FROM original_scores WHERE player_id = ? AND game_id = ?'
    ).get(player_id, game_id);

    // Check rank
    const rank = db.prepare(
        'SELECT COUNT(*) + 1 as rank FROM original_scores WHERE game_id = ? AND score > ?'
    ).get(game_id, score);

    res.json({
        ok: true,
        id: result.lastInsertRowid,
        is_personal_best: best.best === score,
        rank: rank.rank,
    });
});

export default router;
