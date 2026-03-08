import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// Get a random challenge (random game + time limit)
router.get('/random', (req, res) => {
    const db = getDB();
    const system = req.query.system || null;

    let query = `
        SELECT r.*, s.short_name as system_name, s.color as system_color,
               m.artwork_path, m.genre
        FROM roms r
        JOIN systems s ON s.id = r.system_id
        LEFT JOIN metadata m ON m.rom_id = r.id
    `;
    const params = [];

    if (system) {
        query += ' WHERE r.system_id = ?';
        params.push(system);
    }

    query += ' ORDER BY RANDOM() LIMIT 1';

    const game = db.prepare(query).get(...params);
    if (!game) return res.status(404).json({ error: 'No games found' });

    // Random challenge parameters
    const challenges = [
        { type: 'time_attack', title: 'Speed Run', description: 'Play for 5 minutes straight!', duration: 300 },
        { type: 'time_attack', title: 'Quick Session', description: 'Beat your record in 3 minutes!', duration: 180 },
        { type: 'endurance', title: 'Marathon Mode', description: 'Last 10 minutes without quitting!', duration: 600 },
        { type: 'score', title: 'High Score Hunt', description: 'Get the highest score you can!', duration: 300 },
        { type: 'blind', title: 'Blind Pick', description: 'Play this mystery game — no peeking!', duration: 300 },
    ];

    const challenge = challenges[Math.floor(Math.random() * challenges.length)];

    res.json({
        game,
        challenge: {
            ...challenge,
            id: Date.now(),
        },
    });
});

// Get challenge history (completed challenges — stored as achievements)
router.get('/history', (req, res) => {
    const db = getDB();
    const challenges = db.prepare(`
        SELECT a.*, p.name as player_name, p.emoji, p.color
        FROM achievements a
        JOIN players p ON p.id = a.player_id
        WHERE a.type LIKE 'challenge_%'
        ORDER BY a.unlocked_at DESC
        LIMIT 30
    `).all();
    res.json(challenges);
});

// Complete a challenge (record as achievement)
router.post('/complete', (req, res) => {
    const db = getDB();
    const { player_id, challenge_type, game_name, duration } = req.body;

    if (!player_id) return res.status(400).json({ error: 'player_id required' });

    const result = db.prepare(`
        INSERT INTO achievements (player_id, type, title, description, data)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        player_id,
        `challenge_${challenge_type || 'completed'}`,
        'Challenge Complete!',
        `Completed a ${challenge_type || 'challenge'} on ${game_name || 'a game'}`,
        JSON.stringify({ challenge_type, game_name, duration, completed_at: new Date().toISOString() })
    );

    res.json({ ok: true, achievement_id: result.lastInsertRowid });
});

export default router;
