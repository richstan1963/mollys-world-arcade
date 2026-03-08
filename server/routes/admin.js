/**
 * Admin routes — server-side ROM scraping from Myrient
 * POST /api/admin/scrape?key=ADMIN_KEY   { systems: ['nes','snes',...] or 'all' }
 * GET  /api/admin/scrape/status          — current scrape job status
 * GET  /api/admin/storage                — disk/volume info
 */
import { Router } from 'express';
import { spawn } from 'child_process';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CONFIG } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER   = path.join(__dirname, '..', 'scripts', 'top100-scraper.js');
const router    = Router();

// ── Auth ─────────────────────────────────────────────────────────────────────
const ADMIN_KEY = process.env.ARCADE_ADMIN_KEY || 'molly2026';

function requireKey(req, res, next) {
    const key = req.query.key || req.headers['x-admin-key'];
    if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

// ── Job state ─────────────────────────────────────────────────────────────────
let activeJob = null;  // { proc, systems, started, log[] }

// ── POST /api/admin/scrape — start scraping ───────────────────────────────────
router.post('/scrape', requireKey, (req, res) => {
    if (activeJob) {
        return res.status(409).json({ error: 'Scrape already running', started: activeJob.started });
    }

    const { systems = 'all' } = req.body;
    const systemArgs = systems === 'all' ? [] : (Array.isArray(systems) ? systems : [systems]);

    const env = {
        ...process.env,
        ARCADE_ROMS_DIR:     CONFIG.ROMS_DIR,
        ARCADE_ARTWORK_DIR:  CONFIG.ARTWORK_DIR || path.join(path.dirname(CONFIG.ROMS_DIR), 'artwork'),
        ARCADE_API_BASE:     `http://localhost:${process.env.PORT || 3000}`,
    };

    const args = [SCRAPER, ...systemArgs];
    const proc = spawn(process.execPath, args, { env, cwd: path.join(__dirname, '..', '..') });

    activeJob = {
        proc,
        systems: systems === 'all' ? 'all' : systemArgs,
        started: new Date().toISOString(),
        log: [],
        exitCode: null,
    };

    proc.stdout.on('data', d => {
        const line = d.toString();
        activeJob.log.push(line);
        if (activeJob.log.length > 500) activeJob.log.shift();  // cap log
        process.stdout.write(`[scraper] ${line}`);
    });
    proc.stderr.on('data', d => {
        const line = d.toString();
        activeJob.log.push(`ERR: ${line}`);
        process.stderr.write(`[scraper:err] ${line}`);
    });
    proc.on('exit', code => {
        if (activeJob) activeJob.exitCode = code;
        console.log(`[scraper] exited with code ${code}`);
        setTimeout(() => { activeJob = null; }, 5 * 60 * 1000);  // clear after 5m
    });

    res.json({
        ok: true,
        message: `Scrape started for: ${systems === 'all' ? 'ALL systems' : systemArgs.join(', ')}`,
        started: activeJob.started,
        roms_dir: CONFIG.ROMS_DIR,
    });
});

// ── DELETE /api/admin/scrape — kill running job ───────────────────────────────
router.delete('/scrape', requireKey, (req, res) => {
    if (!activeJob) return res.status(404).json({ error: 'No active scrape' });
    activeJob.proc.kill('SIGTERM');
    activeJob = null;
    res.json({ ok: true, message: 'Scrape killed' });
});

// ── GET /api/admin/scrape/status — current job status + tail of log ───────────
router.get('/scrape/status', requireKey, (req, res) => {
    if (!activeJob) return res.json({ running: false });
    const tail = activeJob.log.slice(-50);
    res.json({
        running:   activeJob.exitCode === null,
        systems:   activeJob.systems,
        started:   activeJob.started,
        exitCode:  activeJob.exitCode,
        log:       tail,
    });
});

// ── GET /api/admin/scrape/stream — SSE live log ────────────────────────────────
router.get('/scrape/stream', requireKey, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!activeJob) {
        res.write('data: {"error":"No active scrape"}\n\n');
        return res.end();
    }

    // Send buffered log so far
    for (const line of activeJob.log) {
        res.write(`data: ${JSON.stringify({ line })}\n\n`);
    }

    // Pipe future output
    const onData = d => res.write(`data: ${JSON.stringify({ line: d.toString() })}\n\n`);
    activeJob.proc.stdout.on('data', onData);
    activeJob.proc.stderr.on('data', onData);
    activeJob.proc.on('exit', code => {
        res.write(`data: ${JSON.stringify({ done: true, exitCode: code })}\n\n`);
        res.end();
    });

    req.on('close', () => {
        activeJob?.proc?.stdout?.removeListener('data', onData);
        activeJob?.proc?.stderr?.removeListener('data', onData);
    });
});

// ── GET /api/admin/storage — disk info ────────────────────────────────────────
router.get('/storage', requireKey, (req, res) => {
    let diskFree = 0, diskTotal = 0, romsSize = 0;
    try {
        const df = execSync(`df -k "${CONFIG.ROMS_DIR}" 2>/dev/null || df -k /`, { encoding: 'utf8' });
        const parts = df.trim().split('\n').pop().trim().split(/\s+/);
        diskTotal = parseInt(parts[1]) * 1024;
        diskFree  = parseInt(parts[3]) * 1024;
    } catch {}
    try {
        const du = execSync(`du -sk "${CONFIG.ROMS_DIR}" 2>/dev/null || echo 0`, { encoding: 'utf8' });
        romsSize = parseInt(du.trim().split(/\s+/)[0]) * 1024;
    } catch {}

    const gb = n => (n / 1024 / 1024 / 1024).toFixed(1) + ' GB';
    res.json({
        roms_dir:   CONFIG.ROMS_DIR,
        disk_free:  gb(diskFree),
        disk_total: gb(diskTotal),
        roms_size:  gb(romsSize),
        scrape_running: !!activeJob && activeJob.exitCode === null,
    });
});

// ── POST /api/admin/upload — stream a ROM file directly to the volume ─────────
// Usage: curl -X POST ".../api/admin/upload?key=KEY&system=psx&filename=Game.zip"
//             -H "Content-Type: application/octet-stream" --data-binary @Game.zip
router.post('/upload', requireKey, (req, res) => {
    const { system, filename } = req.query;
    if (!system || !filename) {
        return res.status(400).json({ error: 'Missing ?system= and ?filename= params' });
    }

    // Sanitize — prevent path traversal
    const safeSystem   = system.replace(/[^a-z0-9_-]/gi, '');
    const safeFilename = path.basename(filename);
    if (!safeSystem || !safeFilename) {
        return res.status(400).json({ error: 'Invalid system or filename' });
    }

    const destDir  = path.join(CONFIG.ROMS_DIR, safeSystem);
    const destPath = path.join(destDir, safeFilename);

    // Create system dir if needed
    fs.mkdirSync(destDir, { recursive: true });

    const stream = fs.createWriteStream(destPath);
    let bytes = 0;

    req.on('data', chunk => { bytes += chunk.length; });
    req.pipe(stream);

    stream.on('finish', () => {
        console.log(`[upload] ${safeSystem}/${safeFilename} — ${(bytes/1024/1024).toFixed(1)} MB`);
        res.json({ ok: true, path: destPath, bytes });
    });
    stream.on('error', err => {
        console.error(`[upload] error: ${err.message}`);
        res.status(500).json({ error: err.message });
    });
});


export default router;
