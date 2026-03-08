import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// GET / — list all tournaments
router.get('/', (req, res) => {
    try {
        const db = getDB();
        const status = req.query.status;
        let sql = `
            SELECT t.*,
                   r.clean_name as game_name, r.system_id,
                   (SELECT COUNT(*) FROM tournament_entries WHERE tournament_id = t.id) as player_count,
                   pw.name as winner_name, pw.emoji as winner_emoji
            FROM tournaments t
            LEFT JOIN roms r ON r.id = t.rom_id
            LEFT JOIN players pw ON pw.id = t.winner_player_id
        `;
        const params = [];
        if (status) {
            sql += ' WHERE t.status = ?';
            params.push(status);
        }
        sql += ' ORDER BY t.created_at DESC';

        const tournaments = db.prepare(sql).all(...params);
        res.json(tournaments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST / — create tournament
router.post('/', (req, res) => {
    try {
        const db = getDB();
        const { name, description, type, rom_id, system_id, max_players } = req.body;

        if (!name) return res.status(400).json({ error: 'name is required' });

        const result = db.prepare(`
            INSERT INTO tournaments (name, description, type, rom_id, system_id, max_players, rounds)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            name,
            description || null,
            type || 'bracket',
            rom_id || null,
            system_id || null,
            max_players || 16,
            Math.ceil(Math.log2(max_players || 16))
        );

        const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(result.lastInsertRowid);
        res.json({ ok: true, tournament });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /:id/join — join tournament
router.post('/:id/join', (req, res) => {
    try {
        const db = getDB();
        const { player_id } = req.body;
        const tournamentId = req.params.id;

        if (!player_id) return res.status(400).json({ error: 'player_id is required' });

        const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
        if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
        if (tournament.status !== 'registration') return res.status(400).json({ error: 'Tournament is not accepting registrations' });

        const entryCount = db.prepare('SELECT COUNT(*) as c FROM tournament_entries WHERE tournament_id = ?').get(tournamentId).c;
        if (entryCount >= tournament.max_players) return res.status(400).json({ error: 'Tournament is full' });

        const seed = entryCount + 1;
        db.prepare('INSERT INTO tournament_entries (tournament_id, player_id, seed) VALUES (?, ?, ?)').run(tournamentId, player_id, seed);

        res.json({ ok: true, seed, players_registered: entryCount + 1, max: tournament.max_players });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint')) {
            return res.status(400).json({ error: 'Player already registered' });
        }
        res.status(500).json({ error: err.message });
    }
});

// POST /:id/start — start tournament (generates bracket)
router.post('/:id/start', (req, res) => {
    try {
        const db = getDB();
        const tournamentId = req.params.id;

        const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
        if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
        if (tournament.status !== 'registration') return res.status(400).json({ error: 'Tournament already started or completed' });

        const entries = db.prepare('SELECT * FROM tournament_entries WHERE tournament_id = ? ORDER BY seed').all(tournamentId);
        if (entries.length < 2) return res.status(400).json({ error: 'Need at least 2 players to start' });

        // Pad to next power of 2 for clean brackets
        const bracketSize = Math.pow(2, Math.ceil(Math.log2(entries.length)));
        const rounds = Math.ceil(Math.log2(bracketSize));
        const matchesR1 = bracketSize / 2;

        const tx = db.transaction(() => {
            // Generate round 1 matches
            const insertMatch = db.prepare(`
                INSERT INTO tournament_matches (tournament_id, round, match_number, player1_id, player2_id, status)
                VALUES (?, 1, ?, ?, ?, ?)
            `);

            for (let m = 0; m < matchesR1; m++) {
                const p1 = entries[m] || null;
                const p2 = entries[bracketSize - 1 - m] || null;
                const p1id = p1 ? p1.player_id : null;
                const p2id = p2 ? p2.player_id : null;

                // If one slot is a bye, auto-advance
                if (p1id && !p2id) {
                    insertMatch.run(tournamentId, m + 1, p1id, null, 'completed');
                } else if (!p1id && p2id) {
                    insertMatch.run(tournamentId, m + 1, null, p2id, 'completed');
                } else if (p1id && p2id) {
                    insertMatch.run(tournamentId, m + 1, p1id, p2id, 'pending');
                }
                // Both null = skip
            }

            // Generate placeholder matches for later rounds
            const insertPlaceholder = db.prepare(`
                INSERT INTO tournament_matches (tournament_id, round, match_number, status)
                VALUES (?, ?, ?, 'pending')
            `);
            let matchesInRound = matchesR1 / 2;
            for (let r = 2; r <= rounds; r++) {
                for (let m = 1; m <= matchesInRound; m++) {
                    insertPlaceholder.run(tournamentId, r, m);
                }
                matchesInRound = Math.max(1, matchesInRound / 2);
            }

            // Update tournament status
            db.prepare(`
                UPDATE tournaments SET status = 'active', current_round = 1, rounds = ?, started_at = datetime('now')
                WHERE id = ?
            `).run(rounds, tournamentId);

            // Auto-advance byes in round 1
            const byeMatches = db.prepare(`
                SELECT * FROM tournament_matches
                WHERE tournament_id = ? AND round = 1 AND status = 'completed'
            `).all(tournamentId);

            for (const bm of byeMatches) {
                const winnerId = bm.player1_id || bm.player2_id;
                if (winnerId) {
                    db.prepare('UPDATE tournament_matches SET winner_id = ?, completed_at = datetime(\'now\') WHERE id = ?').run(winnerId, bm.id);
                    advanceWinner(db, tournamentId, 1, bm.match_number, winnerId);
                }
            }
        });
        tx();

        const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
        res.json({ ok: true, tournament: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function advanceWinner(db, tournamentId, fromRound, fromMatchNumber, winnerId) {
    const nextRound = fromRound + 1;
    const nextMatchNumber = Math.ceil(fromMatchNumber / 2);
    const isPlayer1 = fromMatchNumber % 2 === 1;

    const nextMatch = db.prepare(`
        SELECT * FROM tournament_matches
        WHERE tournament_id = ? AND round = ? AND match_number = ?
    `).get(tournamentId, nextRound, nextMatchNumber);

    if (!nextMatch) return; // Final round already

    if (isPlayer1) {
        db.prepare('UPDATE tournament_matches SET player1_id = ? WHERE id = ?').run(winnerId, nextMatch.id);
    } else {
        db.prepare('UPDATE tournament_matches SET player2_id = ? WHERE id = ?').run(winnerId, nextMatch.id);
    }
}

// GET /:id/bracket — get bracket with matches
router.get('/:id/bracket', (req, res) => {
    try {
        const db = getDB();
        const tournamentId = req.params.id;

        const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
        if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

        const matches = db.prepare(`
            SELECT tm.*,
                   p1.name as player1_name, p1.emoji as player1_emoji, p1.color as player1_color,
                   p2.name as player2_name, p2.emoji as player2_emoji, p2.color as player2_color,
                   w.name as winner_name
            FROM tournament_matches tm
            LEFT JOIN players p1 ON p1.id = tm.player1_id
            LEFT JOIN players p2 ON p2.id = tm.player2_id
            LEFT JOIN players w ON w.id = tm.winner_id
            WHERE tm.tournament_id = ?
            ORDER BY tm.round, tm.match_number
        `).all(tournamentId);

        // Group by round
        const rounds = {};
        for (const m of matches) {
            if (!rounds[m.round]) rounds[m.round] = [];
            rounds[m.round].push(m);
        }

        const entries = db.prepare(`
            SELECT te.*, p.name, p.emoji, p.color
            FROM tournament_entries te
            JOIN players p ON p.id = te.player_id
            WHERE te.tournament_id = ?
            ORDER BY te.seed
        `).all(tournamentId);

        res.json({ tournament, rounds, entries });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /:id/match/:matchId/score — submit match result
router.post('/:id/match/:matchId/score', (req, res) => {
    try {
        const db = getDB();
        const { player1_score, player2_score } = req.body;
        const tournamentId = req.params.id;
        const matchId = req.params.matchId;

        if (player1_score === undefined || player2_score === undefined) {
            return res.status(400).json({ error: 'player1_score and player2_score are required' });
        }

        const match = db.prepare('SELECT * FROM tournament_matches WHERE id = ? AND tournament_id = ?').get(matchId, tournamentId);
        if (!match) return res.status(404).json({ error: 'Match not found' });
        if (match.status === 'completed') return res.status(400).json({ error: 'Match already completed' });
        if (!match.player1_id || !match.player2_id) return res.status(400).json({ error: 'Match players not yet determined' });

        const winnerId = player1_score >= player2_score ? match.player1_id : match.player2_id;
        const loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;

        const tx = db.transaction(() => {
            db.prepare(`
                UPDATE tournament_matches
                SET player1_score = ?, player2_score = ?, winner_id = ?, status = 'completed', completed_at = datetime('now')
                WHERE id = ?
            `).run(player1_score, player2_score, winnerId, matchId);

            // Mark loser as eliminated
            db.prepare('UPDATE tournament_entries SET eliminated = 1 WHERE tournament_id = ? AND player_id = ?').run(tournamentId, loserId);

            // Advance winner to next round
            advanceWinner(db, tournamentId, match.round, match.match_number, winnerId);

            // Check if round is complete
            const pendingInRound = db.prepare(`
                SELECT COUNT(*) as c FROM tournament_matches
                WHERE tournament_id = ? AND round = ? AND status != 'completed'
            `).get(tournamentId, match.round).c;

            if (pendingInRound === 0) {
                const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
                const nextRound = match.round + 1;
                if (nextRound > tournament.rounds) {
                    // Tournament complete
                    db.prepare(`
                        UPDATE tournaments SET status = 'completed', winner_player_id = ?, ended_at = datetime('now')
                        WHERE id = ?
                    `).run(winnerId, tournamentId);
                    db.prepare('UPDATE tournament_entries SET final_rank = 1 WHERE tournament_id = ? AND player_id = ?').run(tournamentId, winnerId);
                } else {
                    db.prepare('UPDATE tournaments SET current_round = ? WHERE id = ?').run(nextRound, tournamentId);
                }
            }
        });
        tx();

        res.json({ ok: true, winner_id: winnerId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /:id/standings — current standings
router.get('/:id/standings', (req, res) => {
    try {
        const db = getDB();
        const tournamentId = req.params.id;

        const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
        if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

        const standings = db.prepare(`
            SELECT te.*, p.name, p.emoji, p.color,
                   (SELECT COUNT(*) FROM tournament_matches
                    WHERE tournament_id = ? AND winner_id = te.player_id) as wins,
                   (SELECT MAX(round) FROM tournament_matches
                    WHERE tournament_id = ? AND winner_id = te.player_id) as best_round
            FROM tournament_entries te
            JOIN players p ON p.id = te.player_id
            WHERE te.tournament_id = ?
            ORDER BY te.eliminated ASC, wins DESC
        `).all(tournamentId, tournamentId, tournamentId);

        res.json({ tournament, standings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
