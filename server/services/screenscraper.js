import https from 'https';
import fs from 'fs';
import path from 'path';
import { CONFIG, SS_SYSTEM_MAP } from '../config.js';

let batchProgress = null;
export function getSSProgress() { return batchProgress; }

function ssRequest(endpoint, params) {
    const devId = process.env.SCREENSCRAPER_DEV_ID;
    const devPw = process.env.SCREENSCRAPER_DEV_PASSWORD;
    const user  = process.env.SCREENSCRAPER_USER;
    const pw    = process.env.SCREENSCRAPER_PASSWORD;

    if (!devId || !devPw) {
        return Promise.reject(new Error('ScreenScraper credentials not configured'));
    }

    const qs = new URLSearchParams({
        devid: devId, devpassword: devPw,
        softname: 'YourWorldArcade', output: 'json',
        ...(user && pw ? { ssid: user, sspassword: pw } : {}),
        ...params,
    });

    const url = `${CONFIG.SCREENSCRAPER_API}/${endpoint}?${qs}`;

    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'YourWorldArcade/1.0' } }, (res) => {
            if (res.statusCode === 430 || res.statusCode === 429) {
                res.resume();
                reject(new Error('ScreenScraper rate limited'));
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`SS HTTP ${res.statusCode}`));
                return;
            }
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch { reject(new Error('SS invalid JSON')); }
            });
        });
        req.on('error', reject);
        req.setTimeout(20000, () => { req.destroy(); reject(new Error('SS timeout')); });
    });
}

function pickText(arr, lang = 'en') {
    if (!arr || !Array.isArray(arr)) return '';
    const en = arr.find(t => t.langue === lang);
    return (en || arr[0])?.text || '';
}

function pickMedia(medias, type, region = 'us') {
    if (!medias || !Array.isArray(medias)) return null;
    const match = medias.find(m => m.type === type && m.region === region)
               || medias.find(m => m.type === type);
    return match?.url || null;
}

/**
 * Search ScreenScraper by MD5 hash.
 */
export async function searchByHash(md5, systemId) {
    const ssSystemId = SS_SYSTEM_MAP[systemId];
    if (!ssSystemId) return null;

    const params = { md5: md5.toLowerCase() };
    if (ssSystemId) params.systemeid = String(ssSystemId);

    try {
        const data = await ssRequest('jeuInfos.php', params);
        return data?.response?.jeu || null;
    } catch (err) {
        if (err.message.includes('rate limited')) throw err;
        return null;
    }
}

/**
 * Fetch game data from ScreenScraper and update metadata.
 */
export async function fetchGameData(db, rom) {
    if (!rom.md5) return { ok: false, error: 'No MD5 hash' };

    const jeu = await searchByHash(rom.md5, rom.system_id);
    if (!jeu) return { ok: false, error: 'Not found on ScreenScraper' };

    // Extract metadata
    const title = pickText(jeu.noms, 'en') || jeu.noms?.[0]?.text || '';
    const year = jeu.dates?.find(d => d.region === 'us')?.text?.slice(0, 4)
              || jeu.dates?.[0]?.text?.slice(0, 4) || '';
    const publisher = pickText(jeu.editeur, 'en') || jeu.editeur?.text || '';
    const developer = pickText(jeu.developpeur, 'en') || jeu.developpeur?.text || '';
    const genre = jeu.genres ? jeu.genres.map(g => pickText(g.noms, 'en')).filter(Boolean).join(', ') : '';
    const players = jeu.joueurs?.text || '';
    const description = pickText(jeu.synopsis, 'en');
    const rating = jeu.note?.text ? parseFloat(jeu.note.text) / 20 * 5 : null; // Convert 0-20 to 0-5

    // Get media URLs
    const medias = jeu.medias || [];
    const boxartUrl = pickMedia(medias, 'box-2D', 'us') || pickMedia(medias, 'box-2D');
    const screenshotUrls = medias
        .filter(m => m.type === 'ss' || m.type === 'sstitle')
        .slice(0, 4)
        .map(m => m.url)
        .filter(Boolean);

    // Download box art locally if we don't have artwork yet
    const existingMeta = db.prepare('SELECT artwork_path FROM metadata WHERE rom_id = ?').get(rom.id);
    let artworkPath = existingMeta?.artwork_path || null;

    if (!artworkPath && boxartUrl) {
        try {
            const artDir = path.join(CONFIG.ARTWORK_DIR, rom.system_id);
            if (!fs.existsSync(artDir)) fs.mkdirSync(artDir, { recursive: true });
            const localFile = path.join(artDir, `${rom.clean_name || rom.id}.png`);
            await downloadFile(boxartUrl, localFile);
            artworkPath = `${rom.system_id}/${rom.clean_name || rom.id}.png`;
        } catch { /* artwork download failed, non-fatal */ }
    }

    // Update metadata
    db.prepare(`
        INSERT INTO metadata (rom_id, title, year, publisher, developer, genre, players, description, rating,
                              artwork_path, screenshots, screenscraper_id, metadata_source, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'screenscraper', datetime('now'))
        ON CONFLICT(rom_id) DO UPDATE SET
            title       = COALESCE(excluded.title,       title),
            year        = COALESCE(excluded.year,        year),
            publisher   = COALESCE(excluded.publisher,   publisher),
            developer   = COALESCE(excluded.developer,   developer),
            genre       = COALESCE(excluded.genre,       genre),
            players     = COALESCE(excluded.players,     players),
            description = COALESCE(excluded.description, description),
            rating      = COALESCE(excluded.rating,      rating),
            artwork_path= COALESCE(excluded.artwork_path,artwork_path),
            screenshots = COALESCE(excluded.screenshots, screenshots),
            screenscraper_id = excluded.screenscraper_id,
            metadata_source  = 'screenscraper',
            fetched_at       = datetime('now')
    `).run(
        rom.id,
        title || null, year || null, publisher || null, developer || null,
        genre || null, players || null, description || null, rating,
        artworkPath, screenshotUrls.length ? JSON.stringify(screenshotUrls) : null,
        jeu.id || null
    );

    return { ok: true, title, ssId: jeu.id };
}

/**
 * Batch fetch from ScreenScraper for ROMs missing metadata.
 */
export async function batchFetchScreenScraper(db, roms) {
    let fetched = 0, failed = 0;
    const startTime = Date.now();

    batchProgress = {
        total: roms.length, processed: 0, fetched: 0, failed: 0,
        running: true, startedAt: new Date().toISOString(), currentRom: null,
    };

    for (const rom of roms) {
        batchProgress.currentRom = rom.title || rom.clean_name || rom.filename;
        try {
            const result = await fetchGameData(db, rom);
            if (result.ok) {
                fetched++;
                console.log(`[screenscraper] ✅ ${rom.clean_name} → ${result.title}`);
            } else {
                failed++;
            }
        } catch (err) {
            failed++;
            if (err.message.includes('rate limited')) {
                console.log('[screenscraper] Rate limited, waiting 10s...');
                await sleep(10000);
            }
        }
        batchProgress.processed++;
        batchProgress.fetched = fetched;
        batchProgress.failed = failed;
        await sleep(1200); // ~1 req/sec to stay under limits
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    batchProgress = { ...batchProgress, running: false, elapsed, completedAt: new Date().toISOString() };
    console.log(`[screenscraper] Batch done: ✅ ${fetched} / ❌ ${failed} — ${elapsed}s`);
    return { fetched, failed, elapsed };
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'YourWorldArcade/1.0' } }, (res) => {
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
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
