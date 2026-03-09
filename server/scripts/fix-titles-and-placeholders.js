#!/usr/bin/env node
/**
 * FIX TITLES & PLACEHOLDERS
 * 1. Populate metadata.title for all 997+ ROMs missing titles
 *    - MAME/Neo Geo/FBNeo: Use MAME_NAMES shortname→title mapping
 *    - Console games: Use clean_name as title (already human-readable)
 * 2. Convert 185 SVG placeholder files (saved as .png) to actual PNG images
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const DB_PATH = path.join(ROOT, 'mollys-arcade.db');
const ARTWORK_DIR = process.env.ARCADE_ARTWORK_DIR || path.join(ROOT, 'artwork');

// ══════════════════════════════════════════════════════════════
// MAME SHORTNAME → FULL TITLE DATABASE
// ══════════════════════════════════════════════════════════════
const MAME_NAMES = {
    // ── Numbers ──
    '1941':      '1941 - Counter Attack',
    '1942':      '1942',
    '1943':      '1943 - The Battle of Midway',
    '1943kai':   '1943 Kai - Midway Kaisen',
    '1944':      '1944 - The Loop Master',
    '19xx':      '19XX - The War Against Destiny',
    '2020bb':    '2020 Super Baseball',
    '3countb':   '3 Count Bout',
    // ── A ──
    'aa':        'Armored Warriors',
    'absurd':    'Absurd',
    'ajax':      'Ajax',
    'alienar':   'Alien Arena',
    'alpaca8':   'Alpaca 8',
    'alpha1v':   'Alpha One',
    'alpham2':   'Alpha Mission II',
    'alpine':    'Alpine Ski',
    'altbeast':  'Altered Beast',
    'amidar':    'Amidar',
    'androdun':  'Andro Dunos',
    'aodk':      'Aggressors of Dark Kombat',
    'aof':       'Art of Fighting',
    'aof2':      'Art of Fighting 2',
    'aof3':      'Art of Fighting 3',
    'arabianm':  'Arabian Magic',
    'arkanoid':  'Arkanoid',
    'armdemo':   'Armed Demo',
    'asteroid':  'Asteroids',
    'astrob':    'Astro Blaster',
    'astrof':    'Astro Fighter',
    'asuka':     'Asuka & Asuka',
    'atarisy1':  'Marble Madness',
    'avsp':      'Alien vs. Predator',
    // ── B ──
    'b2b':       'Bang Bang Ball',
    'bace':      'Space Ace',
    'baddudes':  'Bad Dudes vs. DragonNinja',
    'bagman':    'Bagman',
    'bakatono':  'Bakatonosama Mahjong Manyuuki',
    'bangbead':  'Bang Bead',
    'bjourney':  "Blue's Journey",
    'blazstar':  'Blazing Star',
    'bombjack':  'Bomb Jack',
    'bosco':     'Bosconian',
    'breakers':  'Breakers',
    'breakrev':  'Breakers Revenge',
    'bstars':    'Baseball Stars Professional',
    'bstars2':   'Baseball Stars 2',
    'btime':     'Burger Time',
    'bublbobl':  'Bubble Bobble',
    'bublboblr': 'Bubble Bobble',
    'burningf':  'Burning Fight',
    // ── C ──
    'centiped':  'Centipede',
    'columnsn':  'Columns',
    'congo':     'Congo Bongo',
    'crimfght':  'Crime Fighters',
    'crsword':   'Crossed Swords',
    'ctomaday':  'Captain Tomaday',
    'cyberlip':  'Cyber-Lip',
    // ── D ──
    'darius2':   'Darius II',
    'dariusg':   'Darius Gaiden',
    'ddragon':   'Double Dragon',
    'ddragon2':  'Double Dragon II',
    'ddsom':     'Dungeons & Dragons - Shadow over Mystara',
    'digdug':    'Dig Dug',
    'dkong':     'Donkey Kong',
    'dkong3':    'Donkey Kong 3',
    'dkongjr':   'Donkey Kong Junior',
    'doubledr':  'Double Dragon',
    'dstlk':     'Darkstalkers',
    // ── E ──
    'eightman':  'Eight Man',
    // ── F ──
    'fatfursp':  'Fatal Fury Special',
    'fatfury1':  'Fatal Fury',
    'fatfury2':  'Fatal Fury 2',
    'fatfury3':  'Fatal Fury 3',
    'fbfrenzy':  'Football Frenzy',
    'fightfev':  'Fight Fever',
    'flipshot':  'Battle Flip Shot',
    'foodf':     'Food Fight',
    // ── G ──
    'galaga3':   'Gaplus',
    'galaxyfg':  'Galaxy Fight',
    'ganryu':    'Ganryu',
    'garou':     'Garou - Mark of the Wolves',
    'garoupy':   'Garou - Mark of the Wolves',
    'ghouls':    "Ghouls'n Ghosts",
    'gng':       "Ghosts'n Goblins",
    'goalx3':    'Goal! Goal! Goal!',
    'gowcaizr':  'Voltage Fighter - Gowcaizer',
    'gpilots':   'Ghost Pilots',
    'gradius2':  'Gradius II',
    'gradius3':  'Gradius III',
    'gunsmoke':  'Gun.Smoke',
    'gururin':   'Gururin',
    // ── I ──
    'invaders':  'Space Invaders',
    'irrmaze':   'The Irritating Maze',
    // ── J ──
    'jackal':    'Jackal',
    'janshin':   'Janshin Densetsu',
    'jockeygp':  'Jockey Grand Prix',
    'journey':   'Journey',
    'joyjoy':    'Puzzled',
    // ── K ──
    'kabukikl':  'Kabuki Klash',
    'kangaroo':  'Kangaroo',
    'karnovr':   "Karnov's Revenge",
    'kinst':     'Killer Instinct',
    'kizuna':    'Kizuna Encounter',
    'kof2000':   'The King of Fighters 2000',
    'kof2001':   'The King of Fighters 2001',
    'kof2002':   'The King of Fighters 2002',
    'kof2003':   'The King of Fighters 2003',
    'kof94':     "The King of Fighters '94",
    'kof95':     "The King of Fighters '95",
    'kof96':     "The King of Fighters '96",
    'kof97':     "The King of Fighters '97",
    'kof98':     "The King of Fighters '98",
    'kof99':     "The King of Fighters '99",
    'kof99hp':   "The King of Fighters '99",
    'kotm':      'King of the Monsters',
    'kotm2':     'King of the Monsters 2',
    'kungfum':   'Kung-Fu Master',
    // ── L ──
    'ladybug':   'Lady Bug',
    'lastblad':  'The Last Blade',
    'lastbld2':  'The Last Blade 2',
    'lbowling':  'League Bowling',
    'legendos':  'Legend of Success Joe',
    'lifefrce':  'Lifeforce',
    'lresort':   'Last Resort',
    // ── M ──
    'magdrop2':  'Magical Drop II',
    'magdrop3':  'Magical Drop III',
    'maglord':   'Magician Lord',
    'mahretsu':  'Mahjong Kyo Retsuden',
    'mappy':     'Mappy',
    'marukodq':  'Chibi Maruko-chan Deluxe Quiz',
    'matrim':    'Matrimelee',
    'miexchng':  'Money Idol Exchanger',
    'milliped':  'Millipede',
    'minasan':   "Minasan no Okagesamadesu!",
    'missile':   'Missile Command',
    'mooncrst':  'Moon Cresta',
    'mosyougi':  "Syougi No Tatsujin",
    'mrdo':      'Mr. Do!',
    'msh':       'Marvel Super Heroes',
    'mshvsf':    'Marvel Super Heroes vs. Street Fighter',
    'mslug':     'Metal Slug',
    'mslug2':    'Metal Slug 2',
    'mslug3':    'Metal Slug 3',
    'mslug4':    'Metal Slug 4',
    'mslug5':    'Metal Slug 5',
    'mslugx':    'Metal Slug X',
    'mspacman':  'Ms. Pac-Man',
    'mutnat':    'Mutation Nation',
    'mvsc':      'Marvel vs. Capcom',
    // ── N ──
    'nam1975':   'NAM-1975',
    'nbajam':    'NBA Jam',
    'ncombat':   'Ninja Combat',
    'ncommand':  'Ninja Commando',
    'nemesis':   'Nemesis',
    'neobombe':  'Neo Bomberman',
    'neocup98':  "Neo-Geo Cup '98",
    'neodrift':  'Neo Drift Out',
    'neogeo':    'Neo-Geo',
    'neomrdo':   'Neo Mr. Do!',
    'neopong':   'Neo Pong',
    'ngtetris':  'Neo Geo Tetris',
    'ninjamas':  "Ninja Master's",
    'nitd':      'Nightmare in the Dark',
    // ── O ──
    'outrunb':   'Out Run',
    'overtop':   'Over Top',
    // ── P ──
    'pacman':    'Pac-Man',
    'panicbom':  'Panic Bomber',
    'parodius':  'Parodius Da!',
    'pbobble':   'Puzzle Bobble',
    'pbobble2':  'Puzzle Bobble 2',
    'pbobbl2n':  'Puzzle Bobble 2',
    'pbobblen':  'Puzzle Bobble',
    'pengo':     'Pengo',
    'pgoal':     'Pleasure Goal',
    'pnyaa':     'Pochi and Nyaa',
    'pong':      'Pong',
    'pooyan':    'Pooyan',
    'popbounc':  "Pop'n Bounce",
    'popeye':    'Popeye',
    'ppong':     'Power Pong',
    'preisle2':  'Prehistoric Isle 2',
    'pspikes2':  'Power Spikes II',
    'pulstar':   'Pulstar',
    'punisher':  'The Punisher',
    'punkshot':  'Punk Shot',
    'puyopuyo':  'Puyo Puyo',
    'puzzledp':  'Puzzle De Pon!',
    'puzzldpr':  'Puzzle De Pon! R',
    // ── Q ──
    'qbert':     "Q*bert",
    'quizdai2':  'Quiz Daisousa Sen 2',
    'quizdais':  'Quiz Daisousa Sen',
    'quizkof':   'Quiz King of Fighters',
    // ── R ──
    'ragnagrd':  'Ragnagard',
    'raiden2':   'Raiden II',
    'rallyx':    'Rally-X',
    'rbff1':     'Real Bout Fatal Fury',
    'rbff1a':    'Real Bout Fatal Fury',
    'rbff2':     'Real Bout Fatal Fury 2',
    'rbffspec':  'Real Bout Fatal Fury Special',
    'rbisland':  'Rainbow Islands',
    'ridhero':   'Riding Hero',
    'roboarmy':  'Robo Army',
    'rotd':      'Rage of the Dragons',
    'rtype':     'R-Type',
    'rtype2':    'R-Type II',
    // ── S ──
    's1945p':    'Strikers 1945 Plus',
    'salamand':  'Salamander',
    'samsh5sp':  'Samurai Shodown V Special',
    'samsho':    'Samurai Shodown',
    'samsho2':   'Samurai Shodown II',
    'samsho3':   'Samurai Shodown III',
    'samsho4':   'Samurai Shodown IV',
    'samsho5':   'Samurai Shodown V',
    'savagere':  'Savage Reign',
    'sdodgeb':   'Super Dodge Ball',
    'sengoku':   'Sengoku',
    'sengoku2':  'Sengoku 2',
    'sengoku3':  'Sengoku 3',
    'sf2':       'Street Fighter II',
    'sf2ce':     "Street Fighter II' - Champion Edition",
    'sf2thndr':  "Street Fighter II' Turbo - Hyper Fighting",
    'sfa':       'Street Fighter Alpha',
    'sfa2':      'Street Fighter Alpha 2',
    'sfa3':      'Street Fighter Alpha 3',
    'shocktro':  'Shock Troopers',
    'shocktr2':  'Shock Troopers - 2nd Squad',
    'simpsons':  'The Simpsons',
    'snowbros':  'Snow Bros.',
    'socbrawl':  'Soccer Brawl',
    'sonicwi2':  'Aero Fighters 2',
    'sonicwi3':  'Aero Fighters 3',
    'spinmast':  'Spin Master',
    'ssf2':      'Super Street Fighter II',
    'ssf2t':     'Super Street Fighter II Turbo',
    'ssideki':   'Super Sidekicks',
    'ssideki2':  'Super Sidekicks 2',
    'ssideki3':  'Super Sidekicks 3',
    'ssideki4':  'The Ultimate 11',
    'stakwin':   'Stakes Winner',
    'stakwin2':  'Stakes Winner 2',
    'stargate':  'Stargate',
    'strhoop':   'Street Hoop',
    'strider':   'Strider',
    'superspy':  'The Super Spy',
    'svc':       'SVC Chaos - SNK vs. Capcom',
    // ── T ──
    'thunderx':  'Thunder Cross',
    'timeplt':   'Time Pilot',
    'tmnt':      'Teenage Mutant Ninja Turtles',
    'tmnt2':     'Teenage Mutant Ninja Turtles - Turtles in Time',
    'tmnti':     'Teenage Mutant Ninja Turtles',
    'todruaga':  'The Tower of Druaga',
    'tophuntr':  'Top Hunter',
    'tpgolf':    "Top Player's Golf",
    'trally':    'Thrash Rally',
    'turfmast':  'Neo Turf Masters',
    'tutankhm':  'Tutankham',
    'twinspri':  'Twinkle Star Sprites',
    'tws96':     "Tecmo World Soccer '96",
    // ── V ──
    'varth':     'Varth',
    'venture':   'Venture',
    'viewpoin':  'Viewpoint',
    // ── W ──
    'wakuwak7':  'Waku Waku 7',
    'wh1':       'World Heroes',
    'wh2':       'World Heroes 2',
    'wh2j':      'World Heroes 2 Jet',
    'whp':       'World Heroes Perfect',
    'wjammers':  'Windjammers',
    'wwfmania':  'WWF WrestleMania',
    'wwfwfest':  'WWF WrestleFest',
    // ── X ──
    'xmcota':    'X-Men - Children of the Atom',
    'xmen':      'X-Men',
    'xmvsf':     'X-Men vs. Street Fighter',
    // ── Z ──
    'zedblade':  'Zed Blade',
    'zintrckb':  'Zintricks',
    'zupapa':    'Zupapa!',
};

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  🔧 FIX TITLES & PLACEHOLDERS                       ║');
    console.log('║  Phase 1: Populate metadata.title for all ROMs      ║');
    console.log('║  Phase 2: Convert SVG placeholders to real PNGs     ║');
    console.log('╚══════════════════════════════════════════════════════╝');

    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // ════════════════════════════════════════════════
    // PHASE 1: POPULATE TITLES
    // ════════════════════════════════════════════════
    console.log('\n📝 PHASE 1: Populating metadata titles...\n');

    const allRoms = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.system_id, m.title, m.artwork_path
        FROM roms r
        LEFT JOIN metadata m ON m.rom_id = r.id
    `).all();

    const isMameSystem = new Set(['arcade', 'neogeo', 'fbneo']);

    // Prepare upsert statement
    const upsertTitle = db.prepare(`
        INSERT INTO metadata (rom_id, title, metadata_source, fetched_at)
        VALUES (?, ?, 'title-fix', datetime('now'))
        ON CONFLICT(rom_id) DO UPDATE SET title = ?, fetched_at = datetime('now')
        WHERE title IS NULL OR title = ''
    `);

    let titlesFixed = 0;
    let titlesSkipped = 0;
    let titlesMissing = 0;

    const tx = db.transaction(() => {
        for (const rom of allRoms) {
            // Skip if already has a real title
            if (rom.title && rom.title.trim() !== '') {
                titlesSkipped++;
                continue;
            }

            let newTitle;

            if (isMameSystem.has(rom.system_id)) {
                // MAME/Neo Geo/FBNeo: Look up in mapping
                newTitle = MAME_NAMES[rom.clean_name];
                if (!newTitle) {
                    // Fallback: try to make clean_name presentable
                    // e.g. "sf2ce" stays as-is but "dkong" → use mapping or leave clean_name
                    newTitle = prettifyMameName(rom.clean_name);
                    titlesMissing++;
                }
            } else {
                // Console games: clean_name is already human-readable
                newTitle = rom.clean_name;
            }

            if (newTitle) {
                upsertTitle.run(rom.id, newTitle, newTitle);
                titlesFixed++;
            }
        }
    });
    tx();

    console.log(`  ✅ Titles fixed: ${titlesFixed}`);
    console.log(`  ⏭️  Already had title: ${titlesSkipped}`);
    if (titlesMissing > 0) {
        console.log(`  ⚠️  MAME games not in mapping (used prettified name): ${titlesMissing}`);
    }

    // Show some MAME title samples
    const mameSamples = db.prepare(`
        SELECT r.clean_name, m.title, r.system_id
        FROM roms r JOIN metadata m ON m.rom_id = r.id
        WHERE r.system_id IN ('arcade','neogeo','fbneo')
        ORDER BY RANDOM() LIMIT 15
    `).all();
    console.log('\n  Sample MAME titles:');
    for (const s of mameSamples) {
        console.log(`    ${s.clean_name} → "${s.title}"`);
    }

    // ════════════════════════════════════════════════
    // PHASE 2: CONVERT SVG PLACEHOLDERS TO REAL PNGs
    // ════════════════════════════════════════════════
    console.log('\n\n🎨 PHASE 2: Converting SVG placeholders to real PNGs...\n');

    // Find all SVG files masquerading as PNG
    let svgCount = 0;
    let convertedCount = 0;
    let failedCount = 0;

    const artworkSystems = fs.readdirSync(ARTWORK_DIR).filter(d => {
        const p = path.join(ARTWORK_DIR, d);
        return fs.statSync(p).isDirectory();
    });

    for (const sysDir of artworkSystems) {
        const sysPath = path.join(ARTWORK_DIR, sysDir);
        const files = fs.readdirSync(sysPath).filter(f => f.endsWith('.png'));

        for (const file of files) {
            const filePath = path.join(sysPath, file);
            const stat = fs.statSync(filePath);
            if (stat.size > 50000) continue; // Real PNGs are usually larger

            // Quick check: read first bytes to see if it's SVG
            const head = fs.readFileSync(filePath, 'utf8').substring(0, 100);
            if (!head.includes('<svg') && !head.includes('<?xml')) continue;

            svgCount++;
            try {
                const svgContent = fs.readFileSync(filePath, 'utf8');
                // Convert SVG to PNG using sharp
                const pngBuffer = await sharp(Buffer.from(svgContent))
                    .resize(320, 240, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .png()
                    .toBuffer();

                fs.writeFileSync(filePath, pngBuffer);
                convertedCount++;

                if (convertedCount % 25 === 0) {
                    console.log(`  ... converted ${convertedCount}/${svgCount} so far`);
                }
            } catch (err) {
                console.error(`  ❌ Failed: ${sysDir}/${file}: ${err.message}`);
                failedCount++;
            }
        }
    }

    console.log(`\n  ✅ SVG→PNG converted: ${convertedCount}`);
    if (failedCount > 0) console.log(`  ❌ Failed: ${failedCount}`);

    // ════════════════════════════════════════════════
    // FINAL REPORT
    // ════════════════════════════════════════════════
    console.log('\n\n📊 FINAL REPORT');
    console.log('═'.repeat(50));

    const totalRoms = db.prepare('SELECT COUNT(*) as cnt FROM roms').get().cnt;
    const withTitle = db.prepare("SELECT COUNT(*) as cnt FROM roms r JOIN metadata m ON r.id = m.rom_id WHERE m.title IS NOT NULL AND m.title != ''").get().cnt;
    const withArt = db.prepare("SELECT COUNT(*) as cnt FROM roms r JOIN metadata m ON r.id = m.rom_id WHERE m.artwork_path IS NOT NULL AND m.artwork_path != ''").get().cnt;

    console.log(`  Total ROMs:      ${totalRoms}`);
    console.log(`  With titles:     ${withTitle}/${totalRoms} (${Math.round(withTitle/totalRoms*100)}%)`);
    console.log(`  With artwork:    ${withArt}/${totalRoms} (${Math.round(withArt/totalRoms*100)}%)`);
    console.log(`  SVGs converted:  ${convertedCount}`);
    console.log('═'.repeat(50));

    // Verify no more SVG files
    let remainingSvg = 0;
    for (const sysDir of artworkSystems) {
        const sysPath = path.join(ARTWORK_DIR, sysDir);
        const files = fs.readdirSync(sysPath).filter(f => f.endsWith('.png'));
        for (const file of files) {
            const filePath = path.join(sysPath, file);
            const stat = fs.statSync(filePath);
            if (stat.size < 50000) {
                const head = fs.readFileSync(filePath, 'utf8').substring(0, 50);
                if (head.includes('<svg') || head.includes('<?xml')) remainingSvg++;
            }
        }
    }
    if (remainingSvg > 0) {
        console.log(`  ⚠️  Remaining SVG-as-PNG files: ${remainingSvg}`);
    } else {
        console.log(`  ✅ All artwork files are real PNGs!`);
    }

    db.close();
    console.log('\n🎉 Done! Restart the server to see changes.');
}

/**
 * Best-effort prettification of a MAME shortname not in our mapping.
 * e.g. "dkong" → "Dkong", "sf2ce" → "Sf2ce"
 * Not perfect but better than the raw ROM shortname.
 */
function prettifyMameName(shortname) {
    // Try splitting on common delimiters
    let name = shortname
        .replace(/([a-z])(\d)/g, '$1 $2')    // "sf2" → "sf 2"
        .replace(/(\d)([a-z])/g, '$1 $2')    // "2ce" → "2 ce"
        .replace(/_/g, ' ');

    // Title case each word
    name = name.split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

    return name;
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
