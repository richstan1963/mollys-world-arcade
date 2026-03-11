import { getDB } from '../db.js';
import { batchMatchAll, getMatchProgress } from './nointro-matcher.js';
import { batchFetchScreenScraper, getSSProgress } from './screenscraper.js';
import { batchFetchIGDB, getIGDBProgress } from './igdb.js';
import { batchFetchRA, getRAProgress } from './retroachievements.js';
import { batchFetchManuals, getManualsProgress } from './archiveorg-manuals.js';
import { batchFetchRAWG, getRAWGProgress } from './rawg.js';
import { batchFetchMoby, getMobyProgress } from './mobygames.js';
import { batchFetchGiantBomb, getGBProgress } from './giantbomb.js';
import { batchFetchThumbnails, getThumbsProgress } from './libretro-thumbnails.js';
import { importHistoryDat, getHistoryProgress } from './history-dat.js';
import { batchFetchSnaps, getSnapsProgress } from './progetto-snaps.js';
import { batchFetchArchiveScreenshots, getArchiveSSProgress } from './archiveorg-screenshots.js';

let enrichProgress = null;
export function getEnrichProgress() { return enrichProgress; }
export { isConfigured };

/** Check if a source has the required env credentials */
function isConfigured(key) {
    switch (key) {
        case 'screenscraper': return !!(process.env.SCREENSCRAPER_DEV_ID && process.env.SCREENSCRAPER_DEV_PASSWORD);
        case 'igdb':          return !!(process.env.IGDB_CLIENT_ID && process.env.IGDB_CLIENT_SECRET);
        case 'ra':            return !!(process.env.RA_API_KEY && process.env.RA_USERNAME);
        case 'rawg':          return !!process.env.RAWG_API_KEY;
        case 'mobygames':     return !!process.env.MOBYGAMES_API_KEY;
        case 'giantbomb':     return !!process.env.GIANTBOMB_API_KEY;
        case 'manuals':       return true;  // No credentials needed
        case 'nointro':       return true;  // Local DAT matching
        case 'libretro-thumbs': return true; // No credentials needed
        case 'history-dat':   return true;  // Local file parsing
        case 'progetto-snaps': return true; // No credentials needed
        case 'archiveorg-screenshots': return true; // No credentials needed
        default:              return true;
    }
}

const SOURCE_MAP = {
    nointro:       { label: 'No-Intro DAT',        run: runNoIntro,       progress: getMatchProgress },
    screenscraper: { label: 'ScreenScraper',        run: runScreenScraper, progress: getSSProgress },
    igdb:          { label: 'IGDB',                 run: runIGDB,          progress: getIGDBProgress },
    ra:            { label: 'RetroAchievements',    run: runRA,            progress: getRAProgress },
    manuals:       { label: 'Archive.org Manuals',  run: runManuals,       progress: getManualsProgress },
    rawg:          { label: 'RAWG.io',              run: runRAWG,          progress: getRAWGProgress },
    mobygames:     { label: 'MobyGames',            run: runMoby,          progress: getMobyProgress },
    giantbomb:     { label: 'Giant Bomb',           run: runGiantBomb,     progress: getGBProgress },
    'libretro-thumbs':        { label: 'Libretro Thumbnails',    run: runLibretroThumbs,    progress: getThumbsProgress },
    'history-dat':            { label: 'History.dat',             run: runHistoryDat,        progress: getHistoryProgress },
    'progetto-snaps':         { label: 'Progetto-SNAPS',         run: runProgettoSnaps,     progress: getSnapsProgress },
    'archiveorg-screenshots': { label: 'Archive.org Screenshots', run: runArchiveScreenshots, progress: getArchiveSSProgress },
};

async function runNoIntro(db) {
    return batchMatchAll(db);
}

async function runScreenScraper(db) {
    const roms = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.md5, r.system_id, m.title, m.region
        FROM roms r LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE r.md5 IS NOT NULL AND (m.screenscraper_id IS NULL)
    `).all();
    if (!roms.length) return { fetched: 0, failed: 0, skipped: 0 };
    return batchFetchScreenScraper(db, roms);
}

async function runIGDB(db) {
    const roms = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.system_id, m.title, m.region
        FROM roms r LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE m.igdb_id IS NULL AND (m.title IS NOT NULL OR r.clean_name IS NOT NULL)
    `).all();
    if (!roms.length) return { fetched: 0, failed: 0 };
    return batchFetchIGDB(db, roms);
}

async function runRA(db) {
    const roms = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.md5, r.system_id, m.title
        FROM roms r LEFT JOIN metadata m ON m.rom_id = r.id
        LEFT JOIN retro_achievements ra ON ra.rom_id = r.id
        WHERE r.md5 IS NOT NULL AND ra.rom_id IS NULL
    `).all();
    if (!roms.length) return { fetched: 0, failed: 0 };
    return batchFetchRA(db, roms);
}

async function runManuals(db) {
    const roms = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.system_id, m.title, m.manual_url
        FROM roms r LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE m.manual_url IS NULL AND (m.title IS NOT NULL OR r.clean_name IS NOT NULL)
    `).all();
    if (!roms.length) return { fetched: 0, failed: 0 };
    return batchFetchManuals(db, roms);
}

async function runRAWG(db) {
    const roms = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.system_id, m.title, m.region
        FROM roms r LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE m.rawg_id IS NULL AND (m.title IS NOT NULL OR r.clean_name IS NOT NULL)
    `).all();
    if (!roms.length) return { fetched: 0, failed: 0 };
    return batchFetchRAWG(db, roms);
}

async function runMoby(db) {
    const roms = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.system_id, m.title, m.region
        FROM roms r LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE m.moby_id IS NULL AND (m.title IS NOT NULL OR r.clean_name IS NOT NULL)
    `).all();
    if (!roms.length) return { fetched: 0, failed: 0 };
    return batchFetchMoby(db, roms);
}

async function runGiantBomb(db) {
    const roms = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.system_id, m.title, m.region
        FROM roms r LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE m.giantbomb_id IS NULL AND (m.title IS NOT NULL OR r.clean_name IS NOT NULL)
    `).all();
    if (!roms.length) return { fetched: 0, failed: 0 };
    return batchFetchGiantBomb(db, roms);
}

async function runLibretroThumbs(db) {
    const roms = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.system_id, m.title, m.boxart_path
        FROM roms r LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE m.boxart_path IS NULL AND (m.title IS NOT NULL OR r.clean_name IS NOT NULL)
    `).all();
    if (!roms.length) return { fetched: 0, failed: 0 };
    return batchFetchThumbnails(db, roms);
}

async function runHistoryDat(db) {
    return importHistoryDat(db);
}

async function runProgettoSnaps(db) {
    const roms = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.system_id, m.cabinet_path
        FROM roms r LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE r.system_id IN ('arcade', 'fbneo', 'neogeo') AND m.cabinet_path IS NULL
    `).all();
    if (!roms.length) return { fetched: 0, failed: 0 };
    return batchFetchSnaps(db, roms);
}

async function runArchiveScreenshots(db) {
    const roms = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.system_id, m.snap_path
        FROM roms r LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE r.system_id IN ('arcade', 'fbneo', 'neogeo') AND m.snap_path IS NULL
    `).all();
    if (!roms.length) return { fetched: 0, failed: 0 };
    return batchFetchArchiveScreenshots(db, roms);
}

/**
 * Run selected enrichment sources in sequence.
 */
export async function enrichAll(db, sources = ['nointro', 'screenscraper', 'igdb', 'ra', 'manuals', 'rawg', 'mobygames', 'giantbomb', 'libretro-thumbs', 'history-dat', 'progetto-snaps', 'archiveorg-screenshots']) {
    const results = {};
    enrichProgress = {
        running: true,
        sources: sources.map(s => SOURCE_MAP[s]?.label || s),
        currentSource: null,
        currentIndex: 0,
        totalSources: sources.length,
        results: {},
        startedAt: new Date().toISOString(),
    };

    for (let i = 0; i < sources.length; i++) {
        const key = sources[i];
        const src = SOURCE_MAP[key];
        if (!src) { results[key] = { error: 'Unknown source' }; continue; }

        enrichProgress.currentSource = src.label;
        enrichProgress.currentIndex = i + 1;

        if (!isConfigured(key)) {
            console.log(`[enrich] Skipping ${src.label} (${i + 1}/${sources.length}) — not configured`);
            results[key] = { skipped: true, reason: 'Credentials not configured' };
            enrichProgress.results[key] = results[key];
            continue;
        }

        console.log(`[enrich] Starting ${src.label} (${i + 1}/${sources.length})`);

        try {
            results[key] = await src.run(db);
        } catch (err) {
            results[key] = { error: err.message };
            console.error(`[enrich] ${src.label} failed: ${err.message}`);
        }
        enrichProgress.results[key] = results[key];
    }

    enrichProgress = {
        ...enrichProgress,
        running: false,
        currentSource: null,
        completedAt: new Date().toISOString(),
    };

    console.log('[enrich] Pipeline complete:', results);
    return results;
}
