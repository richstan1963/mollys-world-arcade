import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// GET / — full search with optional filters
router.get('/', (req, res) => {
    try {
        const db = getDB();
        const q = (req.query.q || '').trim();
        const system = req.query.system || null;
        const genre = req.query.genre || null;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);

        if (!q || q.length < 1) return res.json({ results: [], total: 0 });

        const pattern = `%${q}%`;
        const conditions = ['r.clean_name LIKE ?'];
        const params = [pattern];

        if (system) { conditions.push('r.system_id = ?'); params.push(system); }
        if (genre) { conditions.push('m.genre = ?'); params.push(genre); }

        const where = conditions.join(' AND ');

        const total = db.prepare(`
            SELECT COUNT(*) as count FROM roms r
            LEFT JOIN metadata m ON m.rom_id = r.id
            WHERE ${where}
        `).get(...params).count;

        const results = db.prepare(`
            SELECT r.id as rom_id, r.clean_name, r.system_id, r.filename,
                   s.short_name as system_name, s.color as system_color,
                   m.artwork_path, m.artwork_url, m.genre, m.rating, m.description
            FROM roms r
            LEFT JOIN systems s ON s.id = r.system_id
            LEFT JOIN metadata m ON m.rom_id = r.id
            WHERE ${where}
            ORDER BY
                CASE WHEN r.clean_name LIKE ? THEN 0 ELSE 1 END,
                r.clean_name ASC
            LIMIT ?
        `).all(...params, q + '%', limit);

        res.json({ results, total, query: q });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /autocomplete?q=xxx — return top 10 matching games by name (fast, indexed)
router.get('/autocomplete', (req, res) => {
    try {
        const db = getDB();
        const q = (req.query.q || '').trim();

        if (!q || q.length < 1) {
            return res.json([]);
        }

        const pattern = `%${q}%`;

        const results = db.prepare(`
            SELECT r.id as rom_id, r.clean_name, r.system_id,
                   s.short_name as system_name, s.color as system_color,
                   m.artwork_path, m.artwork_url, m.genre
            FROM roms r
            LEFT JOIN systems s ON s.id = r.system_id
            LEFT JOIN metadata m ON m.rom_id = r.id
            WHERE r.clean_name LIKE ?
            ORDER BY
                CASE WHEN r.clean_name LIKE ? THEN 0 ELSE 1 END,
                r.clean_name ASC
            LIMIT 10
        `).all(pattern, q + '%');

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /similar/:romId — find similar games (same system, same genre, similar name)
router.get('/similar/:romId', (req, res) => {
    try {
        const db = getDB();
        const romId = req.params.romId;

        const rom = db.prepare(`
            SELECT r.id, r.clean_name, r.system_id, m.genre
            FROM roms r
            LEFT JOIN metadata m ON m.rom_id = r.id
            WHERE r.id = ?
        `).get(romId);

        if (!rom) return res.status(404).json({ error: 'Game not found' });

        const results = [];
        const seen = new Set([parseInt(romId)]);

        // Same system + same genre (highest relevance)
        if (rom.genre) {
            const sameSystemGenre = db.prepare(`
                SELECT r.id as rom_id, r.clean_name, r.system_id,
                       s.short_name as system_name, s.color as system_color,
                       m.artwork_path, m.artwork_url, m.genre, m.rating
                FROM roms r
                LEFT JOIN systems s ON s.id = r.system_id
                LEFT JOIN metadata m ON m.rom_id = r.id
                WHERE r.system_id = ? AND m.genre = ? AND r.id != ?
                ORDER BY m.rating DESC NULLS LAST
                LIMIT 5
            `).all(rom.system_id, rom.genre, romId);

            for (const g of sameSystemGenre) {
                if (!seen.has(g.rom_id)) {
                    seen.add(g.rom_id);
                    results.push({ ...g, match_reason: 'Same system and genre' });
                }
            }
        }

        // Same system (medium relevance)
        const sameSystem = db.prepare(`
            SELECT r.id as rom_id, r.clean_name, r.system_id,
                   s.short_name as system_name, s.color as system_color,
                   m.artwork_path, m.artwork_url, m.genre, m.rating
            FROM roms r
            LEFT JOIN systems s ON s.id = r.system_id
            LEFT JOIN metadata m ON m.rom_id = r.id
            WHERE r.system_id = ? AND r.id != ?
            ORDER BY m.rating DESC NULLS LAST
            LIMIT 10
        `).all(rom.system_id, romId);

        for (const g of sameSystem) {
            if (!seen.has(g.rom_id) && results.length < 15) {
                seen.add(g.rom_id);
                results.push({ ...g, match_reason: 'Same system' });
            }
        }

        // Same genre, different system (lower relevance)
        if (rom.genre) {
            const sameGenre = db.prepare(`
                SELECT r.id as rom_id, r.clean_name, r.system_id,
                       s.short_name as system_name, s.color as system_color,
                       m.artwork_path, m.artwork_url, m.genre, m.rating
                FROM roms r
                LEFT JOIN systems s ON s.id = r.system_id
                LEFT JOIN metadata m ON m.rom_id = r.id
                WHERE m.genre = ? AND r.system_id != ? AND r.id != ?
                ORDER BY m.rating DESC NULLS LAST
                LIMIT 10
            `).all(rom.genre, rom.system_id, romId);

            for (const g of sameGenre) {
                if (!seen.has(g.rom_id) && results.length < 20) {
                    seen.add(g.rom_id);
                    results.push({ ...g, match_reason: `Same genre (${rom.genre})` });
                }
            }
        }

        // Similar name (fuzzy — shared word tokens)
        const words = rom.clean_name.split(/[\s\-_:]+/).filter(w => w.length > 2);
        if (words.length > 0) {
            for (const word of words.slice(0, 3)) {
                const nameMatches = db.prepare(`
                    SELECT r.id as rom_id, r.clean_name, r.system_id,
                           s.short_name as system_name, s.color as system_color,
                           m.artwork_path, m.artwork_url, m.genre, m.rating
                    FROM roms r
                    LEFT JOIN systems s ON s.id = r.system_id
                    LEFT JOIN metadata m ON m.rom_id = r.id
                    WHERE r.clean_name LIKE ? AND r.id != ?
                    LIMIT 5
                `).all(`%${word}%`, romId);

                for (const g of nameMatches) {
                    if (!seen.has(g.rom_id) && results.length < 20) {
                        seen.add(g.rom_id);
                        results.push({ ...g, match_reason: 'Similar name' });
                    }
                }
            }
        }

        res.json({
            source: { rom_id: rom.id, clean_name: rom.clean_name, system_id: rom.system_id, genre: rom.genre },
            similar: results.slice(0, 20),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
