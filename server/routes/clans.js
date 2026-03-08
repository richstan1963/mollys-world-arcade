import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// List all clans with their players (many-to-many via clan_members)
router.get('/', (req, res) => {
    const db = getDB();
    const clans = db.prepare('SELECT * FROM clans ORDER BY sort_order').all();
    const players = db.prepare(`
        SELECT p.*,
               (SELECT COUNT(*) FROM player_favorites pf WHERE pf.player_id = p.id) as fav_count
        FROM players p
        ORDER BY p.sort_order
    `).all();

    // Get all clan memberships
    const memberships = db.prepare(`
        SELECT cm.player_id, cm.clan_id
        FROM clan_members cm
    `).all();

    // Build a set of clan IDs per player
    const playerClans = {};
    for (const m of memberships) {
        if (!playerClans[m.player_id]) playerClans[m.player_id] = new Set();
        playerClans[m.player_id].add(m.clan_id);
    }

    // Group players by clan (players can appear in multiple clans)
    const clanMap = {};
    for (const clan of clans) {
        clanMap[clan.id] = { ...clan, players: [] };
    }
    clanMap[0] = { id: 0, name: 'Unassigned', emoji: '🎮', color: '#94A3B8', sort_order: 999, players: [] };

    for (const player of players) {
        const pClans = playerClans[player.id];
        if (!pClans || pClans.size === 0) {
            clanMap[0].players.push({ ...player, clan_ids: [] });
        } else {
            for (const cid of pClans) {
                if (clanMap[cid]) {
                    clanMap[cid].players.push({ ...player, clan_ids: [...pClans] });
                }
            }
            // Don't add to unassigned if they're in at least one clan
        }
    }

    // Attach clan_ids to all players for the flat list too
    const enrichedPlayers = players.map(p => ({
        ...p,
        clan_ids: playerClans[p.id] ? [...playerClans[p.id]] : [],
    }));

    res.json({
        clans: Object.values(clanMap).sort((a, b) => a.sort_order - b.sort_order),
        players: enrichedPlayers,
    });
});

// Create a new clan
router.post('/', (req, res) => {
    const db = getDB();
    const { name, emoji, color } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Clan name is required' });

    const existing = db.prepare('SELECT id FROM clans WHERE name = ?').get(name.trim());
    if (existing) return res.status(409).json({ error: 'Clan already exists' });

    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM clans').get().m || 0;
    const result = db.prepare(
        'INSERT INTO clans (name, emoji, color, sort_order) VALUES (?, ?, ?, ?)'
    ).run(name.trim(), emoji || '⚔️', color || '#A855F7', maxOrder + 1);

    const clan = db.prepare('SELECT * FROM clans WHERE id = ?').get(result.lastInsertRowid);
    res.json(clan);
});

// Update a clan
router.patch('/:id', (req, res) => {
    const db = getDB();
    const clanId = parseInt(req.params.id);
    const clan = db.prepare('SELECT * FROM clans WHERE id = ?').get(clanId);
    if (!clan) return res.status(404).json({ error: 'Clan not found' });

    const { name, emoji, color } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined && name.trim()) { updates.push('name = ?'); values.push(name.trim()); }
    if (emoji !== undefined) { updates.push('emoji = ?'); values.push(emoji); }
    if (color !== undefined) { updates.push('color = ?'); values.push(color); }

    if (updates.length === 0) return res.json(clan);

    values.push(clanId);
    db.prepare(`UPDATE clans SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM clans WHERE id = ?').get(clanId);
    res.json(updated);
});

// Delete a clan (memberships removed via CASCADE)
router.delete('/:id', (req, res) => {
    const db = getDB();
    const clanId = parseInt(req.params.id);
    const clan = db.prepare('SELECT * FROM clans WHERE id = ?').get(clanId);
    if (!clan) return res.status(404).json({ error: 'Clan not found' });

    db.prepare('DELETE FROM clan_members WHERE clan_id = ?').run(clanId);
    db.prepare('DELETE FROM clans WHERE id = ?').run(clanId);
    res.json({ deleted: true, clan });
});

// Add a player to a clan
router.post('/add-member', (req, res) => {
    const db = getDB();
    const { player_id, clan_id } = req.body;
    if (!player_id || !clan_id) return res.status(400).json({ error: 'player_id and clan_id required' });

    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(parseInt(player_id));
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const clan = db.prepare('SELECT * FROM clans WHERE id = ?').get(parseInt(clan_id));
    if (!clan) return res.status(404).json({ error: 'Clan not found' });

    db.prepare('INSERT OR IGNORE INTO clan_members (player_id, clan_id) VALUES (?, ?)').run(parseInt(player_id), parseInt(clan_id));
    const clans = db.prepare('SELECT clan_id FROM clan_members WHERE player_id = ?').all(parseInt(player_id));
    res.json({ ...player, clan_ids: clans.map(c => c.clan_id) });
});

// Remove a player from a clan
router.post('/remove-member', (req, res) => {
    const db = getDB();
    const { player_id, clan_id } = req.body;
    if (!player_id || !clan_id) return res.status(400).json({ error: 'player_id and clan_id required' });

    db.prepare('DELETE FROM clan_members WHERE player_id = ? AND clan_id = ?').run(parseInt(player_id), parseInt(clan_id));
    const clans = db.prepare('SELECT clan_id FROM clan_members WHERE player_id = ?').all(parseInt(player_id));
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(parseInt(player_id));
    res.json({ ...player, clan_ids: clans.map(c => c.clan_id) });
});

// Legacy move-player (set single clan — removes from all others, adds to new one)
router.post('/move-player', (req, res) => {
    const db = getDB();
    const { player_id, clan_id } = req.body;
    if (!player_id) return res.status(400).json({ error: 'player_id required' });

    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(parseInt(player_id));
    if (!player) return res.status(404).json({ error: 'Player not found' });

    // Remove from all clans first
    db.prepare('DELETE FROM clan_members WHERE player_id = ?').run(parseInt(player_id));

    if (clan_id !== null && clan_id !== undefined && clan_id !== 0) {
        const clan = db.prepare('SELECT * FROM clans WHERE id = ?').get(parseInt(clan_id));
        if (!clan) return res.status(404).json({ error: 'Clan not found' });
        db.prepare('INSERT INTO clan_members (player_id, clan_id) VALUES (?, ?)').run(parseInt(player_id), parseInt(clan_id));
    }

    const clans = db.prepare('SELECT clan_id FROM clan_members WHERE player_id = ?').all(parseInt(player_id));
    res.json({ ...player, clan_ids: clans.map(c => c.clan_id) });
});

// Reorder clans
router.post('/reorder', (req, res) => {
    const db = getDB();
    const { order } = req.body; // array of clan IDs in desired order
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });

    const stmt = db.prepare('UPDATE clans SET sort_order = ? WHERE id = ?');
    const tx = db.transaction(() => {
        order.forEach((id, idx) => stmt.run(idx + 1, id));
    });
    tx();
    res.json({ ok: true });
});

export default router;
