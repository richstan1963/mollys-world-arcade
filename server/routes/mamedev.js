import { Router } from 'express';
import { getDB } from '../db.js';
import { getMamedevList, downloadMamedevRom } from '../services/mamedev-scraper.js';
import { downloadGuard } from '../middleware/storage-guard.js';

const router = Router();

router.get('/list', async (req, res) => {
    const db = getDB();
    try {
        const list = await getMamedevList(db);
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/download', downloadGuard, async (req, res) => {
    const { slug } = req.body;
    if (!slug) return res.status(400).json({ error: 'slug is required' });

    const db = getDB();
    try {
        const result = await downloadMamedevRom(db, slug);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
