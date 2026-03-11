import { Router } from 'express';
import { getDB } from '../db.js';
import { CONFIG } from '../config.js';
import fs from 'fs';
import path from 'path';

const router = Router();

router.get('/config/:id', (req, res) => {
    const db = getDB();
    const rom = db.prepare(`
        SELECT r.id, r.filepath, r.filename, r.clean_name, r.system_id,
               m.title,
               s.emulatorjs_core as core, s.color, s.bios_files
        FROM roms r
        LEFT JOIN metadata m ON m.rom_id = r.id
        LEFT JOIN systems s ON s.id = r.system_id
        WHERE r.id = ?
    `).get(req.params.id);

    if (!rom) return res.status(404).json({ error: 'ROM not found' });

    const config = {
        core:       rom.core,
        systemId:   rom.system_id,
        gameUrl:    `/rom-file/${rom.id}/${encodeURIComponent(rom.filename)}`,
        pathtodata: '/data/',
        gameName:   rom.title || rom.clean_name || rom.filename,
        filename:   rom.filename,
        color:      rom.color || '#7B68A8',
    };

    if (rom.bios_files) {
        let biosFiles;
        try { biosFiles = JSON.parse(rom.bios_files); } catch { biosFiles = []; }
        if (biosFiles.length > 0) {
            // Only set biosUrl if the file actually exists on disk
            const biosPath = path.join(CONFIG.ROMS_DIR, rom.system_id, biosFiles[0]);
            const biosExists = fs.existsSync(biosPath);
            if (biosExists) {
                config.biosUrl = `/bios/${rom.system_id}/${biosFiles[0]}`;
            }
            // FBNeo Neo Geo: also provide as gameParentUrl
            if (rom.core === 'fbneo' && biosFiles[0] === 'neogeo.zip' && biosExists) {
                config.gameParentUrl = `/bios/${rom.system_id}/${biosFiles[0]}`;
            }
            // Signal to client if BIOS is missing (for HLE fallback hints)
            if (!biosExists) {
                config.biosRequired = biosFiles[0];
                config.biosMissing  = true;
            }
        }
    }

    res.json(config);
});

export default router;
