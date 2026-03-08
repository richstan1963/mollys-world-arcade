#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

console.log('');
console.log('  🕹️  Molly\'s World Arcade — Setup');
console.log('  ═══════════════════════════════════');
console.log('');

// Ensure directories exist
const dirs = ['roms', 'saves', 'artwork', 'data', 'data/cores'];
for (const dir of dirs) {
    const fullPath = path.join(ROOT, dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`  ✓ Created ${dir}/`);
    } else {
        console.log(`  · ${dir}/ exists`);
    }
}

// Create system subdirectories in roms/
const systems = [
    'nes', 'snes', 'n64', 'gb', 'gbc', 'gba', 'nds',
    'genesis', 'sms', 'gamegear', 'saturn', '32x',
    'psx', 'psp',
    'atari2600', 'atari7800', 'jaguar', 'lynx',
    'tg16', 'ngp', 'arcade', 'fbneo',
    'wonderswan', 'vb', '3do', 'coleco', 'dos',
];

for (const sys of systems) {
    const sysDir = path.join(ROOT, 'roms', sys);
    if (!fs.existsSync(sysDir)) {
        fs.mkdirSync(sysDir, { recursive: true });
    }
}
console.log(`  ✓ Created ${systems.length} system folders in roms/`);

console.log('');
console.log('  Setup complete! Run: npm start');
console.log('');
