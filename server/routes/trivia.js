import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// ── Hardcoded retro gaming trivia (always available, no DB dependency) ────────
const RETRO_TRIVIA = [
    { q: 'What year was the original Nintendo Entertainment System released in North America?', a: '1985', wrong: ['1983', '1987', '1981'] },
    { q: 'What is the best-selling game for the Sega Genesis?', a: 'Sonic the Hedgehog', wrong: ['Streets of Rage 2', 'Golden Axe', 'Altered Beast'] },
    { q: 'How many bits does the Super Nintendo process?', a: '16 bits', wrong: ['8 bits', '32 bits', '64 bits'] },
    { q: 'What company created the Game Boy?', a: 'Nintendo', wrong: ['Sega', 'Atari', 'Sony'] },
    { q: 'What was Pac-Man originally called in Japan?', a: 'Puck Man', wrong: ['Dot Man', 'Chomp Man', 'Pac Boy'] },
    { q: 'What year did the Atari 2600 launch?', a: '1977', wrong: ['1975', '1979', '1980'] },
    { q: 'Who is Mario\'s brother?', a: 'Luigi', wrong: ['Wario', 'Toad', 'Yoshi'] },
    { q: 'What was Sega\'s first home console?', a: 'SG-1000', wrong: ['Master System', 'Genesis', 'Game Gear'] },
    { q: 'What is the highest possible score in a single game of Pac-Man?', a: '3,333,360', wrong: ['999,999', '1,000,000', '5,000,000'] },
    { q: 'What color is the ghost "Blinky" in Pac-Man?', a: 'Red', wrong: ['Pink', 'Blue', 'Orange'] },
    { q: 'How many worlds are in the original Super Mario Bros?', a: '8', wrong: ['6', '10', '12'] },
    { q: 'What is the name of the protagonist in The Legend of Zelda?', a: 'Link', wrong: ['Zelda', 'Ganon', 'Sheik'] },
    { q: 'What year was Street Fighter II released in arcades?', a: '1991', wrong: ['1989', '1993', '1987'] },
    { q: 'What does "NES" stand for?', a: 'Nintendo Entertainment System', wrong: ['New Entertainment System', 'Nintendo Electronic System', 'National Entertainment System'] },
    { q: 'Which company made the Neo Geo?', a: 'SNK', wrong: ['Capcom', 'Konami', 'Namco'] },
    { q: 'What was the first commercially successful video game?', a: 'Pong', wrong: ['Space Invaders', 'Pac-Man', 'Asteroids'] },
    { q: 'What year did the Sega Dreamcast launch in North America?', a: '1999', wrong: ['1997', '2000', '2001'] },
    { q: 'How many buttons does a standard SNES controller have?', a: '8', wrong: ['6', '10', '4'] },
    { q: 'What is Mega Man\'s real name?', a: 'Rock', wrong: ['Roll', 'Blues', 'Proto'] },
    { q: 'What was the first game to feature a save battery?', a: 'The Legend of Zelda', wrong: ['Dragon Quest', 'Final Fantasy', 'Metroid'] },
    { q: 'What console was Sonic the Hedgehog created for?', a: 'Sega Genesis', wrong: ['Sega Master System', 'Game Gear', 'Sega Saturn'] },
    { q: 'What year was the original Game Boy released?', a: '1989', wrong: ['1987', '1991', '1985'] },
    { q: 'What is the name of Donkey Kong\'s nephew?', a: 'Diddy Kong', wrong: ['Funky Kong', 'Cranky Kong', 'Chunky Kong'] },
    { q: 'What was the TurboGrafx-16 called in Japan?', a: 'PC Engine', wrong: ['Super Grafx', 'Core Grafx', 'Turbo Duo'] },
    { q: 'What does "RPG" stand for in gaming?', a: 'Role-Playing Game', wrong: ['Real Player Game', 'Rapid Play Game', 'Random Point Generator'] },
    { q: 'What arcade game features a frog crossing a road?', a: 'Frogger', wrong: ['Centipede', 'Q*bert', 'Dig Dug'] },
    { q: 'How many ghosts chase Pac-Man?', a: '4', wrong: ['3', '5', '6'] },
    { q: 'What company developed Street Fighter?', a: 'Capcom', wrong: ['SNK', 'Konami', 'Namco'] },
    { q: 'What year was the PlayStation 1 released in Japan?', a: '1994', wrong: ['1993', '1995', '1996'] },
    { q: 'What power-up makes Mario grow big?', a: 'Super Mushroom', wrong: ['Fire Flower', 'Star', '1-Up Mushroom'] },
    { q: 'What is the rarest officially released NES game?', a: 'Nintendo World Championships', wrong: ['Stadium Events', 'Little Samson', 'Panic Restaurant'] },
    { q: 'What system was the first to use CDs?', a: 'TurboGrafx-CD', wrong: ['Sega CD', 'PlayStation', '3DO'] },
    { q: 'What does the "64" in Nintendo 64 refer to?', a: '64-bit processor', wrong: ['64 launch games', '64 MB RAM', 'Product number 64'] },
    { q: 'Who is the final boss in the original Sonic the Hedgehog?', a: 'Dr. Robotnik', wrong: ['Metal Sonic', 'Chaos', 'Shadow'] },
    { q: 'What year did arcades peak in revenue in the US?', a: '1982', wrong: ['1980', '1985', '1978'] },
    { q: 'What game caused the "video game crash" of 1983?', a: 'E.T. the Extra-Terrestrial', wrong: ['Pac-Man (2600)', 'Superman', 'Custer\'s Revenge'] },
    { q: 'What is Kirby\'s main ability?', a: 'Inhaling enemies', wrong: ['Flying', 'Super speed', 'Shape-shifting'] },
    { q: 'How many emeralds does Sonic need to transform into Super Sonic?', a: '7', wrong: ['5', '6', '8'] },
    { q: 'What was Nintendo\'s business before video games?', a: 'Playing cards', wrong: ['Toys', 'Electronics', 'Taxi service'] },
    { q: 'What is the name of the spaceship in Galaga?', a: 'Fighter', wrong: ['Falcon', 'Galaxian', 'Starhawk'] },
];

// ── Generate DB-powered trivia from actual game library ──────────────────────
function generateDBTrivia(db) {
    const questions = [];

    // "What year was [game] released?" — need games with year data
    const yearGames = db.prepare(`
        SELECT DISTINCT r.clean_name, CAST(m.year AS INTEGER) as year, r.system_id
        FROM roms r JOIN metadata m ON m.rom_id = r.id
        WHERE m.year IS NOT NULL AND m.year != ''
        ORDER BY RANDOM() LIMIT 20
    `).all();

    for (const g of yearGames) {
        const yr = g.year;
        if (yr < 1970 || yr > 2015) continue;
        const wrongYears = new Set();
        while (wrongYears.size < 3) {
            const offset = [-3, -2, -1, 1, 2, 3, 4, 5][Math.floor(Math.random() * 8)];
            wrongYears.add(String(yr + offset));
        }
        wrongYears.delete(String(yr)); // safety
        if (wrongYears.size < 3) continue;
        questions.push({
            q: `What year was "${g.clean_name}" released?`,
            a: String(yr),
            wrong: [...wrongYears].slice(0, 3),
        });
    }

    // "Who published [game]?" — need games with publisher
    const pubGames = db.prepare(`
        SELECT r.clean_name, m.publisher FROM roms r JOIN metadata m ON m.rom_id = r.id
        WHERE m.publisher IS NOT NULL AND m.publisher != ''
        ORDER BY RANDOM() LIMIT 20
    `).all();

    const allPubs = db.prepare(`
        SELECT DISTINCT publisher FROM metadata WHERE publisher IS NOT NULL AND publisher != ''
    `).all().map(r => r.publisher);

    for (const g of pubGames) {
        if (allPubs.length < 4) continue;
        const wrongs = new Set();
        while (wrongs.size < 3) {
            const pick = allPubs[Math.floor(Math.random() * allPubs.length)];
            if (pick !== g.publisher) wrongs.add(pick);
        }
        questions.push({
            q: `Who published "${g.clean_name}"?`,
            a: g.publisher,
            wrong: [...wrongs],
        });
    }

    // "What genre is [game]?" — need games with genre
    const genreGames = db.prepare(`
        SELECT r.clean_name, m.genre FROM roms r JOIN metadata m ON m.rom_id = r.id
        WHERE m.genre IS NOT NULL AND m.genre != ''
        ORDER BY RANDOM() LIMIT 15
    `).all();

    const allGenres = db.prepare(`
        SELECT DISTINCT genre FROM metadata WHERE genre IS NOT NULL AND genre != ''
    `).all().map(r => r.genre);

    for (const g of genreGames) {
        if (allGenres.length < 4) continue;
        const wrongs = new Set();
        while (wrongs.size < 3) {
            const pick = allGenres[Math.floor(Math.random() * allGenres.length)];
            if (pick !== g.genre) wrongs.add(pick);
        }
        questions.push({
            q: `What genre is "${g.clean_name}"?`,
            a: g.genre,
            wrong: [...wrongs],
        });
    }

    // "What system was [game] on?" (for single-system games)
    const sysGames = db.prepare(`
        SELECT r.clean_name, s.name as system_name FROM roms r
        JOIN systems s ON s.id = r.system_id
        WHERE r.clean_name IN (
            SELECT clean_name FROM roms GROUP BY clean_name HAVING COUNT(DISTINCT system_id) = 1
        )
        ORDER BY RANDOM() LIMIT 15
    `).all();

    const allSystems = db.prepare(`SELECT name FROM systems`).all().map(r => r.name);

    for (const g of sysGames) {
        if (allSystems.length < 4) continue;
        const wrongs = new Set();
        while (wrongs.size < 3) {
            const pick = allSystems[Math.floor(Math.random() * allSystems.length)];
            if (pick !== g.system_name) wrongs.add(pick);
        }
        questions.push({
            q: `What system was "${g.clean_name}" originally on?`,
            a: g.system_name,
            wrong: [...wrongs],
        });
    }

    return questions;
}

// ── Extract trivia facts from AI-generated game_intel trivia docs ────────────
function generateIntelTrivia(db) {
    const questions = [];
    try {
        // Grab random trivia docs from game_intel
        const docs = db.prepare(`
            SELECT gi.game_title, gi.content_md
            FROM game_intel gi
            WHERE gi.doc_type = 'trivia' AND length(gi.content_md) > 100
            ORDER BY RANDOM() LIMIT 30
        `).all();

        for (const doc of docs) {
            // Extract bullet-point facts (lines starting with - or * that are meaty)
            const lines = doc.content_md.split('\n')
                .map(l => l.trim())
                .filter(l => (l.startsWith('- ') || l.startsWith('* ')) && l.length > 40 && l.length < 300)
                .map(l => l.replace(/^[-*]\s*\*?\*?/, '').replace(/\*\*$/,'').trim());

            if (lines.length === 0) continue;

            // Pick one random fact and make it a true/false-style question
            const fact = lines[Math.floor(Math.random() * lines.length)];
            const game = doc.game_title;

            questions.push({
                q: `True or false about "${game}": ${fact}`,
                a: 'True',
                wrong: ['False', 'Only in Japan', 'Urban legend'],
            });
        }

        // Also generate "Which game..." questions from multiple trivia docs
        if (docs.length >= 4) {
            const picked = docs.slice(0, 8);
            for (let i = 0; i < Math.min(picked.length, 5); i++) {
                const doc = picked[i];
                const lines = doc.content_md.split('\n')
                    .map(l => l.trim())
                    .filter(l => (l.startsWith('- ') || l.startsWith('* ')) && l.length > 30)
                    .map(l => l.replace(/^[-*]\s*\*?\*?/, '').replace(/\*\*$/,'').trim());
                if (!lines.length) continue;

                const fact = lines[0];
                const wrongGames = picked
                    .filter(d => d.game_title !== doc.game_title)
                    .slice(0, 3)
                    .map(d => d.game_title);
                if (wrongGames.length < 3) continue;

                questions.push({
                    q: `Which game is this fact about? "${fact.slice(0, 120)}${fact.length > 120 ? '...' : ''}"`,
                    a: doc.game_title,
                    wrong: wrongGames,
                });
            }
        }
    } catch { /* intel trivia optional */ }
    return questions;
}

// ── GET /api/trivia/random?count=5 ───────────────────────────────────────────
router.get('/random', (req, res) => {
    const count = Math.min(Math.max(parseInt(req.query.count) || 5, 1), 20);
    const db = getDB();

    let pool = [...RETRO_TRIVIA];

    // Add DB-generated questions if we have data
    try {
        const dbQ = generateDBTrivia(db);
        pool = pool.concat(dbQ);
    } catch (e) {
        // DB questions optional — static trivia still works
    }

    // Add AI-generated game_intel trivia facts
    try {
        const intelQ = generateIntelTrivia(db);
        pool = pool.concat(intelQ);
    } catch {
        // intel trivia optional
    }

    // Shuffle and pick
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const picked = pool.slice(0, count).map(q => {
        // Shuffle answer options
        const options = [q.a, ...q.wrong];
        for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
        }
        return {
            question: q.q,
            options,
            correct: options.indexOf(q.a),
        };
    });

    res.json({ questions: picked });
});

export default router;
