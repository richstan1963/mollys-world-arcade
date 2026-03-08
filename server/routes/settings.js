import { Router } from 'express';
import { getDB } from '../db.js';
import fs from 'fs';

const router = Router();

router.get('/', (req, res) => {
    const db = getDB();
    const rows = db.prepare('SELECT * FROM settings').all();
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;

    const scanPaths = db.prepare('SELECT * FROM scan_paths ORDER BY id').all();

    res.json({ settings, scanPaths });
});

router.put('/', (req, res) => {
    const db = getDB();
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key is required' });

    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
    res.json({ ok: true });
});

router.post('/scan-path', (req, res) => {
    const db = getDB();
    const { path: dirPath, system_id } = req.body;
    if (!dirPath) return res.status(400).json({ error: 'path is required' });

    if (!fs.existsSync(dirPath)) {
        return res.status(400).json({ error: 'Directory does not exist' });
    }

    try {
        db.prepare('INSERT OR IGNORE INTO scan_paths (path, system_id) VALUES (?, ?)').run(dirPath, system_id || null);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/scan-path/:id', (req, res) => {
    const db = getDB();
    db.prepare('DELETE FROM scan_paths WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

export default router;
