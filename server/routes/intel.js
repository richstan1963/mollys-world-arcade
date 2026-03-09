import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL   = process.env.ANTHROPIC_MODEL || 'claude-opus-4-5';
const ANTHROPIC_URL     = 'https://api.anthropic.com/v1/messages';
const INTEL_PROVIDER    = process.env.INTEL_PROVIDER  || 'anthropic'; // 'anthropic' | 'ollama' | 'cerebras' | 'groq'
const OLLAMA_URL        = process.env.OLLAMA_URL       || 'http://localhost:11434';
const OLLAMA_MODEL      = process.env.OLLAMA_MODEL     || 'qwen2.5:7b';
const CEREBRAS_API_KEY  = process.env.CEREBRAS_API_KEY;
const GROQ_API_KEY      = process.env.GROQ_API_KEY;

const OAI_PROVIDERS = {
    cerebras: {
        name:      'Cerebras',
        model:     'gpt-oss-120b',
        url:       'https://api.cerebras.ai/v1/chat/completions',
        key:       () => CEREBRAS_API_KEY,
        maxTokens: 8192,
    },
    groq: {
        name:      'Groq',
        model:     'llama-3.3-70b-versatile',
        url:       'https://api.groq.com/openai/v1/chat/completions',
        key:       () => GROQ_API_KEY,
        maxTokens: 32768,
    },
};

// ── Batch state ───────────────────────────────────────────────────────────────
const batch = {
    running: false, stop: false,
    total: 0, done: 0, errors: 0,
    current: null, startedAt: null, finishedAt: null,
};

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

// ── Helper: OpenAI-compatible call (Cerebras + Groq) ─────────────────────────
async function callOpenAICompatible(provider, prompt) {
    const cfg = OAI_PROVIDERS[provider];

    const makeRequest = () => fetch(cfg.url, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${cfg.key()}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
            model:       cfg.model,
            messages:    [{ role: 'user', content: prompt }],
            max_tokens:  cfg.maxTokens,
            temperature: 0.7,
        }),
    });

    let res = await makeRequest();

    if (res.status === 429) {
        const waitSec = parseInt(res.headers.get('retry-after')) || 30;
        console.log(`[Intel] ${cfg.name} rate limited — waiting ${waitSec}s`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
        res = await makeRequest();
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `${cfg.name} API error ${res.status}`);
    }

    const data    = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error(`Empty response from ${cfg.name}`);

    // Groq wraps usage in x_groq.usage; Cerebras uses top-level usage
    const usage      = (provider === 'groq' ? data.x_groq?.usage : null) ?? data.usage ?? {};
    const tokensUsed = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);

    return { content, modelName: cfg.model, tokensUsed };
}

// ── Shared: call AI provider ──────────────────────────────────────────────────
async function callAI(prompt) {
    if (INTEL_PROVIDER === 'cerebras' || INTEL_PROVIDER === 'groq') {
        return callOpenAICompatible(INTEL_PROVIDER, prompt);
    }

    if (INTEL_PROVIDER === 'ollama') {
        const res = await fetch(`${OLLAMA_URL}/api/chat`, {
            method:  'POST',
            headers: { 'content-type': 'application/json' },
            body:    JSON.stringify({
                model:    OLLAMA_MODEL,
                messages: [{ role: 'user', content: prompt }],
                stream:   false,
                options:  { num_predict: 4096, temperature: 0.7 },
            }),
        });
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`Ollama error ${res.status}: ${txt}`);
        }
        const od = await res.json();
        if (!od.message?.content) throw new Error('Empty response from Ollama');
        return {
            content:    od.message.content,
            modelName:  OLLAMA_MODEL,
            tokensUsed: (od.prompt_eval_count || 0) + (od.eval_count || 0),
        };
    } else {
        const res = await fetch(ANTHROPIC_URL, {
            method:  'POST',
            headers: {
                'content-type':      'application/json',
                'x-api-key':         ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model:      ANTHROPIC_MODEL,
                max_tokens: 4096,
                messages:   [{ role: 'user', content: prompt }],
            }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Anthropic API error ${res.status}`);
        }
        const ad = await res.json();
        if (!ad.content?.[0]?.text) throw new Error('Empty response from Anthropic');
        return {
            content:    ad.content[0].text,
            modelName:  ad.model || ANTHROPIC_MODEL,
            tokensUsed: (ad.usage?.input_tokens || 0) + (ad.usage?.output_tokens || 0),
        };
    }
}

// ── GET /api/intel/batch — status ─────────────────────────────────────────────
router.get('/batch', (req, res) => {
    res.json({
        ...batch,
        pct: batch.total > 0 ? Math.round(batch.done / batch.total * 100) : 0,
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

    const missingKey = (INTEL_PROVIDER === 'anthropic' && !ANTHROPIC_API_KEY)
        ? 'ANTHROPIC_API_KEY' : (INTEL_PROVIDER === 'cerebras' && !CEREBRAS_API_KEY)
        ? 'CEREBRAS_API_KEY'  : (INTEL_PROVIDER === 'groq' && !GROQ_API_KEY)
        ? 'GROQ_API_KEY'      : null;
    if (missingKey) {
        return res.status(503).json({ error: `${missingKey} not set. Add it to your .env file then restart the server.` });
    }

    const { types = ['bio', 'guide'], delay = 500 } = req.body;
    const db = getDB();

    // One query: all (romId, type) pairs where intel doesn't exist yet,
    // ordered by romId then type so each game gets bio+guide before moving on.
    const typeList = types.filter(t => ['bio', 'guide'].includes(t));
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

    Object.assign(batch, {
        running: true, stop: false,
        total: queue.length, done: 0, errors: 0,
        current: null,
        startedAt: new Date().toISOString(), finishedAt: null,
    });

    res.json({ ok: true, started: true, total: queue.length, types: typeList });

    // Background loop — runs after response is sent
    (async () => {
        const insertStmt = db.prepare(`
            INSERT OR REPLACE INTO game_intel (game_title, doc_type, content_md, model, tokens_used)
            VALUES (?, ?, ?, ?, ?)
        `);

        for (const { game_title: cleanName, type } of queue) {
            if (batch.stop) break;

            const info = gatherGameInfo(db, cleanName);
            if (!info) { batch.done++; continue; }

            const promptTitle = info.displayTitle || cleanName;
            batch.current = { title: promptTitle, type, systems: info.systems.length };

            try {
                const prompt = buildPrompt(promptTitle, info, type);
                const { content, modelName, tokensUsed } = await callAI(prompt);
                insertStmt.run(cleanName, type, content, modelName, tokensUsed);
                console.log(`[Intel Batch] ${batch.done + 1}/${batch.total} ✓ ${type} — "${promptTitle}" on ${info.systems.length} systems (${tokensUsed} tok)`);
            } catch (err) {
                console.error(`[Intel Batch] ✗ "${promptTitle}" ${type}:`, err.message);
                batch.errors++;
            }

            batch.done++;
            if (delay > 0) await new Promise(r => setTimeout(r, delay));
        }

        batch.running    = false;
        batch.current    = null;
        batch.finishedAt = new Date().toISOString();
        const stopped = batch.stop ? ' (stopped early)' : '';
        console.log(`[Intel Batch] Complete${stopped} — ${batch.done} processed, ${batch.errors} errors`);
    })();
});

// ── GET /api/intel/config — provider info ─────────────────────────────────────
router.get('/config', (req, res) => {
    const model = INTEL_PROVIDER === 'ollama'    ? OLLAMA_MODEL
                : OAI_PROVIDERS[INTEL_PROVIDER]  ? OAI_PROVIDERS[INTEL_PROVIDER].model
                :                                  ANTHROPIC_MODEL;
    res.json({ provider: INTEL_PROVIDER, model, ollamaUrl: OLLAMA_URL });
});

// ── GET /api/intel/stats — aggregate counts ────────────────────────────────────
router.get('/stats', (req, res) => {
    const db   = getDB();
    // Count unique game titles (not ROMs — one title = one bio)
    const total  = db.prepare('SELECT COUNT(DISTINCT r.clean_name) as n FROM roms r WHERE r.clean_name IS NOT NULL').get().n;
    const bios   = db.prepare("SELECT COUNT(DISTINCT game_title) as n FROM game_intel WHERE doc_type='bio'").get().n;
    const guides = db.prepare("SELECT COUNT(DISTINCT game_title) as n FROM game_intel WHERE doc_type='guide'").get().n;
    const both   = db.prepare(
        `SELECT COUNT(*) as n FROM (
            SELECT game_title FROM game_intel WHERE doc_type='bio'
            INTERSECT
            SELECT game_title FROM game_intel WHERE doc_type='guide'
        )`
    ).get().n;
    res.json({
        total_titles: total, bios, guides, both,
        missing_bio: total - bios, missing_guide: total - guides, missing_both: total - both,
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
        conds.push('(r.clean_name LIKE ? OR r.filename LIKE ? OR m.title LIKE ?)');
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const filterSQL = {
        missing_bio:   'bio.game_title IS NULL',
        missing_guide: 'guide.game_title IS NULL',
        missing_both:  'bio.game_title IS NULL AND guide.game_title IS NULL',
        complete:      'bio.game_title IS NOT NULL AND guide.game_title IS NOT NULL',
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
        LEFT JOIN (SELECT game_title FROM game_intel WHERE doc_type='bio')   bio   ON bio.game_title   = g.game_title
        LEFT JOIN (SELECT game_title FROM game_intel WHERE doc_type='guide') guide ON guide.game_title = g.game_title
        ${where}
    `;

    const total = db.prepare(`SELECT COUNT(*) as n ${baseFrom}`).get(...params).n;
    const games = db.prepare(`
        SELECT g.id, g.clean_name, g.filename, g.game_title,
               g.system_names, g.system_count,
               CASE WHEN bio.game_title   IS NOT NULL THEN 1 ELSE 0 END as has_bio,
               CASE WHEN guide.game_title IS NOT NULL THEN 1 ELSE 0 END as has_guide
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
    const missingKey2 = (INTEL_PROVIDER === 'anthropic' && !ANTHROPIC_API_KEY)
        ? 'ANTHROPIC_API_KEY' : (INTEL_PROVIDER === 'cerebras' && !CEREBRAS_API_KEY)
        ? 'CEREBRAS_API_KEY'  : (INTEL_PROVIDER === 'groq' && !GROQ_API_KEY)
        ? 'GROQ_API_KEY'      : null;
    if (missingKey2) {
        return res.status(503).json({ error: `${missingKey2} not set. Add it to your .env file then restart the server.` });
    }

    const { type = 'bio' } = req.body;
    if (!['bio', 'guide'].includes(type)) {
        return res.status(400).json({ error: 'type must be bio or guide' });
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
        const { content, modelName, tokensUsed } = await callAI(prompt);

        db.prepare(`INSERT OR REPLACE INTO game_intel (game_title, doc_type, content_md, model, tokens_used)
                    VALUES (?, ?, ?, ?, ?)`).run(
            cleanName, type, content, modelName, tokensUsed
        );

        console.log(`[Intel] Generated ${type} for "${promptTitle}" (key: ${cleanName}) on ${info.systems.length} systems via ${INTEL_PROVIDER} (${tokensUsed} tok)`);

        res.json({ doc_type: type, content_md: content, model: modelName, tokens_used: tokensUsed, generated: true });

    } catch (err) {
        console.error('[Intel] Generation error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
