/* server/lib/ai.js — Multi-provider AI engine with auto-fallback
 *
 * 9 cloud slots + Ollama local fallback.
 * Automatic cascade: if primary hits 429 / 500 / timeout / missing key,
 * tries next provider in the chain before giving up.
 *
 * Slot 1 = INTEL_PROVIDER (currently sambanova)
 * Slots 2, 3, 5 share one OPENROUTER_API_KEY
 * Slots 8 + 9 are the always-on safety net (Cerebras + Groq)
 */

// ── Environment ───────────────────────────────────────────────────────────────
const PRIMARY      = process.env.INTEL_PROVIDER || 'sambanova';
const OLLAMA_URL   = process.env.OLLAMA_URL     || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL   || 'qwen2.5:7b';

// ── Provider Registry (all OpenAI-compatible endpoints) ───────────────────────
const PROVIDERS = {
    sambanova: {
        slot: 1, name: 'SambaNova',
        model: 'Meta-Llama-3.1-405B-Instruct',
        url:   'https://api.sambanova.ai/v1/chat/completions',
        key:   () => process.env.SAMBANOVA_API_KEY,
        maxTokens: 4096,
        disabled: true, // 410 error as of 2026-03
    },
    'openrouter-hermes': {
        slot: 2, name: 'OpenRouter/Hermes',
        model: 'nousresearch/hermes-3-llama-3.1-405b:free',
        url:   'https://openrouter.ai/api/v1/chat/completions',
        key:   () => process.env.OPENROUTER_API_KEY,
        maxTokens: 4096,
    },
    'openrouter-qwen3': {
        slot: 3, name: 'OpenRouter/Qwen3',
        model: 'qwen/qwen3-coder-480b-a35b-instruct:free',
        url:   'https://openrouter.ai/api/v1/chat/completions',
        key:   () => process.env.OPENROUTER_API_KEY,
        maxTokens: 4096,
    },
    deepseek: {
        slot: 4, name: 'DeepSeek',
        model: 'deepseek-reasoner',
        url:   'https://api.deepseek.com/chat/completions',
        key:   () => process.env.DEEPSEEK_API_KEY,
        maxTokens: 4096,
    },
    'openrouter-nemotron': {
        slot: 5, name: 'OpenRouter/Nemotron-120B',
        model: 'nvidia/nemotron-3-super-120b-a12b:free',
        url:   'https://openrouter.ai/api/v1/chat/completions',
        key:   () => process.env.OPENROUTER_API_KEY,
        maxTokens: 4096,
    },
    mistral: {
        slot: 6, name: 'Mistral',
        model: 'devstral-latest',
        url:   'https://api.mistral.ai/v1/chat/completions',
        key:   () => process.env.MISTRAL_API_KEY,
        maxTokens: 4096,
    },
    google: {
        slot: 7, name: 'Google',
        model: 'gemini-2.0-flash-exp',
        url:   'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        key:   () => process.env.GOOGLE_API_KEY,
        maxTokens: 8192,
    },
    cerebras: {
        slot: 8, name: 'Cerebras',
        model: 'gpt-oss-120b',
        url:   'https://api.cerebras.ai/v1/chat/completions',
        key:   () => process.env.CEREBRAS_API_KEY,
        maxTokens: 8192,
        disabled: true, // 404 error as of 2026-03
    },
    'openrouter-llama70b': {
        slot: 10, name: 'OpenRouter/Llama-3.3-70B',
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        url:   'https://openrouter.ai/api/v1/chat/completions',
        key:   () => process.env.OPENROUTER_API_KEY,
        maxTokens: 4096,
    },
    groq: {
        slot: 9, name: 'Groq',
        model: 'llama-3.3-70b-versatile',
        url:   'https://api.groq.com/openai/v1/chat/completions',
        key:   () => process.env.GROQ_API_KEY,
        maxTokens: 32768,
    },
};

// ── Fallback Chains by Strategy ───────────────────────────────────────────────
// quality:   largest models first — on-demand single-game generation
// speed:     fastest throughput — batch generation (Cerebras @ 571 tok/s)
// reasoning: chain-of-thought — trivia, fact-checking (DeepSeek R1 671B)
// context:   biggest context windows — cross-game analysis (Gemini 1M)
const CHAINS = {
    quality:   ['openrouter-hermes', 'openrouter-qwen3', 'openrouter-nemotron', 'openrouter-llama70b', 'groq', 'mistral', 'google'],
    speed:     ['groq', 'openrouter-llama70b', 'openrouter-nemotron', 'openrouter-hermes', 'mistral', 'google'],
    reasoning: ['deepseek', 'openrouter-qwen3', 'openrouter-hermes', 'openrouter-nemotron', 'groq'],
    context:   ['google', 'openrouter-qwen3', 'mistral', 'openrouter-nemotron', 'groq'],
};

// ── Rate-limit cooldowns ──────────────────────────────────────────────────────
const cooldowns = {};  // providerKey → expiresAt (epoch ms)

function isAvailable(key) {
    const p = PROVIDERS[key];
    if (!p || !p.key() || p.disabled) return false;
    if (cooldowns[key] && Date.now() < cooldowns[key]) return false;
    return true;
}

function setCooldown(key, seconds) {
    cooldowns[key] = Date.now() + seconds * 1000;
    console.log(`[AI] ${PROVIDERS[key].name} cooldown ${seconds}s`);
}

// ── Call a single OpenAI-compatible provider ──────────────────────────────────
async function callProvider(providerKey, prompt) {
    const cfg = PROVIDERS[providerKey];
    if (!cfg)       throw new Error(`Unknown provider: ${providerKey}`);
    if (!cfg.key()) throw new Error(`No API key for ${cfg.name}`);

    const res = await fetch(cfg.url, {
        method:  'POST',
        headers: {
            'Authorization': `Bearer ${cfg.key()}`,
            'Content-Type':  'application/json',
        },
        body: JSON.stringify({
            model:       cfg.model,
            messages:    [{ role: 'user', content: prompt }],
            max_tokens:  cfg.maxTokens,
            temperature: 0.7,
        }),
    });

    // Rate-limited — cooldown and throw (fallback will try next)
    if (res.status === 429) {
        const wait = parseInt(res.headers.get('retry-after')) || 60;
        setCooldown(providerKey, wait);
        throw new Error(`${cfg.name} rate limited (429)`);
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `${cfg.name} error ${res.status}`);
    }

    const data    = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error(`Empty response from ${cfg.name}`);

    const usage      = data.usage ?? {};
    const tokensUsed = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);

    return { content, modelName: `${cfg.name}/${cfg.model}`, tokensUsed, provider: providerKey, slot: cfg.slot };
}

// ── Call Ollama (local, different API format) ─────────────────────────────────
async function callOllama(prompt) {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model:    OLLAMA_MODEL,
            messages: [{ role: 'user', content: prompt }],
            stream:   false,
            options:  { num_predict: 4096, temperature: 0.7 },
        }),
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Ollama error ${res.status}: ${txt}`);
    }
    const data = await res.json();
    if (!data.message?.content) throw new Error('Empty response from Ollama');
    return {
        content:    data.message.content,
        modelName:  `Ollama/${OLLAMA_MODEL}`,
        tokensUsed: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        provider:   'ollama',
        slot:       0,
    };
}

// ── Main entry point ──────────────────────────────────────────────────────────
//   callAI(prompt)                            → primary + quality fallback
//   callAI(prompt, { strategy: 'speed' })     → Cerebras-first for batch
//   callAI(prompt, { strategy: 'reasoning' }) → DeepSeek R1 first
//   callAI(prompt, { provider: 'cerebras' })  → force one provider, no fallback
export async function callAI(prompt, opts = {}) {
    const { strategy = 'quality', provider: forceProvider } = opts;

    // Force a specific provider — no fallback
    if (forceProvider) {
        if (forceProvider === 'ollama') return callOllama(prompt);
        return callProvider(forceProvider, prompt);
    }

    // Ollama-only mode
    if (PRIMARY === 'ollama') {
        try { return await callOllama(prompt); }
        catch (e) { console.log(`[AI] Ollama failed: ${e.message}, trying cloud`); }
    }

    // Build attempt order: primary first, then rest of chain (deduped)
    const chain = CHAINS[strategy] || CHAINS.quality;
    const seen  = new Set();
    const attempts = [];

    if (PRIMARY !== 'ollama' && isAvailable(PRIMARY)) {
        attempts.push(PRIMARY);
        seen.add(PRIMARY);
    }
    for (const p of chain) {
        if (!seen.has(p) && isAvailable(p)) {
            attempts.push(p);
            seen.add(p);
        }
    }

    // Walk the chain
    const errors = [];
    for (const key of attempts) {
        try {
            const result = await callProvider(key, prompt);
            if (errors.length) {
                console.log(`[AI] ✓ ${PROVIDERS[key].name} succeeded after ${errors.length} fallback(s)`);
            }
            return result;
        } catch (err) {
            errors.push({ provider: key, error: err.message });
            console.log(`[AI] ✗ ${PROVIDERS[key].name}: ${err.message}`);
        }
    }

    // Last resort: Ollama (if not already primary)
    if (PRIMARY !== 'ollama') {
        try {
            console.log('[AI] All cloud providers failed — trying Ollama');
            return await callOllama(prompt);
        } catch (e) {
            errors.push({ provider: 'ollama', error: e.message });
        }
    }

    throw new Error(`All providers failed:\n${errors.map(e => `  ${e.provider}: ${e.error}`).join('\n')}`);
}

// ── Provider status (for /api/intel/config + BOM dashboard) ───────────────────
export function getProviderStatus() {
    const slots = Object.entries(PROVIDERS)
        .map(([key, cfg]) => ({
            slot:      cfg.slot,
            key:       key,
            name:      cfg.name,
            model:     cfg.model,
            hasKey:    !!cfg.key(),
            cooldown:  cooldowns[key] ? Math.max(0, Math.ceil((cooldowns[key] - Date.now()) / 1000)) : 0,
            available: isAvailable(key),
        }))
        .sort((a, b) => a.slot - b.slot);

    return {
        primary: PRIMARY,
        slots,
        ollama:  { url: OLLAMA_URL, model: OLLAMA_MODEL },
        chains:  CHAINS,
    };
}

/** Returns null if at least one provider is usable, or an error string */
export function checkProviderKey() {
    if (PRIMARY === 'ollama') return null;
    if (PROVIDERS[PRIMARY]?.key()) return null;
    if (CHAINS.quality.some(k => isAvailable(k))) return null;
    return 'No API keys configured — add at least one provider key to .env';
}

export const INTEL_PROVIDER = PRIMARY;
