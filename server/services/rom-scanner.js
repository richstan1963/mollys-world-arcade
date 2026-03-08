import fs from 'fs';
import path from 'path';
import { EXT_TO_SYSTEM, FOLDER_HINTS } from '../config.js';
import { parseFilename } from './filename-parser.js';
import { computeMD5 } from './hash-service.js';

export async function scanDirectories(db, scanPaths, onProgress) {
    let total = 0;
    let processed = 0;
    let newRoms = 0;
    let updated = 0;

    // First pass: count files
    const allFiles = [];
    for (const sp of scanPaths) {
        const dirPath = sp.path || sp;
        const forcedSystem = sp.system_id || null;
        if (!fs.existsSync(dirPath)) continue;

        const files = await collectFiles(dirPath, forcedSystem);
        allFiles.push(...files);
    }

    total = allFiles.length;
    onProgress({ total, processed: 0, newRoms: 0, current: `Found ${total} ROM files` });

    // Second pass: process each file
    const insertRom = db.prepare(`
        INSERT OR IGNORE INTO roms (filepath, filename, system_id, size_bytes, md5, clean_name, source)
        VALUES (?, ?, ?, ?, ?, ?, 'local')
    `);
    const updateScan = db.prepare(`
        UPDATE roms SET last_scanned = datetime('now'), size_bytes = ? WHERE filepath = ?
    `);
    const checkExists = db.prepare('SELECT id, size_bytes, system_id FROM roms WHERE filepath = ?');
    const fixSystem = db.prepare('UPDATE roms SET system_id = ? WHERE filepath = ?');
    const insertMeta = db.prepare(`
        INSERT OR IGNORE INTO metadata (rom_id, region, year, metadata_source)
        VALUES (?, ?, ?, 'filename')
    `);

    for (const file of allFiles) {
        processed++;
        if (processed % 10 === 0 || processed === total) {
            onProgress({ total, processed, newRoms, current: file.filename });
        }

        const existing = checkExists.get(file.filepath);
        if (existing) {
            // Already scanned — update timestamp and fix system_id if misclassified
            updateScan.run(file.size, file.filepath);
            if (existing.system_id !== file.system_id) {
                fixSystem.run(file.system_id, file.filepath);
            }
            updated++;
            continue;
        }

        // New ROM
        try {
            const md5 = await computeMD5(file.filepath);
            const parsed = parseFilename(file.filename);

            const info = insertRom.run(
                file.filepath,
                file.filename,
                file.system_id,
                file.size,
                md5,
                parsed.clean_name
            );

            if (info.changes > 0) {
                newRoms++;
                insertMeta.run(info.lastInsertRowid, parsed.region, parsed.year, 'filename');
            }
        } catch (err) {
            console.error(`Error processing ${file.filepath}:`, err.message);
        }
    }

    // Update scan path stats
    for (const sp of scanPaths) {
        const dirPath = sp.path || sp;
        const id = sp.id;
        if (id) {
            const count = db.prepare('SELECT COUNT(*) as c FROM roms WHERE filepath LIKE ?').get(dirPath + '%');
            db.prepare('UPDATE scan_paths SET last_scanned = datetime(\'now\'), rom_count = ? WHERE id = ?')
                .run(count.c, id);
        }
    }

    return { total, processed, newRoms, updated };
}

async function collectFiles(dirPath, forcedSystem, depth = 0) {
    if (depth > 5) return []; // Safety limit

    const files = [];
    let entries;
    try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
        return files;
    }

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            // Use folder name as system hint
            const folderSystem = forcedSystem || detectSystemFromFolder(entry.name);
            const subFiles = await collectFiles(fullPath, folderSystem, depth + 1);
            files.push(...subFiles);
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            const system = forcedSystem || detectSystemFromFolder(path.basename(dirPath)) || EXT_TO_SYSTEM.get(ext);

            if (system) {
                const stat = fs.statSync(fullPath);
                files.push({
                    filepath: fullPath,
                    filename: entry.name,
                    system_id: system,
                    size: stat.size,
                });
            }
        }
    }

    return files;
}

function detectSystemFromFolder(folderName) {
    const lower = folderName.toLowerCase().trim();
    return FOLDER_HINTS.get(lower) || null;
}
