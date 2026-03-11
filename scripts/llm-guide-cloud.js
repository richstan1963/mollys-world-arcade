#!/usr/bin/env node
/**
 * LLM Game Guide Generator — Cloud API Version
 * Sends enhanced URGS v1 JSON to free cloud LLM APIs (Groq, Cerebras)
 * and compares output vs local Ollama 7B and the Claude PDF.
 *
 * Usage:
 *   GROQ_API_KEY=gsk_xxx node scripts/llm-guide-cloud.js groq
 *   CEREBRAS_API_KEY=xxx node scripts/llm-guide-cloud.js cerebras
 *   node scripts/llm-guide-cloud.js ollama     (local fallback)
 *
 * Get free API keys:
 *   Groq:     https://console.groq.com/keys
 *   Cerebras: https://cloud.cerebras.ai/
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Provider configs ─────────────────────────────────────────────────────────

const PROVIDERS = {
  groq: {
    name: 'Groq',
    model: 'llama-3.3-70b-versatile',
    modelLabel: 'Llama 3.3 70B',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyEnv: 'GROQ_API_KEY',
    keyUrl: 'https://console.groq.com/keys',
    maxTokens: 32768,
    streaming: true,
  },
  cerebras: {
    name: 'Cerebras',
    model: 'gpt-oss-120b',
    modelLabel: 'GPT-OSS 120B',
    url: 'https://api.cerebras.ai/v1/chat/completions',
    keyEnv: 'CEREBRAS_API_KEY',
    keyUrl: 'https://cloud.cerebras.ai/',
    maxTokens: 8192,
    streaming: true,
  },
  ollama: {
    name: 'Ollama (local)',
    model: 'qwen2.5:7b',
    modelLabel: 'Qwen 2.5 7B',
    url: 'http://localhost:11434/v1/chat/completions',
    keyEnv: null,
    maxTokens: 8192,
    streaming: true,
  },
};

// ── Load URGS data ───────────────────────────────────────────────────────────

const urgsPath = resolve(__dirname, '../data/urgs-killer-instinct.json');
const urgs = JSON.parse(readFileSync(urgsPath, 'utf-8'));

// ── Build the prompt ─────────────────────────────────────────────────────────

const chapters = urgs.guide_generation.chapter_template;
const totalTarget = chapters.length * urgs.guide_generation.target_length_per_chapter;

const systemPrompt = `You are a retro gaming expert, arcade historian, and fighting game veteran. You write with passion and authority. ${urgs.guide_generation.voice}`;

const userPrompt = `Below is a URGS v1 (Universal Retro Game Knowledge Schema) JSON dataset for "${urgs.metadata.title}". Using ONLY the data provided — do not invent facts — write a complete game guide.

RULES:
- Tone: ${urgs.guide_generation.tone}
- Style: ${urgs.guide_generation.style}
- Write ${chapters.length} chapters: ${chapters.join(', ')}
- Target: ~${urgs.guide_generation.target_length_per_chapter} words per chapter (~${totalTarget} words total)
- Use ONLY facts from the JSON. If a field is empty, skip it gracefully.
- Each chapter should have a compelling title (not just the template name).
- Include specific move inputs, character names, and real details from the data.
- ${urgs.guide_generation.voice}

URGS DATA:
${JSON.stringify(urgs, null, 2)}

Write the complete ${chapters.length}-chapter guide now. Start with Chapter 1.`;

// ── Streaming generator (OpenAI-compatible) ──────────────────────────────────

async function generateOpenAI(provider) {
  const config = PROVIDERS[provider];
  const apiKey = config.keyEnv ? process.env[config.keyEnv] : 'not-needed';

  if (config.keyEnv && !apiKey) {
    console.error(`\n❌ Missing API key. Set ${config.keyEnv}=your_key`);
    console.error(`   Get a free key: ${config.keyUrl}`);
    process.exit(1);
  }

  const inputChars = systemPrompt.length + userPrompt.length;
  console.log(`\n🎮 URGS v1 → ${config.name} Guide Generator`);
  console.log(`📊 Model: ${config.modelLabel} (${config.model})`);
  console.log(`📐 Schema sections: ${Object.keys(urgs).length - 1}`);
  console.log(`👥 Characters: ${urgs.characters.length}`);
  console.log(`🗺️  Stages: ${urgs.stages.length}`);
  console.log(`📝 Chapters: ${chapters.length} (${chapters.join(', ')})`);
  console.log(`🎯 Target: ~${totalTarget} words`);
  console.log(`📦 Input: ~${Math.round(inputChars / 4)} tokens (${inputChars} chars)`);
  console.log('─'.repeat(60));

  const startTime = Date.now();
  let fullResponse = '';

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey && apiKey !== 'not-needed') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: config.maxTokens,
    temperature: 0.7,
    top_p: 0.9,
    stream: true,
  };

  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let promptTokens = 0;
    let completionTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            process.stdout.write(delta);
            fullResponse += delta;
          }
          // Some providers include usage in the final chunk
          if (json.usage) {
            promptTokens = json.usage.prompt_tokens || 0;
            completionTokens = json.usage.completion_tokens || 0;
          }
          if (json.x_groq?.usage) {
            promptTokens = json.x_groq.usage.prompt_tokens || 0;
            completionTokens = json.x_groq.usage.completion_tokens || 0;
          }
        } catch {}
      }
    }

    // ── Stats ──
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const wordCount = fullResponse.split(/\s+/).filter(Boolean).length;
    const lineCount = fullResponse.split('\n').length;
    const chapterMatches = fullResponse.match(/^#+\s+.+/gm) || [];

    console.log('\n' + '─'.repeat(60));
    console.log(`\n✅ Generation complete`);
    console.log(`⏱  Time: ${elapsed}s`);
    console.log(`📊 Provider: ${config.name} — ${config.modelLabel}`);
    console.log(`🔢 Prompt tokens: ${promptTokens || '(not reported)'}`);
    console.log(`🔢 Output tokens: ${completionTokens || '(estimated ~' + Math.round(fullResponse.length / 4) + ')'}`);
    console.log(`📝 Words: ${wordCount}`);
    console.log(`📄 Lines: ${lineCount}`);
    console.log(`📏 Chars: ${fullResponse.length}`);
    if (completionTokens && elapsed > 0) {
      console.log(`⚡ Speed: ${(completionTokens / elapsed).toFixed(1)} tok/s`);
    }

    console.log(`\n📖 Chapters/headers detected: ${chapterMatches.length}`);
    chapterMatches.forEach(h => console.log(`   ${h.trim()}`));

    // ── Three-way comparison ──
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 THREE-WAY COMPARISON`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`                  Local 7B     Cloud 70B     Claude PDF`);
    console.log(`  Model:          qwen2.5:7b   ${config.modelLabel.padEnd(14)}(Opus-class)`);
    console.log(`  Words:          1,194        ${wordCount.toLocaleString().padEnd(14)}~50,000`);
    console.log(`  Chapters:       7            ${chapterMatches.length.toString().padEnd(14)}17`);
    console.log(`  Characters:     3 (halluc.)  ${(urgs.characters.length + ' (from JSON)').padEnd(14)}11`);
    console.log(`  Time:           159s         ${elapsed.padEnd(14)}N/A`);
    console.log(`  Hallucinations: YES          TBD           None`);
    console.log(`  Cost:           $0 (local)   $0 (free)     $$$ (API)`);
    console.log(`${'═'.repeat(60)}`);

    // ── Save ──
    const outPath = resolve(__dirname, `../data/ki-${provider}-guide.md`);
    mkdirSync(dirname(outPath), { recursive: true });

    const header = `# ${urgs.metadata.title} — Complete Game Guide
_Generated by ${config.modelLabel} via ${config.name}_
_Schema: URGS-1.0 | Characters: ${urgs.characters.length} | Stages: ${urgs.stages.length} | Chapters: ${chapters.length}_
_Tone: ${urgs.guide_generation.tone} | Style: ${urgs.guide_generation.style}_
_Generated in ${elapsed}s | ~${wordCount} words_

---

`;
    writeFileSync(outPath, header + fullResponse);
    console.log(`\n💾 Saved to: ${outPath}`);

    // ── Log to benchmarks ──
    logBenchmark({
      provider, config, elapsed, wordCount, lineCount, fullResponse,
      promptTokens, completionTokens, chapterMatches, outPath
    });

  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    if (provider === 'ollama') {
      console.error('   Make sure Ollama is running: ollama serve');
    }
    process.exit(1);
  }
}

// ── Benchmark Logger ─────────────────────────────────────────────────────────

function logBenchmark({ provider, config, elapsed, wordCount, lineCount, fullResponse,
                        promptTokens, completionTokens, chapterMatches, outPath }) {
  const benchPath = resolve(__dirname, '../data/llm-benchmarks.json');
  let bench = { schema: 'llm-benchmark-log-1.0', project: 'YWA Game Guide Generation', runs: [] };

  if (existsSync(benchPath)) {
    try { bench = JSON.parse(readFileSync(benchPath, 'utf-8')); } catch {}
  }

  const runId = `run-${String(bench.runs.length + 1).padStart(3, '0')}`;
  const tokPerSec = completionTokens && elapsed > 0
    ? parseFloat((completionTokens / elapsed).toFixed(1))
    : parseFloat((fullResponse.length / 4 / elapsed).toFixed(1));

  // Quick hallucination check — did it use our character names?
  const knownChars = urgs.characters.map(c => c.name.toLowerCase());
  const mentionedChars = knownChars.filter(name => fullResponse.toLowerCase().includes(name));
  const inventedCharPattern = fullResponse.match(/\*\*([A-Z][a-z]+-[A-Z]|[A-Z][a-z]+oid|[A-Z][a-z]+naut)\*\*/g) || [];

  const run = {
    id: runId,
    timestamp: new Date().toISOString(),
    task: `KI Game Guide from Enhanced URGS v1`,
    provider,
    model: config.model,
    model_label: config.modelLabel,
    input_json: 'Enhanced URGS (11 chars, 11 stages, full moves, 12 trivia)',
    urgs_sections_filled: Object.keys(urgs).length - 1,
    urgs_characters: urgs.characters.length,
    urgs_stages: urgs.stages.length,
    urgs_trivia: urgs.trivia.length,
    prompt_tokens: promptTokens || null,
    output_tokens: completionTokens || Math.round(fullResponse.length / 4),
    words: wordCount,
    lines: lineCount,
    chars: fullResponse.length,
    chapters_requested: chapters.length,
    chapters_detected: chapterMatches.length,
    chapter_titles: chapterMatches.map(h => h.replace(/^#+\s*/, '').trim()),
    time_seconds: parseFloat(elapsed),
    tokens_per_second: tokPerSec,
    cost_usd: 0,
    characters_from_json_mentioned: mentionedChars.length,
    characters_total_in_json: knownChars.length,
    target_words: chapters.length * urgs.guide_generation.target_length_per_chapter,
    target_hit_pct: Math.round((wordCount / (chapters.length * urgs.guide_generation.target_length_per_chapter)) * 100),
    output_file: outPath.replace(resolve(__dirname, '..') + '/', ''),
  };

  bench.runs.push(run);
  writeFileSync(benchPath, JSON.stringify(bench, null, 2));
  console.log(`\n📈 Benchmark logged: ${runId} → data/llm-benchmarks.json`);

  // Print histogram-style comparison of all runs
  if (bench.runs.length > 1) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 ALL RUNS — Word Count Histogram`);
    console.log(`${'═'.repeat(60)}`);
    const maxWords = Math.max(...bench.runs.map(r => r.words));
    const barWidth = 40;
    for (const r of bench.runs) {
      const bar = '█'.repeat(Math.round((r.words / maxWords) * barWidth));
      const label = `${r.model_label || r.model}`.padEnd(20);
      console.log(`  ${label} ${bar} ${r.words.toLocaleString()} words (${r.time_seconds}s)`);
    }

    console.log(`\n📊 ALL RUNS — Speed (tok/s)`);
    console.log(`${'─'.repeat(60)}`);
    const maxSpeed = Math.max(...bench.runs.map(r => r.tokens_per_second));
    for (const r of bench.runs) {
      const bar = '█'.repeat(Math.round((r.tokens_per_second / maxSpeed) * barWidth));
      const label = `${r.model_label || r.model}`.padEnd(20);
      console.log(`  ${label} ${bar} ${r.tokens_per_second} tok/s`);
    }

    console.log(`\n📊 ALL RUNS — Target Hit %`);
    console.log(`${'─'.repeat(60)}`);
    for (const r of bench.runs) {
      const bar = '█'.repeat(Math.round((Math.min(r.target_hit_pct, 100) / 100) * barWidth));
      const label = `${r.model_label || r.model}`.padEnd(20);
      console.log(`  ${label} ${bar} ${r.target_hit_pct}%`);
    }
    console.log(`${'═'.repeat(60)}`);
  }
}

// ── Single-call streaming helper (returns text + token counts) ──────────────

async function streamCall(config, messages, maxTokens) {
  const apiKey = config.keyEnv ? process.env[config.keyEnv] : 'not-needed';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey && apiKey !== 'not-needed') headers['Authorization'] = `Bearer ${apiKey}`;

  let res;
  for (let attempt = 0; attempt < 5; attempt++) {
    res = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: maxTokens || config.maxTokens,
        temperature: 0.7,
        top_p: 0.9,
        stream: true,
      }),
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const waitSec = retryAfter ? parseInt(retryAfter) : 30 * (attempt + 1);
      console.log(`\n⏳ Rate limited — waiting ${waitSec}s before retry ${attempt + 2}/5...`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    break;
  }

  if (!res || !res.ok) throw new Error('Max retries exceeded on rate limit');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '', promptTokens = 0, completionTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) { process.stdout.write(delta); text += delta; }
        if (json.usage) { promptTokens = json.usage.prompt_tokens || 0; completionTokens = json.usage.completion_tokens || 0; }
        if (json.x_groq?.usage) { promptTokens = json.x_groq.usage.prompt_tokens || 0; completionTokens = json.x_groq.usage.completion_tokens || 0; }
      } catch {}
    }
  }
  return { text, promptTokens, completionTokens };
}

// ── Chapter-by-chapter generation mode ──────────────────────────────────────

async function generateChunked(provider) {
  const config = PROVIDERS[provider];
  const apiKey = config.keyEnv ? process.env[config.keyEnv] : 'not-needed';

  if (config.keyEnv && !apiKey) {
    console.error(`\n❌ Missing API key. Set ${config.keyEnv}=your_key`);
    process.exit(1);
  }

  console.log(`\n🎮 URGS v1 → ${config.name} Guide Generator (CHUNKED — 1 chapter/call)`);
  console.log(`📊 Model: ${config.modelLabel} (${config.model})`);
  console.log(`📐 Schema sections: ${Object.keys(urgs).length - 1}`);
  console.log(`👥 Characters: ${urgs.characters.length}`);
  console.log(`🗺️  Stages: ${urgs.stages.length}`);
  console.log(`📝 Chapters: ${chapters.length} (${chapters.join(', ')})`);
  console.log(`🎯 Target: ~${totalTarget} words (~${urgs.guide_generation.target_length_per_chapter}/chapter)`);
  console.log('─'.repeat(60));

  const startTime = Date.now();
  let fullResponse = '';
  let totalPromptTokens = 0, totalCompletionTokens = 0;

  // Relevant data subsets per chapter to keep prompts focused
  const chapterData = {
    introduction: { metadata: urgs.metadata, release: urgs.release, platforms: urgs.platforms, cultural_impact: urgs.cultural_impact, arcade_cabinet: urgs.arcade_cabinet },
    mechanics: { gameplay: urgs.gameplay, systems: urgs.systems },
    controls: { controls: urgs.controls, arcade_cabinet: urgs.arcade_cabinet },
    characters: { characters: urgs.characters, moves: urgs.moves },
    strategy: { strategy: urgs.strategy, systems: urgs.systems, characters: urgs.characters },
    trivia: { trivia: urgs.trivia, development: urgs.development },
    legacy: { cultural_impact: urgs.cultural_impact, versions: urgs.versions, release: urgs.release },
  };

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const chNum = i + 1;
    const subset = chapterData[ch] || urgs;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📖 Chapter ${chNum}/${chapters.length}: ${ch.toUpperCase()}`);
    console.log(`${'═'.repeat(60)}\n`);

    const chapterPrompt = `You are writing Chapter ${chNum} of ${chapters.length} for a "${urgs.metadata.title}" game guide.

RULES:
- Tone: ${urgs.guide_generation.tone}
- Style: ${urgs.guide_generation.style} — ${urgs.guide_generation.voice}
- This chapter topic: "${ch}"
- Target: ~${urgs.guide_generation.target_length_per_chapter} words for this chapter
- Use ONLY facts from the JSON data below — do not invent facts.
- Give this chapter a compelling title. Format: ## Chapter ${chNum}: [Your Title]
- Include specific details, names, move inputs, and real data from the JSON.
- Write in flowing paragraphs, not bullet lists.
${i > 0 ? `- Previous chapters covered: ${chapters.slice(0, i).join(', ')}. Do not repeat that content.` : ''}

URGS DATA FOR THIS CHAPTER:
${JSON.stringify(subset, null, 2)}

Write Chapter ${chNum} now.`;

    const { text, promptTokens, completionTokens } = await streamCall(
      config,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: chapterPrompt },
      ],
      config.maxTokens,
    );

    fullResponse += (i > 0 ? '\n\n' : '') + text;
    totalPromptTokens += promptTokens;
    totalCompletionTokens += completionTokens;

    const chWords = text.split(/\s+/).filter(Boolean).length;
    console.log(`\n  ✅ Ch${chNum} done — ${chWords} words, ${completionTokens} tokens`);

    // Delay between calls to respect TPM rate limits (Groq free = 12K TPM)
    if (i < chapters.length - 1) {
      const delaySec = provider === 'groq' ? 60 : 2;
      console.log(`  ⏳ Waiting ${delaySec}s for rate limit cooldown...`);
      await new Promise(r => setTimeout(r, delaySec * 1000));
    }
  }

  // ── Final stats ──
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const wordCount = fullResponse.split(/\s+/).filter(Boolean).length;
  const lineCount = fullResponse.split('\n').length;
  const chapterMatches = fullResponse.match(/^#+\s+.+/gm) || [];

  console.log('\n' + '═'.repeat(60));
  console.log(`\n✅ ALL ${chapters.length} CHAPTERS COMPLETE`);
  console.log(`⏱  Total time: ${elapsed}s`);
  console.log(`📊 Provider: ${config.name} — ${config.modelLabel}`);
  console.log(`🔢 Total prompt tokens: ${totalPromptTokens || '(not reported)'}`);
  console.log(`🔢 Total output tokens: ${totalCompletionTokens || '~' + Math.round(fullResponse.length / 4)}`);
  console.log(`📝 Total words: ${wordCount}`);
  console.log(`📄 Lines: ${lineCount}`);
  console.log(`📏 Chars: ${fullResponse.length}`);
  if (totalCompletionTokens && elapsed > 0) {
    console.log(`⚡ Avg speed: ${(totalCompletionTokens / elapsed).toFixed(1)} tok/s`);
  }

  console.log(`\n📖 Chapters/headers detected: ${chapterMatches.length}`);
  chapterMatches.forEach(h => console.log(`   ${h.trim()}`));

  // ── Save ──
  const outPath = resolve(__dirname, `../data/ki-${provider}-guide.md`);
  mkdirSync(dirname(outPath), { recursive: true });

  const header = `# ${urgs.metadata.title} — Complete Game Guide
_Generated by ${config.modelLabel} via ${config.name} (chunked — ${chapters.length} calls)_
_Schema: URGS-1.0 | Characters: ${urgs.characters.length} | Stages: ${urgs.stages.length} | Chapters: ${chapters.length}_
_Tone: ${urgs.guide_generation.tone} | Style: ${urgs.guide_generation.style}_
_Generated in ${elapsed}s | ~${wordCount} words_

---

`;
  writeFileSync(outPath, header + fullResponse);
  console.log(`\n💾 Saved to: ${outPath}`);

  // ── Log benchmark ──
  logBenchmark({
    provider, config, elapsed, wordCount, lineCount, fullResponse,
    promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens,
    chapterMatches, outPath
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

const provider = process.argv[2] || 'groq';
const chunked = process.argv.includes('--chunked');

if (!PROVIDERS[provider]) {
  console.error(`Unknown provider: ${provider}`);
  console.error(`Available: ${Object.keys(PROVIDERS).join(', ')}`);
  process.exit(1);
}

if (chunked) {
  generateChunked(provider);
} else {
  generateOpenAI(provider);
}
