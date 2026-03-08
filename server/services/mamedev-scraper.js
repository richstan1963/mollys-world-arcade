import https from 'https';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';

// Free ROMs from https://www.mamedev.org/roms/ — rights-holder approved
const MAMEDEV_ROMS = [
    { name: 'Alien Arena', slug: 'alienar' },
    { name: 'Car Polo', slug: 'carpolo' },
    { name: 'Circus', slug: 'circus' },
    { name: 'Crash', slug: 'crash' },
    { name: 'Fire One', slug: 'fireone' },
    { name: 'Frog', slug: 'frog' },
    { name: 'Gridlee', slug: 'gridlee' },
    { name: 'Hardhat', slug: 'hardhat' },
    { name: 'Looping', slug: 'looping' },
    { name: 'Maze Invaders', slug: 'mazeinv' },
    { name: 'Monkey Magic', slug: 'monkeym' },
    { name: 'Polaris', slug: 'polaris' },
    { name: 'Robby Roto', slug: 'robby' },
    { name: 'Robot Bowl', slug: 'robotbwl' },
    { name: 'Side Trak', slug: 'sidetrac' },
    { name: 'Spectar', slug: 'spectar' },
    { name: 'Star Fire', slug: 'starfire' },
    { name: 'Super Tank', slug: 'supertnk' },
    { name: 'Targ', slug: 'targ' },
    { name: 'Teeter Torture', slug: 'teetert' },
    { name: 'Victory', slug: 'victory' },
];

export async function getMamedevList(db) {
    const arcadeDir = path.join(CONFIG.ROMS_DIR, 'arcade');

    return MAMEDEV_ROMS.map(rom => {
        const zipPath = path.join(arcadeDir, `${rom.slug}.zip`);
        const downloaded = fs.existsSync(zipPath);
        return { ...rom, downloaded };
    });
}

export async function downloadMamedevRom(db, slug) {
    const rom = MAMEDEV_ROMS.find(r => r.slug === slug);
    if (!rom) throw new Error(`Unknown MAMEdev ROM: ${slug}`);

    const arcadeDir = path.join(CONFIG.ROMS_DIR, 'arcade');
    if (!fs.existsSync(arcadeDir)) fs.mkdirSync(arcadeDir, { recursive: true });

    // First, discover the zip URL by scraping the ROM's subpage
    const pageUrl = `${CONFIG.MAMEDEV_ROMS_URL}${slug}/`;
    const zipUrls = await discoverZipUrls(pageUrl);

    if (zipUrls.length === 0) {
        throw new Error(`No ZIP files found for ${slug}`);
    }

    const results = [];
    for (const zipUrl of zipUrls) {
        const filename = zipUrl.split('/').pop();
        const destPath = path.join(arcadeDir, filename);

        if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
            results.push({ file: filename, status: 'exists' });
            continue;
        }

        await downloadFile(zipUrl, destPath);
        results.push({ file: filename, status: 'downloaded' });
    }

    return { ok: true, slug: rom.slug, name: rom.name, files: results };
}

function discoverZipUrls(pageUrl) {
    return new Promise((resolve, reject) => {
        https.get(pageUrl, { headers: { 'User-Agent': 'MollysWorldArcade/1.0' } }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                resolve([]);
                return;
            }
            let html = '';
            res.on('data', chunk => html += chunk);
            res.on('end', () => {
                // Find all .zip href links
                const regex = /href=["']([^"']*\.zip)["']/gi;
                const urls = [];
                let match;
                while ((match = regex.exec(html)) !== null) {
                    let href = match[1];
                    if (!href.startsWith('http')) {
                        href = new URL(href, pageUrl).href;
                    }
                    if (href.includes('mamedev.org')) {
                        urls.push(href);
                    }
                }
                resolve([...new Set(urls)]);
            });
        }).on('error', () => resolve([]));
    });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'MollysWorldArcade/1.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                downloadFile(res.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
            }
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
            file.on('error', err => { try { fs.unlinkSync(dest); } catch {} reject(err); });
        }).on('error', reject);
    });
}
