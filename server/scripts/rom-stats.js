#!/usr/bin/env node
/**
 * Molly's World Arcade — ROM Stats
 *
 * Counts ROMs per system directory and shows coverage vs curated targets.
 *
 * Usage:
 *   node server/scripts/rom-stats.js
 *   node server/scripts/rom-stats.js --detail nes
 *   node server/scripts/rom-stats.js --size
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ROMS_DIR = path.join(ROOT, 'roms');

const args = process.argv.slice(2);
const SHOW_SIZE = args.includes('--size');
const DETAIL_SYSTEM = args.includes('--detail') ? args[args.indexOf('--detail') + 1] : null;

// System definitions (matches config.js)
const SYSTEMS = {
    nes:        { name: 'NES',                 target: 100, extensions: ['.nes', '.zip'] },
    snes:       { name: 'SNES',                target: 100, extensions: ['.sfc', '.smc', '.zip'] },
    genesis:    { name: 'Genesis',             target: 100, extensions: ['.md', '.gen', '.smd', '.bin', '.zip'] },
    n64:        { name: 'N64',                 target: 100, extensions: ['.z64', '.n64', '.v64', '.zip'] },
    gba:        { name: 'GBA',                 target: 100, extensions: ['.gba', '.zip'] },
    gb:         { name: 'Game Boy',            target: 100, extensions: ['.gb', '.zip'] },
    gbc:        { name: 'GBC',                 target: 80,  extensions: ['.gbc', '.zip'] },
    nds:        { name: 'Nintendo DS',         target: 100, extensions: ['.nds', '.zip'] },
    sms:        { name: 'Master System',       target: 80,  extensions: ['.sms', '.zip'] },
    gamegear:   { name: 'Game Gear',           target: 50,  extensions: ['.gg', '.zip'] },
    psx:        { name: 'PlayStation',         target: 80,  extensions: ['.bin', '.cue', '.chd', '.pbp', '.iso', '.zip'] },
    psp:        { name: 'PSP',                 target: 50,  extensions: ['.iso', '.cso', '.pbp', '.zip'] },
    tg16:       { name: 'TurboGrafx-16',       target: 60,  extensions: ['.pce', '.zip'] },
    atari2600:  { name: 'Atari 2600',          target: 100, extensions: ['.a26', '.zip'] },
    atari7800:  { name: 'Atari 7800',          target: 50,  extensions: ['.a78', '.zip'] },
    neogeo:     { name: 'Neo Geo',             target: 100, extensions: ['.zip'] },
    arcade:     { name: 'Arcade (MAME)',       target: 200, extensions: ['.zip'] },
    fbneo:      { name: 'Arcade (FBNeo)',      target: 20,  extensions: ['.zip'] },
    '32x':      { name: 'Sega 32X',           target: 40,  extensions: ['.32x', '.zip'] },
    lynx:       { name: 'Atari Lynx',          target: 30,  extensions: ['.lnx', '.zip'] },
    wonderswan: { name: 'WonderSwan',          target: 25,  extensions: ['.ws', '.wsc', '.zip'] },
    ngp:        { name: 'Neo Geo Pocket',      target: 25,  extensions: ['.ngp', '.ngc', '.zip'] },
    vb:         { name: 'Virtual Boy',         target: 22,  extensions: ['.vb', '.vboy', '.zip'] },
    jaguar:     { name: 'Atari Jaguar',        target: 20,  extensions: ['.j64', '.jag', '.zip'] },
    coleco:     { name: 'ColecoVision',        target: 40,  extensions: ['.col', '.rom', '.zip'] },
    saturn:     { name: 'Sega Saturn',         target: 30,  extensions: ['.cue', '.iso', '.chd', '.zip'] },
    '3do':      { name: '3DO',                 target: 20,  extensions: ['.iso', '.cue', '.chd', '.zip'] },
    dos:        { name: 'DOS',                 target: 20,  extensions: ['.zip', '.dosz'] },
};

function getDirectorySize(dirPath) {
    let totalSize = 0;
    try {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stat = fs.statSync(filePath);
            if (stat.isFile()) totalSize += stat.size;
        }
    } catch {}
    return totalSize;
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + 'KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + 'GB';
}

function progressBar(current, target, width = 20) {
    const pct = Math.min(current / target, 1);
    const filled = Math.round(pct * width);
    const empty = width - filled;
    const bar = '#'.repeat(filled) + '-'.repeat(empty);
    return `[${bar}]`;
}

function statusLabel(count, target) {
    const pct = count / target;
    if (pct >= 1.0) return 'FULL';
    if (pct >= 0.75) return 'GOOD';
    if (pct >= 0.5) return ' OK ';
    if (pct >= 0.25) return 'LOW ';
    if (count > 0)   return 'NEED';
    return 'NONE';
}

// ─── Detail Mode ─────────────────────────────────────────────────────────────

function showDetail(systemId) {
    const sys = SYSTEMS[systemId];
    if (!sys) {
        console.log(`Unknown system: ${systemId}`);
        return;
    }

    const romDir = path.join(ROMS_DIR, systemId);
    if (!fs.existsSync(romDir)) {
        console.log(`No ROM directory for ${systemId}`);
        return;
    }

    const files = fs.readdirSync(romDir)
        .filter(f => !f.startsWith('.'))
        .sort();

    console.log(`\n${sys.name} (${systemId}) — ${files.length} files\n`);

    for (const file of files) {
        const filePath = path.join(romDir, file);
        const stat = fs.statSync(filePath);
        const size = formatSize(stat.size);
        console.log(`  ${file.padEnd(60)} ${size.padStart(8)}`);
    }

    const totalSize = getDirectorySize(romDir);
    console.log(`\n  Total: ${files.length} files, ${formatSize(totalSize)}`);
    console.log(`  Target: ${sys.target} | Coverage: ${Math.round((files.length / sys.target) * 100)}%`);
    console.log('');
}

// ─── Main Summary ────────────────────────────────────────────────────────────

function showSummary() {
    console.log('');
    console.log('================================================');
    console.log("  Molly's World Arcade - ROM Coverage Report");
    console.log('================================================');
    console.log('');

    const header = SHOW_SIZE
        ? `${'System'.padEnd(22)} ${'Count'.padStart(5)} / ${'Goal'.padStart(4)}  ${'Pct'.padStart(4)}  ${'Status'.padStart(4)}  ${'Size'.padStart(8)}  Progress`
        : `${'System'.padEnd(22)} ${'Count'.padStart(5)} / ${'Goal'.padStart(4)}  ${'Pct'.padStart(4)}  ${'Status'.padStart(4)}  Progress`;
    console.log(`  ${header}`);
    console.log(`  ${'─'.repeat(header.length)}`);

    let totalROMs = 0;
    let totalTarget = 0;
    let totalSize = 0;
    let fullCount = 0;
    let emptyCount = 0;

    const rows = [];

    for (const [id, sys] of Object.entries(SYSTEMS)) {
        const romDir = path.join(ROMS_DIR, id);
        let count = 0;
        let size = 0;

        if (fs.existsSync(romDir)) {
            const files = fs.readdirSync(romDir).filter(f => !f.startsWith('.'));
            count = files.length;
            if (SHOW_SIZE) size = getDirectorySize(romDir);
        }

        totalROMs += count;
        totalTarget += sys.target;
        totalSize += size;
        if (count >= sys.target) fullCount++;
        if (count === 0) emptyCount++;

        rows.push({ id, name: sys.name, count, target: sys.target, size });
    }

    // Sort by count descending
    rows.sort((a, b) => b.count - a.count);

    for (const row of rows) {
        const pct = Math.round((row.count / row.target) * 100);
        const status = statusLabel(row.count, row.target);
        const bar = progressBar(row.count, row.target);

        if (SHOW_SIZE) {
            console.log(`  ${row.name.padEnd(22)} ${String(row.count).padStart(5)} / ${String(row.target).padStart(4)}  ${(pct + '%').padStart(4)}  ${status}  ${formatSize(row.size).padStart(8)}  ${bar}`);
        } else {
            console.log(`  ${row.name.padEnd(22)} ${String(row.count).padStart(5)} / ${String(row.target).padStart(4)}  ${(pct + '%').padStart(4)}  ${status}  ${bar}`);
        }
    }

    console.log(`  ${'─'.repeat(header.length)}`);

    const overallPct = Math.round((totalROMs / totalTarget) * 100);

    console.log('');
    console.log(`  Total ROMs:     ${totalROMs.toLocaleString()}`);
    console.log(`  Total Target:   ${totalTarget.toLocaleString()}`);
    console.log(`  Coverage:       ${overallPct}%`);
    console.log(`  Systems full:   ${fullCount} / ${Object.keys(SYSTEMS).length}`);
    console.log(`  Systems empty:  ${emptyCount}`);
    if (SHOW_SIZE) {
        console.log(`  Total size:     ${formatSize(totalSize)}`);
    }
    console.log('');

    // Show priority needs
    const needs = rows
        .filter(r => r.count < r.target)
        .sort((a, b) => (a.count / a.target) - (b.count / b.target))
        .slice(0, 10);

    if (needs.length > 0) {
        console.log('  Priority systems needing ROMs:');
        for (const n of needs) {
            const deficit = n.target - n.count;
            console.log(`    ${n.name.padEnd(22)} needs ${deficit} more (have ${n.count} of ${n.target})`);
        }
        console.log('');
        console.log('  Run: node server/scripts/download-roms.js --system <id>');
        console.log('');
    }
}

// ─── Entry ───────────────────────────────────────────────────────────────────

if (DETAIL_SYSTEM) {
    showDetail(DETAIL_SYSTEM);
} else {
    showSummary();
}
