#!/usr/bin/env node
/**
 * Molly's World Arcade — Top 100 Scraper (Myrient Edition)
 * Downloads ROMs + boxart for top 100 games per system from myrient.erista.me
 *
 * URGENT: Myrient shutting down March 31 2026 — download everything now!
 *
 * Usage:
 *   node server/scripts/top100-scraper.js          # all systems
 *   node server/scripts/top100-scraper.js nes       # NES only
 *   node server/scripts/top100-scraper.js snes gba  # multiple systems
 *
 * Systems: nes, snes, genesis, gba, gb, gbc, n64, atari2600, sms,
 *          gamegear, saturn, dreamcast, psx, ps2, psp, threeds, gamecube, wii, arcade
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const ROMS_BASE = process.env.ARCADE_ROMS_DIR || path.join(ROOT, 'roms');
const ARTWORK_BASE = process.env.ARCADE_ARTWORK_DIR || path.join(ROOT, 'artwork');
const API_BASE = process.env.ARCADE_API_BASE || 'http://localhost:3000';
const ROM_DELAY_MS = 400;

const MYRIENT = {
    nes:       'https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Nintendo%20Entertainment%20System%20(Headered)/',
    snes:      'https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System/',
    genesis:   'https://myrient.erista.me/files/No-Intro/Sega%20-%20Mega%20Drive%20-%20Genesis/',
    gba:       'https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Game%20Boy%20Advance/',
    gb:        'https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Game%20Boy/',
    gbc:       'https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Game%20Boy%20Color/',
    n64:       'https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Nintendo%2064/',
    atari2600: 'https://myrient.erista.me/files/No-Intro/Atari%20-%202600/',
    sms:       'https://myrient.erista.me/files/No-Intro/Sega%20-%20Master%20System%20-%20Mark%20III/',
    // Cartridge
    gamegear:  'https://myrient.erista.me/files/No-Intro/Sega%20-%20Game%20Gear/',
    psp:       'https://myrient.erista.me/files/No-Intro/Sony%20-%20PlayStation%20Portable/',
    // Cartridge (No-Intro)
    threeds:   'https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Nintendo%203DS/',
    // Redump (disc)
    saturn:    'https://myrient.erista.me/files/Redump/Sega%20-%20Saturn/',
    dreamcast: 'https://myrient.erista.me/files/Redump/Sega%20-%20Dreamcast/',
    psx:       'https://myrient.erista.me/files/Redump/Sony%20-%20PlayStation/',
    ps2:       'https://myrient.erista.me/files/Redump/Sony%20-%20PlayStation%202/',
    gamecube:  'https://myrient.erista.me/files/Redump/Nintendo%20-%20GameCube/',
    wii:       'https://myrient.erista.me/files/Redump/Nintendo%20-%20Wii/',
    // MAME (arcade) — ROM names are short IDs, handled via MAME_ROM_MAP below
    arcade:    'https://myrient.erista.me/files/MAME/',
};

// ── Game Lists ─────────────────────────────────────────────────────────────

const GAME_LISTS = {

    // ── NES ─────────────────────────────────────────────────────────────────
    nes: {
        libretroDir: 'Nintendo - Nintendo Entertainment System',
        romExt: '.nes',
        myrientBase: MYRIENT.nes,
        games: [
            { title: 'Super Mario Bros.',                            year: 1985, publisher: 'Nintendo',         genre: 'Platformer'   },
            { title: 'Super Mario Bros. 3',                          year: 1988, publisher: 'Nintendo',         genre: 'Platformer'   },
            { title: 'Super Mario Bros. 2',                          year: 1988, publisher: 'Nintendo',         genre: 'Platformer'   },
            { title: 'The Legend of Zelda',                          year: 1986, publisher: 'Nintendo',         genre: 'Action RPG'   },
            { title: "Zelda II: The Adventure of Link",              year: 1987, publisher: 'Nintendo',         genre: 'Action RPG'   },
            { title: 'Metroid',                                      year: 1986, publisher: 'Nintendo',         genre: 'Action'       },
            { title: 'Mega Man 2',                                   year: 1988, publisher: 'Capcom',           genre: 'Action'       },
            { title: 'Mega Man 3',                                   year: 1990, publisher: 'Capcom',           genre: 'Action'       },
            { title: 'Contra',                                       year: 1988, publisher: 'Konami',           genre: 'Action'       },
            { title: "Mike Tyson's Punch-Out!!",                     year: 1987, publisher: 'Nintendo',         genre: 'Sports'       },
            { title: 'Tetris',                                       year: 1984, publisher: 'Nintendo',         genre: 'Puzzle'       },
            { title: 'DuckTales',                                    year: 1989, publisher: 'Capcom',           genre: 'Platformer'   },
            { title: "Kirby's Adventure",                            year: 1993, publisher: 'Nintendo',         genre: 'Platformer'   },
            { title: 'Battletoads',                                  year: 1991, publisher: 'Tradewest',        genre: 'Beat em Up'   },
            { title: 'Ninja Gaiden',                                 year: 1988, publisher: 'Tecmo',            genre: 'Action'       },
            { title: 'Castlevania',                                  year: 1986, publisher: 'Konami',           genre: 'Action'       },
            { title: "Castlevania III: Dracula's Curse",             year: 1989, publisher: 'Konami',           genre: 'Action'       },
            { title: "Castlevania II: Simon's Quest",                year: 1987, publisher: 'Konami',           genre: 'Action RPG'   },
            { title: 'Mega Man',                                     year: 1987, publisher: 'Capcom',           genre: 'Action'       },
            { title: 'Mega Man 4',                                   year: 1991, publisher: 'Capcom',           genre: 'Action'       },
            { title: 'Mega Man 5',                                   year: 1992, publisher: 'Capcom',           genre: 'Action'       },
            { title: 'Mega Man 6',                                   year: 1993, publisher: 'Capcom',           genre: 'Action'       },
            { title: 'Dr. Mario',                                    year: 1990, publisher: 'Nintendo',         genre: 'Puzzle'       },
            { title: "Ghosts'n Goblins",                             year: 1985, publisher: 'Capcom',           genre: 'Action'       },
            { title: 'Bionic Commando',                              year: 1987, publisher: 'Capcom',           genre: 'Action'       },
            { title: 'Teenage Mutant Ninja Turtles II: The Arcade Game', year: 1990, publisher: 'Konami',      genre: 'Beat em Up'   },
            { title: "Chip 'n Dale Rescue Rangers",                  year: 1990, publisher: 'Capcom',           genre: 'Platformer'   },
            { title: 'DuckTales 2',                                  year: 1993, publisher: 'Capcom',           genre: 'Platformer'   },
            { title: 'Super C',                                      year: 1990, publisher: 'Konami',           genre: 'Action'       },
            { title: 'Life Force',                                   year: 1988, publisher: 'Konami',           genre: 'Shooter'      },
            { title: 'Batman',                                       year: 1989, publisher: 'Sunsoft',          genre: 'Action'       },
            { title: 'Faxanadu',                                     year: 1987, publisher: 'Hudson Soft',      genre: 'Action RPG'   },
            { title: 'Final Fantasy',                                year: 1987, publisher: 'Square',           genre: 'RPG'          },
            { title: 'Ninja Gaiden II: The Dark Sword of Chaos',     year: 1990, publisher: 'Tecmo',            genre: 'Action'       },
            { title: 'Ninja Gaiden III: The Ancient Ship of Doom',   year: 1991, publisher: 'Tecmo',            genre: 'Action'       },
            { title: 'Teenage Mutant Ninja Turtles',                 year: 1989, publisher: 'Konami',           genre: 'Action'       },
            { title: 'Adventures of Lolo',                           year: 1989, publisher: 'HAL Laboratory',   genre: 'Puzzle'       },
            { title: 'Adventures of Lolo 2',                         year: 1990, publisher: 'HAL Laboratory',   genre: 'Puzzle'       },
            { title: 'Excitebike',                                   year: 1984, publisher: 'Nintendo',         genre: 'Racing'       },
            { title: 'Ice Climber',                                  year: 1984, publisher: 'Nintendo',         genre: 'Platformer'   },
            { title: 'Kid Icarus',                                   year: 1986, publisher: 'Nintendo',         genre: 'Action'       },
            { title: 'Balloon Fight',                                year: 1984, publisher: 'Nintendo',         genre: 'Action'       },
            { title: 'Paperboy',                                     year: 1988, publisher: 'Mindscape',        genre: 'Action'       },
            { title: 'Jackal',                                       year: 1988, publisher: 'Konami',           genre: 'Action'       },
            { title: 'Gradius',                                      year: 1986, publisher: 'Konami',           genre: 'Shooter'      },
            { title: 'Duck Hunt',                                    year: 1984, publisher: 'Nintendo',         genre: 'Shooter'      },
            { title: 'Little Nemo: The Dream Master',                year: 1990, publisher: 'Capcom',           genre: 'Platformer'   },
            { title: "Chip 'n Dale Rescue Rangers 2",                year: 1993, publisher: 'Capcom',           genre: 'Platformer'   },
            { title: 'Little Samson',                                year: 1992, publisher: 'Taito',            genre: 'Action'       },
            { title: 'Blaster Master',                               year: 1988, publisher: 'Sunsoft',          genre: 'Action'       },
            { title: 'Battletoads & Double Dragon',                   year: 1993, publisher: 'Tradewest',        genre: 'Beat em Up'   },
            { title: 'River City Ransom',                             year: 1989, publisher: 'American Technos', genre: 'Beat em Up'   },
            { title: 'Punch-Out!!',                                   year: 1990, publisher: 'Nintendo',         genre: 'Sports'       },
            { title: 'Darkwing Duck',                                 year: 1992, publisher: 'Capcom',           genre: 'Platformer'   },
            { title: 'Double Dragon',                                 year: 1988, publisher: 'Tradewest',        genre: 'Beat em Up'   },
            { title: 'Double Dragon II: The Revenge',                 year: 1989, publisher: 'Acclaim',          genre: 'Beat em Up'   },
            { title: 'Double Dragon III: The Sacred Stones',          year: 1991, publisher: 'Acclaim',          genre: 'Beat em Up'   },
            { title: 'StarTropics',                                   year: 1990, publisher: 'Nintendo',         genre: 'Action RPG'   },
            { title: "StarTropics II: Zoda's Revenge",                year: 1994, publisher: 'Nintendo',         genre: 'Action RPG'   },
            { title: '1943: The Battle of Midway',                    year: 1988, publisher: 'Capcom',           genre: 'Shooter'      },
            { title: 'Willow',                                        year: 1989, publisher: 'Capcom',           genre: 'Action RPG'   },
            { title: 'Snow Bros.',                                    year: 1990, publisher: 'Toaplan',          genre: 'Platformer'   },
            { title: 'Bubble Bobble',                                 year: 1987, publisher: 'Taito',            genre: 'Platformer'   },
            { title: 'Rainbow Islands',                               year: 1987, publisher: 'Taito',            genre: 'Platformer'   },
            { title: 'Galaga',                                        year: 1981, publisher: 'Namco',            genre: 'Shooter'      },
            { title: 'Pac-Man',                                       year: 1981, publisher: 'Namco',            genre: 'Action'       },
            { title: 'Donkey Kong',                                   year: 1981, publisher: 'Nintendo',         genre: 'Platformer'   },
            { title: 'Donkey Kong Jr.',                               year: 1982, publisher: 'Nintendo',         genre: 'Platformer'   },
            { title: 'Mario Bros.',                                   year: 1983, publisher: 'Nintendo',         genre: 'Action'       },
            { title: 'Wrecking Crew',                                 year: 1985, publisher: 'Nintendo',         genre: 'Puzzle'       },
            { title: 'Track & Field',                                 year: 1987, publisher: 'Konami',           genre: 'Sports'       },
            { title: 'Goonies II',                                    year: 1987, publisher: 'Konami',           genre: 'Action'       },
            { title: 'Tiny Toon Adventures',                          year: 1991, publisher: 'Konami',           genre: 'Platformer'   },
            { title: 'Animaniacs',                                    year: 1994, publisher: 'Konami',           genre: 'Platformer'   },
            { title: 'Gun.Smoke',                                     year: 1988, publisher: 'Capcom',           genre: 'Shooter'      },
            { title: 'Section Z',                                     year: 1987, publisher: 'Capcom',           genre: 'Shooter'      },
            { title: 'Journey to Silius',                             year: 1990, publisher: 'Sunsoft',          genre: 'Action'       },
            { title: 'Batman: Return of the Joker',                   year: 1991, publisher: 'Sunsoft',          genre: 'Action'       },
            { title: "Bucky O'Hare",                                  year: 1992, publisher: 'Konami',           genre: 'Action'       },
            { title: 'Gremlins 2: The New Batch',                     year: 1990, publisher: 'Sunsoft',          genre: 'Action'       },
            { title: 'Contra Force',                                  year: 1992, publisher: 'Konami',           genre: 'Action'       },
            { title: 'Teenage Mutant Ninja Turtles III: The Manhattan Project', year: 1991, publisher: 'Konami', genre: 'Beat em Up' },
            { title: 'Rygar',                                         year: 1987, publisher: 'Tecmo',            genre: 'Action'       },
            { title: "Rush'N Attack",                                 year: 1987, publisher: 'Konami',           genre: 'Action'       },
            { title: 'Ice Hockey',                                    year: 1988, publisher: 'Nintendo',         genre: 'Sports'       },
            { title: 'Tecmo Super Bowl',                              year: 1991, publisher: 'Tecmo',            genre: 'Sports'       },
            { title: 'Tecmo Bowl',                                    year: 1989, publisher: 'Tecmo',            genre: 'Sports'       },
            { title: "Wario's Woods",                                 year: 1994, publisher: 'Nintendo',         genre: 'Puzzle'       },
            { title: 'Tetris 2',                                      year: 1993, publisher: 'Nintendo',         genre: 'Puzzle'       },
            { title: '1942',                                          year: 1985, publisher: 'Capcom',           genre: 'Shooter'      },
            { title: 'Kabuki Quantum Fighter',                        year: 1990, publisher: 'HAL Laboratory',   genre: 'Action'       },
            { title: 'Shatterhand',                                   year: 1991, publisher: 'Jaleco',           genre: 'Action'       },
            { title: 'Lemmings',                                      year: 1992, publisher: 'Sun Corporation',  genre: 'Puzzle'       },
        ],
    },


    // ── SNES ─────────────────────────────────────────────────────────────────
    snes: {
        libretroDir: 'Nintendo - Super Nintendo Entertainment System',
        romExt: '.sfc',
        myrientBase: MYRIENT.snes,
        games: [
            { title: 'Super Mario World',                               year: 1990, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Super Mario World 2: Yoshi\'s Island',            year: 1995, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Super Mario Kart',                                year: 1992, publisher: 'Nintendo',          genre: 'Racing'       },
            { title: 'Super Mario RPG: Legend of the Seven Stars',      year: 1996, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Super Metroid',                                   year: 1994, publisher: 'Nintendo',          genre: 'Action'       },
            { title: 'The Legend of Zelda: A Link to the Past',         year: 1991, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'Chrono Trigger',                                  year: 1995, publisher: 'Square',            genre: 'RPG'          },
            { title: 'Final Fantasy VI',                                year: 1994, publisher: 'Square',            genre: 'RPG'          },
            { title: 'Final Fantasy IV',                                year: 1991, publisher: 'Square',            genre: 'RPG'          },
            { title: 'Final Fantasy V',                                 year: 1992, publisher: 'Square',            genre: 'RPG'          },
            { title: 'Donkey Kong Country',                             year: 1994, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Donkey Kong Country 2: Diddy\'s Kong Quest',      year: 1995, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Donkey Kong Country 3: Dixie Kong\'s Double Trouble!', year: 1996, publisher: 'Nintendo',     genre: 'Platformer'   },
            { title: 'Mega Man X',                                      year: 1993, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Mega Man X2',                                     year: 1994, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Mega Man X3',                                     year: 1995, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Street Fighter II Turbo: Hyper Fighting',         year: 1992, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Super Street Fighter II: The New Challengers',    year: 1994, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Mortal Kombat II',                                year: 1994, publisher: 'Acclaim',           genre: 'Fighting'     },
            { title: 'Mortal Kombat',                                   year: 1993, publisher: 'Acclaim',           genre: 'Fighting'     },
            { title: 'Super Castlevania IV',                            year: 1991, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Castlevania: Dracula X',                          year: 1995, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Contra III: The Alien Wars',                      year: 1992, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Super Contra',                                    year: 1988, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Teenage Mutant Ninja Turtles IV: Turtles in Time', year: 1992, publisher: 'Konami',          genre: 'Beat em Up'   },
            { title: 'Teenage Mutant Ninja Turtles: Tournament Fighters', year: 1993, publisher: 'Konami',         genre: 'Fighting'     },
            { title: 'Super Punch-Out!!',                               year: 1994, publisher: 'Nintendo',          genre: 'Sports'       },
            { title: 'F-Zero',                                          year: 1990, publisher: 'Nintendo',          genre: 'Racing'       },
            { title: 'Pilotwings',                                      year: 1990, publisher: 'Nintendo',          genre: 'Simulation'   },
            { title: 'Star Fox',                                        year: 1993, publisher: 'Nintendo',          genre: 'Shooter'      },
            { title: 'Star Fox 2',                                      year: 1995, publisher: 'Nintendo',          genre: 'Shooter'      },
            { title: 'Kirby Super Star',                                year: 1996, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: "Kirby's Dream Land 3",                            year: 1997, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: "Kirby's Dream Course",                            year: 1994, publisher: 'Nintendo',          genre: 'Puzzle'       },
            { title: 'Earthbound',                                      year: 1994, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Secret of Mana',                                  year: 1993, publisher: 'Square',            genre: 'Action RPG'   },
            { title: 'Secret of Evermore',                              year: 1995, publisher: 'Square',            genre: 'Action RPG'   },
            { title: 'Illusion of Gaia',                                year: 1993, publisher: 'Enix',              genre: 'Action RPG'   },
            { title: 'Terranigma',                                      year: 1995, publisher: 'Enix',              genre: 'Action RPG'   },
            { title: 'Soul Blazer',                                     year: 1992, publisher: 'Enix',              genre: 'Action RPG'   },
            { title: 'ActRaiser',                                       year: 1990, publisher: 'Enix',              genre: 'Action RPG'   },
            { title: 'ActRaiser 2',                                     year: 1993, publisher: 'Enix',              genre: 'Action'       },
            { title: 'Dragon Quest VI: Realms of Revelation',           year: 1995, publisher: 'Enix',              genre: 'RPG'          },
            { title: 'Dragon Quest V: Hand of the Heavenly Bride',      year: 1992, publisher: 'Enix',              genre: 'RPG'          },
            { title: 'Lufia & the Fortress of Doom',                    year: 1993, publisher: 'Taito',             genre: 'RPG'          },
            { title: 'Lufia II: Rise of the Sinistrals',                year: 1995, publisher: 'Taito',             genre: 'RPG'          },
            { title: 'Tactics Ogre: Let Us Cling Together',             year: 1995, publisher: 'Quest',             genre: 'Strategy RPG' },
            { title: 'Fire Emblem: Thracia 776',                        year: 1999, publisher: 'Nintendo',          genre: 'Strategy RPG' },
            { title: 'Ogre Battle: The March of the Black Queen',       year: 1993, publisher: 'Quest',             genre: 'Strategy RPG' },
            { title: 'Super Mario All-Stars',                           year: 1993, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Yoshi\'s Cookie',                                 year: 1992, publisher: 'Nintendo',          genre: 'Puzzle'       },
            { title: "Kirby's Avalanche",                               year: 1995, publisher: 'Nintendo',          genre: 'Puzzle'       },
            { title: 'Tetris Attack',                                   year: 1995, publisher: 'Nintendo',          genre: 'Puzzle'       },
            { title: 'Super Tetris 3',                                  year: 1994, publisher: 'Bullet-Proof Software', genre: 'Puzzle'  },
            { title: 'Tetris & Dr. Mario',                              year: 1994, publisher: 'Nintendo',          genre: 'Puzzle'       },
            { title: 'Super Bomberman',                                 year: 1993, publisher: 'Hudson Soft',       genre: 'Action'       },
            { title: 'Super Bomberman 2',                               year: 1994, publisher: 'Hudson Soft',       genre: 'Action'       },
            { title: 'Super Bomberman 3',                               year: 1995, publisher: 'Hudson Soft',       genre: 'Action'       },
            { title: 'Super Bomberman 4',                               year: 1996, publisher: 'Hudson Soft',       genre: 'Action'       },
            { title: 'Super Bomberman 5',                               year: 1997, publisher: 'Hudson Soft',       genre: 'Action'       },
            { title: 'Mega Man 7',                                      year: 1995, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Mega Man Soccer',                                 year: 1994, publisher: 'Capcom',            genre: 'Sports'       },
            { title: 'Breath of Fire',                                  year: 1993, publisher: 'Capcom',            genre: 'RPG'          },
            { title: 'Breath of Fire II',                               year: 1994, publisher: 'Capcom',            genre: 'RPG'          },
            { title: 'Super Ghouls\'n Ghosts',                          year: 1991, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Demon\'s Crest',                                  year: 1994, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Aladdin',                                         year: 1993, publisher: 'Capcom',            genre: 'Platformer'   },
            { title: 'The Lion King',                                   year: 1994, publisher: 'Virgin',            genre: 'Platformer'   },
            { title: 'Pocky & Rocky',                                   year: 1992, publisher: 'Taito',             genre: 'Shooter'      },
            { title: 'Pocky & Rocky 2',                                 year: 1994, publisher: 'Taito',             genre: 'Shooter'      },
            { title: 'Gradius III',                                     year: 1990, publisher: 'Konami',            genre: 'Shooter'      },
            { title: 'UN Squadron',                                     year: 1991, publisher: 'Capcom',            genre: 'Shooter'      },
            { title: 'Axelay',                                          year: 1992, publisher: 'Konami',            genre: 'Shooter'      },
            { title: 'R-Type III: The Third Lightning',                 year: 1993, publisher: 'Irem',              genre: 'Shooter'      },
            { title: 'Super R-Type',                                    year: 1991, publisher: 'Irem',              genre: 'Shooter'      },
            { title: 'Darius Twin',                                     year: 1991, publisher: 'Taito',             genre: 'Shooter'      },
            { title: 'U.N. Squadron',                                   year: 1991, publisher: 'Capcom',            genre: 'Shooter'      },
            { title: 'Joe & Mac',                                       year: 1992, publisher: 'Data East',         genre: 'Platformer'   },
            { title: 'Super Double Dragon',                             year: 1992, publisher: 'Technos',           genre: 'Beat em Up'   },
            { title: 'Final Fight',                                     year: 1991, publisher: 'Capcom',            genre: 'Beat em Up'   },
            { title: 'Final Fight 2',                                   year: 1993, publisher: 'Capcom',            genre: 'Beat em Up'   },
            { title: 'Final Fight 3',                                   year: 1995, publisher: 'Capcom',            genre: 'Beat em Up'   },
            { title: 'Ken Griffey Jr. Presents Major League Baseball',  year: 1994, publisher: 'Nintendo',          genre: 'Sports'       },
            { title: 'Super Bases Loaded',                              year: 1991, publisher: 'Jaleco',            genre: 'Sports'       },
            { title: 'Tecmo Super Bowl',                                year: 1993, publisher: 'Tecmo',             genre: 'Sports'       },
            { title: 'NHL \'94',                                        year: 1993, publisher: 'EA Sports',         genre: 'Sports'       },
            { title: 'NBA Jam',                                         year: 1994, publisher: 'Acclaim',           genre: 'Sports'       },
            { title: 'NBA Jam Tournament Edition',                      year: 1995, publisher: 'Acclaim',           genre: 'Sports'       },
            { title: 'Pilotwings',                                      year: 1990, publisher: 'Nintendo',          genre: 'Simulation'   },
            { title: 'Sim City',                                        year: 1991, publisher: 'Nintendo',          genre: 'Simulation'   },
            { title: 'Populous',                                        year: 1990, publisher: 'Bullfrog',          genre: 'Simulation'   },
            { title: 'Baldur\'s Gate: Dark Alliance',                   year: 2001, publisher: 'Interplay',         genre: 'Action RPG'   },
            { title: 'E.V.O.: Search for Eden',                        year: 1992, publisher: 'Enix',              genre: 'Action RPG'   },
            { title: 'Super Turrican',                                  year: 1993, publisher: 'Data East',         genre: 'Action'       },
            { title: 'Super Turrican 2',                                year: 1995, publisher: 'Factor 5',          genre: 'Action'       },
            { title: 'Ninja Gaiden Trilogy',                            year: 1995, publisher: 'Tecmo',             genre: 'Action'       },
            { title: 'International Superstar Soccer Deluxe',           year: 1995, publisher: 'Konami',            genre: 'Sports'       },
            { title: 'Seiken Densetsu 3',                               year: 1995, publisher: 'Square',            genre: 'Action RPG'   },
        ],
    },


    // ── Genesis ──────────────────────────────────────────────────────────────
    genesis: {
        libretroDir: 'Sega - Mega Drive - Genesis',
        romExt: '.md',
        myrientBase: MYRIENT.genesis,
        games: [
            { title: 'Sonic the Hedgehog',                              year: 1991, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Sonic the Hedgehog 2',                            year: 1992, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Sonic the Hedgehog 3',                            year: 1994, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Sonic & Knuckles',                                year: 1994, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Sonic CD',                                        year: 1993, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Sonic Spinball',                                  year: 1993, publisher: 'Sega',              genre: 'Pinball'      },
            { title: 'Streets of Rage',                                 year: 1991, publisher: 'Sega',              genre: 'Beat em Up'   },
            { title: 'Streets of Rage 2',                               year: 1992, publisher: 'Sega',              genre: 'Beat em Up'   },
            { title: 'Streets of Rage 3',                               year: 1994, publisher: 'Sega',              genre: 'Beat em Up'   },
            { title: 'Golden Axe',                                      year: 1989, publisher: 'Sega',              genre: 'Beat em Up'   },
            { title: 'Golden Axe II',                                   year: 1991, publisher: 'Sega',              genre: 'Beat em Up'   },
            { title: 'Golden Axe III',                                  year: 1993, publisher: 'Sega',              genre: 'Beat em Up'   },
            { title: 'Mortal Kombat',                                   year: 1993, publisher: 'Arena',             genre: 'Fighting'     },
            { title: 'Mortal Kombat II',                                year: 1994, publisher: 'Arena',             genre: 'Fighting'     },
            { title: 'Mortal Kombat 3',                                 year: 1995, publisher: 'Williams',          genre: 'Fighting'     },
            { title: 'Street Fighter II: Champion Edition',             year: 1993, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Street Fighter II: Special Champion Edition',     year: 1993, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'X-Men 2: Clone Wars',                             year: 1995, publisher: 'Sega',              genre: 'Action'       },
            { title: 'X-Men',                                           year: 1993, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Aladdin',                                         year: 1993, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'The Lion King',                                   year: 1994, publisher: 'Virgin',            genre: 'Platformer'   },
            { title: 'The Jungle Book',                                 year: 1994, publisher: 'Virgin',            genre: 'Platformer'   },
            { title: 'Earthworm Jim',                                   year: 1994, publisher: 'Shiny',             genre: 'Platformer'   },
            { title: 'Earthworm Jim 2',                                 year: 1995, publisher: 'Shiny',             genre: 'Platformer'   },
            { title: 'Castle of Illusion Starring Mickey Mouse',        year: 1990, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'World of Illusion Starring Mickey Mouse and Donald Duck', year: 1992, publisher: 'Sega',      genre: 'Platformer'   },
            { title: 'Quackshot Starring Donald Duck',                  year: 1991, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Phantasy Star II',                                year: 1989, publisher: 'Sega',              genre: 'RPG'          },
            { title: 'Phantasy Star III: Generations of Doom',          year: 1990, publisher: 'Sega',              genre: 'RPG'          },
            { title: 'Phantasy Star IV: The End of the Millennium',     year: 1993, publisher: 'Sega',              genre: 'RPG'          },
            { title: 'Shining Force',                                   year: 1992, publisher: 'Sega',              genre: 'Strategy RPG' },
            { title: 'Shining Force II',                                year: 1993, publisher: 'Sega',              genre: 'Strategy RPG' },
            { title: 'Shining in the Darkness',                         year: 1991, publisher: 'Sega',              genre: 'RPG'          },
            { title: 'Landstalker: The Treasures of King Nole',         year: 1992, publisher: 'Climax',            genre: 'Action RPG'   },
            { title: 'Alisia Dragoon',                                  year: 1992, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Gunstar Heroes',                                  year: 1993, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Contra: Hard Corps',                              year: 1994, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Alien Soldier',                                   year: 1995, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Comix Zone',                                      year: 1995, publisher: 'Sega',              genre: 'Beat em Up'   },
            { title: 'Vectorman',                                       year: 1995, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Vectorman 2',                                     year: 1996, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Altered Beast',                                   year: 1989, publisher: 'Sega',              genre: 'Beat em Up'   },
            { title: 'Ghouls\'n Ghosts',                                year: 1989, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Super Ghouls\'n Ghosts',                          year: 1992, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Mega Man: The Wily Wars',                         year: 1994, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Castlevania: Bloodlines',                         year: 1994, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Strider',                                         year: 1990, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Rocket Knight Adventures',                        year: 1993, publisher: 'Konami',            genre: 'Platformer'   },
            { title: 'Sparkster',                                       year: 1994, publisher: 'Konami',            genre: 'Platformer'   },
            { title: 'ToeJam & Earl',                                   year: 1991, publisher: 'Sega',              genre: 'Action'       },
            { title: 'ToeJam & Earl in Panic on Funkotron',             year: 1993, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Thunder Force III',                               year: 1990, publisher: 'Technosoft',        genre: 'Shooter'      },
            { title: 'Thunder Force IV',                                year: 1992, publisher: 'Technosoft',        genre: 'Shooter'      },
            { title: 'After Burner II',                                 year: 1990, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Space Harrier II',                                year: 1988, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Ecco the Dolphin',                                year: 1992, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Ecco: The Tides of Time',                         year: 1994, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Battletoads',                                     year: 1994, publisher: 'Rare',              genre: 'Beat em Up'   },
            { title: 'Battletoads & Double Dragon',                     year: 1993, publisher: 'Tradewest',         genre: 'Beat em Up'   },
            { title: 'Double Dragon',                                   year: 1992, publisher: 'Tradewest',         genre: 'Beat em Up'   },
            { title: 'Ultimate Mortal Kombat 3',                        year: 1996, publisher: 'Williams',          genre: 'Fighting'     },
            { title: 'Primal Rage',                                     year: 1995, publisher: 'Time Warner',       genre: 'Fighting'     },
            { title: 'Eternal Champions',                               year: 1993, publisher: 'Sega',              genre: 'Fighting'     },
            { title: 'Killer Instinct',                                 year: 1995, publisher: 'Nintendo',          genre: 'Fighting'     },
            { title: 'Virtua Fighter 2',                                year: 1996, publisher: 'Sega',              genre: 'Fighting'     },
            { title: 'Bio-Hazard Battle',                               year: 1992, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Ristar',                                          year: 1995, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'The Adventures of Batman & Robin',                year: 1994, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Spider-Man: The Animated Series',                 year: 1994, publisher: 'Acclaim',           genre: 'Action'       },
            { title: 'Spider-Man vs. The Kingpin',                      year: 1991, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Splatterhouse 2',                                 year: 1992, publisher: 'Namco',             genre: 'Action'       },
            { title: 'Splatterhouse 3',                                 year: 1993, publisher: 'Namco',             genre: 'Action'       },
            { title: 'Teenage Mutant Ninja Turtles: The Hyperstone Heist', year: 1992, publisher: 'Konami',         genre: 'Beat em Up'   },
            { title: 'Teenage Mutant Ninja Turtles: Tournament Fighters', year: 1993, publisher: 'Konami',          genre: 'Fighting'     },
            { title: 'Zombies Ate My Neighbors',                        year: 1993, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Ranger-X',                                        year: 1993, publisher: 'Gau Entertainment', genre: 'Action'       },
            { title: 'Thunderstrike',                                   year: 1992, publisher: 'Core Design',       genre: 'Action'       },
            { title: 'Flicky',                                          year: 1991, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Marble Madness',                                  year: 1991, publisher: 'Electronic Arts',   genre: 'Puzzle'       },
            { title: 'Tetris',                                          year: 1991, publisher: 'Sega',              genre: 'Puzzle'       },
            { title: 'Columns',                                         year: 1990, publisher: 'Sega',              genre: 'Puzzle'       },
            { title: 'Dr. Robotnik\'s Mean Bean Machine',               year: 1993, publisher: 'Sega',              genre: 'Puzzle'       },
            { title: 'Wiz \'n\' Liz',                                   year: 1993, publisher: 'Psygnosis',         genre: 'Platformer'   },
            { title: 'Bonanza Bros.',                                   year: 1991, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Kid Chameleon',                                   year: 1992, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'General Chaos',                                   year: 1994, publisher: 'Electronic Arts',   genre: 'Strategy'     },
            { title: 'Herzog Zwei',                                     year: 1989, publisher: 'Technosoft',        genre: 'Strategy'     },
            { title: 'Jewel Master',                                    year: 1991, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Ren & Stimpy: Stimpy\'s Invention',               year: 1993, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Animaniacs',                                      year: 1994, publisher: 'Konami',            genre: 'Platformer'   },
            { title: 'Tiny Toon Adventures: Buster\'s Hidden Treasure', year: 1993, publisher: 'Konami',            genre: 'Platformer'   },
            { title: 'Decap Attack',                                    year: 1991, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Columns III: Revenge of Columns',                 year: 1993, publisher: 'Sega',              genre: 'Puzzle'       },
        ],
    },


    // ── GBA ──────────────────────────────────────────────────────────────────
    gba: {
        libretroDir: 'Nintendo - Game Boy Advance',
        romExt: '.gba',
        myrientBase: MYRIENT.gba,
        games: [
            { title: 'Pokemon FireRed Version',                         year: 2004, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Pokemon LeafGreen Version',                       year: 2004, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Pokemon Emerald Version',                         year: 2004, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Pokemon Ruby Version',                            year: 2002, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Pokemon Sapphire Version',                        year: 2002, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'The Legend of Zelda: The Minish Cap',             year: 2004, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'The Legend of Zelda: A Link to the Past & Four Swords', year: 2002, publisher: 'Nintendo',   genre: 'Action RPG'   },
            { title: 'Metroid Fusion',                                  year: 2002, publisher: 'Nintendo',          genre: 'Action'       },
            { title: 'Metroid: Zero Mission',                           year: 2004, publisher: 'Nintendo',          genre: 'Action'       },
            { title: 'Castlevania: Aria of Sorrow',                     year: 2003, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Castlevania: Harmony of Dissonance',              year: 2002, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Castlevania: Circle of the Moon',                 year: 2001, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Mega Man Zero',                                   year: 2002, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Mega Man Zero 2',                                 year: 2003, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Mega Man Zero 3',                                 year: 2004, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Mega Man Zero 4',                                 year: 2005, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Mega Man & Bass',                                 year: 2002, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Super Mario Advance',                             year: 2001, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Super Mario Advance 2: Super Mario World',        year: 2001, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Super Mario Advance 3: Yoshi\'s Island',          year: 2002, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Super Mario Advance 4: Super Mario Bros. 3',      year: 2003, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Kirby: Nightmare in Dream Land',                  year: 2002, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Kirby & the Amazing Mirror',                      year: 2004, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Mario & Luigi: Superstar Saga',                   year: 2003, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Golden Sun',                                      year: 2001, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Golden Sun: The Lost Age',                        year: 2002, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Fire Emblem',                                     year: 2003, publisher: 'Nintendo',          genre: 'Strategy RPG' },
            { title: 'Fire Emblem: The Sacred Stones',                  year: 2004, publisher: 'Nintendo',          genre: 'Strategy RPG' },
            { title: 'Final Fantasy I & II: Dawn of Souls',             year: 2004, publisher: 'Square Enix',       genre: 'RPG'          },
            { title: 'Final Fantasy Tactics Advance',                   year: 2003, publisher: 'Square Enix',       genre: 'Strategy RPG' },
            { title: 'Final Fantasy VI Advance',                        year: 2006, publisher: 'Square Enix',       genre: 'RPG'          },
            { title: 'Final Fantasy V Advance',                         year: 2006, publisher: 'Square Enix',       genre: 'RPG'          },
            { title: 'Final Fantasy IV Advance',                        year: 2005, publisher: 'Square Enix',       genre: 'RPG'          },
            { title: 'Tactics Ogre: The Knight of Lodis',               year: 2001, publisher: 'Atlus',             genre: 'Strategy RPG' },
            { title: 'Riviera: The Promised Land',                      year: 2004, publisher: 'Sting',             genre: 'RPG'          },
            { title: 'Sword of Mana',                                   year: 2003, publisher: 'Square Enix',       genre: 'Action RPG'   },
            { title: 'Summon Night: Swordcraft Story',                  year: 2003, publisher: 'Banpresto',         genre: 'Action RPG'   },
            { title: 'Summon Night: Swordcraft Story 2',                year: 2004, publisher: 'Banpresto',         genre: 'Action RPG'   },
            { title: 'Zelda II: The Adventure of Link',                 year: 2004, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'Advance Wars',                                    year: 2001, publisher: 'Nintendo',          genre: 'Strategy'     },
            { title: 'Advance Wars 2: Black Hole Rising',               year: 2003, publisher: 'Nintendo',          genre: 'Strategy'     },
            { title: 'Sonic Advance',                                   year: 2001, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Sonic Advance 2',                                 year: 2002, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Sonic Advance 3',                                 year: 2004, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Sonic Battle',                                    year: 2003, publisher: 'Sega',              genre: 'Fighting'     },
            { title: 'Wario Land 4',                                    year: 2001, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'WarioWare, Inc.: Mega Microgame$!',               year: 2003, publisher: 'Nintendo',          genre: 'Party'        },
            { title: 'WarioWare: Twisted!',                             year: 2004, publisher: 'Nintendo',          genre: 'Party'        },
            { title: 'Donkey Kong Country',                             year: 2003, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Donkey Kong Country 2',                           year: 2004, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Donkey Kong Country 3',                           year: 2005, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'F-Zero: Maximum Velocity',                        year: 2001, publisher: 'Nintendo',          genre: 'Racing'       },
            { title: 'F-Zero GP Legend',                                year: 2003, publisher: 'Nintendo',          genre: 'Racing'       },
            { title: 'Mario Kart: Super Circuit',                       year: 2001, publisher: 'Nintendo',          genre: 'Racing'       },
            { title: 'Gunstar Super Heroes',                            year: 2005, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Contra Advance: The Alien Wars EX',               year: 2002, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Street Fighter Alpha 3',                          year: 2002, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Mortal Kombat: Deadly Alliance',                  year: 2002, publisher: 'Midway',            genre: 'Fighting'     },
            { title: 'Dragon Ball Z: The Legacy of Goku',               year: 2002, publisher: 'Infogrames',        genre: 'Action RPG'   },
            { title: 'Dragon Ball Z: The Legacy of Goku II',            year: 2003, publisher: 'Infogrames',        genre: 'Action RPG'   },
            { title: 'Dragon Ball Z: Buu\'s Fury',                      year: 2004, publisher: 'Infogrames',        genre: 'Action RPG'   },
            { title: 'Pokemon Mystery Dungeon: Red Rescue Team',        year: 2005, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Harvest Moon: Friends of Mineral Town',           year: 2003, publisher: 'Natsume',           genre: 'Simulation'   },
            { title: 'Harvest Moon: More Friends of Mineral Town',      year: 2003, publisher: 'Natsume',           genre: 'Simulation'   },
            { title: 'The Legend of Zelda: Four Swords Adventures',     year: 2004, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'Mother 3',                                        year: 2006, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Yoshi\'s Island: Super Mario Advance 3',          year: 2002, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Pac-Man Collection',                              year: 2001, publisher: 'Namco',             genre: 'Action'       },
            { title: 'Tetris Worlds',                                   year: 2001, publisher: 'THQ',               genre: 'Puzzle'       },
            { title: 'Dr. Mario & Puzzle League',                       year: 2005, publisher: 'Nintendo',          genre: 'Puzzle'       },
            { title: 'Boktai: The Sun Is in Your Hand',                 year: 2003, publisher: 'Konami',            genre: 'Action RPG'   },
            { title: 'Boktai 2: Solar Boy Django',                      year: 2004, publisher: 'Konami',            genre: 'Action RPG'   },
            { title: 'Shining Soul',                                    year: 2002, publisher: 'Sega',              genre: 'Action RPG'   },
            { title: 'Shining Soul II',                                 year: 2003, publisher: 'Sega',              genre: 'Action RPG'   },
            { title: 'Breath of Fire',                                  year: 2001, publisher: 'Capcom',            genre: 'RPG'          },
            { title: 'Breath of Fire II',                               year: 2002, publisher: 'Capcom',            genre: 'RPG'          },
            { title: 'Ninja Five-O',                                    year: 2003, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Iridion II',                                      year: 2003, publisher: 'Majesco',           genre: 'Shooter'      },
            { title: 'Astro Boy: Omega Factor',                         year: 2004, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Space Invaders',                                  year: 2002, publisher: 'Taito',             genre: 'Shooter'      },
            { title: 'Columns Crown',                                   year: 2002, publisher: 'Sega',              genre: 'Puzzle'       },
            { title: 'Classic NES Series: Super Mario Bros.',           year: 2004, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Classic NES Series: Metroid',                     year: 2004, publisher: 'Nintendo',          genre: 'Action'       },
            { title: 'Classic NES Series: The Legend of Zelda',         year: 2004, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'Classic NES Series: Pac-Man',                     year: 2004, publisher: 'Nintendo',          genre: 'Action'       },
            { title: 'Hamtaro: Ham-Ham Heartbreak',                     year: 2003, publisher: 'Nintendo',          genre: 'Adventure'    },
            { title: 'Charlie and the Chocolate Factory',               year: 2005, publisher: 'Take-Two',          genre: 'Adventure'    },
            { title: 'SpongeBob SquarePants: Battle for Bikini Bottom', year: 2003, publisher: 'THQ',               genre: 'Platformer'   },
            { title: 'Chu Chu Rocket!',                                 year: 2001, publisher: 'Sega',              genre: 'Puzzle'       },
            { title: 'Kuru Kuru Kururin',                               year: 2001, publisher: 'Nintendo',          genre: 'Puzzle'       },
            { title: 'Advance Guardian Heroes',                         year: 2004, publisher: 'Majesco',           genre: 'Beat em Up'   },
            { title: 'River City Ransom EX',                            year: 2004, publisher: 'Atlus',             genre: 'Beat em Up'   },
            { title: 'Rebelstar: Tactical Command',                     year: 2005, publisher: 'Namco',             genre: 'Strategy'     },
            { title: 'Tom Clancy\'s Rainbow Six: Rogue Spear',          year: 2001, publisher: 'Majesco',           genre: 'Action'       },
            { title: 'V-Rally 3',                                       year: 2002, publisher: 'Infogrames',        genre: 'Racing'       },
            { title: 'Top Gear Rally',                                  year: 2003, publisher: 'Kemco',             genre: 'Racing'       },
            { title: 'Mr. Driller 2',                                   year: 2001, publisher: 'Namco',             genre: 'Puzzle'       },
        ],
    },


    // ── Game Boy ──────────────────────────────────────────────────────────────
    gb: {
        libretroDir: 'Nintendo - Game Boy',
        romExt: '.gb',
        myrientBase: MYRIENT.gb,
        games: [
            { title: 'Tetris',                                          year: 1989, publisher: 'Nintendo',          genre: 'Puzzle'       },
            { title: 'Super Mario Land',                                year: 1989, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Super Mario Land 2: 6 Golden Coins',              year: 1992, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: "Kirby's Dream Land",                              year: 1992, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: "Kirby's Dream Land 2",                            year: 1995, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: "The Legend of Zelda: Link's Awakening",           year: 1993, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'Metroid II: Return of Samus',                     year: 1991, publisher: 'Nintendo',          genre: 'Action'       },
            { title: "Pokemon Red Version",                             year: 1996, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: "Pokemon Blue Version",                            year: 1996, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: "Pokemon Yellow Version: Special Pikachu Edition", year: 1998, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: "Donkey Kong",                                     year: 1994, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Wario Land: Super Mario Land 3',                  year: 1994, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Wario Land II',                                   year: 1998, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Mega Man: Dr. Wily\'s Revenge',                   year: 1991, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Mega Man II',                                     year: 1991, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Mega Man III',                                    year: 1992, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Mega Man IV',                                     year: 1993, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Mega Man V',                                      year: 1994, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Castlevania: The Adventure',                      year: 1989, publisher: 'Konami',            genre: 'Action'       },
            { title: "Castlevania II: Belmont's Revenge",               year: 1991, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Castlevania Legends',                             year: 1997, publisher: 'Konami',            genre: 'Action'       },
            { title: "Batman: The Animated Series",                     year: 1993, publisher: 'Konami',            genre: 'Action'       },
            { title: "Gargoyle's Quest",                                year: 1990, publisher: 'Capcom',            genre: 'Action RPG'   },
            { title: 'Ninja Gaiden Shadow',                             year: 1991, publisher: 'Tecmo',             genre: 'Action'       },
            { title: 'Kid Dracula',                                     year: 1990, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Kid Niki: Radical Ninja',                         year: 1992, publisher: 'Data East',         genre: 'Platformer'   },
            { title: 'Adventure Island',                                year: 1992, publisher: 'Hudson Soft',       genre: 'Platformer'   },
            { title: 'Adventure Island II: Aliens in Paradise',         year: 1992, publisher: 'Hudson Soft',       genre: 'Platformer'   },
            { title: 'Avenging Spirit',                                 year: 1992, publisher: 'Jaleco',            genre: 'Action'       },
            { title: 'Battletoads in Ragnarok\'s World',                year: 1993, publisher: 'Tradewest',         genre: 'Beat em Up'   },
            { title: 'Double Dragon',                                   year: 1992, publisher: 'Tradewest',         genre: 'Beat em Up'   },
            { title: 'Solar Striker',                                   year: 1990, publisher: 'Nintendo',          genre: 'Shooter'      },
            { title: 'Nemesis',                                         year: 1990, publisher: 'Konami',            genre: 'Shooter'      },
            { title: 'R-Type',                                          year: 1991, publisher: 'Nintendo',          genre: 'Shooter'      },
            { title: 'Balloon Kid',                                     year: 1990, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: "Alleyway",                                        year: 1989, publisher: 'Nintendo',          genre: 'Action'       },
            { title: "Tennis",                                          year: 1989, publisher: 'Nintendo',          genre: 'Sports'       },
            { title: "Golf",                                            year: 1989, publisher: 'Nintendo',          genre: 'Sports'       },
            { title: "Baseball",                                        year: 1989, publisher: 'Nintendo',          genre: 'Sports'       },
            { title: "F-1 Race",                                        year: 1990, publisher: 'Nintendo',          genre: 'Racing'       },
            { title: 'Bionic Commando',                                 year: 1992, publisher: 'Capcom',            genre: 'Action'       },
            { title: "Blaster Master: Enemy Below",                     year: 1991, publisher: 'Sunsoft',           genre: 'Action'       },
            { title: 'Final Fantasy Adventure',                         year: 1991, publisher: 'Square',            genre: 'Action RPG'   },
            { title: "Final Fantasy Legend",                            year: 1989, publisher: 'Square',            genre: 'RPG'          },
            { title: "Final Fantasy Legend II",                         year: 1990, publisher: 'Square',            genre: 'RPG'          },
            { title: "Final Fantasy Legend III",                        year: 1991, publisher: 'Square',            genre: 'RPG'          },
            { title: 'Amazing Tater',                                   year: 1991, publisher: 'Atlus',             genre: 'Puzzle'       },
            { title: 'Tetris 2',                                        year: 1993, publisher: 'Nintendo',          genre: 'Puzzle'       },
            { title: 'Dr. Mario',                                       year: 1990, publisher: 'Nintendo',          genre: 'Puzzle'       },
            { title: 'Yoshi',                                           year: 1991, publisher: 'Nintendo',          genre: 'Puzzle'       },
            { title: 'Qix',                                             year: 1990, publisher: 'Taito',             genre: 'Puzzle'       },
            { title: 'Kwirk',                                           year: 1989, publisher: 'Acclaim',           genre: 'Puzzle'       },
            { title: "DuckTales",                                       year: 1990, publisher: 'Capcom',            genre: 'Platformer'   },
            { title: "Chip 'n Dale Rescue Rangers",                     year: 1993, publisher: 'Capcom',            genre: 'Platformer'   },
            { title: "Darkwing Duck",                                   year: 1992, publisher: 'Capcom',            genre: 'Platformer'   },
            { title: "Tiny Toon Adventures: Babs' Big Break",           year: 1992, publisher: 'Konami',            genre: 'Platformer'   },
            { title: "Tail Gator",                                      year: 1991, publisher: 'Natsume',           genre: 'Platformer'   },
            { title: "Mystic Quest",                                    year: 1992, publisher: 'Square',            genre: 'RPG'          },
            { title: 'Game & Watch Gallery',                            year: 1997, publisher: 'Nintendo',          genre: 'Action'       },
            { title: 'Game & Watch Gallery 2',                          year: 1997, publisher: 'Nintendo',          genre: 'Action'       },
            { title: 'Game & Watch Gallery 3',                          year: 1999, publisher: 'Nintendo',          genre: 'Action'       },
            { title: "Mole Mania",                                      year: 1996, publisher: 'Nintendo',          genre: 'Puzzle'       },
            { title: "Bugs Bunny Crazy Castle",                         year: 1990, publisher: 'Kemco',             genre: 'Platformer'   },
            { title: "Speedy Gonzales",                                 year: 1994, publisher: 'Acclaim',           genre: 'Platformer'   },
            { title: 'Atomic Punk',                                     year: 1990, publisher: 'Hudson Soft',       genre: 'Action'       },
            { title: 'Bomberman GB',                                    year: 1994, publisher: 'Hudson Soft',       genre: 'Action'       },
            { title: 'Bomberman GB 2',                                  year: 1995, publisher: 'Hudson Soft',       genre: 'Action'       },
            { title: 'Bomberman GB 3',                                  year: 1996, publisher: 'Hudson Soft',       genre: 'Action'       },
            { title: 'Trip World',                                      year: 1992, publisher: 'Sunsoft',           genre: 'Platformer'   },
            { title: "Motocross Maniacs",                               year: 1989, publisher: 'Konami',            genre: 'Racing'       },
            { title: 'Road Rash',                                       year: 1991, publisher: 'Electronic Arts',   genre: 'Racing'       },
            { title: 'Kid Icarus: Of Myths and Monsters',               year: 1991, publisher: 'Nintendo',          genre: 'Action'       },
            { title: "Mickey's Dangerous Chase",                        year: 1992, publisher: 'Capcom',            genre: 'Platformer'   },
            { title: 'Adventures of Star Saver',                        year: 1992, publisher: 'Taito',             genre: 'Action'       },
            { title: "Catrap",                                          year: 1990, publisher: 'Asmik',             genre: 'Puzzle'       },
            { title: 'Sword of Hope II',                                year: 1993, publisher: 'Kemco',             genre: 'RPG'          },
        ],
    },


    // ── Game Boy Color ────────────────────────────────────────────────────────
    gbc: {
        libretroDir: 'Nintendo - Game Boy Color',
        romExt: '.gbc',
        myrientBase: MYRIENT.gbc,
        games: [
            { title: "Pokemon Gold Version",                            year: 1999, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: "Pokemon Silver Version",                          year: 1999, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: "Pokemon Crystal Version",                         year: 2000, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: "The Legend of Zelda: Oracle of Ages",             year: 2001, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: "The Legend of Zelda: Oracle of Seasons",          year: 2001, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: "The Legend of Zelda: Link's Awakening DX",        year: 1998, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: "Shantae",                                         year: 2002, publisher: 'Capcom',            genre: 'Platformer'   },
            { title: "Metal Gear Solid",                                year: 2000, publisher: 'Konami',            genre: 'Action'       },
            { title: "Dragon Warrior Monsters",                         year: 1998, publisher: 'Enix',              genre: 'RPG'          },
            { title: "Dragon Warrior Monsters 2: Cobi's Journey",       year: 2001, publisher: 'Enix',              genre: 'RPG'          },
            { title: "Wario Land 3",                                    year: 2000, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: "Mario Tennis",                                    year: 2001, publisher: 'Nintendo',          genre: 'Sports'       },
            { title: "Mario Golf",                                      year: 1999, publisher: 'Nintendo',          genre: 'Sports'       },
            { title: "Tetris DX",                                       year: 1998, publisher: 'Nintendo',          genre: 'Puzzle'       },
            { title: "Kirby Tilt 'n' Tumble",                           year: 2000, publisher: 'Nintendo',          genre: 'Action'       },
            { title: "Game Boy Color Pokemon Pinball",                  year: 1999, publisher: 'Nintendo',          genre: 'Pinball'      },
            { title: "Bionic Commando: Elite Forces",                   year: 2000, publisher: 'Nintendo',          genre: 'Action'       },
            { title: "Conker's Pocket Tales",                           year: 1999, publisher: 'Rare',              genre: 'Adventure'    },
            { title: "Super Mario Bros. Deluxe",                        year: 1999, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: "Donkey Kong Country",                             year: 2000, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: "Perfect Dark",                                    year: 2000, publisher: 'Nintendo',          genre: 'Action'       },
            { title: "Rayman",                                          year: 1999, publisher: 'Ubisoft',           genre: 'Platformer'   },
            { title: "Survival Kids",                                   year: 1999, publisher: 'Konami',            genre: 'Adventure'    },
            { title: "Castlevania: Legacy of Darkness",                 year: 1999, publisher: 'Konami',            genre: 'Action'       },
            { title: "Harvest Moon GB",                                 year: 1999, publisher: 'Natsume',           genre: 'Simulation'   },
            { title: "Harvest Moon GBC",                                year: 1999, publisher: 'Natsume',           genre: 'Simulation'   },
            { title: "Harvest Moon GBC 2",                              year: 2000, publisher: 'Natsume',           genre: 'Simulation'   },
            { title: "Harvest Moon GBC 3",                              year: 2000, publisher: 'Natsume',           genre: 'Simulation'   },
            { title: "Bomberman Max: Blue Champion",                    year: 2000, publisher: 'Hudson Soft',       genre: 'Action'       },
            { title: "Bomberman Max: Red Challenger",                   year: 2000, publisher: 'Hudson Soft',       genre: 'Action'       },
            { title: "Resident Evil Gaiden",                            year: 2001, publisher: 'Capcom',            genre: 'Action'       },
            { title: "Crystalis",                                       year: 2000, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: "R-Type DX",                                       year: 1999, publisher: 'Nintendo',          genre: 'Shooter'      },
            { title: "Deja Vu I & II: The Casebooks of Ace Harding",    year: 2000, publisher: 'Kemco',             genre: 'Adventure'    },
            { title: "Trade & Battle: Card Hero",                       year: 2000, publisher: 'Nintendo',          genre: 'Card Game'    },
            { title: "Harry Potter and the Philosopher's Stone",        year: 2001, publisher: 'Electronic Arts',   genre: 'RPG'          },
            { title: "Harry Potter and the Chamber of Secrets",         year: 2002, publisher: 'Electronic Arts',   genre: 'RPG'          },
            { title: "Dragon Ball Z: Legendary Super Warriors",         year: 2002, publisher: 'Banpresto',         genre: 'RPG'          },
            { title: "The Legend of the River King 2",                  year: 2000, publisher: 'Natsume',           genre: 'RPG'          },
            { title: "Alone in the Dark: The New Nightmare",            year: 2001, publisher: 'Infogrames',        genre: 'Action'       },
            { title: "Azure Dreams",                                    year: 2000, publisher: 'Konami',            genre: 'RPG'          },
            { title: "Game & Watch Gallery 2",                          year: 1997, publisher: 'Nintendo',          genre: 'Action'       },
            { title: "Game & Watch Gallery 3",                          year: 1999, publisher: 'Nintendo',          genre: 'Action'       },
            { title: "Ghosts 'n Goblins",                               year: 2000, publisher: 'Capcom',            genre: 'Action'       },
            { title: "Toki Tori",                                       year: 2001, publisher: 'Capcom',            genre: 'Puzzle'       },
            { title: "Spider-Man",                                      year: 2000, publisher: 'Activision',        genre: 'Action'       },
            { title: "X-Men: Mutant Wars",                              year: 2000, publisher: 'Activision',        genre: 'Action'       },
            { title: "Mega Man Xtreme",                                 year: 2001, publisher: 'Capcom',            genre: 'Action'       },
            { title: "Mega Man Xtreme 2",                               year: 2002, publisher: 'Capcom',            genre: 'Action'       },
            { title: "Battletoads",                                     year: 2000, publisher: 'Tradewest',         genre: 'Beat em Up'   },
            { title: "Giga Wing",                                       year: 2000, publisher: 'Capcom',            genre: 'Shooter'      },
            { title: "Frogger",                                         year: 1998, publisher: 'Hasbro',            genre: 'Action'       },
            { title: "Looney Tunes Collector: Alert!",                  year: 2000, publisher: 'Infogrames',        genre: 'Platformer'   },
            { title: "Pocket Bomberman",                                year: 1997, publisher: 'Hudson Soft',       genre: 'Action'       },
            { title: "Grand Theft Auto",                                year: 1999, publisher: 'Rockstar',          genre: 'Action'       },
            { title: "Grand Theft Auto 2",                              year: 2000, publisher: 'Rockstar',          genre: 'Action'       },
            { title: "Pop'n TwinBee",                                   year: 1999, publisher: 'Konami',            genre: 'Shooter'      },
            { title: "BattleCity",                                      year: 1999, publisher: 'Namco',             genre: 'Action'       },
            { title: "Buffy the Vampire Slayer",                        year: 2000, publisher: 'THQ',               genre: 'Action'       },
            { title: "The Smurfs: Nightmare in Dream Land",             year: 2002, publisher: 'Infogrames',        genre: 'Platformer'   },
            { title: "Centipede",                                       year: 1998, publisher: 'Hasbro',            genre: 'Shooter'      },
        ],
    },


    // ── Nintendo 64 ───────────────────────────────────────────────────────────
    n64: {
        libretroDir: 'Nintendo - Nintendo 64',
        romExt: '.z64',
        myrientBase: MYRIENT.n64,
        games: [
            { title: 'Super Mario 64',                                  year: 1996, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'The Legend of Zelda: Ocarina of Time',            year: 1998, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'The Legend of Zelda: Majora\'s Mask',             year: 2000, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'Mario Kart 64',                                   year: 1996, publisher: 'Nintendo',          genre: 'Racing'       },
            { title: 'Super Smash Bros.',                               year: 1999, publisher: 'Nintendo',          genre: 'Fighting'     },
            { title: 'Donkey Kong 64',                                  year: 1999, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Banjo-Kazooie',                                   year: 1998, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Banjo-Tooie',                                     year: 2000, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: "Diddy Kong Racing",                               year: 1997, publisher: 'Nintendo',          genre: 'Racing'       },
            { title: "Yoshi's Story",                                   year: 1997, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: "Kirby 64: The Crystal Shards",                    year: 2000, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Star Fox 64',                                     year: 1997, publisher: 'Nintendo',          genre: 'Shooter'      },
            { title: 'F-Zero X',                                        year: 1998, publisher: 'Nintendo',          genre: 'Racing'       },
            { title: 'Wave Race 64',                                    year: 1996, publisher: 'Nintendo',          genre: 'Racing'       },
            { title: '1080 Snowboarding',                               year: 1998, publisher: 'Nintendo',          genre: 'Sports'       },
            { title: 'Excitebike 64',                                   year: 2000, publisher: 'Nintendo',          genre: 'Racing'       },
            { title: "Paper Mario",                                     year: 2000, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: "Mario Party",                                     year: 1998, publisher: 'Nintendo',          genre: 'Party'        },
            { title: "Mario Party 2",                                   year: 1999, publisher: 'Nintendo',          genre: 'Party'        },
            { title: "Mario Party 3",                                   year: 2000, publisher: 'Nintendo',          genre: 'Party'        },
            { title: "Mario Tennis",                                    year: 2000, publisher: 'Nintendo',          genre: 'Sports'       },
            { title: "Mario Golf",                                      year: 1999, publisher: 'Nintendo',          genre: 'Sports'       },
            { title: "Pokemon Snap",                                    year: 1999, publisher: 'Nintendo',          genre: 'Action'       },
            { title: "Pokemon Stadium",                                 year: 1999, publisher: 'Nintendo',          genre: 'Action'       },
            { title: "Pokemon Stadium 2",                               year: 2000, publisher: 'Nintendo',          genre: 'Action'       },
            { title: "GoldenEye 007",                                   year: 1997, publisher: 'Nintendo',          genre: 'Shooter'      },
            { title: "Perfect Dark",                                    year: 2000, publisher: 'Nintendo',          genre: 'Shooter'      },
            { title: "Conker's Bad Fur Day",                            year: 2001, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: "Jet Force Gemini",                                year: 1999, publisher: 'Nintendo',          genre: 'Action'       },
            { title: "Killer Instinct Gold",                            year: 1996, publisher: 'Nintendo',          genre: 'Fighting'     },
            { title: "Mortal Kombat Trilogy",                           year: 1996, publisher: 'Williams',          genre: 'Fighting'     },
            { title: "Mortal Kombat 4",                                 year: 1997, publisher: 'Midway',            genre: 'Fighting'     },
            { title: "Doom 64",                                         year: 1997, publisher: 'Midway',            genre: 'Shooter'      },
            { title: "Quake",                                           year: 1996, publisher: 'id Software',       genre: 'Shooter'      },
            { title: "Quake II",                                        year: 1999, publisher: 'Activision',        genre: 'Shooter'      },
            { title: "Turok: Dinosaur Hunter",                          year: 1997, publisher: 'Acclaim',           genre: 'Shooter'      },
            { title: "Turok 2: Seeds of Evil",                          year: 1998, publisher: 'Acclaim',           genre: 'Shooter'      },
            { title: "Turok 3: Shadow of Oblivion",                     year: 2000, publisher: 'Acclaim',           genre: 'Shooter'      },
            { title: "Castlevania",                                     year: 1999, publisher: 'Konami',            genre: 'Action'       },
            { title: "Castlevania: Legacy of Darkness",                 year: 1999, publisher: 'Konami',            genre: 'Action'       },
            { title: "Rayman 2: The Great Escape",                      year: 1999, publisher: 'Ubisoft',           genre: 'Platformer'   },
            { title: "Bomberman 64",                                    year: 1997, publisher: 'Hudson Soft',       genre: 'Action'       },
            { title: "Bomberman Hero",                                  year: 1998, publisher: 'Hudson Soft',       genre: 'Action'       },
            { title: "Bomberman 64: The Second Attack",                 year: 1999, publisher: 'Hudson Soft',       genre: 'Action'       },
            { title: "Mischief Makers",                                 year: 1997, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: "Snowboard Kids",                                  year: 1997, publisher: 'Atlus',             genre: 'Racing'       },
            { title: "Snowboard Kids 2",                                year: 1999, publisher: 'Atlus',             genre: 'Racing'       },
            { title: "Road Rash 64",                                    year: 1999, publisher: 'Electronic Arts',   genre: 'Racing'       },
            { title: "Mystical Ninja Starring Goemon",                  year: 1997, publisher: 'Konami',            genre: 'Action'       },
            { title: "Goemon's Great Adventure",                        year: 1998, publisher: 'Konami',            genre: 'Platformer'   },
            { title: "Space Station Silicon Valley",                    year: 1998, publisher: 'Nintendo',          genre: 'Puzzle'       },
            { title: "Ogre Battle 64: Person of Lordly Caliber",        year: 1999, publisher: 'Nintendo',          genre: 'Strategy RPG' },
            { title: "Quest 64",                                        year: 1998, publisher: 'THQ',               genre: 'RPG'          },
            { title: "Harvest Moon 64",                                 year: 1999, publisher: 'Natsume',           genre: 'Simulation'   },
            { title: "Space Invaders",                                  year: 1999, publisher: 'Taito',             genre: 'Shooter'      },
            { title: "Toy Story 2: Buzz Lightyear to the Rescue",       year: 1999, publisher: 'Activision',        genre: 'Platformer'   },
            { title: "Spiderman",                                       year: 2000, publisher: 'Activision',        genre: 'Action'       },
            { title: "Tony Hawk's Pro Skater",                          year: 1999, publisher: 'Activision',        genre: 'Sports'       },
            { title: "Tony Hawk's Pro Skater 2",                        year: 2000, publisher: 'Activision',        genre: 'Sports'       },
            { title: "Tony Hawk's Pro Skater 3",                        year: 2001, publisher: 'Activision',        genre: 'Sports'       },
            { title: "Wayne Gretzky's 3D Hockey",                       year: 1996, publisher: 'Nintendo',          genre: 'Sports'       },
            { title: "NFL Blitz",                                       year: 1998, publisher: 'Midway',            genre: 'Sports'       },
            { title: "Wrestlemania 2000",                               year: 1999, publisher: 'THQ',               genre: 'Sports'       },
            { title: "WWF No Mercy",                                    year: 2000, publisher: 'THQ',               genre: 'Sports'       },
            { title: "Starcraft 64",                                    year: 2000, publisher: 'Nintendo',          genre: 'Strategy'     },
            { title: "Buck Bumble",                                     year: 1998, publisher: 'Ubisoft',           genre: 'Action'       },
            { title: "Body Harvest",                                    year: 1998, publisher: 'DMA Design',        genre: 'Action'       },
            { title: "Glover",                                          year: 1998, publisher: 'Hasbro',            genre: 'Platformer'   },
            { title: "Mega Man 64",                                     year: 2000, publisher: 'Capcom',            genre: 'Action RPG'   },
            { title: "Aidyn Chronicles: The First Mage",                year: 2001, publisher: 'THQ',               genre: 'RPG'          },
            { title: "Wetrix",                                          year: 1998, publisher: 'Ocean',             genre: 'Puzzle'       },
            { title: "Tetrisphere",                                     year: 1997, publisher: 'Nintendo',          genre: 'Puzzle'       },
            { title: "Bust-A-Move 3 DX",                                year: 1997, publisher: 'Taito',             genre: 'Puzzle'       },
            { title: "Hey You, Pikachu!",                               year: 1998, publisher: 'Nintendo',          genre: 'Simulation'   },
            { title: "Command & Conquer",                               year: 1999, publisher: 'EA Games',          genre: 'Strategy'     },
            { title: "Lode Runner 3-D",                                 year: 1999, publisher: 'Hudson Soft',       genre: 'Puzzle'       },
            { title: "Dr. Mario 64",                                    year: 2001, publisher: 'Nintendo',          genre: 'Puzzle'       },
        ],
    },


    // ── Atari 2600 ────────────────────────────────────────────────────────────
    atari2600: {
        libretroDir: 'Atari - 2600',
        romExt: '.a26',
        myrientBase: MYRIENT.atari2600,
        games: [
            { title: 'Space Invaders',                                  year: 1980, publisher: 'Atari',             genre: 'Shooter'      },
            { title: 'Pitfall!',                                        year: 1982, publisher: 'Activision',        genre: 'Platformer'   },
            { title: 'Pitfall II: Lost Caverns',                        year: 1984, publisher: 'Activision',        genre: 'Platformer'   },
            { title: 'Pac-Man',                                         year: 1982, publisher: 'Atari',             genre: 'Action'       },
            { title: 'Asteroids',                                       year: 1981, publisher: 'Atari',             genre: 'Shooter'      },
            { title: 'Breakout',                                        year: 1978, publisher: 'Atari',             genre: 'Action'       },
            { title: 'Super Breakout',                                  year: 1982, publisher: 'Atari',             genre: 'Action'       },
            { title: 'Missile Command',                                 year: 1981, publisher: 'Atari',             genre: 'Action'       },
            { title: 'Centipede',                                       year: 1982, publisher: 'Atari',             genre: 'Shooter'      },
            { title: 'Millipede',                                       year: 1984, publisher: 'Atari',             genre: 'Shooter'      },
            { title: 'Galaga',                                          year: 1987, publisher: 'Atari',             genre: 'Shooter'      },
            { title: 'Donkey Kong',                                     year: 1982, publisher: 'Atari',             genre: 'Platformer'   },
            { title: 'Donkey Kong Jr.',                                 year: 1983, publisher: 'Atari',             genre: 'Platformer'   },
            { title: 'Frogger',                                         year: 1981, publisher: 'Parker Bros.',      genre: 'Action'       },
            { title: 'Frogger II: Threedeep!',                          year: 1984, publisher: 'Parker Bros.',      genre: 'Action'       },
            { title: 'River Raid',                                      year: 1982, publisher: 'Activision',        genre: 'Shooter'      },
            { title: 'River Raid II',                                   year: 1988, publisher: 'Activision',        genre: 'Shooter'      },
            { title: 'Kaboom!',                                         year: 1981, publisher: 'Activision',        genre: 'Action'       },
            { title: 'Boxing',                                          year: 1980, publisher: 'Activision',        genre: 'Sports'       },
            { title: 'Chopper Command',                                 year: 1982, publisher: 'Activision',        genre: 'Shooter'      },
            { title: 'Enduro',                                          year: 1983, publisher: 'Activision',        genre: 'Racing'       },
            { title: 'Skiing',                                          year: 1980, publisher: 'Activision',        genre: 'Sports'       },
            { title: 'Barnstorming',                                    year: 1982, publisher: 'Activision',        genre: 'Action'       },
            { title: 'Freeway',                                         year: 1981, publisher: 'Activision',        genre: 'Action'       },
            { title: 'Dragster',                                        year: 1980, publisher: 'Activision',        genre: 'Racing'       },
            { title: 'Grand Prix',                                      year: 1982, publisher: 'Activision',        genre: 'Racing'       },
            { title: 'Tennis',                                          year: 1981, publisher: 'Activision',        genre: 'Sports'       },
            { title: 'Spider-Man',                                      year: 1982, publisher: 'Parker Bros.',      genre: 'Action'       },
            { title: 'Empire Strikes Back',                             year: 1982, publisher: 'Parker Bros.',      genre: 'Shooter'      },
            { title: 'Star Wars: The Arcade Game',                      year: 1984, publisher: 'Parker Bros.',      genre: 'Shooter'      },
            { title: 'Q*bert',                                          year: 1983, publisher: 'Parker Bros.',      genre: 'Puzzle'       },
            { title: 'Popeye',                                          year: 1983, publisher: 'Parker Bros.',      genre: 'Platformer'   },
            { title: 'Defender',                                        year: 1982, publisher: 'Atari',             genre: 'Shooter'      },
            { title: 'Defender II',                                     year: 1987, publisher: 'Atari',             genre: 'Shooter'      },
            { title: 'Berzerk',                                         year: 1982, publisher: 'Atari',             genre: 'Shooter'      },
            { title: 'Haunted House',                                   year: 1982, publisher: 'Atari',             genre: 'Action'       },
            { title: 'Adventure',                                       year: 1980, publisher: 'Atari',             genre: 'Adventure'    },
            { title: 'Superman',                                        year: 1979, publisher: 'Atari',             genre: 'Action'       },
            { title: 'Combat',                                          year: 1977, publisher: 'Atari',             genre: 'Action'       },
            { title: 'Air-Sea Battle',                                  year: 1977, publisher: 'Atari',             genre: 'Shooter'      },
            { title: 'Video Pinball',                                   year: 1981, publisher: 'Atari',             genre: 'Pinball'      },
            { title: 'Night Driver',                                    year: 1980, publisher: 'Atari',             genre: 'Racing'       },
            { title: 'Slot Racers',                                     year: 1978, publisher: 'Atari',             genre: 'Racing'       },
            { title: 'Dodge Em',                                        year: 1980, publisher: 'Atari',             genre: 'Racing'       },
            { title: 'Sprint Master',                                   year: 1988, publisher: 'Atari',             genre: 'Racing'       },
            { title: 'Pele\'s Soccer',                                  year: 1980, publisher: 'Atari',             genre: 'Sports'       },
            { title: 'Basketball',                                      year: 1978, publisher: 'Atari',             genre: 'Sports'       },
            { title: 'Human Cannonball',                                year: 1979, publisher: 'Atari',             genre: 'Action'       },
            { title: 'Jungle Hunt',                                     year: 1983, publisher: 'Atari',             genre: 'Platformer'   },
            { title: 'Yars\' Revenge',                                  year: 1982, publisher: 'Atari',             genre: 'Shooter'      },
            { title: 'Solaris',                                         year: 1986, publisher: 'Atari',             genre: 'Shooter'      },
            { title: 'Vanguard',                                        year: 1982, publisher: 'Centuri',           genre: 'Shooter'      },
            { title: 'Phoenix',                                         year: 1982, publisher: 'Atari',             genre: 'Shooter'      },
            { title: 'Demon Attack',                                    year: 1982, publisher: 'Imagic',            genre: 'Shooter'      },
            { title: 'Atlantis',                                        year: 1982, publisher: 'Imagic',            genre: 'Action'       },
            { title: 'Cosmic Ark',                                      year: 1982, publisher: 'Imagic',            genre: 'Shooter'      },
            { title: 'Starmaster',                                      year: 1982, publisher: 'Activision',        genre: 'Action'       },
            { title: 'Stampede',                                        year: 1981, publisher: 'Activision',        genre: 'Action'       },
            { title: 'Laser Blast',                                     year: 1981, publisher: 'Activision',        genre: 'Shooter'      },
            { title: 'Ice Hockey',                                      year: 1981, publisher: 'Activision',        genre: 'Sports'       },
            { title: 'Seaquest',                                        year: 1983, publisher: 'Activision',        genre: 'Shooter'      },
            { title: 'H.E.R.O.',                                        year: 1984, publisher: 'Activision',        genre: 'Action'       },
            { title: 'Stargunner',                                      year: 1982, publisher: 'Telesys',           genre: 'Shooter'      },
            { title: 'Joust',                                           year: 1983, publisher: 'Atari',             genre: 'Action'       },
            { title: 'Ms. Pac-Man',                                     year: 1983, publisher: 'Atari',             genre: 'Action'       },
            { title: 'Jr. Pac-Man',                                     year: 1986, publisher: 'Atari',             genre: 'Action'       },
            { title: 'Gorf',                                            year: 1982, publisher: 'CBS Electronics',   genre: 'Shooter'      },
            { title: 'Warlords',                                        year: 1981, publisher: 'Atari',             genre: 'Action'       },
            { title: 'Swordquest: EarthWorld',                          year: 1982, publisher: 'Atari',             genre: 'Adventure'    },
            { title: 'Indy 500',                                        year: 1978, publisher: 'Atari',             genre: 'Racing'       },
            { title: 'Motocross Racer',                                 year: 1983, publisher: 'Xonox',             genre: 'Racing'       },
            { title: 'Space Shuttle: A Journey Into Space',             year: 1983, publisher: 'Activision',        genre: 'Simulation'   },
            { title: 'Megamania',                                       year: 1982, publisher: 'Activision',        genre: 'Shooter'      },
            { title: 'Activision Decathlon',                            year: 1983, publisher: 'Activision',        genre: 'Sports'       },
            { title: 'Keystone Kapers',                                 year: 1983, publisher: 'Activision',        genre: 'Action'       },
            { title: 'Plaque Attack',                                   year: 1983, publisher: 'Activision',        genre: 'Action'       },
            { title: 'Spider Fighter',                                  year: 1982, publisher: 'Activision',        genre: 'Shooter'      },
            { title: 'Dark Chambers',                                   year: 1988, publisher: 'Atari',             genre: 'Action'       },
        ],
    },


    // ── Sega Master System ────────────────────────────────────────────────────
    sms: {
        libretroDir: 'Sega - Master System - Mark III',
        romExt: '.sms',
        myrientBase: MYRIENT.sms,
        games: [
            { title: 'Sonic the Hedgehog',                              year: 1991, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Sonic the Hedgehog 2',                            year: 1992, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Alex Kidd in Miracle World',                      year: 1986, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Alex Kidd: The Lost Stars',                       year: 1988, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Alex Kidd in Shinobi World',                      year: 1990, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Castle of Illusion Starring Mickey Mouse',        year: 1990, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Wonder Boy',                                      year: 1986, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Wonder Boy in Monster Land',                      year: 1988, publisher: 'Sega',              genre: 'Action RPG'   },
            { title: 'Wonder Boy III: The Dragon\'s Trap',              year: 1989, publisher: 'Sega',              genre: 'Action RPG'   },
            { title: 'Phantasy Star',                                   year: 1987, publisher: 'Sega',              genre: 'RPG'          },
            { title: 'Ys: The Vanished Omens',                          year: 1988, publisher: 'Sega',              genre: 'Action RPG'   },
            { title: 'Golvellius: Valley of Doom',                      year: 1988, publisher: 'Sega',              genre: 'Action RPG'   },
            { title: 'Golden Axe Warrior',                              year: 1991, publisher: 'Sega',              genre: 'Action RPG'   },
            { title: 'Ultima IV: Quest of the Avatar',                  year: 1990, publisher: 'Sega',              genre: 'RPG'          },
            { title: 'Master of Darkness',                              year: 1992, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Ninja Gaiden',                                    year: 1992, publisher: 'Sega',              genre: 'Action'       },
            { title: 'R-Type',                                          year: 1988, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'After Burner',                                    year: 1987, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Space Harrier',                                   year: 1986, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Zaxxon',                                          year: 1985, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Hang-On',                                         year: 1985, publisher: 'Sega',              genre: 'Racing'       },
            { title: 'Enduro Racer',                                    year: 1987, publisher: 'Sega',              genre: 'Racing'       },
            { title: 'OutRun',                                          year: 1987, publisher: 'Sega',              genre: 'Racing'       },
            { title: 'Turbo Outrun',                                    year: 1992, publisher: 'Sega',              genre: 'Racing'       },
            { title: 'Road Rash',                                       year: 1993, publisher: 'Electronic Arts',   genre: 'Racing'       },
            { title: 'Kenseiden',                                       year: 1988, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Black Belt',                                      year: 1986, publisher: 'Sega',              genre: 'Beat em Up'   },
            { title: 'Double Dragon',                                   year: 1988, publisher: 'Sega',              genre: 'Beat em Up'   },
            { title: 'Streets of Rage',                                 year: 1992, publisher: 'Sega',              genre: 'Beat em Up'   },
            { title: 'Shinobi',                                         year: 1988, publisher: 'Sega',              genre: 'Action'       },
            { title: 'The Ninja',                                       year: 1986, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Zillion',                                         year: 1987, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Zillion II: The Tri Formation',                   year: 1987, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Penguin Land',                                    year: 1987, publisher: 'Sega',              genre: 'Puzzle'       },
            { title: 'Tetris',                                          year: 1988, publisher: 'Sega',              genre: 'Puzzle'       },
            { title: 'Columns',                                         year: 1990, publisher: 'Sega',              genre: 'Puzzle'       },
            { title: 'Putt & Putter',                                   year: 1991, publisher: 'Sega',              genre: 'Sports'       },
            { title: 'Tennis Ace',                                      year: 1989, publisher: 'Sega',              genre: 'Sports'       },
            { title: 'Aerial Assault',                                  year: 1990, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Cloud Master',                                    year: 1988, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Galaga',                                          year: 1991, publisher: 'Namco',             genre: 'Shooter'      },
            { title: 'Fantasy Zone',                                    year: 1986, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Fantasy Zone II: The Tears of Opa-Opa',           year: 1987, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Galaxy Force',                                    year: 1990, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Missile Defense 3-D',                             year: 1987, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Rampage',                                         year: 1988, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Ghouls\'n Ghosts',                                year: 1990, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Ghostbusters',                                    year: 1985, publisher: 'Sega',              genre: 'Action'       },
            { title: 'The Simpsons: Bart vs. the Space Mutants',        year: 1992, publisher: 'Acclaim',           genre: 'Platformer'   },
            { title: 'Micro Machines 2',                                year: 1994, publisher: 'Codemasters',       genre: 'Racing'       },
        ],
    },


    // ── Game Gear ─────────────────────────────────────────────────────────────
    gamegear: {
        libretroDir: 'Sega - Game Gear',
        romExt: '.gg',
        myrientBase: MYRIENT.gamegear,
        games: [
            { title: 'Sonic the Hedgehog',                              year: 1991, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Sonic the Hedgehog 2',                            year: 1992, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Sonic Chaos',                                     year: 1993, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Sonic Triple Trouble',                            year: 1994, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Sonic Drift',                                     year: 1994, publisher: 'Sega',              genre: 'Racing'       },
            { title: 'Sonic Drift 2',                                   year: 1995, publisher: 'Sega',              genre: 'Racing'       },
            { title: 'Sonic Labyrinth',                                 year: 1995, publisher: 'Sega',              genre: 'Puzzle'       },
            { title: 'Sonic Blast',                                     year: 1996, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Tails Adventure',                                 year: 1995, publisher: 'Sega',              genre: 'Action RPG'   },
            { title: 'Tails Sky Patrol',                                year: 1995, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Shining Force: The Sword of Hajya',               year: 1993, publisher: 'Sega',              genre: 'Strategy RPG' },
            { title: 'Shining Force Gaiden',                            year: 1992, publisher: 'Sega',              genre: 'Strategy RPG' },
            { title: 'Shinobi',                                         year: 1991, publisher: 'Sega',              genre: 'Action'       },
            { title: 'The GG Shinobi',                                  year: 1991, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Columns',                                         year: 1990, publisher: 'Sega',              genre: 'Puzzle'       },
            { title: 'Dragon Crystal',                                  year: 1991, publisher: 'Sega',              genre: 'RPG'          },
            { title: 'Castle of Illusion Starring Mickey Mouse',        year: 1991, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Land of Illusion Starring Mickey Mouse',          year: 1993, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Defenders of Oasis',                              year: 1992, publisher: 'Sega',              genre: 'RPG'          },
            { title: 'Ristar',                                          year: 1995, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Ecco the Dolphin',                                year: 1993, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Mortal Kombat',                                   year: 1993, publisher: 'Acclaim',           genre: 'Fighting'     },
            { title: 'Mortal Kombat II',                                year: 1994, publisher: 'Acclaim',           genre: 'Fighting'     },
            { title: 'Street Fighter II',                               year: 1995, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Fatal Fury Special',                              year: 1994, publisher: 'SNK',               genre: 'Fighting'     },
            { title: 'NBA Jam',                                         year: 1994, publisher: 'Acclaim',           genre: 'Sports'       },
            { title: 'Halley Wars',                                     year: 1991, publisher: 'Taito',             genre: 'Shooter'      },
            { title: 'GG Aleste',                                       year: 1991, publisher: 'Compile',           genre: 'Shooter'      },
            { title: 'GG Aleste II',                                    year: 1993, publisher: 'Compile',           genre: 'Shooter'      },
            { title: 'Space Harrier',                                   year: 1991, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Aerial Assault',                                  year: 1991, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Puyo Puyo',                                       year: 1991, publisher: 'Compile',           genre: 'Puzzle'       },
            { title: 'Puyo Puyo 2',                                     year: 1994, publisher: 'Compile',           genre: 'Puzzle'       },
            { title: 'Tetris',                                          year: 1991, publisher: 'Sega',              genre: 'Puzzle'       },
            { title: 'Dr. Robotnik\'s Mean Bean Machine',               year: 1993, publisher: 'Sega',              genre: 'Puzzle'       },
            { title: 'Coca-Cola Kid',                                   year: 1994, publisher: 'Aspect',            genre: 'Platformer'   },
            { title: 'Wonder Boy in Monster World',                     year: 1992, publisher: 'Sega',              genre: 'Action RPG'   },
            { title: 'Wonder Boy: The Dragon\'s Trap',                  year: 1992, publisher: 'Sega',              genre: 'Action RPG'   },
            { title: 'Alex Kidd in Shinobi World',                      year: 1990, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Fantasy Zone',                                    year: 1991, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Ax Battler: A Legend of Golden Axe',              year: 1992, publisher: 'Sega',              genre: 'Action RPG'   },
            { title: 'Baku Baku Animal',                                year: 1996, publisher: 'Sega',              genre: 'Puzzle'       },
            { title: 'Mega Man',                                        year: 1995, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Jungle Book',                                     year: 1994, publisher: 'Virgin',            genre: 'Platformer'   },
            { title: 'The Lion King',                                   year: 1994, publisher: 'Virgin',            genre: 'Platformer'   },
            { title: 'Aladdin',                                         year: 1994, publisher: 'Virgin',            genre: 'Platformer'   },
            { title: 'Gear Works',                                      year: 1993, publisher: 'Sega',              genre: 'Puzzle'       },
            { title: 'Zaxxon: Motherbase 2000',                         year: 1995, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Popils',                                          year: 1991, publisher: 'Tengen',            genre: 'Puzzle'       },
            { title: 'Panzer Dragoon Mini',                             year: 1996, publisher: 'Sega',              genre: 'Shooter'      },
        ],
    },

    // ── Sega Saturn ───────────────────────────────────────────────────────────
    saturn: {
        libretroDir: 'Sega - Saturn',
        romExt: '.chd',
        myrientBase: MYRIENT.saturn,
        games: [
            { title: 'Panzer Dragoon Saga',                             year: 1998, publisher: 'Sega',              genre: 'RPG'          },
            { title: 'Guardian Heroes',                                 year: 1996, publisher: 'Sega',              genre: 'Beat em Up'   },
            { title: 'Castlevania: Symphony of the Night',              year: 1997, publisher: 'Konami',            genre: 'Action RPG'   },
            { title: 'Radiant Silvergun',                               year: 1998, publisher: 'Treasure',          genre: 'Shooter'      },
            { title: 'Nights into Dreams',                              year: 1996, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Dragon Force',                                    year: 1996, publisher: 'Sega',              genre: 'Strategy'     },
            { title: 'Shining Force III',                               year: 1997, publisher: 'Sega',              genre: 'Strategy RPG' },
            { title: 'Virtua Fighter 2',                                year: 1995, publisher: 'Sega',              genre: 'Fighting'     },
            { title: 'Virtua Cop',                                      year: 1995, publisher: 'Sega',              genre: 'Light Gun'    },
            { title: 'Virtua Cop 2',                                    year: 1996, publisher: 'Sega',              genre: 'Light Gun'    },
            { title: 'Sega Rally Championship',                         year: 1995, publisher: 'Sega',              genre: 'Racing'       },
            { title: 'Daytona USA',                                     year: 1994, publisher: 'Sega',              genre: 'Racing'       },
            { title: 'Tomb Raider',                                     year: 1996, publisher: 'Eidos',             genre: 'Action'       },
            { title: 'Darius Gaiden',                                   year: 1995, publisher: 'Taito',             genre: 'Shooter'      },
            { title: 'Dungeons & Dragons Collection',                   year: 1999, publisher: 'Capcom',            genre: 'Beat em Up'   },
            { title: 'Virtua Fighter',                                  year: 1994, publisher: 'Sega',              genre: 'Fighting'     },
            { title: 'Dark Savior',                                     year: 1996, publisher: 'Climax Entertainment', genre: 'Action RPG'},
            { title: 'Saturn Bomberman',                                year: 1996, publisher: 'Hudson Soft',       genre: 'Action'       },
            { title: 'Burning Rangers',                                 year: 1998, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Shinobi Legions',                                 year: 1995, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Street Fighter Alpha 2',                          year: 1996, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Street Fighter Alpha 3',                          year: 1998, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'X-Men vs. Street Fighter',                        year: 1997, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Marvel Super Heroes vs. Street Fighter',          year: 1998, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Marvel Super Heroes',                             year: 1997, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'The King of Fighters \'97',                       year: 1997, publisher: 'SNK',               genre: 'Fighting'     },
            { title: 'Samurai Shodown IV',                              year: 1997, publisher: 'SNK',               genre: 'Fighting'     },
            { title: 'Wipeout 2097',                                    year: 1996, publisher: 'Psygnosis',         genre: 'Racing'       },
            { title: 'Die Hard Arcade',                                 year: 1996, publisher: 'Sega',              genre: 'Beat em Up'   },
            { title: 'Alien Trilogy',                                   year: 1996, publisher: 'Acclaim',           genre: 'FPS'          },
            { title: 'Quake',                                           year: 1997, publisher: 'GT Interactive',    genre: 'FPS'          },
            { title: 'Duke Nukem 3D',                                   year: 1997, publisher: '3DO',               genre: 'FPS'          },
            { title: 'Mortal Kombat Trilogy',                           year: 1996, publisher: 'Midway',            genre: 'Fighting'     },
            { title: 'Mortal Kombat 3',                                 year: 1996, publisher: 'Williams',          genre: 'Fighting'     },
            { title: 'Ghen War',                                        year: 1995, publisher: 'Micronet',          genre: 'Action'       },
            { title: 'Panzer Dragoon',                                  year: 1995, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Panzer Dragoon II Zwei',                          year: 1996, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Enemy Zero',                                      year: 1996, publisher: 'Sega',              genre: 'Survival Horror'},
            { title: 'Bulk Slash',                                      year: 1997, publisher: 'Hudson Soft',       genre: 'Action'       },
            { title: 'Albert Odyssey: Legend of Eldean',                year: 1997, publisher: 'Working Designs',   genre: 'RPG'          },
            { title: 'Shining the Holy Ark',                            year: 1997, publisher: 'Sega',              genre: 'RPG'          },
            { title: 'Magic Knight Rayearth',                           year: 1998, publisher: 'Working Designs',   genre: 'Action RPG'   },
            { title: 'Dragon Ball Z: The Legend',                       year: 1996, publisher: 'Bandai',            genre: 'Fighting'     },
            { title: 'Grandia',                                         year: 1997, publisher: 'Game Arts',         genre: 'RPG'          },
            { title: 'Astal',                                           year: 1995, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Clockwork Knight',                                year: 1994, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Bug!',                                            year: 1995, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Elevator Action Returns',                         year: 1995, publisher: 'Taito',             genre: 'Action'       },
            { title: 'Layer Section',                                   year: 1995, publisher: 'Taito',             genre: 'Shooter'      },
            { title: 'NHL Powerplay 96',                                year: 1995, publisher: 'Virgin',            genre: 'Sports'       },
        ],
    },

    // ── Sega Dreamcast ────────────────────────────────────────────────────────
    dreamcast: {
        libretroDir: 'Sega - Dreamcast',
        romExt: '.chd',
        myrientBase: MYRIENT.dreamcast,
        games: [
            { title: 'Sonic Adventure',                                 year: 1998, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Sonic Adventure 2',                               year: 2001, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Shenmue',                                         year: 1999, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Shenmue II',                                      year: 2001, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Jet Grind Radio',                                 year: 2000, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Skies of Arcadia',                                year: 2000, publisher: 'Sega',              genre: 'RPG'          },
            { title: 'Grandia II',                                      year: 2000, publisher: 'Game Arts',         genre: 'RPG'          },
            { title: 'Power Stone',                                     year: 1999, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Power Stone 2',                                   year: 2000, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Marvel vs. Capcom 2',                             year: 2000, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Capcom vs. SNK',                                  year: 2000, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Soul Calibur',                                    year: 1999, publisher: 'Namco',             genre: 'Fighting'     },
            { title: 'Dead or Alive 2',                                 year: 2000, publisher: 'Tecmo',             genre: 'Fighting'     },
            { title: 'Street Fighter III: 3rd Strike',                  year: 2000, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'King of Fighters Dream Match 1999',               year: 1999, publisher: 'SNK',               genre: 'Fighting'     },
            { title: 'Crazy Taxi',                                      year: 1999, publisher: 'Sega',              genre: 'Racing'       },
            { title: 'Crazy Taxi 2',                                    year: 2001, publisher: 'Sega',              genre: 'Racing'       },
            { title: 'Sega Rally 2',                                    year: 1999, publisher: 'Sega',              genre: 'Racing'       },
            { title: 'F355 Challenge',                                  year: 1999, publisher: 'Sega',              genre: 'Racing'       },
            { title: 'Metropolis Street Racer',                         year: 2000, publisher: 'Bizarre Creations',  genre: 'Racing'      },
            { title: 'Virtua Tennis',                                   year: 2000, publisher: 'Sega',              genre: 'Sports'       },
            { title: 'NFL 2K',                                          year: 1999, publisher: 'Sega',              genre: 'Sports'       },
            { title: 'NBA 2K',                                          year: 1999, publisher: 'Sega',              genre: 'Sports'       },
            { title: 'Seaman',                                          year: 1999, publisher: 'Sega',              genre: 'Simulation'   },
            { title: 'Space Channel 5',                                 year: 1999, publisher: 'Sega',              genre: 'Rhythm'       },
            { title: 'Samba De Amigo',                                  year: 1999, publisher: 'Sega',              genre: 'Rhythm'       },
            { title: 'Daytona USA 2001',                                year: 2001, publisher: 'Sega',              genre: 'Racing'       },
            { title: 'Resident Evil 3: Nemesis',                        year: 2000, publisher: 'Capcom',            genre: 'Survival Horror'},
            { title: 'Resident Evil Code: Veronica',                    year: 2000, publisher: 'Capcom',            genre: 'Survival Horror'},
            { title: 'Dino Crisis',                                     year: 2000, publisher: 'Capcom',            genre: 'Survival Horror'},
            { title: 'Sword of the Berserk: Guts\' Rage',               year: 1999, publisher: 'Eidos',             genre: 'Action'       },
            { title: 'Maken X',                                         year: 1999, publisher: 'Atlus',             genre: 'Action'       },
            { title: 'Bangai-O',                                        year: 2000, publisher: 'Treasure',          genre: 'Shooter'      },
            { title: 'Ikaruga',                                         year: 2002, publisher: 'Treasure',          genre: 'Shooter'      },
            { title: 'Giga Wing',                                       year: 1999, publisher: 'Capcom',            genre: 'Shooter'      },
            { title: 'Mars Matrix',                                     year: 2000, publisher: 'Capcom',            genre: 'Shooter'      },
            { title: 'Border Down',                                     year: 2003, publisher: 'G.rev',             genre: 'Shooter'      },
            { title: 'Evolution: The World of Sacred Device',           year: 1999, publisher: 'Ubisoft',           genre: 'RPG'          },
            { title: 'Evolution 2',                                     year: 2000, publisher: 'Ubisoft',           genre: 'RPG'          },
            { title: 'Blue Stinger',                                    year: 1999, publisher: 'Activision',        genre: 'Action'       },
            { title: 'Record of Lodoss War',                            year: 2000, publisher: 'Crave Entertainment', genre: 'Action RPG' },
            { title: 'Fighting Vipers 2',                               year: 2000, publisher: 'Sega',              genre: 'Fighting'     },
            { title: 'Tech Romancer',                                   year: 1999, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Project Justice',                                 year: 2000, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Ready 2 Rumble Boxing',                           year: 1999, publisher: 'Midway',            genre: 'Sports'       },
            { title: 'Virtua Tennis 2',                                 year: 2001, publisher: 'Sega',              genre: 'Sports'       },
            { title: 'Quake III Arena',                                 year: 2000, publisher: 'Activision',        genre: 'FPS'          },
            { title: 'Unreal Tournament',                               year: 2000, publisher: 'Infogrames',        genre: 'FPS'          },
            { title: 'Half-Life',                                       year: 2001, publisher: 'Sierra',            genre: 'FPS'          },
            { title: 'Zombie Revenge',                                  year: 1999, publisher: 'Sega',              genre: 'Beat em Up'   },
        ],
    },

    // ── PlayStation ───────────────────────────────────────────────────────────
    psx: {
        libretroDir: 'Sony - PlayStation',
        romExt: '.chd',
        myrientBase: MYRIENT.psx,
        games: [
            { title: 'Final Fantasy VII',                               year: 1997, publisher: 'Square',            genre: 'RPG'          },
            { title: 'Final Fantasy VIII',                              year: 1999, publisher: 'Square',            genre: 'RPG'          },
            { title: 'Final Fantasy IX',                                year: 2000, publisher: 'Square',            genre: 'RPG'          },
            { title: 'Final Fantasy Tactics',                           year: 1997, publisher: 'Square',            genre: 'Strategy RPG' },
            { title: 'Chrono Cross',                                    year: 1999, publisher: 'Square',            genre: 'RPG'          },
            { title: 'Vagrant Story',                                   year: 2000, publisher: 'Square',            genre: 'Action RPG'   },
            { title: 'Xenogears',                                       year: 1998, publisher: 'Square',            genre: 'RPG'          },
            { title: 'Metal Gear Solid',                                year: 1998, publisher: 'Konami',            genre: 'Stealth'      },
            { title: 'Castlevania: Symphony of the Night',              year: 1997, publisher: 'Konami',            genre: 'Action RPG'   },
            { title: 'Resident Evil',                                   year: 1996, publisher: 'Capcom',            genre: 'Survival Horror'},
            { title: 'Resident Evil 2',                                 year: 1998, publisher: 'Capcom',            genre: 'Survival Horror'},
            { title: 'Resident Evil 3: Nemesis',                        year: 1999, publisher: 'Capcom',            genre: 'Survival Horror'},
            { title: 'Silent Hill',                                     year: 1999, publisher: 'Konami',            genre: 'Survival Horror'},
            { title: 'Crash Bandicoot',                                 year: 1996, publisher: 'Sony',              genre: 'Platformer'   },
            { title: 'Crash Bandicoot 2: Cortex Strikes Back',          year: 1997, publisher: 'Sony',              genre: 'Platformer'   },
            { title: 'Crash Bandicoot 3: Warped',                       year: 1998, publisher: 'Sony',              genre: 'Platformer'   },
            { title: 'Crash Team Racing',                               year: 1999, publisher: 'Sony',              genre: 'Racing'       },
            { title: 'Spyro the Dragon',                                year: 1998, publisher: 'Sony',              genre: 'Platformer'   },
            { title: 'Spyro 2: Ripto\'s Rage',                          year: 1999, publisher: 'Sony',              genre: 'Platformer'   },
            { title: 'Spyro: Year of the Dragon',                       year: 2000, publisher: 'Sony',              genre: 'Platformer'   },
            { title: 'Tekken 3',                                        year: 1998, publisher: 'Namco',             genre: 'Fighting'     },
            { title: 'Tekken 2',                                        year: 1996, publisher: 'Namco',             genre: 'Fighting'     },
            { title: 'Street Fighter Alpha 3',                          year: 1998, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Street Fighter EX Plus Alpha',                    year: 1997, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Marvel vs. Capcom: Clash of Super Heroes',        year: 1999, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'X-Men vs. Street Fighter',                        year: 1997, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Mortal Kombat Trilogy',                           year: 1996, publisher: 'Midway',            genre: 'Fighting'     },
            { title: 'Mortal Kombat 4',                                 year: 1997, publisher: 'Midway',            genre: 'Fighting'     },
            { title: 'Gran Turismo',                                    year: 1997, publisher: 'Sony',              genre: 'Racing'       },
            { title: 'Gran Turismo 2',                                  year: 1999, publisher: 'Sony',              genre: 'Racing'       },
            { title: 'Wipeout',                                         year: 1995, publisher: 'Psygnosis',         genre: 'Racing'       },
            { title: 'Wipeout 3',                                       year: 1999, publisher: 'Psygnosis',         genre: 'Racing'       },
            { title: 'Tony Hawk\'s Pro Skater',                         year: 1999, publisher: 'Activision',        genre: 'Sports'       },
            { title: 'Tony Hawk\'s Pro Skater 2',                       year: 2000, publisher: 'Activision',        genre: 'Sports'       },
            { title: 'Castlevania Chronicles',                          year: 2001, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Parasite Eve',                                    year: 1998, publisher: 'Square',            genre: 'Action RPG'   },
            { title: 'Parasite Eve II',                                 year: 1999, publisher: 'Square',            genre: 'Action RPG'   },
            { title: 'Bushido Blade',                                   year: 1997, publisher: 'Square',            genre: 'Fighting'     },
            { title: 'Bushido Blade 2',                                 year: 1998, publisher: 'Square',            genre: 'Fighting'     },
            { title: 'Twisted Metal 2',                                 year: 1996, publisher: 'Sony',              genre: 'Action'       },
            { title: 'Twisted Metal: Black',                            year: 2001, publisher: 'Sony',              genre: 'Action'       },
            { title: 'Legacy of Kain: Soul Reaver',                     year: 1999, publisher: 'Eidos',             genre: 'Action'       },
            { title: 'Syphon Filter',                                   year: 1999, publisher: 'Sony',              genre: 'Action'       },
            { title: 'Syphon Filter 2',                                 year: 2000, publisher: 'Sony',              genre: 'Action'       },
            { title: 'Tomb Raider',                                     year: 1996, publisher: 'Eidos',             genre: 'Action'       },
            { title: 'Tomb Raider II',                                  year: 1997, publisher: 'Eidos',             genre: 'Action'       },
            { title: 'Ape Escape',                                      year: 1999, publisher: 'Sony',              genre: 'Platformer'   },
            { title: 'Brave Fencer Musashi',                            year: 1998, publisher: 'Square',            genre: 'Action RPG'   },
            { title: 'Ehrgeiz: God Bless the Ring',                     year: 1998, publisher: 'Square',            genre: 'Fighting'     },
            { title: 'Dr Mario',                                        year: 1990, publisher: 'Nintendo',          genre: 'Puzzle'       },
        ],
    },

    // ── PlayStation 2 ─────────────────────────────────────────────────────────
    ps2: {
        libretroDir: 'Sony - PlayStation 2',
        romExt: '.iso',
        myrientBase: MYRIENT.ps2,
        games: [
            { title: 'Grand Theft Auto III',                            year: 2001, publisher: 'Rockstar',          genre: 'Action'       },
            { title: 'Grand Theft Auto: Vice City',                     year: 2002, publisher: 'Rockstar',          genre: 'Action'       },
            { title: 'Grand Theft Auto: San Andreas',                   year: 2004, publisher: 'Rockstar',          genre: 'Action'       },
            { title: 'Shadow of the Colossus',                          year: 2005, publisher: 'Sony',              genre: 'Action'       },
            { title: 'Ico',                                             year: 2001, publisher: 'Sony',              genre: 'Action'       },
            { title: 'God of War',                                      year: 2005, publisher: 'Sony',              genre: 'Action'       },
            { title: 'God of War II',                                   year: 2007, publisher: 'Sony',              genre: 'Action'       },
            { title: 'Kingdom Hearts',                                  year: 2002, publisher: 'Square',            genre: 'Action RPG'   },
            { title: 'Kingdom Hearts II',                               year: 2005, publisher: 'Square',            genre: 'Action RPG'   },
            { title: 'Final Fantasy X',                                 year: 2001, publisher: 'Square',            genre: 'RPG'          },
            { title: 'Final Fantasy XII',                               year: 2006, publisher: 'Square',            genre: 'RPG'          },
            { title: 'Dragon Quest VIII',                               year: 2004, publisher: 'Square',            genre: 'RPG'          },
            { title: 'Persona 4',                                       year: 2008, publisher: 'Atlus',             genre: 'RPG'          },
            { title: 'Persona 3 FES',                                   year: 2007, publisher: 'Atlus',             genre: 'RPG'          },
            { title: 'Digital Devil Saga',                              year: 2004, publisher: 'Atlus',             genre: 'RPG'          },
            { title: 'Okami',                                           year: 2006, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Resident Evil 4',                                 year: 2005, publisher: 'Capcom',            genre: 'Survival Horror'},
            { title: 'Silent Hill 2',                                   year: 2001, publisher: 'Konami',            genre: 'Survival Horror'},
            { title: 'Silent Hill 3',                                   year: 2003, publisher: 'Konami',            genre: 'Survival Horror'},
            { title: 'Metal Gear Solid 2: Sons of Liberty',             year: 2001, publisher: 'Konami',            genre: 'Stealth'      },
            { title: 'Metal Gear Solid 3: Snake Eater',                 year: 2004, publisher: 'Konami',            genre: 'Stealth'      },
            { title: 'Zone of the Enders',                              year: 2001, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Tekken 5',                                        year: 2004, publisher: 'Namco',             genre: 'Fighting'     },
            { title: 'Tekken 4',                                        year: 2001, publisher: 'Namco',             genre: 'Fighting'     },
            { title: 'Soul Calibur II',                                 year: 2002, publisher: 'Namco',             genre: 'Fighting'     },
            { title: 'Soul Calibur III',                                year: 2005, publisher: 'Namco',             genre: 'Fighting'     },
            { title: 'Devil May Cry',                                   year: 2001, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Devil May Cry 3: Special Edition',                year: 2005, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Ratchet & Clank',                                 year: 2002, publisher: 'Sony',              genre: 'Platformer'   },
            { title: 'Ratchet & Clank: Going Commando',                 year: 2003, publisher: 'Sony',              genre: 'Platformer'   },
            { title: 'Ratchet & Clank: Up Your Arsenal',                year: 2004, publisher: 'Sony',              genre: 'Platformer'   },
            { title: 'Jak and Daxter: The Precursor Legacy',            year: 2001, publisher: 'Sony',              genre: 'Platformer'   },
            { title: 'Jak II',                                          year: 2003, publisher: 'Sony',              genre: 'Action'       },
            { title: 'Sly Cooper and the Thievius Raccoonus',           year: 2002, publisher: 'Sony',              genre: 'Platformer'   },
            { title: 'Sly 2: Band of Thieves',                          year: 2004, publisher: 'Sony',              genre: 'Platformer'   },
            { title: 'Gran Turismo 3: A-Spec',                          year: 2001, publisher: 'Sony',              genre: 'Racing'       },
            { title: 'Gran Turismo 4',                                  year: 2004, publisher: 'Sony',              genre: 'Racing'       },
            { title: 'Burnout 3: Takedown',                             year: 2004, publisher: 'EA',                genre: 'Racing'       },
            { title: 'Burnout Revenge',                                 year: 2005, publisher: 'EA',                genre: 'Racing'       },
            { title: 'Need for Speed: Most Wanted',                     year: 2005, publisher: 'EA',                genre: 'Racing'       },
            { title: 'Guitar Hero',                                     year: 2005, publisher: 'RedOctane',         genre: 'Rhythm'       },
            { title: 'Guitar Hero II',                                  year: 2006, publisher: 'RedOctane',         genre: 'Rhythm'       },
            { title: 'Tony Hawk\'s Pro Skater 3',                       year: 2001, publisher: 'Activision',        genre: 'Sports'       },
            { title: 'Tony Hawk\'s Underground',                        year: 2003, publisher: 'Activision',        genre: 'Sports'       },
            { title: 'SSX Tricky',                                      year: 2001, publisher: 'EA',                genre: 'Sports'       },
            { title: 'Prince of Persia: The Sands of Time',             year: 2003, publisher: 'Ubisoft',           genre: 'Action'       },
            { title: 'Prince of Persia: Warrior Within',                year: 2004, publisher: 'Ubisoft',           genre: 'Action'       },
            { title: 'Onimusha: Warlords',                              year: 2001, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Onimusha 3: Demon Siege',                         year: 2004, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Frequency',                                       year: 2001, publisher: 'Sony',              genre: 'Rhythm'       },
        ],
    },

    // ── PSP ───────────────────────────────────────────────────────────────────
    psp: {
        libretroDir: 'Sony - PlayStation Portable',
        romExt: '.iso',
        myrientBase: MYRIENT.psp,
        games: [
            { title: 'God of War: Chains of Olympus',                   year: 2008, publisher: 'Sony',              genre: 'Action'       },
            { title: 'God of War: Ghost of Sparta',                     year: 2010, publisher: 'Sony',              genre: 'Action'       },
            { title: 'Metal Gear Solid: Peace Walker',                  year: 2010, publisher: 'Konami',            genre: 'Stealth'      },
            { title: 'Metal Gear Solid: Portable Ops',                  year: 2006, publisher: 'Konami',            genre: 'Stealth'      },
            { title: 'Crisis Core: Final Fantasy VII',                  year: 2007, publisher: 'Square Enix',       genre: 'Action RPG'   },
            { title: 'Final Fantasy Tactics: War of the Lions',         year: 2007, publisher: 'Square Enix',       genre: 'Strategy RPG' },
            { title: 'Persona 3 Portable',                              year: 2009, publisher: 'Atlus',             genre: 'RPG'          },
            { title: 'Persona 2: Innocent Sin',                         year: 2011, publisher: 'Atlus',             genre: 'RPG'          },
            { title: 'Tekken: Dark Resurrection',                       year: 2006, publisher: 'Namco',             genre: 'Fighting'     },
            { title: 'Tekken 6',                                        year: 2009, publisher: 'Namco',             genre: 'Fighting'     },
            { title: 'Soul Calibur: Broken Destiny',                    year: 2009, publisher: 'Namco',             genre: 'Fighting'     },
            { title: 'Street Fighter Alpha 3 Max',                      year: 2006, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Monster Hunter Freedom Unite',                    year: 2008, publisher: 'Capcom',            genre: 'Action RPG'   },
            { title: 'Monster Hunter Freedom 2',                        year: 2007, publisher: 'Capcom',            genre: 'Action RPG'   },
            { title: 'Grand Theft Auto: Liberty City Stories',          year: 2005, publisher: 'Rockstar',          genre: 'Action'       },
            { title: 'Grand Theft Auto: Vice City Stories',             year: 2006, publisher: 'Rockstar',          genre: 'Action'       },
            { title: 'Lumines',                                         year: 2004, publisher: 'Ubisoft',           genre: 'Puzzle'       },
            { title: 'Lumines II',                                      year: 2006, publisher: 'Ubisoft',           genre: 'Puzzle'       },
            { title: 'Castlevania: Rondo of Blood',                     year: 2007, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Castlevania: Dracula X Chronicles',               year: 2007, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Daxter',                                          year: 2006, publisher: 'Sony',              genre: 'Platformer'   },
            { title: 'Killzone: Liberation',                            year: 2006, publisher: 'Sony',              genre: 'Action'       },
            { title: 'Wipeout Pure',                                    year: 2005, publisher: 'Sony',              genre: 'Racing'       },
            { title: 'Wipeout Pulse',                                   year: 2007, publisher: 'Sony',              genre: 'Racing'       },
            { title: 'Ridge Racer',                                     year: 2004, publisher: 'Namco',             genre: 'Racing'       },
            { title: 'Burnout Legends',                                 year: 2005, publisher: 'EA',                genre: 'Racing'       },
            { title: 'Need for Speed: Most Wanted 5-1-0',               year: 2005, publisher: 'EA',                genre: 'Racing'       },
            { title: 'Tony Hawk\'s Underground 2 Remix',                year: 2005, publisher: 'Activision',        genre: 'Sports'       },
            { title: 'NBA Jam',                                         year: 2011, publisher: 'EA',                genre: 'Sports'       },
            { title: 'Syphon Filter: Dark Mirror',                      year: 2006, publisher: 'Sony',              genre: 'Action'       },
            { title: 'Syphon Filter: Logan\'s Shadow',                  year: 2007, publisher: 'Sony',              genre: 'Action'       },
            { title: 'Star Wars Battlefront II',                        year: 2005, publisher: 'LucasArts',         genre: 'Action'       },
            { title: 'Star Wars: The Force Unleashed',                  year: 2008, publisher: 'LucasArts',         genre: 'Action'       },
            { title: 'Ratchet & Clank: Size Matters',                   year: 2007, publisher: 'Sony',              genre: 'Platformer'   },
            { title: 'Patapon',                                         year: 2007, publisher: 'Sony',              genre: 'Rhythm'       },
            { title: 'Patapon 2',                                       year: 2008, publisher: 'Sony',              genre: 'Rhythm'       },
            { title: 'LocoRoco',                                        year: 2006, publisher: 'Sony',              genre: 'Platformer'   },
            { title: 'LocoRoco 2',                                      year: 2008, publisher: 'Sony',              genre: 'Platformer'   },
            { title: 'Dissidia: Final Fantasy',                         year: 2008, publisher: 'Square Enix',       genre: 'Fighting'     },
            { title: 'Dissidia 012: Final Fantasy',                     year: 2011, publisher: 'Square Enix',       genre: 'Fighting'     },
            { title: 'Tactics Ogre: Let Us Cling Together',             year: 2010, publisher: 'Square Enix',       genre: 'Strategy RPG' },
            { title: 'Half-Minute Hero',                                year: 2009, publisher: 'Marvelous',         genre: 'RPG'          },
            { title: 'Ys: The Ark of Napishtim',                        year: 2005, publisher: 'Konami',            genre: 'Action RPG'   },
            { title: 'Ys Seven',                                        year: 2009, publisher: 'XSEED',             genre: 'Action RPG'   },
            { title: 'The 3rd Birthday',                                year: 2010, publisher: 'Square Enix',       genre: 'Action RPG'   },
            { title: 'Kingdom Hearts: Birth by Sleep',                  year: 2010, publisher: 'Square Enix',       genre: 'Action RPG'   },
            { title: 'Resistance: Retribution',                         year: 2009, publisher: 'Sony',              genre: 'Action'       },
            { title: 'Pursuit Force',                                   year: 2005, publisher: 'Sony',              genre: 'Action'       },
            { title: 'Jeanne d\'Arc',                                   year: 2006, publisher: 'Sony',              genre: 'Strategy RPG' },
            { title: 'Lego Star Wars II: The Original Trilogy',         year: 2006, publisher: 'LucasArts',         genre: 'Action'       },
        ],
    },

    // ── Nintendo 3DS ──────────────────────────────────────────────────────────
    threeds: {
        libretroDir: 'Nintendo - Nintendo 3DS',
        romExt: '.3ds',
        myrientBase: MYRIENT.threeds,
        games: [
            { title: 'Super Mario 3D Land',                             year: 2011, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'The Legend of Zelda: Ocarina of Time 3D',        year: 2011, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'The Legend of Zelda: A Link Between Worlds',      year: 2013, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'The Legend of Zelda: Majora\'s Mask 3D',          year: 2015, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'Pokemon X',                                       year: 2013, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Pokemon Y',                                       year: 2013, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Pokemon Omega Ruby',                              year: 2014, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Pokemon Alpha Sapphire',                          year: 2014, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Pokemon Sun',                                     year: 2016, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Pokemon Moon',                                    year: 2016, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Pokemon Ultra Sun',                               year: 2017, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Pokemon Ultra Moon',                              year: 2017, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Fire Emblem Awakening',                           year: 2012, publisher: 'Nintendo',          genre: 'Strategy RPG' },
            { title: 'Fire Emblem Fates: Birthright',                   year: 2015, publisher: 'Nintendo',          genre: 'Strategy RPG' },
            { title: 'Fire Emblem Fates: Conquest',                     year: 2015, publisher: 'Nintendo',          genre: 'Strategy RPG' },
            { title: 'Fire Emblem Echoes: Shadows of Valentia',         year: 2017, publisher: 'Nintendo',          genre: 'Strategy RPG' },
            { title: 'Monster Hunter 4 Ultimate',                       year: 2014, publisher: 'Capcom',            genre: 'Action RPG'   },
            { title: 'Monster Hunter Generations',                      year: 2015, publisher: 'Capcom',            genre: 'Action RPG'   },
            { title: 'Kirby: Planet Robobot',                           year: 2016, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Kirby: Triple Deluxe',                            year: 2014, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Kirby\'s Extra Epic Yarn',                        year: 2019, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Mario Kart 7',                                    year: 2011, publisher: 'Nintendo',          genre: 'Racing'       },
            { title: 'Super Smash Bros. for Nintendo 3DS',              year: 2014, publisher: 'Nintendo',          genre: 'Fighting'     },
            { title: 'Kid Icarus: Uprising',                            year: 2012, publisher: 'Nintendo',          genre: 'Action'       },
            { title: 'Star Fox 64 3D',                                  year: 2011, publisher: 'Nintendo',          genre: 'Shooter'      },
            { title: 'Luigi\'s Mansion: Dark Moon',                     year: 2013, publisher: 'Nintendo',          genre: 'Action'       },
            { title: 'Animal Crossing: New Leaf',                       year: 2012, publisher: 'Nintendo',          genre: 'Simulation'   },
            { title: 'Tomodachi Life',                                  year: 2013, publisher: 'Nintendo',          genre: 'Simulation'   },
            { title: 'Bravely Default',                                 year: 2012, publisher: 'Square Enix',       genre: 'RPG'          },
            { title: 'Bravely Second: End Layer',                       year: 2015, publisher: 'Square Enix',       genre: 'RPG'          },
            { title: 'Theatrhythm Final Fantasy',                       year: 2012, publisher: 'Square Enix',       genre: 'Rhythm'       },
            { title: 'Theatrhythm Final Fantasy: Curtain Call',         year: 2014, publisher: 'Square Enix',       genre: 'Rhythm'       },
            { title: 'Donkey Kong Country Returns 3D',                  year: 2013, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'New Super Mario Bros. 2',                         year: 2012, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Yoshi\'s New Island',                             year: 2014, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Shovel Knight',                                   year: 2014, publisher: 'Yacht Club Games',  genre: 'Platformer'   },
            { title: 'Shin Megami Tensei IV',                           year: 2013, publisher: 'Atlus',             genre: 'RPG'          },
            { title: 'Shin Megami Tensei: Strange Journey Redux',        year: 2017, publisher: 'Atlus',             genre: 'RPG'          },
            { title: 'Etrian Odyssey IV',                               year: 2012, publisher: 'Atlus',             genre: 'RPG'          },
            { title: 'Etrian Odyssey V',                                year: 2016, publisher: 'Atlus',             genre: 'RPG'          },
            { title: 'Xenoblade Chronicles 3D',                         year: 2015, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'Radiant Historia: Perfect Chronology',            year: 2017, publisher: 'Atlus',             genre: 'RPG'          },
            { title: 'Code of Princess',                                year: 2012, publisher: 'Atlus',             genre: 'Beat em Up'   },
            { title: 'Castlevania: Lords of Shadow - Mirror of Fate',   year: 2013, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Resident Evil: Revelations',                      year: 2012, publisher: 'Capcom',            genre: 'Survival Horror'},
            { title: 'Resident Evil: The Mercenaries 3D',               year: 2011, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Metal Gear Solid: Snake Eater 3D',                year: 2012, publisher: 'Konami',            genre: 'Stealth'      },
            { title: 'Sonic Generations',                               year: 2011, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Sonic Lost World',                                year: 2013, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Dragon Ball Fusions',                             year: 2016, publisher: 'Bandai Namco',      genre: 'RPG'          },
        ],
    },

    // ── Nintendo GameCube ─────────────────────────────────────────────────────
    gamecube: {
        libretroDir: 'Nintendo - GameCube',
        romExt: '.iso',
        myrientBase: MYRIENT.gamecube,
        games: [
            { title: 'Super Mario Sunshine',                            year: 2002, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'The Legend of Zelda: The Wind Waker',             year: 2002, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'The Legend of Zelda: Twilight Princess',          year: 2006, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'Metroid Prime',                                   year: 2002, publisher: 'Nintendo',          genre: 'Action'       },
            { title: 'Metroid Prime 2: Echoes',                         year: 2004, publisher: 'Nintendo',          genre: 'Action'       },
            { title: 'Super Smash Bros. Melee',                         year: 2001, publisher: 'Nintendo',          genre: 'Fighting'     },
            { title: 'Mario Kart: Double Dash!!',                       year: 2003, publisher: 'Nintendo',          genre: 'Racing'       },
            { title: 'Luigi\'s Mansion',                                year: 2001, publisher: 'Nintendo',          genre: 'Action'       },
            { title: 'Paper Mario: The Thousand-Year Door',             year: 2004, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Pikmin',                                          year: 2001, publisher: 'Nintendo',          genre: 'Strategy'     },
            { title: 'Pikmin 2',                                        year: 2004, publisher: 'Nintendo',          genre: 'Strategy'     },
            { title: 'Animal Crossing',                                 year: 2001, publisher: 'Nintendo',          genre: 'Simulation'   },
            { title: 'Fire Emblem: Path of Radiance',                   year: 2005, publisher: 'Nintendo',          genre: 'Strategy RPG' },
            { title: 'Star Wars: Rogue Squadron II',                    year: 2001, publisher: 'LucasArts',         genre: 'Action'       },
            { title: 'Star Wars: Rogue Squadron III',                   year: 2003, publisher: 'LucasArts',         genre: 'Action'       },
            { title: 'Resident Evil 4',                                 year: 2005, publisher: 'Capcom',            genre: 'Survival Horror'},
            { title: 'Resident Evil',                                   year: 2002, publisher: 'Capcom',            genre: 'Survival Horror'},
            { title: 'Resident Evil 0',                                 year: 2002, publisher: 'Capcom',            genre: 'Survival Horror'},
            { title: 'F-Zero GX',                                       year: 2003, publisher: 'Nintendo',          genre: 'Racing'       },
            { title: 'Sonic Adventure 2: Battle',                       year: 2001, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Sonic Adventure DX',                              year: 2003, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Sonic Heroes',                                    year: 2003, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Prince of Persia: The Sands of Time',             year: 2003, publisher: 'Ubisoft',           genre: 'Action'       },
            { title: 'Donkey Konga',                                    year: 2003, publisher: 'Nintendo',          genre: 'Rhythm'       },
            { title: 'Donkey Kong Jungle Beat',                         year: 2004, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Kirby Air Ride',                                  year: 2003, publisher: 'Nintendo',          genre: 'Racing'       },
            { title: 'Tales of Symphonia',                              year: 2003, publisher: 'Namco',             genre: 'Action RPG'   },
            { title: 'Baten Kaitos',                                    year: 2003, publisher: 'Namco',             genre: 'RPG'          },
            { title: 'Eternal Darkness: Sanity\'s Requiem',             year: 2002, publisher: 'Nintendo',          genre: 'Survival Horror'},
            { title: 'Viewtiful Joe',                                   year: 2003, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Viewtiful Joe 2',                                 year: 2004, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Killer 7',                                        year: 2005, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Beyond Good & Evil',                              year: 2003, publisher: 'Ubisoft',           genre: 'Action'       },
            { title: 'Skies of Arcadia Legends',                        year: 2002, publisher: 'Sega',              genre: 'RPG'          },
            { title: 'The Legend of Zelda: Four Swords Adventures',     year: 2004, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'Star Fox Adventures',                             year: 2002, publisher: 'Nintendo',          genre: 'Action'       },
            { title: 'Star Fox: Assault',                               year: 2005, publisher: 'Nintendo',          genre: 'Action'       },
            { title: 'Wario World',                                     year: 2003, publisher: 'Nintendo',          genre: 'Action'       },
            { title: 'Geist',                                           year: 2005, publisher: 'Nintendo',          genre: 'FPS'          },
            { title: 'Metal Gear Solid: Twin Snakes',                   year: 2004, publisher: 'Konami',            genre: 'Stealth'      },
            { title: 'Battalion Wars',                                  year: 2005, publisher: 'Nintendo',          genre: 'Strategy'     },
            { title: 'Wario Ware: Mega Party Game$',                    year: 2003, publisher: 'Nintendo',          genre: 'Action'       },
            { title: 'Pokémon Colosseum',                               year: 2003, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Pokemon XD: Gale of Darkness',                    year: 2005, publisher: 'Nintendo',          genre: 'RPG'          },
            { title: 'Chibi-Robo!',                                     year: 2005, publisher: 'Nintendo',          genre: 'Action'       },
            { title: 'NBA Street V3',                                   year: 2005, publisher: 'EA',                genre: 'Sports'       },
            { title: 'Tony Hawk\'s Underground',                        year: 2003, publisher: 'Activision',        genre: 'Sports'       },
            { title: 'Mario Party 4',                                   year: 2002, publisher: 'Nintendo',          genre: 'Party'        },
            { title: 'Mario Party 5',                                   year: 2003, publisher: 'Nintendo',          genre: 'Party'        },
            { title: 'Mario Power Tennis',                              year: 2004, publisher: 'Nintendo',          genre: 'Sports'       },
        ],
    },

    // ── Nintendo Wii ──────────────────────────────────────────────────────────
    wii: {
        libretroDir: 'Nintendo - Wii',
        romExt: '.iso',
        myrientBase: MYRIENT.wii,
        games: [
            { title: 'Super Mario Galaxy',                              year: 2007, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Super Mario Galaxy 2',                            year: 2010, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'The Legend of Zelda: Twilight Princess',          year: 2006, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'The Legend of Zelda: Skyward Sword',              year: 2011, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'Metroid Prime 3: Corruption',                     year: 2007, publisher: 'Nintendo',          genre: 'Action'       },
            { title: 'Metroid: Other M',                                year: 2010, publisher: 'Nintendo',          genre: 'Action'       },
            { title: 'Super Smash Bros. Brawl',                         year: 2008, publisher: 'Nintendo',          genre: 'Fighting'     },
            { title: 'Mario Kart Wii',                                  year: 2008, publisher: 'Nintendo',          genre: 'Racing'       },
            { title: 'New Super Mario Bros. Wii',                       year: 2009, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Wii Sports',                                      year: 2006, publisher: 'Nintendo',          genre: 'Sports'       },
            { title: 'Wii Sports Resort',                               year: 2009, publisher: 'Nintendo',          genre: 'Sports'       },
            { title: 'Wii Fit',                                         year: 2007, publisher: 'Nintendo',          genre: 'Fitness'      },
            { title: 'Wii Fit Plus',                                    year: 2009, publisher: 'Nintendo',          genre: 'Fitness'      },
            { title: 'Donkey Kong Country Returns',                     year: 2010, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Kirby\'s Epic Yarn',                              year: 2010, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Kirby\'s Return to Dream Land',                   year: 2011, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Xenoblade Chronicles',                            year: 2010, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'The Last Story',                                  year: 2011, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'Pandora\'s Tower',                                year: 2011, publisher: 'Nintendo',          genre: 'Action RPG'   },
            { title: 'Muramasa: The Demon Blade',                       year: 2009, publisher: 'Marvelous',         genre: 'Action RPG'   },
            { title: 'Okami',                                           year: 2008, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'No More Heroes',                                  year: 2007, publisher: 'Ubisoft',           genre: 'Action'       },
            { title: 'No More Heroes 2: Desperate Struggle',            year: 2010, publisher: 'Ubisoft',           genre: 'Action'       },
            { title: 'MadWorld',                                        year: 2009, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Punch-Out!!',                                     year: 2009, publisher: 'Nintendo',          genre: 'Sports'       },
            { title: 'Fire Emblem: Radiant Dawn',                       year: 2007, publisher: 'Nintendo',          genre: 'Strategy RPG' },
            { title: 'Pikmin',                                          year: 2008, publisher: 'Nintendo',          genre: 'Strategy'     },
            { title: 'Animal Crossing: City Folk',                      year: 2008, publisher: 'Nintendo',          genre: 'Simulation'   },
            { title: 'Wario Land: Shake It!',                           year: 2008, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Tatsunoko vs. Capcom',                            year: 2008, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Resident Evil 4: Wii Edition',                    year: 2007, publisher: 'Capcom',            genre: 'Survival Horror'},
            { title: 'Resident Evil: Darkside Chronicles',              year: 2009, publisher: 'Capcom',            genre: 'Light Gun'    },
            { title: 'House of the Dead: Overkill',                     year: 2009, publisher: 'Sega',              genre: 'Light Gun'    },
            { title: 'Silent Hill: Shattered Memories',                 year: 2009, publisher: 'Konami',            genre: 'Survival Horror'},
            { title: 'Little King\'s Story',                            year: 2009, publisher: 'Marvelous',         genre: 'Strategy'     },
            { title: 'Epic Mickey',                                     year: 2010, publisher: 'Disney',            genre: 'Platformer'   },
            { title: 'Monster Hunter Tri',                              year: 2009, publisher: 'Capcom',            genre: 'Action RPG'   },
            { title: 'Guitar Hero III: Legends of Rock',                year: 2007, publisher: 'Activision',        genre: 'Rhythm'       },
            { title: 'Rock Band 2',                                     year: 2008, publisher: 'EA',                genre: 'Rhythm'       },
            { title: 'Just Dance',                                      year: 2009, publisher: 'Ubisoft',           genre: 'Rhythm'       },
            { title: 'Sonic Colors',                                    year: 2010, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Sonic and the Secret Rings',                      year: 2007, publisher: 'Sega',              genre: 'Platformer'   },
            { title: 'Sky Crawlers: Innocent Aces',                     year: 2009, publisher: 'Konami',            genre: 'Action'       },
            { title: 'de Blob',                                         year: 2008, publisher: 'THQ',               genre: 'Platformer'   },
            { title: 'de Blob 2',                                       year: 2011, publisher: 'THQ',               genre: 'Platformer'   },
            { title: 'The Conduit',                                     year: 2009, publisher: 'Sega',              genre: 'FPS'          },
            { title: 'Dead Space: Extraction',                          year: 2009, publisher: 'EA',                genre: 'Light Gun'    },
            { title: 'Zack & Wiki: Quest for Barbaros\'s Treasure',     year: 2007, publisher: 'Capcom',            genre: 'Puzzle'       },
            { title: 'Klonoa',                                          year: 2008, publisher: 'Namco',             genre: 'Platformer'   },
            { title: 'Trauma Center: New Blood',                        year: 2007, publisher: 'Atlus',             genre: 'Simulation'   },
        ],
    },

    // ── Arcade (MAME) ─────────────────────────────────────────────────────────
    arcade: {
        libretroDir: 'MAME',
        romExt: '.zip',
        myrientBase: MYRIENT.arcade,
        // NOTE: Arcade uses MAME_ROM_MAP for filename lookup — matchScore is bypassed
        games: [
            { title: 'Pac-Man',                                         year: 1980, publisher: 'Namco',             genre: 'Action'       },
            { title: 'Ms. Pac-Man',                                     year: 1981, publisher: 'Midway',            genre: 'Action'       },
            { title: 'Donkey Kong',                                     year: 1981, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Donkey Kong Jr.',                                 year: 1982, publisher: 'Nintendo',          genre: 'Platformer'   },
            { title: 'Frogger',                                         year: 1981, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Galaga',                                          year: 1981, publisher: 'Namco',             genre: 'Shooter'      },
            { title: 'Galaxian',                                        year: 1979, publisher: 'Namco',             genre: 'Shooter'      },
            { title: 'Centipede',                                       year: 1980, publisher: 'Atari',             genre: 'Shooter'      },
            { title: 'Space Invaders',                                  year: 1978, publisher: 'Taito',             genre: 'Shooter'      },
            { title: 'Asteroids',                                       year: 1979, publisher: 'Atari',             genre: 'Shooter'      },
            { title: 'Tempest',                                         year: 1981, publisher: 'Atari',             genre: 'Shooter'      },
            { title: 'Zaxxon',                                          year: 1982, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Defender',                                        year: 1981, publisher: 'Williams',          genre: 'Shooter'      },
            { title: 'Robotron 2084',                                   year: 1982, publisher: 'Williams',          genre: 'Shooter'      },
            { title: 'Joust',                                           year: 1982, publisher: 'Williams',          genre: 'Action'       },
            { title: 'Qbert',                                           year: 1982, publisher: 'Gottlieb',          genre: 'Action'       },
            { title: 'Dig Dug',                                         year: 1982, publisher: 'Namco',             genre: 'Action'       },
            { title: 'Pengo',                                           year: 1982, publisher: 'Sega',              genre: 'Action'       },
            { title: 'Millipede',                                       year: 1982, publisher: 'Atari',             genre: 'Shooter'      },
            { title: 'Tron',                                            year: 1982, publisher: 'Midway',            genre: 'Action'       },
            { title: 'Spy Hunter',                                      year: 1983, publisher: 'Midway',            genre: 'Action'       },
            { title: 'Pole Position',                                   year: 1982, publisher: 'Namco',             genre: 'Racing'       },
            { title: 'Pole Position II',                                year: 1983, publisher: 'Namco',             genre: 'Racing'       },
            { title: 'OutRun',                                          year: 1986, publisher: 'Sega',              genre: 'Racing'       },
            { title: 'After Burner',                                    year: 1987, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'After Burner II',                                 year: 1987, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Space Harrier',                                   year: 1985, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Thunder Blade',                                   year: 1987, publisher: 'Sega',              genre: 'Shooter'      },
            { title: 'Ghosts\'n Goblins',                               year: 1985, publisher: 'Capcom',            genre: 'Action'       },
            { title: '1942',                                            year: 1984, publisher: 'Capcom',            genre: 'Shooter'      },
            { title: '1943: The Battle of Midway',                      year: 1987, publisher: 'Capcom',            genre: 'Shooter'      },
            { title: '1944: The Loop Master',                           year: 2000, publisher: 'Capcom',            genre: 'Shooter'      },
            { title: 'Commando',                                        year: 1985, publisher: 'Capcom',            genre: 'Shooter'      },
            { title: 'Bionic Commando',                                 year: 1987, publisher: 'Capcom',            genre: 'Action'       },
            { title: 'Street Fighter II: The World Warrior',            year: 1991, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Street Fighter II Turbo',                         year: 1992, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Super Street Fighter II Turbo',                   year: 1994, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Street Fighter Alpha',                            year: 1995, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Street Fighter Alpha 2',                          year: 1996, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Street Fighter III: 3rd Strike',                  year: 1999, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Mortal Kombat',                                   year: 1992, publisher: 'Midway',            genre: 'Fighting'     },
            { title: 'Mortal Kombat II',                                year: 1993, publisher: 'Midway',            genre: 'Fighting'     },
            { title: 'Mortal Kombat 3',                                 year: 1995, publisher: 'Midway',            genre: 'Fighting'     },
            { title: 'The King of Fighters \'94',                       year: 1994, publisher: 'SNK',               genre: 'Fighting'     },
            { title: 'The King of Fighters \'98',                       year: 1998, publisher: 'SNK',               genre: 'Fighting'     },
            { title: 'The King of Fighters 2002',                       year: 2002, publisher: 'SNK',               genre: 'Fighting'     },
            { title: 'Samurai Shodown',                                 year: 1993, publisher: 'SNK',               genre: 'Fighting'     },
            { title: 'Samurai Shodown II',                              year: 1994, publisher: 'SNK',               genre: 'Fighting'     },
            { title: 'Fatal Fury: King of Fighters',                    year: 1991, publisher: 'SNK',               genre: 'Fighting'     },
            { title: 'Fatal Fury Special',                              year: 1993, publisher: 'SNK',               genre: 'Fighting'     },
            { title: 'Metal Slug',                                      year: 1996, publisher: 'SNK',               genre: 'Action'       },
            { title: 'Metal Slug 2',                                    year: 1998, publisher: 'SNK',               genre: 'Action'       },
            { title: 'Metal Slug 3',                                    year: 2000, publisher: 'SNK',               genre: 'Action'       },
            { title: 'Metal Slug X',                                    year: 1999, publisher: 'SNK',               genre: 'Action'       },
            { title: 'Contra',                                          year: 1987, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Super Contra',                                    year: 1988, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Gradius',                                         year: 1985, publisher: 'Konami',            genre: 'Shooter'      },
            { title: 'Gradius II',                                      year: 1988, publisher: 'Konami',            genre: 'Shooter'      },
            { title: 'Gradius III',                                     year: 1989, publisher: 'Konami',            genre: 'Shooter'      },
            { title: 'Life Force',                                      year: 1986, publisher: 'Konami',            genre: 'Shooter'      },
            { title: 'Sunset Riders',                                   year: 1991, publisher: 'Konami',            genre: 'Action'       },
            { title: 'Teenage Mutant Ninja Turtles',                    year: 1989, publisher: 'Konami',            genre: 'Beat em Up'   },
            { title: 'Teenage Mutant Ninja Turtles: Turtles in Time',   year: 1991, publisher: 'Konami',            genre: 'Beat em Up'   },
            { title: 'The Simpsons',                                    year: 1991, publisher: 'Konami',            genre: 'Beat em Up'   },
            { title: 'X-Men',                                           year: 1992, publisher: 'Konami',            genre: 'Beat em Up'   },
            { title: 'Dungeons & Dragons: Tower of Doom',               year: 1993, publisher: 'Capcom',            genre: 'Beat em Up'   },
            { title: 'Dungeons & Dragons: Shadow over Mystara',         year: 1996, publisher: 'Capcom',            genre: 'Beat em Up'   },
            { title: 'Captain Commando',                                year: 1991, publisher: 'Capcom',            genre: 'Beat em Up'   },
            { title: 'Final Fight',                                     year: 1989, publisher: 'Capcom',            genre: 'Beat em Up'   },
            { title: 'Final Fight 2',                                   year: 1993, publisher: 'Capcom',            genre: 'Beat em Up'   },
            { title: 'Cadillacs and Dinosaurs',                         year: 1992, publisher: 'Capcom',            genre: 'Beat em Up'   },
            { title: 'The Punisher',                                    year: 1993, publisher: 'Capcom',            genre: 'Beat em Up'   },
            { title: 'Warriors of Fate',                                year: 1992, publisher: 'Capcom',            genre: 'Beat em Up'   },
            { title: 'Battle Circuit',                                  year: 1997, publisher: 'Capcom',            genre: 'Beat em Up'   },
            { title: 'Knights of the Round',                            year: 1991, publisher: 'Capcom',            genre: 'Beat em Up'   },
            { title: 'King of Dragons',                                 year: 1991, publisher: 'Capcom',            genre: 'Beat em Up'   },
            { title: 'Armored Warriors',                                year: 1994, publisher: 'Capcom',            genre: 'Beat em Up'   },
            { title: 'Marvel Super Heroes',                             year: 1995, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'X-Men: Children of the Atom',                     year: 1994, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Marvel vs. Capcom',                               year: 1998, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Marvel vs. Capcom 2',                             year: 2000, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Darkstalkers',                                    year: 1994, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Night Warriors: Darkstalkers\' Revenge',          year: 1995, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Darkstalkers 3',                                  year: 1997, publisher: 'Capcom',            genre: 'Fighting'     },
            { title: 'Street Fighter EX',                               year: 1996, publisher: 'Arika',             genre: 'Fighting'     },
            { title: 'Puzzle Bobble',                                   year: 1994, publisher: 'Taito',             genre: 'Puzzle'       },
            { title: 'Puzzle Fighter II Turbo',                         year: 1996, publisher: 'Capcom',            genre: 'Puzzle'       },
            { title: 'Tetris',                                          year: 1988, publisher: 'Atari',             genre: 'Puzzle'       },
            { title: 'Arkanoid',                                        year: 1986, publisher: 'Taito',             genre: 'Action'       },
            { title: 'R-Type',                                          year: 1987, publisher: 'Irem',              genre: 'Shooter'      },
            { title: 'R-Type II',                                       year: 1989, publisher: 'Irem',              genre: 'Shooter'      },
            { title: 'Raiden',                                          year: 1990, publisher: 'Seibu Kaihatsu',    genre: 'Shooter'      },
            { title: 'Raiden II',                                       year: 1993, publisher: 'Seibu Kaihatsu',    genre: 'Shooter'      },
            { title: 'Progear',                                         year: 2001, publisher: 'Capcom',            genre: 'Shooter'      },
            { title: 'Giga Wing',                                       year: 1999, publisher: 'Capcom',            genre: 'Shooter'      },
            { title: 'Truxton',                                         year: 1988, publisher: 'Toaplan',           genre: 'Shooter'      },
            { title: 'Snow Bros.',                                       year: 1990, publisher: 'Toaplan',           genre: 'Action'       },
            { title: 'Bubble Bobble',                                   year: 1986, publisher: 'Taito',             genre: 'Action'       },
        ],
    },

}; // end GAME_LISTS


// ── Title Aliases ───────────────────────────────────────────────────────────
// Maps our canonical title → what Myrient/No-Intro actually names the file
const TITLE_ALIASES = {
    // NES
    'Super Mario Bros.': 'Super Mario Bros.',
    "Mike Tyson's Punch-Out!!": "Mike Tyson's Punch-Out!!",
    "Kirby's Adventure": "Kirby's Adventure",
    // SNES
    'Super Mario World 2: Yoshi\'s Island': 'Super Mario World 2 - Yoshi\'s Island',
    'The Legend of Zelda: A Link to the Past': 'Legend of Zelda, The - A Link to the Past',
    'Final Fantasy VI': 'Final Fantasy III',           // US SNES release name
    'Final Fantasy IV': 'Final Fantasy II',            // US SNES release name
    // GBA
    'Pokemon FireRed Version': 'Pokemon - FireRed Version',
    'Pokemon LeafGreen Version': 'Pokemon - LeafGreen Version',
    'Pokemon Emerald Version': 'Pokemon - Emerald Version',
    'Pokemon Ruby Version': 'Pokemon - Ruby Version',
    'Pokemon Sapphire Version': 'Pokemon - Sapphire Version',
    'The Legend of Zelda: The Minish Cap': 'Legend of Zelda, The - The Minish Cap',
    'The Legend of Zelda: A Link to the Past & Four Swords': 'Legend of Zelda, The - A Link to the Past & Four Swords',
    'Mario & Luigi: Superstar Saga': 'Mario & Luigi - Superstar Saga',
    'Pokemon Mystery Dungeon: Red Rescue Team': 'Pokemon Mystery Dungeon - Red Rescue Team',
    "WarioWare, Inc.: Mega Microgame$!": 'WarioWare, Inc. - Mega Microgame$!',
    'Final Fantasy I & II: Dawn of Souls': 'Final Fantasy I & II - Dawn of Souls',
    'Final Fantasy Tactics Advance': 'Final Fantasy Tactics Advance',
    "Dragon Ball Z: The Legacy of Goku": "Dragon Ball Z - The Legacy of Goku",
    "Dragon Ball Z: The Legacy of Goku II": "Dragon Ball Z - The Legacy of Goku II",
    "Dragon Ball Z: Buu's Fury": "Dragon Ball Z - Buu's Fury",
    // GB
    "Pokemon Red Version": "Pokemon - Red Version",
    "Pokemon Blue Version": "Pokemon - Blue Version",
    "Pokemon Yellow Version: Special Pikachu Edition": "Pokemon - Yellow Version",
    "The Legend of Zelda: Link's Awakening": "Legend of Zelda, The - Link's Awakening",
    "Final Fantasy Adventure": "Final Fantasy Adventure",
    "Final Fantasy Legend": "Final Fantasy Legend, The",
    "Final Fantasy Legend II": "Final Fantasy Legend II",
    "Final Fantasy Legend III": "Final Fantasy Legend III",
    // GBC
    "Pokemon Gold Version": "Pokemon - Gold Version",
    "Pokemon Silver Version": "Pokemon - Silver Version",
    "Pokemon Crystal Version": "Pokemon - Crystal Version",
    "The Legend of Zelda: Oracle of Ages": "Legend of Zelda, The - Oracle of Ages",
    "The Legend of Zelda: Oracle of Seasons": "Legend of Zelda, The - Oracle of Seasons",
    "The Legend of Zelda: Link's Awakening DX": "Legend of Zelda, The - Link's Awakening DX",
    "Game Boy Color Pokemon Pinball": "Pokemon Pinball",
    // N64
    'The Legend of Zelda: Ocarina of Time': "Legend of Zelda, The - Ocarina of Time",
    "The Legend of Zelda: Majora's Mask": "Legend of Zelda, The - Majora's Mask",
    "Super Smash Bros.": "Super Smash Bros.",
    "Pokemon Snap": "Pokemon Snap",
    "Pokemon Stadium": "Pokemon Stadium",
    "Pokemon Stadium 2": "Pokemon Stadium 2",
    "GoldenEye 007": "GoldenEye 007",
    "Conker's Bad Fur Day": "Conker's Bad Fur Day",
    "Paper Mario": "Paper Mario",
    "Mario Party": "Mario Party",
    "Mario Party 2": "Mario Party 2",
    "Mario Party 3": "Mario Party 3",
    // Atari 2600
    "Pitfall!": "Pitfall!",
    "Yars' Revenge": "Yars' Revenge",
    "H.E.R.O.": "H.E.R.O.",
    // SMS
    "Wonder Boy III: The Dragon's Trap": "Wonder Boy III - The Dragon's Trap",
    "Ys: The Vanished Omens": "Ys - The Vanished Omens",
    "Zillion II: The Tri Formation": "Zillion II - The Tri Formation",
    "Fantasy Zone II: The Tears of Opa-Opa": "Fantasy Zone II - The Tears of Opa-Opa",
    // 3DS
    "The Legend of Zelda: Ocarina of Time 3D": "Legend of Zelda, The - Ocarina of Time 3D",
    "The Legend of Zelda: A Link Between Worlds": "Legend of Zelda, The - A Link Between Worlds",
    "The Legend of Zelda: Majora's Mask 3D": "Legend of Zelda, The - Majora's Mask 3D",
    "Pokemon X": "Pokemon X",
    "Pokemon Y": "Pokemon Y",
    "Pokemon Omega Ruby": "Pokemon - Omega Ruby",
    "Pokemon Alpha Sapphire": "Pokemon - Alpha Sapphire",
    "Pokemon Sun": "Pokemon - Sun",
    "Pokemon Moon": "Pokemon - Moon",
    "Pokemon Ultra Sun": "Pokemon - Ultra Sun",
    "Pokemon Ultra Moon": "Pokemon - Ultra Moon",
    "Fire Emblem Fates: Birthright": "Fire Emblem Fates - Birthright",
    "Fire Emblem Fates: Conquest": "Fire Emblem Fates - Conquest",
    // GameCube
    "The Legend of Zelda: The Wind Waker": "Legend of Zelda, The - The Wind Waker",
    "The Legend of Zelda: Twilight Princess": "Legend of Zelda, The - Twilight Princess",
    "The Legend of Zelda: Four Swords Adventures": "Legend of Zelda, The - Four Swords Adventures",
    "Paper Mario: The Thousand-Year Door": "Paper Mario - The Thousand-Year Door",
    "Eternal Darkness: Sanity's Requiem": "Eternal Darkness - Sanity's Requiem",
    // PSP
    "Crisis Core: Final Fantasy VII": "Crisis Core - Final Fantasy VII",
    "Final Fantasy Tactics: War of the Lions": "Final Fantasy Tactics - The War of the Lions",
    "Metal Gear Solid: Peace Walker": "Metal Gear Solid - Peace Walker",
    "Metal Gear Solid: Portable Ops": "Metal Gear Solid - Portable Ops",
};

// ── MAME ROM Name Map ────────────────────────────────────────────────────────
// Maps canonical arcade game title → MAME short ROM set name (the zip filename)
// Captain Commando → captcomm.zip, etc.
const MAME_ROM_MAP = {
    'Pac-Man':                                        'puckman',
    'Ms. Pac-Man':                                    'mspacman',
    'Donkey Kong':                                    'dkong',
    'Donkey Kong Jr.':                                'dkongjr',
    'Frogger':                                        'frogger',
    'Galaga':                                         'galaga',
    'Galaxian':                                       'galaxian',
    'Centipede':                                      'centiped',
    'Space Invaders':                                 'invaders',
    'Asteroids':                                      'asteroid',
    'Tempest':                                        'tempest',
    'Zaxxon':                                         'zaxxon',
    'Defender':                                       'defender',
    'Robotron 2084':                                  'robotron',
    'Joust':                                          'joust',
    'Qbert':                                          'qbert',
    'Dig Dug':                                        'digdug',
    'Pengo':                                          'pengo',
    'Millipede':                                      'milliped',
    'Tron':                                           'tron',
    'Spy Hunter':                                     'spyhuntr',
    'Pole Position':                                  'polepos',
    'Pole Position II':                               'polepos2',
    'OutRun':                                         'outrun',
    'After Burner':                                   'afterbrn',
    'After Burner II':                                'aburner2',
    'Space Harrier':                                  'sharrier',
    'Thunder Blade':                                  'thndrbld',
    'Ghosts\'n Goblins':                              'ghosts',
    '1942':                                           '1942',
    '1943: The Battle of Midway':                     '1943',
    '1944: The Loop Master':                          '1944',
    'Commando':                                       'commando',
    'Bionic Commando':                                'bionicc',
    'Street Fighter II: The World Warrior':           'sf2',
    'Street Fighter II Turbo':                        'sf2t',
    'Super Street Fighter II Turbo':                  'ssf2t',
    'Street Fighter Alpha':                           'sfa',
    'Street Fighter Alpha 2':                         'sfa2',
    'Street Fighter III: 3rd Strike':                 'sfiii3',
    'Mortal Kombat':                                  'mk',
    'Mortal Kombat II':                               'mk2',
    'Mortal Kombat 3':                                'mk3',
    'The King of Fighters \'94':                      'kof94',
    'The King of Fighters \'98':                      'kof98',
    'The King of Fighters 2002':                      'kof2002',
    'Samurai Shodown':                                'ssf',
    'Samurai Shodown II':                             'ssf2',
    'Fatal Fury: King of Fighters':                   'fatfury1',
    'Fatal Fury Special':                             'fatfursp',
    'Metal Slug':                                     'mslug',
    'Metal Slug 2':                                   'mslug2',
    'Metal Slug 3':                                   'mslug3',
    'Metal Slug X':                                   'mslugx',
    'Contra':                                         'contra',
    'Super Contra':                                   'supercon',
    'Gradius':                                        'gradius',
    'Gradius II':                                     'gradius2',
    'Gradius III':                                    'gradius3',
    'Life Force':                                     'lifefrce',
    'Sunset Riders':                                  'sunsetbl',
    'Teenage Mutant Ninja Turtles':                   'tmnt',
    'Teenage Mutant Ninja Turtles: Turtles in Time':  'tmnt2',
    'The Simpsons':                                   'simpsons',
    'X-Men':                                          'xmen',
    'Dungeons & Dragons: Tower of Doom':              'dndtower',
    'Dungeons & Dragons: Shadow over Mystara':        'dndsom',
    'Captain Commando':                               'captcomm',
    'Final Fight':                                    'ffight',
    'Final Fight 2':                                  'ffight2',
    'Cadillacs and Dinosaurs':                        'dino',
    'The Punisher':                                   'punisher',
    'Warriors of Fate':                               'wof',
    'Battle Circuit':                                 'batcir',
    'Knights of the Round':                           'knights',
    'King of Dragons':                                'kod',
    'Armored Warriors':                               'armwar',
    'Marvel Super Heroes':                            'msh',
    'X-Men: Children of the Atom':                    'xmcota',
    'Marvel vs. Capcom':                              'mvsc',
    'Marvel vs. Capcom 2':                            'mvsc2',
    'Darkstalkers':                                   'dstlk',
    'Night Warriors: Darkstalkers\' Revenge':         'nwarr',
    'Darkstalkers 3':                                 'vsav',
    'Street Fighter EX':                              'sfex',
    'Puzzle Bobble':                                  'bublbob2',
    'Puzzle Fighter II Turbo':                        'spf2t',
    'Tetris':                                         'tetris',
    'Arkanoid':                                       'arkanoid',
    'R-Type':                                         'rtype',
    'R-Type II':                                      'rtype2',
    'Raiden':                                         'raiden',
    'Raiden II':                                      'raiden2',
    'Progear':                                        'progear',
    'Giga Wing':                                      'gigawing',
    'Truxton':                                        'truxton',
    'Snow Bros.':                                     'snowbros',
    'Bubble Bobble':                                  'bublbobl',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalize(s) {
    return (s || '')
        .toLowerCase()
        .replace(/\s*\([^)]*\)/g, '')   // strip (USA), (Europe), (Rev 1), etc.
        .replace(/[^a-z0-9\s]/g, ' ')   // punctuation → space
        .replace(/\s+/g, ' ')
        .trim();
}

// Score how well candidateName matches targetTitle (higher = better)
function matchScore(targetTitle, candidateName) {
    const bad = /\b(pirate|unl|hack|proto|demo|sample|beta|aftermarket|homebrew)\b/i;
    if (bad.test(candidateName)) return 0;

    const t = normalize(targetTitle);
    const c = normalize(candidateName);

    if (c === t) return 1000;

    const tw = t.split(' ').filter(Boolean);
    const cw = c.split(' ').filter(Boolean);
    const cSet = new Set(cw);

    let hits = 0;
    for (const w of tw) if (cSet.has(w)) hits++;

    const cnLower = (candidateName || '').toLowerCase();
    const bonus = (cnLower.includes('usa') ||
                   cnLower.includes('world') ||
                   cnLower.includes('en,')) ? 20 : 0;

    const extra = Math.max(0, cw.length - tw.length);
    const score = hits * 10 - extra * 8 + bonus;

    // Must match at least half the target words
    return hits >= Math.ceil(tw.length / 2) ? score : 0;
}

// Fetch text from URL (with redirect following)
function fetchText(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        mod.get(url, { headers: { 'User-Agent': 'MollysArcade/1.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return fetchText(res.headers.location).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// Get Myrient directory listing for a system
async function getMyrientListing(baseUrl) {
    const html = await fetchText(baseUrl);
    const re = /href="([^"]+\.zip)"/gi;
    const files = [];
    let m;
    while ((m = re.exec(html)) !== null) {
        files.push(decodeURIComponent(m[1]));
    }
    return files;
}

const BAD_DUMP = /\b(pirate|unl|hack|proto|demo|sample|beta|aftermarket|homebrew)\b/i;
const REGION_PREF = /\b(usa|world|en,)\b/i;

// Find best matching file in Myrient listing
// For arcade: uses MAME_ROM_MAP exact lookup (MAME filenames are short cryptic IDs)
// For all others: fuzzy matchScore + alias boost + region preference
function findMyrientFile(title, files, sysId) {
    // Arcade: MAME ROM names are 8-char IDs — use direct map lookup
    if (sysId === 'arcade') {
        const romName = MAME_ROM_MAP[title];
        if (!romName) return null;
        const target = romName.toLowerCase() + '.zip';
        return files.find(f => f.toLowerCase() === target) || null;
    }

    const alias = TITLE_ALIASES[title];
    let best = null, bestScore = 0;
    for (const f of files) {
        if (BAD_DUMP.test(f)) continue;           // skip pirates/hacks always
        const baseName = f.replace('.zip', '');

        let s = matchScore(title, baseName);
        if (s === 0) continue;
        if (alias && f.toLowerCase().includes(alias.toLowerCase())) s += 200;
        if (REGION_PREF.test(f)) s += 30;        // prefer USA/World

        if (s > bestScore) { bestScore = s; best = f; }
    }
    return best;
}

// Follow HTTP redirects (needed before opening a WriteStream)
function resolveRedirects(url, maxHops = 8) {
    return new Promise((resolve, reject) => {
        let hops = 0;
        function follow(u) {
            if (++hops > maxHops) return reject(new Error('Too many redirects'));
            const mod = u.startsWith('https') ? https : http;
            const req = mod.request(u, { method: 'HEAD',
                headers: { 'User-Agent': 'MollysArcade/1.0' } }, res => {
                if (res.statusCode === 301 || res.statusCode === 302 ||
                    res.statusCode === 307 || res.statusCode === 308) {
                    return follow(res.headers.location);
                }
                resolve(u);
            });
            req.on('error', reject);
            req.end();
        }
        follow(url);
    });
}


// Download a file from url to dest path, with progress display
function downloadFile(url, dest, label) {
    return new Promise(async (resolve, reject) => {
        if (fs.existsSync(dest)) {
            console.log(`  ✓ already exists: ${label}`);
            return resolve(true);
        }

        let finalUrl;
        try { finalUrl = await resolveRedirects(url); }
        catch (e) { console.log(`  ✗ redirect failed: ${label}: ${e.message}`); return resolve(false); }

        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const tmp = dest + '.tmp';
        const file = fs.createWriteStream(tmp);

        const mod = finalUrl.startsWith('https') ? https : http;
        const req = mod.get(finalUrl, { headers: { 'User-Agent': 'MollysArcade/1.0' } }, res => {
            if (res.statusCode === 301 || res.statusCode === 302 ||
                res.statusCode === 307 || res.statusCode === 308) {
                file.close();
                fs.unlink(tmp, () => {});
                return downloadFile(res.headers.location, dest, label).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                file.close();
                fs.unlink(tmp, () => {});
                console.log(`  ✗ HTTP ${res.statusCode}: ${label}`);
                return resolve(false);
            }

            const total = parseInt(res.headers['content-length'] || '0', 10);
            let got = 0;
            res.on('data', chunk => {
                got += chunk.length;
                if (total) {
                    const pct = Math.round(got / total * 100);
                    process.stdout.write(`\r  ↓ ${label} ${pct}%   `);
                }
            });
            res.pipe(file);
            file.on('finish', () => {
                file.close(() => {
                    if (got < 100) {
                        fs.unlink(tmp, () => {});
                        console.log(`\n  ✗ empty download: ${label}`);
                        return resolve(false);
                    }
                    fs.rename(tmp, dest, err => {
                        if (err) { console.log(`\n  ✗ rename failed: ${label}`); return resolve(false); }
                        process.stdout.write(`\r  ✓ ${label}${' '.repeat(20)}\n`);
                        resolve(true);
                    });
                });
            });
        });
        req.on('error', err => {
            file.close();
            fs.unlink(tmp, () => {});
            console.log(`  ✗ network error: ${label}: ${err.message}`);
            resolve(false);
        });
    });
}

// Download boxart from libretro thumbnails
async function downloadArtwork(game, libretroDir, artDir) {
    const artFile = path.join(artDir, `${game.title.replace(/[/\\?%*:|"<>]/g, '_')}.png`);
    if (fs.existsSync(artFile)) return true;

    const enc = (s) => encodeURIComponent(s.replace(/[/\\?%*:|"<>]/g, '_'));
    const baseUrl = `https://thumbnails.libretro.com/${encodeURIComponent(libretroDir)}`;

    // Try multiple name variants and slot types
    const nameVariants = [
        game.title,
        game.title + ' (USA)',
        game.title + ' (USA, Europe)',
        TITLE_ALIASES[game.title] || null,
    ].filter(Boolean);

    const slots = ['Named_Boxarts', 'Named_Snaps', 'Named_Titles'];

    for (const slot of slots) {
        for (const name of nameVariants) {
            const url = `${baseUrl}/${slot}/${enc(name)}.png`;
            const ok = await downloadFile(url, artFile, `art: ${game.title}`);
            if (ok) return true;
        }
    }
    return false;
}

// API helpers
function apiGet(apiPath) {
    return new Promise((resolve, reject) => {
        http.get(`${API_BASE}${apiPath}`, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try { resolve(JSON.parse(d)); }
                catch { resolve(null); }
            });
        }).on('error', reject);
    });
}

function apiPost(apiPath, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request(`${API_BASE}${apiPath}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function apiPut(apiPath, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request(`${API_BASE}${apiPath}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));


// ── Process a single system ──────────────────────────────────────────────────
async function processSystem(systemId, cfg) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ${systemId.toUpperCase()} — ${cfg.games.length} games`);
    console.log(`${'═'.repeat(60)}`);

    const romsDir  = path.join(ROMS_BASE, systemId);
    const artDir   = path.join(ARTWORK_BASE, systemId);
    fs.mkdirSync(romsDir, { recursive: true });
    fs.mkdirSync(artDir,  { recursive: true });

    // Fetch Myrient directory listing once
    console.log(`\n  📋 Fetching Myrient listing for ${systemId}...`);
    let listing = [];
    try {
        listing = await getMyrientListing(cfg.myrientBase);
        console.log(`  📋 Found ${listing.length} files on Myrient`);
    } catch (e) {
        console.log(`  ✗ Could not fetch Myrient listing: ${e.message}`);
    }

    let downloaded = 0, skipped = 0, failed = 0;

    for (let i = 0; i < cfg.games.length; i++) {
        const game = cfg.games[i];
        console.log(`\n[${i + 1}/${cfg.games.length}] ${game.title}`);

        // Find the ROM file on Myrient
        const myrientFile = findMyrientFile(game.title, listing, systemId);
        let romOk = false;

        if (myrientFile) {
            const romUrl  = cfg.myrientBase + encodeURIComponent(myrientFile);
            const romDest = path.join(romsDir, myrientFile);
            const alreadyHad = fs.existsSync(romDest);

            romOk = await downloadFile(romUrl, romDest, myrientFile);
            if (romOk && !alreadyHad) downloaded++;
            if (!romOk) failed++;
        } else {
            console.log(`  ✗ not found on Myrient: ${game.title}`);
            failed++;
        }

        // Download artwork in parallel (non-blocking)
        const artPromise = downloadArtwork(game, cfg.libretroDir, artDir);

        // Delay between ROMs to be polite
        if (i < cfg.games.length - 1) await sleep(ROM_DELAY_MS);

        await artPromise; // wait for art before next iteration
    }

    console.log(`\n  ─── ${systemId.toUpperCase()} done: ${downloaded} new, ${failed} failed ───\n`);

    // Trigger a library scan via the arcade server API
    try {
        console.log('  📡 Triggering library scan...');
        await apiPost('/api/scanner/scan', { path: romsDir });
        await sleep(3000); // give scan time to run

        // Fetch all games for this system to write metadata (limit=500 to get all)
        const gamesInDB = await apiGet(`/api/library?system=${systemId}&limit=500`);
        if (!gamesInDB || !Array.isArray(gamesInDB.games)) {
            console.log('  ⚠ Could not fetch game list for metadata update');
            return;
        }

        let metaOk = 0;
        for (const dbGame of gamesInDB.games) {
            // Match DB game back to our curated entry
            const match = cfg.games.find(g =>
                matchScore(g.title, dbGame.title) > 50 ||
                normalize(g.title) === normalize(dbGame.title)
            );
            if (!match) continue;

            const payload = {
                title:     match.title,
                year:      match.year,
                publisher: match.publisher,
                genre:     match.genre,
                players:   1,
            };
            await apiPut(`/api/game/${dbGame.id}/metadata`, payload);
            metaOk++;
        }
        console.log(`  📝 Metadata updated for ${metaOk} games`);
    } catch (e) {
        console.log(`  ⚠ Scan/metadata error: ${e.message}`);
    }
}

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
    const arg = (process.argv[2] || 'all').toLowerCase();

    let systems;
    if (arg === 'all') {
        systems = Object.keys(GAME_LISTS);
    } else {
        systems = process.argv.slice(2).map(s => s.toLowerCase());
        const invalid = systems.filter(s => !GAME_LISTS[s]);
        if (invalid.length) {
            console.error(`Unknown system(s): ${invalid.join(', ')}`);
            console.error(`Valid: ${Object.keys(GAME_LISTS).join(', ')}`);
            process.exit(1);
        }
    }

    const total = systems.reduce((sum, s) => sum + GAME_LISTS[s].games.length, 0);
    console.log(`\n🕹️  Molly's World Arcade — Top100 Scraper`);
    console.log(`   Systems : ${systems.join(', ')}`);
    console.log(`   Games   : ${total}`);
    console.log(`   Source  : Myrient (myrient.erista.me)`);
    console.log(`   ⚠️  URGENT: Myrient shuts down March 31 2026!\n`);

    for (const sysId of systems) {
        await processSystem(sysId, GAME_LISTS[sysId]);
    }

    console.log('\n✅ All done!\n');
})();
