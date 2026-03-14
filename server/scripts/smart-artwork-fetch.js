#!/usr/bin/env node
/* smart-artwork-fetch.js — Fuzzy libretro thumbnail fetcher
 * Tries multiple name variants per game to maximize artwork coverage.
 * Run: node --env-file=.env server/scripts/smart-artwork-fetch.js
 */
import Database from 'better-sqlite3';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const DB_PATH = path.join(ROOT, 'mollys-arcade.db');
const ART_DIR = path.join(ROOT, 'public', 'img', 'artwork');
const LIBRETRO_BASE = 'https://thumbnails.libretro.com';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const THUMB_TYPES = [
    { key: 'Named_Boxarts', column: 'boxart_path', label: 'boxart' },
    { key: 'Named_Snaps',   column: 'snap_path',   label: 'snap' },
    { key: 'Named_Titles',  column: 'title_screen_path', label: 'title' },
];

// ── Name variant generator ──────────────────────────────────────────────────
function generateNameVariants(cleanName, filename) {
    const variants = new Set();

    // 1. Extract name from filename (preserves region tags like "(USA)")
    const fromFile = filename
        .replace(/\.(zip|7z|rar|nes|sfc|smc|gb|gbc|gba|md|bin|a26|a78|j64|cue|chd|iso|cso|pbp|nds|pce|ws|wsc|ngp|ngc|lnx|vb)$/i, '')
        .replace(/_/g, ' ')
        .trim();
    if (fromFile) variants.add(fromFile);

    // 2. Clean name + common region tags
    variants.add(cleanName);
    for (const region of ['(USA)', '(USA, Europe)', '(Europe)', '(Japan)', '(World)', '(Japan, USA)', '(USA, Japan)']) {
        variants.add(`${cleanName} ${region}`);
    }

    // 3. Filename without region — just the base name
    const noRegion = fromFile.replace(/\s*\([^)]*\)\s*/g, '').trim();
    if (noRegion && noRegion !== cleanName) {
        variants.add(noRegion);
        for (const region of ['(USA)', '(USA, Europe)', '(Europe)', '(World)']) {
            variants.add(`${noRegion} ${region}`);
        }
    }

    // 4. Handle "Rev" and "Virtual Console" variants
    const baseNoRev = fromFile.replace(/\s*\(Rev[^)]*\)/gi, '').replace(/\s*\(Virtual Console\)/gi, '').trim();
    if (baseNoRev !== fromFile) variants.add(baseNoRev);

    // 5. Replace (NA) with (USA)
    if (fromFile.includes('(NA)')) {
        variants.add(fromFile.replace('(NA)', '(USA)'));
        variants.add(fromFile.replace(/\s*\(NA[^)]*\)/, ' (USA)'));
    }

    // 6. Libretro sanitization (& → _, etc.)
    const sanitized = [...variants].map(v =>
        v.replace(/[&*\/:`<>?\\|]/g, '_').replace(/"/g, "'")
    );
    sanitized.forEach(v => variants.add(v));

    return [...variants];
}

// ── Download helper ─────────────────────────────────────────────────────────
function tryDownload(url, dest) {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const req = https.get(url, { headers: { 'User-Agent': 'YourWorldArcade/1.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                tryDownload(res.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(true); });
            file.on('error', err => { try { fs.unlinkSync(dest); } catch {} reject(err); });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

// ── Try all name variants for one thumb type ────────────────────────────────
async function tryVariants(libretroDir, thumbType, variants, destDir, romId) {
    for (const name of variants) {
        const encoded = encodeURIComponent(libretroDir) + '/' + thumbType.key + '/' + encodeURIComponent(name) + '.png';
        const url = `${LIBRETRO_BASE}/${encoded}`;
        const safeName = name.replace(/[\/\\:*?"<>|]/g, '_');
        const localFile = path.join(destDir, `${safeName}.png`);
        const relPath = path.relative(path.join(ROOT, 'public', 'img'), localFile).replace(/\\/g, '/');

        try {
            await tryDownload(url, localFile);
            return { column: thumbType.column, relPath, matchedName: name };
        } catch {
            // Try next variant
        }
        await sleep(50); // Light throttle per attempt
    }
    return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
    // Get all ROMs missing ANY artwork, with system libretro_dir
    const roms = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.system_id, s.libretro_dir
        FROM roms r
        JOIN systems s ON s.id = r.system_id
        LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE s.libretro_dir IS NOT NULL
          AND (m.boxart_path IS NULL OR length(m.boxart_path) = 0)
    `).all();

    console.log(`[Smart Artwork] ${roms.length} ROMs missing artwork across ${new Set(roms.map(r => r.system_id)).size} systems`);

    const update = db.prepare(`
        INSERT INTO metadata (rom_id, boxart_path, snap_path, title_screen_path)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(rom_id) DO UPDATE SET
            boxart_path = COALESCE(NULLIF(excluded.boxart_path, ''), boxart_path),
            snap_path = COALESCE(NULLIF(excluded.snap_path, ''), snap_path),
            title_screen_path = COALESCE(NULLIF(excluded.title_screen_path, ''), title_screen_path)
    `);

    let fetched = 0, failed = 0, total = roms.length;
    const startTime = Date.now();

    for (let i = 0; i < roms.length; i++) {
        const rom = roms[i];
        const variants = generateNameVariants(rom.clean_name, rom.filename);
        const destBase = path.join(ART_DIR, 'thumbnails', rom.system_id);

        let boxart = null, snap = null, titleScreen = null;

        // Try boxart first (most visible)
        boxart = await tryVariants(rom.libretro_dir, THUMB_TYPES[0], variants,
            path.join(destBase, 'boxart'), rom.id);

        if (boxart) {
            // If boxart worked, try snaps and titles with the SAME name that matched
            const winningName = boxart.matchedName;
            snap = await tryVariants(rom.libretro_dir, THUMB_TYPES[1], [winningName],
                path.join(destBase, 'snap'), rom.id);
            titleScreen = await tryVariants(rom.libretro_dir, THUMB_TYPES[2], [winningName],
                path.join(destBase, 'title'), rom.id);
        }

        if (boxart || snap || titleScreen) {
            update.run(rom.id,
                boxart?.relPath || '',
                snap?.relPath || '',
                titleScreen?.relPath || ''
            );
            fetched++;
        } else {
            failed++;
        }

        if ((i + 1) % 50 === 0 || fetched % 25 === 0) {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            const rate = fetched > 0 ? Math.round(elapsed / fetched * 10) / 10 : 0;
            console.log(`[Smart Artwork] ${i+1}/${total} — ✅ ${fetched} / ❌ ${failed} — ${elapsed}s (${rate}s/hit)`);
        }

        await sleep(100); // Throttle between ROMs
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n[Smart Artwork] DONE: ✅ ${fetched} / ❌ ${failed} / Total: ${total} — ${elapsed}s`);
    console.log(`[Smart Artwork] Hit rate: ${Math.round(fetched/total*100)}%`);

    db.close();
}

main().catch(err => { console.error(err); process.exit(1); });
