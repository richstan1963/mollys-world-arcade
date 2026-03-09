import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';

let matchProgress = null;

export function getMatchProgress() { return matchProgress; }

/**
 * Parse a No-Intro DAT XML file and build MD5 → {name, region} map.
 * DAT format: <game name="Title (Region)"><rom ... md5="HASH"/></game>
 */
export function loadDatFile(datPath) {
    if (!fs.existsSync(datPath)) return new Map();

    const xml = fs.readFileSync(datPath, 'utf-8');
    const map = new Map();

    // Match each <game> block
    const gameRe = /<game\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/game>/gi;
    const romRe = /md5="([a-fA-F0-9]{32})"/i;
    const regionRe = /\(([^)]+)\)\s*$/;

    let match;
    while ((match = gameRe.exec(xml)) !== null) {
        const gameName = match[1];
        const body = match[2];
        const romMatch = romRe.exec(body);
        if (!romMatch) continue;

        const md5 = romMatch[1].toLowerCase();
        const regionMatch = regionRe.exec(gameName);
        const region = regionMatch ? regionMatch[1] : '';
        // Strip region tag from title for clean display
        const cleanTitle = gameName.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

        map.set(md5, { name: cleanTitle, fullName: gameName, region });
    }

    return map;
}

/**
 * Find the DAT file for a given system.
 * Looks for: {systemId}.dat, or any .dat file containing the system name.
 */
function findDatForSystem(systemId) {
    if (!fs.existsSync(CONFIG.DATS_DIR)) return null;

    // Direct match: nes.dat, snes.dat, etc.
    const direct = path.join(CONFIG.DATS_DIR, `${systemId}.dat`);
    if (fs.existsSync(direct)) return direct;

    // Scan for any .dat file with system id in the name
    const files = fs.readdirSync(CONFIG.DATS_DIR).filter(f => f.endsWith('.dat'));
    const found = files.find(f => f.toLowerCase().includes(systemId.toLowerCase()));
    return found ? path.join(CONFIG.DATS_DIR, found) : null;
}

/**
 * Match a single ROM against a DAT map. Updates metadata if found.
 */
function matchRom(db, rom, datMap) {
    if (!rom.md5) return false;
    const entry = datMap.get(rom.md5.toLowerCase());
    if (!entry) return false;

    db.prepare(`
        INSERT INTO metadata (rom_id, title, region, metadata_source, fetched_at)
        VALUES (?, ?, ?, 'nointro', datetime('now'))
        ON CONFLICT(rom_id) DO UPDATE SET
            title = COALESCE(excluded.title, title),
            region = COALESCE(excluded.region, region),
            metadata_source = CASE WHEN metadata_source IS NULL THEN 'nointro' ELSE metadata_source END,
            fetched_at = datetime('now')
    `).run(rom.id, entry.name, entry.region || null);

    return true;
}

/**
 * Batch match all ROMs for a single system.
 */
export function batchMatchSystem(db, systemId) {
    const datPath = findDatForSystem(systemId);
    if (!datPath) return { matched: 0, total: 0, error: `No DAT file for ${systemId}` };

    const datMap = loadDatFile(datPath);
    if (datMap.size === 0) return { matched: 0, total: 0, error: `Empty DAT for ${systemId}` };

    const roms = db.prepare('SELECT id, md5, clean_name FROM roms WHERE system_id = ? AND md5 IS NOT NULL').all(systemId);
    let matched = 0;

    for (const rom of roms) {
        if (matchRom(db, rom, datMap)) matched++;
    }

    console.log(`[nointro] ${systemId}: ${matched}/${roms.length} matched (DAT has ${datMap.size} entries)`);
    return { matched, total: roms.length, datEntries: datMap.size };
}

/**
 * Batch match all systems that have DAT files.
 */
export async function batchMatchAll(db) {
    if (!fs.existsSync(CONFIG.DATS_DIR)) {
        return { ok: false, error: `DATs directory not found: ${CONFIG.DATS_DIR}` };
    }

    const systems = db.prepare('SELECT DISTINCT system_id FROM roms WHERE md5 IS NOT NULL').all();
    const results = {};
    let totalMatched = 0;
    let totalRoms = 0;

    matchProgress = {
        running: true,
        total: systems.length,
        processed: 0,
        matched: 0,
        currentSystem: null,
        startedAt: new Date().toISOString(),
    };

    for (const { system_id } of systems) {
        matchProgress.currentSystem = system_id;
        const result = batchMatchSystem(db, system_id);
        results[system_id] = result;
        totalMatched += result.matched;
        totalRoms += result.total;
        matchProgress.processed++;
        matchProgress.matched = totalMatched;
    }

    matchProgress = {
        ...matchProgress,
        running: false,
        completedAt: new Date().toISOString(),
    };

    console.log(`[nointro] All done: ${totalMatched}/${totalRoms} matched across ${systems.length} systems`);
    return { ok: true, totalMatched, totalRoms, results };
}
