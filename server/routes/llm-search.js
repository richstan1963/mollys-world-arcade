import { Router } from 'express';
import http from 'http';
import { getDB } from '../db.js';

const router = Router();

// Build context from DB for the LLM prompt
function getArcadeContext(db, playerId) {
    const systemCount = db.prepare('SELECT COUNT(*) as c FROM systems').get().c;
    const systemList = db.prepare('SELECT name FROM systems ORDER BY sort_order').all().map(s => s.name).join(', ');
    const totalGames = db.prepare('SELECT COUNT(*) as c FROM roms').get().c;

    let playerInfo = null;
    if (playerId) {
        const player = db.prepare('SELECT name, emoji, level, xp FROM players WHERE id = ?').get(playerId);
        if (player) {
            const favCount = db.prepare('SELECT COUNT(*) as c FROM player_favorites WHERE player_id = ?').get(playerId).c;
            const recentGames = db.prepare(`
                SELECT r.clean_name FROM play_history ph
                JOIN roms r ON r.id = ph.rom_id
                WHERE ph.player_id = ?
                ORDER BY ph.started_at DESC LIMIT 5
            `).all(playerId).map(g => g.clean_name).filter(Boolean).join(', ');

            playerInfo = `${player.emoji} ${player.name} (Level ${player.level}, ${favCount} favorites${recentGames ? `, recently played: ${recentGames}` : ''})`;
        }
    }

    return {
        systems: systemList,
        systemCount,
        totalGames,
        playerInfo,
    };
}

// Stream a question to Ollama and relay tokens via SSE
function askLLM(question, context, res) {
    const systemPrompt = `You are the Your World Arcade game encyclopedia. You know everything about retro games, classic consoles, game history, strategies, secrets, and cheat codes. You're fun, enthusiastic, and love talking about games. Keep responses concise but informative.

Available systems in this arcade (${context.systemCount} total): ${context.systems}
Total games: ${context.totalGames}
${context.playerInfo ? `Current player: ${context.playerInfo}` : ''}

Answer the user's question helpfully. If they ask about a specific game, include fun facts. If they ask for recommendations, be specific.`;

    const body = JSON.stringify({
        model: 'llama3.2',
        prompt: question,
        system: systemPrompt,
        stream: true,
    });

    const ollamaReq = http.request({
        hostname: 'localhost',
        port: 11434,
        path: '/api/generate',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    }, (ollamaRes) => {
        let fullResponse = '';

        ollamaRes.on('data', (chunk) => {
            try {
                const lines = chunk.toString().split('\n').filter(Boolean);
                for (const line of lines) {
                    const data = JSON.parse(line);
                    if (data.response) {
                        fullResponse += data.response;
                        res.write(`data: ${JSON.stringify({ type: 'token', content: data.response })}\n\n`);
                    }
                    if (data.done) {
                        res.write(`data: ${JSON.stringify({ type: 'done', full_response: fullResponse })}\n\n`);
                        res.end();
                    }
                }
            } catch {
                // Ignore JSON parse errors on partial chunks
            }
        });

        ollamaRes.on('error', () => {
            res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream interrupted' })}\n\n`);
            res.end();
        });
    });

    ollamaReq.on('error', () => {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Game encyclopedia is warming up! The AI engine (Ollama) needs to be running locally. Start it with: ollama serve' })}\n\n`);
        res.end();
    });

    ollamaReq.write(body);
    ollamaReq.end();
}

// POST /ask — ask a question about games (SSE response)
router.post('/ask', (req, res) => {
    try {
        const db = getDB();
        const { question, player_id, conversation_id } = req.body;

        if (!question) return res.status(400).json({ error: 'question is required' });

        // Set up SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });

        const context = getArcadeContext(db, player_id);

        // Load or create conversation
        let convoId = conversation_id;
        let messages = [];

        if (convoId) {
            const convo = db.prepare('SELECT messages FROM llm_conversations WHERE id = ?').get(convoId);
            if (convo) {
                messages = JSON.parse(convo.messages);
            }
        }

        // Add user message
        messages.push({ role: 'user', content: question });

        // Stream response from Ollama
        // We'll capture the full response to save to conversation
        const systemPrompt = `You are the Your World Arcade game encyclopedia. You know everything about retro games, classic consoles, game history, strategies, secrets, and cheat codes. You're fun, enthusiastic, and love talking about games. Keep responses concise but informative.

Available systems in this arcade (${context.systemCount} total): ${context.systems}
Total games: ${context.totalGames}
${context.playerInfo ? `Current player: ${context.playerInfo}` : ''}

Answer the user's question helpfully. If they ask about a specific game, include fun facts. If they ask for recommendations, be specific.`;

        const body = JSON.stringify({
            model: 'llama3.2',
            prompt: question,
            system: systemPrompt,
            stream: true,
        });

        const ollamaReq = http.request({
            hostname: 'localhost',
            port: 11434,
            path: '/api/generate',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        }, (ollamaRes) => {
            let fullResponse = '';

            ollamaRes.on('data', (chunk) => {
                try {
                    const lines = chunk.toString().split('\n').filter(Boolean);
                    for (const line of lines) {
                        const data = JSON.parse(line);
                        if (data.response) {
                            fullResponse += data.response;
                            res.write(`data: ${JSON.stringify({ type: 'token', content: data.response })}\n\n`);
                        }
                        if (data.done) {
                            // Save conversation
                            messages.push({ role: 'assistant', content: fullResponse });
                            const topic = question.slice(0, 100);
                            const messagesJson = JSON.stringify(messages);

                            try {
                                if (convoId) {
                                    db.prepare('UPDATE llm_conversations SET messages = ?, topic = ?, updated_at = datetime(\'now\') WHERE id = ?')
                                        .run(messagesJson, topic, convoId);
                                } else {
                                    const result = db.prepare('INSERT INTO llm_conversations (player_id, messages, topic) VALUES (?, ?, ?)')
                                        .run(player_id || null, messagesJson, topic);
                                    convoId = result.lastInsertRowid;
                                }
                            } catch {
                                // Don't fail the response if saving the conversation fails
                            }

                            res.write(`data: ${JSON.stringify({ type: 'done', conversation_id: convoId })}\n\n`);
                            res.end();
                        }
                    }
                } catch {
                    // Ignore JSON parse errors on partial chunks
                }
            });

            ollamaRes.on('error', () => {
                res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream interrupted' })}\n\n`);
                res.end();
            });
        });

        ollamaReq.on('error', () => {
            res.write(`data: ${JSON.stringify({ type: 'error', message: 'Game encyclopedia is warming up! The AI engine (Ollama) needs to be running locally. Start it with: ollama serve' })}\n\n`);
            res.end();
        });

        ollamaReq.write(body);
        ollamaReq.end();
    } catch (err) {
        // If headers already sent (SSE mode), write error as event
        if (res.headersSent) {
            res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
            res.end();
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

// GET /conversations/:playerId — list past conversations
router.get('/conversations/:playerId', (req, res) => {
    try {
        const db = getDB();
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const offset = parseInt(req.query.offset) || 0;

        const conversations = db.prepare(`
            SELECT id, player_id, topic, created_at, updated_at,
                   json_array_length(messages) as message_count
            FROM llm_conversations
            WHERE player_id = ?
            ORDER BY updated_at DESC
            LIMIT ? OFFSET ?
        `).all(req.params.playerId, limit, offset);

        res.json(conversations);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /conversation/:id — get a specific conversation
router.get('/conversation/:id', (req, res) => {
    try {
        const db = getDB();
        const convo = db.prepare('SELECT * FROM llm_conversations WHERE id = ?').get(req.params.id);
        if (!convo) return res.status(404).json({ error: 'Conversation not found' });

        res.json({
            ...convo,
            messages: JSON.parse(convo.messages),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /conversation/:id — delete a conversation
router.delete('/conversation/:id', (req, res) => {
    try {
        const db = getDB();
        const result = db.prepare('DELETE FROM llm_conversations WHERE id = ?').run(req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Conversation not found' });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
