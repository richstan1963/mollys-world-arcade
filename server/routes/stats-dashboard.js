import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// GET /global — overall arcade stats (no player needed)
router.get('/global', (req, res) => {
    try {
        const db = getDB();

        const totals = db.prepare(`
            SELECT COUNT(*) as total_roms,
                   (SELECT COUNT(DISTINCT system_id) FROM roms) as total_systems,
                   (SELECT COUNT(*) FROM players) as total_players,
                   (SELECT COUNT(*) FROM play_history) as total_plays,
                   (SELECT COALESCE(SUM(duration_seconds), 0) FROM play_history) as total_play_seconds,
                   (SELECT COUNT(*) FROM player_favorites) as total_favorites,
                   (SELECT COUNT(*) FROM high_scores) as total_scores,
                   (SELECT COUNT(*) FROM achievements) as total_achievements,
                   (SELECT COUNT(*) FROM original_scores) as total_original_scores
            FROM roms
        `).get();

        const topSystems = db.prepare(`
            SELECT r.system_id, s.short_name, s.color,
                   COUNT(ph.id) as play_count
            FROM play_history ph
            JOIN roms r ON r.id = ph.rom_id
            JOIN systems s ON s.id = r.system_id
            GROUP BY r.system_id
            ORDER BY play_count DESC
            LIMIT 10
        `).all();

        const topGames = db.prepare(`
            SELECT r.id as rom_id, r.clean_name, r.system_id,
                   s.short_name as system_name,
                   COUNT(ph.id) as play_count
            FROM play_history ph
            JOIN roms r ON r.id = ph.rom_id
            LEFT JOIN systems s ON s.id = r.system_id
            GROUP BY r.id
            ORDER BY play_count DESC
            LIMIT 10
        `).all();

        const topPlayers = db.prepare(`
            SELECT p.id, p.name, p.emoji, p.color, p.xp, p.level,
                   COUNT(ph.id) as play_count,
                   COALESCE(SUM(ph.duration_seconds), 0) as total_seconds
            FROM players p
            LEFT JOIN play_history ph ON ph.player_id = p.id
            GROUP BY p.id
            ORDER BY play_count DESC
        `).all();

        res.json({
            totals: {
                ...totals,
                total_play_hours: Math.round(totals.total_play_seconds / 3600 * 10) / 10,
            },
            top_systems: topSystems,
            top_games: topGames,
            top_players: topPlayers,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /systems — per-system stats
router.get('/systems', (req, res) => {
    try {
        const db = getDB();
        const stats = db.prepare(`
            SELECT s.id, s.name, s.short_name, s.color,
                   COUNT(r.id) as rom_count,
                   (SELECT COUNT(*) FROM play_history ph JOIN roms r2 ON r2.id = ph.rom_id WHERE r2.system_id = s.id) as play_count,
                   (SELECT COALESCE(SUM(ph2.duration_seconds), 0) FROM play_history ph2 JOIN roms r3 ON r3.id = ph2.rom_id WHERE r3.system_id = s.id) as total_seconds
            FROM systems s
            JOIN roms r ON r.system_id = s.id
            GROUP BY s.id
            HAVING COUNT(r.id) > 0
            ORDER BY play_count DESC
        `).all();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /timeline — play activity over time
router.get('/timeline', (req, res) => {
    try {
        const db = getDB();
        const days = Math.min(parseInt(req.query.days) || 30, 365);

        const timeline = db.prepare(`
            SELECT DATE(started_at) as date,
                   COUNT(*) as plays,
                   COUNT(DISTINCT player_id) as unique_players,
                   COUNT(DISTINCT rom_id) as unique_games,
                   COALESCE(SUM(duration_seconds), 0) as total_seconds
            FROM play_history
            WHERE started_at >= datetime('now', '-' || ? || ' days')
            GROUP BY DATE(started_at)
            ORDER BY date ASC
        `).all(days);

        res.json(timeline);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /player/:playerId — comprehensive stats
router.get('/player/:playerId', (req, res) => {
    try {
        const db = getDB();
        const playerId = req.params.playerId;

        const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
        if (!player) return res.status(404).json({ error: 'Player not found' });

        // Total play time and session count
        const playtime = db.prepare(`
            SELECT COUNT(*) as total_sessions,
                   COALESCE(SUM(duration_seconds), 0) as total_seconds,
                   COALESCE(AVG(duration_seconds), 0) as avg_session_seconds,
                   MAX(duration_seconds) as longest_session_seconds
            FROM play_history
            WHERE player_id = ?
        `).get(playerId);

        // Games per system breakdown
        const systemBreakdown = db.prepare(`
            SELECT r.system_id, s.short_name, s.color,
                   COUNT(DISTINCT ph.rom_id) as unique_games,
                   COUNT(ph.id) as total_plays,
                   SUM(ph.duration_seconds) as total_seconds
            FROM play_history ph
            JOIN roms r ON r.id = ph.rom_id
            JOIN systems s ON s.id = r.system_id
            WHERE ph.player_id = ?
            GROUP BY r.system_id
            ORDER BY total_plays DESC
        `).all(playerId);

        // Most played games (top 10)
        const mostPlayed = db.prepare(`
            SELECT r.id as rom_id, r.clean_name, r.system_id,
                   s.short_name as system_name,
                   m.artwork_path,
                   COUNT(ph.id) as play_count,
                   SUM(ph.duration_seconds) as total_seconds,
                   MAX(ph.started_at) as last_played
            FROM play_history ph
            JOIN roms r ON r.id = ph.rom_id
            LEFT JOIN systems s ON s.id = r.system_id
            LEFT JOIN metadata m ON m.rom_id = r.id
            WHERE ph.player_id = ?
            GROUP BY r.id
            ORDER BY play_count DESC
            LIMIT 10
        `).all(playerId);

        // Longest sessions
        const longestSessions = db.prepare(`
            SELECT ph.duration_seconds, ph.started_at,
                   r.clean_name as game_name, r.system_id, s.short_name as system_name
            FROM play_history ph
            JOIN roms r ON r.id = ph.rom_id
            LEFT JOIN systems s ON s.id = r.system_id
            WHERE ph.player_id = ? AND ph.duration_seconds > 0
            ORDER BY ph.duration_seconds DESC
            LIMIT 5
        `).all(playerId);

        // Rating distribution
        const ratingDist = db.prepare(`
            SELECT rating, COUNT(*) as count
            FROM player_ratings
            WHERE player_id = ?
            GROUP BY rating
            ORDER BY rating
        `).all(playerId);

        // Play activity heatmap — plays per hour of day
        const hourlyActivity = db.prepare(`
            SELECT CAST(strftime('%H', started_at) AS INTEGER) as hour, COUNT(*) as count
            FROM play_history
            WHERE player_id = ?
            GROUP BY hour
            ORDER BY hour
        `).all(playerId);

        // Plays per day of week (0=Sunday)
        const dailyActivity = db.prepare(`
            SELECT CAST(strftime('%w', started_at) AS INTEGER) as day_of_week, COUNT(*) as count
            FROM play_history
            WHERE player_id = ?
            GROUP BY day_of_week
            ORDER BY day_of_week
        `).all(playerId);

        // Favorite time of day
        let favoriteHour = null;
        if (hourlyActivity.length > 0) {
            const peak = hourlyActivity.reduce((a, b) => a.count > b.count ? a : b);
            favoriteHour = peak.hour;
        }

        // Month-over-month trends (last 6 months)
        const monthlyTrends = db.prepare(`
            SELECT strftime('%Y-%m', started_at) as month,
                   COUNT(*) as plays,
                   COUNT(DISTINCT rom_id) as unique_games,
                   SUM(duration_seconds) as total_seconds
            FROM play_history
            WHERE player_id = ?
            GROUP BY month
            ORDER BY month DESC
            LIMIT 6
        `).all(playerId);

        // Achievement completion
        const achievementCount = db.prepare('SELECT COUNT(*) as count FROM achievements WHERE player_id = ?').get(playerId).count;

        // Total unique games played
        const uniqueGames = db.prepare('SELECT COUNT(DISTINCT rom_id) as count FROM play_history WHERE player_id = ?').get(playerId).count;
        const totalGames = db.prepare('SELECT COUNT(*) as count FROM roms').get().count;
        const completionPct = totalGames > 0 ? Math.round((uniqueGames / totalGames) * 10000) / 100 : 0;

        // Favorites count
        const favCount = db.prepare('SELECT COUNT(*) as count FROM player_favorites WHERE player_id = ?').get(playerId).count;

        // High scores count
        const scoreCount = db.prepare('SELECT COUNT(*) as count FROM high_scores WHERE player_id = ?').get(playerId).count;

        // Comparison to family average
        const familyAvg = db.prepare(`
            SELECT AVG(player_plays) as avg_plays, AVG(player_seconds) as avg_seconds
            FROM (
                SELECT player_id, COUNT(*) as player_plays, SUM(duration_seconds) as player_seconds
                FROM play_history
                WHERE player_id IS NOT NULL
                GROUP BY player_id
            )
        `).get();

        res.json({
            player: {
                id: player.id,
                name: player.name,
                emoji: player.emoji,
                color: player.color,
                xp: player.xp,
                level: player.level,
            },
            playtime: {
                total_sessions: playtime.total_sessions,
                total_seconds: playtime.total_seconds,
                total_hours: Math.round(playtime.total_seconds / 3600 * 10) / 10,
                avg_session_seconds: Math.round(playtime.avg_session_seconds),
                avg_session_minutes: Math.round(playtime.avg_session_seconds / 60 * 10) / 10,
                longest_session_seconds: playtime.longest_session_seconds || 0,
                favorite_hour: favoriteHour,
            },
            system_breakdown: systemBreakdown,
            most_played: mostPlayed,
            longest_sessions: longestSessions,
            rating_distribution: ratingDist,
            heatmap: {
                hourly: hourlyActivity,
                daily: dailyActivity,
            },
            monthly_trends: monthlyTrends.reverse(),
            achievements: {
                total: achievementCount,
            },
            library: {
                unique_games_played: uniqueGames,
                total_games: totalGames,
                completion_pct: completionPct,
                favorites: favCount,
                high_scores: scoreCount,
            },
            comparison: {
                family_avg_plays: Math.round(familyAvg.avg_plays || 0),
                family_avg_seconds: Math.round(familyAvg.avg_seconds || 0),
                your_plays: playtime.total_sessions,
                your_seconds: playtime.total_seconds,
                plays_vs_avg: playtime.total_sessions - Math.round(familyAvg.avg_plays || 0),
                seconds_vs_avg: playtime.total_seconds - Math.round(familyAvg.avg_seconds || 0),
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Completion Stats — per-system exploration + achievement badges ─────────
router.get('/completion', (req, res) => {
    try {
        const db = getDB();

        // Per-system: total roms, unique played, total time, % explored
        const systems = db.prepare(`
            SELECT s.id, s.short_name, s.name, s.color,
                   COUNT(DISTINCT r.id)         as total_roms,
                   COUNT(DISTINCT ph.rom_id)    as played_roms,
                   COALESCE(SUM(ph.duration_seconds), 0) as total_seconds,
                   ROUND(COUNT(DISTINCT ph.rom_id) * 100.0 / COUNT(DISTINCT r.id), 1) as pct
            FROM systems s
            JOIN roms r ON r.system_id = s.id
            LEFT JOIN play_history ph ON ph.rom_id = r.id
            GROUP BY s.id
            HAVING total_roms > 0
            ORDER BY pct DESC, played_roms DESC
        `).all();

        // Overall totals
        const overall = db.prepare(`
            SELECT COUNT(DISTINCT r.id) as total_roms,
                   COUNT(DISTINCT ph.rom_id) as played_roms,
                   COALESCE(SUM(ph.duration_seconds), 0) as total_seconds,
                   COUNT(DISTINCT DATE(ph.started_at)) as days_played,
                   COUNT(ph.id) as total_sessions
            FROM roms r
            LEFT JOIN play_history ph ON ph.rom_id = r.id
        `).get();

        overall.pct = overall.total_roms > 0
            ? Math.round(overall.played_roms * 100 / overall.total_roms * 10) / 10
            : 0;

        // Most-played games (by session count)
        const topGames = db.prepare(`
            SELECT r.id, COALESCE(m.title, r.clean_name) as title, r.system_id,
                   s.short_name as system_name, s.color as system_color,
                   m.artwork_path,
                   COUNT(ph.id) as sessions,
                   COALESCE(SUM(ph.duration_seconds), 0) as total_seconds,
                   MAX(ph.started_at) as last_played
            FROM play_history ph
            JOIN roms r ON r.id = ph.rom_id
            LEFT JOIN metadata m ON m.rom_id = r.id
            LEFT JOIN systems s ON s.id = r.system_id
            GROUP BY r.id
            ORDER BY sessions DESC, total_seconds DESC
            LIMIT 15
        `).all();

        // Achievement badges — computed from overall stats
        const badges = [];
        const pr = overall.played_roms;
        const hrs = overall.total_seconds / 3600;
        const days = overall.days_played;
        const sessions = overall.total_sessions;

        if (pr >= 1)   badges.push({ id:'first',    icon:'🎮', title:'First Boot',     desc:'Played your first game',         earned: true });
        if (pr >= 10)  badges.push({ id:'explorer',  icon:'🗺️', title:'Explorer',       desc:'Played 10 unique games',          earned: true });
        if (pr >= 50)  badges.push({ id:'veteran',   icon:'🏅', title:'Veteran',         desc:'Played 50 unique games',          earned: true });
        if (pr >= 100) badges.push({ id:'centurion', icon:'💯', title:'Centurion',       desc:'Played 100 unique games',         earned: true });
        if (pr >= 250) badges.push({ id:'collector', icon:'🎯', title:'Collector',       desc:'Played 250 unique games',         earned: true });
        if (pr >= 500) badges.push({ id:'master',    icon:'🏆', title:'Library Master',  desc:'Played 500+ unique games',        earned: true });
        if (hrs >= 1)  badges.push({ id:'1hour',     icon:'⏱️', title:'Hour One',        desc:'Played for 1 total hour',         earned: true });
        if (hrs >= 10) badges.push({ id:'10hours',   icon:'🕐', title:'Dedicated',       desc:'Played for 10 total hours',       earned: true });
        if (hrs >= 50) badges.push({ id:'50hours',   icon:'🔥', title:'Obsessed',        desc:'Played for 50 total hours',       earned: true });
        if (days >= 3) badges.push({ id:'streak3',   icon:'📅', title:'Regular',         desc:'Played on 3+ different days',     earned: true });
        if (days >= 7) badges.push({ id:'streak7',   icon:'🗓️', title:'Weekly Warrior',  desc:'Played on 7+ different days',    earned: true });
        if (sessions >= 20) badges.push({ id:'s20',  icon:'🎰', title:'Arcade Rat',      desc:'Started 20+ sessions',            earned: true });

        // Locked (next milestones)
        const locked = [];
        if (pr < 10)   locked.push({ id:'explorer',  icon:'🗺️', title:'Explorer',       desc:'Play 10 unique games',            need: 10 - pr });
        if (pr < 50)   locked.push({ id:'veteran',   icon:'🏅', title:'Veteran',         desc:'Play 50 unique games',            need: 50 - pr });
        if (pr < 100)  locked.push({ id:'centurion', icon:'💯', title:'Centurion',       desc:'Play 100 unique games',           need: 100 - pr });
        if (pr < 250)  locked.push({ id:'collector', icon:'🎯', title:'Collector',       desc:'Play 250 unique games',           need: 250 - pr });
        if (hrs < 10)  locked.push({ id:'10hours',   icon:'🕐', title:'Dedicated',       desc:'Play for 10 total hours',         need: Math.ceil(10 - hrs) });
        if (days < 7)  locked.push({ id:'streak7',   icon:'🗓️', title:'Weekly Warrior',  desc:'Play on 7 different days',       need: 7 - days });

        res.json({ overall, systems, topGames, badges, locked: locked.slice(0, 4) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Weekly Competition ─────────────────────────────────────────────────────
router.get('/weekly', (req, res) => {
    try {
        const db = getDB();

        // Current week boundaries (Mon–Sun)
        const now = new Date();
        const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); // 1=Mon…7=Sun
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - (dayOfWeek - 1));
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        const wsISO = weekStart.toISOString().replace('T', ' ').slice(0, 19);
        const weISO = weekEnd.toISOString().replace('T', ' ').slice(0, 19);

        // Player leaderboard — sessions + time this week
        const leaderboard = db.prepare(`
            SELECT p.id, p.name, p.emoji, p.color, p.level,
                   COUNT(ph.id) as sessions,
                   COALESCE(SUM(ph.duration_seconds), 0) as total_seconds,
                   COUNT(DISTINCT ph.rom_id) as unique_games
            FROM players p
            LEFT JOIN play_history ph ON ph.player_id = p.id
                AND ph.started_at >= ? AND ph.started_at < ?
            GROUP BY p.id
            HAVING sessions > 0
            ORDER BY total_seconds DESC, sessions DESC
        `).all(wsISO, weISO);

        // Hottest game this week (most sessions)
        const hotGame = db.prepare(`
            SELECT r.id as rom_id, COALESCE(m.title, r.clean_name) as title,
                   r.system_id, s.short_name as system_name, s.color as system_color,
                   m.artwork_path,
                   COUNT(ph.id) as sessions,
                   COUNT(DISTINCT ph.player_id) as players
            FROM play_history ph
            JOIN roms r ON r.id = ph.rom_id
            LEFT JOIN metadata m ON m.rom_id = r.id
            LEFT JOIN systems s ON s.id = r.system_id
            WHERE ph.started_at >= ? AND ph.started_at < ?
            GROUP BY r.id
            ORDER BY sessions DESC, players DESC
            LIMIT 1
        `).get(wsISO, weISO);

        // Total arcade activity this week
        const weekTotals = db.prepare(`
            SELECT COUNT(*) as total_sessions,
                   COUNT(DISTINCT player_id) as active_players,
                   COUNT(DISTINCT rom_id) as unique_games,
                   COALESCE(SUM(duration_seconds), 0) as total_seconds
            FROM play_history
            WHERE started_at >= ? AND started_at < ?
        `).get(wsISO, weISO);

        // Days left in week
        const daysLeft = 7 - (dayOfWeek - 1);

        res.json({
            week_start: wsISO,
            week_end: weISO,
            days_left: daysLeft,
            leaderboard,
            hot_game: hotGame || null,
            totals: {
                ...weekTotals,
                total_hours: Math.round(weekTotals.total_seconds / 3600 * 10) / 10,
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
