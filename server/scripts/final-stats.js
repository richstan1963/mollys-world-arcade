import Database from 'better-sqlite3';
const db = new Database('./mollys-arcade.db');

const stats = db.prepare(`
  SELECT s.name,
    COUNT(r.id) as total_roms,
    SUM(CASE WHEN m.artwork_path IS NOT NULL AND m.artwork_path != '' THEN 1 ELSE 0 END) as has_art
  FROM roms r
  JOIN systems s ON s.id = r.system_id
  LEFT JOIN metadata m ON m.rom_id = r.id
  GROUP BY s.id
  ORDER BY total_roms DESC
`).all();

console.log('System                              | Total | Art  | Miss | Pct');
console.log('-'.repeat(70));
let totalAll = 0, totalArt = 0;
stats.forEach(s => {
  const missing = s.total_roms - s.has_art;
  const pct = Math.round(s.has_art / s.total_roms * 100);
  const name = (s.name + ' '.repeat(35)).substring(0, 35);
  console.log(name + ' | ' + String(s.total_roms).padStart(5) + ' | ' + String(s.has_art).padStart(4) + ' | ' + String(missing).padStart(4) + ' | ' + pct + '%');
  totalAll += s.total_roms;
  totalArt += s.has_art;
});
console.log('-'.repeat(70));
console.log(('TOTAL' + ' '.repeat(35)).substring(0, 35) + ' | ' + String(totalAll).padStart(5) + ' | ' + String(totalArt).padStart(4) + ' | ' + String(totalAll - totalArt).padStart(4) + ' | ' + Math.round(totalArt/totalAll*100) + '%');
db.close();
