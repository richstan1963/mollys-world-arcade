#!/usr/bin/env node
/**
 * fix-artwork.mjs — Find and download missing artwork from multiple sources
 * Then remove any games that STILL have no artwork.
 */
import Database from 'better-sqlite3';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../server/config.js';

const db = new Database('./mollys-arcade.db');
const ARTWORK_DIR = path.join(CONFIG.ROMS_DIR, '..', 'artwork');
const DELAY = 150; // ms between CDN requests

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function fetchText(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'YWA-ArtworkFixer/1.0' } }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchText(res.headers.location).then(resolve, reject);
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => resolve(body));
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const req = https.get(url, { headers: { 'User-Agent': 'YWA-ArtworkFixer/1.0' } }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return downloadFile(res.headers.location, dest).then(resolve, reject);
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
            const ws = fs.createWriteStream(dest);
            res.pipe(ws);
            ws.on('finish', () => resolve(true));
            ws.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── CDN Index Parser ─────────────────────────────────────────────────────────

function parseCdnIndex(html) {
    const map = new Map();
    const re = /href="([^"]+\.png)"/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        let filename = decodeURIComponent(m[1]).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        const name = filename.replace(/\.png$/i, '');
        const normalized = normalize(name);
        map.set(normalized, filename);
    }
    return map;
}

function normalize(s) {
    return s.toLowerCase()
        .replace(/\s*\([^)]*\)\s*/g, '') // remove parentheticals
        .replace(/[^a-z0-9]/g, '')       // only alphanumeric
        .trim();
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    // Get all games missing artwork
    const missing = db.prepare(`
        SELECT r.id, r.system_id, r.clean_name, r.filename, s.libretro_dir
        FROM roms r
        JOIN systems s ON s.id = r.system_id
        LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE m.artwork_path IS NULL OR m.artwork_path = ''
        ORDER BY r.system_id, r.clean_name
    `).all();

    console.log(`\n🎨 ${missing.length} games missing artwork\n`);

    // CDN directories to try for each system
    const ALT_DIRS = {
        ngp: ['SNK - Neo Geo Pocket Color', 'SNK - Neo Geo Pocket'],
        atari7800: ['Atari - 7800'],
        wonderswan: ['Bandai - WonderSwan Color', 'Bandai - WonderSwan'],
        lynx: ['Atari - Lynx'],
        tg16: ['NEC - PC Engine - TurboGrafx 16', 'NEC - PC Engine SuperGrafx'],
        fbneo: ['FBNeo - Arcade Games', 'MAME'],
        gba: ['Nintendo - Game Boy Advance'],
        jaguar: ['Atari - Jaguar'],
    };

    const CDN_TYPES = ['Named_Boxarts', 'Named_Snaps', 'Named_Titles'];
    const indexCache = new Map();

    async function getCdnIndex(dir, type) {
        const key = `${dir}::${type}`;
        if (indexCache.has(key)) return indexCache.get(key);
        const url = `https://thumbnails.libretro.com/${encodeURIComponent(dir)}/${type}/`;
        try {
            const html = await fetchText(url);
            const map = parseCdnIndex(html);
            indexCache.set(key, map);
            console.log(`  📂 ${dir}/${type}: ${map.size} entries`);
            return map;
        } catch (e) {
            indexCache.set(key, new Map());
            return new Map();
        }
    }

    // Try to find artwork for each missing game
    let found = 0, notFound = 0;
    const stillMissing = [];

    for (const game of missing) {
        const sysId = game.system_id;
        const dirs = ALT_DIRS[sysId] || [game.libretro_dir];
        const cleanNorm = normalize(game.clean_name);

        let artworkFound = false;

        for (const dir of dirs) {
            if (artworkFound) break;
            for (const type of CDN_TYPES) {
                if (artworkFound) break;
                const index = await getCdnIndex(dir, type);

                // Try exact normalized match
                if (index.has(cleanNorm)) {
                    const cdnFile = index.get(cleanNorm);
                    const url = `https://thumbnails.libretro.com/${encodeURIComponent(dir)}/${type}/${encodeURIComponent(cdnFile)}`;
                    const localPath = path.join(ARTWORK_DIR, sysId, `${game.clean_name}.png`);

                    try {
                        await downloadFile(url, localPath);
                        // Update metadata
                        const artPath = `${sysId}/${game.clean_name}.png`;
                        const existing = db.prepare('SELECT rom_id FROM metadata WHERE rom_id = ?').get(game.id);
                        if (existing) {
                            db.prepare('UPDATE metadata SET artwork_path = ? WHERE rom_id = ?').run(artPath, game.id);
                        } else {
                            db.prepare('INSERT INTO metadata (rom_id, artwork_path, metadata_source, fetched_at) VALUES (?, ?, ?, datetime("now"))').run(game.id, artPath, 'libretro-fix');
                        }
                        found++;
                        console.log(`  ✅ ${sysId}/${game.clean_name} ← ${dir}/${type}`);
                        artworkFound = true;
                        await sleep(DELAY);
                    } catch (e) {
                        // Download failed, try next
                    }
                }

                // Try partial matches - find any entry that starts with our normalized name
                if (!artworkFound) {
                    for (const [norm, cdnFile] of index) {
                        if (norm.startsWith(cleanNorm) || cleanNorm.startsWith(norm)) {
                            const url = `https://thumbnails.libretro.com/${encodeURIComponent(dir)}/${type}/${encodeURIComponent(cdnFile)}`;
                            const localPath = path.join(ARTWORK_DIR, sysId, `${game.clean_name}.png`);
                            try {
                                await downloadFile(url, localPath);
                                const artPath = `${sysId}/${game.clean_name}.png`;
                                const existing = db.prepare('SELECT rom_id FROM metadata WHERE rom_id = ?').get(game.id);
                                if (existing) {
                                    db.prepare('UPDATE metadata SET artwork_path = ? WHERE rom_id = ?').run(artPath, game.id);
                                } else {
                                    db.prepare('INSERT INTO metadata (rom_id, artwork_path, metadata_source, fetched_at) VALUES (?, ?, ?, datetime("now"))').run(game.id, artPath, 'libretro-fix');
                                }
                                found++;
                                console.log(`  ✅ ${sysId}/${game.clean_name} ← ${dir}/${type} (partial: ${cdnFile})`);
                                artworkFound = true;
                                await sleep(DELAY);
                                break;
                            } catch (e) {
                                // Download failed, try next
                            }
                        }
                    }
                }
            }
        }

        if (!artworkFound) {
            notFound++;
            stillMissing.push(game);
            console.log(`  ❌ ${sysId}/${game.clean_name} — NO ARTWORK FOUND`);
        }
    }

    console.log(`\n═══ Results ═══`);
    console.log(`Found: ${found}`);
    console.log(`Still missing: ${notFound}`);

    if (stillMissing.length > 0) {
        console.log(`\n═══ Games to REMOVE (no artwork available) ═══`);
        const bySystem = {};
        for (const g of stillMissing) {
            if (!bySystem[g.system_id]) bySystem[g.system_id] = [];
            bySystem[g.system_id].push(g);
        }

        for (const [sys, games] of Object.entries(bySystem).sort()) {
            const total = db.prepare('SELECT COUNT(*) as cnt FROM roms WHERE system_id = ?').get(sys).cnt;
            const afterRemoval = total - games.length;
            console.log(`\n${sys}: remove ${games.length} → ${afterRemoval} remaining`);
            games.forEach(g => console.log(`  - [${g.id}] ${g.clean_name}`));
        }

        // Remove them
        console.log(`\n🗑️  Removing ${stillMissing.length} games with no artwork...`);
        const delMeta = db.prepare('DELETE FROM metadata WHERE rom_id = ?');
        const delRom = db.prepare('DELETE FROM roms WHERE id = ?');
        for (const g of stillMissing) {
            delMeta.run(g.id);
            delRom.run(g.id);
        }
        console.log('Done.');
    }

    // Final counts
    const final = db.prepare('SELECT system_id, COUNT(*) as cnt FROM roms GROUP BY system_id ORDER BY system_id').all();
    console.log(`\n═══ Final ROM counts ═══`);
    let total = 0;
    for (const r of final) {
        const artCount = db.prepare(`SELECT COUNT(*) as cnt FROM metadata m JOIN roms r ON m.rom_id = r.id WHERE r.system_id = ? AND m.artwork_path IS NOT NULL AND m.artwork_path != ''`).get(r.system_id).cnt;
        const pct = Math.round(artCount / r.cnt * 100);
        const status = pct === 100 ? '✅' : `⚠️ ${pct}%`;
        console.log(`  ${r.system_id}: ${r.cnt} games, ${artCount} art ${status}`);
        total += r.cnt;
    }
    console.log(`  TOTAL: ${total}`);

    db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
