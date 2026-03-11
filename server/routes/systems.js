import { Router } from 'express';
import { getDB } from '../db.js';
import { callAI } from '../lib/ai.js';

const router = Router();

router.get('/', (req, res) => {
    try {
        const db = getDB();
        const systems = db.prepare(`
            SELECT s.*, COALESCE(rc.count, 0) as rom_count
            FROM systems s
            LEFT JOIN (SELECT system_id, COUNT(*) as count FROM roms GROUP BY system_id) rc
                ON rc.system_id = s.id
            WHERE COALESCE(rc.count, 0) > 0
            ORDER BY s.sort_order ASC
        `).all();

        res.json(systems);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load systems' });
    }
});

// ── GET /api/systems/:id — single system detail ─────────────────────────────
router.get('/:id', (req, res) => {
    try {
        const db = getDB();
        const system = db.prepare(`
            SELECT s.*, COALESCE(rc.count, 0) as rom_count
            FROM systems s
            LEFT JOIN (SELECT system_id, COUNT(*) as count FROM roms GROUP BY system_id) rc
                ON rc.system_id = s.id
            WHERE s.id = ?
        `).get(req.params.id);

        if (!system) return res.status(404).json({ error: 'System not found' });

        // Top games: most played, with metadata
        const topGames = db.prepare(`
            SELECT r.id, r.clean_name, r.filename, r.system_id,
                   COALESCE(m.title, r.clean_name) as title,
                   m.genre, m.year, m.publisher, m.artwork_url,
                   COALESCE(ph.play_count, 0) as play_count
            FROM roms r
            LEFT JOIN metadata m ON m.rom_id = r.id
            LEFT JOIN (SELECT rom_id, COUNT(*) as play_count FROM play_history GROUP BY rom_id) ph
                ON ph.rom_id = r.id
            WHERE r.system_id = ?
            ORDER BY play_count DESC, r.clean_name ASC
            LIMIT 12
        `).all(req.params.id);

        // Genre breakdown
        const genres = db.prepare(`
            SELECT m.genre, COUNT(*) as count
            FROM roms r
            JOIN metadata m ON m.rom_id = r.id
            WHERE r.system_id = ? AND m.genre IS NOT NULL AND m.genre != ''
            GROUP BY m.genre
            ORDER BY count DESC
            LIMIT 10
        `).all(req.params.id);

        res.json({ ...system, topGames, genres });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load system detail' });
    }
});

// ── POST /api/systems/:id/generate-bio — generate system bio via LLM ────────
router.post('/:id/generate-bio', async (req, res) => {
    try {
        const db = getDB();
        const system = db.prepare('SELECT * FROM systems WHERE id = ?').get(req.params.id);
        if (!system) return res.status(404).json({ error: 'System not found' });

        const romCount = db.prepare('SELECT COUNT(*) as c FROM roms WHERE system_id = ?').get(req.params.id).c;

        // Get top genres for this system
        const genres = db.prepare(`
            SELECT m.genre, COUNT(*) as count
            FROM roms r JOIN metadata m ON m.rom_id = r.id
            WHERE r.system_id = ? AND m.genre IS NOT NULL AND m.genre != ''
            GROUP BY m.genre ORDER BY count DESC LIMIT 5
        `).all(req.params.id);
        const genreList = genres.map(g => g.genre).join(', ') || 'various genres';

        // Get a few notable games
        const notableGames = db.prepare(`
            SELECT COALESCE(m.title, r.clean_name) as title
            FROM roms r LEFT JOIN metadata m ON m.rom_id = r.id
            LEFT JOIN (SELECT rom_id, COUNT(*) as pc FROM play_history GROUP BY rom_id) ph ON ph.rom_id = r.id
            WHERE r.system_id = ?
            ORDER BY COALESCE(ph.pc, 0) DESC
            LIMIT 8
        `).all(req.params.id);
        const gamesList = notableGames.map(g => g.title).join(', ');

        const prompt = `You are a passionate video game historian writing for a private family arcade encyclopedia. Write a complete, detailed biography for the **${system.name}** gaming console/system.

This family's arcade has ${romCount} ${system.name} games in their collection, spanning genres like ${genreList}.
Notable titles in the collection: ${gamesList}.

Format your response in clean markdown. Use ## for main sections, ### for sub-sections, **bold** for key terms, and bullet lists where appropriate.

## Overview
2-3 paragraphs on what this system is, why it mattered, and its place in gaming history.

## History & Development
Who made it, when, the story behind its creation. Key people involved, business decisions, competition at the time.

## Technical Specifications
CPU, graphics, sound, media format, memory — presented in an accessible way that helps people appreciate what the hardware could do.

## The Controller
Describe the iconic controller. What made it special, innovative, or controversial. How it shaped the gaming experience.

## Defining Games
The games that defined this platform. What genres thrived. Which titles are considered must-plays.

## Legacy & Impact
How this system influenced gaming history, what it pioneered, how it's remembered today.

## Fun Facts
5 interesting facts most gamers never knew — development secrets, odd historical details, hidden connections.

## Why It Belongs in the Arcade
One punchy closing paragraph on why this system deserves its place in any serious game collection.

Write with enthusiasm and depth. Be accurate — don't fabricate specific facts you're unsure of. Write like a collector who genuinely loves this era of gaming.`;

        console.log(`[Systems] Generating bio for ${system.name}...`);
        const result = await callAI(prompt);

        db.prepare(`UPDATE systems SET bio = ?, bio_model = ?, bio_generated_at = datetime('now') WHERE id = ?`)
            .run(result.content, result.modelName, req.params.id);

        console.log(`[Systems] Bio generated for ${system.name} (${result.tokensUsed} tokens, ${result.modelName})`);
        res.json({
            bio: result.content,
            bio_model: result.modelName,
            bio_generated_at: new Date().toISOString(),
            tokens_used: result.tokensUsed,
        });
    } catch (err) {
        console.error(`[Systems] Bio generation failed:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/systems/batch-bios — generate bios for all systems ─────────────
const bioBatch = { running: false, stop: false, total: 0, done: 0, errors: 0, current: null };

router.get('/batch-bios/status', (req, res) => res.json(bioBatch));

router.post('/batch-bios', async (req, res) => {
    if (bioBatch.running) return res.status(409).json({ error: 'Batch already running' });

    const db = getDB();
    const systems = db.prepare(`
        SELECT s.id, s.name FROM systems s
        LEFT JOIN (SELECT system_id, COUNT(*) as c FROM roms GROUP BY system_id) rc ON rc.system_id = s.id
        WHERE COALESCE(rc.count, 0) > 0 AND s.bio IS NULL
        ORDER BY s.sort_order
    `).all();

    if (!systems.length) return res.json({ message: 'All systems already have bios' });

    bioBatch.running = true; bioBatch.stop = false;
    bioBatch.total = systems.length; bioBatch.done = 0; bioBatch.errors = 0;
    res.json({ message: `Generating bios for ${systems.length} systems`, total: systems.length });

    // Run in background
    (async () => {
        for (const sys of systems) {
            if (bioBatch.stop) break;
            bioBatch.current = sys.name;
            try {
                // Trigger the single-system generate endpoint logic internally
                const url = `http://localhost:${process.env.PORT || 3000}/api/systems/${sys.id}/generate-bio`;
                await fetch(url, { method: 'POST' });
                bioBatch.done++;
            } catch (err) {
                console.error(`[Systems] Batch bio error for ${sys.name}:`, err.message);
                bioBatch.errors++;
            }
        }
        bioBatch.running = false; bioBatch.current = null;
    })();
});

router.post('/batch-bios/stop', (req, res) => {
    bioBatch.stop = true;
    res.json({ message: 'Stopping batch' });
});

export default router;
