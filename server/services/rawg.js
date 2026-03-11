/* ════════════════════════════════════════════════════════════════
   RAWG.io API — Game metadata, ratings, Metacritic scores
   Free tier: 20K requests/month, 500K+ game database
   Register at: https://rawg.io/apidocs
   ════════════════════════════════════════════════════════════════ */
import https from 'https';

const RAWG_API = 'https://api.rawg.io/api';

// Our system_id → RAWG platform IDs
const RAWG_PLATFORM_MAP = {
    nes: 49, snes: 79, gba: 26, genesis: 167, gamegear: 77,
    saturn: 107, dreamcast: 106, '32x': 117, psx: 27,
    atari2600: 31, atari7800: 28, jaguar: 171, lynx: 46,
    tg16: 105, neogeo: 12, ngp: 25, arcade: 166, fbneo: 166,
    wonderswan: 45, vb: 11, gb: 26, gbc: 43, n64: 83,
    nds: 9, psp: 17, gamecube: 105, wii: 11, wiiu: 10,
    ps2: 15, xbox: 80, sms: 74,
};

let batchProgress = null;
export function getRAWGProgress() { return batchProgress; }

function rawgGet(endpoint, params = {}) {
    const key = process.env.RAWG_API_KEY;
    if (!key) return Promise.reject(new Error('RAWG_API_KEY not configured'));

    const qs = new URLSearchParams({ key, ...params });
    const url = `${RAWG_API}${endpoint}?${qs}`;

    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'YourWorldArcade/1.0' } }, (res) => {
            if (res.statusCode === 429) { res.resume(); reject(new Error('RAWG rate limited')); return; }
            if (res.statusCode !== 200) { res.resume(); reject(new Error(`RAWG HTTP ${res.statusCode}`)); return; }
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch { reject(new Error('RAWG invalid JSON')); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('RAWG timeout')); });
    });
}

/**
 * Search RAWG for a game by name + optional platform.
 */
export async function searchGame(name, systemId) {
    const cleanName = name
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/\s*\[[^\]]*\]/g, '')
        .replace(/,\s*The$/i, '')
        .trim();

    const params = { search: cleanName, page_size: '1', search_precise: 'true' };
    const platformId = RAWG_PLATFORM_MAP[systemId];
    if (platformId) params.platforms = String(platformId);

    const data = await rawgGet('/games', params);
    return data?.results?.[0] || null;
}

/**
 * Get detailed game info from RAWG.
 */
export async function getGameDetails(rawgId) {
    return rawgGet(`/games/${rawgId}`);
}

/**
 * Fetch game data from RAWG and update metadata.
 */
export async function fetchGameData(db, rom) {
    const displayName = rom.title || rom.clean_name;
    if (!displayName) return { ok: false, error: 'No game name' };

    const game = await searchGame(displayName, rom.system_id);
    if (!game) return { ok: false, error: 'Not found on RAWG' };

    // Get detailed info for full description
    let details = null;
    try { details = await getGameDetails(game.id); } catch {}

    const description = details?.description_raw || game.description_raw || '';
    const genres = (game.genres || []).map(g => g.name).join(', ');
    const year = game.released ? game.released.slice(0, 4) : '';
    const metacritic = game.metacritic || null;
    const rating = game.rating || null;
    const screenshots = details?.screenshots?.results?.slice(0, 4).map(s => s.image) || [];

    db.prepare(`
        INSERT INTO metadata (rom_id, description, genre, year, rawg_id, metacritic_score, rawg_rating, metadata_source, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'rawg', datetime('now'))
        ON CONFLICT(rom_id) DO UPDATE SET
            description     = COALESCE(NULLIF(excluded.description, ''), description),
            genre           = COALESCE(NULLIF(excluded.genre, ''),       genre),
            year            = COALESCE(NULLIF(excluded.year, ''),        year),
            rawg_id         = excluded.rawg_id,
            metacritic_score= COALESCE(excluded.metacritic_score, metacritic_score),
            rawg_rating     = COALESCE(excluded.rawg_rating,      rawg_rating),
            fetched_at      = datetime('now')
    `).run(
        rom.id,
        description || null, genres || null, year || null,
        game.id, metacritic, rating
    );

    return { ok: true, rawgName: game.name, rawgId: game.id, metacritic };
}

/**
 * Batch fetch from RAWG for ROMs missing RAWG data.
 */
export async function batchFetchRAWG(db, roms) {
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
                console.log(`[rawg] ✅ ${rom.clean_name} → ${result.rawgName} (MC: ${result.metacritic || 'n/a'})`);
            } else {
                failed++;
            }
        } catch (err) {
            failed++;
            if (err.message.includes('rate limited')) {
                console.log('[rawg] Rate limited, waiting 5s...');
                await sleep(5000);
            } else {
                console.error(`[rawg] ❌ ${rom.clean_name}: ${err.message}`);
            }
        }
        batchProgress.processed++;
        batchProgress.fetched = fetched;
        batchProgress.failed = failed;
        await sleep(500); // Stay well under 20K/month
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    batchProgress = { ...batchProgress, running: false, elapsed, completedAt: new Date().toISOString() };
    console.log(`[rawg] Batch done: ✅ ${fetched} / ❌ ${failed} — ${elapsed}s`);
    return { fetched, failed, elapsed };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
