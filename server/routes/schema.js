import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

/**
 * GET /api/schema/game/:id
 * Returns VideoGame JSON-LD for a specific game.
 * Used by: client-side injection into <head>, SSR meta tags.
 */
router.get('/game/:id', (req, res) => {
    try {
        const db = getDB();
        const game = db.prepare(`
            SELECT r.id, m.title, m.description, m.year, m.publisher, m.developer,
                   m.genre, m.rating, m.artwork_url, m.screenshots, m.players,
                   s.name as system_name, s.short_name as platform
            FROM roms r
            LEFT JOIN metadata m ON m.rom_id = r.id
            LEFT JOIN systems s ON s.id = r.system_id
            WHERE r.id = ?
        `).get(req.params.id);

        if (!game) return res.status(404).json({ error: 'Game not found' });

        const title = game.title || `Game #${game.id}`;
        const schema = {
            '@context': 'https://schema.org',
            '@type': 'VideoGame',
            name: title,
            description: game.description || `Play ${title} on Your World Arcade`,
            gamePlatform: game.system_name || game.platform,
            genre: game.genre || undefined,
            datePublished: game.year || undefined,
            operatingSystem: 'Web Browser',
            applicationCategory: 'Game',
            playMode: game.players > 1 ? 'MultiPlayer' : 'SinglePlayer',
            image: game.artwork_url || undefined,
            url: `${req.protocol}://${req.get('host')}/#/game/${game.id}`,
        };

        if (game.developer) {
            schema.author = { '@type': 'Organization', name: game.developer };
        }
        if (game.publisher) {
            schema.publisher = { '@type': 'Organization', name: game.publisher };
        }
        if (game.rating && game.rating > 0) {
            schema.aggregateRating = {
                '@type': 'AggregateRating',
                ratingValue: game.rating,
                bestRating: 5,
                ratingCount: 1,
            };
        }

        // Parse screenshots JSON
        if (game.screenshots) {
            try {
                const ss = JSON.parse(game.screenshots);
                if (Array.isArray(ss) && ss.length) {
                    schema.screenshot = ss;
                }
            } catch {}
        }

        // Clean undefined values
        Object.keys(schema).forEach(k => schema[k] === undefined && delete schema[k]);

        res.json(schema);
    } catch (err) {
        res.status(500).json({ error: 'Schema generation failed' });
    }
});

/**
 * GET /api/schema/platform
 * Returns SoftwareApplication JSON-LD for YWA itself.
 */
router.get('/platform', (req, res) => {
    try {
        const db = getDB();
        const gameCount = db.prepare('SELECT COUNT(*) as cnt FROM roms').get();
        const systemCount = db.prepare('SELECT COUNT(*) as cnt FROM systems').get();

        res.json({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Your World Arcade',
            description: `Retro game browser and emulator with ${gameCount.cnt} games across ${systemCount.cnt} platforms. Play classic arcade, console, and handheld games in your browser.`,
            applicationCategory: 'GameApplication',
            operatingSystem: 'Web Browser',
            offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
            },
            featureList: 'Retro game emulation, Leaderboards, Clans, Challenges, 50+ themes, Game of the Day',
            author: { '@type': 'Organization', name: 'Your World Arcade' },
        });
    } catch (err) {
        res.status(500).json({ error: 'Schema generation failed' });
    }
});

export default router;
