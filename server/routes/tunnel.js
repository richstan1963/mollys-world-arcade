/**
 * Tunnel route — reads cloudflared log to expose current public URL
 * GET /api/tunnel  → { url, running, type, started }
 */
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH  = path.join(__dirname, '..', '..', 'logs', 'tunnel.log');

const router = Router();

router.get('/', (req, res) => {
    let url     = null;
    let running = false;
    let type    = null;
    let logSize = 0;

    try {
        const log = fs.readFileSync(LOG_PATH, 'utf8');
        logSize   = log.length;

        // Quick tunnel (no login) → *.trycloudflare.com  (take LAST = most recent session)
        const allQuick = [...log.matchAll(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g)];
        if (allQuick.length) { url = allQuick.at(-1)[0]; type = 'quick'; running = true; }

        // Named tunnel (logged-in account) → *.cfargotunnel.com or custom domain
        const allNamed = [...log.matchAll(/https:\/\/[a-zA-Z0-9._-]+\.cfargotunnel\.com/g)];
        if (allNamed.length && !url) { url = allNamed.at(-1)[0]; type = 'named'; running = true; }

        // Custom domain via named tunnel (user-configured hostname)
        const custom = log.match(/https:\/\/(?!.*trycloudflare|.*cfargotunnel)[a-zA-Z0-9._-]+\.[a-z]{2,}/);
        if (custom && !url) { url = custom[0]; type = 'custom'; running = true; }

        // Detect if tunnel is actively connected (recent "connection registered" line)
        if (!running && log.includes('Connection registered')) running = true;

    } catch { /* log file doesn't exist yet — tunnel not started */ }

    res.json({ url, running, type, log_size: logSize });
});

export default router;
