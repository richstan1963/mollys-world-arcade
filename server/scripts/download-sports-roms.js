#!/usr/bin/env node
/**
 * Download pinball, pool, and bowling ROMs from archive.org No-Intro collections.
 * Saves to local roms/ directory, registers in DB, and updates collections.
 *
 * Usage: node server/scripts/download-sports-roms.js
 *        node server/scripts/download-sports-roms.js --dry-run
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ROMS_DIR = process.env.ARCADE_ROMS_DIR || path.join(ROOT, 'roms');
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Archive.org Sources ─────────────────────────────────────────────────────
// These are verified No-Intro collections with individual ROM .zip files

const DOWNLOADS = [
    // ═══════════════════════════════════════════════════════════════
    // PINBALL GAMES
    // ═══════════════════════════════════════════════════════════════

    // NES
    {
        system: 'nes', category: 'pinball',
        collection: 'ef_nintendo_entertainment_-system_-no-intro_2024-04-23',
        file: 'Pinball Quest (USA).zip',
    },
    {
        system: 'nes', category: 'pinball',
        collection: 'ef_nintendo_entertainment_-system_-no-intro_2024-04-23',
        file: 'Family Pinball (Japan).zip',
    },

    // Game Boy
    {
        system: 'gb', category: 'pinball',
        collection: 'nointro-nintendo-gameboy',
        file: "Kirby's Pinball Land (USA, Europe).zip",
    },
    {
        system: 'gb', category: 'pinball',
        collection: 'nointro-nintendo-gameboy',
        file: "Pinball - Revenge of the 'Gator (USA, Europe).zip",
    },
    {
        system: 'gb', category: 'pinball',
        collection: 'nointro-nintendo-gameboy',
        file: 'Pinball Dreams (USA, Europe).zip',
    },

    // Genesis
    {
        system: 'genesis', category: 'pinball',
        collection: 'NoIntroSegaMegaDriveGenesis2019July30',
        file: 'Crue Ball - Heavy Metal Pinball (USA, Europe).zip',
    },
    {
        system: 'genesis', category: 'pinball',
        collection: 'NoIntroSegaMegaDriveGenesis2019July30',
        file: 'Devil Crash MD (Japan).zip',
    },
    {
        system: 'genesis', category: 'pinball',
        collection: 'NoIntroSegaMegaDriveGenesis2019July30',
        file: 'Psycho Pinball (Europe) (En,Fr,De,Es,It).zip',
    },
    {
        system: 'genesis', category: 'pinball',
        collection: 'NoIntroSegaMegaDriveGenesis2019July30',
        file: 'Virtual Pinball (USA, Europe).zip',
    },

    // SNES (.rar — will extract with 7z)
    {
        system: 'snes', category: 'pinball',
        collection: 'no-intro-nintendo-super-nintendo-entertainment-system-RAR',
        file: 'No-Intro - Nintendo - Super Nintendo Entertainment System/Pinball Dreams (USA).rar',
        rar: true,
    },
    {
        system: 'snes', category: 'pinball',
        collection: 'no-intro-nintendo-super-nintendo-entertainment-system-RAR',
        file: 'No-Intro - Nintendo - Super Nintendo Entertainment System/Pinball Fantasies (USA).rar',
        rar: true,
    },
    {
        system: 'snes', category: 'pinball',
        collection: 'no-intro-nintendo-super-nintendo-entertainment-system-RAR',
        file: 'No-Intro - Nintendo - Super Nintendo Entertainment System/Super Pinball - Behind the Mask (Europe).rar',
        rar: true,
    },

    // ═══════════════════════════════════════════════════════════════
    // POOL / BILLIARDS GAMES
    // ═══════════════════════════════════════════════════════════════

    // NES
    {
        system: 'nes', category: 'pool',
        collection: 'ef_nintendo_entertainment_-system_-no-intro_2024-04-23',
        file: 'Lunar Pool (USA).zip',
    },
    {
        system: 'nes', category: 'pool',
        collection: 'ef_nintendo_entertainment_-system_-no-intro_2024-04-23',
        file: 'Championship Pool (USA).zip',
    },
    {
        system: 'nes', category: 'pool',
        collection: 'ef_nintendo_entertainment_-system_-no-intro_2024-04-23',
        file: 'Side Pocket (USA).zip',
    },
    {
        system: 'nes', category: 'pool',
        collection: 'ef_nintendo_entertainment_-system_-no-intro_2024-04-23',
        file: 'Break Time - The National Pool Tour (USA).zip',
    },

    // Game Boy
    {
        system: 'gb', category: 'pool',
        collection: 'nointro-nintendo-gameboy',
        file: 'Championship Pool (USA).zip',
    },

    // Genesis
    {
        system: 'genesis', category: 'pool',
        collection: 'NoIntroSegaMegaDriveGenesis2019July30',
        file: 'Championship Pool (USA).zip',
    },
    {
        system: 'genesis', category: 'pool',
        collection: 'NoIntroSegaMegaDriveGenesis2019July30',
        file: 'Minnesota Fats - Pool Legend (USA).zip',
    },
    {
        system: 'genesis', category: 'pool',
        collection: 'NoIntroSegaMegaDriveGenesis2019July30',
        file: 'Side Pocket (USA).zip',
    },

    // SNES
    {
        system: 'snes', category: 'pool',
        collection: 'no-intro-nintendo-super-nintendo-entertainment-system-RAR',
        file: 'No-Intro - Nintendo - Super Nintendo Entertainment System/Championship Pool (USA).rar',
        rar: true,
    },
    {
        system: 'snes', category: 'pool',
        collection: 'no-intro-nintendo-super-nintendo-entertainment-system-RAR',
        file: 'No-Intro - Nintendo - Super Nintendo Entertainment System/Side Pocket (USA).rar',
        rar: true,
    },

    // ═══════════════════════════════════════════════════════════════
    // BOWLING GAMES
    // ═══════════════════════════════════════════════════════════════

    // NES
    {
        system: 'nes', category: 'bowling',
        collection: 'ef_nintendo_entertainment_-system_-no-intro_2024-04-23',
        file: 'Championship Bowling (USA).zip',
    },
    {
        system: 'nes', category: 'bowling',
        collection: 'ef_nintendo_entertainment_-system_-no-intro_2024-04-23',
        file: 'Perfect Bowling (Japan).zip',
    },

    // Game Boy
    {
        system: 'gb', category: 'bowling',
        collection: 'nointro-nintendo-gameboy',
        file: '10-Pin Bowling (USA) (Proto).zip',
    },

    // Genesis
    {
        system: 'genesis', category: 'bowling',
        collection: 'NoIntroSegaMegaDriveGenesis2019July30',
        file: 'Championship Bowling (USA).zip',
    },
    {
        system: 'genesis', category: 'bowling',
        collection: 'NoIntroSegaMegaDriveGenesis2019July30',
        file: 'Boogie Woogie Bowling (Japan).zip',
    },

    // SNES
    {
        system: 'snes', category: 'bowling',
        collection: 'no-intro-nintendo-super-nintendo-entertainment-system-RAR',
        file: 'No-Intro - Nintendo - Super Nintendo Entertainment System/Super Bowling (USA).rar',
        rar: true,
    },
];

// ─── Download Helpers ────────────────────────────────────────────────────────

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const doGet = (targetUrl, redirects = 0) => {
            if (redirects > 5) return reject(new Error('Too many redirects'));
            const proto = targetUrl.startsWith('http://') ? http : https;
            proto.get(targetUrl, {
                headers: { 'User-Agent': 'MollysWorldArcade/1.0' },
            }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    res.resume();
                    return doGet(res.headers.location, redirects + 1);
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    return reject(new Error(`HTTP ${res.statusCode} for ${targetUrl}`));
                }
                const file = fs.createWriteStream(dest);
                res.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
                file.on('error', (e) => { try { fs.unlinkSync(dest); } catch {} reject(e); });
            }).on('error', reject);
        };
        doGet(url);
    });
}

function extractRar(rarPath, destDir) {
    // Use 7z to extract .rar → get the ROM file inside
    execSync(`7z e "${rarPath}" -o"${destDir}" -y`, { stdio: 'pipe' });
    // Remove the .rar after extraction
    try { fs.unlinkSync(rarPath); } catch {}
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n🎮 Molly's World Arcade — Sports ROM Downloader`);
    console.log(`   Target: ${ROMS_DIR}`);
    console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'DOWNLOAD'}\n`);

    const stats = { pinball: 0, pool: 0, bowling: 0, skipped: 0, failed: 0 };

    for (const dl of DOWNLOADS) {
        const destDir = path.join(ROMS_DIR, dl.system);
        const filename = path.basename(dl.file);
        const destPath = path.join(destDir, filename);

        // For .rar files, we'll extract to get the ROM
        const isRar = dl.rar;
        const finalName = isRar ? filename.replace('.rar', '.sfc') : filename;
        const finalPath = path.join(destDir, finalName);

        // Check if already exists (either the zip or extracted file)
        if (fs.existsSync(destPath) || (isRar && fs.existsSync(finalPath))) {
            console.log(`  ⏭️  SKIP ${dl.system}/${filename} (already exists)`);
            stats.skipped++;
            continue;
        }

        const url = `https://archive.org/download/${dl.collection}/${encodeURIComponent(dl.file)}`;

        if (DRY_RUN) {
            console.log(`  📋 WOULD download: ${dl.category} | ${dl.system}/${filename}`);
            console.log(`     URL: ${url}`);
            stats[dl.category]++;
            continue;
        }

        // Download
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        console.log(`  ⬇️  ${dl.category.toUpperCase()} | ${dl.system}/${filename} ...`);

        try {
            await downloadFile(url, destPath);
            const size = fs.statSync(destPath).size;

            if (isRar) {
                console.log(`     📦 Extracting .rar ...`);
                extractRar(destPath, destDir);
                // Find the extracted ROM file
                const extracted = fs.readdirSync(destDir)
                    .filter(f => f.endsWith('.sfc') || f.endsWith('.smc'))
                    .sort((a, b) => fs.statSync(path.join(destDir, b)).mtimeMs - fs.statSync(path.join(destDir, a)).mtimeMs)[0];
                if (extracted) {
                    console.log(`     ✅ Extracted: ${extracted} (${(fs.statSync(path.join(destDir, extracted)).size / 1024).toFixed(0)} KB)`);
                } else {
                    console.log(`     ⚠️  No SNES ROM found after extraction`);
                }
            } else {
                console.log(`     ✅ ${(size / 1024).toFixed(0)} KB`);
            }
            stats[dl.category]++;
        } catch (err) {
            console.error(`     ❌ Failed: ${err.message}`);
            stats.failed++;
            try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch {}
        }

        // Polite delay between downloads
        await new Promise(r => setTimeout(r, 1500));
    }

    console.log(`\n📊 Summary:`);
    console.log(`   🎯 Pinball: ${stats.pinball} downloaded`);
    console.log(`   🎱 Pool:    ${stats.pool} downloaded`);
    console.log(`   🎳 Bowling: ${stats.bowling} downloaded`);
    console.log(`   ⏭️  Skipped: ${stats.skipped}`);
    console.log(`   ❌ Failed:  ${stats.failed}`);
    console.log(`\n✅ Done! Run 'node server/scripts/scan-roms.js' or restart server to register new ROMs.\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
