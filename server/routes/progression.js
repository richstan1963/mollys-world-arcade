/**
 * PROGRESSION ENGINE — XP, Levels, Achievements, Activity Feed
 * The RPG layer that makes Molly's World Arcade addictive.
 */
import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// ═══════════════════════════════════════════════════════════
// LEVEL DEFINITIONS — 25 ranks from Newbie to ARCADE GOD
// ═══════════════════════════════════════════════════════════
const LEVELS = [
    { level: 1,  xp: 0,     title: 'Newbie',          badge: '🆕' },
    { level: 2,  xp: 50,    title: 'Button Masher',    badge: '🔘' },
    { level: 3,  xp: 150,   title: 'Quarter Muncher',  badge: '🪙' },
    { level: 4,  xp: 300,   title: 'Pixel Pusher',     badge: '🟩' },
    { level: 5,  xp: 500,   title: 'Console Cadet',    badge: '🎖️' },
    { level: 6,  xp: 750,   title: 'Joystick Jockey',  badge: '🕹️' },
    { level: 7,  xp: 1050,  title: 'Power Player',     badge: '⚡' },
    { level: 8,  xp: 1400,  title: 'Score Chaser',     badge: '🏅' },
    { level: 9,  xp: 1800,  title: 'Boss Beater',      badge: '💪' },
    { level: 10, xp: 2300,  title: 'Pixel Pioneer',    badge: '🌟' },
    { level: 11, xp: 2900,  title: 'Speed Runner',     badge: '💨' },
    { level: 12, xp: 3600,  title: 'Combo King',       badge: '👑' },
    { level: 13, xp: 4400,  title: 'Game Guru',        badge: '🧠' },
    { level: 14, xp: 5300,  title: '8-Bit Legend',     badge: '🏆' },
    { level: 15, xp: 6300,  title: 'Retro Royal',      badge: '👸' },
    { level: 16, xp: 7500,  title: 'Master Player',    badge: '🎯' },
    { level: 17, xp: 8800,  title: 'Digital Warrior',   badge: '⚔️' },
    { level: 18, xp: 10200, title: 'Neo Champion',      badge: '🏟️' },
    { level: 19, xp: 11800, title: 'Pixel Perfect',     badge: '✨' },
    { level: 20, xp: 13500, title: 'Hall of Famer',     badge: '🏛️' },
    { level: 21, xp: 15500, title: 'Living Legend',     badge: '🌠' },
    { level: 22, xp: 17700, title: 'Arcade Titan',      badge: '🗿' },
    { level: 23, xp: 20100, title: 'Gaming Demigod',    badge: '🔱' },
    { level: 24, xp: 22800, title: 'Eternal Player',    badge: '♾️' },
    { level: 25, xp: 25800, title: 'ARCADE GOD',        badge: '🌌' },
];

// ═══════════════════════════════════════════════════════════
// XP AMOUNTS — what earns you points
// ═══════════════════════════════════════════════════════════
const XP_AMOUNTS = {
    play:          10,   // finished a play session
    play_long:     15,   // bonus: session > 5 minutes
    rate:           5,   // rated a game
    favorite:       3,   // favorited a game
    high_score:    20,   // set a high score
    challenge:     30,   // completed a challenge
    cheat_unlock:   5,   // unlocked a cheat code
    first_of_day:  10,   // first play of the day bonus
};

// ═══════════════════════════════════════════════════════════
// ACHIEVEMENT DEFINITIONS — 20 unlockable badges
// ═══════════════════════════════════════════════════════════
const ACHIEVEMENTS = [
    // Play milestones
    { id: 'first_steps',      title: 'First Steps',       desc: 'Play your first game',                icon: '👣', check: s => s.total_plays >= 1 },
    { id: 'warming_up',       title: 'Warming Up',        desc: 'Play 10 games',                       icon: '🌡️', check: s => s.total_plays >= 10 },
    { id: 'on_fire',          title: 'On Fire!',          desc: 'Play 50 games',                       icon: '🔥', check: s => s.total_plays >= 50 },
    { id: 'century_club',     title: 'Century Club',      desc: 'Play 100 games',                      icon: '💎', check: s => s.total_plays >= 100 },
    // Rating & favorites
    { id: 'the_critic',       title: 'The Critic',        desc: 'Rate 10 different games',             icon: '📝', check: s => s.total_ratings >= 10 },
    { id: 'five_star_general', title: 'Five Star General', desc: 'Give 5 five-star ratings',           icon: '⭐', check: s => s.five_star_count >= 5 },
    { id: 'collector',        title: 'Collector',         desc: 'Favorite 15 games',                   icon: '❤️', check: s => s.total_favorites >= 15 },
    // Scores
    { id: 'high_scorer',      title: 'High Scorer',       desc: 'Set your first high score',           icon: '🏆', check: s => s.total_scores >= 1 },
    { id: 'score_king',       title: 'Score King',        desc: 'Set 10 high scores',                  icon: '👑', check: s => s.total_scores >= 10 },
    // System variety
    { id: 'system_hopper',    title: 'System Hopper',     desc: 'Play games on 5 different systems',   icon: '🔄', check: s => s.systems_played >= 5 },
    { id: 'world_traveler',   title: 'World Traveler',    desc: 'Play games on 15 systems',            icon: '🌍', check: s => s.systems_played >= 15 },
    // Platform love
    { id: 'nintendo_fan',     title: 'Nintendo Fan',      desc: 'Play 20 Nintendo games',              icon: '🍄', check: s => s.nintendo_plays >= 20 },
    { id: 'sega_does',        title: 'SEGA Does!',        desc: 'Play 20 Sega games',                  icon: '🦔', check: s => s.sega_plays >= 20 },
    { id: 'old_school',       title: 'Old School',        desc: 'Play an Atari game',                  icon: '🕹️', check: s => s.atari_plays >= 1 },
    { id: 'arcade_warrior',   title: 'Arcade Warrior',    desc: 'Play an arcade game',                 icon: '👾', check: s => s.arcade_plays >= 1 },
    // Streaks & dedication
    { id: 'streak_starter',   title: 'Streak Starter',    desc: 'Play 3 days in a row',                icon: '📊', check: s => s.streak_days >= 3 },
    { id: 'streak_master',    title: 'Streak Master',     desc: 'Play 7 days in a row',                icon: '🔥', check: s => s.streak_days >= 7 },
    // Marathon
    { id: 'marathon',         title: 'Marathon Runner',   desc: 'Play for 30+ minutes in one session', icon: '🏃', check: s => s.longest_session >= 1800 },
    // Level milestones
    { id: 'level_10',         title: 'Double Digits',     desc: 'Reach Level 10',                      icon: '🔟', check: s => s.level >= 10 },
    { id: 'level_25',         title: 'Ascended',          desc: 'Reach Level 25: ARCADE GOD',          icon: '🌌', check: s => s.level >= 25 },
];

// ── Helper: compute level from XP ──
function getLevelInfo(xp) {
    let current = LEVELS[0];
    for (const lvl of LEVELS) {
        if (xp >= lvl.xp) current = lvl;
        else break;
    }
    const next = LEVELS[current.level] || null; // next level (null if max)
    const xpInLevel = xp - current.xp;
    const xpForNext = next ? next.xp - current.xp : 0;
    const progress = next ? xpInLevel / xpForNext : 1;
    return { ...current, next_xp: next?.xp || current.xp, xp_progress: progress, is_max: !next };
}

// ── Helper: compute player stats for achievement checks ──
function computeStats(db, playerId) {
    const player = db.prepare('SELECT xp, level FROM players WHERE id = ?').get(playerId);
    const total_plays = db.prepare('SELECT COUNT(*) as c FROM play_history WHERE player_id = ?').get(playerId)?.c || 0;
    const total_ratings = db.prepare('SELECT COUNT(*) as c FROM player_ratings WHERE player_id = ?').get(playerId)?.c || 0;
    const five_star_count = db.prepare('SELECT COUNT(*) as c FROM player_ratings WHERE player_id = ? AND rating = 5').get(playerId)?.c || 0;
    const total_favorites = db.prepare('SELECT COUNT(*) as c FROM player_favorites WHERE player_id = ?').get(playerId)?.c || 0;
    const total_scores = db.prepare('SELECT COUNT(*) as c FROM high_scores WHERE player_id = ?').get(playerId)?.c || 0;
    const systems_played = db.prepare(`
        SELECT COUNT(DISTINCT r.system_id) as c FROM play_history ph
        JOIN roms r ON r.id = ph.rom_id WHERE ph.player_id = ?
    `).get(playerId)?.c || 0;

    // Platform-specific plays
    const nintendo_plays = db.prepare(`
        SELECT COUNT(*) as c FROM play_history ph JOIN roms r ON r.id = ph.rom_id
        WHERE ph.player_id = ? AND r.system_id IN ('nes','snes','n64','gb','gbc','gba','nds','vb')
    `).get(playerId)?.c || 0;
    const sega_plays = db.prepare(`
        SELECT COUNT(*) as c FROM play_history ph JOIN roms r ON r.id = ph.rom_id
        WHERE ph.player_id = ? AND r.system_id IN ('genesis','sms','gamegear','saturn','32x')
    `).get(playerId)?.c || 0;
    const atari_plays = db.prepare(`
        SELECT COUNT(*) as c FROM play_history ph JOIN roms r ON r.id = ph.rom_id
        WHERE ph.player_id = ? AND r.system_id IN ('atari2600','atari7800','jaguar','lynx')
    `).get(playerId)?.c || 0;
    const arcade_plays = db.prepare(`
        SELECT COUNT(*) as c FROM play_history ph JOIN roms r ON r.id = ph.rom_id
        WHERE ph.player_id = ? AND r.system_id IN ('arcade','fbneo')
    `).get(playerId)?.c || 0;

    // Longest session
    const longest_session = db.prepare(
        'SELECT MAX(duration_seconds) as m FROM play_history WHERE player_id = ?'
    ).get(playerId)?.m || 0;

    // Streak: count consecutive days with plays (working backward from today)
    const playDates = db.prepare(`
        SELECT DISTINCT date(started_at) as d FROM play_history
        WHERE player_id = ? ORDER BY d DESC
    `).all(playerId).map(r => r.d);

    let streak_days = 0;
    if (playDates.length > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        // Streak must include today or yesterday
        if (playDates[0] === today || playDates[0] === yesterday) {
            streak_days = 1;
            for (let i = 1; i < playDates.length; i++) {
                const prev = new Date(playDates[i - 1]);
                const curr = new Date(playDates[i]);
                const diff = (prev - curr) / 86400000;
                if (diff === 1) streak_days++;
                else break;
            }
        }
    }

    return {
        level: player?.level || 1,
        total_plays, total_ratings, five_star_count, total_favorites,
        total_scores, systems_played,
        nintendo_plays, sega_plays, atari_plays, arcade_plays,
        longest_session, streak_days,
    };
}

// ═══════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════

// GET /api/progression/:playerId — full profile
router.get('/:playerId', (req, res) => {
    const db = getDB();
    const pid = parseInt(req.params.playerId);
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(pid);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const xp = player.xp || 0;
    const levelInfo = getLevelInfo(xp);
    const stats = computeStats(db, pid);
    const achievements = db.prepare(
        'SELECT type, title, description, data, unlocked_at FROM achievements WHERE player_id = ? ORDER BY unlocked_at DESC'
    ).all(pid);

    res.json({
        player_id: pid,
        name: player.name,
        emoji: player.emoji,
        color: player.color,
        xp,
        level: levelInfo.level,
        level_title: levelInfo.title,
        level_badge: levelInfo.badge,
        next_xp: levelInfo.next_xp,
        xp_progress: levelInfo.xp_progress,
        is_max_level: levelInfo.is_max,
        stats,
        achievements,
        total_achievements: achievements.length,
        possible_achievements: ACHIEVEMENTS.length,
    });
});

// POST /api/progression/action — award XP + check achievements
router.post('/action', (req, res) => {
    const db = getDB();
    const { playerId, action, romId, meta } = req.body;
    if (!playerId || !action) return res.status(400).json({ error: 'playerId and action required' });

    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    // Award base XP
    let xpGained = XP_AMOUNTS[action] || 0;

    // Bonus: long play session (> 5 min)
    if (action === 'play' && meta?.duration > 300) {
        xpGained += XP_AMOUNTS.play_long;
    }

    // Bonus: first play of the day
    if (action === 'play') {
        const todayPlays = db.prepare(`
            SELECT COUNT(*) as c FROM play_history
            WHERE player_id = ? AND date(started_at) = date('now')
        `).get(playerId)?.c || 0;
        if (todayPlays <= 1) xpGained += XP_AMOUNTS.first_of_day;
    }

    const oldXp = player.xp || 0;
    const newXp = oldXp + xpGained;
    const oldLevel = getLevelInfo(oldXp);
    const newLevel = getLevelInfo(newXp);
    const leveledUp = newLevel.level > oldLevel.level;

    // Update player XP and level
    db.prepare('UPDATE players SET xp = ?, level = ? WHERE id = ?').run(newXp, newLevel.level, playerId);

    // Check for new achievements
    const stats = computeStats(db, playerId);
    stats.level = newLevel.level; // use fresh level
    const existingAchievements = new Set(
        db.prepare('SELECT type FROM achievements WHERE player_id = ?').all(playerId).map(a => a.type)
    );

    const newAchievements = [];
    for (const ach of ACHIEVEMENTS) {
        if (existingAchievements.has(ach.id)) continue;
        if (ach.check(stats)) {
            db.prepare(
                'INSERT INTO achievements (player_id, type, title, description, data) VALUES (?, ?, ?, ?, ?)'
            ).run(playerId, ach.id, ach.title, ach.desc, JSON.stringify({ icon: ach.icon }));
            newAchievements.push({ id: ach.id, title: ach.title, desc: ach.desc, icon: ach.icon });

            // Log achievement activity
            db.prepare(
                'INSERT INTO activity_feed (player_id, type, data) VALUES (?, ?, ?)'
            ).run(playerId, 'achievement', JSON.stringify({ title: ach.title, icon: ach.icon }));
        }
    }

    // Log the action to activity feed
    const gameName = romId
        ? db.prepare('SELECT clean_name FROM roms WHERE id = ?').get(romId)?.clean_name
        : null;
    db.prepare(
        'INSERT INTO activity_feed (player_id, type, rom_id, data) VALUES (?, ?, ?, ?)'
    ).run(playerId, action, romId || null, JSON.stringify({
        game: gameName, xp: xpGained, duration: meta?.duration,
    }));

    // Log level up
    if (leveledUp) {
        db.prepare(
            'INSERT INTO activity_feed (player_id, type, data) VALUES (?, ?, ?)'
        ).run(playerId, 'level_up', JSON.stringify({
            old_level: oldLevel.level, new_level: newLevel.level,
            title: newLevel.title, badge: newLevel.badge,
        }));
    }

    res.json({
        xp_gained: xpGained,
        total_xp: newXp,
        level: newLevel.level,
        level_title: newLevel.title,
        level_badge: newLevel.badge,
        next_xp: newLevel.next_xp,
        xp_progress: newLevel.xp_progress,
        leveled_up: leveledUp,
        old_level: oldLevel.level,
        new_achievements: newAchievements,
    });
});

// GET /api/progression/feed/recent — activity feed
router.get('/feed/recent', (req, res) => {
    const db = getDB();
    const limit = parseInt(req.query.limit) || 30;
    const feed = db.prepare(`
        SELECT af.*, p.name as player_name, p.emoji as player_emoji, p.color as player_color,
               r.clean_name as game_name, r.system_id
        FROM activity_feed af
        LEFT JOIN players p ON p.id = af.player_id
        LEFT JOIN roms r ON r.id = af.rom_id
        ORDER BY af.created_at DESC LIMIT ?
    `).all(limit);
    res.json(feed);
});

// GET /api/progression/leaderboard — XP rankings
router.get('/ranks/leaderboard', (req, res) => {
    const db = getDB();
    const players = db.prepare(`
        SELECT id, name, emoji, color, xp, level FROM players
        WHERE name != 'Guest' ORDER BY xp DESC
    `).all();

    const ranked = players.map(p => ({
        ...p,
        ...getLevelInfo(p.xp || 0),
    }));
    res.json(ranked);
});

// GET /api/progression/levels — all level definitions (for client display)
router.get('/meta/levels', (req, res) => {
    res.json(LEVELS);
});

// GET /api/progression/achievements/all — all achievement definitions
router.get('/meta/achievements', (req, res) => {
    res.json(ACHIEVEMENTS.map(a => ({ id: a.id, title: a.title, desc: a.desc, icon: a.icon })));
});

export default router;
