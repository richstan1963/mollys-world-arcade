#!/usr/bin/env node
/**
 * ARTWORK RESCUE — Last-chance CDN art fetch
 * Targets the ~226 games still using placeholder art (files < 10KB)
 * Tries more aggressive name matching and additional CDN paths
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const DB_PATH = path.join(ROOT, 'mollys-arcade.db');
const ARTWORK_DIR = path.join(ROOT, 'artwork');
const CDN = 'https://thumbnails.libretro.com';

// System → Libretro directory mapping
const SYSTEM_DIRS = {
    'nes': 'Nintendo - Nintendo Entertainment System',
    'snes': 'Nintendo - Super Nintendo Entertainment System',
    'n64': 'Nintendo - Nintendo 64',
    'gb': 'Nintendo - Game Boy',
    'gbc': 'Nintendo - Game Boy Color',
    'gba': 'Nintendo - Game Boy Advance',
    'nds': 'Nintendo - Nintendo DS',
    'genesis': 'Sega - Mega Drive - Genesis',
    'sms': 'Sega - Master System - Mark III',
    'gamegear': 'Sega - Game Gear',
    'saturn': 'Sega - Saturn',
    '32x': 'Sega - 32X',
    'psx': 'Sony - PlayStation',
    'psp': 'Sony - PlayStation Portable',
    'atari2600': 'Atari - 2600',
    'atari7800': 'Atari - 7800',
    'jaguar': 'Atari - Jaguar',
    'lynx': 'Atari - Lynx',
    'tg16': 'NEC - PC Engine - TurboGrafx 16',
    'neogeo': 'SNK - Neo Geo',
    'ngp': 'SNK - Neo Geo Pocket',
    'arcade': 'MAME',
    'fbneo': 'FBNeo - Arcade Games',
    'wonderswan': 'Bandai - WonderSwan',
    'vb': 'Nintendo - Virtual Boy',
    '3do': 'The 3DO Company - 3DO',
    'coleco': 'Coleco - ColecoVision',
    'dos': 'DOS',
};

// CDN directory cache
const cdnCache = {};

async function scrapeCDNDirectory(libretroDir, type = 'Named_Boxarts') {
    const cacheKey = `${libretroDir}/${type}`;
    if (cdnCache[cacheKey]) return cdnCache[cacheKey];

    const url = `${CDN}/${encodeURIComponent(libretroDir)}/${type}/`;
    try {
        const html = await httpGet(url);
        const regex = /href="([^"]+\.png)"/gi;
        const files = [];
        let match;
        while ((match = regex.exec(html)) !== null) {
            files.push(decodeURIComponent(match[1]).replace(/\.png$/i, ''));
        }
        cdnCache[cacheKey] = files;
        return files;
    } catch {
        cdnCache[cacheKey] = [];
        return [];
    }
}

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http;
        const req = proto.get(url, { headers: { 'User-Agent': 'MollysWorldArcade/2.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                httpGet(res.headers.location).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'MollysWorldArcade/2.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                downloadFile(res.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
            file.on('error', (err) => { try { fs.unlinkSync(dest); } catch {} reject(err); });
        });
        req.on('error', reject);
        req.setTimeout(12000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Aggressive fuzzy matching — tries multiple strategies
 */
function findMatch(gameName, cdnFiles) {
    if (!cdnFiles.length) return null;
    const searchLower = gameName.toLowerCase().trim()
        .replace(/[_]/g, ' ').replace(/\s+/g, ' ');

    // Exact
    for (const f of cdnFiles) {
        if (f.toLowerCase().replace(/\s*\([^)]*\)\s*/g, '').trim() === searchLower) return f;
    }

    // Starts with
    for (const f of cdnFiles) {
        const fBase = f.toLowerCase().replace(/\s*\([^)]*\)\s*/g, ' ').trim();
        if (fBase.startsWith(searchLower + ' ') || fBase.startsWith(searchLower + ',') || fBase === searchLower) return f;
    }

    // Contains
    if (searchLower.length >= 6) {
        for (const f of cdnFiles) {
            if (f.toLowerCase().includes(searchLower)) return f;
        }
    }

    // Word overlap (3+ word games)
    const searchWords = searchLower.split(/[\s\-_:&]+/).filter(w => w.length > 2);
    if (searchWords.length >= 2) {
        let bestMatch = null;
        let bestScore = 0;
        for (const f of cdnFiles) {
            const fWords = f.toLowerCase().replace(/\s*\([^)]*\)\s*/g, ' ').split(/[\s\-_:,.!'+&]+/).filter(w => w.length > 2);
            let matched = 0;
            for (const sw of searchWords) {
                if (fWords.some(fw => fw === sw || fw.startsWith(sw) || sw.startsWith(fw))) matched++;
            }
            const score = matched / searchWords.length;
            if (score > bestScore && score >= 0.6 && matched >= 2) {
                bestScore = score;
                bestMatch = f;
            }
        }
        if (bestMatch) return bestMatch;
    }

    return null;
}

async function main() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  🚨 ARTWORK RESCUE — Finding Real Box Art        ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Find games with placeholder art (files < 10KB)
    const allRoms = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.system_id, m.artwork_path, m.title
        FROM roms r
        LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE m.artwork_path IS NOT NULL AND m.artwork_path != ''
    `).all();

    const needsRescue = [];
    for (const rom of allRoms) {
        const artFile = path.join(ARTWORK_DIR, rom.artwork_path);
        if (!fs.existsSync(artFile)) { needsRescue.push(rom); continue; }
        const size = fs.statSync(artFile).size;
        if (size < 10000) needsRescue.push(rom); // Placeholder-sized
    }

    console.log(`🎯 ${needsRescue.length} games with placeholder art (< 10KB)\n`);

    // Group by system
    const bySystem = {};
    for (const rom of needsRescue) {
        if (!bySystem[rom.system_id]) bySystem[rom.system_id] = [];
        bySystem[rom.system_id].push(rom);
    }

    // Scrape CDN directories for all needed systems
    console.log('📡 Scraping CDN directories...\n');
    const cdnLists = {};
    for (const sysId of Object.keys(bySystem)) {
        const dir = SYSTEM_DIRS[sysId];
        if (!dir) continue;

        const boxarts = await scrapeCDNDirectory(dir, 'Named_Boxarts');
        const snaps = await scrapeCDNDirectory(dir, 'Named_Snaps');
        const titles = await scrapeCDNDirectory(dir, 'Named_Titles');
        cdnLists[sysId] = { boxarts, snaps, titles, dir };
        console.log(`  ${sysId}: ${boxarts.length} boxarts, ${snaps.length} snaps, ${titles.length} titles`);
        await sleep(200);
    }

    // Try to find art
    let rescued = 0;
    let stillMissing = 0;
    const missingList = [];

    console.log('\n🔍 Searching for real artwork...\n');

    for (const [sysId, games] of Object.entries(bySystem)) {
        const cdn = cdnLists[sysId];
        if (!cdn) { stillMissing += games.length; continue; }

        for (const rom of games) {
            const artFile = path.join(ARTWORK_DIR, rom.artwork_path);
            const searchName = rom.title || rom.clean_name;

            // Try boxarts first (best quality), then snaps, then titles
            let found = null;
            let foundType = '';
            let foundIn = '';

            for (const [type, list] of [['Named_Boxarts', cdn.boxarts], ['Named_Snaps', cdn.snaps], ['Named_Titles', cdn.titles]]) {
                const match = findMatch(searchName, list);
                if (match) {
                    found = match;
                    foundType = type;
                    foundIn = cdn.dir;
                    break;
                }
            }

            // Also try with clean_name if different from title
            if (!found && rom.title && rom.title !== rom.clean_name) {
                for (const [type, list] of [['Named_Boxarts', cdn.boxarts], ['Named_Snaps', cdn.snaps]]) {
                    const match = findMatch(rom.clean_name, list);
                    if (match) {
                        found = match;
                        foundType = type;
                        foundIn = cdn.dir;
                        break;
                    }
                }
            }

            if (found) {
                const url = `${CDN}/${encodeURIComponent(foundIn)}/${foundType}/${encodeURIComponent(found)}.png`;
                try {
                    // Download to a temp file first, verify it's > 10KB
                    const tmpFile = artFile + '.tmp';
                    await downloadFile(url, tmpFile);
                    const newSize = fs.statSync(tmpFile).size;
                    if (newSize > 5000) {
                        fs.renameSync(tmpFile, artFile);
                        rescued++;
                        console.log(`  ✅ ${sysId}/${rom.clean_name} → ${found} (${Math.round(newSize/1024)}KB)`);
                    } else {
                        fs.unlinkSync(tmpFile);
                        stillMissing++;
                        missingList.push(`${sysId}/${rom.clean_name}`);
                    }
                } catch (err) {
                    stillMissing++;
                    missingList.push(`${sysId}/${rom.clean_name}`);
                }
            } else {
                stillMissing++;
                missingList.push(`${sysId}/${rom.clean_name}`);
            }

            await sleep(50);
        }
    }

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`  Rescued with real art:  ${rescued}`);
    console.log(`  Still placeholder:      ${stillMissing}`);
    console.log('═'.repeat(50));

    if (missingList.length > 0 && missingList.length <= 50) {
        console.log('\n  Games that truly have no CDN artwork:');
        for (const g of missingList) {
            console.log(`    - ${g}`);
        }
    }

    // Final stats
    let realCount = 0;
    let placeholderCount = 0;
    const systems = fs.readdirSync(ARTWORK_DIR).filter(d => fs.statSync(path.join(ARTWORK_DIR, d)).isDirectory());
    for (const sys of systems) {
        const sysPath = path.join(ARTWORK_DIR, sys);
        for (const file of fs.readdirSync(sysPath).filter(f => f.endsWith('.png'))) {
            const size = fs.statSync(path.join(sysPath, file)).size;
            if (size >= 10000) realCount++;
            else placeholderCount++;
        }
    }

    console.log(`\n  📊 Overall artwork status:`);
    console.log(`    Real art:     ${realCount}`);
    console.log(`    Placeholder:  ${placeholderCount}`);
    console.log(`    Coverage:     ${Math.round(realCount / (realCount + placeholderCount) * 100)}% real art`);

    db.close();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
