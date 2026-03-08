import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// SSE channel listeners: Map<channelKey, Set<res>>
const channels = new Map();

function broadcast(channelKey, data) {
    const listeners = channels.get(channelKey);
    if (!listeners) return;
    const event = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of listeners) {
        res.write(event);
    }
}

// GET /messages — get recent messages for a channel
router.get('/messages', (req, res) => {
    try {
        const db = getDB();
        const channelType = req.query.channel_type || 'global';
        const channelId = req.query.channel_id || null;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);

        const messages = db.prepare(`
            SELECT cm.id, cm.channel_type, cm.channel_id, cm.sender_id,
                   cm.message, cm.reply_to_id, cm.created_at,
                   p.name as sender_name, p.emoji as sender_emoji, p.color as sender_color,
                   rm.message as reply_message, rp.name as reply_sender_name
            FROM chat_messages cm
            JOIN players p ON p.id = cm.sender_id
            LEFT JOIN chat_messages rm ON rm.id = cm.reply_to_id
            LEFT JOIN players rp ON rp.id = rm.sender_id
            WHERE cm.channel_type = ?
              AND (cm.channel_id IS ? OR (cm.channel_id IS NULL AND ? IS NULL))
            ORDER BY cm.created_at DESC
            LIMIT ?
        `).all(channelType, channelId, channelId, limit);

        // Return in chronological order (oldest first)
        res.json(messages.reverse());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /send — send a chat message
router.post('/send', (req, res) => {
    try {
        const db = getDB();
        const { channel_type, channel_id, sender_id, message, reply_to_id } = req.body;

        if (!channel_type || !sender_id || !message) {
            return res.status(400).json({ error: 'channel_type, sender_id, and message are required' });
        }

        if (!['global', 'clan', 'dm'].includes(channel_type)) {
            return res.status(400).json({ error: 'channel_type must be global, clan, or dm' });
        }

        if (message.length > 500) {
            return res.status(400).json({ error: 'Message too long (max 500 characters)' });
        }

        // Verify sender exists
        const sender = db.prepare('SELECT id, name, emoji, color FROM players WHERE id = ?').get(sender_id);
        if (!sender) return res.status(404).json({ error: 'Sender not found' });

        // For DM channels, normalize the channel_id so it's always sorted (lower:higher)
        let normalizedChannelId = channel_id || null;
        if (channel_type === 'dm' && normalizedChannelId) {
            const parts = normalizedChannelId.split(':').map(Number).sort((a, b) => a - b);
            normalizedChannelId = parts.join(':');
        }

        // Verify reply_to exists if provided
        if (reply_to_id) {
            const replyMsg = db.prepare('SELECT id FROM chat_messages WHERE id = ?').get(reply_to_id);
            if (!replyMsg) return res.status(404).json({ error: 'Reply message not found' });
        }

        const result = db.prepare(`
            INSERT INTO chat_messages (channel_type, channel_id, sender_id, message, reply_to_id)
            VALUES (?, ?, ?, ?, ?)
        `).run(channel_type, normalizedChannelId, sender_id, message, reply_to_id || null);

        const newMessage = db.prepare(`
            SELECT cm.id, cm.channel_type, cm.channel_id, cm.sender_id,
                   cm.message, cm.reply_to_id, cm.created_at,
                   p.name as sender_name, p.emoji as sender_emoji, p.color as sender_color
            FROM chat_messages cm
            JOIN players p ON p.id = cm.sender_id
            WHERE cm.id = ?
        `).get(result.lastInsertRowid);

        // Broadcast to SSE listeners
        const key = `${channel_type}:${normalizedChannelId || 'global'}`;
        broadcast(key, { type: 'message', ...newMessage });

        // Update sender presence
        db.prepare(`
            INSERT INTO player_presence (player_id, status, last_seen, updated_at)
            VALUES (?, 'online', datetime('now'), datetime('now'))
            ON CONFLICT(player_id) DO UPDATE SET
                status = 'online',
                last_seen = datetime('now'),
                updated_at = datetime('now')
        `).run(sender_id);

        res.json(newMessage);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /stream — SSE stream for real-time messages
router.get('/stream', (req, res) => {
    const channelType = req.query.channel_type || 'global';
    const channelId = req.query.channel_id || 'global';
    const playerId = req.query.player_id;
    const key = `${channelType}:${channelId}`;

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'connected', channel: key })}\n\n`);

    if (!channels.has(key)) channels.set(key, new Set());
    channels.get(key).add(res);

    // Update player presence if player_id provided
    if (playerId) {
        try {
            const db = getDB();
            db.prepare(`
                INSERT INTO player_presence (player_id, status, last_seen, updated_at)
                VALUES (?, 'online', datetime('now'), datetime('now'))
                ON CONFLICT(player_id) DO UPDATE SET
                    status = 'online',
                    last_seen = datetime('now'),
                    updated_at = datetime('now')
            `).run(playerId);
        } catch {}
    }

    // Heartbeat every 30 seconds to keep connection alive
    const heartbeat = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`);
    }, 30000);

    req.on('close', () => {
        clearInterval(heartbeat);
        channels.get(key)?.delete(res);
        if (channels.get(key)?.size === 0) channels.delete(key);

        // Set player to offline
        if (playerId) {
            try {
                const db = getDB();
                db.prepare(`
                    UPDATE player_presence SET status = 'offline', updated_at = datetime('now')
                    WHERE player_id = ?
                `).run(playerId);
            } catch {}
        }
    });
});

// GET /online — list online players (last seen within 5 minutes)
router.get('/online', (req, res) => {
    try {
        const db = getDB();
        const players = db.prepare(`
            SELECT pp.player_id, pp.status, pp.current_game, pp.current_rom_id,
                   pp.last_seen, pp.updated_at,
                   p.name, p.emoji, p.color
            FROM player_presence pp
            JOIN players p ON p.id = pp.player_id
            WHERE pp.status != 'offline'
              AND pp.last_seen >= datetime('now', '-5 minutes')
            ORDER BY p.name ASC
        `).all();

        res.json(players);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /presence — update player presence
router.post('/presence', (req, res) => {
    try {
        const db = getDB();
        const { player_id, status, current_game, current_rom_id } = req.body;

        if (!player_id) return res.status(400).json({ error: 'player_id is required' });

        const validStatuses = ['online', 'playing', 'idle', 'offline'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
        }

        // Verify player exists
        const player = db.prepare('SELECT id FROM players WHERE id = ?').get(player_id);
        if (!player) return res.status(404).json({ error: 'Player not found' });

        db.prepare(`
            INSERT INTO player_presence (player_id, status, current_game, current_rom_id, last_seen, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(player_id) DO UPDATE SET
                status = ?,
                current_game = ?,
                current_rom_id = ?,
                last_seen = datetime('now'),
                updated_at = datetime('now')
        `).run(
            player_id, status || 'online', current_game || null, current_rom_id || null,
            status || 'online', current_game || null, current_rom_id || null
        );

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /dm-channels/:playerId — list DM conversations for a player
router.get('/dm-channels/:playerId', (req, res) => {
    try {
        const db = getDB();
        const playerId = req.params.playerId;

        // Find all unique DM channel_ids that involve this player
        const dmChannels = db.prepare(`
            SELECT DISTINCT cm.channel_id,
                   (SELECT cm2.message FROM chat_messages cm2
                    WHERE cm2.channel_type = 'dm' AND cm2.channel_id = cm.channel_id
                    ORDER BY cm2.created_at DESC LIMIT 1) as last_message,
                   (SELECT cm2.created_at FROM chat_messages cm2
                    WHERE cm2.channel_type = 'dm' AND cm2.channel_id = cm.channel_id
                    ORDER BY cm2.created_at DESC LIMIT 1) as last_message_at,
                   (SELECT cm2.sender_id FROM chat_messages cm2
                    WHERE cm2.channel_type = 'dm' AND cm2.channel_id = cm.channel_id
                    ORDER BY cm2.created_at DESC LIMIT 1) as last_sender_id
            FROM chat_messages cm
            WHERE cm.channel_type = 'dm'
              AND (cm.channel_id LIKE ? || ':%' OR cm.channel_id LIKE '%:' || ?)
            ORDER BY last_message_at DESC
        `).all(playerId, playerId);

        // Enrich with other player's info
        const enriched = dmChannels.map(ch => {
            const ids = ch.channel_id.split(':').map(Number);
            const otherId = ids[0] === Number(playerId) ? ids[1] : ids[0];
            const otherPlayer = db.prepare('SELECT id, name, emoji, color FROM players WHERE id = ?').get(otherId);
            return {
                channel_id: ch.channel_id,
                other_player: otherPlayer || { id: otherId, name: 'Unknown', emoji: '?', color: '#666' },
                last_message: ch.last_message,
                last_message_at: ch.last_message_at,
                last_sender_id: ch.last_sender_id,
            };
        });

        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
