import Database from 'better-sqlite3';
import { CONFIG, SYSTEMS } from './config.js';
import { seedRetroStars, downloadCharacterImages } from './services/retro-stars-seeder.js';

let db;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS systems (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    emulatorjs_core TEXT NOT NULL,
    extensions TEXT NOT NULL,
    libretro_dir TEXT,
    bios_files TEXT,
    color TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS roms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filepath TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    system_id TEXT NOT NULL REFERENCES systems(id),
    size_bytes INTEGER NOT NULL,
    crc32 TEXT,
    md5 TEXT,
    sha1 TEXT,
    clean_name TEXT,
    source TEXT DEFAULT 'local',
    added_at TEXT DEFAULT (datetime('now')),
    last_scanned TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_roms_system ON roms(system_id);
CREATE INDEX IF NOT EXISTS idx_roms_md5 ON roms(md5);
CREATE INDEX IF NOT EXISTS idx_roms_name ON roms(clean_name);

CREATE TABLE IF NOT EXISTS metadata (
    rom_id INTEGER PRIMARY KEY REFERENCES roms(id) ON DELETE CASCADE,
    title TEXT,
    region TEXT,
    year TEXT,
    publisher TEXT,
    genre TEXT,
    players TEXT,
    description TEXT,
    rating REAL,
    artwork_path TEXT,
    artwork_url TEXT,
    metadata_source TEXT,
    fetched_at TEXT
);

CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    emoji TEXT DEFAULT '🎮',
    color TEXT DEFAULT '#A855F7',
    theme TEXT DEFAULT 'retro',
    sort_order INTEGER DEFAULT 0,
    preferences TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS player_favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    rom_id INTEGER NOT NULL REFERENCES roms(id) ON DELETE CASCADE,
    added_at TEXT DEFAULT (datetime('now')),
    UNIQUE(player_id, rom_id)
);
CREATE INDEX IF NOT EXISTS idx_pfav_player ON player_favorites(player_id);
CREATE INDEX IF NOT EXISTS idx_pfav_rom ON player_favorites(rom_id);

CREATE TABLE IF NOT EXISTS favorites (
    rom_id INTEGER PRIMARY KEY REFERENCES roms(id) ON DELETE CASCADE,
    added_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS play_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rom_id INTEGER NOT NULL REFERENCES roms(id) ON DELETE CASCADE,
    started_at TEXT DEFAULT (datetime('now')),
    duration_seconds INTEGER DEFAULT 0,
    save_state_path TEXT
);
CREATE INDEX IF NOT EXISTS idx_history_rom ON play_history(rom_id);
CREATE INDEX IF NOT EXISTS idx_history_date ON play_history(started_at);

CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    filename TEXT,
    system_id TEXT,
    status TEXT DEFAULT 'pending',
    progress REAL DEFAULT 0,
    size_bytes INTEGER,
    error_message TEXT,
    source TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS scan_paths (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    system_id TEXT,
    enabled INTEGER DEFAULT 1,
    last_scanned TEXT,
    rom_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS player_ratings (
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    rom_id INTEGER NOT NULL REFERENCES roms(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    rated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY(player_id, rom_id)
);

CREATE TABLE IF NOT EXISTS high_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    rom_id INTEGER NOT NULL REFERENCES roms(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scores_rom ON high_scores(rom_id);
CREATE INDEX IF NOT EXISTS idx_scores_player ON high_scores(player_id);

CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    data TEXT,
    unlocked_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_achievements_player ON achievements(player_id);
`;

function seedSystems(database) {
    // INSERT OR IGNORE + UPDATE preserves bio columns across restarts
    const insert = database.prepare(`
        INSERT OR IGNORE INTO systems (id, name, short_name, emulatorjs_core, extensions, libretro_dir, bios_files, color, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const update = database.prepare(`
        UPDATE systems SET name=?, short_name=?, emulatorjs_core=?, extensions=?, libretro_dir=?, bios_files=?, color=?, sort_order=?
        WHERE id=?
    `);

    const tx = database.transaction(() => {
        for (const sys of SYSTEMS) {
            const ext = sys.extensions.join(',');
            const bios = sys.bios.length > 0 ? JSON.stringify(sys.bios) : null;
            insert.run(sys.id, sys.name, sys.short_name, sys.core, ext, sys.libretro_dir || null, bios, sys.color || null, sys.sort_order || 0);
            update.run(sys.name, sys.short_name, sys.core, ext, sys.libretro_dir || null, bios, sys.color || null, sys.sort_order || 0, sys.id);
        }
    });
    tx();
}

function seedPlayers(database) {
    const insert = database.prepare(`
        INSERT OR IGNORE INTO players (name, emoji, color, sort_order)
        VALUES (?, ?, ?, ?)
    `);
    const players = [
        ['Molly',     '🌸', '#F472B6', 1],
        ['Lylah',     '🦋', '#818CF8', 2],
        ['Alannah',   '🌺', '#FB7185', 3],
        ['Josh',      '⚡', '#38BDF8', 4],
        ['Walkerman', '🎯', '#34D399', 5],
        ['MOTU',      '🔥', '#F59E0B', 6],
        ['Trey',      '⚔️', '#EF4444', 7],
        ['Garland',   '🎸', '#22C55E', 8],
        ['JRo',       '🎤', '#F97316', 9],
        ['Laura',     '🌙', '#C084FC', 11],
        ['McKayla',   '💫', '#EC4899', 12],
        ['Madylon',   '🦄', '#A78BFA', 13],
        ['Aidan',     '🎯', '#14B8A6', 14],
        ['Elijah',    '🐉', '#6366F1', 15],
        ['MiMi',      '💜', '#C084FC', 16],
        ['Guest',     '🎮', '#94A3B8', 99],
    ];
    const tx = database.transaction(() => {
        for (const [name, emoji, color, order] of players) {
            insert.run(name, emoji, color, order);
        }
    });
    tx();
}

// ── Auto-assign themes based on player name/personality ──
function seedPlayerThemes(database) {
    const themeMap = {
        'Molly':     'candy',     // Girl — sweet candy vibes match her 🌸
        'Lylah':     'fantasy',   // Girl — 🦋 butterfly = magical/fantasy
        'Alannah':   'garden',    // Girl — 🌺 flower = garden theme
        'Josh':      'lightning', // Boy — ⚡ already his emoji
        'Walkerman': 'retro',     // Boy — 🎯 classic gamer = retro
        'MOTU':      'fire',      // Boy — 🔥 Masters of the Universe = fire
        'Trey':      'dinos',     // Boy — ⚔️ warrior = dinosaurs
        'Garland':   'racing',    // Boy — 🎸 guitar man = speed racer
        'JRo':       'space',     // Boy — 🎤 cosmic performer = deep space
        'Laura':     'ocean',     // Girl — 🌙 moon/night = ocean depths
        'McKayla':   'candy',     // Girl — 💫 sparkly = candy sweet
        'Madylon':   'fantasy',   // Girl — 🦄 literally a unicorn = fantasy
        'Aidan':     'lightning', // Boy — 🎯 target = electric energy
        'Elijah':    'dinos',     // Boy — 🐉 dragon = dinosaurs
        'MiMi':      'fantasy',   // Girl — 💜 purple love = magical
        'Guest':     'retro',     // Default — classic arcade
    };
    const update = database.prepare("UPDATE players SET theme = ? WHERE name = ? AND (theme IS NULL OR theme = 'retro')");
    const tx = database.transaction(() => {
        for (const [name, theme] of Object.entries(themeMap)) {
            update.run(theme, name);
        }
    });
    tx();
}

function seedCharacterThemes(database) {
    const update = database.prepare("UPDATE players SET character_theme = ? WHERE name = ? AND character_theme IS NULL");
    const themes = [
        ['Molly',   'raya'],    // Disney warrior princess — deep pink/gold
        ['Lylah',   'minnie'],  // Minnie Mouse — red/polka dots/purple
        ['Alannah', 'elf'],     // Woodland elf — forest green/gold/rose
    ];
    const tx = database.transaction(() => {
        for (const [name, theme] of themes) update.run(theme, name);
    });
    tx();
}

function seedDefaults(database) {
    const insert = database.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    insert.run('port', String(CONFIG.PORT));
    insert.run('theme', 'carnival');
    insert.run('sound_effects', 'true');
    insert.run('crt_scanlines', 'true');
    insert.run('default_rom_path', CONFIG.ROMS_DIR);

    // Add default ROM path as a scan path only if none exist yet
    const existing = database.prepare('SELECT COUNT(*) as c FROM scan_paths').get();
    if (existing.c === 0) {
        database.prepare('INSERT INTO scan_paths (path) VALUES (?)').run(CONFIG.ROMS_DIR);
    }
}

export function initDB() {
    db = new Database(CONFIG.DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    // Performance: 64MB cache, memory-mapped I/O, temp tables in memory
    db.pragma('cache_size = -64000');
    db.pragma('mmap_size = 268435456');
    db.pragma('temp_store = MEMORY');
    db.exec(SCHEMA);
    // Migrations — add columns that might be missing on existing DBs
    try { db.exec("ALTER TABLE players ADD COLUMN preferences TEXT DEFAULT '{}'"); } catch {}
    try { db.exec("ALTER TABLE players ADD COLUMN xp INTEGER DEFAULT 0"); } catch {}
    try { db.exec("ALTER TABLE players ADD COLUMN level INTEGER DEFAULT 1"); } catch {}
    try { db.exec("ALTER TABLE play_history ADD COLUMN player_id INTEGER REFERENCES players(id)"); } catch {}
    try { db.exec("ALTER TABLE players ADD COLUMN bio TEXT DEFAULT ''"); } catch {}
    try { db.exec("ALTER TABLE players ADD COLUMN clan_id INTEGER REFERENCES clans(id)"); } catch {}

    // V11: System bios — LLM-generated system biographies
    try { db.exec("ALTER TABLE systems ADD COLUMN bio TEXT"); } catch {}
    try { db.exec("ALTER TABLE systems ADD COLUMN bio_model TEXT"); } catch {}
    try { db.exec("ALTER TABLE systems ADD COLUMN bio_generated_at TEXT"); } catch {}

    // V5: Clans (Clan Battles)
    db.exec(`CREATE TABLE IF NOT EXISTS clans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        emoji TEXT DEFAULT '⚔️',
        color TEXT DEFAULT '#A855F7',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    )`);

    // V6: Multi-clan membership (many-to-many)
    db.exec(`CREATE TABLE IF NOT EXISTS clan_members (
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
        joined_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY(player_id, clan_id)
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_cm_player ON clan_members(player_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_cm_clan ON clan_members(clan_id)');

    // Migrate legacy clan_id → clan_members (one-time)
    const migrated = db.prepare('SELECT COUNT(*) as c FROM clan_members').get().c;
    if (migrated === 0) {
        const legacy = db.prepare('SELECT id, clan_id FROM players WHERE clan_id IS NOT NULL').all();
        if (legacy.length > 0) {
            const ins = db.prepare('INSERT OR IGNORE INTO clan_members (player_id, clan_id) VALUES (?, ?)');
            const tx = db.transaction(() => { for (const p of legacy) ins.run(p.id, p.clan_id); });
            tx();
        }
    }

    // V7: Clan Battles — full battle system
    // Clan profile extras (motto, banner, level)
    try { db.exec("ALTER TABLE clans ADD COLUMN motto TEXT DEFAULT ''"); } catch {}
    try { db.exec("ALTER TABLE clans ADD COLUMN banner_color TEXT DEFAULT '#1E1B4B'"); } catch {}
    try { db.exec("ALTER TABLE clans ADD COLUMN xp INTEGER DEFAULT 0"); } catch {}
    try { db.exec("ALTER TABLE clans ADD COLUMN level INTEGER DEFAULT 1"); } catch {}
    try { db.exec("ALTER TABLE clans ADD COLUMN wins INTEGER DEFAULT 0"); } catch {}
    try { db.exec("ALTER TABLE clans ADD COLUMN losses INTEGER DEFAULT 0"); } catch {}
    try { db.exec("ALTER TABLE clans ADD COLUMN draws INTEGER DEFAULT 0"); } catch {}

    // Clan challenges (head-to-head battles)
    db.exec(`CREATE TABLE IF NOT EXISTS clan_challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        challenger_clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
        defender_clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
        game_type TEXT NOT NULL DEFAULT 'any',
        game_id TEXT,
        rom_id INTEGER,
        title TEXT,
        status TEXT DEFAULT 'pending',
        start_time TEXT,
        end_time TEXT,
        winner_clan_id INTEGER REFERENCES clans(id),
        challenger_score INTEGER DEFAULT 0,
        defender_score INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_cc_challenger ON clan_challenges(challenger_clan_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_cc_defender ON clan_challenges(defender_clan_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_cc_status ON clan_challenges(status)');

    // Individual scores within a challenge
    db.exec(`CREATE TABLE IF NOT EXISTS challenge_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        challenge_id INTEGER NOT NULL REFERENCES clan_challenges(id) ON DELETE CASCADE,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
        score INTEGER NOT NULL DEFAULT 0,
        meta TEXT,
        submitted_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_cs_challenge ON challenge_scores(challenge_id)');

    // Clan achievements (collective milestones)
    db.exec(`CREATE TABLE IF NOT EXISTS clan_achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        icon TEXT DEFAULT '🏆',
        data TEXT,
        unlocked_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_ca_clan ON clan_achievements(clan_id)');

    // Clan activity feed
    db.exec(`CREATE TABLE IF NOT EXISTS clan_feed (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
        player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
        type TEXT NOT NULL,
        message TEXT,
        data TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_cf_clan ON clan_feed(clan_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_cf_date ON clan_feed(created_at)');

    // Trash talk board (inter-clan messages)
    db.exec(`CREATE TABLE IF NOT EXISTS clan_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
        to_clan_id INTEGER REFERENCES clans(id) ON DELETE CASCADE,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        challenge_id INTEGER REFERENCES clan_challenges(id) ON DELETE SET NULL,
        created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_cmsg_from ON clan_messages(from_clan_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_cmsg_to ON clan_messages(to_clan_id)');

    // Clan war events (scheduled multi-game tournaments)
    db.exec(`CREATE TABLE IF NOT EXISTS clan_wars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'upcoming',
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        game_list TEXT,
        scoring_mode TEXT DEFAULT 'total',
        created_at TEXT DEFAULT (datetime('now'))
    )`);

    // War participants and scores
    db.exec(`CREATE TABLE IF NOT EXISTS clan_war_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        war_id INTEGER NOT NULL REFERENCES clan_wars(id) ON DELETE CASCADE,
        clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
        total_score INTEGER DEFAULT 0,
        rank INTEGER,
        UNIQUE(war_id, clan_id)
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_cwe_war ON clan_war_entries(war_id)');

    db.exec(`CREATE TABLE IF NOT EXISTS clan_war_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        war_id INTEGER NOT NULL REFERENCES clan_wars(id) ON DELETE CASCADE,
        clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        game_id TEXT,
        rom_id INTEGER,
        score INTEGER NOT NULL DEFAULT 0,
        submitted_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_cws_war ON clan_war_scores(war_id)');

    // Clan territories (clans "own" games by having the highest scores)
    db.exec(`CREATE TABLE IF NOT EXISTS clan_territories (
        rom_id INTEGER PRIMARY KEY,
        clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
        claimed_at TEXT DEFAULT (datetime('now')),
        top_score INTEGER DEFAULT 0,
        top_player_id INTEGER REFERENCES players(id)
    )`);

    // Clan bounties (put a bounty on beating a score)
    db.exec(`CREATE TABLE IF NOT EXISTS clan_bounties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        posted_by_clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
        posted_by_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        target_clan_id INTEGER REFERENCES clans(id) ON DELETE CASCADE,
        rom_id INTEGER,
        game_id TEXT,
        target_score INTEGER NOT NULL,
        reward_text TEXT DEFAULT 'Bragging rights',
        status TEXT DEFAULT 'active',
        claimed_by_player_id INTEGER REFERENCES players(id),
        claimed_by_clan_id INTEGER REFERENCES clans(id),
        created_at TEXT DEFAULT (datetime('now')),
        claimed_at TEXT
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_bounty_status ON clan_bounties(status)');

    // V4: Arcade Originals (custom HTML5 games)
    db.exec(`CREATE TABLE IF NOT EXISTS original_games (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        color TEXT,
        version TEXT DEFAULT '1.0',
        added_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS original_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        game_id TEXT NOT NULL REFERENCES original_games(id),
        score INTEGER NOT NULL,
        level INTEGER DEFAULT 1,
        meta TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )`);
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_orig_scores_game ON original_scores(game_id)'); } catch {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_orig_scores_player ON original_scores(player_id)'); } catch {}

    // Activity feed table (V2 progression)
    db.exec(`CREATE TABLE IF NOT EXISTS activity_feed (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        rom_id INTEGER,
        data TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )`);
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_activity_player ON activity_feed(player_id)'); } catch {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_feed(created_at)'); } catch {}

    // V5: Daily Challenges
    db.exec(`CREATE TABLE IF NOT EXISTS daily_challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        rom_id INTEGER REFERENCES roms(id),
        system_id TEXT,
        target_value INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_dc_date ON daily_challenges(date)');

    db.exec(`CREATE TABLE IF NOT EXISTS daily_challenge_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        challenge_id INTEGER NOT NULL REFERENCES daily_challenges(id) ON DELETE CASCADE,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        value INTEGER NOT NULL,
        completed INTEGER DEFAULT 0,
        submitted_at TEXT DEFAULT (datetime('now')),
        UNIQUE(challenge_id, player_id)
    )`);

    // V5: Tournaments
    db.exec(`CREATE TABLE IF NOT EXISTS tournaments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT DEFAULT 'bracket',
        status TEXT DEFAULT 'registration',
        rom_id INTEGER REFERENCES roms(id),
        system_id TEXT,
        max_players INTEGER DEFAULT 16,
        rounds INTEGER DEFAULT 4,
        current_round INTEGER DEFAULT 0,
        winner_player_id INTEGER REFERENCES players(id),
        created_at TEXT DEFAULT (datetime('now')),
        started_at TEXT,
        ended_at TEXT
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS tournament_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        seed INTEGER,
        eliminated INTEGER DEFAULT 0,
        final_rank INTEGER,
        UNIQUE(tournament_id, player_id)
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS tournament_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        round INTEGER NOT NULL,
        match_number INTEGER NOT NULL,
        player1_id INTEGER REFERENCES players(id),
        player2_id INTEGER REFERENCES players(id),
        player1_score INTEGER,
        player2_score INTEGER,
        winner_id INTEGER REFERENCES players(id),
        status TEXT DEFAULT 'pending',
        completed_at TEXT
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_tm_tournament ON tournament_matches(tournament_id)');

    // V5: Game Collections / Playlists
    db.exec(`CREATE TABLE IF NOT EXISTS game_collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT DEFAULT '📁',
        color TEXT DEFAULT '#A855F7',
        player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
        is_system INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS collection_games (
        collection_id INTEGER NOT NULL REFERENCES game_collections(id) ON DELETE CASCADE,
        rom_id INTEGER NOT NULL REFERENCES roms(id) ON DELETE CASCADE,
        sort_order INTEGER DEFAULT 0,
        added_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY(collection_id, rom_id)
    )`);

    // V5: Friends
    db.exec(`CREATE TABLE IF NOT EXISTS friends (
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        friend_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY(player_id, friend_id)
    )`);

    // V5: Notifications
    db.exec(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        data TEXT,
        read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_notif_player ON notifications(player_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_notif_read ON notifications(player_id, read)');

    // V5: Speed Run Records
    db.exec(`CREATE TABLE IF NOT EXISTS speedrun_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        rom_id INTEGER NOT NULL REFERENCES roms(id) ON DELETE CASCADE,
        time_ms INTEGER NOT NULL,
        category TEXT DEFAULT 'any%',
        verified INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_speedrun_rom ON speedrun_records(rom_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_speedrun_player ON speedrun_records(player_id)');

    // V5: Seasonal Events / Battle Pass
    db.exec(`CREATE TABLE IF NOT EXISTS seasonal_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        theme TEXT DEFAULT 'default',
        icon TEXT DEFAULT '🎉',
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        rewards TEXT,
        status TEXT DEFAULT 'upcoming'
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS seasonal_progress (
        event_id INTEGER NOT NULL REFERENCES seasonal_events(id) ON DELETE CASCADE,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        points INTEGER DEFAULT 0,
        tier INTEGER DEFAULT 0,
        data TEXT,
        PRIMARY KEY(event_id, player_id)
    )`);

    // V5: Missing indexes from audit
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_hs_rom_score ON high_scores(rom_id, score DESC)'); } catch {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_ph_player_date ON play_history(player_id, started_at DESC)'); } catch {}

    // V8: Game Intelligence — AI-generated bios and gameplay guides
    // Keyed by game_title so one bio serves all systems (e.g. "Killer Instinct" across SNES, Arcade, GB)
    db.exec(`CREATE TABLE IF NOT EXISTS game_intel (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        game_title   TEXT NOT NULL,
        doc_type     TEXT NOT NULL DEFAULT 'bio' CHECK(doc_type IN ('bio','guide','trivia','movelist')),
        content_md   TEXT NOT NULL,
        model        TEXT,
        tokens_used  INTEGER,
        generated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(game_title, doc_type)
    )`);
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_intel_title ON game_intel(game_title)'); } catch {}
    // Migration: drop old rom_id-based table if it exists (was never populated)
    try {
        const hasRomId = db.prepare("SELECT COUNT(*) as n FROM pragma_table_info('game_intel') WHERE name='rom_id'").get().n;
        if (hasRomId) {
            db.exec('DROP TABLE game_intel');
            db.exec(`CREATE TABLE game_intel (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                game_title   TEXT NOT NULL,
                doc_type     TEXT NOT NULL DEFAULT 'bio' CHECK(doc_type IN ('bio','guide','trivia','movelist')),
                content_md   TEXT NOT NULL,
                model        TEXT,
                tokens_used  INTEGER,
                generated_at TEXT DEFAULT (datetime('now')),
                UNIQUE(game_title, doc_type)
            )`);
            db.exec('CREATE INDEX IF NOT EXISTS idx_intel_title ON game_intel(game_title)');
        }
    } catch {}

    // V9: Genre normalization — merge duplicates into canonical names
    const GENRE_NORMALIZE = {
        'Beat-em-up':       'Beat em Up',
        'Action/RPG':       'Action RPG',
        'Action/Platform':  'Platformer',
        'Action/Puzzle':    'Puzzle',
        'Wrestling/Fighting': 'Fighting',
        'Racing/Shooter':   'Shooter',
        'Run-and-Gun':      'Shooter',
    };
    for (const [from, to] of Object.entries(GENRE_NORMALIZE)) {
        try { db.prepare('UPDATE metadata SET genre = ? WHERE genre = ?').run(to, from); } catch {}
    }

    // V10: Purge macOS resource fork entries (._filename) — fake ROMs from macOS metadata
    try {
        const forkCount = db.prepare("SELECT COUNT(*) as c FROM roms WHERE filename LIKE '.__%'").get();
        if (forkCount.c > 0) {
            // Delete metadata rows for forks first (FK constraint)
            db.prepare("DELETE FROM metadata WHERE rom_id IN (SELECT id FROM roms WHERE filename LIKE '.__%')").run();
            // Delete the fork ROM entries
            const result = db.prepare("DELETE FROM roms WHERE filename LIKE '.__%'").run();
            console.log(`[db] Purged ${result.changes} macOS resource fork entries`);
        }
    } catch (e) { console.error('[db] Fork purge error:', e.message); }

    // V6: Chat Messages (global, clan, DM channels)
    db.exec(`CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_type TEXT NOT NULL CHECK(channel_type IN ('global','clan','dm')),
        channel_id TEXT,
        sender_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        reply_to_id INTEGER REFERENCES chat_messages(id),
        created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_chat_channel ON chat_messages(channel_type, channel_id, created_at)');

    // V6: Player Presence (who's online, what they're doing)
    db.exec(`CREATE TABLE IF NOT EXISTS player_presence (
        player_id INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        status TEXT DEFAULT 'offline' CHECK(status IN ('online','playing','idle','offline')),
        current_game TEXT,
        current_rom_id INTEGER,
        last_seen TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`);

    // V6: Player Messages (asynchronous inbox - clan invites, challenges, recommendations)
    db.exec(`CREATE TABLE IF NOT EXISTS player_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        to_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK(type IN ('message','clan_invite','challenge','game_rec','system')),
        subject TEXT,
        body TEXT NOT NULL,
        metadata TEXT,
        is_read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_pmsg_to ON player_messages(to_player_id, is_read, created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_pmsg_from ON player_messages(from_player_id, created_at)');

    // V6: Game Requests (community wishlist)
    db.exec(`CREATE TABLE IF NOT EXISTS game_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        game_name TEXT NOT NULL,
        system_id TEXT,
        description TEXT,
        status TEXT DEFAULT 'open' CHECK(status IN ('open','approved','fulfilled','declined')),
        admin_notes TEXT,
        votes INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_game_req_status ON game_requests(status, votes DESC)');

    // V6: Game Request Votes (one vote per player per request)
    db.exec(`CREATE TABLE IF NOT EXISTS game_request_votes (
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        request_id INTEGER NOT NULL REFERENCES game_requests(id) ON DELETE CASCADE,
        vote INTEGER DEFAULT 1 CHECK(vote IN (1, -1)),
        PRIMARY KEY (player_id, request_id)
    )`);

    // V6: Game Reports (broken games, wrong artwork, etc.)
    db.exec(`CREATE TABLE IF NOT EXISTS game_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        rom_id INTEGER NOT NULL REFERENCES roms(id),
        type TEXT NOT NULL CHECK(type IN ('broken','wrong_art','wrong_info','crashes','other')),
        description TEXT,
        status TEXT DEFAULT 'open' CHECK(status IN ('open','investigating','resolved','wontfix')),
        admin_notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_reports_status ON game_reports(status, created_at)');

    // V6: LLM Chat History (for game encyclopedia conversations)
    db.exec(`CREATE TABLE IF NOT EXISTS llm_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
        messages TEXT NOT NULL,
        topic TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`);

    // V6: Player Social Hub — privacy settings and block list
    db.exec(`CREATE TABLE IF NOT EXISTS player_settings (
        player_id INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        allow_dms INTEGER DEFAULT 1,
        allow_chat INTEGER DEFAULT 1,
        show_online INTEGER DEFAULT 1,
        show_activity INTEGER DEFAULT 1,
        show_favorites INTEGER DEFAULT 1,
        allow_clan_invites INTEGER DEFAULT 1,
        allow_challenges INTEGER DEFAULT 1,
        bio TEXT DEFAULT '',
        status_message TEXT DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now'))
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS blocked_players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        blocked_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(player_id, blocked_player_id)
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_blocked_player ON blocked_players(player_id)');

    // ── Migration: add theme column to existing players table ──
    try {
        db.exec("ALTER TABLE players ADD COLUMN theme TEXT DEFAULT 'retro'");
    } catch { /* column already exists */ }

    // V9: Metadata enrichment — extra columns
    try { db.exec("ALTER TABLE metadata ADD COLUMN developer TEXT"); } catch {}
    try { db.exec("ALTER TABLE metadata ADD COLUMN screenshots TEXT"); } catch {}
    try { db.exec("ALTER TABLE metadata ADD COLUMN manual_url TEXT"); } catch {}
    try { db.exec("ALTER TABLE metadata ADD COLUMN igdb_id INTEGER"); } catch {}
    try { db.exec("ALTER TABLE metadata ADD COLUMN screenscraper_id INTEGER"); } catch {}

    // V12: New API enrichment columns (RAWG, MobyGames, Giant Bomb)
    try { db.exec("ALTER TABLE metadata ADD COLUMN rawg_id INTEGER"); } catch {}
    try { db.exec("ALTER TABLE metadata ADD COLUMN metacritic_score INTEGER"); } catch {}
    try { db.exec("ALTER TABLE metadata ADD COLUMN rawg_rating REAL"); } catch {}
    try { db.exec("ALTER TABLE metadata ADD COLUMN moby_id INTEGER"); } catch {}
    try { db.exec("ALTER TABLE metadata ADD COLUMN moby_attributes TEXT"); } catch {}
    try { db.exec("ALTER TABLE metadata ADD COLUMN giantbomb_id INTEGER"); } catch {}
    try { db.exec("ALTER TABLE metadata ADD COLUMN giantbomb_deck TEXT"); } catch {}

    // V12: Bulk import columns (Libretro thumbnails, cabinet art)
    try { db.exec("ALTER TABLE metadata ADD COLUMN title_screen_path TEXT"); } catch {}
    try { db.exec("ALTER TABLE metadata ADD COLUMN snap_path TEXT"); } catch {}
    try { db.exec("ALTER TABLE metadata ADD COLUMN boxart_path TEXT"); } catch {}
    try { db.exec("ALTER TABLE metadata ADD COLUMN cabinet_path TEXT"); } catch {}
    try { db.exec("ALTER TABLE metadata ADD COLUMN marquee_path TEXT"); } catch {}
    try { db.exec("ALTER TABLE metadata ADD COLUMN flyer_path TEXT"); } catch {}

    // V12: Game history/trivia (from history.dat)
    db.exec(`CREATE TABLE IF NOT EXISTS game_history (
        rom_id INTEGER PRIMARY KEY REFERENCES roms(id) ON DELETE CASCADE,
        history_text TEXT NOT NULL,
        source TEXT DEFAULT 'history.dat',
        imported_at TEXT DEFAULT (datetime('now'))
    )`);

    // V13: Character themes for player profiles
    try { db.exec("ALTER TABLE players ADD COLUMN character_theme TEXT"); } catch {}

    // V14: Retro Stars — game character encyclopedia
    db.exec(`CREATE TABLE IF NOT EXISTS game_characters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        title TEXT,
        category TEXT,
        genre_tag TEXT,
        bio TEXT,
        debut_game TEXT,
        debut_year INTEGER,
        era TEXT,
        franchise TEXT,
        match_patterns TEXT,
        wiki_slug TEXT,
        image_path TEXT,
        rank_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS character_appearances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id INTEGER NOT NULL REFERENCES game_characters(id) ON DELETE CASCADE,
        rom_id INTEGER NOT NULL REFERENCES roms(id) ON DELETE CASCADE,
        appearance_order INTEGER DEFAULT 0,
        role TEXT DEFAULT 'protagonist',
        note TEXT,
        UNIQUE(character_id, rom_id)
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_charapp_char ON character_appearances(character_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_charapp_rom ON character_appearances(rom_id)');

    // V9: RetroAchievements per-game stats
    db.exec(`CREATE TABLE IF NOT EXISTS retro_achievements (
        rom_id INTEGER PRIMARY KEY REFERENCES roms(id) ON DELETE CASCADE,
        ra_game_id INTEGER,
        achievement_count INTEGER DEFAULT 0,
        ra_icon_url TEXT,
        fetched_at TEXT DEFAULT (datetime('now'))
    )`);

    // Performance indexes for common queries
    db.exec('CREATE INDEX IF NOT EXISTS idx_metadata_genre ON metadata(genre)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_history_player ON play_history(player_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_roms_source ON roms(source)');

    seedSystems(db);
    seedPlayers(db);
    seedPlayerThemes(db);
    seedClans(db);
    seedPlayerBios(db);
    seedCharacterThemes(db);
    seedRetroStars(db);
    seedDefaults(db);
    seedOriginalGames(db);
    seedCollections(db);

    // Download character images in background (non-blocking)
    setTimeout(() => downloadCharacterImages().catch(() => {}), 5000);

    return db;
}

function seedClans(database) {
    const insert = database.prepare(`
        INSERT OR IGNORE INTO clans (name, emoji, color, sort_order)
        VALUES (?, ?, ?, ?)
    `);
    const clans = [
        ['Haines Clan',   '🦅', '#38BDF8', 1],
        ['Montez Clan',   '🌶️', '#F59E0B', 2],
        ['Stanford Clan', '🔥', '#EF4444', 3],
        ['Dixon Clan',    '🐺', '#A855F7', 4],
    ];
    const tx = database.transaction(() => {
        for (const [name, emoji, color, order] of clans) {
            insert.run(name, emoji, color, order);
        }
    });
    tx();

    // Assign players to clans via junction table
    const clanMap = {
        'Molly': 'Haines Clan', 'Lylah': 'Haines Clan', 'Alannah': 'Haines Clan',
        'Josh': 'Haines Clan', 'Walkerman': 'Haines Clan',
        'MiMi': 'Montez Clan', 'JRo': 'Montez Clan',
        'MOTU': 'Stanford Clan', 'Trey': 'Stanford Clan', 'Garland': 'Stanford Clan',
        'Laura': 'Dixon Clan', 'McKayla': 'Dixon Clan', 'Madylon': 'Dixon Clan',
        'Aidan': 'Dixon Clan', 'Elijah': 'Dixon Clan',
    };
    const getClanId = database.prepare('SELECT id FROM clans WHERE name = ?');
    const getPlayerId = database.prepare('SELECT id FROM players WHERE name = ?');
    const assignClan = database.prepare('INSERT OR IGNORE INTO clan_members (player_id, clan_id) VALUES (?, ?)');
    const tx2 = database.transaction(() => {
        for (const [playerName, clanName] of Object.entries(clanMap)) {
            const clan = getClanId.get(clanName);
            const player = getPlayerId.get(playerName);
            if (clan && player) assignClan.run(player.id, clan.id);
        }
    });
    tx2();
}

function seedPlayerBios(database) {
    const bios = {
        'Molly':     "Rambunctious and fearless. Knows exactly what she wants and isn't afraid to go get it. Quick-witted, funny, and always up for a challenge. The arcade's unofficial boss.",
        'Lylah':     "Creative and dreamy. Sees every game as a story waiting to unfold. Will spend 20 minutes naming a character before playing. Loves purple everything.",
        'Alannah':   "Disney princess energy meets competitive fire. Artistic, imaginative, and surprisingly ruthless at high scores. Don't let the flowers fool you.",
        'Josh':      "Strategic outdoorsman. Approaches every game like a military operation. Competitive to the core but a gracious winner. The family's designated \"one more try\" guy.",
        'Walkerman': "Patient, methodical, completionist. If there's a hidden item, he'll find it. If there's a record, he'll break it. The quiet one who somehow always wins.",
        'MOTU':      "Intense. Passionate. All-or-nothing. Goes from zero to FINAL BOSS ENERGY in seconds. Named after the Masters of the Universe and lives up to it.",
        'Trey':      "Anime superfan and strategy mastermind. Loyal to his favorite series. Will debate you for hours about which Final Fantasy is the best. Spoiler: it's always the one he's playing.",
        'Garland':   "Old school cool. Steady hands, steady nerves. The kind of player who clears a game on one quarter and walks away without looking back.",
        'JRo':       "The hype man. Every win gets a celebration, every loss gets a rematch. Brings the energy and never backs down from a challenge.",
        'Laura':     "Cool under pressure. The one who stays calm when everyone else is panicking. Clutch plays are her specialty.",
        'McKayla':   "Lightning reflexes and zero quit. Will grind a game until she masters it. Doesn't believe in impossible — just 'not yet.'",
        'Madylon':   "The creative one. Finds strategies nobody else thinks of. Probably playing the game wrong but somehow winning anyway.",
        'Aidan':     "Calculated and precise. Studies the patterns, learns the tells. When he moves, it's because he already knows the outcome.",
        'Elijah':    "The wildcard. Unpredictable playstyle that keeps everyone guessing. Sometimes genius, always entertaining.",
        'MiMi':      "Classic gaming purist and nostalgia queen. Believes the golden age peaked with the SNES. Has strong opinions about controller design.",
        'Guest':     "The mystery player. Could be anyone. Could be anywhere. Plays once and vanishes into the night like a quarter dropped into an arcade machine.",
    };
    const update = database.prepare("UPDATE players SET bio = ? WHERE name = ? AND (bio IS NULL OR bio = '')");
    const tx = database.transaction(() => {
        for (const [name, bio] of Object.entries(bios)) {
            update.run(bio, name);
        }
    });
    tx();
}

function seedOriginalGames(database) {
    const insert = database.prepare(`
        INSERT OR IGNORE INTO original_games (id, name, description, icon, color)
        VALUES (?, ?, ?, ?, ?)
    `);
    const games = [
        ['mollypop',    'Block Pop',       'Tap matching blocks to pop them! Bigger groups = bigger points.',               '🫧', '#F43F5E'],
        ['tictacmae',   'Tic Tac Toe',     'Classic 3-in-a-row! Best of 5 against the AI. Can you win?',                   '❌', '#A855F7'],
        ['maetris',     'Block Stack',      'Stack falling blocks and clear lines! The classic puzzle game.',               '🧱', '#A855F7'],
        ['maeteoroids', 'Asteroids',        'Blast through space rocks in this retro shooter! Dodge, shoot, survive.',      '🚀', '#06B6D4'],
        ['maekout',     'Breakout',         'Break all the bricks with your bouncing ball! Power-ups and combos await.',    '🏓', '#EC4899'],
        ['flappymae',   'Flappy',           'Tap to flap through pipes! One-touch gameplay, infinite challenge.',           '🐦', '#C4B5FD'],
        ['pacmae',      'Pac Chase',        'Chomp dots, dodge ghosts, eat power pellets! The arcade classic.',             '👻', '#F59E0B'],
        ['mollypong',   'Pong',             'Classic paddle vs. paddle action! First to 7 wins. Beat the AI!',             '🏓', '#38BDF8'],
        ['molliped',    'Centipede',        'Blast the centipede! Dodge spiders, fleas, and scorpions.',                    '🐛', '#22C55E'],
        ['mollycontrol','Missile Command',  'Defend your cities from incoming missiles! Chain reactions, pure arcade.',     '🎯', '#EF4444'],
    ];
    const tx = database.transaction(() => {
        for (const [id, name, desc, icon, color] of games) {
            insert.run(id, name, desc, icon, color);
        }
    });
    tx();
}

function seedCollections(database) {
    const insert = database.prepare('INSERT OR IGNORE INTO game_collections (id, name, description, icon, color, is_system, sort_order) VALUES (?, ?, ?, ?, ?, 1, ?)');
    const collections = [
        [1, 'Best of Arcade', 'Classic arcade greatest hits', '👾', '#EF4444', 1],
        [2, 'Fighting Legends', 'The best fighting games ever made', '🥊', '#F59E0B', 2],
        [3, 'Family Friendly', 'Games the whole family can enjoy', '👨‍👩‍👧‍👦', '#22C55E', 3],
        [4, 'Hidden Gems', 'Underrated classics you need to try', '💎', '#8B5CF6', 4],
        [5, 'Speedrun Favorites', 'Great games for speed running', '⏱️', '#06B6D4', 5],
        [6, 'Couch Co-op', 'Best multiplayer experiences', '🎮', '#EC4899', 6],
    ];
    const tx = database.transaction(() => { for (const c of collections) insert.run(...c); });
    tx();
}

export function getDB() {
    if (!db) throw new Error('Database not initialized. Call initDB() first.');
    return db;
}
