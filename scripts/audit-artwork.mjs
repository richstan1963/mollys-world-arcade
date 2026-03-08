import Database from 'better-sqlite3';
const db = new Database('./mollys-arcade.db');

const missing = db.prepare(`
  SELECT r.id, r.system_id, r.clean_name, r.filename
  FROM roms r
  LEFT JOIN metadata m ON m.rom_id = r.id
  WHERE m.artwork_path IS NULL OR m.artwork_path = ''
  ORDER BY r.system_id, r.clean_name
`).all();

// BIOS/boot files
const bios = missing.filter(g => g.filename.includes('BIOS') || g.filename.includes('[BIOS]') || g.clean_name.includes('Boot ROM') || g.clean_name.includes('Check Program'));
console.log(`=== BIOS/Boot/Test files (${bios.length}) ===`);
bios.forEach(g => console.log(`  [${g.id}] ${g.system_id}: ${g.filename}`));

// Backup files
const backups = missing.filter(g => g.filename.endsWith('.bak') || g.filename.endsWith('.orig'));
console.log(`\n=== Backup files (${backups.length}) ===`);
backups.forEach(g => console.log(`  [${g.id}] ${g.system_id}: ${g.filename}`));

// Homebrew/hacks/prototypes
const homebrew = missing.filter(g =>
  g.filename.includes('Hack)') || g.filename.includes('Homebrew)') ||
  g.filename.includes('Prototype)') || g.filename.includes('(WR)') ||
  g.clean_name.includes('UNIROM') || g.clean_name === 'danhans pong' ||
  g.clean_name.includes('HuZERO') || g.clean_name === 'Neo Bug Hunt' ||
  g.clean_name === 'bd7800demo' || g.clean_name === 'bonQ' ||
  g.clean_name === 'salvo bas' || g.clean_name === 'Pong5'
);
console.log(`\n=== Homebrew/Hacks/Prototypes (${homebrew.length}) ===`);
homebrew.forEach(g => console.log(`  [${g.id}] ${g.system_id}: ${g.filename}`));

// Games that have a duplicate WITH artwork already
const withArt = db.prepare(`
  SELECT r.id, r.system_id, r.clean_name
  FROM roms r
  JOIN metadata m ON m.rom_id = r.id
  WHERE m.artwork_path IS NOT NULL AND m.artwork_path != ''
`).all();
const artSet = new Set(withArt.map(g => g.system_id + ':' + g.clean_name.toLowerCase()));
const dupeOfExisting = missing.filter(g => artSet.has(g.system_id + ':' + g.clean_name.toLowerCase()));
console.log(`\n=== Duplicate of game WITH artwork (${dupeOfExisting.length}) ===`);
dupeOfExisting.forEach(g => console.log(`  [${g.id}] ${g.system_id}: ${g.clean_name}`));

// Collect all IDs to remove (union of all categories)
const removeIds = new Set([...bios, ...backups, ...homebrew, ...dupeOfExisting].map(g => g.id));
const remaining = missing.filter(g => !removeIds.has(g.id));
console.log(`\n=== REMAINING after cleanup (${remaining.length}) - need alt artwork ===`);
remaining.forEach(g => console.log(`  [${g.id}] ${g.system_id}: ${g.clean_name} (${g.filename})`));

// Summary by system
console.log(`\n=== Summary ===`);
console.log(`Total missing: ${missing.length}`);
console.log(`BIOS/Test: ${bios.length}`);
console.log(`Backups: ${backups.length}`);
console.log(`Homebrew/Hacks/Proto: ${homebrew.length}`);
console.log(`Dupes of art games: ${dupeOfExisting.length}`);
console.log(`To remove: ${removeIds.size}`);
console.log(`Remaining needing art: ${remaining.length}`);

// Per-system counts after removal
console.log(`\n=== Per-system impact ===`);
const romCounts = db.prepare('SELECT system_id, COUNT(*) as cnt FROM roms GROUP BY system_id').all();
const countMap = Object.fromEntries(romCounts.map(r => [r.system_id, r.cnt]));
const removeBySystem = {};
for (const id of removeIds) {
  const g = missing.find(m => m.id === id);
  removeBySystem[g.system_id] = (removeBySystem[g.system_id] || 0) + 1;
}
for (const [sys, cnt] of Object.entries(countMap).sort()) {
  const rem = removeBySystem[sys] || 0;
  const after = cnt - rem;
  const missingArt = remaining.filter(g => g.system_id === sys).length;
  if (rem > 0 || missingArt > 0) {
    console.log(`  ${sys}: ${cnt} → ${after} (remove ${rem}, still missing art: ${missingArt})`);
  }
}

db.close();
