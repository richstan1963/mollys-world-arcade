import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// GET / — all collections (system + player-created)
router.get('/', (req, res) => {
    try {
        const db = getDB();
        const playerId = req.query.player_id;

        let sql = `
            SELECT gc.*,
                   p.name as creator_name, p.emoji as creator_emoji,
                   (SELECT COUNT(*) FROM collection_games WHERE collection_id = gc.id) as game_count
            FROM game_collections gc
            LEFT JOIN players p ON p.id = gc.player_id
        `;
        const params = [];

        if (playerId) {
            sql += ' WHERE gc.is_system = 1 OR gc.player_id = ?';
            params.push(playerId);
        }

        sql += ' ORDER BY gc.is_system DESC, gc.sort_order ASC, gc.created_at DESC';

        const collections = db.prepare(sql).all(...params);
        res.json(collections);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST / — create collection
router.post('/', (req, res) => {
    try {
        const db = getDB();
        const { name, description, icon, color, player_id } = req.body;

        if (!name) return res.status(400).json({ error: 'name is required' });
        if (!player_id) return res.status(400).json({ error: 'player_id is required' });

        const maxSort = db.prepare('SELECT MAX(sort_order) as m FROM game_collections').get().m || 0;

        const result = db.prepare(`
            INSERT INTO game_collections (name, description, icon, color, player_id, is_system, sort_order)
            VALUES (?, ?, ?, ?, ?, 0, ?)
        `).run(name, description || null, icon || '📁', color || '#A855F7', player_id, maxSort + 1);

        const collection = db.prepare('SELECT * FROM game_collections WHERE id = ?').get(result.lastInsertRowid);
        res.json({ ok: true, collection });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /:id — collection detail with games
router.get('/:id', (req, res) => {
    try {
        const db = getDB();
        const collection = db.prepare('SELECT * FROM game_collections WHERE id = ?').get(req.params.id);
        if (!collection) return res.status(404).json({ error: 'Collection not found' });

        const games = db.prepare(`
            SELECT cg.sort_order, cg.added_at,
                   r.id as rom_id, r.clean_name, r.system_id, r.filename,
                   m.title, m.genre, m.artwork_path, m.artwork_url, m.rating,
                   s.short_name as system_name, s.color as system_color
            FROM collection_games cg
            JOIN roms r ON r.id = cg.rom_id
            LEFT JOIN metadata m ON m.rom_id = r.id
            LEFT JOIN systems s ON s.id = r.system_id
            WHERE cg.collection_id = ?
            ORDER BY cg.sort_order ASC, cg.added_at ASC
        `).all(req.params.id);

        res.json({ ...collection, games });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /:id/games — add game to collection
router.post('/:id/games', (req, res) => {
    try {
        const db = getDB();
        const { rom_id } = req.body;
        const collectionId = req.params.id;

        if (!rom_id) return res.status(400).json({ error: 'rom_id is required' });

        const collection = db.prepare('SELECT * FROM game_collections WHERE id = ?').get(collectionId);
        if (!collection) return res.status(404).json({ error: 'Collection not found' });

        const maxSort = db.prepare('SELECT MAX(sort_order) as m FROM collection_games WHERE collection_id = ?').get(collectionId).m || 0;

        db.prepare('INSERT INTO collection_games (collection_id, rom_id, sort_order) VALUES (?, ?, ?)').run(collectionId, rom_id, maxSort + 1);

        const count = db.prepare('SELECT COUNT(*) as c FROM collection_games WHERE collection_id = ?').get(collectionId).c;
        res.json({ ok: true, game_count: count });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint') || err.message.includes('PRIMARY KEY')) {
            return res.status(400).json({ error: 'Game already in collection' });
        }
        res.status(500).json({ error: err.message });
    }
});

// DELETE /:id/games/:romId — remove game from collection
router.delete('/:id/games/:romId', (req, res) => {
    try {
        const db = getDB();
        const result = db.prepare('DELETE FROM collection_games WHERE collection_id = ? AND rom_id = ?').run(req.params.id, req.params.romId);

        if (result.changes === 0) return res.status(404).json({ error: 'Game not found in collection' });

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /:id — update collection metadata
router.patch('/:id', (req, res) => {
    try {
        const db = getDB();
        const { name, description, icon, color, sort_order } = req.body;
        const collectionId = req.params.id;

        const collection = db.prepare('SELECT * FROM game_collections WHERE id = ?').get(collectionId);
        if (!collection) return res.status(404).json({ error: 'Collection not found' });

        db.prepare(`
            UPDATE game_collections
            SET name = COALESCE(?, name),
                description = COALESCE(?, description),
                icon = COALESCE(?, icon),
                color = COALESCE(?, color),
                sort_order = COALESCE(?, sort_order)
            WHERE id = ?
        `).run(
            name || null,
            description !== undefined ? description : null,
            icon || null,
            color || null,
            sort_order !== undefined ? sort_order : null,
            collectionId
        );

        const updated = db.prepare('SELECT * FROM game_collections WHERE id = ?').get(collectionId);
        res.json({ ok: true, collection: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
