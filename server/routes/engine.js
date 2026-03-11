/* ════════════════════════════════════════════════════════════════
   ENRICHMENT ENGINE — Unified Pipeline Orchestration
   Coordinates: metadata enrichment → AI game intel → system bios
   ════════════════════════════════════════════════════════════════ */
import { Router } from 'express';
import { getDB } from '../db.js';
import { enrichAll, getEnrichProgress, isConfigured } from '../services/enrichment-orchestrator.js';
import { callAI, checkProviderKey } from '../lib/ai.js';

const router = Router();

// ── Engine state ─────────────────────────────────────────────────────────────
const engine = {
    running: false,
    stop: false,
    stage: null,          // 'metadata' | 'intel' | 'system-bios'
    stageIndex: 0,
    totalStages: 0,
    stages: [],
    stageDetail: null,    // sub-progress from child service
    startedAt: null,
    finishedAt: null,
    results: {},
};

// Intel batch sub-state (mirrors intel.js pattern)
const intelBatch = {
    running: false, total: 0, done: 0, errors: 0, current: null,
};

// System bios sub-state
const biosBatch = {
    running: false, total: 0, done: 0, errors: 0, current: null,
};

// ── GET /api/engine/status — coverage stats across all sources ──────────────
router.get('/status', (req, res) => {
    const db = getDB();

    const totalRoms = db.prepare('SELECT COUNT(*) as n FROM roms').get().n;
    const totalSystems = db.prepare('SELECT COUNT(*) as n FROM systems WHERE id IN (SELECT DISTINCT system_id FROM roms)').get().n;
    const totalTitles = db.prepare('SELECT COUNT(DISTINCT clean_name) as n FROM roms WHERE clean_name IS NOT NULL').get().n;

    // Metadata coverage
    const artwork = db.prepare('SELECT COUNT(*) as n FROM metadata WHERE artwork_path IS NOT NULL').get().n;
    const nointro = db.prepare('SELECT COUNT(*) as n FROM metadata WHERE title IS NOT NULL').get().n;
    const screenscraper = db.prepare('SELECT COUNT(*) as n FROM metadata WHERE screenscraper_id IS NOT NULL').get().n;
    const igdb = db.prepare('SELECT COUNT(*) as n FROM metadata WHERE igdb_id IS NOT NULL').get().n;
    const ra = db.prepare('SELECT COUNT(*) as n FROM retro_achievements').get().n;
    const manuals = db.prepare('SELECT COUNT(*) as n FROM metadata WHERE manual_url IS NOT NULL').get().n;
    const rawg = db.prepare('SELECT COUNT(*) as n FROM metadata WHERE rawg_id IS NOT NULL').get().n;
    const mobygames = db.prepare('SELECT COUNT(*) as n FROM metadata WHERE moby_id IS NOT NULL').get().n;
    const giantbomb = db.prepare('SELECT COUNT(*) as n FROM metadata WHERE giantbomb_id IS NOT NULL').get().n;

    // Bulk importer coverage
    const boxart = db.prepare('SELECT COUNT(*) as n FROM metadata WHERE boxart_path IS NOT NULL').get().n;
    const titleScreens = db.prepare('SELECT COUNT(*) as n FROM metadata WHERE title_screen_path IS NOT NULL').get().n;
    const snaps = db.prepare('SELECT COUNT(*) as n FROM metadata WHERE snap_path IS NOT NULL').get().n;
    const cabinets = db.prepare('SELECT COUNT(*) as n FROM metadata WHERE cabinet_path IS NOT NULL').get().n;
    const marquees = db.prepare('SELECT COUNT(*) as n FROM metadata WHERE marquee_path IS NOT NULL').get().n;
    const flyers = db.prepare('SELECT COUNT(*) as n FROM metadata WHERE flyer_path IS NOT NULL').get().n;
    const arcadeRoms = db.prepare("SELECT COUNT(*) as n FROM roms WHERE system_id IN ('arcade', 'fbneo', 'neogeo')").get().n;
    const historyEntries = db.prepare('SELECT COUNT(*) as n FROM game_history').get().n;

    // Intel coverage (by unique title)
    const bios = db.prepare("SELECT COUNT(DISTINCT game_title) as n FROM game_intel WHERE doc_type='bio'").get().n;
    const guides = db.prepare("SELECT COUNT(DISTINCT game_title) as n FROM game_intel WHERE doc_type='guide'").get().n;

    // System bios
    const sysBiosDone = db.prepare('SELECT COUNT(*) as n FROM systems WHERE bio IS NOT NULL AND id IN (SELECT DISTINCT system_id FROM roms)').get().n;

    const pct = (done, total) => total > 0 ? Math.round(done / total * 100) : 0;

    res.json({
        library: { totalRoms, totalSystems, totalTitles },
        metadata: {
            artwork:       { done: artwork,       total: totalRoms,   pct: pct(artwork, totalRoms), configured: true },
            nointro:       { done: nointro,       total: totalRoms,   pct: pct(nointro, totalRoms), configured: isConfigured('nointro') },
            screenscraper: { done: screenscraper,  total: totalRoms,   pct: pct(screenscraper, totalRoms), configured: isConfigured('screenscraper') },
            igdb:          { done: igdb,           total: totalRoms,   pct: pct(igdb, totalRoms), configured: isConfigured('igdb') },
            ra:            { done: ra,             total: totalRoms,   pct: pct(ra, totalRoms), configured: isConfigured('ra') },
            manuals:       { done: manuals,        total: totalRoms,   pct: pct(manuals, totalRoms), configured: isConfigured('manuals') },
            rawg:          { done: rawg,           total: totalRoms,   pct: pct(rawg, totalRoms), configured: isConfigured('rawg') },
            mobygames:     { done: mobygames,      total: totalRoms,   pct: pct(mobygames, totalRoms), configured: isConfigured('mobygames') },
            giantbomb:     { done: giantbomb,      total: totalRoms,   pct: pct(giantbomb, totalRoms), configured: isConfigured('giantbomb') },
        },
        media: {
            boxart:        { done: boxart,        total: totalRoms,  pct: pct(boxart, totalRoms), configured: isConfigured('libretro-thumbs') },
            titleScreens:  { done: titleScreens,  total: totalRoms,  pct: pct(titleScreens, totalRoms), configured: isConfigured('libretro-thumbs') },
            snaps:         { done: snaps,          total: totalRoms,  pct: pct(snaps, totalRoms), configured: true },
            cabinets:      { done: cabinets,       total: arcadeRoms, pct: pct(cabinets, arcadeRoms), configured: isConfigured('progetto-snaps') },
            marquees:      { done: marquees,       total: arcadeRoms, pct: pct(marquees, arcadeRoms), configured: isConfigured('progetto-snaps') },
            flyers:        { done: flyers,         total: arcadeRoms, pct: pct(flyers, arcadeRoms), configured: isConfigured('progetto-snaps') },
            history:       { done: historyEntries, total: arcadeRoms, pct: pct(historyEntries, arcadeRoms), configured: isConfigured('history-dat') },
        },
        intel: {
            bios:   { done: bios,   total: totalTitles, pct: pct(bios, totalTitles) },
            guides: { done: guides, total: totalTitles, pct: pct(guides, totalTitles) },
        },
        systemBios: { done: sysBiosDone, total: totalSystems, pct: pct(sysBiosDone, totalSystems) },
    });
});

// ── GET /api/engine/progress — live progress of current run ─────────────────
router.get('/progress', (req, res) => {
    let stageDetail = null;

    if (engine.stage === 'metadata') {
        stageDetail = getEnrichProgress();
    } else if (engine.stage === 'intel') {
        stageDetail = { ...intelBatch };
    } else if (engine.stage === 'system-bios') {
        stageDetail = { ...biosBatch };
    }

    res.json({
        running: engine.running,
        stage: engine.stage,
        stageIndex: engine.stageIndex,
        totalStages: engine.totalStages,
        stages: engine.stages,
        stageDetail,
        startedAt: engine.startedAt,
        finishedAt: engine.finishedAt,
        results: engine.results,
    });
});

// ── POST /api/engine/stop — stop current run ────────────────────────────────
router.post('/stop', (req, res) => {
    engine.stop = true;
    res.json({ ok: true, message: 'Stop signal sent' });
});

// ── POST /api/engine/run — run full pipeline ────────────────────────────────
router.post('/run', (req, res) => {
    if (engine.running) {
        return res.json({ ok: false, running: true, message: 'Engine already running', stage: engine.stage });
    }

    const {
        stages = ['metadata', 'intel', 'system-bios'],
        intelTypes = ['bio', 'guide'],
        intelStrategy = 'speed',
        intelDelay = 500,
    } = req.body || {};

    const validStages = stages.filter(s => ['metadata', 'intel', 'system-bios'].includes(s));
    if (!validStages.length) return res.status(400).json({ error: 'No valid stages' });

    Object.assign(engine, {
        running: true, stop: false,
        stage: null, stageIndex: 0,
        totalStages: validStages.length,
        stages: validStages,
        stageDetail: null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        results: {},
    });

    res.json({ ok: true, stages: validStages });

    // Background pipeline
    (async () => {
        const db = getDB();

        for (let i = 0; i < validStages.length; i++) {
            if (engine.stop) break;
            const stageName = validStages[i];
            engine.stage = stageName;
            engine.stageIndex = i + 1;
            console.log(`[Engine] ── Stage ${i + 1}/${validStages.length}: ${stageName} ──`);

            try {
                if (stageName === 'metadata') {
                    engine.results.metadata = await enrichAll(db);
                } else if (stageName === 'intel') {
                    engine.results.intel = await runIntelBatch(db, intelTypes, intelStrategy, intelDelay);
                } else if (stageName === 'system-bios') {
                    engine.results.systemBios = await runSystemBios(db);
                }
            } catch (err) {
                console.error(`[Engine] Stage ${stageName} failed:`, err.message);
                engine.results[stageName] = { error: err.message };
            }
        }

        engine.running = false;
        engine.stage = null;
        engine.finishedAt = new Date().toISOString();
        const stopped = engine.stop ? ' (stopped early)' : '';
        console.log(`[Engine] Pipeline complete${stopped}`, engine.results);
    })();
});

// ── POST /api/engine/run-stage — run a single stage ─────────────────────────
router.post('/run-stage', (req, res) => {
    if (engine.running) {
        return res.json({ ok: false, running: true, message: 'Engine already running' });
    }

    const { stage, intelTypes, intelStrategy, intelDelay } = req.body || {};
    if (!['metadata', 'intel', 'system-bios'].includes(stage)) {
        return res.status(400).json({ error: 'Invalid stage. Use: metadata, intel, system-bios' });
    }

    Object.assign(engine, {
        running: true, stop: false,
        stage, stageIndex: 1, totalStages: 1,
        stages: [stage],
        stageDetail: null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        results: {},
    });

    res.json({ ok: true, stage });

    (async () => {
        const db = getDB();
        try {
            if (stage === 'metadata') {
                engine.results.metadata = await enrichAll(db);
            } else if (stage === 'intel') {
                engine.results.intel = await runIntelBatch(db, intelTypes || ['bio', 'guide'], intelStrategy || 'speed', intelDelay || 500);
            } else if (stage === 'system-bios') {
                engine.results.systemBios = await runSystemBios(db);
            }
        } catch (err) {
            console.error(`[Engine] Stage ${stage} failed:`, err.message);
            engine.results[stage] = { error: err.message };
        }
        engine.running = false;
        engine.stage = null;
        engine.finishedAt = new Date().toISOString();
        console.log(`[Engine] Stage ${stage} complete`);
    })();
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL: AI Intel Batch (mirrors intel.js logic)
// ═══════════════════════════════════════════════════════════════════════════════

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

    const systems = rows.map(r => r.system_name || r.system_id);
    const year = rows.find(r => r.year)?.year || 'unknown year';
    const publisher = rows.find(r => r.publisher)?.publisher || 'unknown publisher';
    const developer = rows.find(r => r.developer)?.developer || null;
    const genre = rows.find(r => r.genre)?.genre || 'unknown genre';
    const players = rows.find(r => r.players)?.players || '1-2 Players';
    const desc = rows.find(r => r.description)?.description || '';
    const displayTitle = rows.find(r => r.display_title !== cleanName)?.display_title || cleanName;
    return { systems, year, publisher, developer, genre, players, desc, displayTitle };
}

function buildBioPrompt(gameTitle, info) {
    const platformList = info.systems.join(', ');
    const devLine = info.developer ? `, developed by ${info.developer}` : '';
    const descLine = info.desc ? `\nKnown description: ${info.desc}` : '';

    return `You are a passionate video game historian writing for a private family arcade encyclopedia. Write a complete, detailed game biography for "${gameTitle}" (${info.year}) published by ${info.publisher}${devLine}. Genre: ${info.genre} | ${info.players}

This game appeared on the following platforms: ${platformList}.${descLine}

IMPORTANT: This biography covers the game across ALL its platforms — do not write about just one version.

Format your response in clean markdown. Use ## for main sections, ### for sub-sections, **bold** for key terms, and bullet lists where appropriate.

## Overview
2-3 paragraphs on what this game is, why it matters, and its place in gaming history.

## Gameplay
Core mechanics, controls philosophy, what makes it fun and unique.

## Reception & Legacy
Critical reception, cultural impact, sequels/spinoffs, modern legacy.

## Trivia
3-5 interesting facts most players never knew.

Write with enthusiasm and accuracy. Be concise but thorough.`;
}

function buildGuidePrompt(gameTitle, info) {
    const platformList = info.systems.join(', ');
    const descLine = info.desc ? `\nKnown description: ${info.desc}` : '';

    return `You are a video game strategy writer for a private family arcade. Write a complete gameplay guide for "${gameTitle}" (${info.year}). Genre: ${info.genre} | ${info.players}

Available on: ${platformList}.${descLine}

Format in clean markdown with ## main headers, ### sub-headers, bullet lists, and numbered steps.

## Controls
Full control layout — buttons, joystick motions, common controller mappings.

## Core Mechanics
The fundamental systems players must understand.

## Basic Strategy
Practical advice for newcomers. Numbered tips.

## Advanced Techniques
High-level strategies for veterans.

## Secrets & Easter Eggs
Hidden features, cheat codes, unlockables.

## Quick Reference Card
Concise cheat-sheet of key controls and tips.

Be specific and practical. Write for real players.`;
}

async function runIntelBatch(db, types, strategy, delay) {
    const missingKey = checkProviderKey();
    if (missingKey) throw new Error(`${missingKey} not set`);

    const typeList = types.filter(t => ['bio', 'guide'].includes(t));
    if (!typeList.length) return { done: 0, errors: 0, message: 'No valid types' };

    const unionParts = typeList.map(t =>
        `SELECT DISTINCT r.clean_name as game_title, '${t}' as type
         FROM roms r
         WHERE r.clean_name IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM game_intel WHERE game_title = r.clean_name AND doc_type = '${t}')`
    );
    const queue = db.prepare(`${unionParts.join(' UNION ALL ')} ORDER BY game_title, type`).all();

    if (!queue.length) return { done: 0, errors: 0, message: 'All games have intel' };

    Object.assign(intelBatch, { running: true, total: queue.length, done: 0, errors: 0, current: null });

    const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO game_intel (game_title, doc_type, content_md, model, tokens_used)
        VALUES (?, ?, ?, ?, ?)
    `);

    for (const { game_title: cleanName, type } of queue) {
        if (engine.stop) break;

        const info = gatherGameInfo(db, cleanName);
        if (!info) { intelBatch.done++; continue; }

        const promptTitle = info.displayTitle || cleanName;
        intelBatch.current = { title: promptTitle, type, systems: info.systems.length };

        try {
            const prompt = type === 'bio'
                ? buildBioPrompt(promptTitle, info)
                : buildGuidePrompt(promptTitle, info);
            const { content, modelName, tokensUsed } = await callAI(prompt, { strategy });
            insertStmt.run(cleanName, type, content, modelName, tokensUsed);
            console.log(`[Engine/Intel] ${intelBatch.done + 1}/${intelBatch.total} ✓ ${type} — "${promptTitle}" via ${modelName} (${tokensUsed} tok)`);
        } catch (err) {
            console.error(`[Engine/Intel] ✗ "${promptTitle}" ${type}:`, err.message);
            intelBatch.errors++;
        }

        intelBatch.done++;
        if (delay > 0) await new Promise(r => setTimeout(r, delay));
    }

    intelBatch.running = false;
    intelBatch.current = null;
    return { done: intelBatch.done, errors: intelBatch.errors, total: intelBatch.total };
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL: System Bio Generation
// ═══════════════════════════════════════════════════════════════════════════════

async function runSystemBios(db) {
    const missingKey = checkProviderKey();
    if (missingKey) throw new Error(`${missingKey} not set`);

    const systems = db.prepare(`
        SELECT s.id, s.name, s.short_name, COUNT(r.id) as rom_count,
               MIN(m.year) as earliest_year, MAX(m.year) as latest_year
        FROM systems s
        JOIN roms r ON r.system_id = s.id
        LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE s.bio IS NULL
        GROUP BY s.id
        HAVING rom_count > 0
        ORDER BY rom_count DESC
    `).all();

    if (!systems.length) return { done: 0, errors: 0, message: 'All systems have bios' };

    Object.assign(biosBatch, { running: true, total: systems.length, done: 0, errors: 0, current: null });

    const updateStmt = db.prepare(`
        UPDATE systems SET bio = ?, bio_model = ?, bio_generated_at = datetime('now')
        WHERE id = ?
    `);

    for (const sys of systems) {
        if (engine.stop) break;

        biosBatch.current = { name: sys.name, romCount: sys.rom_count };

        // Get top 10 games by play count or just alphabetically
        const topGames = db.prepare(`
            SELECT DISTINCT r.clean_name
            FROM roms r
            WHERE r.system_id = ? AND r.clean_name IS NOT NULL
            ORDER BY r.clean_name
            LIMIT 10
        `).all(sys.id).map(r => r.clean_name);

        const yearRange = sys.earliest_year && sys.latest_year
            ? `${sys.earliest_year}–${sys.latest_year}`
            : 'various years';

        const prompt = `You are a video game historian writing for a family arcade encyclopedia. Write a concise biography of the ${sys.name} gaming platform.

Library: ${sys.rom_count} games in our collection (${yearRange}).
Notable titles: ${topGames.join(', ')}.

Cover in 3-5 paragraphs:
- What it was and when it launched
- Technical specs and what made it special
- Its best games and cultural impact
- Its legacy and why it matters to collectors

Write in clean markdown. Be enthusiastic but accurate. Keep it under 500 words.`;

        try {
            const { content, modelName, tokensUsed } = await callAI(prompt, { strategy: 'speed' });
            updateStmt.run(content, modelName, sys.id);
            console.log(`[Engine/Bios] ${biosBatch.done + 1}/${biosBatch.total} ✓ ${sys.name} via ${modelName} (${tokensUsed} tok)`);
        } catch (err) {
            console.error(`[Engine/Bios] ✗ ${sys.name}:`, err.message);
            biosBatch.errors++;
        }

        biosBatch.done++;
        if (biosBatch.done < systems.length) await new Promise(r => setTimeout(r, 500));
    }

    biosBatch.running = false;
    biosBatch.current = null;
    return { done: biosBatch.done, errors: biosBatch.errors, total: biosBatch.total };
}

export default router;
