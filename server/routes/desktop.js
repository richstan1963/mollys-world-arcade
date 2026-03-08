// desktop.js — Desktop Mode API
// Provides launch URLs and status checks for native emulator integration.
import { Router } from 'express';
import { getDB } from '../db.js';
import { NATIVE_CORES } from '../config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const router = Router();

// Native system metadata — emulator name, tag, quality spec
const NATIVE_SYSTEMS = {
    psx:       { emulator: 'DuckStation', emuKey: 'duckstation', quality: '4K/60fps', tag: 'PS1'  },
    ps2:       { emulator: 'PCSX2',       emuKey: 'pcsx2',       quality: '4K/60fps', tag: 'PS2'  },
    gamecube:  { emulator: 'Dolphin',     emuKey: 'dolphin',     quality: '4K/60fps', tag: 'GCN'  },
    wii:       { emulator: 'Dolphin',     emuKey: 'dolphin',     quality: '4K/60fps', tag: 'Wii'  },
    wiiu:      { emulator: 'Cemu',        emuKey: 'cemu',        quality: '4K/60fps', tag: 'WiiU' },
    dreamcast: { emulator: 'Flycast',     emuKey: 'flycast',     quality: '4K/60fps', tag: 'DC'   },
    xbox:      { emulator: 'Xemu',        emuKey: 'xemu',        quality: '4K/60fps', tag: 'Xbox' },
};

// GET /api/desktop/status
// Returns launcher install state + per-emulator availability
router.get('/status', (req, res) => {
    const configPath = path.join(os.homedir(), '.ywa', 'emulator-paths.json');
    let userPaths = {};

    try { userPaths = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}

    const defaults = {
        duckstation: '/Applications/DuckStation.app/Contents/MacOS/DuckStation',
        pcsx2:       '/Applications/PCSX2.app/Contents/MacOS/PCSX2',
        dolphin:     '/Applications/Dolphin.app/Contents/MacOS/Dolphin',
        cemu:        '/Applications/Cemu.app/Contents/MacOS/Cemu',
        flycast:     '/Applications/Flycast.app/Contents/MacOS/Flycast',
        xemu:        '/Applications/Xemu.app/Contents/MacOS/xemu',
    };

    const emulators = {};
    for (const [key, defPath] of Object.entries(defaults)) {
        const p = userPaths[key] || defPath;
        emulators[key] = {
            path:      p,
            installed: fs.existsSync(p),
            default:   !userPaths[key],
        };
    }

    const launcherConfigExists = fs.existsSync(configPath);
    const anyInstalled = Object.values(emulators).some(e => e.installed);

    res.json({
        launcherInstalled: launcherConfigExists,
        anyEmulatorFound:  anyInstalled,
        configPath,
        emulators,
        nativeSystems: NATIVE_SYSTEMS,
    });
});

// GET /api/desktop/launch-url/:romId
// Returns arcade:// deep link + emulator metadata for a given ROM
router.get('/launch-url/:romId', (req, res) => {
    const db = getDB();
    const rom = db.prepare(`
        SELECT r.id, r.filename, r.clean_name, r.system_id,
               m.title,
               s.emulatorjs_core AS core, s.name AS system_name, s.color
        FROM roms r
        LEFT JOIN metadata m ON m.rom_id = r.id
        LEFT JOIN systems  s ON s.id     = r.system_id
        WHERE r.id = ?
    `).get(req.params.romId);

    if (!rom) return res.status(404).json({ error: 'ROM not found' });
    // Allow native launch if system is in NATIVE_SYSTEMS (even if EmulatorJS core set for browser play)
    const nativeInfo = NATIVE_SYSTEMS[rom.system_id] || {};
    if (!NATIVE_SYSTEMS[rom.system_id] && !NATIVE_CORES.has(rom.core)) {
        return res.status(400).json({ error: 'Not a native-launch system', core: rom.core });
    }
    const proto  = req.headers['x-forwarded-proto'] || req.protocol;
    const host   = req.headers['x-forwarded-host']  || req.get('host');
    const server = `${proto}://${host}`;

    const params = new URLSearchParams({
        system: rom.system_id,
        romId:  String(rom.id),
        server,
        title:  rom.title || rom.clean_name || rom.filename,
    });

    res.json({
        launchUrl:  `arcade://launch?${params}`,
        system:     rom.system_id,
        systemName: rom.system_name,
        romId:      rom.id,
        title:      rom.title || rom.clean_name || rom.filename,
        emulator:   nativeInfo.emulator || 'Native',
        quality:    nativeInfo.quality  || '4K/60fps',
        color:      rom.color,
    });
});

// GET /api/desktop/test-all
// One-shot health check for every native system:
// emulator installed? ROM exists? launch URL generated?
router.get('/test-all', (req, res) => {
    const db = getDB();
    const configPath = path.join(os.homedir(), '.ywa', 'emulator-paths.json');
    let userPaths = {};
    try { userPaths = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}

    const defaults = {
        duckstation: '/Applications/DuckStation.app/Contents/MacOS/DuckStation',
        pcsx2:       '/Applications/PCSX2.app/Contents/MacOS/PCSX2',
        dolphin:     '/Applications/Dolphin.app/Contents/MacOS/Dolphin',
        cemu:        '/Applications/Cemu.app/Contents/MacOS/Cemu',
        flycast:     '/Applications/Flycast.app/Contents/MacOS/Flycast',
        xemu:        '/Applications/Xemu.app/Contents/MacOS/xemu',
    };

    const proto  = req.headers['x-forwarded-proto'] || req.protocol;
    const host   = req.headers['x-forwarded-host']  || req.get('host');
    const server = `${proto}://${host}`;

    const results = [];

    for (const [systemId, info] of Object.entries(NATIVE_SYSTEMS)) {
        const emuPath = userPaths[info.emuKey] || defaults[info.emuKey] || null;
        const emuInstalled = emuPath ? fs.existsSync(emuPath) : false;

        // Pick one ROM for this system (prefer one with artwork)
        const rom = db.prepare(`
            SELECT r.id, r.clean_name, r.filename, s.name AS system_name, m.artwork_path
            FROM roms r
            LEFT JOIN metadata m ON m.rom_id = r.id
            LEFT JOIN systems  s ON s.id = r.system_id
            WHERE r.system_id = ?
            ORDER BY (m.artwork_path IS NOT NULL AND m.artwork_path != '') DESC, r.id
            LIMIT 1
        `).get(systemId);

        let launchUrl = null;
        if (rom) {
            const params = new URLSearchParams({
                system: systemId, romId: String(rom.id), server,
                title: rom.clean_name || rom.filename,
            });
            launchUrl = `arcade://launch?${params}`;
        }

        // Determine overall status
        let status;
        if (!emuInstalled)      status = 'NO_EMULATOR';
        else if (!rom)          status = 'NO_ROMS';
        else                    status = 'READY';

        results.push({
            system:       systemId,
            systemName:   info.emulator === 'Dolphin' ? (systemId === 'wii' ? 'Nintendo Wii' : 'Nintendo GameCube') : (rom?.system_name || systemId),
            tag:          info.tag,
            emulator:     info.emulator,
            emuInstalled,
            emuPath,
            romCount:     db.prepare('SELECT COUNT(*) AS c FROM roms WHERE system_id = ?').get(systemId)?.c ?? 0,
            testRom:      rom ? { id: rom.id, title: rom.clean_name, hasArt: !!rom.artwork_path } : null,
            launchUrl,
            status,
        });
    }

    const ready    = results.filter(r => r.status === 'READY').length;
    const total    = results.length;

    res.json({ ready, total, systems: results });
});

export default router;
