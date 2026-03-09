/**
 * COMMAND CENTER — Aggregated stats endpoint
 * Powers the ops dashboard with a single API call.
 */
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';

const router = Router();

// ═══════════════════════════════════════════════════════════
// GET /api/command-center/stats — Everything the CC needs
// ═══════════════════════════════════════════════════════════
router.get('/stats', (req, res) => {
    const db = req.app.get('db');

    try {
        // ── PULSE ──
        const totalRoms = db.prepare('SELECT COUNT(*) as c FROM roms').get().c;
        const totalSystems = db.prepare('SELECT COUNT(DISTINCT system_id) as c FROM roms').get().c;
        const allSystems = totalSystems;
        const totalPlayers = db.prepare('SELECT COUNT(*) as c FROM players').get().c;
        const totalSessions = db.prepare('SELECT COUNT(*) as c FROM play_history').get().c;
        const totalPlayTime = db.prepare('SELECT COALESCE(SUM(duration_seconds),0) as s FROM play_history').get().s;
        const romsToday = db.prepare("SELECT COUNT(*) as c FROM roms WHERE added_at >= datetime('now','-1 day')").get().c;
        const romsWeek = db.prepare("SELECT COUNT(*) as c FROM roms WHERE added_at >= datetime('now','-7 days')").get().c;
        const activeTodayCount = db.prepare("SELECT COUNT(DISTINCT player_id) as c FROM play_history WHERE player_id IS NOT NULL AND started_at >= datetime('now','-1 day')").get().c;

        let dbSize = 0;
        try { dbSize = fs.statSync(CONFIG.DB_PATH).size; } catch {}

        // ── PLAYERS ──
        const players = db.prepare(`
            SELECT p.*,
                COALESCE((SELECT COUNT(*) FROM player_favorites WHERE player_id = p.id), 0) as fav_count,
                COALESCE((SELECT COUNT(*) FROM achievements WHERE player_id = p.id), 0) as achievement_count,
                COALESCE((SELECT COUNT(*) FROM play_history WHERE player_id = p.id), 0) as play_count,
                (SELECT MAX(started_at) FROM play_history WHERE player_id = p.id) as last_played,
                COALESCE((SELECT SUM(duration_seconds) FROM play_history WHERE player_id = p.id), 0) as total_play_seconds
            FROM players p ORDER BY p.sort_order
        `).all();

        // Add level titles
        const LEVELS = [
            { level: 1,  xp: 0,     title: 'Newbie' },
            { level: 2,  xp: 50,    title: 'Button Masher' },
            { level: 3,  xp: 150,   title: 'Quarter Muncher' },
            { level: 4,  xp: 300,   title: 'Pixel Pusher' },
            { level: 5,  xp: 500,   title: 'Console Cadet' },
            { level: 6,  xp: 750,   title: 'Joystick Jockey' },
            { level: 7,  xp: 1050,  title: 'Power Player' },
            { level: 8,  xp: 1400,  title: 'Score Chaser' },
            { level: 9,  xp: 1800,  title: 'Boss Beater' },
            { level: 10, xp: 2300,  title: 'Pixel Pioneer' },
            { level: 11, xp: 2900,  title: 'Speed Runner' },
            { level: 12, xp: 3600,  title: 'Combo King' },
            { level: 13, xp: 4400,  title: 'Game Guru' },
            { level: 14, xp: 5300,  title: '8-Bit Legend' },
            { level: 15, xp: 6300,  title: 'Retro Royal' },
        ];
        for (const p of players) {
            const lvl = LEVELS.find(l => l.level === (p.level || 1)) || LEVELS[0];
            p.level_title = lvl.title;
            const nextLvl = LEVELS.find(l => l.level === (p.level || 1) + 1);
            p.xp_for_next = nextLvl ? nextLvl.xp : null;
        }

        // ── SYSTEMS ──
        const systems = db.prepare(`
            SELECT s.*,
                COALESCE((SELECT COUNT(*) FROM roms WHERE system_id = s.id), 0) as rom_count,
                COALESCE((SELECT COUNT(*) FROM metadata m JOIN roms r ON m.rom_id = r.id WHERE r.system_id = s.id AND m.artwork_path IS NOT NULL), 0) as artwork_count
            FROM systems s
            WHERE (SELECT COUNT(*) FROM roms WHERE system_id = s.id) > 0
            ORDER BY s.sort_order
        `).all();

        // ── METADATA / IMAGE PIPELINE ──
        const totalWithArtwork = db.prepare('SELECT COUNT(*) as c FROM metadata WHERE artwork_path IS NOT NULL').get().c;
        const totalWithoutArtwork = totalRoms - totalWithArtwork;
        const artworkPct = totalRoms > 0 ? Math.round((totalWithArtwork / totalRoms) * 100) : 0;
        const totalWithTitle = db.prepare("SELECT COUNT(*) as c FROM metadata WHERE title IS NOT NULL AND title != ''").get().c;
        const totalWithGenre = db.prepare("SELECT COUNT(*) as c FROM metadata WHERE genre IS NOT NULL AND genre != ''").get().c;
        const totalWithYear = db.prepare("SELECT COUNT(*) as c FROM metadata WHERE year IS NOT NULL AND year != ''").get().c;

        // Genre distribution
        const genreRows = db.prepare("SELECT genre, COUNT(*) as c FROM metadata WHERE genre IS NOT NULL AND genre != '' GROUP BY genre ORDER BY c DESC LIMIT 12").all();
        const genreDistribution = {};
        for (const r of genreRows) genreDistribution[r.genre] = r.c;

        // ── DOWNLOADS / SCRAPER ──
        const dlTotal = db.prepare('SELECT COUNT(*) as c FROM downloads').get().c;
        const dlPending = db.prepare("SELECT COUNT(*) as c FROM downloads WHERE status = 'pending'").get().c;
        const dlCompleted = db.prepare("SELECT COUNT(*) as c FROM downloads WHERE status = 'completed'").get().c;
        const dlFailed = db.prepare("SELECT COUNT(*) as c FROM downloads WHERE status = 'error'").get().c;
        const dlRecent = db.prepare("SELECT * FROM downloads ORDER BY created_at DESC LIMIT 5").all();

        // ── SCANNER ──
        const scanPaths = db.prepare('SELECT * FROM scan_paths ORDER BY id').all();

        // ── PROGRESSION ──
        const leaderboard = db.prepare(`
            SELECT p.id, p.name, p.emoji, p.color, p.xp, p.level,
                COALESCE((SELECT COUNT(*) FROM achievements WHERE player_id = p.id), 0) as achievements
            FROM players p ORDER BY p.xp DESC
        `).all();
        for (const p of leaderboard) {
            const lvl = LEVELS.find(l => l.level === (p.level || 1)) || LEVELS[0];
            p.level_title = lvl.title;
        }

        const totalAchievements = db.prepare('SELECT COUNT(*) as c FROM achievements').get().c;
        const recentActivity = db.prepare(`
            SELECT af.*, p.name as player_name, p.emoji as player_emoji, p.color as player_color,
                r.clean_name as game_name
            FROM activity_feed af
            LEFT JOIN players p ON af.player_id = p.id
            LEFT JOIN roms r ON af.rom_id = r.id
            ORDER BY af.created_at DESC LIMIT 15
        `).all();

        // ── STORAGE ──
        let romsSize = 0, artworkSize = 0, savesSize = 0;
        try { romsSize = getDirSize(CONFIG.ROMS_DIR); } catch {}
        try { artworkSize = getDirSize(CONFIG.ARTWORK_DIR); } catch {}
        try { savesSize = getDirSize(CONFIG.SAVES_DIR); } catch {}

        // ── FAVORITES / RATINGS ──
        const totalFavorites = db.prepare('SELECT COUNT(*) as c FROM player_favorites').get().c;
        const totalRatings = db.prepare('SELECT COUNT(*) as c FROM player_ratings').get().c;
        const avgRating = db.prepare('SELECT COALESCE(AVG(rating), 0) as avg FROM player_ratings').get().avg;
        const totalScores = db.prepare('SELECT COUNT(*) as c FROM high_scores').get().c;

        res.json({
            pulse: {
                total_roms: totalRoms,
                total_systems: allSystems,
                active_systems: totalSystems,
                total_players: totalPlayers,
                db_size_bytes: dbSize,
                total_play_sessions: totalSessions,
                total_play_time_seconds: totalPlayTime,
                roms_added_today: romsToday,
                roms_added_week: romsWeek,
                active_today: activeTodayCount,
                total_favorites: totalFavorites,
                total_ratings: totalRatings,
                avg_rating: Math.round(avgRating * 10) / 10,
                total_scores: totalScores,
            },
            players,
            systems,
            metadata: {
                total_with_artwork: totalWithArtwork,
                total_without_artwork: totalWithoutArtwork,
                artwork_pct: artworkPct,
                total_with_title: totalWithTitle,
                total_with_genre: totalWithGenre,
                total_with_year: totalWithYear,
                genre_distribution: genreDistribution,
            },
            downloads: {
                total: dlTotal,
                pending: dlPending,
                completed: dlCompleted,
                failed: dlFailed,
                recent: dlRecent,
            },
            scanner: {
                paths: scanPaths,
            },
            progression: {
                leaderboard,
                total_achievements: totalAchievements,
                total_possible: totalPlayers * 20,
                recent_activity: recentActivity,
            },
            storage: {
                roms_bytes: romsSize,
                artwork_bytes: artworkSize,
                saves_bytes: savesSize,
                db_bytes: dbSize,
            },
        });
    } catch (err) {
        console.error('Command Center stats error:', err);
        res.status(500).json({ error: 'Failed to load stats' });
    }
});

// Recursive directory size calculator
function getDirSize(dirPath) {
    let total = 0;
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dirPath, entry.name);
            if (entry.isFile()) {
                total += fs.statSync(full).size;
            } else if (entry.isDirectory()) {
                total += getDirSize(full);
            }
        }
    } catch {}
    return total;
}

export default router;
