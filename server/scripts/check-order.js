import Database from 'better-sqlite3';
const db = new Database('./mollys-arcade.db');

const candidates = db.prepare("SELECT r.id, r.clean_name, r.filename, r.system_id, s.libretro_dir FROM roms r JOIN systems s ON s.id = r.system_id LEFT JOIN metadata m ON m.rom_id = r.id WHERE m.artwork_path IS NULL ORDER BY s.name, r.clean_name").all();

// Count by system
const bySys = {};
candidates.forEach(r => {
    bySys[r.system_id] = (bySys[r.system_id] || 0) + 1;
});

// Show order of processing
let pos = 0;
const systemOrder = [];
let currentSys = null;
candidates.forEach(r => {
    if (r.system_id !== currentSys) {
        if (currentSys) systemOrder.push({id: currentSys, start: pos - bySys[currentSys] + 1, count: bySys[currentSys]});
        currentSys = r.system_id;
    }
    pos++;
});
if (currentSys) systemOrder.push({id: currentSys, start: pos - (bySys[currentSys] || 0) + 1, count: bySys[currentSys] || 0});

// Recalculate properly
pos = 0;
currentSys = null;
let startPos = 0;
const order = [];
candidates.forEach((r, i) => {
    if (r.system_id !== currentSys) {
        if (currentSys) order.push({id: currentSys, start: startPos + 1, end: i, count: i - startPos});
        currentSys = r.system_id;
        startPos = i;
    }
});
if (currentSys) order.push({id: currentSys, start: startPos + 1, end: candidates.length, count: candidates.length - startPos});

console.log('Total: ' + candidates.length + ' ROMs without artwork');
console.log('');
console.log('Processing order:');
order.forEach(s => {
    console.log('  Positions ' + s.start + '-' + s.end + ': ' + s.id + ' (' + s.count + ' ROMs)');
});
db.close();
