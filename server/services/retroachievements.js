import https from 'https';
import { CONFIG } from '../config.js';

let batchProgress = null;
export function getRAProgress() { return batchProgress; }

/**
 * Look up a game on RetroAchievements by MD5 hash.
 */
async function getGameByHash(md5) {
    const apiKey = process.env.RA_API_KEY;
    const user   = process.env.RA_USERNAME;
    if (!apiKey || !user) throw new Error('RetroAchievements credentials not configured');

    // First get game ID from hash
    const hashData = await raRequest('API_GetGameInfoAndUserProgress.php', {
        z: user, y: apiKey, g: 0, u: user, h: md5.toLowerCase(),
    });

    // If hash lookup doesn't work, try the dedicated hash endpoint
    if (!hashData?.ID) {
        const hashLookup = await raRequest('API_GetGameInfoExtended.php', {
            z: user, y: apiKey, i: 0, h: md5.toLowerCase(),
        });
        return hashLookup;
    }

    return hashData;
}

/**
 * Look up game info by RA game ID.
 */
async function getGameById(gameId) {
    const apiKey = process.env.RA_API_KEY;
    const user   = process.env.RA_USERNAME;

    return raRequest('API_GetGameInfoExtended.php', {
        z: user, y: apiKey, i: String(gameId),
    });
}

/**
 * Fetch achievement data for a ROM and store it.
 */
export async function fetchAchievements(db, rom) {
    if (!rom.md5) return { ok: false, error: 'No MD5 hash' };

    let gameData;
    try {
        gameData = await getGameByHash(rom.md5);
    } catch (err) {
        return { ok: false, error: err.message };
    }

    if (!gameData?.ID || gameData.ID === 0) {
        return { ok: false, error: 'Not found on RetroAchievements' };
    }

    const achievementCount = gameData.NumAchievements
        || gameData.NumDistinctPlayersCasual
        || (gameData.Achievements ? Object.keys(gameData.Achievements).length : 0);

    const iconUrl = gameData.ImageIcon
        ? `https://retroachievements.org${gameData.ImageIcon}`
        : null;

    db.prepare(`
        INSERT INTO retro_achievements (rom_id, ra_game_id, achievement_count, ra_icon_url, fetched_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(rom_id) DO UPDATE SET
            ra_game_id = excluded.ra_game_id,
            achievement_count = excluded.achievement_count,
            ra_icon_url = excluded.ra_icon_url,
            fetched_at = datetime('now')
    `).run(rom.id, gameData.ID, achievementCount || 0, iconUrl);

    return { ok: true, raGameId: gameData.ID, achievements: achievementCount || 0 };
}

/**
 * Batch fetch RetroAchievements data.
 */
export async function batchFetchRA(db, roms) {
    let fetched = 0, failed = 0;
    const startTime = Date.now();

    batchProgress = {
        total: roms.length, processed: 0, fetched: 0, failed: 0,
        running: true, startedAt: new Date().toISOString(), currentRom: null,
    };

    for (const rom of roms) {
        batchProgress.currentRom = rom.title || rom.clean_name || rom.filename;
        try {
            const result = await fetchAchievements(db, rom);
            if (result.ok) {
                fetched++;
                console.log(`[ra] ✅ ${rom.clean_name} → ${result.achievements} achievements`);
            } else {
                failed++;
            }
        } catch (err) {
            failed++;
            console.error(`[ra] ❌ ${rom.clean_name}: ${err.message}`);
        }
        batchProgress.processed++;
        batchProgress.fetched = fetched;
        batchProgress.failed = failed;
        await sleep(500); // ~2 req/sec
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    batchProgress = { ...batchProgress, running: false, elapsed, completedAt: new Date().toISOString() };
    console.log(`[ra] Batch done: ✅ ${fetched} / ❌ ${failed} — ${elapsed}s`);
    return { fetched, failed, elapsed };
}

// ── HTTP helper ──────────────────────────────────────────────────────────────

function raRequest(endpoint, params) {
    const qs = new URLSearchParams(params).toString();
    const url = `${CONFIG.RETROACHIEVEMENTS_API}/${endpoint}?${qs}`;

    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'YourWorldArcade/1.0' } }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`RA HTTP ${res.statusCode}`));
                return;
            }
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch { reject(new Error('RA invalid JSON')); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('RA timeout')); });
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
