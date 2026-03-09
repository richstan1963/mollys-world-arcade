import https from 'https';
import { CONFIG, IGDB_PLATFORM_MAP } from '../config.js';

let batchProgress = null;
let cachedToken = null;
let tokenExpiry = 0;

export function getIGDBProgress() { return batchProgress; }

/**
 * Authenticate with Twitch OAuth to get IGDB access token.
 */
async function authenticate() {
    if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

    const clientId = process.env.IGDB_CLIENT_ID;
    const clientSecret = process.env.IGDB_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('IGDB credentials not configured');

    const url = `${CONFIG.TWITCH_AUTH_URL}?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`;

    const data = await postRequest(url, '');
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // Refresh 60s early
    return cachedToken;
}

/**
 * Search IGDB for a game by name + platform.
 */
export async function searchGame(name, systemId) {
    const token = await authenticate();
    const clientId = process.env.IGDB_CLIENT_ID;
    const platformId = IGDB_PLATFORM_MAP[systemId];

    // Clean game name for search
    const cleanName = name
        .replace(/\s*\([^)]*\)/g, '')    // Remove (USA), (Rev 1), etc.
        .replace(/\s*\[[^\]]*\]/g, '')    // Remove [!], [b], etc.
        .replace(/,\s*The$/i, '')         // "Legend of Zelda, The" → "Legend of Zelda"
        .trim();

    let body = `search "${cleanName.replace(/"/g, '\\"')}"; fields name,summary,genres.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,first_release_date; limit 1;`;
    if (platformId) {
        body = `search "${cleanName.replace(/"/g, '\\"')}"; fields name,summary,genres.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,first_release_date; where platforms = (${platformId}); limit 1;`;
    }

    const results = await igdbRequest('/games', body, token, clientId);
    return results?.[0] || null;
}

/**
 * Fetch game data from IGDB and update metadata.
 */
export async function fetchGameData(db, rom) {
    const displayName = rom.title || rom.clean_name;
    if (!displayName) return { ok: false, error: 'No game name' };

    const game = await searchGame(displayName, rom.system_id);
    if (!game) return { ok: false, error: 'Not found on IGDB' };

    // Extract developer and publisher
    const companies = game.involved_companies || [];
    const developer = companies.find(c => c.developer)?.company?.name || '';
    const publisher = companies.find(c => c.publisher)?.company?.name || '';
    const genres = (game.genres || []).map(g => g.name).join(', ');
    const description = game.summary || '';
    const year = game.first_release_date
        ? new Date(game.first_release_date * 1000).getFullYear().toString()
        : '';

    db.prepare(`
        INSERT INTO metadata (rom_id, description, genre, developer, publisher, year, igdb_id, metadata_source, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'igdb', datetime('now'))
        ON CONFLICT(rom_id) DO UPDATE SET
            description = COALESCE(excluded.description, description),
            genre       = COALESCE(excluded.genre,       genre),
            developer   = COALESCE(excluded.developer,   developer),
            publisher   = COALESCE(excluded.publisher,   publisher),
            year        = COALESCE(excluded.year,        year),
            igdb_id     = excluded.igdb_id,
            fetched_at  = datetime('now')
    `).run(
        rom.id,
        description || null, genres || null, developer || null,
        publisher || null, year || null, game.id
    );

    return { ok: true, igdbName: game.name, igdbId: game.id };
}

/**
 * Batch fetch from IGDB.
 */
export async function batchFetchIGDB(db, roms) {
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
                console.log(`[igdb] ✅ ${rom.clean_name} → ${result.igdbName}`);
            } else {
                failed++;
            }
        } catch (err) {
            failed++;
            console.error(`[igdb] ❌ ${rom.clean_name}: ${err.message}`);
        }
        batchProgress.processed++;
        batchProgress.fetched = fetched;
        batchProgress.failed = failed;
        await sleep(260); // ~4 req/sec
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    batchProgress = { ...batchProgress, running: false, elapsed, completedAt: new Date().toISOString() };
    console.log(`[igdb] Batch done: ✅ ${fetched} / ❌ ${failed} — ${elapsed}s`);
    return { fetched, failed, elapsed };
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function igdbRequest(endpoint, body, token, clientId) {
    const url = new URL(`${CONFIG.IGDB_API}${endpoint}`);
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Client-ID': clientId,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'text/plain',
            },
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`IGDB HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
                    return;
                }
                try { resolve(JSON.parse(data)); }
                catch { reject(new Error('IGDB invalid JSON')); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('IGDB timeout')); });
        req.write(body);
        req.end();
    });
}

function postRequest(url, body) {
    const u = new URL(url);
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch { reject(new Error('Auth invalid JSON')); }
            });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Auth timeout')); });
        req.write(body);
        req.end();
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
