#!/usr/bin/env node
/**
 * Downloads HBMAME (Homebrew MAME) ROM collection — 588 arcade homebrew games
 * From Archive.org: hbmame-211
 */
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCADE_DIR = path.join(__dirname, '..', 'roms', 'arcade');

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'MollysWorldArcade/1.0' } }, res => {
            if (res.statusCode === 301 || res.statusCode === 302) return fetchJSON(res.headers.location).then(resolve).catch(reject);
            if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
            let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve(JSON.parse(b)); } catch(e) { reject(e); } });
        }).on('error', reject);
    });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        mod.get(url, { headers: { 'User-Agent': 'MollysWorldArcade/1.0' } }, res => {
            if (res.statusCode === 301 || res.statusCode === 302) return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
            if (res.statusCode === 403 || res.statusCode === 401) { res.resume(); return reject(new Error('AUTH')); }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
            file.on('error', err => { try { fs.unlinkSync(dest); } catch {} reject(err); });
        }).on('error', reject);
    });
}

async function main() {
    console.log('🕹️  Downloading HBMAME (Homebrew MAME) arcade games');

    if (!fs.existsSync(ARCADE_DIR)) fs.mkdirSync(ARCADE_DIR, { recursive: true });

    console.log('  Fetching file list...');
    const data = await fetchJSON('https://archive.org/metadata/hbmame-211/files');
    const files = (data.result || [])
        .filter(f => f.name.startsWith('HBMAME 0.211 ROMs (merged)/') && f.name.endsWith('.zip'))
        .map(f => ({ name: f.name.split('/').pop(), fullPath: f.name, size: parseInt(f.size || 0) }))
        .filter(f => f.size < 50 * 1024 * 1024); // Skip files > 50MB

    console.log(`  Found ${files.length} arcade ROMs\n`);

    let downloaded = 0, skipped = 0, errors = 0, authFails = 0;

    for (const file of files) {
        if (authFails >= 5) { console.log('  🔒 Too many auth failures — collection may require login'); break; }

        const dest = path.join(ARCADE_DIR, file.name);
        if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { skipped++; continue; }

        const url = `https://archive.org/download/hbmame-211/${encodeURIComponent(file.fullPath)}`;
        try {
            const sizeMB = (file.size / 1024 / 1024).toFixed(1);
            process.stdout.write(`  ⬇️  ${file.name.substring(0, 45).padEnd(45)} ${sizeMB.padStart(6)}MB...`);
            await downloadFile(url, dest);
            console.log(' ✅');
            downloaded++;
            authFails = 0;
            await new Promise(r => setTimeout(r, 150));
        } catch (err) {
            if (err.message === 'AUTH') { authFails++; console.log(' 🔒'); }
            else console.log(` ❌ ${err.message}`);
            errors++;
            try { fs.unlinkSync(dest); } catch {}
        }
    }

    console.log(`\n📊 Downloaded: ${downloaded} | Already had: ${skipped} | Errors: ${errors}`);
    console.log(`   Total arcade ROMs on disk: ${fs.readdirSync(ARCADE_DIR).length}`);

    // Trigger scan
    try {
        await new Promise((resolve, reject) => {
            const req = http.request({ hostname: 'localhost', port: 3000, path: '/api/scanner/scan', method: 'POST',
                headers: { 'Content-Type': 'application/json' } }, res => {
                let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(b));
            });
            req.on('error', reject); req.write('{}'); req.end();
        });
        console.log('🔍 Scan triggered!');
    } catch {}
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
