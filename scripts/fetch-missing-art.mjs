// Fast parallel artwork fetcher for missing games
// Tries smarter name variants + higher concurrency than the main batch

import Database from 'better-sqlite3';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'mollys-arcade.db');
const ART_BASE = path.join(__dirname, '..', 'artwork');
const CONCURRENCY = 12;

const db = new Database(DB_PATH);

// Get all missing
const missing = db.prepare(`
  SELECT r.id, r.clean_name, r.filename, r.system_id, s.libretro_dir, m.region
  FROM roms r
  LEFT JOIN systems s ON s.id = r.system_id
  LEFT JOIN metadata m ON m.rom_id = r.id
  WHERE m.artwork_path IS NULL OR m.artwork_path = ''
`).all();

console.log(`Missing artwork: ${missing.length} games`);

function buildVariants(rom) {
  const clean = rom.clean_name || '';
  const filename = rom.filename || '';
  const slug = filename.replace(/\.[^.]+$/, ''); // strip extension
  const slugSpaced = slug.replace(/_/g, ' ').trim();

  const variants = new Set();

  // Core name + region combos
  const names = new Set([clean]);
  if (slugSpaced && slugSpaced !== clean) names.add(slugSpaced);

  // Strip trailing ", The" → prepend "The "
  for (const n of [...names]) {
    if (n.endsWith(', The')) names.add('The ' + n.replace(/, The$/, ''));
    if (n.startsWith('The ')) names.add(n.slice(4) + ', The');
  }

  // Strip punctuation variants
  for (const n of [...names]) {
    const stripped = n.replace(/\./g, '').replace(/  +/g, ' ').trim();
    if (stripped !== n) names.add(stripped);
    // Replace & with and
    const anded = n.replace(/ & /g, ' and ');
    if (anded !== n) names.add(anded);
    // Remove subtitle after " - "
    const noSub = n.split(' - ')[0].trim();
    if (noSub !== n && noSub.length > 3) names.add(noSub);
    // Strip "(Disc X)" etc.
    const noDisc = n.replace(/\s*\(Disc \d+\)[^)]*$/i, '').replace(/\s*\([^)]*Disc[^)]*\)/i, '').trim();
    if (noDisc !== n && noDisc.length > 3) names.add(noDisc);
  }

  // For each name, try region combos
  const regions = ['USA', 'World', 'Japan', 'Europe', 'En', 'USA, Europe', 'Japan, USA'];
  for (const n of names) {
    variants.add(n);  // bare name
    for (const r of regions) {
      variants.add(`${n} (${r})`);
    }
  }

  // For MAME/arcade: the slug (short ROM name) is the thumbnail key
  if (rom.system_id === 'arcade' || rom.system_id === 'fbneo') {
    variants.add(slug);
  }

  return [...variants];
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'MollysWorldArcade/2.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`${res.statusCode}`));
      }
      const tmp = dest + '.tmp';
      const file = fs.createWriteStream(tmp);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        // Validate size > 1KB (not a blank/error image)
        if (fs.statSync(tmp).size < 1024) {
          fs.unlinkSync(tmp);
          return reject(new Error('Too small'));
        }
        fs.renameSync(tmp, dest);
        resolve();
      });
      file.on('error', (e) => { try { fs.unlinkSync(tmp); } catch {} reject(e); });
    });
    req.on('error', reject);
    req.setTimeout(6000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function fetchOne(rom) {
  const artDir = path.join(ART_BASE, rom.system_id);
  fs.mkdirSync(artDir, { recursive: true });

  // Check if already downloaded (name match on disk)
  const destFile = path.join(artDir, `${rom.clean_name}.png`);
  if (fs.existsSync(destFile) && fs.statSync(destFile).size > 1024) {
    const relPath = `${rom.system_id}/${rom.clean_name}.png`;
    db.prepare(`INSERT INTO metadata (rom_id, artwork_path, metadata_source, fetched_at)
      VALUES (?,?,'libretro',datetime('now'))
      ON CONFLICT(rom_id) DO UPDATE SET artwork_path=?, fetched_at=datetime('now')`)
      .run(rom.id, relPath, relPath);
    return { ok: true, source: 'cache' };
  }

  const variants = buildVariants(rom);
  const libretroDir = encodeURIComponent(rom.libretro_dir || '');
  const types = ['Named_Boxarts', 'Named_Snaps', 'Named_Titles'];

  for (const type of types) {
    for (const variant of variants) {
      const url = `https://thumbnails.libretro.com/${libretroDir}/${type}/${encodeURIComponent(variant)}.png`;
      try {
        await download(url, destFile);
        const relPath = `${rom.system_id}/${rom.clean_name}.png`;
        db.prepare(`INSERT INTO metadata (rom_id, artwork_path, metadata_source, fetched_at)
          VALUES (?,?,'libretro',datetime('now'))
          ON CONFLICT(rom_id) DO UPDATE SET artwork_path=?, fetched_at=datetime('now')`)
          .run(rom.id, relPath, relPath);
        return { ok: true, source: type, variant };
      } catch { /* try next */ }
    }
  }

  return { ok: false };
}

// Concurrency pool
async function runPool(items, concurrency, fn) {
  let idx = 0, done = 0, fetched = 0, failed = 0;

  async function worker() {
    while (idx < items.length) {
      const item = items[idx++];
      const result = await fn(item);
      done++;
      if (result.ok) fetched++;
      else failed++;
      if (done % 25 === 0 || done === items.length) {
        process.stdout.write(`\r  [${done}/${items.length}] ✅ ${fetched} fetched | ❌ ${failed} not found`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log('');
  return { fetched, failed };
}

console.log(`Running with concurrency=${CONCURRENCY}...\n`);
const { fetched, failed } = await runPool(missing, CONCURRENCY, fetchOne);

console.log(`\nDone! ${fetched} new artwork images fetched.`);
console.log(`${failed} games genuinely not found on Libretro CDN.`);

// Final coverage
const have = db.prepare(`SELECT COUNT(*) as c FROM roms r JOIN metadata m ON r.id=m.rom_id WHERE m.artwork_path IS NOT NULL AND m.artwork_path!=''`).get();
const total = db.prepare('SELECT COUNT(*) as c FROM roms').get();
console.log(`\nTotal coverage: ${have.c}/${total.c} (${Math.round(have.c/total.c*100)}%)`);
db.close();
