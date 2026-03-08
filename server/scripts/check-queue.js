import Database from 'better-sqlite3';
const db = new Database('./mollys-arcade.db');

const candidates = db.prepare("SELECT r.id, r.clean_name, r.filename, r.system_id, s.libretro_dir FROM roms r JOIN systems s ON s.id = r.system_id LEFT JOIN metadata m ON m.rom_id = r.id WHERE m.artwork_path IS NULL ORDER BY s.name, r.clean_name LIMIT 25").all();

candidates.forEach((r, i) => {
    console.log((i+1) + ". [" + r.system_id + "] " + r.clean_name + " | file: " + r.filename);
});
db.close();
