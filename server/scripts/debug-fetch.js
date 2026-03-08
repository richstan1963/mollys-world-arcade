import Database from 'better-sqlite3';
import https from 'https';

const db = new Database('./mollys-arcade.db');

const rom = db.prepare("SELECT r.id, r.clean_name, r.filename, r.system_id, s.libretro_dir FROM roms r JOIN systems s ON s.id = r.system_id WHERE r.system_id = 'lynx' AND r.clean_name = 'Basketbrawl'").get();
console.log('ROM:', rom);

function parseFilenameTitle(filename) {
    let name = filename;
    name = name.replace(/\.[a-z0-9]+$/i, '');
    name = name.replace(/\s*\([^)]*\)\s*$/g, '');
    name = name.replace(/\s*\([^)]*\)\s*$/g, '');
    return name.trim();
}

const REGION_MAP = { 'NA': 'USA', 'JP': 'Japan', 'EU': 'Europe', 'World': 'World' };

function parseRegion(filename) {
    const match = filename.match(/\(([^)]+)\)\.[a-z0-9]+$/i);
    if (!match) return null;
    const raw = match[1].trim();
    if (REGION_MAP[raw]) return REGION_MAP[raw];
    return null;
}

const filenameTitle = parseFilenameTitle(rom.filename);
const region = parseRegion(rom.filename);
console.log('Filename title:', JSON.stringify(filenameTitle));
console.log('Region:', region);

const names = [];
const seen = new Set();
function addName(n) { if (!seen.has(n)) { seen.add(n); names.push(n); } }

if (region) addName(filenameTitle + ' (' + region + ')');
['USA', 'World', 'Japan', 'Europe', 'USA, Europe'].forEach(r => addName(filenameTitle + ' (' + r + ')'));
addName(filenameTitle);

console.log('Name variants:', names);

const CDN_BASE = 'https://thumbnails.libretro.com';
const libretroDir = encodeURIComponent(rom.libretro_dir);

// Test each URL
async function testUrls() {
    for (const n of names) {
        const url = CDN_BASE + '/' + libretroDir + '/Named_Boxarts/' + encodeURIComponent(n) + '.png';
        const code = await new Promise((resolve) => {
            const req = https.get(url, { headers: { 'User-Agent': 'Test' } }, (res) => {
                res.resume();
                resolve(res.statusCode);
            });
            req.on('error', () => resolve('error'));
            req.setTimeout(5000, () => { req.destroy(); resolve('timeout'); });
        });
        console.log(code + ' ' + url);
    }
    db.close();
}
testUrls();
