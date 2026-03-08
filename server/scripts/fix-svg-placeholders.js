#!/usr/bin/env node
/**
 * FIX SVG PLACEHOLDERS → Real PNGs
 * The SVG placeholders use emojis which crash Sharp's Pango renderer.
 * Solution: Strip emojis from SVGs before converting, or regenerate
 * simpler SVGs that work with Sharp.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const ARTWORK_DIR = path.join(ROOT, 'artwork');

const SYSTEM_COLORS = {
    'nes': '#CE1124', 'snes': '#7B2D8E', 'n64': '#009E60', 'gb': '#8BA858',
    'gbc': '#6638B6', 'gba': '#4A00A0', 'nds': '#BFBFBF', 'genesis': '#171717',
    'sms': '#0066CC', 'gamegear': '#222222', 'saturn': '#003DA5', '32x': '#333333',
    'psx': '#00439C', 'psp': '#003087', 'atari2600': '#D35400', 'atari7800': '#E67E22',
    'jaguar': '#CC0000', 'lynx': '#555555', 'tg16': '#FF6600', 'neogeo': '#D4A017',
    'ngp': '#003399', 'arcade': '#FFD700', 'fbneo': '#FF4444', 'wonderswan': '#2196F3',
    'vb': '#CC0000', '3do': '#C0392B', 'coleco': '#2C3E50', 'dos': '#1ABC9C',
};

const SYSTEM_SHORT = {
    'nes': 'NES', 'snes': 'SNES', 'n64': 'N64', 'gb': 'GB', 'gbc': 'GBC',
    'gba': 'GBA', 'nds': 'NDS', 'genesis': 'Genesis', 'sms': 'SMS', 'gamegear': 'GG',
    'saturn': 'Saturn', '32x': '32X', 'psx': 'PS1', 'psp': 'PSP', 'atari2600': '2600',
    'atari7800': '7800', 'jaguar': 'Jaguar', 'lynx': 'Lynx', 'tg16': 'TG16',
    'neogeo': 'Neo Geo', 'ngp': 'NGP', 'arcade': 'Arcade', 'fbneo': 'FBNeo',
    'wonderswan': 'WS', 'vb': 'VB', '3do': '3DO', 'coleco': 'Coleco', 'dos': 'DOS',
};

function escXml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * Generate a clean SVG without emojis — uses simple shapes instead
 */
function generateCleanSVG(gameName, systemId) {
    const color = SYSTEM_COLORS[systemId] || '#666';
    const sysLabel = SYSTEM_SHORT[systemId] || systemId.toUpperCase();

    // Color math for gradient
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const darker = `rgb(${Math.max(0, r - 50)},${Math.max(0, g - 50)},${Math.max(0, b - 50)})`;
    const lighter = `rgb(${Math.min(255, r + 80)},${Math.min(255, g + 80)},${Math.min(255, b + 80)})`;

    // Truncate name
    let displayName = gameName;
    if (displayName.length > 28) displayName = displayName.substring(0, 26) + '...';

    // Split long names
    let line1 = displayName;
    let line2 = '';
    if (displayName.length > 16) {
        const mid = Math.floor(displayName.length / 2);
        const spaceIdx = displayName.lastIndexOf(' ', mid + 4);
        if (spaceIdx > 4) {
            line1 = displayName.substring(0, spaceIdx);
            line2 = displayName.substring(spaceIdx + 1);
        }
    }

    const titleY = line2 ? '138' : '148';
    const line2Tag = line2
        ? `<text x="160" y="162" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="bold" fill="white" text-anchor="middle" opacity="0.95">${escXml(line2)}</text>`
        : '';

    return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${darker}"/>
      <stop offset="100%" style="stop-color:${color}"/>
    </linearGradient>
  </defs>
  <rect width="320" height="240" fill="url(#bg)" rx="8"/>
  <!-- Decorative grid -->
  <g opacity="0.06">
    <line x1="0" y1="60" x2="320" y2="60" stroke="white" stroke-width="1"/>
    <line x1="0" y1="120" x2="320" y2="120" stroke="white" stroke-width="1"/>
    <line x1="0" y1="180" x2="320" y2="180" stroke="white" stroke-width="1"/>
    <line x1="80" y1="0" x2="80" y2="240" stroke="white" stroke-width="1"/>
    <line x1="160" y1="0" x2="160" y2="240" stroke="white" stroke-width="1"/>
    <line x1="240" y1="0" x2="240" y2="240" stroke="white" stroke-width="1"/>
  </g>
  <!-- Diamond decoration (replaces emoji) -->
  <g transform="translate(160,85)" opacity="0.8">
    <polygon points="0,-25 20,0 0,25 -20,0" fill="none" stroke="${lighter}" stroke-width="2"/>
    <polygon points="0,-15 12,0 0,15 -12,0" fill="${lighter}" opacity="0.3"/>
    <circle cx="0" cy="0" r="4" fill="${lighter}"/>
  </g>
  <!-- System badge -->
  <rect x="10" y="10" width="${sysLabel.length * 9 + 20}" height="24" fill="black" fill-opacity="0.4" rx="12"/>
  <text x="${sysLabel.length * 4.5 + 20}" y="27" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="bold" fill="${lighter}" text-anchor="middle">${escXml(sysLabel)}</text>
  <!-- Game title -->
  <text x="160" y="${titleY}" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="bold" fill="white" text-anchor="middle">${escXml(line1)}</text>
  ${line2Tag}
  <!-- Bottom accent -->
  <rect x="80" y="195" width="160" height="2" fill="${lighter}" opacity="0.4" rx="1"/>
  <text x="160" y="222" font-family="Arial,Helvetica,sans-serif" font-size="10" fill="white" text-anchor="middle" opacity="0.4">MOLLY'S ARCADE</text>
</svg>`;
}

async function main() {
    console.log('🎨 Converting SVG placeholders to real PNG images...\n');

    let svgCount = 0;
    let converted = 0;
    let failed = 0;

    const artworkSystems = fs.readdirSync(ARTWORK_DIR).filter(d => {
        const p = path.join(ARTWORK_DIR, d);
        return fs.statSync(p).isDirectory();
    });

    for (const sysDir of artworkSystems) {
        const sysPath = path.join(ARTWORK_DIR, sysDir);
        const files = fs.readdirSync(sysPath).filter(f => f.endsWith('.png'));
        let sysConverted = 0;

        for (const file of files) {
            const filePath = path.join(sysPath, file);
            const stat = fs.statSync(filePath);
            if (stat.size > 50000) continue; // Real PNGs are larger

            // Check if it's actually SVG content
            let content;
            try {
                content = fs.readFileSync(filePath, 'utf8').substring(0, 200);
            } catch { continue; }

            if (!content.includes('<svg') && !content.includes('<?xml')) continue;

            svgCount++;

            try {
                // Get game name from filename
                const gameName = file.replace(/\.png$/i, '');

                // Regenerate a CLEAN SVG (no emojis — Sharp-compatible)
                const cleanSvg = generateCleanSVG(gameName, sysDir);

                // Convert to PNG using sharp
                const pngBuffer = await sharp(Buffer.from(cleanSvg))
                    .resize(320, 240)
                    .png({ quality: 90 })
                    .toBuffer();

                fs.writeFileSync(filePath, pngBuffer);
                converted++;
                sysConverted++;
            } catch (err) {
                console.error(`  ❌ ${sysDir}/${file}: ${err.message}`);
                failed++;
            }
        }

        if (sysConverted > 0) {
            console.log(`  ✅ ${sysDir}: ${sysConverted} converted`);
        }
    }

    console.log(`\n${'═'.repeat(40)}`);
    console.log(`  SVG files found:  ${svgCount}`);
    console.log(`  Converted to PNG: ${converted}`);
    if (failed > 0) console.log(`  Failed:           ${failed}`);
    console.log('═'.repeat(40));

    // Verify
    let remaining = 0;
    for (const sysDir of artworkSystems) {
        const sysPath = path.join(ARTWORK_DIR, sysDir);
        for (const file of fs.readdirSync(sysPath).filter(f => f.endsWith('.png'))) {
            const filePath = path.join(sysPath, file);
            if (fs.statSync(filePath).size < 50000) {
                try {
                    const head = fs.readFileSync(filePath, 'utf8').substring(0, 100);
                    if (head.includes('<svg')) remaining++;
                } catch {}
            }
        }
    }

    if (remaining > 0) {
        console.log(`\n  ⚠️  ${remaining} SVG files remain unconverted`);
    } else {
        console.log(`\n  ✅ All artwork files are now real PNGs!`);
    }
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
