#!/usr/bin/env node
/**
 * fill-systems.js — Fill all systems to 100 games
 *
 * Phase 1: Download the curated "greatest hits" list for each system
 * Phase 2: Fill remaining slots (to reach TARGET) with bulk archive games
 *
 * Usage:
 *   node server/scripts/fill-systems.js              # all systems
 *   node server/scripts/fill-systems.js nes snes     # specific systems
 *   node server/scripts/fill-systems.js --dry-run    # preview only
 *   node server/scripts/fill-systems.js --check      # show counts only
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '../..');
const ROMS_DIR  = path.join(ROOT, 'roms');

const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const CHECK    = args.includes('--check');
const DELAY_MS = 1500;
const TARGET   = 100;   // minimum games per system

// Systems to skip (very large files or no reliable source)
const SKIP = new Set(['psx', 'psp', 'saturn', '3do', 'nds', 'n64']);

// Systems to process — either from CLI args or all
const CLI_SYSTEMS = args.filter(a => !a.startsWith('--'));

// ─── Archive.org sources (verified working IDs) ──────────────────────────────
const SOURCES = {
    nes:        { name: 'NES',         ext: ['.nes', '.zip'],          target: TARGET,
                  archives: ['Nintendo-Entertainment-System-ROM-Collection-by-Ghost', 'nes-rom-collection', 'NES-ROMs-No-Intro-2023', 'ni-roms'] },
    snes:       { name: 'SNES',        ext: ['.sfc', '.smc', '.zip'],  target: TARGET,
                  archives: ['Super-Nintendo-Entertainment-System-ROM-Collection-by-Ghost', 'snes-rom-collection', 'SNES-ROMs-No-Intro-2023'] },
    genesis:    { name: 'Genesis',     ext: ['.md', '.gen', '.bin', '.zip'], target: TARGET,
                  archives: ['sega-genesis-champion-collection-updated-v2', 'segagenesisromcollection', 'genesis-rom-collection'] },
    gba:        { name: 'GBA',         ext: ['.gba', '.zip'],          target: TARGET,
                  archives: ['GameboyAdvanceRomCollectionByGhostware', 'gba-rom-collection', 'GBA-ROMs-No-Intro-2023'] },
    gb:         { name: 'Game Boy',    ext: ['.gb', '.zip'],           target: TARGET,
                  archives: ['Game-Boy-ROM-Collection-by-Ghost', 'gb-rom-collection', 'GameBoy-ROMs-No-Intro-2023'] },
    gbc:        { name: 'GBC',         ext: ['.gbc', '.zip'],          target: 80,
                  archives: ['Game-Boy-Color-ROM-Collection-by-Ghost', 'gbc-rom-collection', 'GameBoyColor-ROMs-No-Intro-2023'] },
    sms:        { name: 'Master Sys',  ext: ['.sms', '.zip'],          target: 80,
                  archives: ['Sega-Master-System-ROM-Collection-by-Ghost', 'sms-rom-collection', 'MasterSystem-ROMs-No-Intro-2023'] },
    gamegear:   { name: 'Game Gear',   ext: ['.gg', '.zip'],           target: 50,
                  archives: ['Sega-Game-Gear-ROM-Collection-by-Ghost', 'gamegear-rom-collection', 'GameGear-ROMs-No-Intro-2023'] },
    tg16:       { name: 'TG-16',       ext: ['.pce', '.zip'],          target: 60,
                  archives: ['TurboGrafx-16-ROM-Collection-by-Ghost', 'tg16-rom-collection', 'TurboGrafx16-ROMs-No-Intro-2023'] },
    atari2600:  { name: 'Atari 2600',  ext: ['.a26', '.bin', '.zip'],  target: TARGET,
                  archives: ['Atari2600RomCollectionByGhostware', 'atari-2600-rom-collection', 'Atari2600-ROMs-No-Intro-2023'] },
    atari7800:  { name: 'Atari 7800',  ext: ['.a78', '.zip'],          target: 50,
                  archives: ['Atari7800RomCollectionByGhostware', 'atari-7800-rom-collection', 'Atari7800-ROMs-No-Intro-2023'] },
    lynx:       { name: 'Lynx',        ext: ['.lnx', '.zip'],          target: 30,
                  archives: ['AtariLynxRomCollectionByGhostware', 'atari-lynx-rom-collection', 'AtariLynx-ROMs-No-Intro-2023'] },
    ngp:        { name: 'NGP',         ext: ['.ngp', '.ngc', '.zip'],  target: 25,
                  archives: ['NeoGeoPocketRomCollectionByGhostware', 'ngp-rom-collection', 'NeoGeoPocket-ROMs-No-Intro-2023'] },
    wonderswan: { name: 'WonderSwan',  ext: ['.ws', '.wsc', '.zip'],   target: 25,
                  archives: ['WonderSwanRomCollectionByGhostware', 'wonderswan-rom-collection'] },
    vb:         { name: 'Virtual Boy', ext: ['.vb', '.vboy', '.zip'],  target: 22,
                  archives: ['VirtualBoyRomCollectionByGhostware', 'virtual-boy-rom-collection'] },
    coleco:     { name: 'ColecoVision',ext: ['.col', '.rom', '.zip'],  target: 40,
                  archives: ['ColecoVisionRomCollectionByGhostware', 'colecovision-rom-collection'] },
    '32x':      { name: 'Sega 32X',   ext: ['.32x', '.zip'],          target: 40,
                  archives: ['Sega32XRomCollectionByGhostware', 'sega-32x-rom-collection'] },
};

// ─── Curated greatest hits per system ────────────────────────────────────────
const GREATEST_HITS = {
    nes: ['Super Mario Bros', 'Super Mario Bros 3', 'Super Mario Bros 2',
          'Mega Man 2', 'Mega Man 3', 'Mega Man 4', 'Mega Man 5', 'Mega Man 6',
          'Legend of Zelda', 'Zelda II', 'Metroid', 'Castlevania', 'Castlevania II', 'Castlevania III',
          'Contra', 'Super C', 'Kirby Adventure', 'Punch-Out', 'Mike Tyson',
          'Ninja Gaiden', 'Ninja Gaiden II', 'Ninja Gaiden III', 'Battletoads',
          'Double Dragon', 'Double Dragon II', 'TMNT', 'Teenage Mutant Ninja Turtles',
          'Tecmo Super Bowl', 'Bionic Commando', 'DuckTales', 'Chip Dale',
          'Final Fantasy', 'Dragon Warrior', 'Bubble Bobble', 'Gradius',
          'Life Force', 'Ghosts N Goblins', 'Blaster Master', 'River City Ransom',
          'StarTropics', 'Kid Icarus', 'Ice Climber', 'Excitebike', 'Duck Hunt',
          'Tetris', 'Dr Mario', 'Pac-Man', 'Galaga', 'Donkey Kong', 'Donkey Kong Jr',
          'Batman', 'Darkwing Duck', 'Gargoyle Quest', 'G.I. Joe', 'Jackal',
          'Metal Gear', 'Maniac Mansion', 'RC Pro-Am', 'Solar Jetman',
          'Rescue Rangers', 'TaleSpin', 'Adventure Island', 'Bomberman'],

    snes: ['Super Mario World', 'Super Mario All-Stars', 'Super Mario Kart', 'Super Mario RPG',
           'Zelda Link to the Past', 'Super Metroid', 'Chrono Trigger',
           'Final Fantasy VI', 'Final Fantasy IV', 'Secret of Mana', 'EarthBound',
           'Donkey Kong Country', 'Donkey Kong Country 2', 'Donkey Kong Country 3',
           'Mega Man X', 'Mega Man X2', 'Mega Man X3', 'Contra III',
           'Super Castlevania IV', 'Street Fighter II', 'Super Street Fighter II',
           'Mortal Kombat', 'Mortal Kombat II', 'NBA Jam', 'Killer Instinct',
           'Kirby Super Star', 'Kirby Dream Land 3', 'Star Fox', 'F-Zero',
           'Pilot Wings', 'ActRaiser', 'Super Ghouls Ghosts', 'Zombies Ate My Neighbors',
           'TMNT Turtles in Time', 'Aladdin', 'Lion King', 'Breath of Fire',
           'Illusion of Gaia', 'Soul Blazer', 'Lufia', 'Wild Guns',
           'Super Punch-Out', 'Battletoads Double Dragon', 'Sunset Riders',
           'Gradius III', 'R-Type III', 'Axelay', 'Rock N Roll Racing',
           'Lost Vikings', 'Super Bomberman', 'Super Bomberman 2', 'Harvest Moon',
           'Ogre Battle', 'Front Mission', 'Seiken Densetsu', 'Pocky Rocky'],

    genesis: ['Sonic the Hedgehog', 'Sonic the Hedgehog 2', 'Sonic the Hedgehog 3',
              'Sonic and Knuckles', 'Sonic Spinball',
              'Streets of Rage', 'Streets of Rage 2', 'Streets of Rage 3',
              'Golden Axe', 'Golden Axe II', 'Golden Axe III',
              'Gunstar Heroes', 'Dynamite Headdy', 'Alien Soldier',
              'Phantasy Star II', 'Phantasy Star IV', 'Shining Force', 'Shining Force II',
              'Shinobi III', 'Shadow Dancer', 'Revenge of Shinobi',
              'Vectorman', 'Vectorman 2', 'Comix Zone', 'Ristar',
              'Earthworm Jim', 'Earthworm Jim 2', 'ToeJam Earl',
              'Ecco the Dolphin', 'Castlevania Bloodlines', 'Contra Hard Corps',
              'Rocket Knight Adventures', 'Sparkster', 'Aladdin', 'Lion King',
              'Road Rash', 'Road Rash II', 'Mortal Kombat', 'Mortal Kombat II',
              'NBA Jam', 'Madden NFL', 'NHL 94', 'Altered Beast',
              'Landstalker', 'Beyond Oasis', 'Wonder Boy', 'MUSHA', 'Thunder Force IV'],

    gba: ['Pokemon FireRed', 'Pokemon Emerald', 'Pokemon LeafGreen', 'Pokemon Ruby', 'Pokemon Sapphire',
          'Metroid Fusion', 'Metroid Zero Mission', 'Castlevania Aria of Sorrow',
          'Castlevania Circle of the Moon', 'Castlevania Harmony of Dissonance',
          'Mega Man Zero', 'Mega Man Zero 2', 'Mega Man Battle Network',
          'Golden Sun', 'Golden Sun The Lost Age', 'Fire Emblem', 'Fire Emblem Sacred Stones',
          'Advance Wars', 'Advance Wars 2', 'Tactics Ogre',
          'Final Fantasy VI Advance', 'Final Fantasy Tactics Advance',
          'Mario Kart Super Circuit', 'Super Mario World', 'Super Mario Advance',
          'Zelda Minish Cap', 'Zelda A Link to the Past', 'Kirby Nightmare in Dreamland',
          'Donkey Kong Country', 'Wario Land', 'Mother 3',
          'F-Zero Maximum Velocity', 'Tony Hawk', 'Street Fighter Alpha', 'Sonic Advance'],

    gb: ['Tetris', 'Super Mario Land', 'Super Mario Land 2', 'Kirby Dream Land',
         'Legend of Zelda Links Awakening', 'Metroid II', 'Pokemon Red', 'Pokemon Blue',
         'Pokemon Yellow', 'Pokemon Gold', 'Pokemon Silver',
         'Mega Man Dr Wily', 'Mega Man II', 'Mega Man III', 'Mega Man IV', 'Mega Man V',
         'Castlevania Legends', 'Castlevania Adventure', 'Donkey Kong Land',
         'Donkey Kong Land 2', 'Wario Land', 'Wario Land II',
         'Final Fantasy Adventure', 'Final Fantasy Legend', 'Final Fantasy Legend II',
         'Double Dragon', 'Battletoads', 'Contra', 'Ninja Gaiden Shadow',
         'Solar Striker', 'Balloon Kid', 'Trip World', 'Alleyway'],

    gbc: ['Dragon Warrior Monsters', 'Dragon Warrior Monsters 2',
          'Metal Gear Solid', 'Bionic Commando Elite Forces',
          'Alone in the Dark New Nightmare', 'Perfect Dark',
          'Crystalis', 'Shantae', 'Dragon Warrior Monsters'],

    sms: ['Sonic the Hedgehog', 'Sonic the Hedgehog 2', 'Alex Kidd',
          'Wonder Boy', 'Golden Axe Warrior', 'R-Type', 'OutRun',
          'Phantasy Star', 'Double Dragon', 'Shinobi', 'After Burner'],

    gamegear: ['Sonic the Hedgehog', 'Sonic the Hedgehog 2', 'Sonic Triple Trouble',
               'Columns', 'Shinobi', 'Shinobi II', 'Streets of Rage',
               'Mortal Kombat', 'Mortal Kombat II', 'Earthworm Jim',
               'Baku Baku', 'Ristar', 'Dragon Crystal', 'Wonder Boy'],

    tg16: ['Bonk Adventure', 'Bonk Revenge', 'Splatterhouse',
           'R-Type', 'Blazing Lazers', 'Galaga 90', 'Fantasy Zone',
           'Neutopia', 'Neutopia II', 'Dungeon Explorer', 'Gate of Thunder',
           'Lords of Thunder', 'Ys Book I II', 'Castlevania Rondo of Blood'],

    atari2600: ['Pitfall', 'Pitfall II', 'Space Invaders', 'Pac-Man',
                'Asteroids', 'Centipede', 'Missile Command', 'Breakout',
                'Adventure', 'Combat', 'River Raid', 'Yars Revenge',
                'Demon Attack', 'Kaboom', 'Enduro', 'Haunted House',
                'Jungle Hunt', 'Boxing', 'Freeway', 'Frogger',
                'Donkey Kong', 'Mario Bros', 'Dig Dug', 'Popeye',
                'Q-Bert', 'Phoenix', 'Berzerk', 'Defender', 'Joust'],

    atari7800: ['Centipede', 'Joust', 'Ms Pac-Man', 'Asteroids', 'Dig Dug',
                'Galaga', 'Pole Position', 'Ballblazer', 'Robotron',
                'Food Fight', 'Xevious', 'Double Dragon', 'Commando'],

    lynx: ['Chip Dale', 'Batman Returns', 'Gauntlet', 'Klax',
           'Shanghai', 'Rampage', 'Paperboy', 'Ms Pac-Man',
           'Blue Lightning', 'Rygar', 'Todd Slaughter', 'Hydra'],

    ngp: ['Sonic', 'Puzzle Bobble', 'Metal Slug First Mission', 'Metal Slug Second Mission',
          'SNK vs Capcom', 'King of Fighters', 'Fatal Fury', 'Samurai Shodown',
          'Last Blade', 'Dark Arms', 'Evolution'],

    wonderswan: ['Final Fantasy', 'Gunpey', 'Digimon',
                 'Beatmania', 'Rockman and Forte'],

    vb: ['Mario Tennis', 'Wario Land', 'Teleroboxer', 'Galactic Pinball',
         'Red Alarm', 'Jack Bros', 'Golf', 'Mario Clash'],

    coleco: ['Donkey Kong', 'Zaxxon', 'Venture', 'Mouse Trap',
             'Q-Bert', 'Frogger', 'Turbo', 'Smurfs', 'Cabbage Patch'],

    '32x': ['Knuckles Chaotix', 'Virtua Fighter', 'Virtua Racing',
            'Space Harrier', 'After Burner Complete', 'Star Wars Arcade',
            'Doom', 'Wolfenstein 3D', 'Metal Head', 'NBA Jam TE'],
};

// ─── HTTP helpers ────────────────────────────────────────────────────────────
function fetchUrl(url, opts = {}) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http;
        const req = proto.get(url, { headers: { 'User-Agent': 'YourWorldArcade/1.0' }, timeout: 30000, ...opts }, res => {
            if ([301,302,307].includes(res.statusCode)) {
                res.resume();
                return fetchUrl(res.headers.location, opts).then(resolve).catch(reject);
            }
            resolve(res);
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function fetchJSON(url) {
    return new Promise(async (resolve, reject) => {
        try {
            const res = await fetchUrl(url);
            if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
        } catch(e) { reject(e); }
    });
}

function downloadFile(url, dest, maxMB = 300) {
    return new Promise(async (resolve, reject) => {
        try {
            const res = await fetchUrl(url, { timeout: 120000 });
            if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
            const maxBytes = maxMB * 1024 * 1024;
            const len = parseInt(res.headers['content-length'] || '0');
            if (len > maxBytes) { res.destroy(); return reject(new Error(`Too large: ${(len/1024/1024).toFixed(0)}MB`)); }
            let got = 0;
            const file = fs.createWriteStream(dest);
            res.on('data', chunk => {
                got += chunk.length;
                if (got > maxBytes) { res.destroy(); file.close(); try { fs.unlinkSync(dest); } catch{} reject(new Error('Exceeded size limit')); return; }
                if (len > 0) process.stdout.write(`\r    ${((got/len)*100).toFixed(0)}% (${(got/1024/1024).toFixed(1)}MB)     `);
            });
            res.pipe(file);
            file.on('finish', () => { file.close(); process.stdout.write('\r' + ' '.repeat(50) + '\r'); resolve(got); });
            file.on('error', e => { try { fs.unlinkSync(dest); } catch{} reject(e); });
        } catch(e) { reject(e); }
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── archive.org helpers ──────────────────────────────────────────────────────
async function getArchiveFiles(archiveId, allowedExts) {
    const url = `https://archive.org/metadata/${archiveId}/files`;
    const data = await fetchJSON(url);
    const files = (data.result || []).filter(f => {
        const ext = path.extname(f.name || '').toLowerCase();
        return allowedExts.includes(ext) && !isJunk(f.name || '');
    });
    return files.map(f => ({ ...f, archiveId }));
}

async function searchArchive(query) {
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=downloads&rows=20&output=json`;
    const data = await fetchJSON(url);
    return (data.response?.docs || []).sort((a,b) => (b.downloads||0)-(a.downloads||0));
}

// ─── Matching ─────────────────────────────────────────────────────────────────
function norm(s) { return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim(); }

function isJunk(name) {
    const l = name.toLowerCase();
    return ['(beta', '(proto', '(sample', '(demo', '(pirate', '(hack', '(bad', '(pd)', '(unl)'].some(j => l.includes(j));
}

function regionScore(name) {
    const l = name.toLowerCase();
    if (l.includes('(usa') || l.includes('(u)') || l.includes('(world')) return 3;
    if (l.includes('(europe') || l.includes('(e)')) return 2;
    return 0;
}

function matches(gameName, fileName) {
    const gWords = norm(gameName).split(' ').filter(w => w.length > 2);
    const fNorm  = norm(fileName);
    if (gWords.length === 0) return false;
    const matched = gWords.filter(w => fNorm.includes(w)).length;
    return matched === gWords.length || (gWords.length >= 4 && matched / gWords.length >= 0.8);
}

// ─── 401 tracker — archives that reject downloads ────────────────────────────
const badArchives = new Set();

async function tryDownload(f, dest) {
    if (badArchives.has(f.archiveId)) throw new Error('Archive blocked (401)');
    // Use basename for local file (handles subdir paths like "A/Game.zip")
    const localName = path.basename(f.name);
    const localDest = path.join(path.dirname(dest), localName);
    const url = `https://archive.org/download/${f.archiveId}/${f.name.split('/').map(encodeURIComponent).join('/')}`;
    try {
        await downloadFile(url, localDest);
        return localDest;
    } catch(e) {
        if (e.message.includes('401')) {
            badArchives.add(f.archiveId);
            console.log(`  ⚠ ${f.archiveId} returned 401 — blacklisting, will try next archive`);
        }
        throw e;
    }
}

// ─── Core fill logic ─────────────────────────────────────────────────────────
async function fillSystem(sysId) {
    const sys = SOURCES[sysId];
    if (!sys) { console.log(`  Unknown system: ${sysId}`); return; }

    const romDir = path.join(ROMS_DIR, sysId);
    fs.mkdirSync(romDir, { recursive: true });

    const existing = new Set(fs.readdirSync(romDir).map(f => f.toLowerCase()));
    const needed   = sys.target - existing.size;

    if (needed <= 0) {
        console.log(`  ${sys.name}: already at ${existing.size} / ${sys.target} ✓`);
        return;
    }

    console.log(`\n  ━━ ${sys.name} (${sysId}) — have ${existing.size}, need ${needed} more ━━`);
    if (DRY_RUN) { console.log(`  [DRY RUN] Would download up to ${needed} ROMs`); return; }

    // Build file index — try each archive, accumulate until we have enough
    let allFiles = [];
    for (const archId of sys.archives) {
        if (badArchives.has(archId)) continue;
        process.stdout.write(`  Scanning ${archId}... `);
        try {
            const files = await getArchiveFiles(archId, sys.ext);
            console.log(`${files.length} ROMs`);
            if (files.length > 5) { allFiles.push(...files); break; } // stop at first working archive with real content
            else if (files.length > 0) allFiles.push(...files);
            await sleep(DELAY_MS);
        } catch(e) {
            console.log(`failed (${e.message})`);
        }
    }

    // Fallback: search archive.org
    if (allFiles.length === 0) {
        console.log(`  No files from known archives. Searching archive.org...`);
        try {
            const results = await searchArchive(`${sys.name} roms complete set`);
            for (const r of results.slice(0, 5)) {
                process.stdout.write(`  Trying ${r.identifier}... `);
                try {
                    const files = await getArchiveFiles(r.identifier, sys.ext);
                    console.log(`${files.length} ROMs`);
                    if (files.length > 10) { allFiles.push(...files); break; }
                } catch(e) { console.log(`failed`); }
                await sleep(DELAY_MS);
            }
        } catch(e) { console.log(`  Search failed: ${e.message}`); }
    }

    if (allFiles.length === 0) {
        console.log(`  ✗ No archive files found for ${sysId}. Try manually.`);
        return;
    }

    console.log(`  Archive index: ${allFiles.length} files`);

    // Phase 1: Greatest hits — download curated list first
    const hits = GREATEST_HITS[sysId] || [];
    let downloaded = 0;

    console.log(`  Phase 1: Greatest hits (${hits.length} titles)...`);
    for (const gameName of hits) {
        if (downloaded >= needed) break;
        const alreadyHave = [...existing].some(f => matches(gameName, f));
        if (alreadyHave) continue;

        const candidates = allFiles.filter(f => matches(gameName, f.name || ''));
        if (candidates.length === 0) continue;

        candidates.sort((a,b) => regionScore(b.name) - regionScore(a.name));
        const best = candidates[0];
        const localName = path.basename(best.name);
        const dest = path.join(romDir, localName);
        if (fs.existsSync(dest)) { existing.add(localName.toLowerCase()); continue; }

        try {
            process.stdout.write(`  [${existing.size + downloaded + 1}] ${gameName}\n    -> ${localName}\n`);
            const saved = await tryDownload(best, dest);
            const stat = fs.statSync(saved);
            if (stat.size < 200) { fs.unlinkSync(saved); throw new Error('Too small'); }
            console.log(`    ✓ (${(stat.size/1024/1024).toFixed(1)}MB)`);
            downloaded++;
            existing.add(localName.toLowerCase());
        } catch(e) {
            console.log(`    ✗ ${e.message}`);
            try { if (fs.existsSync(dest)) fs.unlinkSync(dest); } catch{}
            // If this archive is now blacklisted, no point continuing Phase 1 with it
            if (badArchives.has(best.archiveId)) break;
        }
        await sleep(DELAY_MS);
    }

    // Phase 2: Fill to target — grab top USA/World games alphabetically
    if (downloaded < needed) {
        const stillNeed = needed - downloaded;
        console.log(`\n  Phase 2: Fill ${stillNeed} more slots (bulk)...`);

        // Sort remaining archive files: USA first, then alphabetically
        const usedNames = new Set([...existing].map(f => f.toLowerCase()));
        const remaining = allFiles
            .filter(f => !usedNames.has((f.name || '').toLowerCase()))
            .sort((a,b) => {
                const rd = regionScore(b.name) - regionScore(a.name);
                if (rd !== 0) return rd;
                return (a.name || '').localeCompare(b.name || '');
            });

        let filled = 0;
        for (const f of remaining) {
            if (filled >= stillNeed) break;
            try {
                const shortName = localName.slice(0, 50).replace(/\.[^.]+$/, '');
                process.stdout.write(`  [${existing.size + downloaded + filled + 1}] ${shortName}\n`);
                const saved = await tryDownload(f, dest);
                const stat = fs.statSync(saved);
                if (stat.size < 200) { fs.unlinkSync(saved); continue; }
                console.log(`    ✓ (${(stat.size/1024/1024).toFixed(1)}MB)`);
                filled++;
            } catch(e) {
                try { if (fs.existsSync(dest)) fs.unlinkSync(dest); } catch{}
                if (badArchives.has(f.archiveId)) break; // skip rest of this archive
            }
            await sleep(DELAY_MS);
        }
        downloaded += filled;
    }

    const finalCount = fs.readdirSync(romDir).length;
    const status = finalCount >= sys.target ? '✓ DONE' : `${finalCount}/${sys.target}`;
    console.log(`\n  ${sys.name}: ${finalCount} ROMs total [${status}]`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    const allSystems = Object.keys(SOURCES).filter(id => !SKIP.has(id));
    const toProcess  = CLI_SYSTEMS.filter(s => !s.startsWith('-')).length > 0
        ? CLI_SYSTEMS.filter(s => !s.startsWith('-') && SOURCES[s])
        : allSystems;

    console.log('\n══════════════════════════════════════════════');
    console.log('  Your World Arcade — ROM Fill System');
    console.log('══════════════════════════════════════════════');
    console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : CHECK ? 'CHECK ONLY' : 'DOWNLOAD'}`);
    console.log(`  Systems: ${toProcess.join(', ')}\n`);

    if (CHECK) {
        // Just show counts
        console.log('  System            Have  Target  Status');
        console.log('  ' + '─'.repeat(44));
        for (const id of toProcess) {
            const sys = SOURCES[id];
            const dir = path.join(ROMS_DIR, id);
            const count = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
            const pct   = Math.min(100, Math.round(count / sys.target * 100));
            const bar   = ('█'.repeat(Math.round(pct/5)) + '░'.repeat(20-Math.round(pct/5)));
            const done  = count >= sys.target ? '✓' : `needs ${sys.target - count}`;
            console.log(`  ${sys.name.padEnd(16)} ${String(count).padStart(4)}  ${String(sys.target).padStart(6)}  ${done}`);
        }
        return;
    }

    let totalAdded = 0;
    for (const sysId of toProcess) {
        const before = fs.existsSync(path.join(ROMS_DIR, sysId))
            ? fs.readdirSync(path.join(ROMS_DIR, sysId)).length : 0;
        await fillSystem(sysId);
        const after = fs.existsSync(path.join(ROMS_DIR, sysId))
            ? fs.readdirSync(path.join(ROMS_DIR, sysId)).length : 0;
        totalAdded += (after - before);
    }

    console.log('\n══════════════════════════════════════════════');
    console.log(`  Total ROMs added this run: ${totalAdded}`);
    console.log('  Run "node server/scripts/rom-stats.js" for full report');
    console.log('══════════════════════════════════════════════\n');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
