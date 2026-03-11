/* API Client — all backend calls in one place */
window.API = {
    async get(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
        return res.json();
    },

    async post(url, body) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
        return res.json();
    },

    async put(url, body) {
        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
        return res.json();
    },

    async patch(url, body) {
        const res = await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
        return res.json();
    },

    async del(url) {
        const res = await fetch(url, { method: 'DELETE' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
        return res.json();
    },

    // Library
    library(params = {}) {
        const q = new URLSearchParams(params).toString();
        return this.get(`/api/library?${q}`);
    },

    // Favorites
    favorites(limit = 60) {
        return this.get(`/api/library/favorites?limit=${limit}`);
    },

    // Random game
    randomGame() {
        return this.get('/api/library/random');
    },

    // Systems
    systems() { return this.get('/api/systems'); },
    systemDetail(id) { return this.get(`/api/systems/${id}`); },
    generateSystemBio(id) { return this.post(`/api/systems/${id}/generate-bio`); },

    // Game detail
    game(id) { return this.get(`/api/game/${id}`); },
    toggleFavorite(id, fav) { return this.patch(`/api/game/${id}`, { favorite: fav }); },
    setRating(id, rating) { return this.patch(`/api/game/${id}`, { rating }); },

    // Scanner
    startScan(paths) { return this.post('/api/scanner/scan', { paths }); },
    scanStatus() { return this.get('/api/scanner/status'); },

    // Metadata
    fetchArtwork(id) { return this.post(`/api/metadata/fetch/${id}`); },
    batchArtwork() { return this.post('/api/metadata/batch'); },

    // Archive
    archiveSearch(q, page = 1) { return this.get(`/api/archive/search?q=${encodeURIComponent(q)}&page=${page}`); },
    archiveFiles(identifier) { return this.get(`/api/archive/files/${identifier}`); },
    archiveDownload(identifier, filename, system_id) {
        return this.post('/api/archive/download', { identifier, filename, system_id });
    },

    // Downloader
    downloadUrl(url, system_id, filename) {
        return this.post('/api/download/url', { url, system_id, filename });
    },
    downloadStatus() { return this.get('/api/download/status'); },

    // MAME dev
    mamedevList() { return this.get('/api/mamedev/list'); },
    mamedevDownload(slug) { return this.post('/api/mamedev/download', { slug }); },

    // Settings
    getSettings() { return this.get('/api/settings'); },
    setSetting(key, value) { return this.put('/api/settings', { key, value }); },
    addScanPath(path, system_id) { return this.post('/api/settings/scan-path', { path, system_id }); },
    removeScanPath(id) { return this.del(`/api/settings/scan-path/${id}`); },

    // Player (emulator config)
    playerConfig(id) { return this.get(`/api/player/config/${id}`); },
    triviaQuestions(count = 5) { return this.get(`/api/trivia/random?count=${count}`); },

    // Player Profiles
    players() { return this.get('/api/players'); },
    playerFavorites(playerId, limit = 60) { return this.get(`/api/players/${playerId}/favorites?limit=${limit}`); },
    togglePlayerFavorite(playerId, romId) { return this.post(`/api/players/${playerId}/favorites/${romId}`); },
    isPlayerFavorite(playerId, romId) { return this.get(`/api/players/${playerId}/favorites/${romId}`); },

    // Player profile
    updatePlayer(playerId, data) { return this.patch(`/api/players/${playerId}`, data); },
    playerStats(playerId) { return this.get(`/api/players/${playerId}/stats`); },
    playerFamily(playerId) { return this.get(`/api/players/${playerId}/family`); },
    deletePlayer(playerId) { return this.del(`/api/players/${playerId}`); },
    createPlayer(data) { return this.post('/api/players', data); },
    removePlayerFavorite(playerId, romId) { return this.post(`/api/players/${playerId}/favorites/${romId}`); },
    playerPreferences(playerId) { return this.get(`/api/players/${playerId}/preferences`); },
    savePlayerPreferences(playerId, prefs) { return this.put(`/api/players/${playerId}/preferences`, prefs); },

    // History
    logPlay(rom_id, action, session_id, duration_seconds, player_id) {
        return this.post('/api/history/log', { rom_id, action, session_id, duration_seconds, player_id });
    },
    recentHistory(limit = 20) { return this.get(`/api/history/recent?limit=${limit}`); },

    // Ratings (per-player)
    getRatings(romId) { return this.get(`/api/ratings/${romId}`); },
    setPlayerRating(romId, playerId, rating) { return this.post(`/api/ratings/${romId}`, { player_id: playerId, rating }); },

    // High Scores
    topScores(limit = 50) { return this.get(`/api/scores/top?limit=${limit}`); },
    gameScores(romId) { return this.get(`/api/scores/game/${romId}`); },
    playerScores(playerId) { return this.get(`/api/scores/player/${playerId}`); },
    submitScore(playerId, romId, score) { return this.post('/api/scores', { player_id: playerId, rom_id: romId, score }); },

    // Streaks & Achievements
    allStreaks() { return this.get('/api/streaks'); },
    playerStreak(playerId) { return this.get(`/api/streaks/${playerId}`); },
    allAchievements() { return this.get('/api/streaks/achievements/all'); },
    playerOfTheDay() { return this.get('/api/streaks/spotlight/player-of-the-day'); },

    // Progression (XP, Achievements, Activity Feed)
    playerProgression(playerId) { return this.get(`/api/progression/${playerId}`); },
    awardXP(playerId, action, romId, meta) {
        return this.post('/api/progression/action', { playerId, action, romId, meta });
    },
    activityFeed(limit = 30) { return this.get(`/api/progression/feed/recent?limit=${limit}`); },
    xpLeaderboard() { return this.get('/api/progression/ranks/leaderboard'); },

    // Command Center
    ccStats() { return this.get('/api/command-center/stats'); },

    // Arcade Originals
    originals() { return this.get('/api/originals'); },
    originalScores(gameId) { return this.get(`/api/originals/${gameId}/scores`); },
    submitOriginalScore(playerId, gameId, score, level, meta) {
        return this.post(`/api/originals/${gameId}/scores`, { player_id: playerId, score, level, meta });
    },

    // Clans
    clans() { return this.get('/api/clans'); },
    createClan(data) { return this.post('/api/clans', data); },
    updateClan(id, data) { return this.patch(`/api/clans/${id}`, data); },
    deleteClan(id) { return this.del(`/api/clans/${id}`); },
    movePlayer(player_id, clan_id) { return this.post('/api/clans/move-player', { player_id, clan_id }); },
    addClanMember(player_id, clan_id) { return this.post('/api/clans/add-member', { player_id, clan_id }); },
    removeClanMember(player_id, clan_id) { return this.post('/api/clans/remove-member', { player_id, clan_id }); },
    reorderClans(order) { return this.post('/api/clans/reorder', { order }); },

    // Clan Battles
    clanLeaderboard() { return this.get('/api/clan-battles/leaderboard'); },
    clanProfile(clanId) { return this.get(`/api/clan-battles/profile/${clanId}`); },
    updateClanProfile(clanId, data) { return this.patch(`/api/clan-battles/profile/${clanId}`, data); },
    clanChallenges(status) { return this.get(`/api/clan-battles/challenges?status=${status || 'all'}`); },
    createChallenge(data) { return this.post('/api/clan-battles/challenges', data); },
    submitChallengeScore(challengeId, data) { return this.post(`/api/clan-battles/challenges/${challengeId}/score`, data); },
    resolveChallenge(challengeId) { return this.post(`/api/clan-battles/challenges/${challengeId}/resolve`); },
    clanMessages(params) { const q = new URLSearchParams(params).toString(); return this.get(`/api/clan-battles/messages?${q}`); },
    sendClanMessage(data) { return this.post('/api/clan-battles/messages', data); },
    clanAchievements(clanId) { return this.get(`/api/clan-battles/achievements/${clanId}`); },
    checkClanAchievements(clanId) { return this.post(`/api/clan-battles/check-achievements/${clanId}`); },
    clanFeed(clanId) { return this.get(`/api/clan-battles/feed${clanId ? '?clan_id=' + clanId : ''}`); },
    clanTerritories() { return this.get('/api/clan-battles/territories'); },
    claimTerritory(data) { return this.post('/api/clan-battles/territories/claim', data); },
    clanBounties(status) { return this.get(`/api/clan-battles/bounties?status=${status || 'active'}`); },
    createBounty(data) { return this.post('/api/clan-battles/bounties', data); },
    claimBounty(bountyId, data) { return this.post(`/api/clan-battles/bounties/${bountyId}/claim`, data); },
    clanWars() { return this.get('/api/clan-battles/wars'); },
    createWar(data) { return this.post('/api/clan-battles/wars', data); },
    submitWarScore(warId, data) { return this.post(`/api/clan-battles/wars/${warId}/score`, data); },
    warScoreboard(warId) { return this.get(`/api/clan-battles/wars/${warId}/scoreboard`); },

    // Challenge Mode
    randomChallenge(system) { return this.get(`/api/challenge/random${system ? '?system=' + system : ''}`); },
    challengeHistory() { return this.get('/api/challenge/history'); },
    completeChallenge(playerId, type, gameName, duration) {
        return this.post('/api/challenge/complete', { player_id: playerId, challenge_type: type, game_name: gameName, duration });
    },

    // ═══ V5 NEW FEATURES ═══

    // Hall of Fame
    hallOfFame() { return this.get('/api/hall-of-fame'); },
    hallOfFameCategory(category) { return this.get(`/api/hall-of-fame/${category}`); },
    hallOfFameInductions() { return this.get('/api/hall-of-fame/inductions'); },
    hallOfFameNominate(data) { return this.post('/api/hall-of-fame/nominate', data); },

    // Daily Challenges
    dailyChallenge() { return this.get('/api/daily-challenges/today'); },
    dailyChallengeHistory(limit = 14) { return this.get(`/api/daily-challenges/history?limit=${limit}`); },
    completeDailyChallenge(playerId, data) { return this.post('/api/daily-challenges/complete', { player_id: playerId, ...data }); },
    dailyLeaderboard() { return this.get('/api/daily-challenges/leaderboard'); },

    // Tournaments
    activeTournaments() { return this.get('/api/tournaments?status=active'); },
    allTournaments(status) { return this.get(`/api/tournaments?status=${status || 'all'}`); },
    tournament(id) { return this.get(`/api/tournaments/${id}`); },
    createTournament(data) { return this.post('/api/tournaments', data); },
    joinTournament(id, playerId) { return this.post(`/api/tournaments/${id}/join`, { player_id: playerId }); },
    submitTournamentScore(id, data) { return this.post(`/api/tournaments/${id}/score`, data); },
    tournamentStandings(id) { return this.get(`/api/tournaments/${id}/standings`); },

    // Collections
    playerCollections(playerId) { return this.get(`/api/collections/player/${playerId}`); },
    allCollections() { return this.get('/api/collections'); },
    collectionProgress(playerId, collectionId) { return this.get(`/api/collections/${collectionId}/progress/${playerId}`); },
    claimCollectionReward(playerId, collectionId) { return this.post(`/api/collections/${collectionId}/claim`, { player_id: playerId }); },

    // Friends
    playerFriends(playerId) { return this.get(`/api/friends/${playerId}`); },
    sendFriendRequest(fromId, toId) { return this.post('/api/friends/request', { from_player_id: fromId, to_player_id: toId }); },
    respondFriendRequest(requestId, action) { return this.post(`/api/friends/request/${requestId}`, { action }); },
    friendActivity(playerId) { return this.get(`/api/friends/${playerId}/activity`); },

    // Notifications
    playerNotifications(playerId, limit = 20) { return this.get(`/api/notifications/${playerId}?limit=${limit}`); },
    markNotificationRead(id) { return this.patch(`/api/notifications/${id}/read`, {}); },
    markAllNotificationsRead(playerId) { return this.post(`/api/notifications/${playerId}/read-all`, {}); },
    unreadNotificationCount(playerId) { return this.get(`/api/notifications/${playerId}/unread-count`); },

    // Recommendations
    recommendedGames(playerId) { return this.get(`/api/recommendations/${playerId}`); },
    trendingGames() { return this.get('/api/recommendations/trending'); },
    similarGames(romId) { return this.get(`/api/recommendations/similar/${romId}`); },

    // Speed Runs
    speedrunRecords(romId) { return this.get(`/api/speedrun/game/${romId}`); },
    submitSpeedrun(data) { return this.post('/api/speedrun/submit', data); },
    speedrunLeaderboard(category) { return this.get(`/api/speedrun/leaderboard?category=${category || 'all'}`); },
    playerSpeedruns(playerId) { return this.get(`/api/speedrun/player/${playerId}`); },

    // Stats Dashboard
    globalStats() { return this.get('/api/stats/global'); },
    systemStats() { return this.get('/api/stats/systems'); },
    playerDetailedStats(playerId) { return this.get(`/api/stats/player/${playerId}`); },
    statsTimeline(days = 30) { return this.get(`/api/stats/timeline?days=${days}`); },

    // Game of the Day
    gameOfDay() { return this.get('/api/game-of-day'); },
    gameOfDayHistory(limit = 7) { return this.get(`/api/game-of-day/history?limit=${limit}`); },

    // Search
    search(q, filters = {}) {
        const params = new URLSearchParams({ q, ...filters }).toString();
        return this.get(`/api/search?${params}`);
    },

    // ═══ V6 SOCIAL ARCADE ═══

    // Chat
    chatMessages(channelType, channelId, limit = 50) {
        const params = new URLSearchParams({ channel_type: channelType, limit });
        if (channelId) params.set('channel_id', channelId);
        return this.get(`/api/chat/messages?${params}`);
    },
    chatSend(data) { return this.post('/api/chat/send', data); },
    chatOnline() { return this.get('/api/chat/online'); },
    chatPresence(playerId, status, currentGame, romId) {
        return this.post('/api/chat/presence', { player_id: playerId, status, current_game: currentGame, current_rom_id: romId });
    },
    chatDMChannels(playerId) { return this.get(`/api/chat/dm-channels/${playerId}`); },

    // Messages (inbox)
    inbox(playerId, limit = 30, offset = 0) { return this.get(`/api/messages/inbox/${playerId}?limit=${limit}&offset=${offset}`); },
    sentMessages(playerId) { return this.get(`/api/messages/sent/${playerId}`); },
    sendMessage(data) { return this.post('/api/messages/send', data); },
    markMessageRead(id) { return this.patch(`/api/messages/${id}/read`, {}); },
    markAllMessagesRead(playerId) { return this.post(`/api/messages/${playerId}/read-all`, {}); },
    deleteMessage(id) { return this.del(`/api/messages/${id}`); },
    unreadMessageCount(playerId) { return this.get(`/api/messages/unread-count/${playerId}`); },

    // Game Requests & Reports
    gameRequests(status, limit = 30) { return this.get(`/api/game-requests/requests?status=${status || 'open'}&limit=${limit}`); },
    submitGameRequest(data) { return this.post('/api/game-requests/requests', data); },
    voteGameRequest(id, playerId, vote) { return this.post(`/api/game-requests/requests/${id}/vote`, { player_id: playerId, vote }); },
    gameReports(status) { return this.get(`/api/game-requests/reports?status=${status || 'open'}`); },
    submitGameReport(data) { return this.post('/api/game-requests/reports', data); },
    gameReportsForGame(romId) { return this.get(`/api/game-requests/reports/game/${romId}`); },

    // Social Hub
    socialHub(viewerId) { return this.get(`/api/social/hub${viewerId ? '?viewer_id=' + viewerId : ''}`); },
    socialSettings(playerId) { return this.get(`/api/social/settings/${playerId}`); },
    updateSocialSettings(playerId, settings) { return this.put(`/api/social/settings/${playerId}`, settings); },
    blockPlayer(playerId, blockedId) { return this.post('/api/social/block', { player_id: playerId, blocked_player_id: blockedId }); },
    unblockPlayer(playerId, blockedId) { return this.post('/api/social/unblock', { player_id: playerId, blocked_player_id: blockedId }); },
    inviteToClan(fromId, toId, clanId) { return this.post('/api/social/invite-to-clan', { from_player_id: fromId, to_player_id: toId, clan_id: clanId }); },
    sendChallenge(fromId, toId, romId, gameName, message) { return this.post('/api/social/challenge', { from_player_id: fromId, to_player_id: toId, rom_id: romId, game_name: gameName, message }); },

    // AI Game Encyclopedia
    async askAI(question, playerId, conversationId) {
        const res = await fetch('/api/llm/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, player_id: playerId, conversation_id: conversationId }),
        });
        return res; // Returns raw Response for streaming with reader
    },
    aiConversations(playerId) { return this.get(`/api/llm/conversations/${playerId}`); },
    aiConversation(id) { return this.get(`/api/llm/conversation/${id}`); },
    deleteAIConversation(id) { return this.del(`/api/llm/conversation/${id}`); },

    // ═══ METADATA ENRICHMENT ═══
    matchNoIntro()          { return this.post('/api/metadata/nointro/match'); },
    noIntroStatus()         { return this.get('/api/metadata/nointro/status'); },
    fetchScreenScraper(id)  { return this.post(`/api/metadata/screenscraper/fetch/${id}`); },
    batchScreenScraper()    { return this.post('/api/metadata/screenscraper/batch'); },
    screenScraperStatus()   { return this.get('/api/metadata/screenscraper/status'); },
    fetchIGDB(id)           { return this.post(`/api/metadata/igdb/fetch/${id}`); },
    batchIGDB()             { return this.post('/api/metadata/igdb/batch'); },
    igdbStatus()            { return this.get('/api/metadata/igdb/status'); },
    fetchRA(id)             { return this.post(`/api/metadata/ra/fetch/${id}`); },
    batchRA()               { return this.post('/api/metadata/ra/batch'); },
    raStatus()              { return this.get('/api/metadata/ra/status'); },
    fetchManual(id)         { return this.post(`/api/metadata/manuals/fetch/${id}`); },
    batchManuals()          { return this.post('/api/metadata/manuals/batch'); },
    manualsStatus()         { return this.get('/api/metadata/manuals/status'); },
    enrichAll(sources)      { return this.post('/api/metadata/enrich', { sources }); },
    enrichStatus()          { return this.get('/api/metadata/enrich/status'); },

    // ═══ V8 GAME INTELLIGENCE ═══
    gameIntel(romId)              { return this.get(`/api/intel/${romId}`); },
    gameIntelDoc(romId, type)     { return this.get(`/api/intel/${romId}/${type}`); },
    generateGameIntel(romId, type){ return this.post(`/api/intel/${romId}/generate`, { type }); },
    deleteGameIntel(romId, type)  { return this.del(`/api/intel/${romId}/${type}`); },
    saveGameIntel(romId, type, md){ return this.put(`/api/intel/${romId}/${type}`, { content_md: md }); },

    // ═══ ENRICHMENT ENGINE ═══
    engineStatus()             { return this.get('/api/engine/status'); },
    engineRun(opts)            { return this.post('/api/engine/run', opts); },
    engineProgress()           { return this.get('/api/engine/progress'); },
    engineStop()               { return this.post('/api/engine/stop'); },
    engineRunStage(stage, opts){ return this.post('/api/engine/run-stage', { stage, ...opts }); },
};
