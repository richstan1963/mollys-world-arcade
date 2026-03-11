/* ════════════════════════════════════════════════════════════════
   MobyGames API — Credits, attributes, game metadata
   Free tier: 360 requests/hour
   Register at: https://www.mobygames.com/info/api
   ════════════════════════════════════════════════════════════════ */
import https from 'https';

const MOBY_API = 'https://api.mobygames.com/v1';

// Our system_id → MobyGames platform IDs
const MOBY_PLATFORM_MAP = {
    nes: 22, snes: 15, gba: 12, genesis: 16, gamegear: 25,
    saturn: 23, dreamcast: 8, '32x': 21, psx: 6,
    atari2600: 28, atari7800: 34, jaguar: 17, lynx: 18,
    tg16: 40, neogeo: 36, arcade: 143, fbneo: 143,
    gb: 10, gbc: 11, n64: 9, nds: 44, psp: 46,
    gamecube: 14, wii: 82, wiiu: 132, ps2: 7, xbox: 13, sms: 26,
};

let batchProgress = null;
export function getMobyProgress() { return batchProgress; }

function mobyGet(endpoint, params = {}) {
    const key = process.env.MOBYGAMES_API_KEY;
    if (!key) return Promise.reject(new Error('MOBYGAMES_API_KEY not configured'));

    const qs = new URLSearchParams({ api_key: key, ...params });
    const url = `${MOBY_API}${endpoint}?${qs}`;

    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'YourWorldArcade/1.0' } }, (res) => {
            if (res.statusCode === 429) { res.resume(); reject(new Error('MobyGames rate limited')); return; }
            if (res.statusCode !== 200) { res.resume(); reject(new Error(`Moby HTTP ${res.statusCode}`)); return; }
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch { reject(new Error('Moby invalid JSON')); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Moby timeout')); });
    });
}

/**
 * Search MobyGames for a game by name + optional platform.
 */
export async function searchGame(name, systemId) {
    const cleanName = name
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/\s*\[[^\]]*\]/g, '')
        .replace(/,\s*The$/i, '')
        .trim();

    const params = { title: cleanName, limit: '1' };
    const platformId = MOBY_PLATFORM_MAP[systemId];
    if (platformId) params.platform = String(platformId);

    const data = await mobyGet('/games', params);
    return data?.games?.[0] || null;
}

/**
 * Fetch game data from MobyGames and update metadata.
 */
export async function fetchGameData(db, rom) {
    const displayName = rom.title || rom.clean_name;
    if (!displayName) return { ok: false, error: 'No game name' };

    const game = await searchGame(displayName, rom.system_id);
    if (!game) return { ok: false, error: 'Not found on MobyGames' };

    const description = game.description || '';
    const genres = (game.genres || []).map(g => g.genre_name).join(', ');
    // Attributes are unique to MobyGames (perspective, visual style, gameplay elements)
    const attributes = game.attributes || null;

    db.prepare(`
        INSERT INTO metadata (rom_id, description, genre, moby_id, moby_attributes, metadata_source, fetched_at)
        VALUES (?, ?, ?, ?, ?, 'mobygames', datetime('now'))
        ON CONFLICT(rom_id) DO UPDATE SET
            description     = COALESCE(NULLIF(excluded.description, ''), description),
            genre           = COALESCE(NULLIF(excluded.genre, ''),       genre),
            moby_id         = excluded.moby_id,
            moby_attributes = COALESCE(excluded.moby_attributes, moby_attributes),
            fetched_at      = datetime('now')
    `).run(
        rom.id,
        description || null, genres || null,
        game.game_id, attributes ? JSON.stringify(attributes) : null
    );

    return { ok: true, mobyName: game.title, mobyId: game.game_id };
}

/**
 * Batch fetch from MobyGames for ROMs missing Moby data.
 */
export async function batchFetchMoby(db, roms) {
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
                console.log(`[mobygames] ✅ ${rom.clean_name} → ${result.mobyName}`);
            } else {
                failed++;
            }
        } catch (err) {
            failed++;
            if (err.message.includes('rate limited')) {
                console.log('[mobygames] Rate limited, waiting 15s...');
                await sleep(15000);
            } else {
                console.error(`[mobygames] ❌ ${rom.clean_name}: ${err.message}`);
            }
        }
        batchProgress.processed++;
        batchProgress.fetched = fetched;
        batchProgress.failed = failed;
        await sleep(10000); // 360/hr = 1 every 10s
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    batchProgress = { ...batchProgress, running: false, elapsed, completedAt: new Date().toISOString() };
    console.log(`[mobygames] Batch done: ✅ ${fetched} / ❌ ${failed} — ${elapsed}s`);
    return { fetched, failed, elapsed };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
