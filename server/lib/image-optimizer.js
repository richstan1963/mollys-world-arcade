/**
 * Image Optimizer — WebP conversion pipeline using sharp
 * Converts artwork images to WebP with thumbnail + full-size variants
 */
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { CONFIG } from '../config.js';

const THUMB_WIDTH = 200;
const FULL_WIDTH = 800;

/**
 * Convert a single image to WebP at two sizes
 * @param {string} srcPath — source image path (PNG, JPG, etc.)
 * @param {string} destDir — output directory
 * @returns {{ thumb: string, full: string }} paths to generated WebP files
 */
export async function optimizeImage(srcPath, destDir) {
    const basename = path.basename(srcPath, path.extname(srcPath));
    const thumbPath = path.join(destDir, `${basename}_thumb.webp`);
    const fullPath = path.join(destDir, `${basename}_full.webp`);

    fs.mkdirSync(destDir, { recursive: true });

    const img = sharp(srcPath);
    const meta = await img.metadata();

    // Generate thumbnail (200px wide)
    await sharp(srcPath)
        .resize(THUMB_WIDTH, null, { withoutEnlargement: true })
        .webp({ quality: 75 })
        .toFile(thumbPath);

    // Generate full-size (800px wide, or original if smaller)
    const fullW = Math.min(FULL_WIDTH, meta.width || FULL_WIDTH);
    await sharp(srcPath)
        .resize(fullW, null, { withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(fullPath);

    return { thumb: thumbPath, full: fullPath };
}

/**
 * Batch-optimize all images in a directory
 * @param {string} srcDir — source directory with images
 * @param {string} destDir — output directory for WebP files
 * @returns {object} progress stats
 */
const batchProgress = { running: false, total: 0, done: 0, errors: 0, current: null };

export function getOptimizeProgress() {
    return { ...batchProgress };
}

export async function batchOptimize(srcDir, destDir) {
    if (batchProgress.running) return { error: 'Already running' };

    const extensions = ['.png', '.jpg', '.jpeg', '.bmp', '.tiff'];
    const files = [];

    // Recursively find image files
    function walk(dir) {
        try {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(full);
                else if (extensions.includes(path.extname(entry.name).toLowerCase())) {
                    files.push(full);
                }
            }
        } catch { /* skip inaccessible dirs */ }
    }
    walk(srcDir);

    batchProgress.running = true;
    batchProgress.total = files.length;
    batchProgress.done = 0;
    batchProgress.errors = 0;

    for (const file of files) {
        batchProgress.current = path.basename(file);
        try {
            // Mirror directory structure in dest
            const relDir = path.dirname(path.relative(srcDir, file));
            await optimizeImage(file, path.join(destDir, relDir));
            batchProgress.done++;
        } catch (err) {
            batchProgress.errors++;
            console.error(`[IMG-OPT] Failed: ${file}`, err.message);
        }
    }

    batchProgress.running = false;
    batchProgress.current = null;
    return { total: batchProgress.total, done: batchProgress.done, errors: batchProgress.errors };
}
