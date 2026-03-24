import { Router } from 'express';
import { getDB } from '../db.js';
import { callAI, INTEL_PROVIDER, checkProviderKey, getProviderStatus } from '../lib/ai.js';

const router = Router();

// ── Batch state ───────────────────────────────────────────────────────────────
const batch = {
    running: false, stop: false,
    total: 0, done: 0, errors: 0,
    current: null, startedAt: null, finishedAt: null,
    concurrency: 1, activeWorkers: 0, workerStatus: [],
};

// ── Helper: backfill metadata.description from game_intel bios ───────────────
function backfillDescriptions(db) {
    try {
        const rows = db.prepare(`
            SELECT m.rom_id, r.clean_name, gi.content_md
            FROM metadata m
            JOIN roms r ON r.id = m.rom_id
            JOIN game_intel gi ON gi.game_title = r.clean_name AND gi.doc_type = 'bio'
            WHERE m.description IS NULL OR length(m.description) = 0
        `).all();

        if (rows.length === 0) return;

        const update = db.prepare('UPDATE metadata SET description = ? WHERE rom_id = ?');
        let count = 0;
        db.transaction(() => {
            for (const row of rows) {
                const lines = row.content_md.split('\n').filter(l => {
                    const t = l.trim();
                    return t.length > 30 && !t.startsWith('#') && !t.startsWith('|')
                        && !t.startsWith('>') && !t.startsWith('*Genre') && !t.startsWith('*Platform')
                        && !t.startsWith('*Player') && !t.startsWith('---') && !t.startsWith('```');
                });
                if (lines.length > 0) {
                    let desc = lines[0].trim().replace(/^\*\*|\*\*$/g, '').replace(/^\*|\*$/g, '');
                    if (desc.length > 300) desc = desc.slice(0, 297) + '...';
                    update.run(desc, row.rom_id);
                    count++;
                }
            }
        })();
        if (count > 0) console.log(`[Intel Batch] Backfilled ${count} descriptions`);
    } catch (e) { console.error('[Backfill] Error:', e.message); }
}

// ── Helper: normalize game title for matching ────────────────────────────────
function normalizeTitle(game) {
    return (game.title || game.clean_name || game.filename.replace(/\.[^.]+$/, '')).trim();
}

// ── Helper: gather all systems + metadata for a game (by clean_name) ─────────
function gatherGameInfo(db, cleanName) {
    const rows = db.prepare(`
        SELECT r.system_id, s.name as system_name, m.year, m.publisher, m.genre,
               m.players, m.description, m.developer,
               COALESCE(m.title, r.clean_name) as display_title
        FROM roms r
        LEFT JOIN metadata m ON m.rom_id = r.id
        LEFT JOIN systems  s ON s.id = r.system_id
        WHERE r.clean_name = ?
        GROUP BY r.system_id
        ORDER BY s.sort_order
    `).all(cleanName);

    if (!rows.length) return null;

    // Merge best metadata from all systems
    const systems = rows.map(r => r.system_name || r.system_id);
    const year = rows.find(r => r.year)?.year || 'unknown year';
    const publisher = rows.find(r => r.publisher)?.publisher || 'unknown publisher';
    const developer = rows.find(r => r.developer)?.developer || null;
    const genre = rows.find(r => r.genre)?.genre || 'unknown genre';
    const players = rows.find(r => r.players)?.players || '1-2 Players';
    const desc = rows.find(r => r.description)?.description || '';

    // Best display title from metadata (for prompts), falls back to clean_name
    const displayTitle = rows.find(r => r.display_title !== cleanName)?.display_title || cleanName;
    return { systems, year, publisher, developer, genre, players, desc, displayTitle };
}

// ── Shared: build prompt ──────────────────────────────────────────────────────
function buildPrompt(gameTitle, info, type) {
    const platformList = info.systems.join(', ');
    const devLine = info.developer ? `, developed by ${info.developer}` : '';
    const descLine = info.desc ? `\nKnown description: ${info.desc}` : '';

    if (type === 'bio') {
        return `You are a passionate video game historian writing for a private family arcade encyclopedia. Write a complete, detailed game biography for "${gameTitle}" (${info.year}) published by ${info.publisher}${devLine}. Genre: ${info.genre} | ${info.players}

This game appeared on the following platforms: ${platformList}.${descLine}

IMPORTANT: This biography covers the game across ALL its platforms — do not write about just one version. Discuss the original release, notable ports, and differences between versions where relevant.

Format your response in clean markdown. Use ## for main sections, ### for sub-sections, **bold** for key terms, and bullet lists where appropriate.

## Platform & Specs
All platforms this game appeared on. Technical differences between versions — what each platform's hardware brought to the table.

## Overview
2-3 paragraphs on what this game is, why it matters, and its place in gaming history.

## Development History
Who made it, when, the studio, any interesting dev stories, production challenges, or design decisions.

## Story & Setting
The game world, characters, narrative premise. If no story, describe the theme and aesthetic.

## Gameplay
Core mechanics, controls philosophy, what makes it fun and unique.

## Key Features
Bullet list of the standout features that made this game special or memorable.

## Reception & Legacy
Critical reception at launch, sales, cultural impact, ports to other platforms, sequels/spinoffs, modern legacy.

## Trivia
5 interesting facts most players never knew — development secrets, odd historical details, hidden connections.

## Why It Still Matters
One punchy closing paragraph on why this game holds up and deserves a place in any serious collection.

Write with enthusiasm and depth. Be accurate — don't fabricate specific facts you're unsure of. Write like a collector who genuinely loves this era of gaming.`;

    } else if (type === 'trivia') {
        return `You are a video game trivia expert writing for a private family arcade encyclopedia. Write a collection of fascinating trivia facts for "${gameTitle}" (${info.year}) published by ${info.publisher}${devLine}. Genre: ${info.genre} | ${info.players}

Available on: ${platformList}.${descLine}

Format your response in clean markdown. Each fact should be a standalone nugget — the kind of thing that makes someone say "wait, really?"

## Development Secrets
3-5 facts about how the game was made — cut features, placeholder names, engine quirks, budget constraints, crunch stories, prototype versions.

## Hidden Content
3-5 facts about secrets in the game itself — easter eggs, debug menus, hidden characters, unused sprites or levels found in the ROM, developer messages, cheat codes and what they unlock.

## Cultural Connections
3-5 facts about the game's place in pop culture — references it makes, references TO it in other media, banned/censored versions, regional differences between Japanese and Western releases, name changes.

## Records & Firsts
2-3 facts about any records, firsts, or notable achievements — first game to do X, highest score ever recorded, speedrun records, tournament moments, sales milestones.

## The One Thing Nobody Knows
One deep-cut fact that even hardcore fans might not know. Make it the best one.

Be accurate — never fabricate facts. If you're not confident about a specific detail, skip it rather than guess. Every fact should be genuinely interesting, not filler. Write with the energy of someone sharing cool stuff they discovered, not a textbook.`;

    } else if (type === 'movelist') {
        // Only meaningful for fighters/brawlers, but we generate a lighter version for action games too
        const isFighter = /fight|beat|battle|vs|combat|brawl|martial|wrestling|boxing/i.test(info.genre);
        const isAction  = /action|hack|slash|beat.*em|shoot/i.test(info.genre);

        if (isFighter) {
            return `You are a fighting game expert writing a comprehensive move list for "${gameTitle}" (${info.year}) published by ${info.publisher}${devLine}. Genre: ${info.genre} | ${info.players}

Available on: ${platformList}.${descLine}

This is a reference document players keep open while playing. Format for quick scanning — tables and shorthand notation.

Use standard fighting game notation:
- **Directions**: ↑ ↓ ← → ↗ ↘ ↖ ↙ (or U D B F for Up Down Back Forward)
- **Buttons**: Use the game's actual button names if known, otherwise LP/HP/LK/HK or A/B/C/D
- **Motions**: QCF (quarter circle forward ↓↘→), QCB (quarter circle back ↓↙←), DP (dragon punch →↓↘), HCF (half circle forward ←↙↓↘→), 360 (full rotation)
- **Charge**: [Hold ←] → + Button
- **Close/Far**: cl. / far.

## Universal Mechanics
System-wide mechanics that apply to all characters — blocking, throws, supers, meter, guard crush, recovery, etc.

## Character Move Lists
For EACH playable character, provide a section with:

### [Character Name]
**Style**: One-line description of their playstyle

| Move | Input | Notes |
|------|-------|-------|
| Special moves | Notation | Properties (overhead, low, anti-air, projectile, etc.) |
| Super/Desperation moves | Notation | Conditions (meter, low health, etc.) |
| Notable normals | Button | Why it matters (range, speed, combo starter) |

## Combo Guide
3-5 practical combos per character (or universal combos if the game doesn't vary much). Format:
- **Basic**: Input sequence → damage/result
- **Advanced**: Input sequence → damage/result
- **Punish**: Input sequence → when to use

## Tier Notes
Brief competitive tier overview if applicable. Who's strong, who's tricky, who's beginner-friendly.

Be accurate with inputs. If you're unsure of exact inputs for a specific character, note it rather than guessing. Players rely on move lists being correct.`;
        }

        // Action/beat-em-up/general — lighter movelist focused on moves + combos
        return `You are a video game combat guide writer for a private family arcade. Write a moves and combat reference for "${gameTitle}" (${info.year}). Genre: ${info.genre} | ${info.players}

Available on: ${platformList}.${descLine}

Format for quick reference — players will check this while playing.

## Controls & Actions
Complete button/input mapping. What each button does. Format as a clean table:

| Action | Input | Notes |
|--------|-------|-------|
| ... | ... | ... |

## Move List
All special moves, charged attacks, power-ups, and unique abilities. Include input sequences.

## Combos & Chains
Practical attack combinations that deal extra damage or have special properties. Number them for quick reference.

## Power-Ups & Items
What each collectible/power-up does, how long it lasts, strategic value.

## Character Differences
If the game has multiple playable characters, briefly note how each one plays differently — unique moves, stats, or abilities.

## Quick Reference
The 5 most important things to remember mid-game, formatted as a tight bullet list.

Be specific to this game. If it doesn't have combos, say so briefly and focus on what it does have.`;

    } else { // guide
        const isFighter  = /fight|beat|battle|vs|combat|brawl/i.test(info.genre);
        const isShooter  = /shoot|shmup|blast|gun/i.test(info.genre);
        const isPlatform = /platform|jump|run|adventure/i.test(info.genre);
        const isPuzzle   = /puzzle|tetris|block|match/i.test(info.genre);
        const isRpg      = /rpg|role|quest/i.test(info.genre);

        const lastSection = isFighter  ? '## Character Breakdown\nTips and strategy for each playable character.'
                          : isShooter  ? '## Enemy & Boss Guide\nPatterns and strategies for key enemies and bosses.'
                          : isPlatform ? '## Level Guide\nTips for key levels, hidden paths, and boss encounters.'
                          : isPuzzle   ? '## Scoring System\nHow scoring works and how to maximize points.'
                          : isRpg      ? '## Character & Progression Guide\nBuild advice and key story choices.'
                          :              '## Modes & Progression\nGame modes, unlockables, and long-term goals.';

        return `You are a video game strategy writer for a private family arcade. Write a complete gameplay guide for "${gameTitle}" (${info.year}). Genre: ${info.genre} | ${info.players}

Available on: ${platformList}.${descLine}

If controls differ significantly across platforms, note the differences. Otherwise focus on general gameplay.

Format in clean markdown with ## main headers, ### sub-headers, bullet lists, and numbered steps where useful.

## Controls
Full control layout — buttons, joystick motions, common controller mappings. Be specific.

## Core Mechanics
The fundamental systems players must understand to enjoy and progress.

## Basic Strategy
Practical advice for newcomers. Numbered tips, clear and actionable.

## Advanced Techniques
High-level strategies, frame-perfect tricks, or depth mechanics for veterans.

## Secrets & Easter Eggs
Hidden features, cheat codes, developer secrets, unlockables, and Easter eggs. If none are known, skip this section gracefully.

${lastSection}

## Quick Reference Card
A concise cheat-sheet: most important controls, key tips, and must-know facts — like a reference card someone could keep at the machine.

Be specific and practical. Write for real players who want to get good at this game. Don't pad — if a section doesn't apply, keep it short or note that this game doesn't have that feature.`;
    }
}

// ── GET /api/intel/batch — status ─────────────────────────────────────────────
router.get('/batch', (req, res) => {
    const elapsed = batch.startedAt ? Math.round((Date.now() - new Date(batch.startedAt).getTime()) / 1000) : 0;
    const rate = elapsed > 0 ? (batch.done / elapsed * 60).toFixed(1) : 0;
    res.json({
        ...batch,
        pct: batch.total > 0 ? Math.round(batch.done / batch.total * 100) : 0,
        elapsed,
        rate: parseFloat(rate),
    });
});

// ── DELETE /api/intel/batch — stop ────────────────────────────────────────────
router.delete('/batch', (req, res) => {
    batch.stop = true;
    res.json({ ok: true, message: 'Stop signal sent — will finish current doc then halt' });
});

// ── POST /api/intel/batch — start background generation ───────────────────────
// Body: { types: ['bio','guide'], delay: 500 }
// Responds immediately; generation runs in background.
router.post('/batch', async (req, res) => {
    if (batch.running) {
        return res.json({
            running: true, ...batch,
            pct: batch.total > 0 ? Math.round(batch.done / batch.total * 100) : 0,
        });
    }

    const missingKey = checkProviderKey();
    if (missingKey) {
        return res.status(503).json({ error: `${missingKey} not set. Add it to your .env file then restart the server.` });
    }

    const ALL_TYPES = ['bio', 'guide', 'trivia', 'movelist'];
    const { types = ['bio', 'guide'], delay = 200, strategy = 'quality', concurrency = 4 } = req.body;
    const db = getDB();

    // One query: all (romId, type) pairs where intel doesn't exist yet,
    // ordered by romId then type so each game gets bio+guide before moving on.
    const typeList = types.filter(t => ALL_TYPES.includes(t));
    if (typeList.length === 0) return res.status(400).json({ error: 'No valid types requested' });

    // Build queue of unique game titles that still need intel
    const unionParts = typeList.map(t =>
        `SELECT DISTINCT r.clean_name as game_title, '${t}' as type
         FROM roms r
         WHERE r.clean_name IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM game_intel WHERE game_title = r.clean_name AND doc_type = '${t}')`
    );
    const queue = db.prepare(`${unionParts.join(' UNION ALL ')} ORDER BY game_title, type`).all();

    if (queue.length === 0) {
        return res.json({
            running: false, done: 0, total: 0,
            message: 'Nothing to generate — all games already have intel for requested types',
        });
    }

    const workers = Math.min(Math.max(1, concurrency), 8); // clamp 1-8
    Object.assign(batch, {
        running: true, stop: false,
        total: queue.length, done: 0, errors: 0,
        current: null, concurrency: workers, activeWorkers: 0,
        workerStatus: Array(workers).fill(null),
        startedAt: new Date().toISOString(), finishedAt: null,
    });

    res.json({ ok: true, started: true, total: queue.length, types: typeList, concurrency: workers });

    // Background parallel processing — runs after response is sent
    (async () => {
        const insertStmt = db.prepare(`
            INSERT OR REPLACE INTO game_intel (game_title, doc_type, content_md, model, tokens_used)
            VALUES (?, ?, ?, ?, ?)
        `);

        // Shared queue index — each worker grabs next item atomically
        let queueIdx = 0;

        async function worker(workerId) {
            batch.activeWorkers++;
            while (!batch.stop) {
                const idx = queueIdx++;
                if (idx >= queue.length) break;

                const { game_title: cleanName, type } = queue[idx];
                const info = gatherGameInfo(db, cleanName);
                if (!info) { batch.done++; continue; }

                const promptTitle = info.displayTitle || cleanName;
                batch.workerStatus[workerId] = { title: promptTitle, type };
                batch.current = { title: promptTitle, type, systems: info.systems.length };

                try {
                    const prompt = buildPrompt(promptTitle, info, type);
                    const { content, modelName, tokensUsed } = await callAI(prompt, { strategy });
                    insertStmt.run(cleanName, type, content, modelName, tokensUsed);
                    console.log(`[Intel W${workerId}] ${batch.done + 1}/${batch.total} ✓ ${type} — "${promptTitle}" via ${modelName} (${tokensUsed} tok)`);
                } catch (err) {
                    console.error(`[Intel W${workerId}] ✗ "${promptTitle}" ${type}:`, err.message);
                    batch.errors++;
                }

                batch.done++;

                // Every 50 bios, backfill descriptions into metadata table
                if (type === 'bio' && batch.done % 50 === 0) {
                    backfillDescriptions(db);
                }

                if (delay > 0) await new Promise(r => setTimeout(r, delay));
            }
            batch.workerStatus[workerId] = null;
            batch.activeWorkers--;
        }

        console.log(`[Intel Batch] Starting ${workers} parallel workers for ${queue.length} items`);

        // Launch all workers in parallel — they share the queue
        await Promise.all(
            Array.from({ length: workers }, (_, i) => worker(i))
        );

        // Final backfill at end of batch
        backfillDescriptions(db);

        batch.running    = false;
        batch.current    = null;
        batch.finishedAt = new Date().toISOString();
        const stopped = batch.stop ? ' (stopped early)' : '';
        const elapsed = Math.round((Date.now() - new Date(batch.startedAt).getTime()) / 1000);
        const rate = elapsed > 0 ? (batch.done / elapsed * 60).toFixed(1) : '∞';
        console.log(`[Intel Batch] Complete${stopped} — ${batch.done} processed, ${batch.errors} errors, ${elapsed}s, ${rate}/min`);
    })();
});

// ── GET /api/intel/config — provider info ─────────────────────────────────────
router.get('/config', (req, res) => {
    const status = getProviderStatus();
    const primarySlot = status.slots.find(s => s.key === status.primary);
    res.json({
        provider: status.primary,
        model:    primarySlot?.model || status.ollama.model,
        ollamaUrl: status.ollama.url,
        ...status,
    });
});

// ── GET /api/intel/stats — aggregate counts ────────────────────────────────────
router.get('/stats', (req, res) => {
    const db   = getDB();
    // Count unique game titles (not ROMs — one title = one bio)
    const total   = db.prepare('SELECT COUNT(DISTINCT r.clean_name) as n FROM roms r WHERE r.clean_name IS NOT NULL').get().n;
    const bios    = db.prepare("SELECT COUNT(DISTINCT game_title) as n FROM game_intel WHERE doc_type='bio'").get().n;
    const guides  = db.prepare("SELECT COUNT(DISTINCT game_title) as n FROM game_intel WHERE doc_type='guide'").get().n;
    const trivia  = db.prepare("SELECT COUNT(DISTINCT game_title) as n FROM game_intel WHERE doc_type='trivia'").get().n;
    const movelists = db.prepare("SELECT COUNT(DISTINCT game_title) as n FROM game_intel WHERE doc_type='movelist'").get().n;
    const complete = db.prepare(
        `SELECT COUNT(*) as n FROM (
            SELECT game_title FROM game_intel WHERE doc_type='bio'
            INTERSECT
            SELECT game_title FROM game_intel WHERE doc_type='guide'
            INTERSECT
            SELECT game_title FROM game_intel WHERE doc_type='trivia'
        )`
    ).get().n;
    res.json({
        total_titles: total, bios, guides, trivia, movelists, complete,
        missing_bio: total - bios, missing_guide: total - guides,
        missing_trivia: total - trivia, missing_movelist: total - movelists,
    });
});

// ── GET /api/intel/games — paginated game list with intel status ──────────────
// Query: page, limit, filter (all|missing_bio|missing_guide|missing_both|complete), q
router.get('/games', (req, res) => {
    const db     = getDB();
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 30);
    const offset = (page - 1) * limit;
    const filter = req.query.filter || 'all';
    const q      = (req.query.q || '').trim();

    const conds  = [];
    const params = [];

    if (q) {
        conds.push('(g.game_title LIKE ? OR g.filename LIKE ?)');
        params.push(`%${q}%`, `%${q}%`);
    }

    const filterSQL = {
        missing_bio:      'bio.game_title IS NULL',
        missing_guide:    'guide.game_title IS NULL',
        missing_trivia:   'triv.game_title IS NULL',
        missing_movelist: 'ml.game_title IS NULL',
        missing_both:     'bio.game_title IS NULL AND guide.game_title IS NULL',
        complete:         'bio.game_title IS NOT NULL AND guide.game_title IS NOT NULL AND triv.game_title IS NOT NULL',
    };
    if (filterSQL[filter]) conds.push(filterSQL[filter]);

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    // Group by game title to show unique titles, not per-ROM dupes
    const baseFrom = `
        FROM (
            SELECT r.clean_name as game_title,
                   MIN(r.id) as id, MIN(r.clean_name) as clean_name, MIN(r.filename) as filename,
                   GROUP_CONCAT(DISTINCT s.name) as system_names,
                   COUNT(DISTINCT r.system_id) as system_count
            FROM roms r
            LEFT JOIN systems  s ON s.id = r.system_id
            WHERE r.clean_name IS NOT NULL
            GROUP BY r.clean_name
        ) g
        LEFT JOIN (SELECT game_title FROM game_intel WHERE doc_type='bio')      bio   ON bio.game_title   = g.game_title
        LEFT JOIN (SELECT game_title FROM game_intel WHERE doc_type='guide')    guide ON guide.game_title = g.game_title
        LEFT JOIN (SELECT game_title FROM game_intel WHERE doc_type='trivia')   triv  ON triv.game_title  = g.game_title
        LEFT JOIN (SELECT game_title FROM game_intel WHERE doc_type='movelist') ml    ON ml.game_title    = g.game_title
        ${where}
    `;

    const total = db.prepare(`SELECT COUNT(*) as n ${baseFrom}`).get(...params).n;
    const games = db.prepare(`
        SELECT g.id, g.clean_name, g.filename, g.game_title,
               g.system_names, g.system_count,
               CASE WHEN bio.game_title   IS NOT NULL THEN 1 ELSE 0 END as has_bio,
               CASE WHEN guide.game_title IS NOT NULL THEN 1 ELSE 0 END as has_guide,
               CASE WHEN triv.game_title  IS NOT NULL THEN 1 ELSE 0 END as has_trivia,
               CASE WHEN ml.game_title    IS NOT NULL THEN 1 ELSE 0 END as has_movelist
        ${baseFrom}
        ORDER BY g.game_title
        LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({ games, total, page, limit, pages: Math.ceil(total / limit) });
});

// ── GET /api/intel/:romId — all docs for a game (looks up by title) ──────────
router.get('/:romId', (req, res) => {
    const db   = getDB();
    // Resolve ROM → game title, then look up intel by title
    const rom = db.prepare(`
        SELECT r.clean_name as game_title
        FROM roms r
        WHERE r.id = ?
    `).get(req.params.romId);
    if (!rom?.game_title) return res.json({});

    const rows = db.prepare(
        'SELECT doc_type, content_md, model, tokens_used, generated_at FROM game_intel WHERE game_title = ?'
    ).all(rom.game_title);
    const result = {};
    for (const row of rows) result[row.doc_type] = row;
    res.json(result);
});

// ── GET /api/intel/:romId/:type — one doc ─────────────────────────────────────
router.get('/:romId/:type', (req, res) => {
    const db  = getDB();
    const rom = db.prepare(`
        SELECT r.clean_name as game_title
        FROM roms r
        WHERE r.id = ?
    `).get(req.params.romId);
    if (!rom?.game_title) return res.status(404).json({ error: 'Not found' });

    const row = db.prepare(
        'SELECT doc_type, content_md, model, tokens_used, generated_at FROM game_intel WHERE game_title = ? AND doc_type = ?'
    ).get(rom.game_title, req.params.type);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
});

// ── DELETE /api/intel/:romId/:type — force regenerate ────────────────────────
router.delete('/:romId/:type', (req, res) => {
    const db = getDB();
    const rom = db.prepare(`
        SELECT r.clean_name as game_title
        FROM roms r
        WHERE r.id = ?
    `).get(req.params.romId);
    if (!rom?.game_title) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM game_intel WHERE game_title = ? AND doc_type = ?').run(rom.game_title, req.params.type);
    res.json({ ok: true });
});

// ── PUT /api/intel/:romId/:type — manual save ─────────────────────────────────
router.put('/:romId/:type', (req, res) => {
    const { content_md } = req.body;
    if (!content_md) return res.status(400).json({ error: 'content_md required' });
    const db = getDB();
    const rom = db.prepare(`
        SELECT r.clean_name as game_title
        FROM roms r
        WHERE r.id = ?
    `).get(req.params.romId);
    if (!rom?.game_title) return res.status(404).json({ error: 'Not found' });
    db.prepare(`INSERT OR REPLACE INTO game_intel (game_title, doc_type, content_md, model)
                VALUES (?, ?, ?, 'manual')`).run(rom.game_title, req.params.type, content_md);
    res.json({ ok: true });
});

// ── POST /api/intel/:romId/generate — single AI generate ─────────────────────
router.post('/:romId/generate', async (req, res) => {
    const missingKey2 = checkProviderKey();
    if (missingKey2) {
        return res.status(503).json({ error: `${missingKey2} not set. Add it to your .env file then restart the server.` });
    }

    const { type = 'bio', strategy = 'quality' } = req.body;
    if (!['bio', 'guide', 'trivia', 'movelist'].includes(type)) {
        return res.status(400).json({ error: 'type must be bio, guide, trivia, or movelist' });
    }

    const db   = getDB();
    const rom = db.prepare(`
        SELECT r.clean_name as game_title
        FROM roms r
        WHERE r.id = ?
    `).get(req.params.romId);

    if (!rom?.game_title) return res.status(404).json({ error: 'Game not found' });

    const cleanName = rom.game_title; // clean_name from query
    const info = gatherGameInfo(db, cleanName);
    if (!info) return res.status(404).json({ error: 'No game data found' });

    // Use display title (from metadata) for better prompt, clean_name as DB key
    const promptTitle = info.displayTitle || cleanName;

    try {
        const prompt = buildPrompt(promptTitle, info, type);
        const { content, modelName, tokensUsed } = await callAI(prompt, { strategy });

        db.prepare(`INSERT OR REPLACE INTO game_intel (game_title, doc_type, content_md, model, tokens_used)
                    VALUES (?, ?, ?, ?, ?)`).run(
            cleanName, type, content, modelName, tokensUsed
        );

        console.log(`[Intel] Generated ${type} for "${promptTitle}" (key: ${cleanName}) via ${modelName} (${tokensUsed} tok)`);

        res.json({ doc_type: type, content_md: content, model: modelName, tokens_used: tokensUsed, generated: true });

    } catch (err) {
        console.error('[Intel] Generation error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
