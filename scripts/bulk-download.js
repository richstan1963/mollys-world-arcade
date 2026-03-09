#!/usr/bin/env node
/**
 * Molly's World Arcade — Bulk ROM Downloader v4
 * Downloads free/homebrew ROMs from freely accessible Archive.org collections
 * All collections verified HTTP 200 — no auth required
 */
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROMS_DIR = process.env.ARCADE_ROMS_DIR || path.join(__dirname, '..', 'roms');

// Map collection folder names → system IDs
const FOLDER_TO_SYSTEM = {
    'NES': 'nes', 'Super Nintendo': 'snes', 'Nintendo 64': 'n64',
    'Game Boy': 'gb', 'Game Boy Color': 'gbc', 'Game Boy Advance': 'gba',
    'Nintendo DS': 'nds', 'Genesis': 'genesis', 'Mega Drive': 'genesis',
    'Neo Geo Pocket': 'ngp', 'PC Engine': 'tg16', 'TurboGrafx': 'tg16',
    'Virtual Boy': 'vb', 'Wonderswan': 'wonderswan',
    'Atari 2600': 'atari2600', 'Atari 7800': 'atari7800', 'Atari Lynx': 'lynx',
    'Dreamcast': null, 'Arcade': 'arcade', 'DOS': 'dos',
    'ColecoVision': 'coleco', 'Sega Master System': 'sms',
    'Game Gear': 'gamegear', 'Sega 32X': '32x',
    // For all-hell-unleashed subfolder names
    'GB': 'gb', 'GBA': 'gba',
};

const ROM_EXTS = new Set(['.nes','.sfc','.smc','.z64','.n64','.v64','.gb','.gbc','.gba',
    '.nds','.md','.gen','.smd','.sms','.gg','.pce','.zip','.7z','.rar',
    '.a26','.a78','.lnx','.ngp','.ngc','.ws','.wsc','.col','.rom','.vb','.vboy',
    '.bin','.j64','.jag']);

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// ═══════════════════════════════════════════════════════════════════
// FREELY ACCESSIBLE collections — all verified HTTP 200, no auth
// ═══════════════════════════════════════════════════════════════════
const COLLECTIONS = [
    // Atari 2600 full set (615 individual .a26 files) — CONFIRMED
    { id: 'atari-2600-champion-collection-updated', system: 'atari2600' },

    // Multi-system homebrew dump (213 files, NES/SNES/GB/GBC/GBA/Genesis/Atari)
    { id: 'romhacking.net-homebrew-dump', system: null, detectSystem: true },

    // NES homebrew (121 individual ZIPs)
    { id: 'nes-romhacking.net-homebrew', system: 'nes' },

    // Multi-system raw ROMs (GB, GBA, NES folders)
    { id: 'all-hell-unleashed_202509', system: null, detectSystem: true },

    // Atari 5200 homebrew (130+ .bin files)
    { id: 'atari_5200_rom_homebrew', system: 'atari2600' }, // no 5200 core, 2600 as fallback

    // Genesis homebrew (15 .bin/.md files)
    { id: 'genhackshomebrew', system: 'genesis' },
];

// Individual homebrew games from Archive.org
const INDIVIDUAL_ITEMS = [
    { id: 'creepy-brawlers', system: 'nes' },
    { id: 'tear-rescue-20220703', system: 'nes' },
    { id: 'hbwc_2012', system: 'nes' },
    { id: 'possumgameboy', system: 'gb' },
    { id: 'labyrinth-of-the-dragon-gameboy-color-homebrew', system: 'gbc' },
    { id: 'barbarian-gba', system: 'gba' },
    { id: 'gba_supertux', system: 'gba' },
    { id: 'NasuHomebrew', system: 'nes' },
    { id: 'open-lara-tomb-raider-gba-homebrew-port', system: 'gba' },
    { id: 'bad-apple-nes', system: 'nes' },
    { id: 'carpetshark', system: 'nes' },
    { id: 'et_book_cart', system: 'atari2600' },
    { id: 'cave_in', system: 'atari2600' },
];

// Guess system from file extension
function guessSystemFromExt(filename) {
    const ext = path.extname(filename).toLowerCase();
    const map = {
        '.nes': 'nes', '.sfc': 'snes', '.smc': 'snes',
        '.z64': 'n64', '.n64': 'n64', '.v64': 'n64',
        '.gb': 'gb', '.gbc': 'gbc', '.gba': 'gba',
        '.nds': 'nds', '.md': 'genesis', '.gen': 'genesis', '.smd': 'genesis',
        '.sms': 'sms', '.gg': 'gamegear',
        '.pce': 'tg16', '.a26': 'atari2600', '.a78': 'atari7800',
        '.lnx': 'lynx', '.ngp': 'ngp', '.ngc': 'ngp',
        '.ws': 'wonderswan', '.wsc': 'wonderswan',
        '.col': 'coleco', '.vb': 'vb', '.vboy': 'vb',
        '.j64': 'jaguar', '.jag': 'jaguar',
    };
    return map[ext] || null;
}

// Detect system from folder name or extension
function detectSystem(filename, forceSystem) {
    if (forceSystem) return forceSystem;

    // Try folder name first
    const folder = filename.split('/')[0];
    if (FOLDER_TO_SYSTEM[folder]) return FOLDER_TO_SYSTEM[folder];

    // Try extension
    return guessSystemFromExt(filename);
}

async function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        mod.get(url, { headers: { 'User-Agent': 'MollysWorldArcade/1.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return fetchJSON(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
        }).on('error', reject);
    });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, { headers: { 'User-Agent': 'MollysWorldArcade/1.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
            }
            if (res.statusCode === 401 || res.statusCode === 403) {
                res.resume();
                return reject(new Error(`AUTH_REQUIRED`));
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
            const total = parseInt(res.headers['content-length'] || '0');
            let received = 0;
            const file = fs.createWriteStream(dest);
            res.on('data', chunk => {
                received += chunk.length;
                if (total > 512*1024) {
                    const pct = total ? Math.round(received/total*100) : 0;
                    process.stdout.write(`\r    ${pct}% (${(received/1024/1024).toFixed(1)}/${(total/1024/1024).toFixed(1)} MB)`);
                }
            });
            res.pipe(file);
            file.on('finish', () => { file.close(); if(total > 512*1024) process.stdout.write('\r' + ' '.repeat(50) + '\r'); resolve(); });
            file.on('error', err => { try { fs.unlinkSync(dest); } catch{} reject(err); });
        });
        req.on('error', reject);
    });
}

async function downloadCollection(identifier, forceSystem, detectFromPath = false) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📦 ${identifier}`);
    console.log(`${'═'.repeat(60)}`);

    let files;
    try {
        const url = `https://archive.org/metadata/${identifier}/files`;
        const data = await fetchJSON(url);
        files = (data.result || []).filter(f => {
            const ext = path.extname(f.name || '').toLowerCase();
            return ROM_EXTS.has(ext);
        }).map(f => ({ name: f.name, size: parseInt(f.size) || 0 }));
    } catch (err) {
        console.log(`  ❌ Failed to fetch metadata: ${err.message}`);
        return { downloaded: 0, skipped: 0, errors: 0 };
    }

    if (files.length === 0) {
        console.log(`  ⚠️  No ROM files found in collection`);
        return { downloaded: 0, skipped: 0, errors: 0 };
    }

    console.log(`  Found ${files.length} ROM files`);
    let downloaded = 0, skipped = 0, errors = 0, authFails = 0;

    for (const file of files) {
        const systemId = detectSystem(file.name, forceSystem);

        if (!systemId) { skipped++; continue; }
        if (file.size > MAX_FILE_SIZE) { skipped++; continue; }

        // Bail on 3 consecutive auth failures
        if (authFails >= 3) {
            console.log(`  🔒 Collection requires login — skipping remaining files`);
            skipped += files.length - downloaded - skipped - errors;
            break;
        }

        const destDir = path.join(ROMS_DIR, systemId);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

        const basename = path.basename(file.name);
        const destPath = path.join(destDir, basename);
        if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) { skipped++; continue; }

        const url = `https://archive.org/download/${identifier}/${encodeURIComponent(file.name)}`;
        try {
            const sizeMB = (file.size/1024/1024).toFixed(1);
            process.stdout.write(`  ⬇️  ${basename} (${sizeMB}MB) → ${systemId}...`);
            await downloadFile(url, destPath);
            console.log(' ✅');
            downloaded++;
            authFails = 0;
            await new Promise(r => setTimeout(r, 150));
        } catch (err) {
            if (err.message === 'AUTH_REQUIRED') {
                authFails++;
                console.log(' 🔒');
                try { fs.unlinkSync(destPath); } catch{}
            } else {
                console.log(` ❌ ${err.message}`);
            }
            errors++;
        }
    }

    console.log(`  📊 Downloaded: ${downloaded} | Already had: ${skipped} | Errors: ${errors}`);
    return { downloaded, skipped, errors };
}

async function main() {
    console.log('');
    console.log('🕹️  ╔══════════════════════════════════════════════════╗');
    console.log("   ║  Molly's World Arcade — ROM Downloader v4       ║");
    console.log('   ╚══════════════════════════════════════════════════╝');
    console.log('');
    console.log('   Downloading from verified freely-accessible collections...');

    let totalDown = 0, totalSkip = 0, totalErr = 0;

    // Phase 1: Multi-file collections
    for (const col of COLLECTIONS) {
        const r = await downloadCollection(col.id, col.system, col.detectSystem);
        totalDown += r.downloaded; totalSkip += r.skipped; totalErr += r.errors;
    }

    // Phase 2: Individual homebrew game items
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🎮 Individual Homebrew Games`);
    console.log(`${'═'.repeat(60)}`);

    for (const item of INDIVIDUAL_ITEMS) {
        const r = await downloadCollection(item.id, item.system);
        totalDown += r.downloaded; totalSkip += r.skipped; totalErr += r.errors;
    }

    // Summary
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🏁 ALL DONE!`);
    console.log(`   Downloaded: ${totalDown} new ROM files`);
    console.log(`   Already had: ${totalSkip}`);
    console.log(`   Errors: ${totalErr}`);

    // Count totals on disk
    let totalFiles = 0;
    const systems = [];
    for (const dir of fs.readdirSync(ROMS_DIR)) {
        const full = path.join(ROMS_DIR, dir);
        if (!fs.statSync(full).isDirectory()) continue;
        const count = fs.readdirSync(full).length;
        if (count > 0) {
            systems.push({ name: dir, count });
            totalFiles += count;
        }
    }
    console.log(`\n   📊 Total ROM files on disk: ${totalFiles} across ${systems.length} systems`);
    for (const s of systems.sort((a,b) => b.count - a.count)) {
        console.log(`      ${s.name}: ${s.count}`);
    }

    // Trigger scan
    console.log(`\n   🔍 Triggering ROM scan...`);
    try {
        await new Promise((resolve, reject) => {
            const postData = '{}';
            const options = {
                hostname: 'localhost', port: 3000, path: '/api/scanner/scan',
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': postData.length }
            };
            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => { resolve(body); });
            });
            req.on('error', reject);
            req.write(postData);
            req.end();
        });
        console.log(`   ✅ Scan triggered! Games will appear in the arcade shortly.`);
    } catch {
        console.log(`   ⚠️  Couldn't auto-scan. Run: curl -s -X POST http://localhost:3000/api/scanner/scan`);
    }
    console.log(`${'═'.repeat(60)}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
