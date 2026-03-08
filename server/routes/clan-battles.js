import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

// ══════════════════════════════════════
// CLAN LEADERBOARD + POWER RATINGS
// ══════════════════════════════════════

router.get('/leaderboard', (req, res) => {
    const db = getDB();

    // Single aggregated query — replaces 9 N+1 queries per clan
    const clanStats = db.prepare(`
        SELECT c.*,
            (SELECT COUNT(*) FROM clan_members WHERE clan_id = c.id) as memberCount,
            (SELECT COUNT(*) FROM player_favorites pf JOIN clan_members cm ON cm.player_id = pf.player_id WHERE cm.clan_id = c.id) as totalFavs,
            (SELECT COALESCE(SUM(ph.duration_seconds), 0) FROM play_history ph JOIN clan_members cm ON cm.player_id = ph.player_id WHERE cm.clan_id = c.id) as totalPlayTime,
            (SELECT COALESCE(SUM(hs.score), 0) FROM high_scores hs JOIN clan_members cm ON cm.player_id = hs.player_id WHERE cm.clan_id = c.id) as totalHighScores,
            (SELECT COALESCE(SUM(os.score), 0) FROM original_scores os JOIN clan_members cm ON cm.player_id = os.player_id WHERE cm.clan_id = c.id) as totalOrigScores,
            (SELECT COALESCE(SUM(p.xp), 0) FROM players p JOIN clan_members cm ON cm.player_id = p.id WHERE cm.clan_id = c.id) as totalXP,
            (SELECT COUNT(*) FROM clan_achievements WHERE clan_id = c.id) as achievementCount,
            (SELECT COUNT(*) FROM clan_territories WHERE clan_id = c.id) as territories,
            (SELECT COUNT(*) FROM clan_bounties WHERE claimed_by_clan_id = c.id) as bountiesClaimed
        FROM clans c ORDER BY c.sort_order
    `).all();

    const leaderboard = clanStats.map(clan => {
        const { memberCount, totalFavs, totalPlayTime, totalHighScores, totalOrigScores, totalXP, achievementCount, territories, bountiesClaimed } = clan;

        // Power Rating formula
        const power = Math.round(
            (totalXP * 1) +
            (totalHighScores * 0.01) +
            (totalOrigScores * 0.01) +
            (totalFavs * 5) +
            (totalPlayTime * 0.1) +
            (clan.wins * 100) +
            (achievementCount * 50) +
            (territories * 200) +
            (bountiesClaimed * 75)
        );

        // Rank title based on power
        let rank = 'Rookie';
        if (power >= 50000) rank = 'Legendary';
        else if (power >= 20000) rank = 'Elite';
        else if (power >= 10000) rank = 'Veteran';
        else if (power >= 5000) rank = 'Warrior';
        else if (power >= 2000) rank = 'Challenger';
        else if (power >= 500) rank = 'Contender';

        return {
            ...clan,
            member_count: memberCount,
            total_favs: totalFavs,
            total_play_time: totalPlayTime,
            total_high_scores: totalHighScores,
            total_orig_scores: totalOrigScores,
            total_xp: totalXP,
            achievement_count: achievementCount,
            territory_count: territories,
            bounties_claimed: bountiesClaimed,
            power,
            rank,
        };
    });

    leaderboard.sort((a, b) => b.power - a.power);
    res.json({ leaderboard });
});

// ══════════════════════════════════════
// CLAN PROFILE
// ══════════════════════════════════════

router.get('/profile/:id', (req, res) => {
    const db = getDB();
    const clanId = parseInt(req.params.id);
    const clan = db.prepare('SELECT * FROM clans WHERE id = ?').get(clanId);
    if (!clan) return res.status(404).json({ error: 'Clan not found' });

    // Members with stats
    const members = db.prepare(`
        SELECT p.*,
            (SELECT COUNT(*) FROM player_favorites pf WHERE pf.player_id = p.id) as fav_count,
            (SELECT COALESCE(SUM(hs.score), 0) FROM high_scores hs WHERE hs.player_id = p.id) as total_score,
            (SELECT COALESCE(SUM(ph.duration_seconds), 0) FROM play_history ph WHERE ph.player_id = p.id) as play_time
        FROM players p
        JOIN clan_members cm ON cm.player_id = p.id
        WHERE cm.clan_id = ?
        ORDER BY p.xp DESC
    `).all(clanId);

    // MVP (highest XP member)
    const mvp = members.length > 0 ? members[0] : null;

    // Recent challenges
    const challenges = db.prepare(`
        SELECT cc.*,
            c1.name as challenger_name, c1.emoji as challenger_emoji, c1.color as challenger_color,
            c2.name as defender_name, c2.emoji as defender_emoji, c2.color as defender_color
        FROM clan_challenges cc
        JOIN clans c1 ON c1.id = cc.challenger_clan_id
        JOIN clans c2 ON c2.id = cc.defender_clan_id
        WHERE cc.challenger_clan_id = ? OR cc.defender_clan_id = ?
        ORDER BY cc.created_at DESC LIMIT 20
    `).all(clanId, clanId);

    // Achievements
    const achievements = db.prepare('SELECT * FROM clan_achievements WHERE clan_id = ? ORDER BY unlocked_at DESC').all(clanId);

    // Territories
    const territories = db.prepare(`
        SELECT ct.*, r.clean_name, r.filename, r.system_id
        FROM clan_territories ct
        JOIN roms r ON r.id = ct.rom_id
        WHERE ct.clan_id = ?
        ORDER BY ct.top_score DESC LIMIT 20
    `).all(clanId);

    // Recent feed
    const feed = db.prepare(`
        SELECT cf.*, p.name as player_name, p.emoji as player_emoji
        FROM clan_feed cf
        LEFT JOIN players p ON p.id = cf.player_id
        WHERE cf.clan_id = ?
        ORDER BY cf.created_at DESC LIMIT 30
    `).all(clanId);

    // Rival detection (clan they've battled most)
    const rival = db.prepare(`
        SELECT clan_id, COUNT(*) as battles FROM (
            SELECT CASE WHEN challenger_clan_id = ? THEN defender_clan_id ELSE challenger_clan_id END as clan_id
            FROM clan_challenges
            WHERE (challenger_clan_id = ? OR defender_clan_id = ?) AND status = 'completed'
        ) GROUP BY clan_id ORDER BY battles DESC LIMIT 1
    `).get(clanId, clanId, clanId);

    let rivalClan = null;
    if (rival) {
        rivalClan = db.prepare('SELECT * FROM clans WHERE id = ?').get(rival.clan_id);
        if (rivalClan) rivalClan.battle_count = rival.battles;
    }

    res.json({
        clan, members, mvp, challenges, achievements, territories, feed, rival: rivalClan,
    });
});

// Update clan profile (motto, banner)
router.patch('/profile/:id', (req, res) => {
    const db = getDB();
    const clanId = parseInt(req.params.id);
    const { motto, banner_color } = req.body;

    const updates = [];
    const values = [];
    if (motto !== undefined) { updates.push('motto = ?'); values.push(motto); }
    if (banner_color !== undefined) { updates.push('banner_color = ?'); values.push(banner_color); }

    if (updates.length === 0) return res.json({ ok: true });
    values.push(clanId);
    db.prepare(`UPDATE clans SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json(db.prepare('SELECT * FROM clans WHERE id = ?').get(clanId));
});

// ══════════════════════════════════════
// CLAN CHALLENGES (1v1 battles)
// ══════════════════════════════════════

// List challenges
router.get('/challenges', (req, res) => {
    const db = getDB();
    const status = req.query.status || 'all';
    let where = '';
    if (status !== 'all') where = `WHERE cc.status = '${status}'`;

    const challenges = db.prepare(`
        SELECT cc.*,
            c1.name as challenger_name, c1.emoji as challenger_emoji, c1.color as challenger_color,
            c2.name as defender_name, c2.emoji as defender_emoji, c2.color as defender_color,
            w.name as winner_name, w.emoji as winner_emoji
        FROM clan_challenges cc
        JOIN clans c1 ON c1.id = cc.challenger_clan_id
        JOIN clans c2 ON c2.id = cc.defender_clan_id
        LEFT JOIN clans w ON w.id = cc.winner_clan_id
        ${where}
        ORDER BY cc.created_at DESC
        LIMIT 50
    `).all();

    res.json({ challenges });
});

// Create a challenge
router.post('/challenges', (req, res) => {
    const db = getDB();
    const { challenger_clan_id, defender_clan_id, title, game_type, game_id, rom_id, duration_hours } = req.body;

    if (!challenger_clan_id || !defender_clan_id) return res.status(400).json({ error: 'Two clans required' });
    if (challenger_clan_id === defender_clan_id) return res.status(400).json({ error: 'Cannot challenge yourself' });

    const now = new Date();
    const end = new Date(now.getTime() + (duration_hours || 24) * 60 * 60 * 1000);

    const result = db.prepare(`
        INSERT INTO clan_challenges (challenger_clan_id, defender_clan_id, title, game_type, game_id, rom_id, status, start_time, end_time)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(challenger_clan_id, defender_clan_id, title || 'Clan Battle!', game_type || 'any', game_id || null, rom_id || null, now.toISOString(), end.toISOString());

    // Feed entry for both clans
    const challenge = db.prepare('SELECT * FROM clan_challenges WHERE id = ?').get(result.lastInsertRowid);
    const c1 = db.prepare('SELECT name, emoji FROM clans WHERE id = ?').get(challenger_clan_id);
    const c2 = db.prepare('SELECT name, emoji FROM clans WHERE id = ?').get(defender_clan_id);

    const feedMsg = `${c1.emoji} ${c1.name} challenged ${c2.emoji} ${c2.name}: "${challenge.title}"`;
    db.prepare('INSERT INTO clan_feed (clan_id, type, message) VALUES (?, ?, ?)').run(challenger_clan_id, 'challenge_issued', feedMsg);
    db.prepare('INSERT INTO clan_feed (clan_id, type, message) VALUES (?, ?, ?)').run(defender_clan_id, 'challenge_received', feedMsg);

    res.json(challenge);
});

// Submit a score to a challenge
router.post('/challenges/:id/score', (req, res) => {
    const db = getDB();
    const challengeId = parseInt(req.params.id);
    const { player_id, clan_id, score, meta } = req.body;

    const challenge = db.prepare('SELECT * FROM clan_challenges WHERE id = ?').get(challengeId);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    if (challenge.status !== 'active') return res.status(400).json({ error: 'Challenge is not active' });

    // Verify player is in the clan
    const membership = db.prepare('SELECT 1 FROM clan_members WHERE player_id = ? AND clan_id = ?').get(parseInt(player_id), parseInt(clan_id));
    if (!membership) return res.status(403).json({ error: 'Player is not in this clan' });

    // Verify clan is part of the challenge
    if (parseInt(clan_id) !== challenge.challenger_clan_id && parseInt(clan_id) !== challenge.defender_clan_id) {
        return res.status(403).json({ error: 'Clan is not part of this challenge' });
    }

    db.prepare(`
        INSERT INTO challenge_scores (challenge_id, player_id, clan_id, score, meta) VALUES (?, ?, ?, ?, ?)
    `).run(challengeId, parseInt(player_id), parseInt(clan_id), score, meta ? JSON.stringify(meta) : null);

    // Update totals
    const challengerTotal = db.prepare('SELECT COALESCE(SUM(score), 0) as t FROM challenge_scores WHERE challenge_id = ? AND clan_id = ?').get(challengeId, challenge.challenger_clan_id).t;
    const defenderTotal = db.prepare('SELECT COALESCE(SUM(score), 0) as t FROM challenge_scores WHERE challenge_id = ? AND clan_id = ?').get(challengeId, challenge.defender_clan_id).t;
    db.prepare('UPDATE clan_challenges SET challenger_score = ?, defender_score = ? WHERE id = ?').run(challengerTotal, defenderTotal, challengeId);

    // Feed
    const player = db.prepare('SELECT name, emoji FROM players WHERE id = ?').get(parseInt(player_id));
    const clan = db.prepare('SELECT name, emoji FROM clans WHERE id = ?').get(parseInt(clan_id));
    db.prepare('INSERT INTO clan_feed (clan_id, player_id, type, message) VALUES (?, ?, ?, ?)').run(
        parseInt(clan_id), parseInt(player_id), 'challenge_score',
        `${player.emoji} ${player.name} scored ${score.toLocaleString()} for ${clan.emoji} ${clan.name}!`
    );

    res.json({ challenger_score: challengerTotal, defender_score: defenderTotal });
});

// End/resolve a challenge
router.post('/challenges/:id/resolve', (req, res) => {
    const db = getDB();
    const challengeId = parseInt(req.params.id);
    const challenge = db.prepare('SELECT * FROM clan_challenges WHERE id = ?').get(challengeId);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    let winnerId = null;
    if (challenge.challenger_score > challenge.defender_score) winnerId = challenge.challenger_clan_id;
    else if (challenge.defender_score > challenge.challenger_score) winnerId = challenge.defender_clan_id;

    db.prepare('UPDATE clan_challenges SET status = ?, winner_clan_id = ? WHERE id = ?').run('completed', winnerId, challengeId);

    // Update win/loss records
    if (winnerId) {
        const loserId = winnerId === challenge.challenger_clan_id ? challenge.defender_clan_id : challenge.challenger_clan_id;
        db.prepare('UPDATE clans SET wins = wins + 1, xp = xp + 100 WHERE id = ?').run(winnerId);
        db.prepare('UPDATE clans SET losses = losses + 1 WHERE id = ?').run(loserId);

        const winner = db.prepare('SELECT name, emoji FROM clans WHERE id = ?').get(winnerId);
        const loser = db.prepare('SELECT name, emoji FROM clans WHERE id = ?').get(loserId);
        const msg = `${winner.emoji} ${winner.name} defeated ${loser.emoji} ${loser.name}! (${challenge.challenger_score} - ${challenge.defender_score})`;
        db.prepare('INSERT INTO clan_feed (clan_id, type, message) VALUES (?, ?, ?)').run(winnerId, 'challenge_won', msg);
        db.prepare('INSERT INTO clan_feed (clan_id, type, message) VALUES (?, ?, ?)').run(loserId, 'challenge_lost', msg);
    } else {
        db.prepare('UPDATE clans SET draws = draws + 1 WHERE id = ?').run(challenge.challenger_clan_id);
        db.prepare('UPDATE clans SET draws = draws + 1 WHERE id = ?').run(challenge.defender_clan_id);
    }

    res.json(db.prepare('SELECT * FROM clan_challenges WHERE id = ?').get(challengeId));
});

// ══════════════════════════════════════
// TRASH TALK
// ══════════════════════════════════════

router.get('/messages', (req, res) => {
    const db = getDB();
    const clanId = req.query.clan_id ? parseInt(req.query.clan_id) : null;
    const challengeId = req.query.challenge_id ? parseInt(req.query.challenge_id) : null;

    let query = `
        SELECT m.*, p.name as player_name, p.emoji as player_emoji, p.color as player_color,
            fc.name as from_clan_name, fc.emoji as from_clan_emoji, fc.color as from_clan_color,
            tc.name as to_clan_name, tc.emoji as to_clan_emoji, tc.color as to_clan_color
        FROM clan_messages m
        JOIN players p ON p.id = m.player_id
        JOIN clans fc ON fc.id = m.from_clan_id
        LEFT JOIN clans tc ON tc.id = m.to_clan_id
    `;
    const conditions = [];
    const params = [];

    if (clanId) { conditions.push('(m.from_clan_id = ? OR m.to_clan_id = ?)'); params.push(clanId, clanId); }
    if (challengeId) { conditions.push('m.challenge_id = ?'); params.push(challengeId); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY m.created_at DESC LIMIT 100';

    res.json({ messages: db.prepare(query).all(...params) });
});

router.post('/messages', (req, res) => {
    const db = getDB();
    const { from_clan_id, to_clan_id, player_id, message, challenge_id } = req.body;
    if (!from_clan_id || !player_id || !message?.trim()) return res.status(400).json({ error: 'from_clan_id, player_id, and message required' });

    // Verify player is in the clan
    const membership = db.prepare('SELECT 1 FROM clan_members WHERE player_id = ? AND clan_id = ?').get(parseInt(player_id), parseInt(from_clan_id));
    if (!membership) return res.status(403).json({ error: 'Player is not in this clan' });

    const result = db.prepare(`
        INSERT INTO clan_messages (from_clan_id, to_clan_id, player_id, message, challenge_id) VALUES (?, ?, ?, ?, ?)
    `).run(parseInt(from_clan_id), to_clan_id ? parseInt(to_clan_id) : null, parseInt(player_id), message.trim(), challenge_id ? parseInt(challenge_id) : null);

    res.json(db.prepare('SELECT * FROM clan_messages WHERE id = ?').get(result.lastInsertRowid));
});

// ══════════════════════════════════════
// CLAN ACHIEVEMENTS
// ══════════════════════════════════════

router.get('/achievements/:clanId', (req, res) => {
    const db = getDB();
    res.json({
        achievements: db.prepare('SELECT * FROM clan_achievements WHERE clan_id = ? ORDER BY unlocked_at DESC').all(parseInt(req.params.clanId))
    });
});

// Check and award clan achievements (call after score submissions, etc.)
router.post('/check-achievements/:clanId', (req, res) => {
    const db = getDB();
    const clanId = parseInt(req.params.clanId);
    const awarded = [];

    const has = (type) => db.prepare('SELECT 1 FROM clan_achievements WHERE clan_id = ? AND type = ?').get(clanId, type);
    const award = (type, title, description, icon) => {
        if (has(type)) return;
        db.prepare('INSERT INTO clan_achievements (clan_id, type, title, description, icon) VALUES (?, ?, ?, ?, ?)').run(clanId, type, title, description, icon);
        db.prepare('INSERT INTO clan_feed (clan_id, type, message) VALUES (?, ?, ?)').run(clanId, 'achievement', `🏆 Unlocked: ${title}`);
        db.prepare('UPDATE clans SET xp = xp + 50 WHERE id = ?').run(clanId);
        awarded.push({ type, title, icon });
    };

    const memberCount = db.prepare('SELECT COUNT(*) as c FROM clan_members WHERE clan_id = ?').get(clanId).c;
    const totalGames = db.prepare(`
        SELECT COUNT(DISTINCT ph.rom_id) as c FROM play_history ph
        JOIN clan_members cm ON cm.player_id = ph.player_id WHERE cm.clan_id = ?
    `).get(clanId).c;
    const totalPlayTime = db.prepare(`
        SELECT COALESCE(SUM(ph.duration_seconds), 0) as t FROM play_history ph
        JOIN clan_members cm ON cm.player_id = ph.player_id WHERE cm.clan_id = ?
    `).get(clanId).t;
    const wins = db.prepare('SELECT wins FROM clans WHERE id = ?').get(clanId)?.wins || 0;
    const territories = db.prepare('SELECT COUNT(*) as c FROM clan_territories WHERE clan_id = ?').get(clanId).c;

    // Roster achievements
    if (memberCount >= 3) award('roster_3', 'Squad Up', '3 members joined the clan', '👥');
    if (memberCount >= 5) award('roster_5', 'Full House', '5 members in the clan', '🏠');
    if (memberCount >= 10) award('roster_10', 'Army', '10 members strong', '⚔️');

    // Gaming achievements
    if (totalGames >= 10) award('games_10', 'Dabbling', 'Clan tried 10 different games', '🎮');
    if (totalGames >= 50) award('games_50', 'Diverse Taste', 'Clan tried 50 different games', '🌈');
    if (totalGames >= 100) award('games_100', 'Game Connoisseur', 'Clan tried 100 different games', '👑');

    // Time achievements
    if (totalPlayTime >= 3600) award('time_1h', 'First Hour', 'Clan played for 1 hour total', '⏱️');
    if (totalPlayTime >= 36000) award('time_10h', 'Dedicated', 'Clan played for 10 hours total', '🔥');
    if (totalPlayTime >= 360000) award('time_100h', 'No Life', 'Clan played for 100 hours total', '💀');

    // Battle achievements
    if (wins >= 1) award('wins_1', 'First Blood', 'Won first clan battle', '🗡️');
    if (wins >= 5) award('wins_5', 'Battle Hardened', 'Won 5 clan battles', '🛡️');
    if (wins >= 10) award('wins_10', 'Warlord', 'Won 10 clan battles', '👹');
    if (wins >= 25) award('wins_25', 'Unstoppable', 'Won 25 clan battles', '🌋');

    // Territory achievements
    if (territories >= 1) award('territory_1', 'Land Grab', 'Claimed first territory', '🏴');
    if (territories >= 5) award('territory_5', 'Expanding Empire', 'Claimed 5 territories', '🗺️');
    if (territories >= 20) award('territory_20', 'World Domination', 'Claimed 20 territories', '🌍');

    res.json({ awarded });
});

// ══════════════════════════════════════
// ACTIVITY FEED
// ══════════════════════════════════════

router.get('/feed', (req, res) => {
    const db = getDB();
    const clanId = req.query.clan_id ? parseInt(req.query.clan_id) : null;

    let query = `
        SELECT cf.*, p.name as player_name, p.emoji as player_emoji, p.color as player_color,
            c.name as clan_name, c.emoji as clan_emoji, c.color as clan_color
        FROM clan_feed cf
        LEFT JOIN players p ON p.id = cf.player_id
        JOIN clans c ON c.id = cf.clan_id
    `;
    if (clanId) query += ` WHERE cf.clan_id = ?`;
    query += ' ORDER BY cf.created_at DESC LIMIT 50';

    res.json({ feed: clanId ? db.prepare(query).all(clanId) : db.prepare(query).all() });
});

// ══════════════════════════════════════
// TERRITORIES
// ══════════════════════════════════════

router.get('/territories', (req, res) => {
    const db = getDB();
    const territories = db.prepare(`
        SELECT ct.*, r.clean_name, r.filename, r.system_id,
            c.name as clan_name, c.emoji as clan_emoji, c.color as clan_color,
            p.name as player_name, p.emoji as player_emoji
        FROM clan_territories ct
        JOIN roms r ON r.id = ct.rom_id
        JOIN clans c ON c.id = ct.clan_id
        LEFT JOIN players p ON p.id = ct.top_player_id
        ORDER BY ct.top_score DESC
    `).all();
    res.json({ territories });
});

// Claim/update a territory (called when a high score is set)
router.post('/territories/claim', (req, res) => {
    const db = getDB();
    const { rom_id, clan_id, player_id, score } = req.body;
    if (!rom_id || !clan_id || !score) return res.status(400).json({ error: 'rom_id, clan_id, score required' });

    const existing = db.prepare('SELECT * FROM clan_territories WHERE rom_id = ?').get(parseInt(rom_id));

    if (!existing || score > existing.top_score) {
        db.prepare(`
            INSERT INTO clan_territories (rom_id, clan_id, top_score, top_player_id)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(rom_id) DO UPDATE SET clan_id = ?, top_score = ?, top_player_id = ?, claimed_at = datetime('now')
        `).run(parseInt(rom_id), parseInt(clan_id), score, player_id ? parseInt(player_id) : null,
               parseInt(clan_id), score, player_id ? parseInt(player_id) : null);

        const rom = db.prepare('SELECT clean_name, filename FROM roms WHERE id = ?').get(parseInt(rom_id));
        const clan = db.prepare('SELECT name, emoji FROM clans WHERE id = ?').get(parseInt(clan_id));
        const gameName = rom?.clean_name || rom?.filename || 'Unknown';

        if (existing && existing.clan_id !== parseInt(clan_id)) {
            const oldClan = db.prepare('SELECT name, emoji FROM clans WHERE id = ?').get(existing.clan_id);
            const msg = `${clan.emoji} ${clan.name} seized ${gameName} from ${oldClan.emoji} ${oldClan.name}!`;
            db.prepare('INSERT INTO clan_feed (clan_id, player_id, type, message) VALUES (?, ?, ?, ?)').run(parseInt(clan_id), player_id, 'territory_seized', msg);
            db.prepare('INSERT INTO clan_feed (clan_id, type, message) VALUES (?, ?, ?)').run(existing.clan_id, 'territory_lost', msg);
        } else if (!existing) {
            db.prepare('INSERT INTO clan_feed (clan_id, player_id, type, message) VALUES (?, ?, ?, ?)').run(
                parseInt(clan_id), player_id, 'territory_claimed',
                `${clan.emoji} ${clan.name} claimed ${gameName}!`
            );
        }

        res.json({ claimed: true, previous_clan: existing?.clan_id || null });
    } else {
        res.json({ claimed: false, current_holder: existing.clan_id });
    }
});

// ══════════════════════════════════════
// BOUNTIES
// ══════════════════════════════════════

router.get('/bounties', (req, res) => {
    const db = getDB();
    const status = req.query.status || 'active';
    const bounties = db.prepare(`
        SELECT b.*,
            pc.name as posted_clan_name, pc.emoji as posted_clan_emoji, pc.color as posted_clan_color,
            pp.name as posted_player_name, pp.emoji as posted_player_emoji,
            tc.name as target_clan_name, tc.emoji as target_clan_emoji,
            cp.name as claimed_player_name, cp.emoji as claimed_player_emoji,
            cc.name as claimed_clan_name, cc.emoji as claimed_clan_emoji,
            r.clean_name as rom_name, r.system_id
        FROM clan_bounties b
        JOIN clans pc ON pc.id = b.posted_by_clan_id
        JOIN players pp ON pp.id = b.posted_by_player_id
        LEFT JOIN clans tc ON tc.id = b.target_clan_id
        LEFT JOIN players cp ON cp.id = b.claimed_by_player_id
        LEFT JOIN clans cc ON cc.id = b.claimed_by_clan_id
        LEFT JOIN roms r ON r.id = b.rom_id
        WHERE b.status = ?
        ORDER BY b.created_at DESC LIMIT 50
    `).all(status);
    res.json({ bounties });
});

router.post('/bounties', (req, res) => {
    const db = getDB();
    const { posted_by_clan_id, posted_by_player_id, target_clan_id, rom_id, game_id, target_score, reward_text } = req.body;
    if (!posted_by_clan_id || !posted_by_player_id || !target_score) return res.status(400).json({ error: 'Missing required fields' });

    const result = db.prepare(`
        INSERT INTO clan_bounties (posted_by_clan_id, posted_by_player_id, target_clan_id, rom_id, game_id, target_score, reward_text)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(parseInt(posted_by_clan_id), parseInt(posted_by_player_id), target_clan_id ? parseInt(target_clan_id) : null,
           rom_id ? parseInt(rom_id) : null, game_id || null, target_score, reward_text || 'Bragging rights');

    const player = db.prepare('SELECT name, emoji FROM players WHERE id = ?').get(parseInt(posted_by_player_id));
    db.prepare('INSERT INTO clan_feed (clan_id, player_id, type, message) VALUES (?, ?, ?, ?)').run(
        parseInt(posted_by_clan_id), parseInt(posted_by_player_id), 'bounty_posted',
        `${player.emoji} ${player.name} posted a bounty: beat ${target_score.toLocaleString()} pts!`
    );

    res.json(db.prepare('SELECT * FROM clan_bounties WHERE id = ?').get(result.lastInsertRowid));
});

// Claim a bounty
router.post('/bounties/:id/claim', (req, res) => {
    const db = getDB();
    const bountyId = parseInt(req.params.id);
    const { player_id, clan_id, score } = req.body;

    const bounty = db.prepare('SELECT * FROM clan_bounties WHERE id = ?').get(bountyId);
    if (!bounty) return res.status(404).json({ error: 'Bounty not found' });
    if (bounty.status !== 'active') return res.status(400).json({ error: 'Bounty already claimed' });
    if (score < bounty.target_score) return res.status(400).json({ error: 'Score does not meet target' });

    db.prepare(`
        UPDATE clan_bounties SET status = 'claimed', claimed_by_player_id = ?, claimed_by_clan_id = ?, claimed_at = datetime('now')
        WHERE id = ?
    `).run(parseInt(player_id), parseInt(clan_id), bountyId);

    const player = db.prepare('SELECT name, emoji FROM players WHERE id = ?').get(parseInt(player_id));
    const clan = db.prepare('SELECT name, emoji FROM clans WHERE id = ?').get(parseInt(clan_id));
    db.prepare('INSERT INTO clan_feed (clan_id, player_id, type, message) VALUES (?, ?, ?, ?)').run(
        parseInt(clan_id), parseInt(player_id), 'bounty_claimed',
        `${player.emoji} ${player.name} claimed a bounty with ${score.toLocaleString()} pts! 💰`
    );

    db.prepare('UPDATE clans SET xp = xp + 75 WHERE id = ?').run(parseInt(clan_id));

    res.json({ claimed: true });
});

// ══════════════════════════════════════
// CLAN WARS (multi-clan tournaments)
// ══════════════════════════════════════

router.get('/wars', (req, res) => {
    const db = getDB();
    const wars = db.prepare(`SELECT * FROM clan_wars ORDER BY start_time DESC LIMIT 20`).all();

    for (const war of wars) {
        war.entries = db.prepare(`
            SELECT cwe.*, c.name as clan_name, c.emoji as clan_emoji, c.color as clan_color
            FROM clan_war_entries cwe
            JOIN clans c ON c.id = cwe.clan_id
            WHERE cwe.war_id = ?
            ORDER BY cwe.total_score DESC
        `).all(war.id);
        war.game_list = war.game_list ? JSON.parse(war.game_list) : [];
    }

    res.json({ wars });
});

router.post('/wars', (req, res) => {
    const db = getDB();
    const { name, description, start_time, end_time, game_list, clan_ids, scoring_mode } = req.body;
    if (!name || !start_time || !end_time) return res.status(400).json({ error: 'name, start_time, end_time required' });

    const result = db.prepare(`
        INSERT INTO clan_wars (name, description, start_time, end_time, game_list, scoring_mode)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, description || '', start_time, end_time, game_list ? JSON.stringify(game_list) : '[]', scoring_mode || 'total');

    const warId = result.lastInsertRowid;

    // Add participating clans
    if (Array.isArray(clan_ids)) {
        const ins = db.prepare('INSERT OR IGNORE INTO clan_war_entries (war_id, clan_id) VALUES (?, ?)');
        for (const cid of clan_ids) ins.run(warId, parseInt(cid));
    }

    // Feed for all participating clans
    const allClans = clan_ids || [];
    for (const cid of allClans) {
        db.prepare('INSERT INTO clan_feed (clan_id, type, message) VALUES (?, ?, ?)').run(
            parseInt(cid), 'war_started', `⚔️ Clan War "${name}" has begun!`
        );
    }

    res.json(db.prepare('SELECT * FROM clan_wars WHERE id = ?').get(warId));
});

// Submit war score
router.post('/wars/:id/score', (req, res) => {
    const db = getDB();
    const warId = parseInt(req.params.id);
    const { clan_id, player_id, game_id, rom_id, score } = req.body;

    const war = db.prepare('SELECT * FROM clan_wars WHERE id = ?').get(warId);
    if (!war) return res.status(404).json({ error: 'War not found' });
    if (war.status !== 'active' && war.status !== 'upcoming') return res.status(400).json({ error: 'War is not active' });

    db.prepare(`
        INSERT INTO clan_war_scores (war_id, clan_id, player_id, game_id, rom_id, score) VALUES (?, ?, ?, ?, ?, ?)
    `).run(warId, parseInt(clan_id), parseInt(player_id), game_id || null, rom_id ? parseInt(rom_id) : null, score);

    // Update clan total
    const total = db.prepare('SELECT COALESCE(SUM(score), 0) as t FROM clan_war_scores WHERE war_id = ? AND clan_id = ?').get(warId, parseInt(clan_id)).t;
    db.prepare('UPDATE clan_war_entries SET total_score = ? WHERE war_id = ? AND clan_id = ?').run(total, warId, parseInt(clan_id));

    res.json({ total_score: total });
});

// Get war live scoreboard
router.get('/wars/:id/scoreboard', (req, res) => {
    const db = getDB();
    const warId = parseInt(req.params.id);
    const war = db.prepare('SELECT * FROM clan_wars WHERE id = ?').get(warId);
    if (!war) return res.status(404).json({ error: 'War not found' });

    const entries = db.prepare(`
        SELECT cwe.*, c.name as clan_name, c.emoji as clan_emoji, c.color as clan_color
        FROM clan_war_entries cwe
        JOIN clans c ON c.id = cwe.clan_id
        WHERE cwe.war_id = ?
        ORDER BY cwe.total_score DESC
    `).all(warId);

    // Individual scores
    const scores = db.prepare(`
        SELECT cws.*, p.name as player_name, p.emoji as player_emoji, c.name as clan_name, c.emoji as clan_emoji
        FROM clan_war_scores cws
        JOIN players p ON p.id = cws.player_id
        JOIN clans c ON c.id = cws.clan_id
        WHERE cws.war_id = ?
        ORDER BY cws.score DESC
    `).all(warId);

    war.game_list = war.game_list ? JSON.parse(war.game_list) : [];
    res.json({ war, entries, scores });
});

export default router;
