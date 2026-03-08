import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// ─── GAME REQUESTS (Community Wishlist) ─────────────────────────

// GET /requests — list game requests
router.get('/requests', (req, res) => {
    try {
        const db = getDB();
        const status = req.query.status || 'open';
        const sort = req.query.sort === 'newest' ? 'gr.created_at DESC' : 'gr.votes DESC, gr.created_at DESC';
        const limit = Math.min(parseInt(req.query.limit) || 30, 100);
        const offset = parseInt(req.query.offset) || 0;

        const validStatuses = ['open', 'approved', 'fulfilled', 'declined', 'all'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
        }

        let query = `
            SELECT gr.id, gr.player_id, gr.game_name, gr.system_id, gr.description,
                   gr.status, gr.admin_notes, gr.votes, gr.created_at,
                   p.name as player_name, p.emoji as player_emoji, p.color as player_color,
                   s.name as system_name
            FROM game_requests gr
            JOIN players p ON p.id = gr.player_id
            LEFT JOIN systems s ON s.id = gr.system_id
        `;
        const params = [];

        if (status !== 'all') {
            query += ' WHERE gr.status = ?';
            params.push(status);
        }

        query += ` ORDER BY ${sort} LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const requests = db.prepare(query).all(...params);
        res.json(requests);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /requests — submit a game request
router.post('/requests', (req, res) => {
    try {
        const db = getDB();
        const { player_id, game_name, system_id, description } = req.body;

        if (!player_id || !game_name) {
            return res.status(400).json({ error: 'player_id and game_name are required' });
        }

        // Verify player exists
        const player = db.prepare('SELECT id FROM players WHERE id = ?').get(player_id);
        if (!player) return res.status(404).json({ error: 'Player not found' });

        // Check for duplicate request by same player
        const existing = db.prepare(
            "SELECT id FROM game_requests WHERE player_id = ? AND game_name = ? AND status IN ('open','approved')"
        ).get(player_id, game_name);
        if (existing) return res.status(409).json({ error: 'You already requested this game' });

        const result = db.prepare(`
            INSERT INTO game_requests (player_id, game_name, system_id, description)
            VALUES (?, ?, ?, ?)
        `).run(player_id, game_name, system_id || null, description || null);

        // Auto-upvote by the requester
        db.prepare('INSERT OR IGNORE INTO game_request_votes (player_id, request_id, vote) VALUES (?, ?, 1)').run(player_id, result.lastInsertRowid);

        const newRequest = db.prepare('SELECT * FROM game_requests WHERE id = ?').get(result.lastInsertRowid);
        res.json(newRequest);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /requests/:id/vote — upvote or downvote a request
router.post('/requests/:id/vote', (req, res) => {
    try {
        const db = getDB();
        const requestId = req.params.id;
        const { player_id, vote } = req.body;

        if (!player_id || ![1, -1].includes(vote)) {
            return res.status(400).json({ error: 'player_id and vote (1 or -1) are required' });
        }

        // Verify request exists
        const request = db.prepare('SELECT id, votes FROM game_requests WHERE id = ?').get(requestId);
        if (!request) return res.status(404).json({ error: 'Request not found' });

        // Check existing vote
        const existing = db.prepare('SELECT vote FROM game_request_votes WHERE player_id = ? AND request_id = ?').get(player_id, requestId);

        const tx = db.transaction(() => {
            if (existing) {
                if (existing.vote === vote) {
                    // Same vote again — remove it (toggle off)
                    db.prepare('DELETE FROM game_request_votes WHERE player_id = ? AND request_id = ?').run(player_id, requestId);
                    db.prepare('UPDATE game_requests SET votes = votes - ? WHERE id = ?').run(vote, requestId);
                } else {
                    // Changed vote — update and swing by 2
                    db.prepare('UPDATE game_request_votes SET vote = ? WHERE player_id = ? AND request_id = ?').run(vote, player_id, requestId);
                    db.prepare('UPDATE game_requests SET votes = votes + ? WHERE id = ?').run(vote * 2, requestId);
                }
            } else {
                // New vote
                db.prepare('INSERT INTO game_request_votes (player_id, request_id, vote) VALUES (?, ?, ?)').run(player_id, requestId, vote);
                db.prepare('UPDATE game_requests SET votes = votes + ? WHERE id = ?').run(vote, requestId);
            }
        });
        tx();

        const updated = db.prepare('SELECT * FROM game_requests WHERE id = ?').get(requestId);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /requests/:id — admin update status
router.patch('/requests/:id', (req, res) => {
    try {
        const db = getDB();
        const { status, admin_notes } = req.body;

        const validStatuses = ['open', 'approved', 'fulfilled', 'declined'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
        }

        const existing = db.prepare('SELECT id FROM game_requests WHERE id = ?').get(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Request not found' });

        const updates = [];
        const params = [];
        if (status) { updates.push('status = ?'); params.push(status); }
        if (admin_notes !== undefined) { updates.push('admin_notes = ?'); params.push(admin_notes); }

        if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

        params.push(req.params.id);
        db.prepare(`UPDATE game_requests SET ${updates.join(', ')} WHERE id = ?`).run(...params);

        const updated = db.prepare('SELECT * FROM game_requests WHERE id = ?').get(req.params.id);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /requests/:id — delete a request
router.delete('/requests/:id', (req, res) => {
    try {
        const db = getDB();
        const result = db.prepare('DELETE FROM game_requests WHERE id = ?').run(req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Request not found' });
        // Also clean up votes
        db.prepare('DELETE FROM game_request_votes WHERE request_id = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GAME REPORTS (Broken Games, Wrong Artwork, etc.) ─────────────────────────

// GET /reports — list game reports
router.get('/reports', (req, res) => {
    try {
        const db = getDB();
        const status = req.query.status || 'open';
        const limit = Math.min(parseInt(req.query.limit) || 30, 100);
        const offset = parseInt(req.query.offset) || 0;

        const validStatuses = ['open', 'investigating', 'resolved', 'wontfix', 'all'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
        }

        let query = `
            SELECT gr.id, gr.player_id, gr.rom_id, gr.type, gr.description,
                   gr.status, gr.admin_notes, gr.created_at,
                   p.name as player_name, p.emoji as player_emoji,
                   r.clean_name as game_name, r.system_id
            FROM game_reports gr
            JOIN players p ON p.id = gr.player_id
            JOIN roms r ON r.id = gr.rom_id
        `;
        const params = [];

        if (status !== 'all') {
            query += ' WHERE gr.status = ?';
            params.push(status);
        }

        query += ' ORDER BY gr.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const reports = db.prepare(query).all(...params);
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /reports — submit a game report
router.post('/reports', (req, res) => {
    try {
        const db = getDB();
        const { player_id, rom_id, type, description } = req.body;

        if (!player_id || !rom_id || !type) {
            return res.status(400).json({ error: 'player_id, rom_id, and type are required' });
        }

        const validTypes = ['broken', 'wrong_art', 'wrong_info', 'crashes', 'other'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
        }

        // Verify player and rom exist
        const player = db.prepare('SELECT id FROM players WHERE id = ?').get(player_id);
        if (!player) return res.status(404).json({ error: 'Player not found' });
        const rom = db.prepare('SELECT id FROM roms WHERE id = ?').get(rom_id);
        if (!rom) return res.status(404).json({ error: 'Game not found' });

        const result = db.prepare(`
            INSERT INTO game_reports (player_id, rom_id, type, description)
            VALUES (?, ?, ?, ?)
        `).run(player_id, rom_id, type, description || null);

        const newReport = db.prepare('SELECT * FROM game_reports WHERE id = ?').get(result.lastInsertRowid);
        res.json(newReport);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /reports/:id — admin update report
router.patch('/reports/:id', (req, res) => {
    try {
        const db = getDB();
        const { status, admin_notes } = req.body;

        const validStatuses = ['open', 'investigating', 'resolved', 'wontfix'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
        }

        const existing = db.prepare('SELECT id FROM game_reports WHERE id = ?').get(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Report not found' });

        const updates = [];
        const params = [];
        if (status) { updates.push('status = ?'); params.push(status); }
        if (admin_notes !== undefined) { updates.push('admin_notes = ?'); params.push(admin_notes); }

        if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

        params.push(req.params.id);
        db.prepare(`UPDATE game_reports SET ${updates.join(', ')} WHERE id = ?`).run(...params);

        const updated = db.prepare('SELECT * FROM game_reports WHERE id = ?').get(req.params.id);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /reports/game/:romId — get reports for a specific game
router.get('/reports/game/:romId', (req, res) => {
    try {
        const db = getDB();
        const reports = db.prepare(`
            SELECT gr.id, gr.player_id, gr.rom_id, gr.type, gr.description,
                   gr.status, gr.admin_notes, gr.created_at,
                   p.name as player_name, p.emoji as player_emoji
            FROM game_reports gr
            JOIN players p ON p.id = gr.player_id
            WHERE gr.rom_id = ?
            ORDER BY gr.created_at DESC
        `).all(req.params.romId);

        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
