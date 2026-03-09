import { getDB } from '../db.js';
import { batchMatchAll, getMatchProgress } from './nointro-matcher.js';
import { batchFetchScreenScraper, getSSProgress } from './screenscraper.js';
import { batchFetchIGDB, getIGDBProgress } from './igdb.js';
import { batchFetchRA, getRAProgress } from './retroachievements.js';
import { batchFetchManuals, getManualsProgress } from './archiveorg-manuals.js';

let enrichProgress = null;
export function getEnrichProgress() { return enrichProgress; }

const SOURCE_MAP = {
    nointro:       { label: 'No-Intro DAT',        run: runNoIntro,       progress: getMatchProgress },
    screenscraper: { label: 'ScreenScraper',        run: runScreenScraper, progress: getSSProgress },
    igdb:          { label: 'IGDB',                 run: runIGDB,          progress: getIGDBProgress },
    ra:            { label: 'RetroAchievements',    run: runRA,            progress: getRAProgress },
    manuals:       { label: 'Archive.org Manuals',  run: runManuals,       progress: getManualsProgress },
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

/**
 * Run selected enrichment sources in sequence.
 */
export async function enrichAll(db, sources = ['nointro', 'screenscraper', 'igdb', 'ra', 'manuals']) {
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
