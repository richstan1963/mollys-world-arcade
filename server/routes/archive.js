import { Router } from 'express';
import { searchArchive, getArchiveFiles, downloadArchiveFile } from '../services/archive-browser.js';
import { getDB } from '../db.js';
import { downloadGuard } from '../middleware/storage-guard.js';

const router = Router();

router.get('/search', async (req, res) => {
    const { q, page = 1 } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });

    try {
        const results = await searchArchive(q, parseInt(page));
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/files/:identifier', async (req, res) => {
    try {
        const files = await getArchiveFiles(req.params.identifier);
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/download', downloadGuard, async (req, res) => {
    const { identifier, filename, system_id } = req.body;
    if (!identifier || !filename) {
        return res.status(400).json({ error: 'identifier and filename are required' });
    }

    const db = getDB();
    try {
        const result = await downloadArchiveFile(db, identifier, filename, system_id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
