/* ════════════════════════════════════════════════════════════════
   Progetto-SNAPS — Arcade cabinet art, marquees, flyers, control panels
   Source: https://www.progettosnaps.net/
   No API key needed — downloads from ZIP packs by MAME ROM name
   ════════════════════════════════════════════════════════════════ */
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';

let batchProgress = null;
export function getSnapsProgress() { return batchProgress; }

const ART_TYPES = [
    { key: 'cabinets', column: 'cabinet_path', label: 'cabinet' },
    { key: 'marquees', column: 'marquee_path', label: 'marquee' },
    { key: 'flyers',   column: 'flyer_path',   label: 'flyer' },
];

// Base URLs for individual image downloads (pngs by ROM name)
const SNAP_BASE = 'https://www.progettosnaps.net/snapshots/pngs';

/**
 * Try to download a single arcade art image.
 */
function downloadImage(url, dest) {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const client = url.startsWith('https') ? https : http;

    return new Promise((resolve, reject) => {
        const req = client.get(url, { headers: { 'User-Agent': 'YourWorldArcade/1.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                downloadImage(res.headers.location, dest).then(resolve).catch(reject);
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
 * Fetch arcade art for a single ROM.
 */
export async function fetchArcadeArt(db, rom) {
    const romName = rom.filename.replace(/\.[^.]+$/, '');
    let downloaded = 0;
    const updates = {};

    for (const type of ART_TYPES) {
        const url = `${SNAP_BASE}/${type.key}/${romName}.png`;
        const localDir = path.join(CONFIG.ARTWORK_DIR, 'arcade-art', type.label);
        const localFile = path.join(localDir, `${romName}.png`);
        const relPath = `arcade-art/${type.label}/${romName}.png`;

        try {
            await downloadImage(url, localFile);
            updates[type.column] = relPath;
            downloaded++;
        } catch {
            // Not available — skip
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
 * Batch fetch arcade art for MAME ROMs missing cabinet/marquee/flyer images.
 */
export async function batchFetchSnaps(db, roms) {
    let fetched = 0, failed = 0;
    const startTime = Date.now();

    batchProgress = {
        total: roms.length, processed: 0, fetched: 0, failed: 0,
        running: true, startedAt: new Date().toISOString(), currentRom: null,
    };

    for (const rom of roms) {
        batchProgress.currentRom = rom.filename;
        try {
            const result = await fetchArcadeArt(db, rom);
            if (result.ok) {
                fetched++;
                if (fetched % 25 === 0) console.log(`[progetto-snaps] ${fetched} sets downloaded (${batchProgress.processed}/${roms.length})`);
            } else {
                failed++;
            }
        } catch (err) {
            failed++;
        }
        batchProgress.processed++;
        batchProgress.fetched = fetched;
        batchProgress.failed = failed;
        await sleep(200); // Light throttle
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    batchProgress = { ...batchProgress, running: false, elapsed, completedAt: new Date().toISOString() };
    console.log(`[progetto-snaps] Batch done: ✅ ${fetched} / ❌ ${failed} — ${elapsed}s`);
    return { fetched, failed, elapsed };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
