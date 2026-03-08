#!/usr/bin/env node
/**
 * bulk-favorites.js
 * For every player with fewer than 100 favorites, randomly pick 120 unique ROMs
 * and insert them as favorites (INSERT OR IGNORE to skip duplicates).
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', 'mollys-arcade.db');
const TARGET_NEW = 120;       // how many random ROMs to attempt per qualifying player
const THRESHOLD = 100;        // only process players with fewer than this many favorites

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 1. Gather all ROM IDs
const allRoms = db.prepare('SELECT id FROM roms').all().map(r => r.id);
console.log(`Total ROMs in database: ${allRoms.length}`);

if (allRoms.length === 0) {
  console.error('No ROMs found -- nothing to do.');
  process.exit(1);
}

// 2. Gather players and their current favorite counts
const players = db.prepare(`
  SELECT p.id   AS player_id,
         p.name AS player_name,
         COUNT(f.id) AS fav_count
  FROM   players p
  LEFT JOIN player_favorites f ON p.id = f.player_id
  GROUP BY p.id
  ORDER BY p.name
`).all();

console.log(`Total players: ${players.length}`);
console.log(`Players with < ${THRESHOLD} favorites: ${players.filter(p => p.fav_count < THRESHOLD).length}\n`);

// 3. Prepare the INSERT statement
const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO player_favorites (player_id, rom_id, added_at)
  VALUES (?, ?, ?)
`);

// Fisher-Yates shuffle helper (returns first `count` elements)
function pickRandom(arr, count) {
  const copy = [...arr];
  const n = Math.min(count, copy.length);
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// 4. Bulk insert inside a transaction
const now = new Date().toISOString();
let totalInserted = 0;
let playersProcessed = 0;

const bulkInsert = db.transaction(() => {
  for (const player of players) {
    if (player.fav_count >= THRESHOLD) {
      console.log(`  SKIP  ${player.player_name} (id=${player.player_id}) -- already has ${player.fav_count} favorites`);
      continue;
    }

    const picks = pickRandom(allRoms, TARGET_NEW);
    let inserted = 0;

    for (const romId of picks) {
      const info = insertStmt.run(player.player_id, romId, now);
      inserted += info.changes;   // 1 if inserted, 0 if ignored (duplicate)
    }

    totalInserted += inserted;
    playersProcessed++;
    console.log(`  ADD   ${player.player_name} (id=${player.player_id}) -- had ${player.fav_count}, attempted ${picks.length}, inserted ${inserted}`);
  }
});

bulkInsert();

// 5. Report
console.log(`\n--- Results ---`);
console.log(`Players processed: ${playersProcessed}`);
console.log(`Total new favorites inserted: ${totalInserted}`);
console.log('Done.');

db.close();
