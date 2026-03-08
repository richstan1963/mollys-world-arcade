#!/usr/bin/env node
/**
 * find-orphan-roms.mjs — Find ROM files on disk that are NOT in the database.
 * These are candidates for re-adding (they were removed due to missing CDN artwork
 * but Libretro GitHub has more artwork available).
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const db = new Database('./mollys-arcade.db');

// Get all ROM filepaths currently in DB
const inDb = new Set(db.prepare('SELECT filepath FROM roms').all().map(r => r.filepath));

// Get scan paths
const scanPaths = db.prepare('SELECT path, system_id FROM scan_paths WHERE enabled = 1').all();

// Also get system extensions from the systems table
const systems = db.prepare('SELECT id, extensions FROM systems').all();
const sysExts = {};
for (const s of systems) {
    sysExts[s.id] = new Set((s.extensions || '').split(',').map(e => e.trim().toLowerCase()));
}

let orphans = 0;
const bySystem = {};

for (const sp of scanPaths) {
    if (!fs.existsSync(sp.path)) continue;
    const files = fs.readdirSync(sp.path);
    for (const f of files) {
        const fp = path.join(sp.path, f);
        try {
            if (!fs.statSync(fp).isFile()) continue;
        } catch { continue; }

        if (!inDb.has(fp)) {
            const sys = sp.system_id || 'unknown';
            if (!bySystem[sys]) bySystem[sys] = [];
            bySystem[sys].push({ filename: f, filepath: fp });
            orphans++;
        }
    }
}

console.log('Orphan ROM files (on disk but not in DB):\n');
for (const [sys, files] of Object.entries(bySystem).sort()) {
    console.log(`  ${sys}: ${files.length} files`);
    files.slice(0, 5).forEach(f => console.log(`    - ${f.filename}`));
    if (files.length > 5) console.log(`    ... +${files.length - 5} more`);
}
console.log(`\nTotal orphans: ${orphans}`);

// Current DB counts for reference
const dbCounts = db.prepare('SELECT system_id, COUNT(*) as cnt FROM roms GROUP BY system_id ORDER BY cnt DESC').all();
console.log('\nCurrent DB counts:');
for (const r of dbCounts) {
    const flag = r.cnt < 100 ? ' ⚠️' : '';
    console.log(`  ${r.system_id}: ${r.cnt}${flag}`);
}

db.close();
