import https from 'https';
import { CONFIG } from '../config.js';

let batchProgress = null;
export function getManualsProgress() { return batchProgress; }

/**
 * Search Archive.org for a game manual.
 */
export async function searchManual(gameName, systemName) {
    // Clean the name for search
    const cleanName = gameName
        .replace(/\s*\([^)]*\)/g, '')    // Remove (USA), (Rev 1)
        .replace(/\s*\[[^\]]*\]/g, '')    // Remove [!], [b]
        .replace(/[^\w\s]/g, ' ')         // Remove special chars
        .replace(/\s+/g, ' ')
        .trim();

    const query = systemName
        ? `title:(${cleanName}) AND collection:(gamemanuals) AND mediatype:texts AND subject:(${systemName})`
        : `title:(${cleanName}) AND collection:(gamemanuals) AND mediatype:texts`;

    const qs = new URLSearchParams({
        q: query,
        output: 'json',
        rows: '1',
        fl: 'identifier,title',
    });

    const url = `${CONFIG.ARCHIVE_ORG_API}?${qs}`;

    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'YourWorldArcade/1.0' } }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`Archive.org HTTP ${res.statusCode}`));
                return;
            }
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const doc = data?.response?.docs?.[0];
                    if (doc?.identifier) {
                        resolve({
                            identifier: doc.identifier,
                            title: doc.title || '',
                            url: `https://archive.org/details/${doc.identifier}`,
                        });
                    } else {
                        resolve(null);
                    }
                } catch { reject(new Error('Archive.org invalid JSON')); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Archive.org timeout')); });
    });
}

/**
 * Fetch manual link for a ROM and store it.
 */
export async function fetchManualLink(db, rom) {
    const displayName = rom.title || rom.clean_name;
    if (!displayName) return { ok: false, error: 'No game name' };

    // Get system name for better matching
    const system = db.prepare('SELECT name FROM systems WHERE id = ?').get(rom.system_id);
    const systemName = system?.name || '';

    const result = await searchManual(displayName, systemName);
    if (!result) return { ok: false, error: 'No manual found' };

    db.prepare(`
        INSERT INTO metadata (rom_id, manual_url, fetched_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(rom_id) DO UPDATE SET
            manual_url = excluded.manual_url,
            fetched_at = datetime('now')
    `).run(rom.id, result.url);

    return { ok: true, url: result.url, title: result.title };
}

/**
 * Batch fetch manuals.
 */
export async function batchFetchManuals(db, roms) {
    let fetched = 0, failed = 0;
    const startTime = Date.now();

    batchProgress = {
        total: roms.length, processed: 0, fetched: 0, failed: 0,
        running: true, startedAt: new Date().toISOString(), currentRom: null,
    };

    for (const rom of roms) {
        batchProgress.currentRom = rom.title || rom.clean_name || rom.filename;
        try {
            const result = await fetchManualLink(db, rom);
            if (result.ok) {
                fetched++;
                console.log(`[manuals] ✅ ${rom.clean_name} → ${result.url}`);
            } else {
                failed++;
            }
        } catch (err) {
            failed++;
            console.error(`[manuals] ❌ ${rom.clean_name}: ${err.message}`);
        }
        batchProgress.processed++;
        batchProgress.fetched = fetched;
        batchProgress.failed = failed;
        await sleep(300); // Be nice to Archive.org
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    batchProgress = { ...batchProgress, running: false, elapsed, completedAt: new Date().toISOString() };
    console.log(`[manuals] Batch done: ✅ ${fetched} / ❌ ${failed} — ${elapsed}s`);
    return { fetched, failed, elapsed };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
