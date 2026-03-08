#!/usr/bin/env node
/**
 * Downloads all 28 officially free MAME ROMs from mamedev.org
 * These are legally redistributable — released by the original copyright holders
 */
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCADE_DIR = path.join(__dirname, '..', 'roms', 'arcade');

const FREE_MAME_ROMS = [
    // Exidy Games (1977-1986)
    'circus', 'robotbwl', 'carpolo', 'sidetrac', 'ripcord',
    'fireone', 'crash', 'starfire', 'targ', 'spectar',
    'hardhat', 'victory', 'teetert', 'fax', 'topgunnr',
    // Video Klein Games (1990-2001)
    'falcnwld', 'witchcrd', 'witchgme', 'wstrike', 'witchjol',
    'wtchjack', 'wupndown', 'wldwitch',
    // Other
    'robby', 'supertnk', 'looping', 'gridlee', 'alienar',
];

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, { headers: { 'User-Agent': 'MollysWorldArcade/1.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
            file.on('error', err => { try { fs.unlinkSync(dest); } catch {} reject(err); });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

async function main() {
    console.log('🕹️  Downloading official free MAME ROMs from mamedev.org');
    console.log(`   ${FREE_MAME_ROMS.length} games available\n`);

    if (!fs.existsSync(ARCADE_DIR)) fs.mkdirSync(ARCADE_DIR, { recursive: true });

    let downloaded = 0, skipped = 0, errors = 0;

    for (const slug of FREE_MAME_ROMS) {
        const dest = path.join(ARCADE_DIR, `${slug}.zip`);
        if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
            console.log(`  ✓ ${slug}.zip (already have it)`);
            skipped++;
            continue;
        }

        const url = `https://www.mamedev.org/roms/${slug}/${slug}.zip`;
        try {
            process.stdout.write(`  ⬇️  ${slug}.zip...`);
            await downloadFile(url, dest);
            const size = (fs.statSync(dest).size / 1024).toFixed(0);
            console.log(` ✅ (${size}KB)`);
            downloaded++;
            await new Promise(r => setTimeout(r, 500));
        } catch (err) {
            console.log(` ❌ ${err.message}`);
            errors++;
        }
    }

    console.log(`\n📊 Downloaded: ${downloaded} | Already had: ${skipped} | Errors: ${errors}`);
    console.log(`   Total arcade ROMs: ${fs.readdirSync(ARCADE_DIR).length}`);

    // Trigger scan
    console.log('\n🔍 Triggering scan...');
    try {
        await new Promise((resolve, reject) => {
            const req = http.request({ hostname: 'localhost', port: 3000, path: '/api/scanner/scan', method: 'POST',
                headers: { 'Content-Type': 'application/json' } }, res => {
                let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(b));
            });
            req.on('error', reject); req.write('{}'); req.end();
        });
        console.log('   ✅ Scan triggered!');
    } catch { console.log('   ⚠️  Could not trigger scan'); }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
