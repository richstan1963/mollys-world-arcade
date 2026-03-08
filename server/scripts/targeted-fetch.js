import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DB_PATH = path.join(ROOT, 'mollys-arcade.db');
const ARTWORK_DIR = path.join(ROOT, 'artwork');
const CDN_BASE = 'https://thumbnails.libretro.com';

const REGION_MAP = {
    'NA': 'USA', 'US': 'USA', 'JP': 'Japan', 'EU': 'Europe',
    'World': 'World', 'BR': 'Brazil', 'HK': 'Hong Kong',
};

const db = new Database(DB_PATH);

const UPSERT_SQL = `INSERT INTO metadata (rom_id, artwork_path, metadata_source, fetched_at)
    VALUES (?, ?, 'libretro', datetime('now'))
    ON CONFLICT(rom_id) DO UPDATE SET artwork_path = ?, fetched_at = datetime('now')`;

const candidates = db.prepare(`
    SELECT r.id, r.clean_name, r.filename, r.system_id, s.libretro_dir
    FROM roms r
    JOIN systems s ON s.id = r.system_id
    LEFT JOIN metadata m ON m.rom_id = r.id
    WHERE m.artwork_path IS NULL OR m.artwork_path = ''
    ORDER BY s.name, r.clean_name
`).all();

console.log("Found " + candidates.length + " ROMs without artwork");

function parseFilenameTitle(filename) {
    let name = filename;
    name = name.replace(/\.[a-z0-9]+$/i, "");
    name = name.replace(/\s*\([^)]*\)\s*$/g, "");
    name = name.replace(/\s*\([^)]*\)\s*$/g, "");
    name = name.replace(/\s*\[[^\]]*\]\s*$/g, "");
    name = name.replace(/\s*\([^)]*\)\s*$/g, "");
    return name.trim();
}

function parseRegion(filename) {
    const match = filename.match(/\(([^)]+)\)\.[a-z0-9]+$/i);
    if (!match) return null;
    const raw = match[1].trim();
    if (/^(Hack|Prototype|Homebrew|Unl|patched|Demo)/i.test(raw)) return null;
    if (REGION_MAP[raw]) return REGION_MAP[raw];
    const parts = raw.split(",").map(p => p.trim());
    for (const part of parts) {
        if (REGION_MAP[part]) return REGION_MAP[part];
    }
    return null;
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, { headers: { "User-Agent": "MollysWorldArcade/1.0" } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                downloadFile(res.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error("HTTP " + res.statusCode));
                return;
            }
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on("finish", () => { file.close(); resolve(); });
            file.on("error", (err) => { try { fs.unlinkSync(dest); } catch(e) {} reject(err); });
        });
        request.on("error", reject);
        request.setTimeout(8000, () => { request.destroy(); reject(new Error("Timeout")); });
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function tryFetch(rom) {
    const artworkDir = path.join(ARTWORK_DIR, rom.system_id);
    if (!fs.existsSync(artworkDir)) fs.mkdirSync(artworkDir, { recursive: true });

    const cleanName = rom.clean_name;
    const relPath = rom.system_id + "/" + cleanName + ".png";
    const localFile = path.join(artworkDir, cleanName + ".png");

    if (fs.existsSync(localFile) && fs.statSync(localFile).size > 0) {
        db.prepare(UPSERT_SQL).run(rom.id, relPath, relPath);
        return { ok: true, source: "cache" };
    }

    const filenameTitle = parseFilenameTitle(rom.filename);
    const region = parseRegion(rom.filename);
    const names = [];
    const seen = new Set();
    function addName(n) { if (!seen.has(n)) { seen.add(n); names.push(n); } }

    // Filename title (preserves periods) with region variants
    if (region) addName(filenameTitle + " (" + region + ")");
    // Most common CDN region patterns
    ["USA", "USA, Europe", "World", "Japan", "Europe", "Japan, Europe", "Japan, USA"].forEach(r => addName(filenameTitle + " (" + r + ")"));
    addName(filenameTitle);

    // Clean name variants (if different from filenameTitle)
    if (cleanName !== filenameTitle) {
        if (region) addName(cleanName + " (" + region + ")");
        ["USA", "USA, Europe", "World", "Japan", "Europe"].forEach(r => addName(cleanName + " (" + r + ")"));
        addName(cleanName);
    }

    // MAME slug
    if (rom.system_id === "arcade" || rom.system_id === "fbneo") {
        const slug = rom.filename.replace(/\.[^.]+$/, "");
        if (slug !== cleanName && slug !== filenameTitle) addName(slug);
    }

    const libretroDir = encodeURIComponent(rom.libretro_dir);
    const types = ["Named_Boxarts", "Named_Snaps"];

    for (const type of types) {
        for (const variant of names) {
            const url = CDN_BASE + "/" + libretroDir + "/" + type + "/" + encodeURIComponent(variant) + ".png";
            try {
                await downloadFile(url, localFile);
                db.prepare(UPSERT_SQL).run(rom.id, relPath, relPath);
                return { ok: true, source: type, variant: variant };
            } catch(e) {
                // next
            }
        }
    }

    return { ok: false };
}

async function main() {
    let fetched = 0, failed = 0;
    const startTime = Date.now();

    for (let i = 0; i < candidates.length; i++) {
        const rom = candidates[i];
        const result = await tryFetch(rom);
        if (result.ok) {
            fetched++;
            console.log("[" + (i+1) + "/" + candidates.length + "] OK: " + rom.clean_name + " (" + (result.source || "") + (result.variant ? "/" + result.variant : "") + ")");
        } else {
            failed++;
        }
        // Print progress every 20 ROMs
        if ((i+1) % 20 === 0) {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            console.log("[" + (i+1) + "/" + candidates.length + "] " + fetched + " fetched, " + failed + " failed, " + elapsed + "s elapsed");
        }
        await sleep(50);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log("");
    console.log("COMPLETE: " + fetched + " fetched, " + failed + " failed in " + elapsed + "s");
    db.close();
}

main().catch(err => { console.error(err); process.exit(1); });
