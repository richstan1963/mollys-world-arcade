import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { CONFIG, ROOT } from './config.js';

process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT]', err.stack);
});
process.on('unhandledRejection', (err) => {
    console.error('[UNHANDLED]', err);
});

// Cache headers for static assets (artwork, CSS, JS) — 1 day browser cache
const staticCache = { maxAge: '1d', etag: true, lastModified: true };

// Ensure writable dirs exist (critical in cloud environments with mounted volumes)
for (const dir of [CONFIG.ROMS_DIR, CONFIG.ARTWORK_DIR, CONFIG.SAVES_DIR,
                   path.join(ROOT, 'data'), path.join(ROOT, 'data/cores')]) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* already exists */ }
}
// Ensure DB directory exists
try { fs.mkdirSync(path.dirname(CONFIG.DB_PATH), { recursive: true }); } catch {}
import { initDB } from './db.js';
import { coopCoep } from './middleware/coop-coep.js';
import { errorHandler } from './middleware/error-handler.js';
import { sanitizeBody } from './middleware/validate.js';

import libraryRoutes from './routes/library.js';
import systemsRoutes from './routes/systems.js';
import gameRoutes from './routes/game.js';
import scannerRoutes from './routes/scanner.js';
import metadataRoutes from './routes/metadata.js';
import archiveRoutes from './routes/archive.js';
import downloaderRoutes from './routes/downloader.js';
import mamedevRoutes from './routes/mamedev.js';
import settingsRoutes from './routes/settings.js';
import playerRoutes from './routes/player.js';
import playersRoutes from './routes/players.js';
import historyRoutes from './routes/history.js';
import ratingsRoutes from './routes/ratings.js';
import scoresRoutes from './routes/scores.js';
import streaksRoutes from './routes/streaks.js';
import challengeRoutes from './routes/challenge.js';
import progressionRoutes from './routes/progression.js';
import commandCenterRoutes from './routes/command-center.js';
import originalsRoutes from './routes/originals.js';
import clansRoutes from './routes/clans.js';
import clanBattlesRoutes from './routes/clan-battles.js';
import hallOfFameRoutes from './routes/hall-of-fame.js';
import dailyChallengesRoutes from './routes/daily-challenges.js';
import tournamentsRoutes from './routes/tournaments.js';
import collectionsRoutes from './routes/collections.js';
import friendsRoutes from './routes/friends.js';
import notificationsRoutes from './routes/notifications.js';
import recommendationsRoutes from './routes/recommendations.js';
import speedrunRoutes from './routes/speedrun.js';
import statsDashboardRoutes from './routes/stats-dashboard.js';
import gameOfDayRoutes from './routes/game-of-day.js';
import searchRoutes from './routes/search.js';
import chatRoutes from './routes/chat.js';
import messagesRoutes from './routes/messages.js';
import gameRequestsRoutes from './routes/game-requests.js';
import llmSearchRoutes from './routes/llm-search.js';
import socialHubRouter from './routes/social-hub.js';
import adminRoutes from './routes/admin.js';
import tunnelRoutes from './routes/tunnel.js';
import intelRoutes from './routes/intel.js';
import engineRoutes from './routes/engine.js';
import triviaRoutes from './routes/trivia.js';

const app = express();

// Gzip/Brotli compression — skip binary ROM file responses
app.use(compression({
    filter: (req, res) => {
        if (req.path.startsWith('/rom-file/')) return false;
        return compression.filter(req, res);
    },
}));

// COOP/COEP for SharedArrayBuffer (EmulatorJS threading)
app.use(coopCoep);
app.use(express.json({ limit: '1mb' }));
app.use(sanitizeBody); // Strip HTML + control chars from all request bodies

// Static serving (with cache headers for assets)
app.use('/', express.static(path.join(ROOT, 'public'), staticCache));
app.use('/data', express.static(path.join(ROOT, 'data'), staticCache));
app.use('/artwork', express.static(CONFIG.ARTWORK_DIR, staticCache));
app.use('/saves', express.static(CONFIG.SAVES_DIR));

// API routes
app.use('/api/library', libraryRoutes);
app.use('/api/systems', systemsRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/scanner', scannerRoutes);
app.use('/api/metadata', metadataRoutes);
app.use('/api/archive', archiveRoutes);
app.use('/api/download', downloaderRoutes);
app.use('/api/mamedev', mamedevRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/players', playersRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/ratings', ratingsRoutes);
app.use('/api/scores', scoresRoutes);
app.use('/api/streaks', streaksRoutes);
app.use('/api/challenge', challengeRoutes);
app.use('/api/progression', progressionRoutes);
app.use('/api/command-center', commandCenterRoutes);
app.use('/api/originals', originalsRoutes);
app.use('/api/clans', clansRoutes);
app.use('/api/clan-battles', clanBattlesRoutes);
app.use('/api/hall-of-fame', hallOfFameRoutes);
app.use('/api/daily-challenges', dailyChallengesRoutes);
app.use('/api/tournaments', tournamentsRoutes);
app.use('/api/collections', collectionsRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/speedrun', speedrunRoutes);
app.use('/api/stats', statsDashboardRoutes);
app.use('/api/game-of-day', gameOfDayRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/game-requests', gameRequestsRoutes);
app.use('/api/llm', llmSearchRoutes);
app.use('/api/social', socialHubRouter);
app.use('/api/admin', adminRoutes);
app.use('/api/tunnel', tunnelRoutes);
app.use('/api/intel',  intelRoutes);
app.use('/api/engine', engineRoutes);
app.use('/api/trivia', triviaRoutes);

// BIOS file serving — serve neogeo.zip etc from roms directories
app.get('/bios/:system/:file', (req, res) => {
    // Sanitize params to prevent path traversal (../ attacks)
    const system = path.basename(req.params.system);
    const file = path.basename(req.params.file);
    console.log(`[BIOS] Request: /bios/${system}/${file}`);
    const biosPath = path.join(CONFIG.ROMS_DIR, system, file);
    if (!fs.existsSync(biosPath)) {
        // Also check alternate locations (e.g. arcade/ folder for Neo Geo)
        const altPath = path.join(CONFIG.ROMS_DIR, 'arcade', file);
        if (fs.existsSync(altPath)) return res.sendFile(altPath);
        return res.status(404).json({ error: 'BIOS file not found' });
    }
    res.sendFile(biosPath);
});

// ROM file serving — secured to scan_paths only
// Supports /rom-file/:id and /rom-file/:id/filename.zip (MAME cores need filename in URL)
app.get('/rom-file/:id/{*splat}', romFileHandler);
app.get('/rom-file/:id', romFileHandler);

function romFileHandler(req, res) {
    try {
        const db = req.app.get('db');
        const rom = db.prepare('SELECT filepath, filename FROM roms WHERE id = ?').get(req.params.id);
        if (!rom) return res.status(404).json({ error: 'ROM not found' });

        const scanPaths = db.prepare('SELECT path FROM scan_paths WHERE enabled = 1').all();
        const isAllowed = scanPaths.some(sp => rom.filepath.startsWith(sp.path));
        if (!isAllowed) return res.status(403).json({ error: 'Access denied' });
        if (!fs.existsSync(rom.filepath)) return res.status(404).json({ error: 'File missing from disk' });

        const stat = fs.statSync(rom.filepath);

        // CORP header required for COEP cross-origin isolation (EmulatorJS iframe)
        const commonHeaders = {
            'Content-Type': 'application/octet-stream',
            'Accept-Ranges': 'bytes',
            'Cross-Origin-Resource-Policy': 'same-origin',
        };

        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
            res.writeHead(206, {
                ...commonHeaders,
                'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                'Content-Length': end - start + 1,
            });
            fs.createReadStream(rom.filepath, { start, end }).pipe(res);
        } else {
            res.writeHead(200, {
                ...commonHeaders,
                'Content-Length': stat.size,
                'Content-Disposition': `inline; filename="${rom.filename}"`,
            });
            fs.createReadStream(rom.filepath).pipe(res);
        }
    } catch (err) {
        console.error('[ROM-FILE] Error serving ROM:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to serve ROM' });
    }
}

// SPA fallback (Express 5 wildcard syntax)
app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.use(errorHandler);

// Initialize
const db = initDB();
app.set('db', db);

app.listen(CONFIG.PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║                                          ║');
    console.log("  ║    Your World Arcade is running!         ║");
    console.log(`  ║    http://localhost:${CONFIG.PORT}                  ║`);
    console.log('  ║                                          ║');
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');
});
