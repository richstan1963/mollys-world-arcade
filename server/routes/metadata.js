import { Router } from 'express';
import { getDB } from '../db.js';
import { fetchArtwork, batchFetchArtwork, getBatchProgress } from '../services/metadata-fetcher.js';
import { batchMatchAll, getMatchProgress } from '../services/nointro-matcher.js';
import { fetchGameData as ssFetchGame, batchFetchScreenScraper, getSSProgress } from '../services/screenscraper.js';
import { fetchGameData as igdbFetchGame, batchFetchIGDB, getIGDBProgress } from '../services/igdb.js';
import { fetchAchievements, batchFetchRA, getRAProgress } from '../services/retroachievements.js';
import { fetchManualLink, batchFetchManuals, getManualsProgress } from '../services/archiveorg-manuals.js';
import { enrichAll, getEnrichProgress } from '../services/enrichment-orchestrator.js';

const router = Router();

// ─── Artwork (existing) ────────────────────────────────────────────────────

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
    const progress = getBatchProgress();
    if (progress && progress.running) {
        return res.json({ ok: false, message: 'Batch already in progress', progress });
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

    batchFetchArtwork(db, missing).catch(console.error);
    res.json({ ok: true, message: `Fetching artwork for ${missing.length} ROMs`, queued: missing.length });
});

router.get('/batch/status', (req, res) => {
    const progress = getBatchProgress();
    if (!progress) return res.json({ ok: true, message: 'No batch has been started', running: false });
    res.json({ ok: true, ...progress });
});

// ─── Helper: load a single ROM with metadata ──────────────────────────────

function getRomWithMeta(id) {
    const db = getDB();
    return db.prepare(`
        SELECT r.*, m.title, m.region, m.screenscraper_id, m.igdb_id, m.manual_url
        FROM roms r LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE r.id = ?
    `).get(id);
}

// ─── WO1: No-Intro DAT Matching ───────────────────────────────────────────

router.post('/nointro/match', async (req, res) => {
    const db = getDB();
    const prog = getMatchProgress();
    if (prog && prog.running) return res.json({ ok: false, message: 'Already running', progress: prog });

    batchMatchAll(db).catch(console.error);
    res.json({ ok: true, message: 'No-Intro matching started' });
});

router.get('/nointro/status', (req, res) => {
    const prog = getMatchProgress();
    if (!prog) return res.json({ ok: true, running: false, message: 'No match has been started' });
    res.json({ ok: true, ...prog });
});

// ─── WO2: ScreenScraper ───────────────────────────────────────────────────

router.post('/screenscraper/fetch/:id', async (req, res) => {
    const db = getDB();
    const rom = getRomWithMeta(req.params.id);
    if (!rom) return res.status(404).json({ error: 'ROM not found' });

    try {
        const result = await ssFetchGame(db, rom);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/screenscraper/batch', async (req, res) => {
    const db = getDB();
    const prog = getSSProgress();
    if (prog && prog.running) return res.json({ ok: false, message: 'Already running', progress: prog });

    const roms = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.md5, r.system_id, m.title, m.region
        FROM roms r LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE r.md5 IS NOT NULL AND m.screenscraper_id IS NULL
    `).all();

    if (!roms.length) return res.json({ ok: true, message: 'All ROMs already checked', fetched: 0 });

    batchFetchScreenScraper(db, roms).catch(console.error);
    res.json({ ok: true, message: `ScreenScraper batch started for ${roms.length} ROMs`, queued: roms.length });
});

router.get('/screenscraper/status', (req, res) => {
    const prog = getSSProgress();
    if (!prog) return res.json({ ok: true, running: false, message: 'No batch started' });
    res.json({ ok: true, ...prog });
});

// ─── WO3: IGDB ────────────────────────────────────────────────────────────

router.post('/igdb/fetch/:id', async (req, res) => {
    const db = getDB();
    const rom = getRomWithMeta(req.params.id);
    if (!rom) return res.status(404).json({ error: 'ROM not found' });

    try {
        const result = await igdbFetchGame(db, rom);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/igdb/batch', async (req, res) => {
    const db = getDB();
    const prog = getIGDBProgress();
    if (prog && prog.running) return res.json({ ok: false, message: 'Already running', progress: prog });

    const roms = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.system_id, m.title, m.region
        FROM roms r LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE m.igdb_id IS NULL AND (m.title IS NOT NULL OR r.clean_name IS NOT NULL)
    `).all();

    if (!roms.length) return res.json({ ok: true, message: 'All ROMs already checked', fetched: 0 });

    batchFetchIGDB(db, roms).catch(console.error);
    res.json({ ok: true, message: `IGDB batch started for ${roms.length} ROMs`, queued: roms.length });
});

router.get('/igdb/status', (req, res) => {
    const prog = getIGDBProgress();
    if (!prog) return res.json({ ok: true, running: false, message: 'No batch started' });
    res.json({ ok: true, ...prog });
});

// ─── WO4: RetroAchievements ──────────────────────────────────────────────

router.post('/ra/fetch/:id', async (req, res) => {
    const db = getDB();
    const rom = getRomWithMeta(req.params.id);
    if (!rom) return res.status(404).json({ error: 'ROM not found' });

    try {
        const result = await fetchAchievements(db, rom);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/ra/batch', async (req, res) => {
    const db = getDB();
    const prog = getRAProgress();
    if (prog && prog.running) return res.json({ ok: false, message: 'Already running', progress: prog });

    const roms = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.md5, r.system_id, m.title
        FROM roms r LEFT JOIN metadata m ON m.rom_id = r.id
        LEFT JOIN retro_achievements ra ON ra.rom_id = r.id
        WHERE r.md5 IS NOT NULL AND ra.rom_id IS NULL
    `).all();

    if (!roms.length) return res.json({ ok: true, message: 'All ROMs already checked', fetched: 0 });

    batchFetchRA(db, roms).catch(console.error);
    res.json({ ok: true, message: `RetroAchievements batch started for ${roms.length} ROMs`, queued: roms.length });
});

router.get('/ra/status', (req, res) => {
    const prog = getRAProgress();
    if (!prog) return res.json({ ok: true, running: false, message: 'No batch started' });
    res.json({ ok: true, ...prog });
});

// ─── WO5: Archive.org Manuals ─────────────────────────────────────────────

router.post('/manuals/fetch/:id', async (req, res) => {
    const db = getDB();
    const rom = getRomWithMeta(req.params.id);
    if (!rom) return res.status(404).json({ error: 'ROM not found' });

    try {
        const result = await fetchManualLink(db, rom);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/manuals/batch', async (req, res) => {
    const db = getDB();
    const prog = getManualsProgress();
    if (prog && prog.running) return res.json({ ok: false, message: 'Already running', progress: prog });

    const roms = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.system_id, m.title, m.manual_url
        FROM roms r LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE m.manual_url IS NULL AND (m.title IS NOT NULL OR r.clean_name IS NOT NULL)
    `).all();

    if (!roms.length) return res.json({ ok: true, message: 'All ROMs already checked', fetched: 0 });

    batchFetchManuals(db, roms).catch(console.error);
    res.json({ ok: true, message: `Manual search started for ${roms.length} ROMs`, queued: roms.length });
});

router.get('/manuals/status', (req, res) => {
    const prog = getManualsProgress();
    if (!prog) return res.json({ ok: true, running: false, message: 'No batch started' });
    res.json({ ok: true, ...prog });
});

// ─── Enrichment Orchestrator ──────────────────────────────────────────────

// ── POST /api/metadata/backfill-descriptions — Extract descriptions from game_intel bios ──
router.post('/backfill-descriptions', (req, res) => {
    const db = getDB();

    // Find ROMs that have a bio in game_intel but no description in metadata
    const rows = db.prepare(`
        SELECT m.rom_id, r.clean_name, gi.content_md
        FROM metadata m
        JOIN roms r ON r.id = m.rom_id
        JOIN game_intel gi ON gi.game_title = r.clean_name AND gi.doc_type = 'bio'
        WHERE m.description IS NULL OR length(m.description) = 0
    `).all();

    if (rows.length === 0) {
        return res.json({ ok: true, updated: 0, message: 'All games with bios already have descriptions' });
    }

    const update = db.prepare('UPDATE metadata SET description = ? WHERE rom_id = ?');
    let updated = 0;

    db.transaction(() => {
        for (const row of rows) {
            // Extract first meaningful paragraph from the bio markdown
            const lines = row.content_md.split('\n').filter(l => {
                const t = l.trim();
                return t.length > 30
                    && !t.startsWith('#')
                    && !t.startsWith('|')
                    && !t.startsWith('>')
                    && !t.startsWith('*Genre')
                    && !t.startsWith('*Platform')
                    && !t.startsWith('*Player')
                    && !t.startsWith('---')
                    && !t.startsWith('```');
            });

            if (lines.length > 0) {
                // Take first 1-2 sentences, max ~300 chars
                let desc = lines[0].trim().replace(/^\*\*|\*\*$/g, '').replace(/^\*|\*$/g, '');
                if (desc.length > 300) desc = desc.slice(0, 297) + '...';
                update.run(desc, row.rom_id);
                updated++;
            }
        }
    })();

    res.json({ ok: true, updated, total_with_bios: rows.length });
});

router.post('/enrich', async (req, res) => {
    const db = getDB();
    const prog = getEnrichProgress();
    if (prog && prog.running) return res.json({ ok: false, message: 'Enrichment already running', progress: prog });

    const sources = req.body?.sources || ['nointro', 'screenscraper', 'igdb', 'ra', 'manuals'];
    enrichAll(db, sources).catch(console.error);
    res.json({ ok: true, message: `Enrichment pipeline started with ${sources.length} sources`, sources });
});

router.get('/enrich/status', (req, res) => {
    const prog = getEnrichProgress();
    if (!prog) return res.json({ ok: true, running: false, message: 'No enrichment started' });
    res.json({ ok: true, ...prog });
});

export default router;
