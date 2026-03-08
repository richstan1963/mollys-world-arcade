import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// GET /:playerId — get player's notifications (unread first)
router.get('/:playerId', (req, res) => {
    try {
        const db = getDB();
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);

        const notifications = db.prepare(`
            SELECT * FROM notifications
            WHERE player_id = ?
            ORDER BY read ASC, created_at DESC
            LIMIT ?
        `).all(req.params.playerId, limit);

        // Parse JSON data field
        const parsed = notifications.map(n => ({
            ...n,
            data: n.data ? JSON.parse(n.data) : null,
        }));

        res.json(parsed);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /:playerId/unread-count — badge count
router.get('/:playerId/unread-count', (req, res) => {
    try {
        const db = getDB();
        const count = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE player_id = ? AND read = 0').get(req.params.playerId);
        res.json({ count: count.count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST / — create notification
router.post('/', (req, res) => {
    try {
        const db = getDB();
        const { player_id, type, title, message, data } = req.body;

        if (!player_id || !type || !title) {
            return res.status(400).json({ error: 'player_id, type, and title are required' });
        }

        const result = db.prepare(`
            INSERT INTO notifications (player_id, type, title, message, data)
            VALUES (?, ?, ?, ?, ?)
        `).run(player_id, type, title, message || null, data ? JSON.stringify(data) : null);

        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /:id/read — mark as read
router.patch('/:id/read', (req, res) => {
    try {
        const db = getDB();
        const result = db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(req.params.id);

        if (result.changes === 0) return res.status(404).json({ error: 'Notification not found' });

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /:playerId/read-all — mark all as read
router.post('/:playerId/read-all', (req, res) => {
    try {
        const db = getDB();
        const result = db.prepare('UPDATE notifications SET read = 1 WHERE player_id = ? AND read = 0').run(req.params.playerId);

        res.json({ ok: true, marked: result.changes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
