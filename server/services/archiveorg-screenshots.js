/* ════════════════════════════════════════════════════════════════
   Archive.org MAME Screenshots — In-game snapshots
   Source: https://archive.org/details/MAME_Snapshots
   No API key needed — downloads by MAME ROM name from archive.org
   ════════════════════════════════════════════════════════════════ */
import https from 'https';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';

const ARCHIVE_SNAP_BASE = 'https://archive.org/download/MAME_Snapshots';

let batchProgress = null;
export function getArchiveSSProgress() { return batchProgress; }

/**
 * Download a screenshot from Archive.org.
 */
function downloadScreenshot(url, dest) {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'YourWorldArcade/1.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                downloadScreenshot(res.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(true); });
            file.on('error', err => { try { fs.unlinkSync(dest); } catch {} reject(err); });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

/**
 * Fetch a screenshot for a single arcade ROM.
 */
export async function fetchScreenshot(db, rom) {
    const romName = rom.filename.replace(/\.[^.]+$/, '');
    const url = `${ARCHIVE_SNAP_BASE}/${romName}.png`;
    const localDir = path.join(CONFIG.ARTWORK_DIR, 'screenshots');
    const localFile = path.join(localDir, `${romName}.png`);
    const relPath = `screenshots/${romName}.png`;

    try {
        await downloadScreenshot(url, localFile);
        // Update snap_path if not already set by libretro-thumbnails
        db.prepare(`
            INSERT INTO metadata (rom_id, snap_path) VALUES (?, ?)
            ON CONFLICT(rom_id) DO UPDATE SET snap_path = COALESCE(snap_path, excluded.snap_path)
        `).run(rom.id, relPath);
        return { ok: true };
    } catch {
        return { ok: false };
    }
}

/**
 * Batch fetch screenshots for arcade ROMs missing them.
 */
export async function batchFetchArchiveScreenshots(db, roms) {
    let fetched = 0, failed = 0;
    const startTime = Date.now();

    batchProgress = {
        total: roms.length, processed: 0, fetched: 0, failed: 0,
        running: true, startedAt: new Date().toISOString(), currentRom: null,
    };

    for (const rom of roms) {
        batchProgress.currentRom = rom.filename;
        try {
            const result = await fetchScreenshot(db, rom);
            if (result.ok) {
                fetched++;
                if (fetched % 50 === 0) console.log(`[archive-screenshots] ${fetched} downloaded (${batchProgress.processed}/${roms.length})`);
            } else {
                failed++;
            }
        } catch {
            failed++;
        }
        batchProgress.processed++;
        batchProgress.fetched = fetched;
        batchProgress.failed = failed;
        await sleep(200); // Light throttle
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    batchProgress = { ...batchProgress, running: false, elapsed, completedAt: new Date().toISOString() };
    console.log(`[archive-screenshots] Batch done: ✅ ${fetched} / ❌ ${failed} — ${elapsed}s`);
    return { fetched, failed, elapsed };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
