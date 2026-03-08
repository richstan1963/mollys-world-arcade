import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// GET /hub — Full social hub data for the "All Players" command center
// Returns all players with their settings, clan, online status, stats, and relationship to requesting player
router.get('/hub', (req, res) => {
    try {
        const db = getDB();
        const viewerId = parseInt(req.query.viewer_id) || null;

        // Get all players with their settings, clan info, presence, and stats
        const players = db.prepare(`
            SELECT p.id, p.name, p.emoji, p.color, p.xp, p.level,
                   ps.bio, ps.status_message, ps.allow_dms, ps.allow_chat,
                   ps.show_online, ps.show_activity, ps.show_favorites,
                   ps.allow_clan_invites, ps.allow_challenges,
                   pp.status as presence_status, pp.current_game, pp.current_rom_id, pp.last_seen,
                   cm.clan_id,
                   c.name as clan_name, c.emoji as clan_emoji, c.color as clan_color,
                   (SELECT COUNT(*) FROM play_history WHERE player_id = p.id) as total_plays,
                   (SELECT COALESCE(SUM(duration_seconds), 0) FROM play_history WHERE player_id = p.id) as total_seconds,
                   (SELECT COUNT(*) FROM player_favorites WHERE player_id = p.id) as fav_count,
                   (SELECT COUNT(*) FROM achievements WHERE player_id = p.id) as achievement_count,
                   (SELECT COUNT(*) FROM high_scores WHERE player_id = p.id) as score_count,
                   (SELECT COUNT(*) FROM friends WHERE player_id = p.id) as friend_count
            FROM players p
            LEFT JOIN player_settings ps ON ps.player_id = p.id
            LEFT JOIN player_presence pp ON pp.player_id = p.id
            LEFT JOIN clan_members cm ON cm.player_id = p.id
            LEFT JOIN clans c ON c.id = cm.clan_id
            ORDER BY p.name ASC
        `).all();

        // If viewer is specified, get their relationships
        let blockedByViewer = new Set();
        let blockedViewer = new Set();
        let friendsOfViewer = new Set();

        if (viewerId) {
            // Players the viewer blocked
            const blocked = db.prepare('SELECT blocked_player_id FROM blocked_players WHERE player_id = ?').all(viewerId);
            blockedByViewer = new Set(blocked.map(b => b.blocked_player_id));

            // Players who blocked the viewer
            const blockers = db.prepare('SELECT player_id FROM blocked_players WHERE blocked_player_id = ?').all(viewerId);
            blockedViewer = new Set(blockers.map(b => b.player_id));

            // Friends (bidirectional — row exists = friends)
            const friends = db.prepare('SELECT friend_id FROM friends WHERE player_id = ?').all(viewerId);
            friendsOfViewer = new Set(friends.map(f => f.friend_id));
        }

        // Determine online status: online if last_seen < 5 min ago
        const now = Date.now();
        const enriched = players.map(p => {
            const lastSeen = p.last_seen ? new Date(p.last_seen + (p.last_seen.includes('Z') ? '' : 'Z')).getTime() : 0;
            const isOnline = p.show_online !== 0 && (now - lastSeen < 300000); // 5 min
            const isPlaying = isOnline && p.presence_status === 'playing';

            return {
                id: p.id,
                name: p.name,
                emoji: p.emoji,
                color: p.color,
                xp: p.xp || 0,
                level: p.level || 1,
                bio: p.bio || '',
                status_message: p.status_message || '',
                clan: p.clan_id ? { id: p.clan_id, name: p.clan_name, emoji: p.clan_emoji, color: p.clan_color } : null,
                presence: {
                    online: isOnline,
                    playing: isPlaying,
                    current_game: isPlaying ? p.current_game : null,
                    status: isOnline ? (isPlaying ? 'playing' : 'online') : 'offline',
                    last_seen: p.last_seen,
                },
                stats: {
                    total_plays: p.total_plays,
                    total_hours: Math.round(p.total_seconds / 3600 * 10) / 10,
                    favorites: p.fav_count,
                    achievements: p.achievement_count,
                    scores: p.score_count,
                    friends: p.friend_count,
                },
                privacy: {
                    allow_dms: p.allow_dms !== 0,
                    allow_chat: p.allow_chat !== 0,
                    show_online: p.show_online !== 0,
                    show_activity: p.show_activity !== 0,
                    show_favorites: p.show_favorites !== 0,
                    allow_clan_invites: p.allow_clan_invites !== 0,
                    allow_challenges: p.allow_challenges !== 0,
                },
                relationship: viewerId ? {
                    is_self: p.id === viewerId,
                    is_friend: friendsOfViewer.has(p.id),
                    is_blocked: blockedByViewer.has(p.id),
                    blocked_you: blockedViewer.has(p.id),
                } : null,
            };
        });

        res.json({ players: enriched });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /settings/:playerId — Get player's social settings
router.get('/settings/:playerId', (req, res) => {
    try {
        const db = getDB();
        const playerId = req.params.playerId;

        let settings = db.prepare('SELECT * FROM player_settings WHERE player_id = ?').get(playerId);
        if (!settings) {
            // Create default settings
            db.prepare('INSERT OR IGNORE INTO player_settings (player_id) VALUES (?)').run(playerId);
            settings = db.prepare('SELECT * FROM player_settings WHERE player_id = ?').get(playerId);
        }

        const blocked = db.prepare(`
            SELECT bp.blocked_player_id, p.name, p.emoji, p.color
            FROM blocked_players bp
            JOIN players p ON p.id = bp.blocked_player_id
            WHERE bp.player_id = ?
        `).all(playerId);

        res.json({ settings, blocked_players: blocked });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /settings/:playerId — Update social settings
router.put('/settings/:playerId', (req, res) => {
    try {
        const db = getDB();
        const playerId = req.params.playerId;
        const allowed = ['allow_dms', 'allow_chat', 'show_online', 'show_activity', 'show_favorites', 'allow_clan_invites', 'allow_challenges', 'bio', 'status_message'];

        // Ensure row exists
        db.prepare('INSERT OR IGNORE INTO player_settings (player_id) VALUES (?)').run(playerId);

        const updates = [];
        const params = [];
        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                updates.push(`${key} = ?`);
                params.push(typeof req.body[key] === 'boolean' ? (req.body[key] ? 1 : 0) : req.body[key]);
            }
        }

        if (updates.length > 0) {
            updates.push("updated_at = datetime('now')");
            params.push(playerId);
            db.prepare(`UPDATE player_settings SET ${updates.join(', ')} WHERE player_id = ?`).run(...params);
        }

        const settings = db.prepare('SELECT * FROM player_settings WHERE player_id = ?').get(playerId);
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /block — Block a player
router.post('/block', (req, res) => {
    try {
        const db = getDB();
        const { player_id, blocked_player_id } = req.body;
        if (!player_id || !blocked_player_id) return res.status(400).json({ error: 'player_id and blocked_player_id required' });
        if (player_id === blocked_player_id) return res.status(400).json({ error: 'Cannot block yourself' });

        db.prepare('INSERT OR IGNORE INTO blocked_players (player_id, blocked_player_id) VALUES (?, ?)').run(player_id, blocked_player_id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /unblock — Unblock a player
router.post('/unblock', (req, res) => {
    try {
        const db = getDB();
        const { player_id, blocked_player_id } = req.body;
        if (!player_id || !blocked_player_id) return res.status(400).json({ error: 'player_id and blocked_player_id required' });

        db.prepare('DELETE FROM blocked_players WHERE player_id = ? AND blocked_player_id = ?').run(player_id, blocked_player_id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /invite-to-clan — Send clan invite message
router.post('/invite-to-clan', (req, res) => {
    try {
        const db = getDB();
        const { from_player_id, to_player_id, clan_id } = req.body;
        if (!from_player_id || !to_player_id || !clan_id) return res.status(400).json({ error: 'from_player_id, to_player_id, and clan_id required' });

        // Check target allows clan invites
        const targetSettings = db.prepare('SELECT allow_clan_invites FROM player_settings WHERE player_id = ?').get(to_player_id);
        if (targetSettings && !targetSettings.allow_clan_invites) {
            return res.status(403).json({ error: 'This player has disabled clan invites' });
        }

        // Check not blocked
        const isBlocked = db.prepare('SELECT 1 FROM blocked_players WHERE player_id = ? AND blocked_player_id = ?').get(to_player_id, from_player_id);
        if (isBlocked) return res.status(403).json({ error: 'Cannot send invite to this player' });

        // Get clan info
        const clan = db.prepare('SELECT name, emoji FROM clans WHERE id = ?').get(clan_id);
        if (!clan) return res.status(404).json({ error: 'Clan not found' });

        const sender = db.prepare('SELECT name, emoji FROM players WHERE id = ?').get(from_player_id);

        // Create message
        const result = db.prepare(`
            INSERT INTO player_messages (from_player_id, to_player_id, type, subject, body, metadata)
            VALUES (?, ?, 'clan_invite', ?, ?, ?)
        `).run(
            from_player_id, to_player_id,
            `${clan.emoji} Clan Invite: ${clan.name}`,
            `${sender?.name || 'Someone'} wants you to join ${clan.emoji} ${clan.name}!`,
            JSON.stringify({ clan_id, clan_name: clan.name, clan_emoji: clan.emoji })
        );

        res.json({ ok: true, message_id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /challenge — Send a challenge
router.post('/challenge', (req, res) => {
    try {
        const db = getDB();
        const { from_player_id, to_player_id, rom_id, game_name, message } = req.body;
        if (!from_player_id || !to_player_id) return res.status(400).json({ error: 'from_player_id and to_player_id required' });

        // Check target allows challenges
        const targetSettings = db.prepare('SELECT allow_challenges FROM player_settings WHERE player_id = ?').get(to_player_id);
        if (targetSettings && !targetSettings.allow_challenges) {
            return res.status(403).json({ error: 'This player has disabled challenges' });
        }

        // Check not blocked
        const isBlocked = db.prepare('SELECT 1 FROM blocked_players WHERE player_id = ? AND blocked_player_id = ?').get(to_player_id, from_player_id);
        if (isBlocked) return res.status(403).json({ error: 'Cannot send challenge to this player' });

        const sender = db.prepare('SELECT name, emoji FROM players WHERE id = ?').get(from_player_id);

        const result = db.prepare(`
            INSERT INTO player_messages (from_player_id, to_player_id, type, subject, body, metadata)
            VALUES (?, ?, 'challenge', ?, ?, ?)
        `).run(
            from_player_id, to_player_id,
            `Challenge from ${sender?.name || 'Someone'}!`,
            message || `${sender?.name || 'Someone'} challenges you${game_name ? ` to ${game_name}` : ''}!`,
            JSON.stringify({ rom_id, game_name })
        );

        res.json({ ok: true, message_id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
