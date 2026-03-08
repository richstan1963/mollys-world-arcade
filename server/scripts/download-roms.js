#!/usr/bin/env node
/**
 * Molly's World Arcade — ROM Downloader
 *
 * Downloads curated, top-rated ROMs from archive.org for each system.
 * Uses known archive.org identifiers with direct file downloads.
 *
 * Usage:
 *   node server/scripts/download-roms.js --system nes
 *   node server/scripts/download-roms.js --system nes --dry-run
 *   node server/scripts/download-roms.js --all
 *   node server/scripts/download-roms.js --list
 *   node server/scripts/download-roms.js --system genesis --search-only
 *
 * Flags:
 *   --system <id>    Download ROMs for one system
 *   --all            Download ROMs for ALL systems
 *   --dry-run        Show what would be downloaded without downloading
 *   --list           List all supported systems and their game counts
 *   --search-only    Search archive.org for the system and show identifiers (no download)
 *   --max <n>        Max games to download per system (default: unlimited)
 *   --delay <ms>     Delay between downloads in ms (default: 2000)
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ROMS_DIR = path.join(ROOT, 'roms');

// ─── CLI Args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getFlag = (name) => args.includes(name);
const getFlagValue = (name) => {
    const idx = args.indexOf(name);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
};

const DRY_RUN = getFlag('--dry-run');
const LIST_ONLY = getFlag('--list');
const SEARCH_ONLY = getFlag('--search-only');
const ALL_SYSTEMS = getFlag('--all');
const TARGET_SYSTEM = getFlagValue('--system');
const MAX_GAMES = getFlagValue('--max') ? parseInt(getFlagValue('--max')) : null;
const DELAY_MS = getFlagValue('--delay') ? parseInt(getFlagValue('--delay')) : 2000;

// ─── Archive.org Source Configurations ───────────────────────────────────────
// Each system maps to known archive.org identifiers and URL patterns.
// These are real, verified archive.org collections.

const SOURCES = {
    nes: {
        name: 'Nintendo Entertainment System',
        archives: [
            { id: 'ni-roms', base: 'https://archive.org/download/ni-roms/roms/', ext: '.nes' },
            { id: 'nes-roms-2020', base: 'https://archive.org/download/nes-roms-2020/', ext: '.nes' },
        ],
        extensions: ['.nes', '.zip'],
    },
    snes: {
        name: 'Super Nintendo',
        archives: [
            { id: 'snes-roms-2020', base: 'https://archive.org/download/snes-roms-2020/', ext: '.sfc' },
        ],
        extensions: ['.sfc', '.smc', '.zip'],
    },
    genesis: {
        name: 'Sega Genesis / Mega Drive',
        archives: [
            { id: 'segagenesisromcollection', base: 'https://archive.org/download/segagenesisromcollection/', ext: '.md' },
        ],
        extensions: ['.md', '.bin', '.gen', '.zip'],
    },
    n64: {
        name: 'Nintendo 64',
        archives: [
            { id: 'n64-roms-2020', base: 'https://archive.org/download/n64-roms-2020/', ext: '.z64' },
        ],
        extensions: ['.z64', '.n64', '.v64', '.zip'],
    },
    gb: {
        name: 'Game Boy',
        archives: [
            { id: 'game-boy-roms-2020', base: 'https://archive.org/download/game-boy-roms-2020/', ext: '.gb' },
        ],
        extensions: ['.gb', '.zip'],
    },
    gbc: {
        name: 'Game Boy Color',
        archives: [
            { id: 'game-boy-color-roms-2020', base: 'https://archive.org/download/game-boy-color-roms-2020/', ext: '.gbc' },
        ],
        extensions: ['.gbc', '.zip'],
    },
    gba: {
        name: 'Game Boy Advance',
        archives: [
            { id: 'game-boy-advance-roms-2020', base: 'https://archive.org/download/game-boy-advance-roms-2020/', ext: '.gba' },
        ],
        extensions: ['.gba', '.zip'],
    },
    nds: {
        name: 'Nintendo DS',
        archives: [
            { id: 'ndsplusdsi-collection', base: 'https://archive.org/download/ndsplusdsi-collection/', ext: '.nds' },
        ],
        extensions: ['.nds', '.zip'],
    },
    sms: {
        name: 'Sega Master System',
        archives: [
            { id: 'sega-master-system-roms-2020', base: 'https://archive.org/download/sega-master-system-roms-2020/', ext: '.sms' },
        ],
        extensions: ['.sms', '.zip'],
    },
    gamegear: {
        name: 'Sega Game Gear',
        archives: [
            { id: 'game-gear-roms-2020', base: 'https://archive.org/download/game-gear-roms-2020/', ext: '.gg' },
        ],
        extensions: ['.gg', '.zip'],
    },
    tg16: {
        name: 'TurboGrafx-16 / PC Engine',
        archives: [
            { id: 'turbografx-16-roms-2020', base: 'https://archive.org/download/turbografx-16-roms-2020/', ext: '.pce' },
        ],
        extensions: ['.pce', '.zip'],
    },
    atari2600: {
        name: 'Atari 2600',
        archives: [
            { id: 'atari-2600-roms-2020', base: 'https://archive.org/download/atari-2600-roms-2020/', ext: '.a26' },
        ],
        extensions: ['.a26', '.zip'],
    },
    atari7800: {
        name: 'Atari 7800',
        archives: [
            { id: 'atari-7800-roms-2020', base: 'https://archive.org/download/atari-7800-roms-2020/', ext: '.a78' },
        ],
        extensions: ['.a78', '.zip'],
    },
    psx: {
        name: 'PlayStation',
        archives: [
            // PSX ROMs are large (CHD/bin+cue), use curated list only
        ],
        extensions: ['.chd', '.bin', '.cue', '.pbp', '.zip'],
    },
    psp: {
        name: 'PlayStation Portable',
        archives: [],
        extensions: ['.iso', '.cso', '.zip'],
    },
    lynx: {
        name: 'Atari Lynx',
        archives: [
            { id: 'atari-lynx-roms-2020', base: 'https://archive.org/download/atari-lynx-roms-2020/', ext: '.lnx' },
        ],
        extensions: ['.lnx', '.zip'],
    },
    wonderswan: {
        name: 'WonderSwan',
        archives: [
            { id: 'wonderswan-roms-2020', base: 'https://archive.org/download/wonderswan-roms-2020/', ext: '.ws' },
        ],
        extensions: ['.ws', '.wsc', '.zip'],
    },
    ngp: {
        name: 'Neo Geo Pocket',
        archives: [
            { id: 'neo-geo-pocket-roms-2020', base: 'https://archive.org/download/neo-geo-pocket-roms-2020/', ext: '.ngp' },
        ],
        extensions: ['.ngp', '.ngc', '.zip'],
    },
    coleco: {
        name: 'ColecoVision',
        archives: [
            { id: 'colecovision-roms-2020', base: 'https://archive.org/download/colecovision-roms-2020/', ext: '.col' },
        ],
        extensions: ['.col', '.rom', '.zip'],
    },
    vb: {
        name: 'Virtual Boy',
        archives: [
            { id: 'virtual-boy-roms-2020', base: 'https://archive.org/download/virtual-boy-roms-2020/', ext: '.vb' },
        ],
        extensions: ['.vb', '.vboy', '.zip'],
    },
};


// ─── Curated Top Games Per System ────────────────────────────────────────────
// The BEST, most popular, most beloved titles. These names are used for
// fuzzy matching against archive.org file listings.

const TOP_GAMES = {
    nes: [
        'Super Mario Bros', 'Super Mario Bros 2', 'Super Mario Bros 3',
        'Legend of Zelda', 'Zelda II Adventure of Link',
        'Metroid', 'Mega Man 2', 'Mega Man 3', 'Mega Man 4', 'Mega Man 5', 'Mega Man 6',
        'Castlevania', 'Castlevania II', 'Castlevania III',
        'Contra', 'Super C', 'Kirby Adventure', 'Punch-Out',
        'Tetris', 'Duck Hunt', 'Excitebike', 'Ice Climber',
        'Ninja Gaiden', 'Ninja Gaiden II', 'Ninja Gaiden III',
        'Double Dragon', 'Double Dragon II', 'Double Dragon III',
        'Battletoads', 'River City Ransom', 'Blaster Master',
        'Final Fantasy', 'Dragon Quest', 'Dragon Warrior',
        'Tecmo Super Bowl', 'Mike Tyson Punch-Out',
        'Bubble Bobble', 'Ghosts N Goblins', 'Gradius',
        'Life Force', 'RC Pro-Am', 'Rad Racer',
        'DuckTales', 'Chip Dale Rescue Rangers',
        'Bionic Commando', 'Jackal', 'Faxanadu',
        'StarTropics', 'Kid Icarus', 'Little Nemo',
        'Adventure Island', 'Solomon Key', 'Crystalis',
        'Section Z', 'Rygar', 'Trojan',
        'Balloon Fight', 'Wrecking Crew', 'Clu Clu Land',
        'Lode Runner', 'Bomberman', 'Galaga',
        'Pac-Man', 'Donkey Kong', 'Donkey Kong Jr',
        'Mario Bros', 'Popeye', 'Spy Hunter',
        'Track Field', 'Paperboy', 'Wizards Warriors',
        'Teenage Mutant Ninja Turtles', 'TMNT II Arcade Game', 'TMNT III Manhattan Project',
        'Batman', 'Batman Return of the Joker',
        'Darkwing Duck', 'TaleSpin', 'Gargoyle Quest II',
        'Zelda', 'Metroid', 'Kid Icarus', 'Fire Emblem',
        'Marble Madness', 'Snake Rattle Roll',
        'Abadox', 'Adventures of Lolo', 'Anticipation',
        'Base Wars', 'Blades of Steel', 'Clash at Demonhead',
        'Cobra Triangle', 'Conquest of the Crystal Palace',
        'Dig Dug', 'Dr. Mario', 'Elevator Action',
        'Felix the Cat', 'Fester Quest', 'G.I. Joe',
        'Gun.Smoke', 'Jackal', 'Journey to Silius',
        'Kabuki Quantum Fighter', 'Kickle Cubicle',
        'Legacy of the Wizard', 'Little Samson',
        'Maniac Mansion', 'Metal Gear', 'Metal Storm',
        'Micro Machines', 'Monster Party', 'Power Blade',
        'Shatterhand', 'Shadow of the Ninja', 'Snake Rattle N Roll',
        'Solar Jetman', 'Solstice', 'Vice Project Doom',
    ],

    snes: [
        'Super Mario World', 'Super Mario World 2 Yoshi Island',
        'Super Mario All-Stars', 'Super Mario RPG',
        'Legend of Zelda Link to the Past',
        'Super Metroid', 'Chrono Trigger',
        'Final Fantasy IV', 'Final Fantasy V', 'Final Fantasy VI',
        'Donkey Kong Country', 'Donkey Kong Country 2', 'Donkey Kong Country 3',
        'EarthBound', 'Secret of Mana', 'Secret of Evermore',
        'Mega Man X', 'Mega Man X2', 'Mega Man X3',
        'Contra III Alien Wars', 'Super Castlevania IV',
        'Street Fighter II Turbo', 'Super Street Fighter II',
        'Mortal Kombat', 'Mortal Kombat II', 'Mortal Kombat 3',
        'NBA Jam', 'NBA Jam Tournament Edition',
        'Kirby Super Star', 'Kirby Dream Land 3',
        'Star Fox', 'F-Zero', 'Super Mario Kart',
        'Pilot Wings', 'SimCity', 'ActRaiser', 'ActRaiser 2',
        'Super Ghouls Ghosts', 'Zombies Ate My Neighbors',
        'Teenage Mutant Ninja Turtles Turtles in Time',
        'Aladdin', 'Lion King', 'Mickey Magical Quest',
        'Breath of Fire', 'Breath of Fire II',
        'Illusion of Gaia', 'Terranigma', 'Soul Blazer',
        'Lufia Rise Sinistrals', 'Lufia II',
        'Super Punch-Out', 'Super Tennis', 'Super Soccer',
        'Battletoads Double Dragon', 'Sunset Riders',
        'Gradius III', 'R-Type III', 'Axelay',
        'Demon Crest', 'Goof Troop', 'Pocky Rocky',
        'Wild Guns', 'Ninja Warriors', 'Hagane',
        'UN Squadron', 'Super Turrican', 'Super Turrican 2',
        'Harvest Moon', 'SimCity 2000', 'Populous',
        'Tetris Attack', 'Panel de Pon', 'Dr. Mario',
        'Ogre Battle', 'Tactics Ogre', 'Front Mission',
        'Seiken Densetsu 3', 'Bahamut Lagoon', 'Live A Live',
        'Star Ocean', 'Tales of Phantasia', 'Romancing SaGa 3',
        'Yoshi Island', 'Wario Woods',
        'Lost Vikings', 'Blackthorne', 'Rock N Roll Racing',
        'International Superstar Soccer Deluxe',
        'Killer Instinct', 'Primal Rage',
        'Super Bomberman', 'Super Bomberman 2', 'Super Bomberman 3',
        'Sparkster', 'Plok', 'Umihara Kawase',
        'Metal Warriors', 'Cybernator', 'Gundam Wing',
        'Space Megaforce', 'Super R-Type', 'Parodius',
    ],

    genesis: [
        'Sonic the Hedgehog', 'Sonic the Hedgehog 2', 'Sonic the Hedgehog 3',
        'Sonic and Knuckles', 'Sonic Spinball',
        'Streets of Rage', 'Streets of Rage 2', 'Streets of Rage 3',
        'Golden Axe', 'Golden Axe II', 'Golden Axe III',
        'Gunstar Heroes', 'Dynamite Headdy', 'Alien Soldier',
        'Phantasy Star II', 'Phantasy Star III', 'Phantasy Star IV',
        'Shining Force', 'Shining Force II', 'Shining in the Darkness',
        'Shinobi III', 'Shadow Dancer', 'Revenge of Shinobi',
        'Vectorman', 'Vectorman 2', 'Comix Zone',
        'Ecco the Dolphin', 'Ecco Tides of Time',
        'ToeJam Earl', 'ToeJam Earl Panic on Funkotron',
        'Castlevania Bloodlines', 'Contra Hard Corps',
        'Mega Turrican', 'Thunder Force III', 'Thunder Force IV',
        'Rocket Knight Adventures', 'Sparkster',
        'Earthworm Jim', 'Earthworm Jim 2',
        'Aladdin', 'Lion King', 'Castle of Illusion',
        'World of Illusion', 'Quackshot',
        'Road Rash', 'Road Rash II', 'Road Rash 3',
        'Mortal Kombat', 'Mortal Kombat II', 'Mortal Kombat 3',
        'Street Fighter II Special Champion Edition',
        'Super Street Fighter II',
        'NBA Jam', 'NBA Jam Tournament Edition',
        'Madden NFL 94', 'NHL 94', 'FIFA Soccer 95',
        'Altered Beast', 'Ghouls N Ghosts',
        'Landstalker', 'Beyond Oasis', 'Light Crusader',
        'Ristar', 'Pulseman', 'Ranger X',
        'Splatterhouse 2', 'Splatterhouse 3',
        'Wonder Boy Monster World', 'Monster World IV',
        'Truxton', 'MUSHA', 'Steel Empire',
        'Herzog Zwei', 'Dune II', 'General Chaos',
        'Columns', 'Dr Robotnik Mean Bean Machine', 'Puyo Puyo',
        'Gain Ground', 'Decap Attack', 'Kid Chameleon',
        'Toejam and Earl', 'Michael Jackson Moonwalker',
        'Desert Strike', 'Jungle Strike', 'Urban Strike',
        'Zombies Ate My Neighbors', 'Haunting',
        'Bonanza Bros', 'Flicky', 'Alex Kidd',
        'Eternal Champions', 'Virtua Fighter 2',
        'OutRun', 'Super Hang-On', 'Top Gear 2',
        'Strider', 'Forgotten Worlds', 'Mercs',
        'Battle Mania', 'Panorama Cotton', 'Mega Bomberman',
        'Crusader of Centy', 'Soleil',
        'Warsong', 'Langrisser II', 'Master of Monsters',
    ],

    n64: [
        'Super Mario 64', 'Legend of Zelda Ocarina of Time',
        'Legend of Zelda Majora Mask', 'GoldenEye 007',
        'Mario Kart 64', 'Star Fox 64',
        'Banjo-Kazooie', 'Banjo-Tooie',
        'Donkey Kong 64', 'Diddy Kong Racing',
        'Super Smash Bros', 'Mario Party', 'Mario Party 2', 'Mario Party 3',
        'Paper Mario', 'Mario Golf', 'Mario Tennis',
        'Perfect Dark', 'Jet Force Gemini',
        'Conker Bad Fur Day', 'Blast Corps',
        'F-Zero X', 'Wave Race 64', 'Excitebike 64',
        '1080 Snowboarding', 'Pilotwings 64',
        'Kirby 64 Crystal Shards', 'Yoshi Story',
        'Pokemon Stadium', 'Pokemon Stadium 2', 'Pokemon Snap',
        'Star Wars Rogue Squadron', 'Star Wars Shadows of Empire',
        'Turok Dinosaur Hunter', 'Turok 2 Seeds of Evil',
        'Doom 64', 'Duke Nukem 64', 'Quake', 'Quake II',
        'Ogre Battle 64', 'Harvest Moon 64',
        'Bomberman 64', 'Bomberman Hero',
        'Mystical Ninja Starring Goemon', 'Goemon Great Adventure',
        'Rayman 2', 'Glover', 'Chameleon Twist',
        'Resident Evil 2', 'Castlevania Legacy',
        'Mortal Kombat 4', 'Mortal Kombat Trilogy',
        'Killer Instinct Gold', 'Mace Dark Age',
        'WCW NWO Revenge', 'WWF No Mercy', 'WWF Wrestlemania 2000',
        'Tony Hawk Pro Skater', 'Tony Hawk Pro Skater 2', 'Tony Hawk Pro Skater 3',
        'San Francisco Rush', 'Cruisin USA', 'Beetle Adventure Racing',
        'Ridge Racer 64', 'Extreme-G', 'Wipeout 64',
        'Body Harvest', 'Space Station Silicon Valley',
        'Snowboard Kids', 'Mischief Makers', 'Sin and Punishment',
        'Custom Robo', 'Hybrid Heaven', 'Winback',
        'Command Conquer', 'StarCraft 64',
        'NFL Blitz', 'Wayne Gretzky 3D Hockey',
        'International Superstar Soccer 64',
        'Mega Man 64', 'Aidyn Chronicles',
        'Army Men Sarges Heroes', 'Buck Bumble',
        'Chameleon Twist 2', 'Gauntlet Legends',
        'Indiana Jones Infernal Machine', 'Knife Edge',
        'Lego Racers', 'Micro Machines 64', 'Vigilante 8',
    ],

    gba: [
        'Pokemon Fire Red', 'Pokemon Leaf Green',
        'Pokemon Ruby', 'Pokemon Sapphire', 'Pokemon Emerald',
        'Legend of Zelda Minish Cap', 'Legend of Zelda Link to the Past Four Swords',
        'Metroid Fusion', 'Metroid Zero Mission',
        'Advance Wars', 'Advance Wars 2 Black Hole Rising',
        'Golden Sun', 'Golden Sun Lost Age',
        'Fire Emblem', 'Fire Emblem Sacred Stones',
        'Castlevania Aria of Sorrow', 'Castlevania Harmony of Dissonance', 'Castlevania Circle of the Moon',
        'Final Fantasy Tactics Advance', 'Final Fantasy I II Dawn of Souls',
        'Final Fantasy IV Advance', 'Final Fantasy V Advance', 'Final Fantasy VI Advance',
        'Super Mario Advance', 'Super Mario Advance 2', 'Super Mario Advance 3', 'Super Mario Advance 4',
        'Mario Luigi Superstar Saga', 'Mario Kart Super Circuit',
        'Mario Golf Advance Tour', 'Mario Tennis Power Tour',
        'Kirby Nightmare in Dream Land', 'Kirby Amazing Mirror',
        'Mega Man Battle Network', 'Mega Man Battle Network 2', 'Mega Man Battle Network 3',
        'Mega Man Zero', 'Mega Man Zero 2', 'Mega Man Zero 3', 'Mega Man Zero 4',
        'Sonic Advance', 'Sonic Advance 2', 'Sonic Advance 3',
        'Wario Land 4', 'WarioWare Inc',
        'Harvest Moon Friends of Mineral Town',
        'Tactics Ogre Knight of Lodis',
        'Riviera Promised Land', 'Yggdra Union',
        'Astro Boy Omega Factor', 'Gunstar Super Heroes',
        'Drill Dozer', 'Rhythm Tengoku',
        'Ninja Five-O', 'Car Battler Joe',
        'Lady Sia', 'Summon Night Swordcraft Story',
        'Shining Soul', 'Shining Soul II',
        'Breath of Fire', 'Breath of Fire II',
        'Mother 3', 'Mother 1 2',
        'Kingdom Hearts Chain of Memories',
        'Dragon Ball Z Legacy of Goku II', 'Dragon Ball Z Buu Fury',
        'Boktai Sun Is in Your Hand',
        'Tony Hawk Pro Skater 2', 'Tony Hawk Pro Skater 3',
        'Doom', 'Doom II', 'Duke Nukem Advance',
        'Medal of Honor Infiltrator', 'Medal of Honor Underground',
        'Densetsu no Stafy', 'Densetsu no Stafy 2', 'Densetsu no Stafy 3',
        'Klonoa Empire of Dreams', 'Klonoa 2 Dream Champ Tournament',
        'F-Zero GP Legend', 'F-Zero Climax',
        'Pokemon Mystery Dungeon', 'Pokemon Pinball Ruby Sapphire',
        'Iridion II', 'Gradius Galaxies',
        'Rayman Advance', 'Rayman 3',
        'Sword of Mana', 'Lunar Legend',
        'Zone of the Enders Fist of Mars',
        'Rebelstar Tactical Command', 'Sabre Wulf',
    ],

    gb: [
        'Pokemon Red', 'Pokemon Blue', 'Pokemon Yellow',
        'Tetris', 'Super Mario Land', 'Super Mario Land 2',
        'Legend of Zelda Links Awakening',
        'Metroid II Return of Samus',
        'Kirby Dream Land', 'Kirby Dream Land 2',
        'Mega Man Dr. Wily Revenge', 'Mega Man II', 'Mega Man III', 'Mega Man IV', 'Mega Man V',
        'Donkey Kong', 'Donkey Kong Land',
        'Wario Land', 'Wario Land II',
        'Final Fantasy Legend', 'Final Fantasy Legend II', 'Final Fantasy Legend III',
        'Final Fantasy Adventure', 'Mystic Quest',
        'Castlevania Adventure', 'Castlevania II Belmont Revenge',
        'Gargoyle Quest', 'Kid Dracula',
        'Contra Operation C', 'Bionic Commando',
        'Batman Return of Joker', 'Batman',
        'Bubble Bobble', 'Dr. Mario',
        'Pac-Man', 'Galaga',
        'R-Type', 'Gradius',
        'Harvest Moon', 'Game Garden',
        'Bomberman', 'Bomberman Quest',
        'Pokemon Pinball', 'Pokemon Trading Card Game',
        'Shantae', 'Trip World',
        'Ducktales', 'Ducktales 2',
        'Ninja Gaiden Shadow', 'Double Dragon',
        'Battletoads', 'TMNT Fall of Foot Clan',
        'Mole Mania', 'For the Frog the Bell Tolls',
        'Avenging Spirit', 'Amazing Spider-Man',
        'Operation C', 'Navy Seals',
        'Adventure Island', 'Adventure Island II',
        'Blaster Master Boy', 'Cave Noire',
        'Catrap', 'Kwirk',
        'Revenge of the Gator', 'Alleyway',
        'Baseball', 'Tennis', 'Golf',
        'Solar Striker', 'Space Invaders',
        'Tetris 2', 'Tetris Blast', 'Tetris Plus',
        'Yoshi', 'Yoshi Cookie',
        'Kid Icarus Of Myths and Monsters',
        'Sword of Hope', 'Sword of Hope II',
        'Dragon Warrior I II', 'Dragon Warrior III',
        'SaGa', 'Legend of the River King',
        'Lufia', 'Survival Kids',
        'Metal Gear Solid', 'Alone in the Dark',
        'Resident Evil Gaiden',
        'Mega Man Xtreme', 'Mega Man Xtreme 2',
    ],

    gbc: [
        'Pokemon Gold', 'Pokemon Silver', 'Pokemon Crystal',
        'Legend of Zelda Oracle of Seasons', 'Legend of Zelda Oracle of Ages',
        'Legend of Zelda Links Awakening DX',
        'Super Mario Bros Deluxe', 'Wario Land 3',
        'Dragon Quest I II', 'Dragon Quest III', 'Dragon Quest Monsters',
        'Dragon Warrior Monsters 2',
        'Mario Golf', 'Mario Tennis',
        'Kirby Tilt N Tumble', 'Metal Gear Solid',
        'Donkey Kong Country', 'Harvest Moon',
        'Harvest Moon 2', 'Harvest Moon 3',
        'Mega Man Xtreme', 'Mega Man Xtreme 2',
        'Shantae', 'Wendy Every Witch Way',
        'Pokemon Puzzle Challenge', 'Pokemon Pinball',
        'Pokemon Trading Card Game',
        'Resident Evil Gaiden', 'Alone in the Dark',
        'Wario Land II', 'Wario Land 3',
        'Crystalis', 'Lufia',
        'Survival Kids', 'Azure Dreams',
        'Bomberman Max', 'Bomberman Quest',
        'Bionic Commando Elite Forces',
        'Blaster Master Enemy Below',
        'Catwoman', 'Batman Beyond',
        'Croc', 'Croc 2',
        'Extreme Sports', 'Tony Hawk Pro Skater',
        'Tomb Raider', 'Tomb Raider Curse of the Sword',
        'Power Quest', 'Revelations Demon Slayer',
        'R-Type DX', 'Daikatana',
        'Shadowgate Classic', 'Shadowgate Return',
        'Ghosts N Goblins', 'Trip World',
        'Game and Watch Gallery 2', 'Game and Watch Gallery 3',
        'Magical Chase', 'Magical Drop',
        'Mario Party', 'Rayman', 'Rayman 2',
        'Rugrats', 'Rocket Power',
        'Star Wars Episode I', 'Battleship',
        'Hamtaro Ham-Hams Unite',
        'Digimon', 'Monster Rancher',
        'Dragon Ball Z Legendary Super Warriors',
        'Turok 2', 'Duke Nukem',
        'Heroes of Might and Magic',
        'Magi Nation', 'Robopon Sun',
        'Spy vs Spy', 'Mission Impossible',
        'Frogger', 'Frogger 2',
        'Space Invaders', 'Centipede',
        'Qbert', 'Ms Pac-Man',
    ],

    sms: [
        'Alex Kidd in Miracle World', 'Alex Kidd in Shinobi World',
        'Sonic the Hedgehog', 'Sonic the Hedgehog 2', 'Sonic Chaos',
        'Phantasy Star', 'Miracle Warriors',
        'Wonder Boy', 'Wonder Boy III Dragon Trap', 'Wonder Boy in Monster Land',
        'Golden Axe Warrior', 'Golvellius',
        'Shinobi', 'Ninja Gaiden',
        'R-Type', 'Power Strike', 'Power Strike II',
        'Castle of Illusion', 'Land of Illusion', 'Legend of Illusion',
        'Out Run', 'Hang-On', 'Super Hang-On',
        'Fantasy Zone', 'Fantasy Zone II',
        'Columns', 'Dr. Robotnik Mean Bean Machine',
        'Asterix', 'Lucky Dime Caper',
        'Master of Darkness', 'Vampire',
        'Zillion', 'Zillion II',
        'Double Dragon', 'Kung Fu Kid',
        'Rastan', 'Rampage', 'Rambo III',
        'Altered Beast', 'After Burner',
        'Space Harrier', 'Thunder Blade',
        'Gain Ground', 'Populous',
        'Ultima IV', 'Ys',
        'Black Belt', 'Kenseiden',
        'Psycho Fox', 'Aztec Adventure',
        'California Games', 'Great Basketball',
        'Champions of Europe', 'World Soccer',
        'Choplifter', 'Ghost House',
        'Safari Hunt', 'Rescue Mission',
        'Bank Panic', 'Teddy Boy',
        'Action Fighter', 'Spy vs Spy',
        'Penguin Land', 'Pit Pot',
        'Bomber Raid', 'Sagaia',
        'Global Defense', 'Missile Defense',
        'Pro Wrestling', 'Heavyweight Champ',
        'Enduro Racer', 'GP Rider',
        'Sonic Triple Trouble', 'Tails Adventure',
        'Streets of Rage', 'Streets of Rage 2',
        'Mortal Kombat', 'Mortal Kombat II',
        'NBA Jam', 'NFL Football',
        'Lemmings', 'Prince of Persia',
        'Robocop', 'Terminator',
        'Alien 3', 'Predator 2',
        'Ecco the Dolphin', 'Sonic Blast',
        'Batman Returns', 'Spider-Man',
        'Ayrton Senna', 'Micro Machines',
    ],

    tg16: [
        'Bonk Adventure', 'Bonk Revenge', 'Bonk 3',
        'Blazing Lazers', 'Soldier Blade', 'Super Star Soldier',
        'R-Type', 'Gate of Thunder', 'Lords of Thunder',
        'Neutopia', 'Neutopia II',
        'Dungeon Explorer', 'Ys Book I II', 'Ys III',
        'Castlevania Rondo of Blood',
        'Military Madness', 'Devil Crash',
        'Bomberman 93', 'Bomberman 94',
        'Splatterhouse', 'Ninja Spirit',
        'Air Zonk', 'Jackie Chan Action Kung Fu',
        'Legendary Axe', 'Legendary Axe II',
        'Keith Courage Alpha Zones',
        'Alien Crush', 'Dragon Curse',
        'Galaga 90', 'New Adventure Island',
        'Cadash', 'Bloody Wolf',
        'Parasol Stars', 'JJ Jeff',
        'World Court Tennis', 'Power Golf',
        'China Warrior', 'Vigilante',
        'Parodius Da', 'Fantasy Zone',
        'Moto Roader', 'Victory Run',
        'Aero Blasters', 'Dead Moon',
        'Impossamole', 'Psychosis',
        'Order of the Griffon', 'Dungeon Explorer II',
        'Sidearms', 'Final Soldier',
        'Cotton', 'Magical Chase',
        'Sapphire', 'Dracula X',
        'Snatcher', 'Download',
        'Star Parodier', 'Salamander',
        'Gradius', 'Gradius II',
        'Detana TwinBee', 'Image Fight',
        'Super Darius', 'Thunder Force',
        'Dragon Spirit', 'Raiden',
        'Battle Royale', 'World Heroes 2',
        'Art of Fighting', 'Fatal Fury',
        'Godzilla', 'Columns',
        'Pac-Land', 'Galaga',
        'Yo Bro', 'Tricky',
    ],

    atari7800: [
        'Asteroids', 'Centipede', 'Ms. Pac-Man',
        'Galaga', 'Xevious', 'Joust',
        'Robotron 2084', 'Dig Dug', 'Pole Position II',
        'Food Fight', 'Dark Chambers', 'Kung Fu Master',
        'Commando', 'Desert Falcon', 'Hat Trick',
        'Karateka', 'Mario Bros', 'Midnight Mutants',
        'Motor Psycho', 'Ninja Golf', 'Planet Smashers',
        'Scrapyard Dog', 'Sentinel', 'Summer Games',
        'Winter Games', 'Tower Toppler', 'Xenophobe',
        'Ballblazer', 'Choplifter', 'Crossbow',
        'Crack Down', 'Donkey Kong', 'Donkey Kong Junior',
        'Fatal Run', 'Fight Night', 'Ikari Warriors',
        'Impossible Mission', 'Jinks', 'Mean 18',
        'MotoRodeo', 'Rampage', 'Realsports Baseball',
        'Alien Brigade', 'Barnyard Blaster', 'Basketbrawl',
        'Beef Drop', 'Bentley Bear', 'Klax',
    ],

    psx: [
        'Final Fantasy VII', 'Final Fantasy VIII', 'Final Fantasy IX',
        'Metal Gear Solid', 'Resident Evil', 'Resident Evil 2', 'Resident Evil 3',
        'Castlevania Symphony of the Night',
        'Crash Bandicoot', 'Crash Bandicoot 2', 'Crash Bandicoot Warped',
        'Spyro the Dragon', 'Spyro 2 Ripto Rage', 'Spyro Year of the Dragon',
        'Gran Turismo', 'Gran Turismo 2',
        'Tekken 3', 'Tekken 2',
        'Tony Hawk Pro Skater', 'Tony Hawk Pro Skater 2',
        'Tomb Raider', 'Tomb Raider II',
        'Silent Hill', 'Parasite Eve', 'Dino Crisis',
        'Chrono Cross', 'Xenogears', 'Vagrant Story',
        'Legend of Dragoon', 'Suikoden', 'Suikoden II',
        'Wild Arms', 'Breath of Fire III', 'Breath of Fire IV',
        'Mega Man X4', 'Mega Man X5', 'Mega Man Legends',
        'Ape Escape', 'MediEvil', 'PaRappa the Rapper',
        'Twisted Metal 2', 'Wipeout', 'Ridge Racer',
        'Ace Combat 2', 'Ace Combat 3',
        'Legend of Mana', 'Front Mission 3',
        'Brave Fencer Musashi', 'Threads of Fate',
        'Klonoa Door to Phantomile', 'Rayman',
        'Oddworld Abe Oddysee', 'Oddworld Abe Exoddus',
        'Symphony of the Night', 'Alundra',
        'Star Ocean Second Story', 'Tales of Destiny',
        'Valkyrie Profile', 'Grandia',
        'Persona', 'Persona 2',
        'Fear Effect', 'Syphon Filter',
        'Jade Cocoon', 'Legend of Legaia',
        'Lunar Silver Star Story', 'Lunar 2',
        'Tactics Ogre', 'Final Fantasy Tactics',
        'Vandal Hearts', 'Brigandine',
        'Bushido Blade', 'Soul Blade',
        'Armored Core', 'Armored Core 2',
        'R-Type Delta', 'Einhander', 'Gradius Gaiden',
        'Pocketstation', 'CTR Crash Team Racing',
        'Chocobo Racing', 'Speed Punks',
        'Driver', 'Driver 2',
        'Harvest Moon Back to Nature',
        'Monster Rancher', 'Monster Rancher 2',
        'Digimon World', 'Digimon World 2',
        'Street Fighter Alpha 3', 'Marvel vs Capcom',
        'Darkstalkers 3', 'Rival Schools',
        'Intelligent Qube', 'Bust-A-Move',
        'Puzzle Fighter', 'Tetris Plus',
    ],

    psp: [
        'God of War Chains of Olympus', 'God of War Ghost of Sparta',
        'Grand Theft Auto Liberty City Stories', 'Grand Theft Auto Vice City Stories',
        'Metal Gear Solid Peace Walker', 'Metal Gear Solid Portable Ops',
        'Monster Hunter Freedom Unite', 'Monster Hunter Freedom 2',
        'Final Fantasy Crisis Core', 'Final Fantasy Tactics War of the Lions',
        'Final Fantasy Type-0', 'Dissidia Final Fantasy',
        'Kingdom Hearts Birth by Sleep',
        'Persona 3 Portable', 'Persona',
        'Tekken 6', 'Tekken Dark Resurrection',
        'Daxter', 'Ratchet Clank Size Matters',
        'LocoRoco', 'LocoRoco 2',
        'Patapon', 'Patapon 2', 'Patapon 3',
        'Lumines', 'Lumines II',
        'Wipeout Pure', 'Wipeout Pulse',
        'Ridge Racer', 'Burnout Legends',
        'Gran Turismo', 'Midnight Club 3',
        'Mega Man Powered Up', 'Mega Man Maverick Hunter X',
        'Castlevania Dracula X Chronicles',
        'Jeanne d Arc',
        'Valkyria Chronicles II', 'Disgaea Afternoon of Darkness',
        'Tactics Ogre Let Us Cling Together',
        'Star Ocean First Departure', 'Star Ocean Second Evolution',
        'Tales of Eternia', 'Tales of the World',
        'Ys Seven', 'Ys The Oath in Felghana',
        'Legend of Heroes Trails in the Sky',
        'Soulcalibur Broken Destiny',
        'Naruto Ultimate Ninja Heroes',
        'Dragon Ball Z Shin Budokai',
        'Killzone Liberation',
        'SOCOM Fireteam Bravo', 'SOCOM Fireteam Bravo 2',
        'Tomb Raider Legend', 'Tomb Raider Anniversary',
        'Secret Agent Clank', 'Jak and Daxter Lost Frontier',
        'Prinny Can I Really Be the Hero',
        'Half Minute Hero',
        'Breath of Fire III',
        'Harvest Moon Hero of Leaf Valley', 'Harvest Moon Boy Girl',
        'Ace Combat X', 'Armored Core',
        'Gitaroo Man Lives', 'DJ Max Portable',
        'Space Invaders Extreme', 'Puzzle Quest',
        'Untold Legends', 'Dungeon Siege',
        'Ratchet and Clank', 'Ape Escape',
        'Me and My Katamari', 'Katamari',
        'N Plus', 'Exit', 'Echochrome',
        'Corpse Party', 'Danganronpa',
    ],

    nds: [
        'New Super Mario Bros', 'Mario Kart DS',
        'Mario 64 DS', 'Mario and Luigi Partners in Time', 'Mario and Luigi Bowser Inside Story',
        'Pokemon Diamond', 'Pokemon Pearl', 'Pokemon Platinum',
        'Pokemon HeartGold', 'Pokemon SoulSilver',
        'Pokemon Black', 'Pokemon White', 'Pokemon Black 2', 'Pokemon White 2',
        'Legend of Zelda Phantom Hourglass', 'Legend of Zelda Spirit Tracks',
        'Metroid Prime Hunters',
        'Kirby Super Star Ultra', 'Kirby Mass Attack', 'Kirby Canvas Curse', 'Kirby Squeak Squad',
        'Castlevania Dawn of Sorrow', 'Castlevania Portrait of Ruin', 'Castlevania Order of Ecclesia',
        'Advance Wars Dual Strike', 'Advance Wars Days of Ruin',
        'Fire Emblem Shadow Dragon',
        'Final Fantasy III', 'Final Fantasy IV', 'Final Fantasy XII Revenant Wings',
        'Dragon Quest IV', 'Dragon Quest V', 'Dragon Quest VI', 'Dragon Quest IX',
        'Chrono Trigger', 'The World Ends with You',
        'Professor Layton Curious Village', 'Professor Layton Diabolical Box',
        'Phoenix Wright Ace Attorney', 'Phoenix Wright Justice for All', 'Phoenix Wright Trials and Tribulations',
        'Brain Age', 'Brain Age 2',
        'Animal Crossing Wild World',
        'Elite Beat Agents', 'Rhythm Heaven',
        'Mega Man ZX', 'Mega Man ZX Advent', 'Mega Man Star Force',
        'Sonic Rush', 'Sonic Rush Adventure',
        'Trauma Center Under the Knife',
        'Tetris DS', 'Puzzle Quest',
        'Contra 4', 'Metal Slug 7',
        'Grand Theft Auto Chinatown Wars',
        'Radiant Historia', 'Sands of Destruction',
        'Golden Sun Dark Dawn', 'Rune Factory',
        'Harvest Moon DS', 'Harvest Moon Island of Happiness',
        'Disgaea DS', 'Final Fantasy Tactics A2',
        'Front Mission DS', 'Valkyrie Profile',
        'Ninja Gaiden Dragon Sword',
        'Wario Master of Disguise', 'WarioWare Touched',
        'Yoshi Island DS', 'Yoshi Touch Go',
        'Donkey Kong Jungle Climber',
        'Star Fox Command',
        'Diddy Kong Racing DS',
        'Bomberman Land Touch', 'Bomberman',
        'Ghost Trick Phantom Detective',
        'Nine Hours Nine Persons Nine Doors',
        'Hotel Dusk Room 215', 'Last Window',
        'Okamiden', 'Solatorobo',
        'Luminous Arc', 'Luminous Arc 2',
        'Devil Survivor', 'Devil Survivor 2',
        'Etrian Odyssey', 'Etrian Odyssey II', 'Etrian Odyssey III',
        'Suikoden Tierkreis', 'Nostalgia',
        'Dark Spire', 'Avalon Code',
        'Kingdom Hearts 358/2 Days', 'Kingdom Hearts Re:coded',
    ],

    lynx: [
        'California Games', 'Todd Andrews Road Blasters',
        'Chip Challenge', 'Gates of Zendocon',
        'Blue Lightning', 'Rygar',
        'Ninja Gaiden', 'Rampage',
        'Pac-Land', 'Ms. Pac-Man',
        'Shanghai', 'Klax',
        'Xenophobe', 'Gauntlet Third Encounter',
        'APB', 'Basketbrawl',
        'Batman Returns', 'Block Out',
        'Checkered Flag', 'Crystal Mines II',
        'Dirty Larry', 'Dracula Undead',
        'Electrocop', 'European Soccer Challenge',
        'Eye of the Beholder', 'Fidelity Chess',
        'Gordo 106', 'Hard Drivin',
        'Hockey', 'Hydra',
        'Ishido', 'Jimmy Connors Tennis',
        'Joust', 'Kung Food',
        'Lemmings', 'Lynx Casino',
        'Malibu Bikini Volleyball', 'Pinball Jam',
        'Pit Fighter', 'Power Factor',
        'Rampart', 'Road Blasters',
        'RoboSquash', 'Scrapyard Dog',
        'Shadow of the Beast', 'Steel Talons',
        'Super Asteroids', 'Super Skweek',
        'Switchblade II', 'Tournament Cyberball',
        'Turbo Sub', 'Viking Child',
        'Warbirds', 'World Class Soccer',
        'Xybots', 'Zarlor Mercenary',
    ],

    wonderswan: [
        'Final Fantasy', 'Final Fantasy II', 'Final Fantasy IV',
        'Romancing SaGa', 'Wild Card', 'Blue Wing Blitz',
        'Gunpey', 'Judgement Silversword',
        'Klonoa Moonlight Museum', 'Digimon',
        'One Piece', 'Naruto',
        'Mega Man Battle', 'Rockman EXE',
        'Buffers Evolution', 'Chocobo',
        'Front Mission', 'Dicing Knight',
        'Makai Toushi', 'Star Hearts',
        'Rhyme Rider', 'Crazy Climber',
        'Puyo Puyo', 'Tetris',
        'Space Invaders', 'Galaga',
    ],

    coleco: [
        'Donkey Kong', 'Donkey Kong Junior', 'Zaxxon',
        'Frogger', 'Ladybug', 'Mouse Trap',
        'Venture', 'Cosmic Avenger',
        'Mr Do', 'Smurf Rescue', 'Pitfall',
        'Antarctic Adventure', 'Buck Rogers',
        'Carnival', 'Centipede',
        'Dam Busters', 'Defender',
        'Dig Dug', 'Frenzy',
        'Galaxian', 'Gorf',
        'Keystone Kapers', 'Looping',
        'Miner 2049er', 'Montezuma Revenge',
        'Omega Race', 'Pac-Man',
        'Pepper II', 'Popeye',
        'Qbert', 'River Raid',
        'Robin Hood', 'Rocky',
        'Slither', 'Space Fury',
        'Space Panic', 'Spy Hunter',
        'Star Trek', 'Star Wars',
        'Subroc', 'Super Action Baseball',
        'Super Cobra', 'Tarzan',
        'Time Pilot', 'Turbo',
        'War Games', 'War Room',
        'Wizard of Wor', 'Jumpman Junior',
    ],

    vb: [
        'Mario Clash', 'Mario Tennis',
        'Wario Land', 'Virtual Boy Wario Land',
        'Red Alarm', 'Teleroboxer',
        'Galactic Pinball', 'Panic Bomber',
        'Jack Bros', 'Vertical Force',
        'Golf', 'Waterworld',
        'Nester Funky Bowling', 'Space Squash',
        'Virtual Fishing', 'Insmouse No Yakata',
        'SD Gundam', 'V-Tetris',
        'Virtual League Baseball', 'Virtual Lab',
        'Bound High', 'Space Invaders',
    ],

    ngp: [
        'SNK vs Capcom Match of Millennium',
        'SNK vs Capcom Card Fighters Clash',
        'King of Fighters R-2',
        'Samurai Shodown 2', 'Fatal Fury First Contact',
        'Last Blade Beyond the Destiny',
        'Metal Slug 1st Mission', 'Metal Slug 2nd Mission',
        'Sonic the Hedgehog Pocket Adventure',
        'Dark Arms Beast Buster',
        'Biomotor Unitron', 'Dive Alert',
        'Faselei', 'Cotton',
        'Evolution', 'Ogre Battle',
        'Puzzle Bobble Mini', 'Pac-Man',
        'Baseball Stars', 'Neo Turf Masters',
        'Big Tournament Golf', 'Pocket Tennis',
        'Neo Geo Cup 98', 'Soccer',
        'Ganbare Neo Poke Kun', 'Rockman',
        'Delta Warp', 'Bust-A-Move',
        'Puzzle Link', 'Puzzle Link 2',
    ],
};


// ─── HTTP Download Helper ────────────────────────────────────────────────────

function fetchUrl(url, options = {}) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http;
        const req = proto.get(url, {
            headers: { 'User-Agent': 'MollysWorldArcade/1.0 (retro-gaming-archive)' },
            timeout: options.timeout || 30000,
            ...options,
        }, (res) => {
            // Follow redirects
            if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
                const redirectUrl = res.headers.location;
                if (!redirectUrl) return reject(new Error('Redirect with no location'));
                res.resume();
                return fetchUrl(redirectUrl, options).then(resolve).catch(reject);
            }
            resolve(res);
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    });
}

function fetchJSON(url) {
    return new Promise(async (resolve, reject) => {
        try {
            const res = await fetchUrl(url);
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
            });
            res.on('error', reject);
        } catch (e) { reject(e); }
    });
}

function downloadFile(url, destPath, maxSizeMB = 500) {
    return new Promise(async (resolve, reject) => {
        try {
            const res = await fetchUrl(url, { timeout: 120000 });
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }

            const totalSize = parseInt(res.headers['content-length'] || '0');
            const maxBytes = maxSizeMB * 1024 * 1024;
            if (totalSize > maxBytes) {
                res.destroy();
                return reject(new Error(`File too large: ${(totalSize / 1024 / 1024).toFixed(1)}MB`));
            }

            let downloaded = 0;
            const file = fs.createWriteStream(destPath);

            res.on('data', chunk => {
                downloaded += chunk.length;
                if (downloaded > maxBytes) {
                    res.destroy();
                    file.close();
                    try { fs.unlinkSync(destPath); } catch {}
                    reject(new Error(`Download exceeded ${maxSizeMB}MB limit`));
                }
                // Progress indicator
                if (totalSize > 0) {
                    const pct = ((downloaded / totalSize) * 100).toFixed(0);
                    process.stdout.write(`\r    downloading... ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)}MB)`);
                } else {
                    process.stdout.write(`\r    downloading... ${(downloaded / 1024 / 1024).toFixed(1)}MB`);
                }
            });

            res.pipe(file);
            file.on('finish', () => {
                file.close();
                process.stdout.write('\r' + ' '.repeat(60) + '\r');
                resolve({ size: downloaded });
            });
            file.on('error', (err) => {
                try { fs.unlinkSync(destPath); } catch {}
                reject(err);
            });
        } catch (e) { reject(e); }
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// ─── Archive.org Search & File Listing ───────────────────────────────────────

async function searchArchiveOrg(query, rows = 50) {
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=downloads&fl[]=description&rows=${rows}&output=json`;
    const data = await fetchJSON(url);
    return (data.response?.docs || []).sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
}

async function listArchiveFiles(identifier) {
    const url = `https://archive.org/metadata/${identifier}/files`;
    const data = await fetchJSON(url);
    return data.result || [];
}


// ─── Filename Matching ──────────────────────────────────────────────────────

function normalizeForMatch(str) {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function gameMatchesFile(gameName, fileName) {
    const normGame = normalizeForMatch(gameName);
    const normFile = normalizeForMatch(fileName);

    // Split game name into words and check if all significant words appear in filename
    const gameWords = normGame.split(' ').filter(w => w.length > 1);

    // All words must appear
    const allMatch = gameWords.every(word => normFile.includes(word));
    if (allMatch) return true;

    // Try matching with at least 80% of words (for long titles)
    if (gameWords.length >= 4) {
        const matchCount = gameWords.filter(word => normFile.includes(word)).length;
        if (matchCount / gameWords.length >= 0.8) return true;
    }

    return false;
}

function isUnwantedFile(filename) {
    const lower = filename.toLowerCase();
    // Skip region-specific versions that are less desired
    // But DO include USA and World versions
    const unwanted = [
        '(beta', '(proto', '(sample', '(demo', '(pirate',
        '(unl)', '(pd)', '(hack', '(bad',
        '(aftermarket', '(competition cart',
    ];
    for (const u of unwanted) {
        if (lower.includes(u)) return true;
    }
    return false;
}

function preferUSA(filename) {
    const lower = filename.toLowerCase();
    if (lower.includes('(usa') || lower.includes('(world') || lower.includes('(us,') || lower.includes('(u)')) return 3;
    if (lower.includes('(europe') || lower.includes('(en,') || lower.includes('(e)')) return 2;
    if (lower.includes('(japan') || lower.includes('(j)')) return 1;
    return 0; // unknown region — still okay
}


// ─── Main Download Logic ─────────────────────────────────────────────────────

async function downloadSystemROMs(systemId) {
    const source = SOURCES[systemId];
    if (!source) {
        console.log(`  Unknown system: ${systemId}`);
        return { downloaded: 0, skipped: 0, failed: 0, errors: [] };
    }

    const gameList = TOP_GAMES[systemId] || [];
    if (gameList.length === 0) {
        console.log(`  No curated game list for ${systemId}`);
        return { downloaded: 0, skipped: 0, failed: 0, errors: [] };
    }

    const romDir = path.join(ROMS_DIR, systemId);
    if (!fs.existsSync(romDir)) fs.mkdirSync(romDir, { recursive: true });

    // Get existing files
    const existingFiles = new Set(
        fs.readdirSync(romDir).map(f => f.toLowerCase())
    );

    console.log(`\n  Target: ${gameList.length} curated games | Existing: ${existingFiles.size} files`);
    console.log(`  ROM dir: ${romDir}`);

    if (DRY_RUN) {
        console.log(`  [DRY RUN] Would search archive.org for ${gameList.length} games`);
        return { downloaded: 0, skipped: existingFiles.size, failed: 0, errors: [] };
    }

    // Strategy: scan archive.org collections, match files against our curated list
    let allArchiveFiles = [];

    for (const archive of source.archives) {
        console.log(`  Scanning archive: ${archive.id}...`);
        try {
            const files = await listArchiveFiles(archive.id);
            const romFiles = files.filter(f => {
                const ext = path.extname(f.name || '').toLowerCase();
                return source.extensions.includes(ext) && !isUnwantedFile(f.name || '');
            });
            console.log(`    Found ${romFiles.length} ROM files in ${archive.id}`);
            allArchiveFiles.push(...romFiles.map(f => ({
                ...f,
                archiveId: archive.id,
                archiveBase: archive.base,
            })));
            await sleep(DELAY_MS);
        } catch (err) {
            console.log(`    Error scanning ${archive.id}: ${err.message}`);
        }
    }

    // If we have no archive files from metadata, try search API as fallback
    if (allArchiveFiles.length === 0) {
        console.log(`  No files found from configured archives. Trying search...`);
        try {
            const searchQuery = `${source.name} roms collection`;
            const results = await searchArchiveOrg(searchQuery, 20);
            if (results.length > 0) {
                console.log(`  Found ${results.length} archive.org results:`);
                for (const r of results.slice(0, 10)) {
                    console.log(`    - ${r.identifier} (${r.downloads || 0} downloads): ${r.title}`);
                }
                // Try the top result
                const topId = results[0].identifier;
                console.log(`  Scanning top result: ${topId}...`);
                const files = await listArchiveFiles(topId);
                const romFiles = files.filter(f => {
                    const ext = path.extname(f.name || '').toLowerCase();
                    return source.extensions.includes(ext) && !isUnwantedFile(f.name || '');
                });
                console.log(`    Found ${romFiles.length} ROM files`);
                allArchiveFiles.push(...romFiles.map(f => ({
                    ...f,
                    archiveId: topId,
                })));
                await sleep(DELAY_MS);
            }
        } catch (err) {
            console.log(`  Search failed: ${err.message}`);
        }
    }

    if (allArchiveFiles.length === 0) {
        console.log(`  No ROM files found for ${systemId}. Try --search-only to find collections.`);
        return { downloaded: 0, skipped: existingFiles.size, failed: 0, errors: [] };
    }

    console.log(`  Total archive files to match against: ${allArchiveFiles.length}`);

    // Match curated games against archive files
    let downloaded = 0;
    let skipped = 0;
    let failed = 0;
    let notFound = 0;
    const errors = [];
    const downloadedGames = new Set();
    const limit = MAX_GAMES || gameList.length;

    for (const gameName of gameList) {
        if (downloaded >= limit) break;

        // Check if we already have a file matching this game
        const alreadyHave = [...existingFiles].some(f => gameMatchesFile(gameName, f));
        if (alreadyHave) {
            skipped++;
            continue;
        }

        // Find matching files in archive
        const matches = allArchiveFiles.filter(f => gameMatchesFile(gameName, f.name || ''));

        if (matches.length === 0) {
            notFound++;
            continue;
        }

        // Sort: prefer USA/World, then by file size (smaller = less likely corrupt mega-pack)
        matches.sort((a, b) => {
            const regionDiff = preferUSA(b.name) - preferUSA(a.name);
            if (regionDiff !== 0) return regionDiff;
            return (parseInt(a.size) || 0) - (parseInt(b.size) || 0);
        });

        const best = matches[0];
        const fileName = best.name;
        const destPath = path.join(romDir, fileName);

        // Double-check not already downloaded
        if (fs.existsSync(destPath)) {
            skipped++;
            continue;
        }

        // Build download URL
        const url = `https://archive.org/download/${best.archiveId}/${encodeURIComponent(fileName)}`;

        try {
            console.log(`  [${downloaded + 1}] ${gameName}`);
            console.log(`    -> ${fileName}`);
            const result = await downloadFile(url, destPath);

            // Verify file is not empty / HTML error page
            const stat = fs.statSync(destPath);
            if (stat.size < 100) {
                fs.unlinkSync(destPath);
                throw new Error('File too small (likely error page)');
            }

            const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
            console.log(`    OK (${sizeMB}MB)`);
            downloaded++;
            downloadedGames.add(gameName);
            await sleep(DELAY_MS);
        } catch (err) {
            console.log(`    FAILED: ${err.message}`);
            try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch {}
            errors.push({ game: gameName, error: err.message });
            failed++;
            await sleep(DELAY_MS);
        }
    }

    console.log(`\n  --- ${systemId.toUpperCase()} Summary ---`);
    console.log(`  Downloaded: ${downloaded} | Already had: ${skipped} | Not found: ${notFound} | Failed: ${failed}`);

    const totalNow = fs.readdirSync(romDir).length;
    console.log(`  Total ROMs now: ${totalNow}`);

    return { downloaded, skipped, failed, notFound, errors, total: totalNow };
}


// ─── Search Mode ─────────────────────────────────────────────────────────────

async function searchMode(systemId) {
    const source = SOURCES[systemId];
    if (!source) {
        console.log(`Unknown system: ${systemId}`);
        return;
    }

    console.log(`\nSearching archive.org for "${source.name}" ROM collections...\n`);

    const queries = [
        `${source.name} roms`,
        `${source.name} rom set`,
        `${source.name} complete collection`,
        `${systemId} roms`,
    ];

    const seen = new Set();
    for (const q of queries) {
        try {
            const results = await searchArchiveOrg(q, 15);
            for (const r of results) {
                if (seen.has(r.identifier)) continue;
                seen.add(r.identifier);
                console.log(`  ${r.identifier}`);
                console.log(`    Title: ${r.title}`);
                console.log(`    Downloads: ${(r.downloads || 0).toLocaleString()}`);
                console.log('');
            }
        } catch (err) {
            // quiet
        }
        await sleep(1500);
    }

    console.log(`Found ${seen.size} unique collections. Use the identifier in SOURCES config to add as a download source.`);
}


// ─── Main Entry ──────────────────────────────────────────────────────────────

async function main() {
    console.log('');
    console.log('================================================');
    console.log("  Molly's World Arcade - ROM Downloader");
    console.log('================================================');
    console.log('');

    if (LIST_ONLY) {
        console.log('Supported systems and curated game counts:\n');
        for (const [id, source] of Object.entries(SOURCES)) {
            const games = TOP_GAMES[id] || [];
            const romDir = path.join(ROMS_DIR, id);
            const existing = fs.existsSync(romDir) ? fs.readdirSync(romDir).length : 0;
            const archives = source.archives.length;
            const status = existing >= 100 ? 'GOOD' : existing >= 50 ? 'OK' : existing >= 10 ? 'LOW' : 'EMPTY';
            console.log(`  ${id.padEnd(12)} ${source.name.padEnd(35)} Curated: ${String(games.length).padStart(3)} | Have: ${String(existing).padStart(4)} | [${status}]`);
        }
        console.log('');
        return;
    }

    if (SEARCH_ONLY && TARGET_SYSTEM) {
        await searchMode(TARGET_SYSTEM);
        return;
    }

    if (!TARGET_SYSTEM && !ALL_SYSTEMS) {
        console.log('Usage:');
        console.log('  node server/scripts/download-roms.js --system nes');
        console.log('  node server/scripts/download-roms.js --all');
        console.log('  node server/scripts/download-roms.js --list');
        console.log('  node server/scripts/download-roms.js --system genesis --search-only');
        console.log('  node server/scripts/download-roms.js --system snes --dry-run');
        console.log('  node server/scripts/download-roms.js --system gba --max 50');
        console.log('');
        return;
    }

    const systems = ALL_SYSTEMS ? Object.keys(SOURCES) : [TARGET_SYSTEM];
    const allResults = {};

    for (const sys of systems) {
        console.log(`\n======== ${(SOURCES[sys]?.name || sys).toUpperCase()} ========`);
        try {
            allResults[sys] = await downloadSystemROMs(sys);
        } catch (err) {
            console.log(`  FATAL ERROR: ${err.message}`);
            allResults[sys] = { downloaded: 0, failed: 1, errors: [{ game: 'system', error: err.message }] };
        }
    }

    // Final summary
    console.log('\n\n================================================');
    console.log('  FINAL SUMMARY');
    console.log('================================================\n');

    let totalDownloaded = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const [sys, result] of Object.entries(allResults)) {
        const name = SOURCES[sys]?.name || sys;
        totalDownloaded += result.downloaded || 0;
        totalSkipped += result.skipped || 0;
        totalFailed += result.failed || 0;
        console.log(`  ${name.padEnd(35)} +${result.downloaded || 0} new | ${result.total || '?'} total`);
    }

    console.log('');
    console.log(`  Total downloaded: ${totalDownloaded}`);
    console.log(`  Total skipped (existing): ${totalSkipped}`);
    console.log(`  Total failed: ${totalFailed}`);
    console.log('');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
