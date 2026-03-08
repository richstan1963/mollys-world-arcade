import Database from 'better-sqlite3';
const db = new Database('./mollys-arcade.db');

const lynx = db.prepare("SELECT r.id, r.clean_name, r.filename FROM roms r JOIN systems s ON s.id = r.system_id LEFT JOIN metadata m ON m.rom_id = r.id WHERE m.artwork_path IS NULL AND r.system_id = 'lynx' ORDER BY r.clean_name").all();

console.log("Lynx ROMs without artwork (" + lynx.length + "):");
lynx.forEach(r => console.log("  ID:" + r.id + " " + r.clean_name + " (" + r.filename + ")"));

const a26 = db.prepare("SELECT r.id, r.clean_name, r.filename FROM roms r JOIN systems s ON s.id = r.system_id LEFT JOIN metadata m ON m.rom_id = r.id WHERE m.artwork_path IS NULL AND r.system_id = 'atari2600' ORDER BY r.clean_name").all();
console.log("");
console.log("Atari 2600 ROMs without artwork (" + a26.length + "):");
a26.forEach(r => console.log("  ID:" + r.id + " " + r.clean_name + " (" + r.filename + ")"));
db.close();
