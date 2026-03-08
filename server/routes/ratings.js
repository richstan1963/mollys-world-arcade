import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// Get all ratings for a ROM (with player info + average)
router.get('/:romId', (req, res) => {
    const db = getDB();
    const ratings = db.prepare(`
        SELECT pr.*, p.name, p.emoji, p.color
        FROM player_ratings pr
        JOIN players p ON p.id = pr.player_id
        WHERE pr.rom_id = ?
        ORDER BY pr.rated_at DESC
    `).all(req.params.romId);

    const avg = ratings.length > 0
        ? (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1)
        : null;

    res.json({ ratings, average: avg, count: ratings.length });
});

// Set/update a player's rating for a ROM
router.post('/:romId', (req, res) => {
    const db = getDB();
    const { player_id, rating } = req.body;

    if (!player_id || !rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'player_id and rating (1-5) required' });
    }

    db.prepare(`
        INSERT INTO player_ratings (player_id, rom_id, rating)
        VALUES (?, ?, ?)
        ON CONFLICT(player_id, rom_id) DO UPDATE SET rating = ?, rated_at = datetime('now')
    `).run(player_id, req.params.romId, rating, rating);

    res.json({ ok: true, player_id, rom_id: parseInt(req.params.romId), rating });
});

// Delete a player's rating
router.delete('/:romId/:playerId', (req, res) => {
    const db = getDB();
    db.prepare('DELETE FROM player_ratings WHERE player_id = ? AND rom_id = ?')
        .run(req.params.playerId, req.params.romId);
    res.json({ ok: true });
});

export default router;
