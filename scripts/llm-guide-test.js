#!/usr/bin/env node
/**
 * LLM Game Guide Generator — URGS v1 Test with Killer Instinct
 * Feeds the EXACT URGS (Universal Retro Game Knowledge Schema) JSON
 * from the KI PDF to local Ollama and generates a game guide.
 * Compare output vs the 222-page Claude-generated PDF.
 */

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'qwen2.5:7b';

// ── URGS v1 — Killer Instinct — verbatim from the KI PDF pp.207-222 ──────────

const urgsData = {
    schema: "URGS-1.0",
    entity_type: "video_game",

    // 1. Metadata
    metadata: {
        title: "Killer Instinct",
        series: "Killer Instinct",
        genre: "Fighting",
        developer: "Rare",
        publisher: "Midway / Nintendo",
        release_year: 1994,
        arcade_board: "Midway Wolf Unit",
        players: "1-2",
        camera: "Side view",
        control_type: "Joystick + 6 buttons"
    },

    // 2. Release Data
    release: {
        arcade: 1994,
        snes: 1995,
        gameboy: 1995
    },

    // 3. Development (empty in KI example)
    development: {},

    // 4. Platforms
    platforms: [
        { name: "Arcade", hardware: "Midway arcade system", storage: "Hard drive", notes: "Original version" },
        { name: "SNES", storage: "Cartridge", notes: "Reduced animation and audio" },
        { name: "Game Boy", notes: "Simplified graphics and mechanics" }
    ],

    // 5. Gameplay Mechanics
    gameplay: {
        objective: "Reduce opponent health to zero",
        round_structure: "Best of three rounds",
        signature_system: "Combo chaining system",
        unique_mechanics: [
            "Combo breakers",
            "Ultra combos",
            "Auto-doubles"
        ]
    },

    // 6. Controls
    controls: {
        layout: "Six button fighter",
        buttons: {
            light_punch: "",
            medium_punch: "",
            heavy_punch: "",
            light_kick: "",
            medium_kick: "",
            heavy_kick: ""
        },
        movement: [
            "walk",
            "jump",
            "crouch",
            "block"
        ]
    },

    // 7. Combat Systems
    systems: {
        combo_structure: [
            "opener",
            "auto_double",
            "linker",
            "ender"
        ],
        defense: [
            "combo_breaker",
            "blocking",
            "spacing"
        ]
    },

    // 8. Characters
    characters: [
        { name: "Jago", archetype: "Balanced martial artist", playstyle: "All-around", signature_moves: ["Wind Kick", "Endokuken"] },
        { name: "Sabrewulf", archetype: "Speed rushdown", playstyle: "Aggressive close combat" },
        { name: "Fulgore", archetype: "Cybernetic soldier", playstyle: "Balanced offense and zoning" }
    ],

    // 9. Moves
    moves: {
        special_moves: [],
        finishers: [],
        ultra_combos: []
    },

    // 10. Combos (from core structure)
    combos: {},

    // 11. Stages
    stages: [
        { name: "Industrial Arena", theme: "Mechanical factory", visual_features: ["Moving machinery", "Metallic lighting"] }
    ],

    // 12. Versions
    versions: [
        { platform: "Arcade", differences: "Full animation and audio" },
        { platform: "SNES", differences: "Reduced animation frames" }
    ],

    // 13. Strategy Data
    strategy: {
        beginner: [
            "Learn one opener",
            "Use short combos first"
        ],
        advanced: [
            "Mix auto-double strengths",
            "Bait combo breakers"
        ]
    },

    // 14. Cheats and Secrets
    cheats: [
        { type: "mechanic", name: "Combo Breaker", effect: "Interrupt combo" }
    ],

    // 15. Trivia Engine
    trivia: [
        "Killer Instinct used a hard drive in its arcade cabinet.",
        "The announcer phrases became iconic in fighting game culture."
    ],

    // 16. Arcade Cabinet
    arcade_cabinet: {
        controls: "Joystick + six buttons",
        features: [
            "Large speakers",
            "Loud announcer",
            "Attract mode showcase"
        ]
    },

    // 17. Cultural Impact
    cultural_impact: {
        iconic_phrases: [
            "Ultra Combo",
            "Combo Breaker",
            "Supreme Victory"
        ],
        legacy: "One of the most recognizable arcade fighting games of the 1990s"
    },

    // 18. Guide Generation Rules (LLM Engine)
    guide_generation: {
        chapter_template: [
            "introduction",
            "mechanics",
            "controls",
            "characters",
            "strategy",
            "trivia",
            "legacy"
        ],
        target_length_per_chapter: 900,
        tone: "arcade documentary",
        style: "human narrative, not listicle"
    }
};

// ── Prompt uses the URGS guide_generation rules ──────────────────────────────

const chapters = urgsData.guide_generation.chapter_template;
const prompt = `You are a retro gaming expert and arcade historian. Below is a URGS v1 (Universal Retro Game Knowledge Schema) JSON dataset for a classic game. Using ONLY the data provided — do not invent facts — write a complete game guide.

RULES:
- Tone: ${urgsData.guide_generation.tone}
- Style: ${urgsData.guide_generation.style}
- Write ${chapters.length} chapters: ${chapters.join(', ')}
- Target: ~${urgsData.guide_generation.target_length_per_chapter} words per chapter
- Total target: ~${chapters.length * urgsData.guide_generation.target_length_per_chapter} words
- Use ONLY facts from the JSON. If a field is empty, skip it gracefully.
- Write like a real strategy guide or gaming magazine feature, not a wiki dump.

URGS DATA:
${JSON.stringify(urgsData, null, 2)}

Write the complete guide now:`;

// ── Generator with streaming + stats ─────────────────────────────────────────

async function generate() {
    const inputTokenEstimate = Math.round(prompt.length / 4);
    console.log(`\n🎮 URGS v1 → Ollama Guide Generator`);
    console.log(`📊 Model: ${MODEL}`);
    console.log(`📐 Schema sections: ${Object.keys(urgsData).length - 1}`); // minus "schema"
    console.log(`📝 Chapters requested: ${chapters.length} (${chapters.join(', ')})`);
    console.log(`🎯 Target: ~${chapters.length * urgsData.guide_generation.target_length_per_chapter} words`);
    console.log(`📦 Input: ~${inputTokenEstimate} tokens (${prompt.length} chars)`);
    console.log('─'.repeat(60));

    const startTime = Date.now();
    let fullResponse = '';

    try {
        const res = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL,
                prompt: prompt,
                stream: true,
                options: {
                    temperature: 0.7,
                    num_predict: 8192,  // doubled for longer output
                    top_p: 0.9,
                },
            }),
        });

        if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split('\n').filter(Boolean)) {
                try {
                    const json = JSON.parse(line);
                    if (json.response) {
                        process.stdout.write(json.response);
                        fullResponse += json.response;
                    }
                    if (json.done) {
                        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                        const evalTokens = json.eval_count || 0;
                        const promptTokens = json.prompt_eval_count || 0;
                        const wordCount = fullResponse.split(/\s+/).filter(Boolean).length;
                        const lineCount = fullResponse.split('\n').length;

                        console.log('\n' + '─'.repeat(60));
                        console.log(`\n✅ Generation complete`);
                        console.log(`⏱  Time: ${elapsed}s`);
                        console.log(`📊 Model: ${MODEL}`);
                        console.log(`🔢 Prompt tokens: ${promptTokens}`);
                        console.log(`🔢 Output tokens: ${evalTokens}`);
                        console.log(`📝 Words: ${wordCount}`);
                        console.log(`📄 Lines: ${lineCount}`);
                        console.log(`📏 Chars: ${fullResponse.length}`);
                        console.log(`⚡ Speed: ${evalTokens ? (evalTokens / (elapsed)).toFixed(1) : '?'} tok/s`);

                        // Chapter detection
                        const chapterMatches = fullResponse.match(/^#+\s+.+/gm) || [];
                        console.log(`📖 Chapters detected: ${chapterMatches.length}`);
                        chapterMatches.forEach(h => console.log(`   ${h.trim()}`));

                        // Compare stats
                        console.log(`\n── Comparison: Local 7B vs Claude PDF ──`);
                        console.log(`   PDF: 222 pages, ~50,000 words, 17 chapters`);
                        console.log(`   7B:  ${lineCount} lines, ~${wordCount} words, ${chapterMatches.length} chapters`);
                        console.log(`   Ratio: ${(50000 / wordCount).toFixed(0)}:1 (PDF is ${(50000 / wordCount).toFixed(0)}x longer)`);
                    }
                } catch {}
            }
        }
    } catch (err) {
        console.error('❌ Ollama error:', err.message);
        console.error('   Make sure Ollama is running: ollama serve');
        process.exit(1);
    }

    // Save output
    const outPath = new URL('../data/ki-urgs-guide.md', import.meta.url).pathname;
    const { writeFileSync, mkdirSync } = await import('fs');
    const { dirname } = await import('path');
    mkdirSync(dirname(outPath), { recursive: true });

    const header = `# Killer Instinct — Game Guide (URGS v1)
_Generated by ${MODEL} (local 7B LLM) from URGS v1 schema data_
_Schema: URGS-1.0 | Sections: ${Object.keys(urgsData).length - 1} | Chapters: ${chapters.length}_
_Tone: ${urgsData.guide_generation.tone} | Style: ${urgsData.guide_generation.style}_

---

`;
    writeFileSync(outPath, header + fullResponse);
    console.log(`\n💾 Saved to: ${outPath}`);
}

generate();
