import { Router } from 'express';
import { getDB } from '../db.js';
import { downloadUrl } from '../services/url-downloader.js';
import { downloadGuard, getStorageStatus } from '../middleware/storage-guard.js';

const router = Router();

// All download routes go through the storage guard
router.post('/url', downloadGuard, async (req, res) => {
    const { url, system_id, filename } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });
    if (!system_id) return res.status(400).json({ error: 'system_id is required' });

    const db = getDB();

    // Track in downloads table
    const insert = db.prepare(`
        INSERT INTO downloads (url, filename, system_id, status, source)
        VALUES (?, ?, ?, 'downloading', 'url')
    `);
    const info = insert.run(url, filename || url.split('/').pop(), system_id);

    // Run async
    downloadUrl(db, info.lastInsertRowid, url, system_id, filename).catch(console.error);

    res.json({ ok: true, download_id: info.lastInsertRowid });
});

router.get('/status', (req, res) => {
    const db = getDB();
    const downloads = db.prepare(`
        SELECT * FROM downloads ORDER BY created_at DESC LIMIT 20
    `).all();
    res.json(downloads);
});

// Storage health endpoint
router.get('/storage', (req, res) => {
    res.json(getStorageStatus());
});

export default router;
