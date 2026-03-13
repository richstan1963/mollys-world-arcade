#!/usr/bin/env node
/**
 * Download additional pool/billiards and bowling ROMs from archive.org No-Intro collections.
 * Round 2 — targets ~9 more pool and ~11 more bowling games.
 *
 * Usage: node server/scripts/download-more-sports-roms.js
 *        node server/scripts/download-more-sports-roms.js --dry-run
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ROMS_DIR = process.env.ARCADE_ROMS_DIR || path.join(ROOT, 'roms');
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Archive.org Sources ─────────────────────────────────────────────────────

const DOWNLOADS = [
    // ═══════════════════════════════════════════════════════════════
    // POOL / BILLIARDS GAMES (need ~9 more)
    // ═══════════════════════════════════════════════════════════════

    // SNES — Brunswick World Tournament of Champions (also a bowling game but has billiards mini-games)
    {
        system: 'snes', category: 'pool',
        collection: 'ef_nintendo_snes_no-intro_2024-04-20',
        file: 'Super Billiard - Championship Pool (Japan).zip',
    },
    // SNES — Minnesota Fats Pool Legend
    {
        system: 'snes', category: 'pool',
        collection: 'ef_nintendo_snes_no-intro_2024-04-20',
        file: 'Side Pocket (Japan) (En).zip',
    },

    // GBA — Archer Maclean's 3D Pool
    {
        system: 'gba', category: 'pool',
        collection: 'ef_gba_no-intro_2024-02-21',
        file: "Archer Maclean's 3D Pool (USA).zip",
    },
    // GBA — Killer 3D Pool
    {
        system: 'gba', category: 'pool',
        collection: 'ef_gba_no-intro_2024-02-21',
        file: 'Killer 3D Pool (USA).zip',
    },
    // GBA — Hardcore Pool
    {
        system: 'gba', category: 'pool',
        collection: 'ef_gba_no-intro_2024-02-21',
        file: 'Hardcore Pool (Europe) (En,De,Es,It).zip',
    },
    // GBA — 2048 Pool (homebrew/aftermarket pool game)
    {
        system: 'gba', category: 'pool',
        collection: 'ef_gba_no-intro_2024-02-21',
        file: '2048 Pool (World) (Aftermarket) (Unl).zip',
    },

    // Genesis — Side Pocket (Europe) — different region from existing USA
    {
        system: 'genesis', category: 'pool',
        collection: 'NoIntroSegaMegaDriveGenesis2019July30',
        file: 'Side Pocket (Europe).zip',
    },

    // SNES — Side Pocket (Europe) variant
    {
        system: 'snes', category: 'pool',
        collection: 'ef_nintendo_snes_no-intro_2024-04-20',
        file: 'Side Pocket (Europe).zip',
    },

    // NES — Lunar Pool is already there, but Championship Bowling Japan variant
    // Already have Break Time, Championship Pool, Lunar Pool, Side Pocket on NES

    // ═══════════════════════════════════════════════════════════════
    // BOWLING GAMES (need ~11 more)
    // ═══════════════════════════════════════════════════════════════

    // NES — Bowling (classic NES bowling game)
    {
        system: 'nes', category: 'bowling',
        collection: 'ef_nintendo_entertainment_-system_-no-intro_2024-04-23',
        file: 'Bowling (USA) (Proto).zip',
    },
    // NES — Dynamite Bowl
    {
        system: 'nes', category: 'bowling',
        collection: 'ef_nintendo_entertainment_-system_-no-intro_2024-04-23',
        file: 'Dynamite Bowl (Japan).zip',
    },
    // NES — Championship Bowling Japan
    {
        system: 'nes', category: 'bowling',
        collection: 'ef_nintendo_entertainment_-system_-no-intro_2024-04-23',
        file: 'Championship Bowling (Japan).zip',
    },

    // SNES — Brunswick World Tournament of Champions
    {
        system: 'snes', category: 'bowling',
        collection: 'ef_nintendo_snes_no-intro_2024-04-20',
        file: 'Brunswick World Tournament of Champions (USA).zip',
    },
    // SNES — Super Bowling (Japan)
    {
        system: 'snes', category: 'bowling',
        collection: 'ef_nintendo_snes_no-intro_2024-04-20',
        file: 'Super Bowling (Japan) (En).zip',
    },

    // GBA — Elf Bowling 1 & 2
    {
        system: 'gba', category: 'bowling',
        collection: 'ef_gba_no-intro_2024-02-21',
        file: 'Elf Bowling 1 & 2 (USA).zip',
    },
    // GBA — Ten Pin Alley 2
    {
        system: 'gba', category: 'bowling',
        collection: 'ef_gba_no-intro_2024-02-21',
        file: 'Ten Pin Alley 2 (USA).zip',
    },
    // GBA — 3 Games in One - Darts + Roll-a-Ball + Shuffle Bowl
    {
        system: 'gba', category: 'bowling',
        collection: 'ef_gba_no-intro_2024-02-21',
        file: '3 Games in One - Darts + Roll-a-Ball + Shuffle Bowl (USA).zip',
    },
];

// ─── Download Helpers ────────────────────────────────────────────────────────

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const doGet = (targetUrl, redirects = 0) => {
            if (redirects > 5) return reject(new Error('Too many redirects'));
            const proto = targetUrl.startsWith('http://') ? http : https;
            proto.get(targetUrl, {
                headers: { 'User-Agent': 'YourWorldArcade/1.0' },
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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n🎮 Your World Arcade — Additional Sports ROM Downloader (Round 2)`);
    console.log(`   Target: ${ROMS_DIR}`);
    console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'DOWNLOAD'}\n`);

    const stats = { pool: 0, bowling: 0, skipped: 0, failed: 0 };

    for (const dl of DOWNLOADS) {
        const destDir = path.join(ROMS_DIR, dl.system);
        const filename = path.basename(dl.file);
        const destPath = path.join(destDir, filename);

        // Check if already exists
        if (fs.existsSync(destPath)) {
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

            if (size < 100) {
                // Probably an error page, not a real ROM
                const content = fs.readFileSync(destPath, 'utf8').substring(0, 200);
                if (content.includes('<!DOCTYPE') || content.includes('<html')) {
                    throw new Error('Got HTML instead of ROM file — file not found in collection');
                }
            }

            console.log(`     ✅ ${(size / 1024).toFixed(0)} KB`);
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
    console.log(`   🎱 Pool:    ${stats.pool} downloaded`);
    console.log(`   🎳 Bowling: ${stats.bowling} downloaded`);
    console.log(`   ⏭️  Skipped: ${stats.skipped}`);
    console.log(`   ❌ Failed:  ${stats.failed}`);
    console.log(`\n✅ Done! Run 'node server/scripts/scan-roms.js' or restart server to register new ROMs.\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
