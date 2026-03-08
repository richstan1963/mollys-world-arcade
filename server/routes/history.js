import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

router.post('/log', (req, res) => {
    const db = getDB();
    const { rom_id, action, session_id, duration_seconds, player_id } = req.body;

    if (action === 'start') {
        const info = db.prepare(`
            INSERT INTO play_history (rom_id, player_id) VALUES (?, ?)
        `).run(rom_id, player_id || null);
        res.json({ ok: true, session_id: info.lastInsertRowid });
    } else if (action === 'end' && session_id) {
        db.prepare(`
            UPDATE play_history SET duration_seconds = ? WHERE id = ?
        `).run(duration_seconds || 0, session_id);
        res.json({ ok: true });
    } else {
        res.status(400).json({ error: 'Invalid action' });
    }
});

router.get('/recent', (req, res) => {
    const db = getDB();
    const limit = parseInt(req.query.limit) || 20;

    const recent = db.prepare(`
        SELECT ph.started_at, ph.duration_seconds,
               r.id, r.clean_name, r.system_id,
               m.artwork_path, m.title,
               s.short_name as system_name, s.color as system_color
        FROM play_history ph
        JOIN roms r ON r.id = ph.rom_id
        LEFT JOIN metadata m ON m.rom_id = r.id
        LEFT JOIN systems s ON s.id = r.system_id
        ORDER BY ph.started_at DESC
        LIMIT ?
    `).all(limit);

    res.json(recent);
});

export default router;
