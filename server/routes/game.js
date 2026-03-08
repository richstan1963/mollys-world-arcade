import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

router.get('/:id', (req, res) => {
    const db = getDB();
    const game = db.prepare(`
        SELECT r.*, m.title, m.artwork_path, m.artwork_url, m.region, m.year,
               m.publisher, m.genre, m.players, m.description, m.rating,
               s.name as system_full_name, s.short_name as system_name,
               s.color as system_color, s.emulatorjs_core as core,
               CASE WHEN f.rom_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
        FROM roms r
        LEFT JOIN metadata m ON m.rom_id = r.id
        LEFT JOIN systems s ON s.id = r.system_id
        LEFT JOIN favorites f ON f.rom_id = r.id
        WHERE r.id = ?
    `).get(req.params.id);

    if (!game) return res.status(404).json({ error: 'Game not found' });

    const history = db.prepare(`
        SELECT started_at, duration_seconds FROM play_history
        WHERE rom_id = ? ORDER BY started_at DESC LIMIT 10
    `).all(req.params.id);

    const totalPlayTime = db.prepare(`
        SELECT COALESCE(SUM(duration_seconds), 0) as total FROM play_history WHERE rom_id = ?
    `).get(req.params.id);

    res.json({ ...game, history, total_play_time: totalPlayTime.total });
});

// Write curated metadata (year, publisher, genre, players, title) from scraper
router.put('/:id/metadata', (req, res) => {
    const db = getDB();
    const id = parseInt(req.params.id);
    const { year, publisher, genre, players, title } = req.body;

    db.prepare(`
        INSERT INTO metadata (rom_id, year, publisher, genre, players, title)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(rom_id) DO UPDATE SET
            year      = COALESCE(excluded.year,      year),
            publisher = COALESCE(excluded.publisher, publisher),
            genre     = COALESCE(excluded.genre,     genre),
            players   = COALESCE(excluded.players,   players),
            title     = COALESCE(excluded.title,     title)
    `).run(id, year || null, publisher || null, genre || null, players || null, title || null);

    res.json({ ok: true });
});

router.patch('/:id', (req, res) => {
    const db = getDB();
    const { favorite, rating } = req.body;
    const id = parseInt(req.params.id);

    if (favorite !== undefined) {
        if (favorite) {
            db.prepare('INSERT OR IGNORE INTO favorites (rom_id) VALUES (?)').run(id);
        } else {
            db.prepare('DELETE FROM favorites WHERE rom_id = ?').run(id);
        }
    }

    if (rating !== undefined) {
        db.prepare(`
            INSERT INTO metadata (rom_id, rating) VALUES (?, ?)
            ON CONFLICT(rom_id) DO UPDATE SET rating = ?
        `).run(id, rating, rating);
    }

    res.json({ ok: true });
});

export default router;
