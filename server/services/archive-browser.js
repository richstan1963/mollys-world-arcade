import https from 'https';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';
import { LIMITS, canDownload, trackDownloadStart, trackDownloadEnd } from '../middleware/storage-guard.js';

export async function searchArchive(query, page = 1) {
    const rows = 25;
    const url = `${CONFIG.ARCHIVE_ORG_API}?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=description&fl[]=downloads&rows=${rows}&page=${page}&output=json`;

    const data = await fetchJSON(url);

    return {
        results: (data.response?.docs || []).map(doc => ({
            identifier: doc.identifier,
            title: doc.title,
            description: doc.description?.substring(0, 200) || '',
            downloads: doc.downloads || 0,
        })),
        total: data.response?.numFound || 0,
        page,
    };
}

export async function getArchiveFiles(identifier) {
    const url = `https://archive.org/metadata/${identifier}/files`;
    const data = await fetchJSON(url);

    const romExtensions = new Set([
        '.nes', '.sfc', '.smc', '.z64', '.n64', '.v64', '.gb', '.gbc', '.gba',
        '.nds', '.md', '.gen', '.smd', '.sms', '.gg', '.pce', '.zip', '.7z',
        '.iso', '.cue', '.bin', '.chd', '.a26', '.a78', '.lnx', '.ngp',
        '.ws', '.wsc', '.col', '.rom', '.j64', '.jag',
    ]);

    const files = (data.result || [])
        .filter(f => {
            const ext = path.extname(f.name || '').toLowerCase();
            return romExtensions.has(ext) || ext === '.zip' || ext === '.7z';
        })
        .map(f => ({
            name: f.name,
            size: parseInt(f.size) || 0,
            format: f.format || path.extname(f.name || ''),
            // Flag files over the limit so frontend can warn
            over_limit: (parseInt(f.size) || 0) > LIMITS.MAX_FILE_SIZE,
        }));

    return { identifier, files, max_file_size_mb: LIMITS.MAX_FILE_SIZE / 1024 / 1024 };
}

export async function downloadArchiveFile(db, identifier, filename, systemId) {
    // Pre-flight storage check
    const check = canDownload();
    if (!check.allowed) {
        throw new Error(`Storage guard blocked: ${check.errors.join('; ')}`);
    }

    const url = `https://archive.org/download/${identifier}/${encodeURIComponent(filename)}`;
    const destDir = path.join(CONFIG.ROMS_DIR, systemId || 'unsorted');
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, filename);

    if (fs.existsSync(destPath)) {
        return { ok: true, message: 'Already downloaded', path: destPath };
    }

    // Track download
    const insert = db.prepare(`
        INSERT INTO downloads (url, filename, system_id, status, source)
        VALUES (?, ?, ?, 'downloading', 'archive')
    `);
    const info = insert.run(url, filename, systemId);
    const dlId = info.lastInsertRowid;

    trackDownloadStart();
    try {
        await downloadLargeFile(url, destPath, (progress) => {
            db.prepare('UPDATE downloads SET progress = ? WHERE id = ?').run(progress, dlId);
        });
        db.prepare("UPDATE downloads SET status = 'complete', progress = 1, completed_at = datetime('now') WHERE id = ?").run(dlId);
        return { ok: true, path: destPath, download_id: dlId };
    } catch (err) {
        db.prepare("UPDATE downloads SET status = 'error', error_message = ? WHERE id = ?").run(err.message, dlId);
        // Clean up partial file
        try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch {}
        throw err;
    } finally {
        trackDownloadEnd();
    }
}

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'MollysWorldArcade/1.0' } }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function downloadLargeFile(url, dest, onProgress) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'MollysWorldArcade/1.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                downloadLargeFile(res.headers.location, dest, onProgress).then(resolve).catch(reject);
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
                // Hard abort if exceeded (even without Content-Length)
                if (downloaded > LIMITS.MAX_FILE_SIZE) {
                    res.destroy();
                    file.close();
                    try { fs.unlinkSync(dest); } catch {}
                    reject(new Error(`Download exceeded ${LIMITS.MAX_FILE_SIZE / 1024 / 1024}MB limit (aborted)`));
                    return;
                }
                if (totalSize > 0) {
                    onProgress(downloaded / totalSize);
                }
            });

            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
            file.on('error', (err) => {
                try { fs.unlinkSync(dest); } catch {}
                reject(err);
            });
        }).on('error', reject);
    });
}
