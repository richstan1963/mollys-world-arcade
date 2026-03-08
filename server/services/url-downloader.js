import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { CONFIG } from '../config.js';
import { LIMITS, canDownload, trackDownloadStart, trackDownloadEnd } from '../middleware/storage-guard.js';

export async function downloadUrl(db, downloadId, url, systemId, filename) {
    // Pre-flight storage check
    const check = canDownload();
    if (!check.allowed) {
        db.prepare("UPDATE downloads SET status = 'error', error_message = ? WHERE id = ?")
            .run(check.errors.join('; '), downloadId);
        throw new Error(`Storage guard blocked: ${check.errors.join('; ')}`);
    }

    const destDir = path.join(CONFIG.ROMS_DIR, systemId || 'unsorted');
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const fname = filename || decodeURIComponent(url.split('/').pop().split('?')[0]);
    const destPath = path.join(destDir, fname);

    trackDownloadStart();
    try {
        await streamDownload(url, destPath, (progress) => {
            db.prepare('UPDATE downloads SET progress = ? WHERE id = ?').run(progress, downloadId);
        });

        db.prepare(`
            UPDATE downloads SET status = 'complete', progress = 1, completed_at = datetime('now')
            WHERE id = ?
        `).run(downloadId);

        return { ok: true, path: destPath };
    } catch (err) {
        db.prepare(`
            UPDATE downloads SET status = 'error', error_message = ? WHERE id = ?
        `).run(err.message, downloadId);
        // Clean up partial file
        try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch {}
        throw err;
    } finally {
        trackDownloadEnd();
    }
}

function streamDownload(url, dest, onProgress) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http;
        proto.get(url, { headers: { 'User-Agent': 'MollysWorldArcade/1.0' } }, (res) => {
            // Follow redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                const location = res.headers.location;
                res.resume();
                streamDownload(location, dest, onProgress).then(resolve).catch(reject);
                return;
            }

            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            // Check Content-Length before downloading
            const totalSize = parseInt(res.headers['content-length'] || '0');
            if (totalSize > LIMITS.MAX_FILE_SIZE) {
                res.destroy();
                reject(new Error(`File too large: ${(totalSize / 1024 / 1024).toFixed(1)}MB exceeds ${LIMITS.MAX_FILE_SIZE / 1024 / 1024}MB limit`));
                return;
            }

            let downloaded = 0;
            const file = fs.createWriteStream(dest);

            res.on('data', chunk => {
                downloaded += chunk.length;

                // Enforce limit even if Content-Length was missing/wrong
                if (downloaded > LIMITS.MAX_FILE_SIZE) {
                    res.destroy();
                    file.close();
                    try { fs.unlinkSync(dest); } catch {}
                    reject(new Error(`Download exceeded ${LIMITS.MAX_FILE_SIZE / 1024 / 1024}MB limit (aborted)`));
                    return;
                }

                if (totalSize > 0 && downloaded % (64 * 1024) < chunk.length) {
                    onProgress(downloaded / totalSize);
                }
            });

            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
            file.on('error', err => {
                try { fs.unlinkSync(dest); } catch {}
                reject(err);
            });
        }).on('error', reject);
    });
}
