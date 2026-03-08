#!/usr/bin/env node
import { initDB } from '../server/db.js';
import { getMamedevList, downloadMamedevRom } from '../server/services/mamedev-scraper.js';

console.log('');
console.log('  👾 MAMEdev Free ROM Fetcher');
console.log('  ══════════════════════════════');
console.log('');

const db = initDB();

try {
    const roms = await getMamedevList(db);
    const missing = roms.filter(r => !r.downloaded);

    if (missing.length === 0) {
        console.log('  ✓ All free ROMs already downloaded!');
        console.log(`  ${roms.length} ROMs in catalog.`);
    } else {
        console.log(`  Downloading ${missing.length} of ${roms.length} free ROMs...`);
        console.log('');

        let success = 0;
        let failed = 0;

        for (const rom of missing) {
            process.stdout.write(`  ⬇️  ${rom.title} (${rom.slug})... `);
            try {
                await downloadMamedevRom(db, rom.slug);
                console.log('✓');
                success++;
            } catch (err) {
                console.log(`✗ ${err.message}`);
                failed++;
            }
        }

        console.log('');
        console.log(`  Done! ${success} downloaded, ${failed} failed.`);
    }
} catch (err) {
    console.error('  Error:', err.message);
    process.exit(1);
}

console.log('');
db.close();
