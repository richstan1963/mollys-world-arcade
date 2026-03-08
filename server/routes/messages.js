import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// GET /inbox/:playerId — get inbox (paginated, newest first)
router.get('/inbox/:playerId', (req, res) => {
    try {
        const db = getDB();
        const playerId = req.params.playerId;
        const limit = Math.min(parseInt(req.query.limit) || 30, 100);
        const offset = parseInt(req.query.offset) || 0;
        const unreadOnly = req.query.unread_only === 'true';

        let query = `
            SELECT pm.id, pm.from_player_id, pm.to_player_id, pm.type,
                   pm.subject, pm.body, pm.metadata, pm.is_read, pm.created_at,
                   p.name as sender_name, p.emoji as sender_emoji, p.color as sender_color
            FROM player_messages pm
            JOIN players p ON p.id = pm.from_player_id
            WHERE pm.to_player_id = ?
        `;
        const params = [playerId];

        if (unreadOnly) {
            query += ' AND pm.is_read = 0';
        }

        query += ' ORDER BY pm.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const messages = db.prepare(query).all(...params);

        // Parse metadata JSON
        const enriched = messages.map(m => ({
            ...m,
            metadata: m.metadata ? JSON.parse(m.metadata) : null,
        }));

        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /sent/:playerId — get sent messages
router.get('/sent/:playerId', (req, res) => {
    try {
        const db = getDB();
        const playerId = req.params.playerId;
        const limit = Math.min(parseInt(req.query.limit) || 30, 100);
        const offset = parseInt(req.query.offset) || 0;

        const messages = db.prepare(`
            SELECT pm.id, pm.from_player_id, pm.to_player_id, pm.type,
                   pm.subject, pm.body, pm.metadata, pm.is_read, pm.created_at,
                   p.name as recipient_name, p.emoji as recipient_emoji, p.color as recipient_color
            FROM player_messages pm
            JOIN players p ON p.id = pm.to_player_id
            WHERE pm.from_player_id = ?
            ORDER BY pm.created_at DESC
            LIMIT ? OFFSET ?
        `).all(playerId, limit, offset);

        const enriched = messages.map(m => ({
            ...m,
            metadata: m.metadata ? JSON.parse(m.metadata) : null,
        }));

        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /thread/:id — get single message with full details
router.get('/thread/:id', (req, res) => {
    try {
        const db = getDB();
        const msg = db.prepare(`
            SELECT pm.id, pm.from_player_id, pm.to_player_id, pm.type,
                   pm.subject, pm.body, pm.metadata, pm.is_read, pm.created_at,
                   sp.name as sender_name, sp.emoji as sender_emoji, sp.color as sender_color,
                   rp.name as recipient_name, rp.emoji as recipient_emoji, rp.color as recipient_color
            FROM player_messages pm
            JOIN players sp ON sp.id = pm.from_player_id
            JOIN players rp ON rp.id = pm.to_player_id
            WHERE pm.id = ?
        `).get(req.params.id);

        if (!msg) return res.status(404).json({ error: 'Message not found' });

        res.json({
            ...msg,
            metadata: msg.metadata ? JSON.parse(msg.metadata) : null,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /send — send a message
router.post('/send', (req, res) => {
    try {
        const db = getDB();
        const { from_player_id, to_player_id, type, subject, body, metadata } = req.body;

        if (!from_player_id || !to_player_id || !type || !body) {
            return res.status(400).json({ error: 'from_player_id, to_player_id, type, and body are required' });
        }

        const validTypes = ['message', 'clan_invite', 'challenge', 'game_rec', 'system'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
        }

        // Verify both players exist
        const fromPlayer = db.prepare('SELECT id, name, emoji FROM players WHERE id = ?').get(from_player_id);
        const toPlayer = db.prepare('SELECT id, name FROM players WHERE id = ?').get(to_player_id);
        if (!fromPlayer) return res.status(404).json({ error: 'Sender not found' });
        if (!toPlayer) return res.status(404).json({ error: 'Recipient not found' });

        const metadataStr = metadata ? JSON.stringify(metadata) : null;

        const result = db.prepare(`
            INSERT INTO player_messages (from_player_id, to_player_id, type, subject, body, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(from_player_id, to_player_id, type, subject || null, body, metadataStr);

        // Also create a notification
        let notifTitle = `New message from ${fromPlayer.emoji} ${fromPlayer.name}`;
        let notifData = { message_id: result.lastInsertRowid };

        if (type === 'clan_invite') {
            const meta = metadata || {};
            notifTitle = `${fromPlayer.emoji} ${fromPlayer.name} invited you to ${meta.clan_name || 'a clan'}`;
            notifData.clan_id = meta.clan_id;
        } else if (type === 'challenge') {
            const meta = metadata || {};
            notifTitle = `${fromPlayer.emoji} ${fromPlayer.name} challenged you${meta.game_name ? ` at ${meta.game_name}` : ''}!`;
            notifData.rom_id = meta.rom_id;
        } else if (type === 'game_rec') {
            const meta = metadata || {};
            notifTitle = `${fromPlayer.emoji} ${fromPlayer.name} recommended ${meta.game_name || 'a game'}`;
            notifData.rom_id = meta.rom_id;
        }

        db.prepare(`
            INSERT INTO notifications (player_id, type, title, message, data)
            VALUES (?, ?, ?, ?, ?)
        `).run(to_player_id, type, notifTitle, body, JSON.stringify(notifData));

        const newMsg = db.prepare('SELECT * FROM player_messages WHERE id = ?').get(result.lastInsertRowid);

        res.json({
            ...newMsg,
            metadata: newMsg.metadata ? JSON.parse(newMsg.metadata) : null,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /:id/read — mark message as read
router.patch('/:id/read', (req, res) => {
    try {
        const db = getDB();
        const result = db.prepare('UPDATE player_messages SET is_read = 1 WHERE id = ?').run(req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Message not found' });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /:playerId/read-all — mark all messages as read for a player
router.post('/:playerId/read-all', (req, res) => {
    try {
        const db = getDB();
        const result = db.prepare('UPDATE player_messages SET is_read = 1 WHERE to_player_id = ? AND is_read = 0').run(req.params.playerId);
        res.json({ ok: true, marked: result.changes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /:id — delete a message
router.delete('/:id', (req, res) => {
    try {
        const db = getDB();
        const result = db.prepare('DELETE FROM player_messages WHERE id = ?').run(req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Message not found' });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /unread-count/:playerId — get unread message count (for badge)
router.get('/unread-count/:playerId', (req, res) => {
    try {
        const db = getDB();
        const count = db.prepare('SELECT COUNT(*) as count FROM player_messages WHERE to_player_id = ? AND is_read = 0').get(req.params.playerId);
        res.json({ unread: count.count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
