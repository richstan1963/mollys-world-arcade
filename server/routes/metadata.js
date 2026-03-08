import { Router } from 'express';
import { getDB } from '../db.js';
import { fetchArtwork, batchFetchArtwork, getBatchProgress } from '../services/metadata-fetcher.js';

const router = Router();

router.post('/fetch/:id', async (req, res) => {
    const db = getDB();
    const rom = db.prepare(`
        SELECT r.*, s.libretro_dir, m.region, m.title FROM roms r
        LEFT JOIN systems s ON s.id = r.system_id
        LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE r.id = ?
    `).get(req.params.id);

    if (!rom) return res.status(404).json({ error: 'ROM not found' });

    try {
        const result = await fetchArtwork(db, rom);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/batch', async (req, res) => {
    const db = getDB();

    // Check if a batch is already running
    const progress = getBatchProgress();
    if (progress && progress.running) {
        return res.json({
            ok: false,
            message: 'Batch already in progress',
            progress
        });
    }

    const missing = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.system_id, s.libretro_dir,
               m.region, m.title
        FROM roms r
        LEFT JOIN metadata m ON m.rom_id = r.id
        LEFT JOIN systems s ON s.id = r.system_id
        WHERE m.artwork_path IS NULL OR m.artwork_path = ''
    `).all();

    if (missing.length === 0) {
        return res.json({ ok: true, message: 'All ROMs have artwork', fetched: 0 });
    }

    // Run async
    batchFetchArtwork(db, missing).catch(console.error);

    res.json({ ok: true, message: `Fetching artwork for ${missing.length} ROMs`, queued: missing.length });
});

router.get('/batch/status', (req, res) => {
    const progress = getBatchProgress();
    if (!progress) {
        return res.json({ ok: true, message: 'No batch has been started', running: false });
    }
    res.json({ ok: true, ...progress });
});

export default router;
