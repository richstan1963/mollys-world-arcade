import { Router } from 'express';
import { getDB } from '../db.js';
import { scanDirectories } from '../services/rom-scanner.js';
import { batchFetchArtwork } from '../services/metadata-fetcher.js';

const router = Router();

let scanState = { scanning: false, total: 0, processed: 0, newRoms: 0, current: '' };

router.post('/scan', async (req, res) => {
    if (scanState.scanning) {
        return res.status(409).json({ error: 'Scan already in progress' });
    }

    const db = getDB();
    const paths = req.body.paths || db.prepare('SELECT path, system_id FROM scan_paths WHERE enabled = 1').all();

    scanState = { scanning: true, total: 0, processed: 0, newRoms: 0, current: 'Starting...' };

    // Run async — don't block response
    scanDirectories(db, paths, (progress) => {
        Object.assign(scanState, progress);
    }).then((result) => {
        scanState = { scanning: false, ...result };
        // Auto-fetch artwork for any newly scanned ROMs missing it
        const missing = db.prepare(`
            SELECT r.id, r.clean_name, r.filename, r.system_id, s.libretro_dir, m.region, m.title
            FROM roms r
            LEFT JOIN metadata m ON m.rom_id = r.id
            LEFT JOIN systems  s ON s.id = r.system_id
            WHERE m.artwork_path IS NULL OR m.artwork_path = ''
        `).all();
        if (missing.length > 0) {
            console.log(`[scanner] Auto-fetching artwork for ${missing.length} ROMs...`);
            batchFetchArtwork(db, missing).catch(console.error);
        }
    }).catch((err) => {
        console.error('Scan error:', err);
        scanState = { scanning: false, error: err.message };
    });

    res.json({ ok: true, message: 'Scan started' });
});

router.get('/status', (req, res) => {
    res.json(scanState);
});

export default router;
