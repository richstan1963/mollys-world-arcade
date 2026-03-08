import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// GET /:playerId — get player's friends with activity
router.get('/:playerId', (req, res) => {
    try {
        const db = getDB();
        const playerId = req.params.playerId;

        const friends = db.prepare(`
            SELECT p.id, p.name, p.emoji, p.color, p.xp, p.level, p.bio,
                   f.created_at as friends_since,
                   (SELECT COUNT(*) FROM play_history WHERE player_id = p.id) as total_plays,
                   (SELECT MAX(started_at) FROM play_history WHERE player_id = p.id) as last_active,
                   (SELECT r.clean_name FROM play_history ph
                    JOIN roms r ON r.id = ph.rom_id
                    WHERE ph.player_id = p.id
                    ORDER BY ph.started_at DESC LIMIT 1) as last_game
            FROM friends f
            JOIN players p ON p.id = f.friend_id
            WHERE f.player_id = ?
            ORDER BY p.name ASC
        `).all(playerId);

        res.json(friends);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST / — add friend (adds both directions)
router.post('/', (req, res) => {
    try {
        const db = getDB();
        const { player_id, friend_id } = req.body;

        if (!player_id || !friend_id) return res.status(400).json({ error: 'player_id and friend_id are required' });
        if (player_id === friend_id) return res.status(400).json({ error: 'Cannot friend yourself' });

        // Verify both players exist
        const p1 = db.prepare('SELECT id FROM players WHERE id = ?').get(player_id);
        const p2 = db.prepare('SELECT id FROM players WHERE id = ?').get(friend_id);
        if (!p1 || !p2) return res.status(404).json({ error: 'Player not found' });

        const tx = db.transaction(() => {
            db.prepare('INSERT OR IGNORE INTO friends (player_id, friend_id) VALUES (?, ?)').run(player_id, friend_id);
            db.prepare('INSERT OR IGNORE INTO friends (player_id, friend_id) VALUES (?, ?)').run(friend_id, player_id);
        });
        tx();

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE / — remove friend (removes both directions)
router.delete('/', (req, res) => {
    try {
        const db = getDB();
        const { player_id, friend_id } = req.body;

        if (!player_id || !friend_id) return res.status(400).json({ error: 'player_id and friend_id are required' });

        const tx = db.transaction(() => {
            db.prepare('DELETE FROM friends WHERE player_id = ? AND friend_id = ?').run(player_id, friend_id);
            db.prepare('DELETE FROM friends WHERE player_id = ? AND friend_id = ?').run(friend_id, player_id);
        });
        tx();

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /:playerId/activity — friends' recent activity feed
router.get('/:playerId/activity', (req, res) => {
    try {
        const db = getDB();
        const playerId = req.params.playerId;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);

        const activity = db.prepare(`
            SELECT af.*, p.name as player_name, p.emoji, p.color,
                   r.clean_name as game_name, r.system_id
            FROM activity_feed af
            JOIN players p ON p.id = af.player_id
            LEFT JOIN roms r ON r.id = af.rom_id
            WHERE af.player_id IN (
                SELECT friend_id FROM friends WHERE player_id = ?
            )
            ORDER BY af.created_at DESC
            LIMIT ?
        `).all(playerId, limit);

        res.json(activity);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
