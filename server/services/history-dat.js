/* ════════════════════════════════════════════════════════════════
   MAME History.dat Parser — Game trivia, developer notes, history
   Source: https://www.arcade-history.com/
   No API key needed — parses local history.dat file
   ════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';

let batchProgress = null;
export function getHistoryProgress() { return batchProgress; }

/**
 * Parse history.dat format into a map of ROM name → history text.
 * Format:
 *   $info=romname1,romname2,
 *   $bio
 *   Text content here...
 *   $end
 */
function parseHistoryDat(content) {
    const entries = new Map();
    const blocks = content.split(/\n\$info=/);

    for (const block of blocks) {
        if (!block.trim()) continue;

        const bioStart = block.indexOf('$bio');
        if (bioStart === -1) continue;

        const namesPart = block.slice(0, bioStart).trim();
        const names = namesPart.split(',').map(n => n.trim().toLowerCase()).filter(Boolean);

        let text = block.slice(bioStart + 4);
        const endIdx = text.indexOf('$end');
        if (endIdx !== -1) text = text.slice(0, endIdx);
        text = text.trim();

        if (!text || text.length < 20) continue;

        for (const name of names) {
            entries.set(name, text);
        }
    }

    return entries;
}

/**
 * Import history.dat entries into the database.
 * Matches MAME ROM filenames (without extension) to history entries.
 */
export async function importHistoryDat(db) {
    const datPath = path.join(CONFIG.DATA_DIR, 'history.dat');
    if (!fs.existsSync(datPath)) {
        return { imported: 0, error: `history.dat not found at ${datPath}` };
    }

    const content = fs.readFileSync(datPath, 'utf-8');
    const entries = parseHistoryDat(content);
    console.log(`[history-dat] Parsed ${entries.size} entries from history.dat`);

    batchProgress = {
        total: entries.size, processed: 0, imported: 0,
        running: true, startedAt: new Date().toISOString(),
    };

    // Get all arcade/FBNeo ROMs
    const arcadeRoms = db.prepare(`
        SELECT r.id, r.filename, r.system_id
        FROM roms r
        LEFT JOIN game_history gh ON gh.rom_id = r.id
        WHERE r.system_id IN ('arcade', 'fbneo', 'neogeo')
          AND gh.rom_id IS NULL
    `).all();

    const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO game_history (rom_id, history_text, source)
        VALUES (?, ?, 'history.dat')
    `);

    let imported = 0;
    const tx = db.transaction(() => {
        for (const rom of arcadeRoms) {
            const romName = rom.filename.replace(/\.[^.]+$/, '').toLowerCase();
            const historyText = entries.get(romName);
            if (historyText) {
                insertStmt.run(rom.id, historyText);
                imported++;
            }
            batchProgress.processed++;
            batchProgress.imported = imported;
        }
    });
    tx();

    batchProgress = { ...batchProgress, running: false, completedAt: new Date().toISOString() };
    console.log(`[history-dat] Imported ${imported} history entries for ${arcadeRoms.length} arcade ROMs`);
    return { imported, totalRoms: arcadeRoms.length, totalEntries: entries.size };
}
