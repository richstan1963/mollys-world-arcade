/* ════════════════════════════════════════════════════════════════
   Giant Bomb API — Editorial game content, long descriptions
   Free tier: 200 requests/hour
   Register at: https://www.giantbomb.com/api/
   ════════════════════════════════════════════════════════════════ */
import https from 'https';

const GB_API = 'https://www.giantbomb.com/api';

// Our system_id → Giant Bomb platform IDs
const GB_PLATFORM_MAP = {
    nes: 21, snes: 9, gba: 4, genesis: 6, gamegear: 5,
    saturn: 42, dreamcast: 37, '32x': 31, psx: 22,
    atari2600: 40, atari7800: 70, jaguar: 28, lynx: 36,
    tg16: 55, neogeo: 25, arcade: 84, fbneo: 84,
    gb: 3, gbc: 57, n64: 43, nds: 52, psp: 18,
    gamecube: 23, wii: 36, wiiu: 139, ps2: 19, xbox: 32, sms: 8,
};

let batchProgress = null;
export function getGBProgress() { return batchProgress; }

function gbGet(endpoint, params = {}) {
    const key = process.env.GIANTBOMB_API_KEY;
    if (!key) return Promise.reject(new Error('GIANTBOMB_API_KEY not configured'));

    const qs = new URLSearchParams({ api_key: key, format: 'json', ...params });
    const url = `${GB_API}${endpoint}?${qs}`;

    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'YourWorldArcade/1.0' } }, (res) => {
            if (res.statusCode === 429) { res.resume(); reject(new Error('Giant Bomb rate limited')); return; }
            if (res.statusCode !== 200) { res.resume(); reject(new Error(`GB HTTP ${res.statusCode}`)); return; }
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch { reject(new Error('GB invalid JSON')); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('GB timeout')); });
    });
}

/**
 * Search Giant Bomb for a game by name + optional platform.
 */
export async function searchGame(name, systemId) {
    const cleanName = name
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/\s*\[[^\]]*\]/g, '')
        .replace(/,\s*The$/i, '')
        .trim();

    const params = { query: cleanName, resources: 'game', limit: '1' };
    const platformId = GB_PLATFORM_MAP[systemId];
    if (platformId) params.platforms = String(platformId);

    const data = await gbGet('/search', params);
    return data?.results?.[0] || null;
}

/**
 * Fetch game data from Giant Bomb and update metadata.
 */
export async function fetchGameData(db, rom) {
    const displayName = rom.title || rom.clean_name;
    if (!displayName) return { ok: false, error: 'No game name' };

    const game = await searchGame(displayName, rom.system_id);
    if (!game) return { ok: false, error: 'Not found on Giant Bomb' };

    const deck = game.deck || '';            // Short description
    const description = game.description || ''; // Full HTML description (editorial)

    db.prepare(`
        INSERT INTO metadata (rom_id, giantbomb_id, giantbomb_deck, metadata_source, fetched_at)
        VALUES (?, ?, ?, 'giantbomb', datetime('now'))
        ON CONFLICT(rom_id) DO UPDATE SET
            giantbomb_id   = excluded.giantbomb_id,
            giantbomb_deck = COALESCE(excluded.giantbomb_deck, giantbomb_deck),
            fetched_at     = datetime('now')
    `).run(rom.id, game.id, deck || null);

    return { ok: true, gbName: game.name, gbId: game.id };
}

/**
 * Batch fetch from Giant Bomb for ROMs missing GB data.
 */
export async function batchFetchGiantBomb(db, roms) {
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
                console.log(`[giantbomb] ✅ ${rom.clean_name} → ${result.gbName}`);
            } else {
                failed++;
            }
        } catch (err) {
            failed++;
            if (err.message.includes('rate limited')) {
                console.log('[giantbomb] Rate limited, waiting 20s...');
                await sleep(20000);
            } else {
                console.error(`[giantbomb] ❌ ${rom.clean_name}: ${err.message}`);
            }
        }
        batchProgress.processed++;
        batchProgress.fetched = fetched;
        batchProgress.failed = failed;
        await sleep(18000); // 200/hr = 1 every 18s
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    batchProgress = { ...batchProgress, running: false, elapsed, completedAt: new Date().toISOString() };
    console.log(`[giantbomb] Batch done: ✅ ${fetched} / ❌ ${failed} — ${elapsed}s`);
    return { fetched, failed, elapsed };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
