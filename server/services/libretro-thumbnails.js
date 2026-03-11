/* ════════════════════════════════════════════════════════════════
   Libretro Thumbnails — Box art, title screens, in-game snaps
   Source: https://thumbnails.libretro.com
   No API key needed — direct URL downloads by system + game name
   ════════════════════════════════════════════════════════════════ */
import https from 'https';
import fs from 'fs';
import path from 'path';
import { CONFIG, SYSTEMS } from '../config.js';

// Our system_id → Libretro thumbnail directory name
const LIBRETRO_DIR_MAP = {};
for (const sys of SYSTEMS) {
    if (sys.libretro_dir) LIBRETRO_DIR_MAP[sys.id] = sys.libretro_dir;
}

let batchProgress = null;
export function getThumbsProgress() { return batchProgress; }

const THUMB_TYPES = [
    { key: 'Named_Boxarts', column: 'boxart_path', label: 'boxart' },
    { key: 'Named_Titles',  column: 'title_screen_path', label: 'title' },
    { key: 'Named_Snaps',   column: 'snap_path', label: 'snap' },
];

/**
 * Build the Libretro thumbnail URL for a game.
 * Names must match exactly — spaces, special chars, etc.
 */
function buildThumbUrl(libretroDir, thumbType, gameName) {
    // Libretro uses & → _ and other sanitization
    const sanitized = gameName
        .replace(/[&*\/:`<>?\\|]/g, '_')
        .replace(/"/g, "'");
    const encoded = encodeURIComponent(libretroDir) + '/' + thumbType + '/' + encodeURIComponent(sanitized) + '.png';
    return `${CONFIG.LIBRETRO_THUMBS}/${encoded}`;
}

/**
 * Download a single thumbnail.
 */
function downloadThumb(url, dest) {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const req = https.get(url, { headers: { 'User-Agent': 'YourWorldArcade/1.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                downloadThumb(res.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(true); });
            file.on('error', err => { try { fs.unlinkSync(dest); } catch {} reject(err); });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

/**
 * Fetch thumbnails for a single ROM (all 3 types).
 */
export async function fetchThumbnails(db, rom) {
    const libretroDir = LIBRETRO_DIR_MAP[rom.system_id];
    if (!libretroDir) return { ok: false, error: 'No Libretro dir mapping' };

    const gameName = rom.title || rom.clean_name;
    if (!gameName) return { ok: false, error: 'No game name' };

    let downloaded = 0;
    const updates = {};

    for (const type of THUMB_TYPES) {
        const url = buildThumbUrl(libretroDir, type.key, gameName);
        const localDir = path.join(CONFIG.ARTWORK_DIR, 'thumbnails', rom.system_id, type.label);
        const localFile = path.join(localDir, `${gameName}.png`);
        const relPath = `thumbnails/${rom.system_id}/${type.label}/${gameName}.png`;

        try {
            await downloadThumb(url, localFile);
            updates[type.column] = relPath;
            downloaded++;
        } catch {
            // Image not available — not an error, just skip
        }
    }

    if (Object.keys(updates).length > 0) {
        const sets = Object.entries(updates).map(([col]) => `${col} = ?`).join(', ');
        const vals = Object.values(updates);
        db.prepare(`
            INSERT INTO metadata (rom_id, ${Object.keys(updates).join(', ')}) VALUES (?, ${vals.map(() => '?').join(', ')})
            ON CONFLICT(rom_id) DO UPDATE SET ${sets}
        `).run(rom.id, ...vals, ...vals);
    }

    return { ok: downloaded > 0, downloaded };
}

/**
 * Batch fetch thumbnails for all ROMs missing them.
 */
export async function batchFetchThumbnails(db, roms) {
    let fetched = 0, failed = 0;
    const startTime = Date.now();

    batchProgress = {
        total: roms.length, processed: 0, fetched: 0, failed: 0,
        running: true, startedAt: new Date().toISOString(), currentRom: null,
    };

    for (const rom of roms) {
        batchProgress.currentRom = rom.title || rom.clean_name || rom.filename;
        try {
            const result = await fetchThumbnails(db, rom);
            if (result.ok) {
                fetched++;
                if (fetched % 50 === 0) console.log(`[libretro-thumbs] ${fetched} downloaded (${batchProgress.processed}/${roms.length})`);
            } else {
                failed++;
            }
        } catch (err) {
            failed++;
        }
        batchProgress.processed++;
        batchProgress.fetched = fetched;
        batchProgress.failed = failed;
        await sleep(100); // Light throttle
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    batchProgress = { ...batchProgress, running: false, elapsed, completedAt: new Date().toISOString() };
    console.log(`[libretro-thumbs] Batch done: ✅ ${fetched} / ❌ ${failed} — ${elapsed}s`);
    return { fetched, failed, elapsed };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
