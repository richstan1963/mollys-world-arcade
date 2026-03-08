/* Storage Guard — Protects against runaway downloads filling up disk */
import { execSync } from 'child_process';
import path from 'path';
import { CONFIG } from '../config.js';

// ── Limits ──
export const LIMITS = {
    MAX_FILE_SIZE:       500 * 1024 * 1024,   // 500 MB per file
    MAX_TOTAL_ROMS:      20 * 1024 * 1024 * 1024, // 20 GB total ROM storage
    MIN_FREE_DISK:       5 * 1024 * 1024 * 1024,  // 5 GB minimum free disk
    MAX_CONCURRENT_DL:   3,                    // Max simultaneous downloads
    MAX_DL_PER_HOUR:     20,                   // Max downloads per hour
    MAX_DL_PER_DAY:      100,                  // Max downloads per day
};

let activeDownloads = 0;
const dlTimestamps = [];       // Track recent download timestamps

// ── Disk space check (macOS / Linux) ──
export function getFreeDisk(dir = CONFIG.ROMS_DIR) {
    try {
        const out = execSync(`df -k "${dir}" | tail -1`, { encoding: 'utf8' });
        const parts = out.trim().split(/\s+/);
        // df -k columns: Filesystem, 1K-blocks, Used, Available, Use%, Mounted
        const availKB = parseInt(parts[3]);
        return availKB * 1024; // Return bytes
    } catch {
        return Infinity; // Can't check → allow (fail open for local use)
    }
}

// ── Directory size ──
export function getDirSize(dir) {
    try {
        const out = execSync(`du -sk "${dir}" 2>/dev/null | cut -f1`, { encoding: 'utf8' });
        return parseInt(out.trim()) * 1024; // KB → bytes
    } catch {
        return 0;
    }
}

// ── Rate limiter ──
function pruneTimestamps() {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    while (dlTimestamps.length > 0 && now - dlTimestamps[0] > oneDay) {
        dlTimestamps.shift();
    }
}

function getHourlyCount() {
    const oneHour = 60 * 60 * 1000;
    const cutoff = Date.now() - oneHour;
    return dlTimestamps.filter(t => t > cutoff).length;
}

// ── Pre-download validation ──
export function canDownload(fileSize = 0) {
    pruneTimestamps();

    const errors = [];

    // File size check
    if (fileSize > 0 && fileSize > LIMITS.MAX_FILE_SIZE) {
        errors.push(`File too large: ${(fileSize / 1024 / 1024).toFixed(1)}MB exceeds ${LIMITS.MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }

    // Disk space check
    const freeDisk = getFreeDisk();
    if (freeDisk < LIMITS.MIN_FREE_DISK) {
        errors.push(`Low disk space: ${(freeDisk / 1024 / 1024 / 1024).toFixed(1)}GB free, need ${LIMITS.MIN_FREE_DISK / 1024 / 1024 / 1024}GB minimum`);
    }

    // ROM storage quota
    const romsSize = getDirSize(CONFIG.ROMS_DIR);
    if (romsSize > LIMITS.MAX_TOTAL_ROMS) {
        errors.push(`ROM storage full: ${(romsSize / 1024 / 1024 / 1024).toFixed(1)}GB exceeds ${LIMITS.MAX_TOTAL_ROMS / 1024 / 1024 / 1024}GB quota`);
    }

    // Concurrent download limit
    if (activeDownloads >= LIMITS.MAX_CONCURRENT_DL) {
        errors.push(`Too many active downloads (${activeDownloads}/${LIMITS.MAX_CONCURRENT_DL})`);
    }

    // Hourly rate limit
    if (getHourlyCount() >= LIMITS.MAX_DL_PER_HOUR) {
        errors.push(`Hourly download limit reached (${LIMITS.MAX_DL_PER_HOUR}/hr)`);
    }

    // Daily rate limit
    if (dlTimestamps.length >= LIMITS.MAX_DL_PER_DAY) {
        errors.push(`Daily download limit reached (${LIMITS.MAX_DL_PER_DAY}/day)`);
    }

    return { allowed: errors.length === 0, errors };
}

// ── Tracking helpers ──
export function trackDownloadStart() {
    activeDownloads++;
    dlTimestamps.push(Date.now());
}

export function trackDownloadEnd() {
    activeDownloads = Math.max(0, activeDownloads - 1);
}

// ── Express middleware for download routes ──
export function downloadGuard(req, res, next) {
    const check = canDownload();
    if (!check.allowed) {
        return res.status(429).json({
            error: 'Download blocked by storage guard',
            reasons: check.errors,
        });
    }
    next();
}

// ── Status endpoint data ──
export function getStorageStatus() {
    pruneTimestamps();
    const freeDisk = getFreeDisk();
    const romsSize = getDirSize(CONFIG.ROMS_DIR);
    const artworkSize = getDirSize(CONFIG.ARTWORK_DIR);

    return {
        disk_free_gb: (freeDisk / 1024 / 1024 / 1024).toFixed(1),
        roms_size_gb: (romsSize / 1024 / 1024 / 1024).toFixed(1),
        roms_quota_gb: (LIMITS.MAX_TOTAL_ROMS / 1024 / 1024 / 1024).toFixed(0),
        roms_usage_pct: ((romsSize / LIMITS.MAX_TOTAL_ROMS) * 100).toFixed(1),
        artwork_size_mb: (artworkSize / 1024 / 1024).toFixed(1),
        active_downloads: activeDownloads,
        downloads_this_hour: getHourlyCount(),
        downloads_today: dlTimestamps.length,
        limits: {
            max_file_mb: LIMITS.MAX_FILE_SIZE / 1024 / 1024,
            max_roms_gb: LIMITS.MAX_TOTAL_ROMS / 1024 / 1024 / 1024,
            min_free_disk_gb: LIMITS.MIN_FREE_DISK / 1024 / 1024 / 1024,
            max_concurrent: LIMITS.MAX_CONCURRENT_DL,
            max_per_hour: LIMITS.MAX_DL_PER_HOUR,
            max_per_day: LIMITS.MAX_DL_PER_DAY,
        },
    };
}
