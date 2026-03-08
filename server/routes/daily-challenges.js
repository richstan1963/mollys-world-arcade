import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

const CHALLENGE_TYPES = ['score_attack', 'speed_run', 'endurance', 'variety', 'system_master'];

const CHALLENGE_TEMPLATES = {
    score_attack: { titleFn: (game) => `Score Attack: ${game}`, descFn: (game) => `Beat the target score in ${game}!`, targetRange: [5000, 50000] },
    speed_run: { titleFn: (game) => `Speed Run: ${game}`, descFn: (game) => `Complete ${game} as fast as possible!`, targetRange: [60, 600] },
    endurance: { titleFn: (game) => `Endurance: ${game}`, descFn: (game) => `Play ${game} for as long as you can without losing!`, targetRange: [300, 1800] },
    variety: { titleFn: () => 'System Sampler', descFn: () => 'Play games from 3 different systems today!', targetRange: [3, 5] },
    system_master: { titleFn: (game, sys) => `Master ${sys}`, descFn: (game, sys) => `Play 5 different ${sys} games today!`, targetRange: [3, 7] },
};

// Deterministic pseudo-random from date string
function dateHash(dateStr) {
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) {
        hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function generateChallenge(db, dateStr) {
    const hash = dateHash(dateStr);
    const type = CHALLENGE_TYPES[hash % CHALLENGE_TYPES.length];
    const template = CHALLENGE_TEMPLATES[type];

    // Pick a random ROM with metadata
    const roms = db.prepare(`
        SELECT r.id, r.clean_name, r.system_id, s.short_name
        FROM roms r
        JOIN metadata m ON m.rom_id = r.id
        JOIN systems s ON s.id = r.system_id
        WHERE m.title IS NOT NULL
        LIMIT 200
    `).all();

    if (roms.length === 0) {
        return {
            date: dateStr,
            type: 'variety',
            title: 'System Sampler',
            description: 'Play games from 3 different systems today!',
            rom_id: null,
            system_id: null,
            target_value: 3,
        };
    }

    const rom = roms[hash % roms.length];
    const [minTarget, maxTarget] = template.targetRange;
    const target = minTarget + (hash % (maxTarget - minTarget + 1));

    return {
        date: dateStr,
        type,
        title: template.titleFn(rom.clean_name, rom.short_name),
        description: template.descFn(rom.clean_name, rom.short_name),
        rom_id: (type === 'variety') ? null : rom.id,
        system_id: rom.system_id,
        target_value: target,
    };
}

// GET /today — get today's challenge (auto-generate if missing)
router.get('/today', (req, res) => {
    try {
        const db = getDB();
        const today = new Date().toISOString().slice(0, 10);

        let challenge = db.prepare('SELECT * FROM daily_challenges WHERE date = ?').get(today);

        if (!challenge) {
            const data = generateChallenge(db, today);
            const result = db.prepare(`
                INSERT INTO daily_challenges (date, type, title, description, rom_id, system_id, target_value)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(data.date, data.type, data.title, data.description, data.rom_id, data.system_id, data.target_value);
            challenge = db.prepare('SELECT * FROM daily_challenges WHERE id = ?').get(result.lastInsertRowid);
        }

        // Get entries
        const entries = db.prepare(`
            SELECT dce.*, p.name as player_name, p.emoji, p.color
            FROM daily_challenge_entries dce
            JOIN players p ON p.id = dce.player_id
            WHERE dce.challenge_id = ?
            ORDER BY dce.value DESC
        `).all(challenge.id);

        // Get game info if rom_id exists
        let game = null;
        if (challenge.rom_id) {
            game = db.prepare(`
                SELECT r.clean_name, r.system_id, s.short_name, m.artwork_path
                FROM roms r
                JOIN systems s ON s.id = r.system_id
                LEFT JOIN metadata m ON m.rom_id = r.id
                WHERE r.id = ?
            `).get(challenge.rom_id);
        }

        res.json({ ...challenge, game, entries });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /history — past challenges with results
router.get('/history', (req, res) => {
    try {
        const db = getDB();
        const limit = Math.min(parseInt(req.query.limit) || 30, 100);

        const challenges = db.prepare(`
            SELECT dc.*,
                   r.clean_name as game_name, r.system_id,
                   (SELECT COUNT(*) FROM daily_challenge_entries WHERE challenge_id = dc.id) as entry_count,
                   (SELECT COUNT(*) FROM daily_challenge_entries WHERE challenge_id = dc.id AND completed = 1) as completed_count
            FROM daily_challenges dc
            LEFT JOIN roms r ON r.id = dc.rom_id
            ORDER BY dc.date DESC
            LIMIT ?
        `).all(limit);

        res.json(challenges);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /submit — submit an entry
router.post('/submit', (req, res) => {
    try {
        const db = getDB();
        const { player_id, value } = req.body;

        if (!player_id || value === undefined || value === null) {
            return res.status(400).json({ error: 'player_id and value are required' });
        }

        const today = new Date().toISOString().slice(0, 10);
        const challenge = db.prepare('SELECT * FROM daily_challenges WHERE date = ?').get(today);
        if (!challenge) {
            return res.status(404).json({ error: 'No challenge found for today' });
        }

        const completed = value >= challenge.target_value ? 1 : 0;

        const result = db.prepare(`
            INSERT INTO daily_challenge_entries (challenge_id, player_id, value, completed)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(challenge_id, player_id) DO UPDATE SET
                value = CASE WHEN excluded.value > daily_challenge_entries.value THEN excluded.value ELSE daily_challenge_entries.value END,
                completed = CASE WHEN excluded.value >= ? THEN 1 ELSE daily_challenge_entries.completed END,
                submitted_at = datetime('now')
        `).run(challenge.id, player_id, value, completed, challenge.target_value);

        // Get rank
        const rank = db.prepare(`
            SELECT COUNT(*) + 1 as rank
            FROM daily_challenge_entries
            WHERE challenge_id = ? AND value > ?
        `).get(challenge.id, value);

        res.json({
            ok: true,
            challenge_id: challenge.id,
            completed,
            rank: rank.rank,
            target: challenge.target_value,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /leaderboard/:challengeId — entries for a challenge
router.get('/leaderboard/:challengeId', (req, res) => {
    try {
        const db = getDB();
        const entries = db.prepare(`
            SELECT dce.*, p.name as player_name, p.emoji, p.color
            FROM daily_challenge_entries dce
            JOIN players p ON p.id = dce.player_id
            WHERE dce.challenge_id = ?
            ORDER BY dce.value DESC
        `).all(req.params.challengeId);

        res.json(entries);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
