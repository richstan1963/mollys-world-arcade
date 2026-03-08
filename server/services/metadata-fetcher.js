import fs from 'fs';
import path from 'path';
import https from 'https';
import { CONFIG } from '../config.js';

// In-memory cache: libretroDir+type → Map<normalizedName, exactCdnFilename>
const cdnIndexCache = new Map();

// Track batch progress globally
let batchProgress = null;

export function getBatchProgress() {
    return batchProgress;
}

// ── CDN Index ────────────────────────────────────────────────────────────────

// Fetch the full file listing for a system+type from Libretro CDN.
// Returns a Map: normalizedTitle → exact CDN filename (without .png)
async function fetchCdnIndex(libretroDir, type) {
    const cacheKey = `${libretroDir}::${type}`;
    if (cdnIndexCache.has(cacheKey)) return cdnIndexCache.get(cacheKey);

    const encoded = encodeURIComponent(libretroDir);
    const url = `${CONFIG.LIBRETRO_THUMBS}/${encoded}/${type}/`;

    let html;
    try {
        html = await fetchText(url);
    } catch {
        cdnIndexCache.set(cacheKey, new Map());
        return cdnIndexCache.get(cacheKey);
    }

    // Parse <a href="Filename.png"> entries from the directory listing
    const fileMap = new Map();
    const re = /href="([^"]+\.png)"/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const encoded = m[1];
        // Decode both URL encoding and HTML entities (&amp; → &, etc.)
        const decoded = decodeURIComponent(encoded)
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'");
        const withoutExt = decoded.replace(/\.png$/i, '');         // "WipEout (USA)"
        const normalized = normalizeTitle(withoutExt);             // "wipeout usa"
        fileMap.set(normalized, withoutExt);
    }

    cdnIndexCache.set(cacheKey, fileMap);
    console.log(`[cdn-index] ${libretroDir}/${type}: ${fileMap.size} entries`);
    return fileMap;
}

// Strip region/revision noise and lowercase for fuzzy comparison.
// Also joins consecutive single-char words: "E.V.O." → "evo", "D & D" → "dd"
function normalizeTitle(title) {
    const base = title
        .toLowerCase()
        .replace(/\s*\([^)]*\)/g, '')   // remove (USA), (Japan), (Rev 1), etc.
        .replace(/[''`´ʼ]/g, '')        // remove apostrophes without adding space: Kirby's→Kirbys
        .replace(/\s*-\s*/g, ' ')       // dashes → space
        .replace(/[^a-z0-9]/g, ' ')     // remaining symbols → space
        .replace(/\s+/g, ' ')
        .trim();

    // Join runs of single-char words: "e v o" → "evo", "d d" → "dd"
    // Handles acronyms like E.V.O., D&D, R-Type, etc.
    const words = base.split(' ');
    const joined = [];
    let run = '';
    for (const w of words) {
        if (w.length === 1) {
            run += w;
        } else {
            if (run) { joined.push(run); run = ''; }
            joined.push(w);
        }
    }
    if (run) joined.push(run);
    return joined.join(' ');
}

// Common abbreviation expansions for CDN matching (prefix-aware)
const TITLE_EXPANSIONS = {
    'tmnt':     'teenage mutant ninja turtles',
    'dkc':      'donkey kong country',
    'ff':       'final fantasy',
    'smb':      'super mario bros',
    'punchout': 'punch out',
    'mkii':     'mortal kombat ii',
    'mkiii':    'mortal kombat iii',
};

// Stop words to ignore in all-words matching strategy
const STOP_WORDS = new Set(['and', 'the', 'for', 'of', 'in', 'at', 'to', 'a', 'an', 'vs', 'ii', 'iii', 'iv']);

// Expand a normalized needle using TITLE_EXPANSIONS (handles prefix: "tmnt ii" → "teenage mutant ninja turtles ii")
function expandNeedle(needle) {
    if (TITLE_EXPANSIONS[needle]) return TITLE_EXPANSIONS[needle];
    for (const [abbr, full] of Object.entries(TITLE_EXPANSIONS)) {
        if (needle.startsWith(abbr + ' ')) {
            return full + needle.slice(abbr.length);
        }
    }
    return null;
}

// Find best CDN match for a clean_name. Returns exact CDN title or null.
function findCdnMatch(cleanName, fileMap) {
    if (fileMap.size === 0) return null;

    const needle   = normalizeTitle(cleanName);
    const expanded = expandNeedle(needle);

    // 1. Exact normalized match
    if (fileMap.has(needle))              return fileMap.get(needle);
    if (expanded && fileMap.has(expanded)) return fileMap.get(expanded);

    // 2. Strict prefix: CDN entry norm starts with our needle (CDN name is more specific)
    for (const [norm, exact] of fileMap) {
        if (norm === needle)                        return exact;
        if (expanded && norm === expanded)           return exact;
        if (norm.startsWith(needle + ' '))           return exact;
        if (expanded && norm.startsWith(expanded + ' ')) return exact;
    }

    // 3. Reverse prefix: our needle starts with CDN norm (we have more words than CDN)
    //    e.g. "street fighter ii the world warrior" starts with CDN's "street fighter ii"
    for (const [norm, exact] of fileMap) {
        if (norm.length > 4 && needle.startsWith(norm + ' '))            return exact;
        if (expanded && norm.length > 4 && expanded.startsWith(norm + ' ')) return exact;
    }

    // 4. Compound-word prefix: our word starts with CDN word or vice versa
    //    Handles "dreamland" vs "dream land", "punchout" vs "punch out"
    const needleWords  = needle.split(' ');
    const expandedWords = expanded ? expanded.split(' ') : null;
    for (const [norm, exact] of fileMap) {
        const normWords = norm.split(' ');
        const check = (nw) => nw.every(w =>
            normWords.some(nwrd => nwrd === w || nwrd.startsWith(w) || w.startsWith(nwrd))
        );
        if (check(needleWords))                           return exact;
        if (expandedWords && check(expandedWords))        return exact;
    }

    // 5. All significant words in needle appear in norm (skip stop words & short words)
    const words = needle.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w));
    const expWords = expanded ? expanded.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w)) : null;
    if (words.length > 0) {
        for (const [norm, exact] of fileMap) {
            if (words.every(w => norm.includes(w)))               return exact;
            if (expWords && expWords.every(w => norm.includes(w))) return exact;
        }
    }

    return null;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function fetchArtwork(db, rom) {
    if (!rom.libretro_dir) {
        return { ok: false, error: 'Missing libretro_dir' };
    }

    // Use metadata title for systems where clean_name is a ROM code (e.g. MAME arcade)
    const displayName = rom.title || rom.clean_name;
    if (!displayName) {
        return { ok: false, error: 'Missing clean_name and title' };
    }

    const artworkDir = path.join(CONFIG.ARTWORK_DIR, rom.system_id);
    if (!fs.existsSync(artworkDir)) fs.mkdirSync(artworkDir, { recursive: true });

    // Use clean_name as local filename (safe, already cleaned)
    const localName = rom.clean_name || displayName;
    const localFile = path.join(artworkDir, `${localName}.png`);

    // Already cached locally?
    if (fs.existsSync(localFile) && fs.statSync(localFile).size > 0) {
        updateArtworkPath(db, rom.id, `${rom.system_id}/${localName}.png`);
        return { ok: true, path: localFile, source: 'cache' };
    }

    // Try Boxarts first, then Snaps
    for (const type of ['Named_Boxarts', 'Named_Snaps']) {
        const fileMap = await fetchCdnIndex(rom.libretro_dir, type);
        const match   = findCdnMatch(displayName, fileMap);

        if (match) {
            const cdnUrl = `${CONFIG.LIBRETRO_THUMBS}/${encodeURIComponent(rom.libretro_dir)}/${type}/${encodeURIComponent(match)}.png`;
            try {
                await downloadFile(cdnUrl, localFile);
                updateArtworkPath(db, rom.id, `${rom.system_id}/${localName}.png`);
                return { ok: true, path: localFile, source: type, variant: match };
            } catch {
                // file might be corrupt — remove it
                try { fs.unlinkSync(localFile); } catch {}
            }
        }
    }

    return { ok: false, error: 'No artwork found on Libretro CDN' };
}

export async function batchFetchArtwork(db, roms) {
    let fetched = 0;
    let failed  = 0;
    const startTime = Date.now();

    batchProgress = {
        total:      roms.length,
        processed:  0,
        fetched:    0,
        failed:     0,
        running:    true,
        startedAt:  new Date().toISOString(),
        currentRom: null,
        errors:     [],
    };

    for (const rom of roms) {
        batchProgress.currentRom = rom.title || rom.clean_name || rom.filename;
        try {
            const result = await fetchArtwork(db, rom);
            if (result.ok) {
                fetched++;
                batchProgress.fetched = fetched;
                console.log(`[artwork] ✅ ${rom.title || rom.clean_name} → ${result.variant || 'cache'}`);
            } else {
                failed++;
                batchProgress.failed = failed;
            }
        } catch (err) {
            failed++;
            batchProgress.failed = failed;
            console.error(`[artwork] ❌ ${rom.title || rom.clean_name}:`, err.message);
        }
        batchProgress.processed++;
        await sleep(CONFIG.METADATA_FETCH_DELAY);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    batchProgress = { ...batchProgress, running: false, elapsed, completedAt: new Date().toISOString() };
    console.log(`[metadata-fetcher] Batch done: ✅ ${fetched} / ❌ ${failed} — ${elapsed}s`);
    return { fetched, failed, elapsed };
}

// ── DB ───────────────────────────────────────────────────────────────────────

function updateArtworkPath(db, romId, relativePath) {
    db.prepare(`
        INSERT INTO metadata (rom_id, artwork_path, metadata_source, fetched_at)
        VALUES (?, ?, 'libretro', datetime('now'))
        ON CONFLICT(rom_id) DO UPDATE SET artwork_path = ?, fetched_at = datetime('now')
    `).run(romId, relativePath, relativePath);
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function fetchText(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'MollysWorldArcade/1.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                fetchText(res.headers.location).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => resolve(body));
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'MollysWorldArcade/1.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                downloadFile(res.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
            file.on('error', err => { try { fs.unlinkSync(dest); } catch {} reject(err); });
        });
        req.on('error', reject);
        req.setTimeout(12000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
