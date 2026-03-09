#!/usr/bin/env node
/**
 * ARTWORK BLITZ — Operation Art Heist
 * Louvre-level aggressive artwork scraper for 100% coverage
 *
 * Phase 1: MAME/Neo Geo/FBNeo shortname → full title mapping + CDN download
 * Phase 2: Console game CDN directory scraping + smart matching
 * Phase 3: Styled SVG placeholder generation for anything remaining
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const DB_PATH = path.join(ROOT, 'mollys-arcade.db');
const ARTWORK_DIR = process.env.ARCADE_ARTWORK_DIR || path.join(ROOT, 'artwork');
const CDN = 'https://thumbnails.libretro.com';

// ══════════════════════════════════════════════════════════════
// MAME SHORTNAME → FULL TITLE DATABASE (comprehensive)
// ══════════════════════════════════════════════════════════════
const MAME_NAMES = {
    // ── Numbers ──
    '1941':      '1941 - Counter Attack',
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
    'tst gorf':  'Gorf',
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
// SYSTEM → LIBRETRO DIRECTORY MAPPING
// ══════════════════════════════════════════════════════════════
const SYSTEM_DIRS = {
    'nes':       'Nintendo - Nintendo Entertainment System',
    'snes':      'Nintendo - Super Nintendo Entertainment System',
    'n64':       'Nintendo - Nintendo 64',
    'gb':        'Nintendo - Game Boy',
    'gbc':       'Nintendo - Game Boy Color',
    'gba':       'Nintendo - Game Boy Advance',
    'nds':       'Nintendo - Nintendo DS',
    'genesis':   'Sega - Mega Drive - Genesis',
    'sms':       'Sega - Master System - Mark III',
    'gamegear':  'Sega - Game Gear',
    'saturn':    'Sega - Saturn',
    '32x':       'Sega - 32X',
    'psx':       'Sony - PlayStation',
    'psp':       'Sony - PlayStation Portable',
    'atari2600': 'Atari - 2600',
    'atari7800': 'Atari - 7800',
    'jaguar':    'Atari - Jaguar',
    'lynx':      'Atari - Lynx',
    'tg16':      'NEC - PC Engine - TurboGrafx 16',
    'neogeo':    'SNK - Neo Geo',
    'ngp':       'SNK - Neo Geo Pocket',
    'arcade':    'MAME',
    'fbneo':     'FBNeo - Arcade Games',
    'wonderswan':'Bandai - WonderSwan',
    'vb':        'Nintendo - Virtual Boy',
    '3do':       'The 3DO Company - 3DO',
    'coleco':    'Coleco - ColecoVision',
    'dos':       'DOS',
};

// ══════════════════════════════════════════════════════════════
// CDN DIRECTORY SCRAPER
// ══════════════════════════════════════════════════════════════
const cdnCache = {};  // system → [filename, filename, ...]

async function scrapeCDNDirectory(libretroDir, type = 'Named_Boxarts') {
    const cacheKey = `${libretroDir}/${type}`;
    if (cdnCache[cacheKey]) return cdnCache[cacheKey];

    const url = `${CDN}/${encodeURIComponent(libretroDir)}/${type}/`;
    console.log(`  [CDN] Scraping directory: ${libretroDir}/${type}`);

    try {
        const html = await httpGet(url);
        // Parse <a href="..."> tags from directory listing
        const regex = /href="([^"]+\.png)"/gi;
        const files = [];
        let match;
        while ((match = regex.exec(html)) !== null) {
            const filename = decodeURIComponent(match[1]).replace(/\.png$/i, '');
            files.push(filename);
        }
        console.log(`  [CDN] Found ${files.length} artwork files in ${libretroDir}/${type}`);
        cdnCache[cacheKey] = files;
        return files;
    } catch (err) {
        console.error(`  [CDN] Failed to scrape ${cacheKey}: ${err.message}`);
        cdnCache[cacheKey] = [];
        return [];
    }
}

// ══════════════════════════════════════════════════════════════
// SMART CDN MATCHING (directory-listing-first, no brute force)
// ══════════════════════════════════════════════════════════════
function findBestCDNMatch(searchName, cdnFiles, shortname = null) {
    if (!cdnFiles || cdnFiles.length === 0) return null;

    const searchLower = searchName.toLowerCase().trim();
    // Strip common suffixes/noise from search name
    const searchClean = searchLower
        .replace(/[_]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\s*[-:]\s*$/, '')
        .trim();
    const searchWords = searchClean.split(/[\s\-_:&]+/).filter(w => w.length > 1);

    let bestMatch = null;
    let bestScore = 0;

    for (const cdnFile of cdnFiles) {
        const cdnLower = cdnFile.toLowerCase();
        let score = 0;

        // Strip parentheticals for base comparison
        const cdnBase = cdnLower
            .replace(/\s*\([^)]*\)\s*/g, ' ')
            .replace(/\s*_\s*/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // ── TIER 1: Exact match (100 pts) ──
        if (cdnBase === searchClean) {
            return cdnFile; // Perfect — return immediately
        }

        // ── TIER 2: CDN base starts with full search name (95 pts) ──
        if (cdnBase.startsWith(searchClean + ' ') || cdnBase.startsWith(searchClean + '-') || cdnBase.startsWith(searchClean + ',')) {
            score = Math.max(score, 95);
        }
        // Or search starts with CDN base (handles "Street Fighter II" matching "Street Fighter II - The World Warrior")
        if (searchClean.startsWith(cdnBase) && cdnBase.length >= 6) {
            score = Math.max(score, 93);
        }

        // ── TIER 3: Contains as significant substring (85 pts) ──
        if (searchClean.length >= 5 && cdnLower.includes(searchClean)) {
            score = Math.max(score, 85);
        }
        if (searchClean.length >= 5 && cdnBase.includes(searchClean)) {
            score = Math.max(score, 87);
        }

        // ── TIER 4: Word overlap scoring (70-90 pts) ──
        if (searchWords.length >= 2) {
            const cdnWords = cdnBase.split(/[\s\-_:,.!'+&]+/).filter(w => w.length > 1);
            let matched = 0;
            let matchedChars = 0;
            for (const sw of searchWords) {
                const found = cdnWords.find(cw => cw === sw || cw.startsWith(sw) || sw.startsWith(cw));
                if (found) {
                    matched++;
                    matchedChars += Math.min(sw.length, found.length);
                }
            }
            const overlap = matched / searchWords.length;
            // Require high word overlap AND significant character coverage
            if (overlap >= 0.7 && matched >= 2 && matchedChars >= 6) {
                const wordScore = 70 + Math.round(overlap * 20);
                score = Math.max(score, wordScore);
            }
        }

        // ── TIER 5: Shortname-based matching for MAME (80 pts) ──
        if (shortname && shortname.length >= 3) {
            const snLower = shortname.toLowerCase();
            // CDN starts with shortname (e.g., "pacman" → "Pac-Man")
            const cdnCompact = cdnBase.replace(/[\s\-_.:'!]+/g, '');
            if (cdnCompact.startsWith(snLower)) {
                score = Math.max(score, 80);
            }
            // Special case: number shortnames (e.g., "1941" → "1941 - Counter Attack")
            if (/^\d+/.test(snLower) && cdnBase.startsWith(snLower)) {
                score = Math.max(score, 88);
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestMatch = cdnFile;
        }
    }

    return bestScore >= 70 ? bestMatch : null;
}

// Find match across multiple CDN file lists (boxarts + snaps from multiple systems)
function findMatchAcrossLists(searchName, cdnLists, shortname = null) {
    for (const { files, dir, type } of cdnLists) {
        const match = findBestCDNMatch(searchName, files, shortname);
        if (match) return { match, dir, type };
    }
    return null;
}

// ══════════════════════════════════════════════════════════════
// HTTP HELPERS
// ══════════════════════════════════════════════════════════════
function httpGet(url) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http;
        const req = proto.get(url, { headers: { 'User-Agent': 'MollysWorldArcade/2.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                httpGet(res.headers.location).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'MollysWorldArcade/2.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                downloadFile(res.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
            file.on('error', (err) => {
                try { fs.unlinkSync(dest); } catch {}
                reject(err);
            });
        });
        req.on('error', reject);
        req.setTimeout(12000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

// ══════════════════════════════════════════════════════════════
// SVG PLACEHOLDER GENERATOR
// ══════════════════════════════════════════════════════════════
const SYSTEM_COLORS = {
    'nes': '#CE1124', 'snes': '#7B2D8E', 'n64': '#009E60', 'gb': '#8BA858',
    'gbc': '#6638B6', 'gba': '#4A00A0', 'nds': '#BFBFBF', 'genesis': '#171717',
    'sms': '#0066CC', 'gamegear': '#222222', 'saturn': '#003DA5', '32x': '#333333',
    'psx': '#00439C', 'psp': '#003087', 'atari2600': '#D35400', 'atari7800': '#E67E22',
    'jaguar': '#CC0000', 'lynx': '#555555', 'tg16': '#FF6600', 'neogeo': '#D4A017',
    'ngp': '#003399', 'arcade': '#FFD700', 'fbneo': '#FF4444', 'wonderswan': '#2196F3',
    'vb': '#CC0000', '3do': '#C0392B', 'coleco': '#2C3E50', 'dos': '#1ABC9C',
};

const SYSTEM_ICONS = {
    'nes': '🎮', 'snes': '🎮', 'n64': '🕹️', 'gb': '📱', 'gbc': '📱',
    'gba': '📱', 'nds': '📱', 'genesis': '🎮', 'sms': '🎮', 'gamegear': '📱',
    'saturn': '💿', '32x': '🎮', 'psx': '💿', 'psp': '📱', 'atari2600': '🕹️',
    'atari7800': '🕹️', 'jaguar': '🎮', 'lynx': '📱', 'tg16': '🎮', 'neogeo': '🕹️',
    'ngp': '📱', 'arcade': '🕹️', 'fbneo': '🕹️', 'wonderswan': '📱',
    'vb': '🥽', '3do': '💿', 'coleco': '🕹️', 'dos': '💻',
};

const SYSTEM_SHORT = {
    'nes': 'NES', 'snes': 'SNES', 'n64': 'N64', 'gb': 'GB', 'gbc': 'GBC',
    'gba': 'GBA', 'nds': 'NDS', 'genesis': 'Genesis', 'sms': 'SMS', 'gamegear': 'GG',
    'saturn': 'Saturn', '32x': '32X', 'psx': 'PS1', 'psp': 'PSP', 'atari2600': '2600',
    'atari7800': '7800', 'jaguar': 'Jaguar', 'lynx': 'Lynx', 'tg16': 'TG16',
    'neogeo': 'Neo Geo', 'ngp': 'NGP', 'arcade': 'Arcade', 'fbneo': 'FBNeo',
    'wonderswan': 'WS', 'vb': 'VB', '3do': '3DO', 'coleco': 'Coleco', 'dos': 'DOS',
};

function generatePlaceholder(gameName, systemId) {
    const color = SYSTEM_COLORS[systemId] || '#666';
    const icon = SYSTEM_ICONS[systemId] || '🎮';
    const sysLabel = SYSTEM_SHORT[systemId] || systemId.toUpperCase();

    // Truncate name to fit
    let displayName = gameName;
    if (displayName.length > 28) {
        displayName = displayName.substring(0, 26) + '…';
    }

    // Split long names into two lines
    let line1 = displayName;
    let line2 = '';
    if (displayName.length > 16) {
        const mid = Math.floor(displayName.length / 2);
        const spaceIdx = displayName.lastIndexOf(' ', mid + 4);
        if (spaceIdx > 4) {
            line1 = displayName.substring(0, spaceIdx);
            line2 = displayName.substring(spaceIdx + 1);
        }
    }

    // Generate darker/lighter variants of the color
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const darker = `rgb(${Math.max(0, r - 40)},${Math.max(0, g - 40)},${Math.max(0, b - 40)})`;
    const lighter = `rgb(${Math.min(255, r + 60)},${Math.min(255, g + 60)},${Math.min(255, b + 60)})`;

    const titleY = line2 ? '125' : '135';
    const line2Tag = line2 ? `<text x="160" y="155" font-family="Arial,sans-serif" font-size="16" font-weight="bold" fill="white" text-anchor="middle" opacity="0.95">${escXml(line2)}</text>` : '';

    return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${darker}"/>
      <stop offset="100%" style="stop-color:${color}"/>
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.3"/>
    </filter>
  </defs>
  <rect width="320" height="240" fill="url(#bg)" rx="8"/>
  <!-- Decorative grid -->
  <g opacity="0.08">
    <line x1="0" y1="60" x2="320" y2="60" stroke="white" stroke-width="1"/>
    <line x1="0" y1="120" x2="320" y2="120" stroke="white" stroke-width="1"/>
    <line x1="0" y1="180" x2="320" y2="180" stroke="white" stroke-width="1"/>
    <line x1="80" y1="0" x2="80" y2="240" stroke="white" stroke-width="1"/>
    <line x1="160" y1="0" x2="160" y2="240" stroke="white" stroke-width="1"/>
    <line x1="240" y1="0" x2="240" y2="240" stroke="white" stroke-width="1"/>
  </g>
  <!-- System badge -->
  <rect x="10" y="10" width="${sysLabel.length * 11 + 20}" height="28" fill="black" fill-opacity="0.4" rx="14"/>
  <text x="${sysLabel.length * 5.5 + 20}" y="30" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="${lighter}" text-anchor="middle">${escXml(sysLabel)}</text>
  <!-- Center icon -->
  <text x="160" y="95" font-size="48" text-anchor="middle" filter="url(#shadow)">${icon}</text>
  <!-- Game title -->
  <text x="160" y="${titleY}" font-family="Arial,sans-serif" font-size="17" font-weight="bold" fill="white" text-anchor="middle" filter="url(#shadow)">${escXml(line1)}</text>
  ${line2Tag}
  <!-- Bottom accent -->
  <rect x="60" y="190" width="200" height="3" fill="${lighter}" opacity="0.5" rx="1"/>
  <text x="160" y="218" font-family="Arial,sans-serif" font-size="11" fill="white" text-anchor="middle" opacity="0.5">MOLLY'S ARCADE</text>
</svg>`;
}

function escXml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ══════════════════════════════════════════════════════════════
// MAIN BLITZ ENGINE
// ══════════════════════════════════════════════════════════════
async function main() {
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║     🎨 ARTWORK BLITZ — Operation Art Heist   ║');
    console.log('║          Louvre-Level Coverage Mode           ║');
    console.log('╚══════════════════════════════════════════════╝');

    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Get all ROMs missing artwork
    const missing = db.prepare(`
        SELECT r.id, r.system_id, r.clean_name, r.filename,
               m.title, m.artwork_path
        FROM roms r
        LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE m.artwork_path IS NULL OR m.artwork_path = ?
        ORDER BY r.system_id, r.clean_name
    `).all('');

    console.log(`\n🎯 Target: ${missing.length} games missing artwork\n`);

    // Also check for existing artwork on disk that isn't linked
    let relinked = 0;
    for (const rom of missing) {
        const artDir = path.join(ARTWORK_DIR, rom.system_id);
        const localFile = path.join(artDir, `${rom.clean_name}.png`);
        if (fs.existsSync(localFile) && fs.statSync(localFile).size > 100) {
            updateArtworkPath(db, rom.id, `${rom.system_id}/${rom.clean_name}.png`);
            relinked++;
        }
    }
    if (relinked > 0) {
        console.log(`♻️  Re-linked ${relinked} existing artwork files\n`);
    }

    // Refresh missing list
    const stillMissing = db.prepare(`
        SELECT r.id, r.system_id, r.clean_name, r.filename,
               m.title, m.artwork_path
        FROM roms r
        LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE m.artwork_path IS NULL OR m.artwork_path = ?
        ORDER BY r.system_id, r.clean_name
    `).all('');

    console.log(`📦 Still missing after re-link: ${stillMissing.length}\n`);

    // Group by system
    const bySystem = {};
    for (const rom of stillMissing) {
        if (!bySystem[rom.system_id]) bySystem[rom.system_id] = [];
        bySystem[rom.system_id].push(rom);
    }

    let downloaded = 0;
    let placeholders = 0;
    let failed = 0;

    // ══════════════════════════════════════════════════════════
    // PHASE 1: SCRAPE ALL CDN DIRECTORIES (do this ONCE upfront)
    // ══════════════════════════════════════════════════════════
    console.log('\n📡 PHASE 1: Scraping ALL CDN directory listings...\n');

    // Get unique system IDs that need artwork
    const systemsNeeded = [...new Set(stillMissing.map(r => r.system_id))];

    // Special CDN directories for arcade systems
    const arcadeCDNDirs = { 'arcade': 'MAME', 'neogeo': 'SNK - Neo Geo', 'fbneo': 'FBNeo - Arcade Games' };

    // Scrape all needed directories
    const cdnListings = {}; // systemId → [{files, dir, type}]
    for (const sysId of systemsNeeded) {
        const libretroDir = arcadeCDNDirs[sysId] || SYSTEM_DIRS[sysId];
        if (!libretroDir) {
            console.log(`  ⚠️  No Libretro mapping: ${sysId}`);
            cdnListings[sysId] = [];
            continue;
        }

        const boxarts = await scrapeCDNDirectory(libretroDir, 'Named_Boxarts');
        const snaps = await scrapeCDNDirectory(libretroDir, 'Named_Snaps');
        cdnListings[sysId] = [
            { files: boxarts, dir: libretroDir, type: 'Named_Boxarts' },
            { files: snaps, dir: libretroDir, type: 'Named_Snaps' },
        ];
        await sleep(300);

        // Arcade games might also be on Neo Geo CDN
        if (sysId === 'arcade') {
            const neoBox = await scrapeCDNDirectory('SNK - Neo Geo', 'Named_Boxarts');
            const neoSnap = await scrapeCDNDirectory('SNK - Neo Geo', 'Named_Snaps');
            cdnListings[sysId].push(
                { files: neoBox, dir: 'SNK - Neo Geo', type: 'Named_Boxarts' },
                { files: neoSnap, dir: 'SNK - Neo Geo', type: 'Named_Snaps' },
            );
        }
        // FBNeo games might also be on MAME CDN
        if (sysId === 'fbneo') {
            cdnListings[sysId].push(
                ...cdnListings['arcade'] || [
                    { files: await scrapeCDNDirectory('MAME', 'Named_Boxarts'), dir: 'MAME', type: 'Named_Boxarts' },
                    { files: await scrapeCDNDirectory('MAME', 'Named_Snaps'), dir: 'MAME', type: 'Named_Snaps' },
                ]
            );
        }
    }

    console.log('\n✅ CDN scraping complete. Now matching & downloading...\n');

    // ══════════════════════════════════════════════════════════
    // PHASE 2: MATCH & DOWNLOAD (all systems in one pass)
    // ══════════════════════════════════════════════════════════

    for (const [sysId, games] of Object.entries(bySystem)) {
        if (games.length === 0) continue;

        const isMame = ['arcade', 'neogeo', 'fbneo'].includes(sysId);
        console.log(`\n${'═'.repeat(50)}`);
        console.log(`${isMame ? '🕹️' : '📺'} ${sysId.toUpperCase()} — ${games.length} games`);
        console.log('═'.repeat(50));

        const listings = cdnListings[sysId] || [];

        for (const rom of games) {
            const artDir = path.join(ARTWORK_DIR, rom.system_id);
            if (!fs.existsSync(artDir)) fs.mkdirSync(artDir, { recursive: true });
            const localFile = path.join(artDir, `${rom.clean_name}.png`);

            // Already on disk?
            if (fs.existsSync(localFile) && fs.statSync(localFile).size > 100) {
                updateArtworkPath(db, rom.id, `${rom.system_id}/${rom.clean_name}.png`);
                downloaded++;
                continue;
            }

            let success = false;

            // ── Strategy 1: Search CDN directory listings ──
            // For MAME/Neo Geo, use our title mapping first
            const fullTitle = isMame ? MAME_NAMES[rom.clean_name] : null;
            const searchName = fullTitle || rom.clean_name;

            // Search all CDN listings for this system
            const found = findMatchAcrossLists(searchName, listings, isMame ? rom.clean_name : null);

            if (found) {
                const url = `${CDN}/${encodeURIComponent(found.dir)}/${found.type}/${encodeURIComponent(found.match)}.png`;
                try {
                    await downloadFile(url, localFile);
                    if (fs.existsSync(localFile) && fs.statSync(localFile).size > 100) {
                        updateArtworkPath(db, rom.id, `${rom.system_id}/${rom.clean_name}.png`);
                        console.log(`  ✅ ${rom.clean_name} → ${found.match}`);
                        downloaded++;
                        success = true;
                    }
                } catch (err) {
                    // Download failed even though listing showed it — try alternate
                    try { fs.unlinkSync(localFile); } catch {}
                }
                await sleep(50);
            }

            // ── Strategy 2: For console games, try common name variants directly ──
            if (!success && !isMame) {
                const variants = buildConsoleVariants(rom.clean_name, rom.filename);
                const libretroDir = SYSTEM_DIRS[sysId];
                if (libretroDir) {
                    for (const variant of variants.slice(0, 6)) { // Limit to top 6 variants
                        for (const type of ['Named_Boxarts', 'Named_Snaps']) {
                            const url = `${CDN}/${encodeURIComponent(libretroDir)}/${type}/${encodeURIComponent(variant)}.png`;
                            try {
                                await downloadFile(url, localFile);
                                if (fs.existsSync(localFile) && fs.statSync(localFile).size > 100) {
                                    updateArtworkPath(db, rom.id, `${rom.system_id}/${rom.clean_name}.png`);
                                    console.log(`  ✅ ${rom.clean_name} → ${variant}`);
                                    downloaded++;
                                    success = true;
                                    break;
                                }
                            } catch {}
                        }
                        if (success) break;
                    }
                    await sleep(30);
                }
            }

            // ── Strategy 3: Generate styled placeholder ──
            if (!success) {
                const displayName = fullTitle || prettifyName(rom.clean_name);
                const svg = generatePlaceholder(displayName, rom.system_id);
                fs.writeFileSync(localFile, svg);
                updateArtworkPath(db, rom.id, `${rom.system_id}/${rom.clean_name}.png`);
                console.log(`  🎨 ${rom.clean_name} → placeholder (${displayName})`);
                placeholders++;
            }
        }
    }

    // ── FINAL REPORT ──
    const totalAfter = db.prepare(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN m.artwork_path IS NOT NULL AND m.artwork_path != ? THEN 1 ELSE 0 END) as with_art
        FROM roms r
        LEFT JOIN metadata m ON m.rom_id = r.id
    `).get('');

    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║          🏛️  OPERATION ART HEIST COMPLETE     ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  Downloaded from CDN:  ${String(downloaded).padStart(5)}                 ║`);
    console.log(`║  Placeholders created: ${String(placeholders).padStart(5)}                 ║`);
    console.log(`║  Re-linked existing:   ${String(relinked).padStart(5)}                 ║`);
    console.log(`║  ─────────────────────────────────           ║`);
    console.log(`║  Coverage: ${totalAfter.with_art}/${totalAfter.total} (${((totalAfter.with_art/totalAfter.total)*100).toFixed(1)}%)              ║`);
    console.log('╚══════════════════════════════════════════════╝');

    db.close();
}

// ══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════
function buildConsoleVariants(cleanName, filename) {
    const variants = [];

    // Direct clean name with regions
    for (const region of ['USA', 'World', 'Japan', 'Europe', 'USA, Europe', 'Japan, USA']) {
        variants.push(`${cleanName} (${region})`);
    }
    variants.push(cleanName);

    // Try the filename-derived name (strip extension and version info)
    if (filename) {
        let fName = filename.replace(/\.[^.]+$/, ''); // strip extension
        fName = fName.replace(/_/g, ' '); // underscores to spaces
        fName = fName.replace(/\s*\([^)]*\)\s*/g, '').trim(); // strip parentheticals
        fName = fName.replace(/\s*\[[^\]]*\]\s*/g, '').trim(); // strip brackets
        if (fName !== cleanName) {
            for (const region of ['USA', 'World', 'Japan', 'Europe']) {
                variants.push(`${fName} (${region})`);
            }
            variants.push(fName);
        }
    }

    return [...new Set(variants)];
}

function prettifyName(name) {
    return name
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
}

function updateArtworkPath(db, romId, relativePath) {
    db.prepare(`
        INSERT INTO metadata (rom_id, artwork_path, metadata_source, fetched_at)
        VALUES (?, ?, 'artwork-blitz', datetime('now'))
        ON CONFLICT(rom_id) DO UPDATE SET artwork_path = ?, fetched_at = datetime('now')
    `).run(romId, relativePath, relativePath);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// GO!
main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});
