import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DB_PATH = path.join(ROOT, 'mollys-arcade.db');
const ARTWORK_DIR = process.env.ARCADE_ARTWORK_DIR || path.join(ROOT, 'artwork');
const CDN_BASE = 'https://thumbnails.libretro.com';

const db = new Database(DB_PATH);

const UPSERT_SQL = `INSERT INTO metadata (rom_id, artwork_path, metadata_source, fetched_at)
    VALUES (?, ?, 'libretro', datetime('now'))
    ON CONFLICT(rom_id) DO UPDATE SET artwork_path = ?, fetched_at = datetime('now')`;

// Get unique systems with missing artwork
const systems = db.prepare(`
    SELECT DISTINCT s.id, s.name, s.libretro_dir
    FROM roms r
    JOIN systems s ON s.id = r.system_id
    LEFT JOIN metadata m ON m.rom_id = r.id
    WHERE m.artwork_path IS NULL
    ORDER BY s.name
`).all();

function fetchPage(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'MollysWorldArcade/1.0' } }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error('HTTP ' + res.statusCode));
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, { headers: { 'User-Agent': 'MollysWorldArcade/1.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                downloadFile(res.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error('HTTP ' + res.statusCode));
                return;
            }
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
            file.on('error', (err) => { try { fs.unlinkSync(dest); } catch(e) {} reject(err); });
        });
        request.on('error', reject);
        request.setTimeout(15000, () => { request.destroy(); reject(new Error('Timeout')); });
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Normalize a name for fuzzy matching
function normalize(name) {
    return name.toLowerCase()
        .replace(/[^a-z0-9]/g, '')  // strip all non-alphanumeric
        .trim();
}

// Parse CDN filename to get the base title (without region)
function parseCdnTitle(filename) {
    // filename is URL-decoded, like "Basketbrawl (USA, Europe).png"
    let name = filename.replace(/\.png$/i, '');
    // Remove region/tags in parentheses
    name = name.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    return name;
}

async function processSystem(sys) {
    console.log('\n=== ' + sys.name + ' (' + sys.libretro_dir + ') ===');

    // Get ROMs missing artwork for this system
    const roms = db.prepare(`
        SELECT r.id, r.clean_name, r.filename
        FROM roms r
        LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE m.artwork_path IS NULL AND r.system_id = ?
        ORDER BY r.clean_name
    `).all(sys.id);

    if (roms.length === 0) return 0;
    console.log('  Missing artwork: ' + roms.length + ' ROMs');

    // Scrape CDN directory listing for Boxarts
    const dirUrl = CDN_BASE + '/' + encodeURIComponent(sys.libretro_dir) + '/Named_Boxarts/';
    let cdnFiles = [];
    try {
        const html = await fetchPage(dirUrl);
        // Extract filenames from href attributes
        const regex = /href="([^"]+\.png)"/gi;
        let match;
        while ((match = regex.exec(html)) !== null) {
            cdnFiles.push(decodeURIComponent(match[1]));
        }
    } catch(err) {
        console.log('  Failed to list CDN directory: ' + err.message);
        return 0;
    }

    if (cdnFiles.length === 0) {
        console.log('  No files found on CDN');
        return 0;
    }
    console.log('  CDN has ' + cdnFiles.length + ' boxart files');

    // Also try Named_Snaps
    const snapUrl = CDN_BASE + '/' + encodeURIComponent(sys.libretro_dir) + '/Named_Snaps/';
    let snapFiles = [];
    try {
        const html = await fetchPage(snapUrl);
        const regex = /href="([^"]+\.png)"/gi;
        let match;
        while ((match = regex.exec(html)) !== null) {
            snapFiles.push(decodeURIComponent(match[1]));
        }
    } catch(err) {
        // ignore
    }

    // Build normalized lookup: normalized_title -> [cdn_filename, ...]
    const cdnLookup = new Map();
    for (const f of cdnFiles) {
        const title = parseCdnTitle(f);
        const norm = normalize(title);
        if (!cdnLookup.has(norm)) cdnLookup.set(norm, []);
        cdnLookup.get(norm).push({ file: f, type: 'Named_Boxarts' });
    }
    for (const f of snapFiles) {
        const title = parseCdnTitle(f);
        const norm = normalize(title);
        if (!cdnLookup.has(norm)) cdnLookup.set(norm, []);
        cdnLookup.get(norm).push({ file: f, type: 'Named_Snaps' });
    }

    // Parse ROM filename to get the original title (preserving periods etc)
    function parseRomTitle(filename) {
        let name = filename;
        name = name.replace(/\.[a-z0-9]+$/i, '');  // remove extension
        // Remove parenthetical tags from the end
        while (/\s*[\(\[].*[\)\]]$/.test(name)) {
            name = name.replace(/\s*[\(\[][^\)\]]*[\)\]]$/, '');
        }
        return name.trim();
    }

    let fetched = 0;
    const artworkDir = path.join(ARTWORK_DIR, sys.id);
    if (!fs.existsSync(artworkDir)) fs.mkdirSync(artworkDir, { recursive: true });

    for (const rom of roms) {
        const filenameTitle = parseRomTitle(rom.filename);
        const cleanName = rom.clean_name;
        const relPath = sys.id + '/' + cleanName + '.png';
        const localFile = path.join(artworkDir, cleanName + '.png');

        // Skip if already downloaded
        if (fs.existsSync(localFile) && fs.statSync(localFile).size > 0) {
            db.prepare(UPSERT_SQL).run(rom.id, relPath, relPath);
            fetched++;
            continue;
        }

        // Try matching with normalized names
        const normClean = normalize(cleanName);
        const normFile = normalize(filenameTitle);

        let cdnMatch = null;

        // Try normalized clean_name
        if (cdnLookup.has(normClean)) {
            cdnMatch = cdnLookup.get(normClean)[0];
        }
        // Try normalized filename title
        if (!cdnMatch && normFile !== normClean && cdnLookup.has(normFile)) {
            cdnMatch = cdnLookup.get(normFile)[0];
        }

        if (cdnMatch) {
            const url = CDN_BASE + '/' + encodeURIComponent(sys.libretro_dir) + '/' + cdnMatch.type + '/' + encodeURIComponent(cdnMatch.file);
            try {
                await downloadFile(url, localFile);
                db.prepare(UPSERT_SQL).run(rom.id, relPath, relPath);
                fetched++;
                console.log('  OK: ' + cleanName + ' -> ' + cdnMatch.file);
                await sleep(50);
            } catch(err) {
                console.log('  FAIL download: ' + cleanName + ' -> ' + cdnMatch.file + ' (' + err.message + ')');
            }
        }
    }

    console.log('  Fetched: ' + fetched + '/' + roms.length);
    return fetched;
}

async function main() {
    let totalFetched = 0;

    for (const sys of systems) {
        const fetched = await processSystem(sys);
        totalFetched += fetched;
        await sleep(200);  // Brief pause between systems
    }

    console.log('\n=== COMPLETE ===');
    console.log('Total fetched: ' + totalFetched);

    // Final stats
    const total = db.prepare('SELECT COUNT(*) as c FROM roms').get().c;
    const withArt = db.prepare("SELECT COUNT(*) as c FROM metadata WHERE artwork_path IS NOT NULL AND artwork_path != ''").get().c;
    console.log('Total ROMs: ' + total);
    console.log('With artwork: ' + withArt);
    console.log('Missing: ' + (total - withArt));

    db.close();
}

main().catch(err => { console.error(err); process.exit(1); });
