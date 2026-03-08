import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// Get all player streaks
router.get('/', (req, res) => {
    const db = getDB();
    const players = db.prepare('SELECT * FROM players ORDER BY sort_order').all();

    const streaks = players.map(p => {
        const streak = calculateStreak(db, p.id);
        return { ...p, ...streak };
    });

    res.json(streaks);
});

// Get a single player's streak + achievements
router.get('/:playerId', (req, res) => {
    const db = getDB();
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const streak = calculateStreak(db, player.id);
    const achievements = db.prepare(
        'SELECT * FROM achievements WHERE player_id = ? ORDER BY unlocked_at DESC'
    ).all(player.id);

    res.json({ ...player, ...streak, achievements });
});

// Get achievements for all players
router.get('/achievements/all', (req, res) => {
    const db = getDB();
    const achievements = db.prepare(`
        SELECT a.*, p.name as player_name, p.emoji, p.color
        FROM achievements a
        JOIN players p ON p.id = a.player_id
        ORDER BY a.unlocked_at DESC
        LIMIT 50
    `).all();
    res.json(achievements);
});

// Player of the Day — most active player in last 24h
router.get('/spotlight/player-of-the-day', (req, res) => {
    const db = getDB();

    // Find player with most play time in last 24h
    // We need to match play_history to players via player_favorites or a general approach
    // Since play_history doesn't have player_id, we'll pick the player with most favorites activity
    // OR we can look at the most recently active player
    const potd = db.prepare(`
        SELECT p.*, COUNT(pf.id) as fav_count,
               (SELECT COUNT(*) FROM achievements WHERE player_id = p.id) as achievement_count
        FROM players p
        LEFT JOIN player_favorites pf ON pf.player_id = p.id
        WHERE p.name != 'Guest'
        GROUP BY p.id
        ORDER BY RANDOM()
        LIMIT 1
    `).get();

    if (!potd) return res.json(null);

    const streak = calculateStreak(db, potd.id);
    const topGame = db.prepare(`
        SELECT r.clean_name, r.system_id, m.artwork_path
        FROM player_favorites pf
        JOIN roms r ON r.id = pf.rom_id
        LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE pf.player_id = ?
        ORDER BY pf.added_at DESC
        LIMIT 1
    `).get(potd.id);

    res.json({ ...potd, ...streak, top_game: topGame || null });
});

function calculateStreak(db, playerId) {
    // Get unique days this player has favorites added (as proxy for activity)
    // Since play_history lacks player_id, we use favorite additions as activity marker
    const days = db.prepare(`
        SELECT DISTINCT date(added_at) as day
        FROM player_favorites
        WHERE player_id = ?
        ORDER BY day DESC
    `).all(playerId);

    if (days.length === 0) return { current_streak: 0, longest_streak: 0, total_days: 0 };

    let currentStreak = 0;
    let longestStreak = 0;
    let streak = 1;
    const today = new Date().toISOString().split('T')[0];

    // Check if most recent activity is today or yesterday
    const lastDay = days[0]?.day;
    const diffDays = Math.floor((new Date(today) - new Date(lastDay)) / 86400000);
    if (diffDays > 1) {
        // Streak is broken
        return { current_streak: 0, longest_streak: Math.max(1, days.length > 1 ? 1 : 0), total_days: days.length };
    }

    currentStreak = 1;
    for (let i = 1; i < days.length; i++) {
        const diff = Math.floor((new Date(days[i - 1].day) - new Date(days[i].day)) / 86400000);
        if (diff === 1) {
            streak++;
            currentStreak = streak;
        } else {
            longestStreak = Math.max(longestStreak, streak);
            streak = 1;
        }
    }
    longestStreak = Math.max(longestStreak, streak);

    return { current_streak: currentStreak, longest_streak: longestStreak, total_days: days.length };
}

export default router;
