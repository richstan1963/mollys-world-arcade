/* AI Search View — V6 Social Arcade Game Encyclopedia (LLM) */
window.AISearchView = {
    messages: [],
    conversationId: null,
    isStreaming: false,
    abortController: null,

    suggestions: [
        'What are the best hidden gems on SNES?',
        'Tell me about the history of Sonic the Hedgehog',
        'Best co-op games for 2 players on NES?',
        'What made the Genesis vs SNES rivalry so intense?',
        'Secret codes and cheats for classic N64 games',
        'Which GBA RPGs are must-plays?',
    ],

    async render() {
        const app = document.getElementById('app');
        const activePlayer = ArcadeEngine?.getActivePlayer?.();

        let pastConversations = [];
        if (activePlayer?.id) {
            pastConversations = await API.aiConversations(activePlayer.id).catch(() => []);
            if (!Array.isArray(pastConversations)) pastConversations = pastConversations.conversations || [];
        }

        app.innerHTML = `
            <div class="pro-view ai-search-view">
                <div class="pro-view-header">
                    <h1>\u{1F9E0} Game Encyclopedia</h1>
                    <p class="pro-view-sub">Ask me anything about retro games!</p>
                </div>
                <div class="ai-layout">
                    <!-- Sidebar: past conversations + suggestions -->
                    <div class="ai-sidebar" id="aiSidebar">
                        <button class="ai-new-chat-btn" onclick="AISearchView.newChat()">+ New Chat</button>

                        ${pastConversations.length > 0 ? `
                            <div class="ai-section-label">Past Conversations</div>
                            <div class="ai-past-list">
                                ${pastConversations.slice(0, 20).map(c => `
                                    <button class="ai-past-item ${c.id === this.conversationId ? 'active' : ''}" onclick="AISearchView.loadConversation(${c.id})">
                                        <span class="ai-past-title">${H.escHtml(c.title || c.first_question || 'Untitled')}</span>
                                        <span class="ai-past-time">${H.timeAgo(c.updated_at || c.created_at)}</span>
                                    </button>
                                `).join('')}
                            </div>
                        ` : ''}

                        <div class="ai-section-label">Suggested Questions</div>
                        <div class="ai-suggestions-list">
                            ${this.suggestions.map(q => `
                                <button class="ai-suggestion-pill" onclick="AISearchView.askSuggestion('${H.escHtml(q)}')">${H.escHtml(q)}</button>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Main chat area -->
                    <div class="ai-main">
                        <div class="ai-messages" id="aiMessages">
                            ${this.messages.length === 0 ? `
                                <div class="ai-welcome">
                                    <div class="ai-welcome-icon">\u{1F9E0}</div>
                                    <h3>Game Encyclopedia</h3>
                                    <p>I know all about retro games! Ask me anything — game history, hidden secrets, recommendations, comparisons, and more.</p>
                                    <div class="ai-suggestions-row">
                                        ${this.suggestions.slice(0, 3).map(q => `
                                            <button class="ai-suggestion-pill" onclick="AISearchView.askSuggestion('${H.escHtml(q)}')">${H.escHtml(q)}</button>
                                        `).join('')}
                                    </div>
                                </div>
                            ` : this.renderMessages()}
                        </div>
                        <div class="ai-input-bar">
                            <button class="ai-sidebar-toggle" onclick="AISearchView.toggleSidebar()">\u2630</button>
                            <input type="text" id="aiInput" class="ai-input" placeholder="Ask anything about games..."
                                maxlength="500" onkeydown="if(event.key==='Enter'&&!AISearchView.isStreaming)AISearchView.ask()"
                                ${this.isStreaming ? 'disabled' : ''}>
                            ${this.isStreaming
                                ? '<button class="ai-stop-btn" onclick="AISearchView.stopStream()">Stop</button>'
                                : '<button class="ai-send-btn" onclick="AISearchView.ask()">Ask</button>'}
                            <div class="ai-status" id="aiStatus">
                                <span class="ai-status-dot"></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.scrollToBottom();
        this.checkLLMStatus();
    },

    renderMessages() {
        return this.messages.map(m => {
            if (m.role === 'user') {
                return `
                    <div class="ai-message ai-message-user">
                        <div class="ai-msg-bubble ai-msg-user">${H.escHtml(m.content)}</div>
                    </div>
                `;
            }
            // AI message — render with basic markdown
            return `
                <div class="ai-message ai-message-ai">
                    <span class="ai-msg-icon">\u{1F9E0}</span>
                    <div class="ai-msg-bubble ai-msg-ai">${this.renderMarkdown(m.content)}${m.streaming ? '<span class="ai-typing"><span></span><span></span><span></span></span>' : ''}</div>
                </div>
            `;
        }).join('');
    },

    renderMarkdown(text) {
        if (!text) return '';
        let html = H.escHtml(text);
        // Bold
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        // Unordered list items
        html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        // Numbered list items
        html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
        // Newlines
        html = html.replace(/\n/g, '<br>');
        return html;
    },

    async ask() {
        const input = document.getElementById('aiInput');
        if (!input || !input.value.trim() || this.isStreaming) return;

        const question = input.value.trim();
        input.value = '';

        const activePlayer = ArcadeEngine?.getActivePlayer?.();

        // Add user message
        this.messages.push({ role: 'user', content: question });
        // Add empty AI message for streaming
        this.messages.push({ role: 'ai', content: '', streaming: true });
        this.updateMessages();

        this.isStreaming = true;
        this.abortController = new AbortController();
        this.updateInputState();

        try {
            const res = await API.askAI(question, activePlayer?.id, this.conversationId);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'AI is not available right now');
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let aiContent = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const payload = line.slice(6).trim();
                    if (payload === '[DONE]') continue;

                    try {
                        const data = JSON.parse(payload);
                        if (data.type === 'token' && data.content) {
                            aiContent += data.content;
                            this.updateLastAI(aiContent, true);
                        }
                        if (data.type === 'done') {
                            if (data.conversation_id) this.conversationId = data.conversation_id;
                        }
                        if (data.type === 'error') {
                            throw new Error(data.message || 'AI error');
                        }
                    } catch (parseErr) {
                        // If it's not our thrown error, just skip bad JSON
                        if (parseErr.message !== 'AI error' && !parseErr.message.startsWith('AI ')) continue;
                        throw parseErr;
                    }
                }
            }

            // Finalize
            this.updateLastAI(aiContent || 'I could not generate a response. Please try again.', false);
        } catch (err) {
            const isOffline = err.message.includes('not available') || err.message.includes('Failed to fetch');
            const msg = isOffline
                ? 'The AI brain is currently sleeping. Make sure Ollama is running on the server, then try again!'
                : err.message;
            this.updateLastAI(msg, false);
        }

        this.isStreaming = false;
        this.abortController = null;
        this.updateInputState();
    },

    askSuggestion(question) {
        const input = document.getElementById('aiInput');
        if (input) input.value = question;
        this.ask();
    },

    stopStream() {
        if (this.abortController) this.abortController.abort();
        this.isStreaming = false;
        if (this.messages.length > 0) {
            const last = this.messages[this.messages.length - 1];
            if (last.role === 'ai') last.streaming = false;
        }
        this.updateMessages();
        this.updateInputState();
    },

    updateLastAI(content, streaming) {
        if (this.messages.length > 0) {
            const last = this.messages[this.messages.length - 1];
            if (last.role === 'ai') {
                last.content = content;
                last.streaming = streaming;
            }
        }
        this.updateMessages();
    },

    updateMessages() {
        const container = document.getElementById('aiMessages');
        if (!container) return;
        container.innerHTML = this.renderMessages();
        this.scrollToBottom();
    },

    updateInputState() {
        const input = document.getElementById('aiInput');
        if (input) input.disabled = this.isStreaming;
        // Re-render input bar buttons
        const bar = document.querySelector('.ai-input-bar');
        if (!bar) return;
        const btns = bar.querySelectorAll('.ai-send-btn, .ai-stop-btn');
        btns.forEach(b => b.remove());
        const toggle = bar.querySelector('.ai-sidebar-toggle');
        const inputEl = bar.querySelector('.ai-input');
        if (this.isStreaming) {
            const btn = document.createElement('button');
            btn.className = 'ai-stop-btn';
            btn.textContent = 'Stop';
            btn.onclick = () => this.stopStream();
            if (inputEl) inputEl.after(btn);
        } else {
            const btn = document.createElement('button');
            btn.className = 'ai-send-btn';
            btn.textContent = 'Ask';
            btn.onclick = () => this.ask();
            if (inputEl) inputEl.after(btn);
        }
    },

    scrollToBottom() {
        const container = document.getElementById('aiMessages');
        if (container) container.scrollTop = container.scrollHeight;
    },

    async loadConversation(id) {
        try {
            const data = await API.aiConversation(id);
            const msgs = Array.isArray(data) ? data : (data.messages || []);
            this.messages = msgs.map(m => ({ role: m.role, content: m.content }));
            this.conversationId = id;
            this.render();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    newChat() {
        this.messages = [];
        this.conversationId = null;
        this.isStreaming = false;
        this.render();
    },

    toggleSidebar() {
        document.getElementById('aiSidebar')?.classList.toggle('open');
    },

    async checkLLMStatus() {
        const dot = document.querySelector('.ai-status-dot');
        if (!dot) return;
        try {
            // Quick health check — just see if LLM endpoint responds
            const res = await fetch('/api/llm/health', { signal: AbortSignal.timeout(3000) });
            dot.classList.toggle('ai-status-online', res.ok);
            dot.classList.toggle('ai-status-offline', !res.ok);
            dot.title = res.ok ? 'AI is online' : 'AI is offline';
        } catch {
            dot.classList.add('ai-status-offline');
            dot.title = 'AI is offline';
        }
    },

    destroy() {
        if (this.abortController) this.abortController.abort();
    },
};
