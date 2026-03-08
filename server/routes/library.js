import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// Neo Geo ROM filename prefixes (for MOTU's Favs tag filtering)
const NEO_GEO_PREFIXES = [
    '2020bb','3countb','aof','alpham','androdun','bangbead','bakatono','bjourney',
    'blazstar','breakers','breakrev','bstars','burningf','crsword','ctomaday',
    'cyberlip','doubledr','eightman','fatfur','fbfrenzy','fightfev','flipshot',
    'galaxyfg','ganryu','garou','ghostlop','goalx3','gowcaizr','gpilots',
    'gururin','irrmaze','janshin','jockeygp','joyjoy','kabukikl','karnovr',
    'kf','kizuna','kof','lastblad','lastreso','lbowling','legendos','lresort',
    'magdrop','maglord','mahretsu','matrim','miexchng','minasan','moshougi',
    'mslug','mutnat','nam1975','ncombat','ncommand','neobombe','neocup98',
    'neodrift','neogeo','neomrdo','ninjamas','nitd','overtop','panicbom',
    'pbobbl','pgoal','pnyaa','popbounc','preisle2','pspikes','pulstar',
    'puzzl','quizdais','quizkof','ragnagrd','rbff','ridhero','roboarmy',
    'rotd','s1945p','samsh','savagere','sbp','sdodgeb','sengoku','shocktro',
    'sonicwi','spinmast','ssideki','stakwin','strhoop','superspy','svc',
    'tophuntr','tpgolf','trally','turfmast','twinspri','tws96','viewpoin',
    'vliner','wakuwaku','whp','wh1','wh2','wjammers','zedblade','zintrckb','zupapa',
];

// Beat-em-up keywords for tag filtering
const BEAT_EM_UP_KEYWORDS = [
    'streets of rage','final fight','double dragon','golden axe','cadillacs',
    'captain commando','knights of the round','alien vs predator','avsp',
    'punisher','battletoads','turtles in time','tmnt','teenage mutant',
    'x-men','simpsons','spider-man','bad dudes','baddudes','renegade',
    'vendetta','violent storm','vigilante','moonwalker','alien storm',
    'dungeons & dragons','shadow over mystara','tower of doom','guardians',
    'denjin makai','shadow force','wrestlefest','crime fighters',
    'metamorphic force','bucky o\'hare','mystic warriors','armored warriors',
    'river city ransom','comix zone','splatterhouse','ninja baseball',
    'mercs','guardian heroes','warriors','maximum carnage',
    'captcomm','ddragon','avsp','tmnt','simpsons','xmen','punisher',
];

function isNeoGeo(filename) {
    const fn = (filename || '').toLowerCase().replace('.zip','');
    return NEO_GEO_PREFIXES.some(p => fn.startsWith(p));
}

function isBeatEmUp(cleanName, filename) {
    const name = (cleanName || '').toLowerCase();
    const fn = (filename || '').toLowerCase();
    return BEAT_EM_UP_KEYWORDS.some(kw => name.includes(kw) || fn.includes(kw));
}

// Main library listing
router.get('/', (req, res) => {
    const db = getDB();
    const { system, search, tag, sort = 'name', order = 'asc', page = 1, limit = 60 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = ["r.source != 'test'"];
    let params = [];

    if (system) {
        where.push('r.system_id = ?');
        params.push(system);
    }
    if (search) {
        where.push('r.clean_name LIKE ?');
        params.push(`%${search}%`);
    }

    // Tag-based filtering (Neo Geo / Beat-em-ups) — restrict to arcade systems
    if (tag === 'neogeo' || tag === 'beatemup') {
        where.push("(r.system_id = 'arcade' OR r.system_id = 'fbneo')");
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const sortMap = {
        name: 'r.clean_name',
        added: 'r.added_at',
        system: 's.sort_order',
        size: 'r.size_bytes',
    };
    const sortCol = sortMap[sort] || 'r.clean_name';
    const sortDir = order === 'desc' ? 'DESC' : 'ASC';

    // For tag filters, fetch all matching then filter in JS
    if (tag === 'neogeo' || tag === 'beatemup') {
        const allRows = db.prepare(`
            SELECT r.*, COALESCE(m.title, r.clean_name) as title,
                   m.artwork_path, m.region, m.year, m.genre,
                   s.short_name as system_name, s.color as system_color,
                   CASE WHEN f.rom_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
                   (SELECT MAX(started_at) FROM play_history ph WHERE ph.rom_id = r.id) as last_played
            FROM roms r
            LEFT JOIN metadata m ON m.rom_id = r.id
            LEFT JOIN systems s ON s.id = r.system_id
            LEFT JOIN favorites f ON f.rom_id = r.id
            ${whereClause}
            ORDER BY ${sortCol} ${sortDir}
        `).all(...params);

        const filtered = tag === 'neogeo'
            ? allRows.filter(r => isNeoGeo(r.filename))
            : allRows.filter(r => isBeatEmUp(r.clean_name, r.filename));

        const total = filtered.length;
        const paged = filtered.slice(offset, offset + parseInt(limit));

        return res.json({
            games: paged,
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(total / parseInt(limit)),
            tag,
        });
    }

    const countRow = db.prepare(`
        SELECT COUNT(*) as total FROM roms r
        LEFT JOIN systems s ON s.id = r.system_id
        ${whereClause}
    `).get(...params);

    const rows = db.prepare(`
        SELECT r.*, COALESCE(m.title, r.clean_name) as title,
               m.artwork_path, m.region, m.year, m.genre,
               s.short_name as system_name, s.color as system_color,
               CASE WHEN f.rom_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
               (SELECT MAX(started_at) FROM play_history ph WHERE ph.rom_id = r.id) as last_played
        FROM roms r
        LEFT JOIN metadata m ON m.rom_id = r.id
        LEFT JOIN systems s ON s.id = r.system_id
        LEFT JOIN favorites f ON f.rom_id = r.id
        ${whereClause}
        ORDER BY ${sortCol} ${sortDir}
        LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    res.json({
        games: rows,
        total: countRow.total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countRow.total / parseInt(limit)),
    });
});

// ── Genre Rooms — curated genre collections with counts + sample art ──────
router.get('/genres', (req, res) => {
    const db = getDB();

    const ROOMS = [
        { id: 'arcade',   label: 'Arcade',          icon: '👾', color: '#f59e0b', type: 'system',  value: 'arcade'   },
        { id: 'fighting', label: 'Fighting',         icon: '🥊', color: '#ef4444', type: 'keyword', value: 'fighter'  },
        { id: 'snes',     label: 'Super Nintendo',   icon: '🎮', color: '#3b82f6', type: 'system',  value: 'snes'     },
        { id: 'psx',      label: 'PlayStation',      icon: '💽', color: '#6366f1', type: 'system',  value: 'psx'      },
        { id: 'genesis',  label: 'Sega Genesis',     icon: '⚡', color: '#10b981', type: 'system',  value: 'genesis'  },
        { id: 'gba',      label: 'Game Boy',         icon: '🎯', color: '#8b5cf6', type: 'system',  value: 'gba'      },
        { id: 'nes',      label: 'NES',              icon: '🕹️', color: '#a78bfa', type: 'system',  value: 'nes'      },
        { id: 'mario',    label: 'Mario Universe',   icon: '🍄', color: '#f97316', type: 'keyword', value: 'mario'    },
        { id: 'sonic',    label: 'Sonic World',      icon: '💨', color: '#06b6d4', type: 'keyword', value: 'sonic'    },
        { id: 'racing',   label: 'Racing',           icon: '🏎️', color: '#84cc16', type: 'keyword', value: 'racing'   },
        { id: 'zelda',    label: 'Zelda',            icon: '🗡️', color: '#eab308', type: 'keyword', value: 'zelda'    },
        { id: 'street',   label: 'Street Fighter',   icon: '👊', color: '#ec4899', type: 'keyword', value: 'street fighter' },
        { id: 'beatemup', label: 'Beat-Em-Ups',      icon: '💥', color: '#f43f5e', type: 'tag',     value: 'beatemup' },
        { id: 'neogeo',   label: 'Neo Geo',          icon: '🔥', color: '#fb923c', type: 'tag',     value: 'neogeo'   },
        { id: 'megaman',  label: 'Mega Man',         icon: '🤖', color: '#38bdf8', type: 'keyword', value: 'mega man' },
        { id: 'sports',   label: 'Sports',           icon: '⚽', color: '#4ade80', type: 'keyword', value: 'ball'     },
    ];

    const rooms = ROOMS.map(room => {
        let count = 0;
        let sample_art = null;

        try {
            if (room.type === 'system') {
                const r = db.prepare(`SELECT COUNT(*) as cnt FROM roms WHERE system_id = ?`).get(room.value);
                count = r?.cnt || 0;
                if (count > 0) {
                    const a = db.prepare(`
                        SELECT m.artwork_path FROM roms r
                        LEFT JOIN metadata m ON m.rom_id = r.id
                        WHERE r.system_id = ? AND m.artwork_path IS NOT NULL
                        ORDER BY RANDOM() LIMIT 1
                    `).get(room.value);
                    sample_art = a?.artwork_path || null;
                }
            } else if (room.type === 'keyword') {
                const r = db.prepare(`SELECT COUNT(*) as cnt FROM roms WHERE clean_name LIKE ?`).get(`%${room.value}%`);
                count = r?.cnt || 0;
                if (count > 0) {
                    const a = db.prepare(`
                        SELECT m.artwork_path FROM roms r
                        LEFT JOIN metadata m ON m.rom_id = r.id
                        WHERE r.clean_name LIKE ? AND m.artwork_path IS NOT NULL
                        ORDER BY RANDOM() LIMIT 1
                    `).get(`%${room.value}%`);
                    sample_art = a?.artwork_path || null;
                }
            } else if (room.type === 'tag') {
                // tags use library route filtering — get rough count from arcade/fbneo
                const r = db.prepare(`SELECT COUNT(*) as cnt FROM roms WHERE system_id IN ('arcade','fbneo')`).get();
                count = Math.max(1, Math.round((r?.cnt || 0) * (room.value === 'neogeo' ? 0.35 : 0.08)));
                const a = db.prepare(`
                    SELECT m.artwork_path FROM roms r
                    LEFT JOIN metadata m ON m.rom_id = r.id
                    WHERE r.system_id IN ('arcade','fbneo') AND m.artwork_path IS NOT NULL
                    ORDER BY RANDOM() LIMIT 1
                `).get();
                sample_art = a?.artwork_path || null;
            }
        } catch { /* skip broken rooms */ }

        return { ...room, count, sample_art };
    }).filter(r => r.count > 0);

    res.json(rooms);
});

// ── New Arrivals — latest added games ─────────────────────────────────────
router.get('/new-arrivals', (req, res) => {
    const db = getDB();
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const rows = db.prepare(`
        SELECT r.id, COALESCE(m.title, r.clean_name) as title, r.clean_name,
               r.system_id, r.added_at, m.artwork_path, m.year, m.genre,
               s.short_name as system_name, s.color as system_color
        FROM roms r
        LEFT JOIN metadata m ON m.rom_id = r.id
        LEFT JOIN systems s ON s.id = r.system_id
        WHERE r.source != 'test'
        ORDER BY r.added_at DESC
        LIMIT ?
    `).all(limit);

    res.json(rows);
});

// Favorites listing
router.get('/favorites', (req, res) => {
    const db = getDB();
    const { limit = 60 } = req.query;

    const rows = db.prepare(`
        SELECT r.*, m.title, m.artwork_path, m.region, m.year, m.genre,
               s.short_name as system_name, s.color as system_color,
               1 as is_favorite,
               (SELECT MAX(started_at) FROM play_history ph WHERE ph.rom_id = r.id) as last_played
        FROM favorites f
        JOIN roms r ON r.id = f.rom_id
        LEFT JOIN metadata m ON m.rom_id = r.id
        LEFT JOIN systems s ON s.id = r.system_id
        WHERE r.source != 'test'
        ORDER BY f.added_at DESC
        LIMIT ?
    `).all(parseInt(limit));

    const countRow = db.prepare("SELECT COUNT(*) as total FROM favorites f JOIN roms r ON r.id = f.rom_id WHERE r.source != 'test'").get();

    res.json({
        games: rows,
        total: countRow.total,
    });
});

// System Test ROMs (source = 'test')
router.get('/test-roms', (req, res) => {
    const db = getDB();
    const rows = db.prepare(`
        SELECT r.id, r.clean_name, r.filename, r.system_id, r.size_bytes, r.source,
               m.title, m.artwork_path,
               s.short_name as system_name, s.color as system_color
        FROM roms r
        LEFT JOIN metadata m ON m.rom_id = r.id
        LEFT JOIN systems s ON s.id = r.system_id
        WHERE r.source = 'test'
        ORDER BY r.system_id, r.clean_name
    `).all();
    res.json(rows);
});

// Random game
router.get('/random', (req, res) => {
    const db = getDB();

    const row = db.prepare(`
        SELECT r.*, m.title, m.artwork_path, m.region, m.year, m.genre,
               s.short_name as system_name, s.color as system_color, s.name as system_full_name,
               CASE WHEN f.rom_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
        FROM roms r
        LEFT JOIN metadata m ON m.rom_id = r.id
        LEFT JOIN systems s ON s.id = r.system_id
        LEFT JOIN favorites f ON f.rom_id = r.id
        WHERE r.source != 'test'
        ORDER BY RANDOM()
        LIMIT 1
    `).get();

    if (!row) return res.status(404).json({ error: 'No games in library' });
    res.json(row);
});

export default router;
