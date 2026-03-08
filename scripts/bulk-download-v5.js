#!/usr/bin/env node
/**
 * Molly's World Arcade — Bulk ROM Downloader v5 (MEGA)
 * Downloads homebrew/freeware ROMs from freely accessible Archive.org collections
 * MUCH larger collection than v4 — pulls from 20+ sources
 */
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createUnzip } from 'zlib';
import { pipeline } from 'stream/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROMS_DIR = path.join(__dirname, '..', 'roms');

// Map collection folder names → system IDs
const FOLDER_TO_SYSTEM = {
    'NES': 'nes', 'Super Nintendo': 'snes', 'SNES': 'snes',
    'Nintendo 64': 'n64', 'N64': 'n64',
    'Game Boy': 'gb', 'GB': 'gb',
    'Game Boy Color': 'gbc', 'GBC': 'gbc',
    'Game Boy Advance': 'gba', 'GBA': 'gba',
    'Nintendo DS': 'nds', 'NDS': 'nds',
    'Genesis': 'genesis', 'Mega Drive': 'genesis', 'MD': 'genesis',
    'Neo Geo Pocket': 'ngp', 'NGP': 'ngp',
    'PC Engine': 'tg16', 'TurboGrafx': 'tg16', 'PCE': 'tg16',
    'Virtual Boy': 'vb', 'VB': 'vb',
    'Wonderswan': 'wonderswan', 'WS': 'wonderswan',
    'Atari 2600': 'atari2600', 'Atari 7800': 'atari7800', 'Atari Lynx': 'lynx',
    'Arcade': 'arcade', 'MAME': 'arcade',
    'ColecoVision': 'coleco', 'Coleco': 'coleco',
    'Sega Master System': 'sms', 'SMS': 'sms',
    'Game Gear': 'gamegear', 'GG': 'gamegear',
    'Sega 32X': '32x', '32X': '32x',
    'SG-1000': 'sg1000', 'SG1000': 'sg1000',
};

const ROM_EXTS = new Set([
    '.nes','.sfc','.smc','.z64','.n64','.v64','.gb','.gbc','.gba',
    '.nds','.md','.gen','.smd','.sms','.gg','.pce','.zip','.7z',
    '.a26','.a78','.lnx','.ngp','.ngc','.ws','.wsc','.col','.rom',
    '.vb','.vboy','.bin','.j64','.jag','.sg','.sc'
]);

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB per file

// ═══════════════════════════════════════════════════════════════════
// PHASE 1: Individual ROM collections (individual files, no unzipping)
// ═══════════════════════════════════════════════════════════════════
const COLLECTIONS = [
    // ── Atari ──
    { id: 'atari-2600-champion-collection-updated', system: 'atari2600' },
    { id: 'atari_5200_rom_homebrew', system: 'atari2600' },

    // ── Multi-system homebrew ──
    { id: 'romhacking.net-homebrew-dump', system: null, detectSystem: true },
    { id: 'homebrew-romsets', system: null, detectSystem: true },
    { id: 'all-hell-unleashed_202509', system: null, detectSystem: true },

    // ── NES Homebrew ──
    { id: 'nes-romhacking.net-homebrew', system: 'nes' },

    // ── Genesis Homebrew ──
    { id: 'genhackshomebrew', system: 'genesis' },
    { id: 'gen-md-hb', system: 'genesis' },

    // ── HBMAME (Homebrew MAME arcade) ──
    { id: 'hbmame-211', system: 'arcade' },

    // ── Coleco ──
    { id: 'Coleco_ColecoVision_TOSEC_2012_04_23', system: 'coleco' },
];

// ═══════════════════════════════════════════════════════════════════
// PHASE 2: Individual homebrew games
// ═══════════════════════════════════════════════════════════════════
const INDIVIDUAL_ITEMS = [
    // ── NES ──
    { id: 'creepy-brawlers', system: 'nes' },
    { id: 'tear-rescue-20220703', system: 'nes' },
    { id: 'hbwc_2012', system: 'nes' },
    { id: 'NasuHomebrew', system: 'nes' },
    { id: 'bad-apple-nes', system: 'nes' },
    { id: 'carpetshark', system: 'nes' },
    { id: 'new-super-mario-land', system: 'snes' },
    { id: 'teletime', system: 'nes' },
    { id: 'grimaces-birthday', system: 'gb' },

    // ── Game Boy ──
    { id: 'possumgameboy', system: 'gb' },
    { id: 'crystal-lake-vhvs', system: 'gb' },

    // ── GBC ──
    { id: 'labyrinth-of-the-dragon-gameboy-color-homebrew', system: 'gbc' },

    // ── GBA ──
    { id: 'barbarian-gba', system: 'gba' },
    { id: 'gba_supertux', system: 'gba' },
    { id: 'open-lara-tomb-raider-gba-homebrew-port', system: 'gba' },
    { id: 'clock-tower-advance', system: 'gba' },

    // ── Atari 2600 ──
    { id: 'et_book_cart', system: 'atari2600' },
    { id: 'cave_in', system: 'atari2600' },
    { id: 'Pacman4KNTSC', system: 'atari2600' },

    // ── Arcade ──
    { id: 'arcade_huncholy', system: 'arcade' },
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
        '.sg': 'sg1000', '.sc': 'sg1000',
    };
    return map[ext] || null;
}

function detectSystem(filename, forceSystem) {
    if (forceSystem) return forceSystem;
    const parts = filename.split('/');
    for (const part of parts) {
        if (FOLDER_TO_SYSTEM[part]) return FOLDER_TO_SYSTEM[part];
    }
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
                return reject(new Error('AUTH_REQUIRED'));
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
        req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
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
            process.stdout.write(`  ⬇️  ${basename.substring(0,50)} (${sizeMB}MB) → ${systemId}...`);
            await downloadFile(url, destPath);
            console.log(' ✅');
            downloaded++;
            authFails = 0;
            await new Promise(r => setTimeout(r, 100));
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
    console.log("   ║  Molly's World Arcade — ROM Downloader v5 MEGA  ║");
    console.log('   ╚══════════════════════════════════════════════════╝');
    console.log('');
    console.log('   Downloading from verified freely-accessible collections...');
    console.log(`   Target: ${ROMS_DIR}`);

    if (!fs.existsSync(ROMS_DIR)) fs.mkdirSync(ROMS_DIR, { recursive: true });

    let totalDown = 0, totalSkip = 0, totalErr = 0;

    // Phase 1: Multi-file collections
    console.log('\n\n🎯 PHASE 1: Multi-file Collections');
    console.log('═'.repeat(60));
    for (const col of COLLECTIONS) {
        const r = await downloadCollection(col.id, col.system, col.detectSystem);
        totalDown += r.downloaded; totalSkip += r.skipped; totalErr += r.errors;
    }

    // Phase 2: Individual homebrew game items
    console.log('\n\n🎮 PHASE 2: Individual Homebrew Games');
    console.log('═'.repeat(60));
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
    if (fs.existsSync(ROMS_DIR)) {
        for (const dir of fs.readdirSync(ROMS_DIR)) {
            const full = path.join(ROMS_DIR, dir);
            if (!fs.statSync(full).isDirectory()) continue;
            const count = fs.readdirSync(full).length;
            if (count > 0) {
                systems.push({ name: dir, count });
                totalFiles += count;
            }
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

    // Trigger batch artwork fetch
    console.log(`\n   🎨 Triggering artwork fetch...`);
    try {
        await new Promise((resolve, reject) => {
            const postData = '{}';
            const options = {
                hostname: 'localhost', port: 3000, path: '/api/metadata/batch',
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
        console.log(`   ✅ Artwork fetch triggered!`);
    } catch {
        console.log(`   ⚠️  Couldn't trigger artwork fetch.`);
    }

    console.log(`\n${'═'.repeat(60)}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
