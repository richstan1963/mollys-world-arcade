import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
    try {
        const db = getDB();
        const systems = db.prepare(`
            SELECT s.*, COALESCE(rc.count, 0) as rom_count
            FROM systems s
            LEFT JOIN (SELECT system_id, COUNT(*) as count FROM roms GROUP BY system_id) rc
                ON rc.system_id = s.id
            WHERE COALESCE(rc.count, 0) > 0
            ORDER BY s.sort_order ASC
        `).all();

        res.json(systems);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load systems' });
    }
});

export default router;
