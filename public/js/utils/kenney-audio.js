/**
 * KenneyAudio — plays real OGG jingles from the Kenney Music Jingles pack
 *
 * 85 jingles across 5 instrument categories, each with 17 numbered clips (00-16).
 * Categories: NES (8-bit), HIT (percussion hits), PIZZI (pizzicato strings),
 *             SAX (saxophone), STEEL (steel drums)
 *
 * Usage:
 *   KenneyAudio.play('win');           // play win jingle with default (NES) instrument
 *   KenneyAudio.play('lose', 'SAX');   // play lose jingle with sax instrument
 *   KenneyAudio.playRaw('jingles_NES03');  // play a specific file by name
 *   KenneyAudio.setCategory('STEEL');  // change default instrument category
 *   KenneyAudio.setVolume(0.3);        // change default volume (0-1)
 *
 * Jingle-to-event mapping (each number is consistent across all 5 categories):
 *   00 = opening / intro fanfare
 *   01 = win (short)
 *   02 = win (medium, celebratory)
 *   03 = achievement / high score fanfare
 *   04 = level complete / stage clear
 *   05 = lose (short)
 *   06 = lose (medium, descending)
 *   07 = game over / sad ending
 *   08 = alert / tension / warning
 *   09 = countdown / timer
 *   10 = power-up / boost
 *   11 = bonus / coin collect
 *   12 = level-up / rank-up
 *   13 = transition / whoosh
 *   14 = pause / menu open
 *   15 = ending / credits
 *   16 = misc / extra
 */
window.KenneyAudio = (() => {
    // Base path — folders have spaces, encoded in the path map below
    const BASE = '/img/game-assets/kenney-audio/Audio/';

    // Map category codes to their folder names (with spaces)
    const FOLDERS = {
        NES:   '8-Bit jingles',
        HIT:   'Hit jingles',
        PIZZI: 'Pizzicato jingles',
        SAX:   'Sax jingles',
        STEEL: 'Steel jingles'
    };

    // Semantic event names → jingle number
    const EVENTS = {
        // Positive / victory
        'intro':        '00',
        'win':          '01',
        'win-big':      '02',
        'achievement':  '03',
        'highscore':    '03',
        'level-complete': '04',
        'stage-clear':  '04',

        // Negative / defeat
        'lose':         '05',
        'lose-big':     '06',
        'game-over':    '07',

        // Action / gameplay
        'alert':        '08',
        'warning':      '08',
        'countdown':    '09',
        'timer':        '09',
        'power-up':     '10',
        'boost':        '10',
        'bonus':        '11',
        'coin':         '11',
        'collect':      '11',
        'level-up':     '12',
        'rank-up':      '12',

        // UI / transitions
        'transition':   '13',
        'whoosh':       '13',
        'pause':        '14',
        'menu':         '14',
        'ending':       '15',
        'credits':      '15',
        'misc':         '16'
    };

    // Defaults
    let defaultCategory = 'NES';
    let defaultVolume = 0.5;
    let enabled = true;

    // Audio element cache: key = full filename (no ext), value = Audio element
    const cache = {};

    /**
     * Build the URL path for a given category + number
     */
    function buildPath(category, number) {
        const folder = FOLDERS[category];
        if (!folder) return null;
        const prefix = category === 'NES' ? 'NES' : category;
        const filename = `jingles_${prefix}${number}`;
        return BASE + encodeURIComponent(folder) + '/' + filename + '.ogg';
    }

    /**
     * Play a semantic event jingle.
     * @param {string} event - Event name (e.g. 'win', 'lose', 'power-up', 'achievement')
     * @param {string} [category] - Instrument category: NES, HIT, PIZZI, SAX, STEEL
     * @param {number} [volume] - Volume 0-1, defaults to defaultVolume
     */
    function play(event, category, volume) {
        if (!enabled) return;
        const num = EVENTS[event];
        if (!num) {
            console.warn(`[KenneyAudio] Unknown event: "${event}". Available: ${Object.keys(EVENTS).join(', ')}`);
            return;
        }
        const cat = (category || defaultCategory).toUpperCase();
        const path = buildPath(cat, num);
        if (!path) {
            console.warn(`[KenneyAudio] Unknown category: "${cat}". Available: ${Object.keys(FOLDERS).join(', ')}`);
            return;
        }
        _playPath(path, volume || defaultVolume);
    }

    /**
     * Play a specific jingle file by its base name (no folder, no extension).
     * @param {string} name - e.g. 'jingles_NES03', 'jingles_STEEL10'
     * @param {number} [volume] - Volume 0-1
     */
    function playRaw(name, volume) {
        if (!enabled) return;
        // Detect category from the name
        const match = name.match(/jingles_(NES|HIT|PIZZI|SAX|STEEL)(\d+)/);
        if (!match) {
            console.warn(`[KenneyAudio] Invalid jingle name: "${name}"`);
            return;
        }
        const cat = match[1];
        const num = match[2];
        const path = buildPath(cat, num);
        if (path) _playPath(path, volume || defaultVolume);
    }

    /**
     * Internal: play an audio file by URL path
     */
    function _playPath(path, volume) {
        if (!cache[path]) {
            cache[path] = new Audio(path);
        }
        // Clone so overlapping plays work
        const a = cache[path].cloneNode();
        a.volume = Math.max(0, Math.min(1, volume));
        a.play().catch(() => {});
    }

    /**
     * Preload specific jingles for instant playback.
     * @param {string[]} events - Array of event names to preload
     * @param {string} [category] - Category to preload for
     */
    function preload(events, category) {
        const cat = (category || defaultCategory).toUpperCase();
        events.forEach(event => {
            const num = EVENTS[event];
            if (num) {
                const path = buildPath(cat, num);
                if (path && !cache[path]) {
                    cache[path] = new Audio(path);
                    cache[path].preload = 'auto';
                }
            }
        });
    }

    function setCategory(cat) { defaultCategory = cat.toUpperCase(); }
    function setVolume(vol) { defaultVolume = Math.max(0, Math.min(1, vol)); }
    function setEnabled(val) { enabled = !!val; }
    function isEnabled() { return enabled; }

    /**
     * Get all available event names
     */
    function getEvents() { return Object.keys(EVENTS); }

    /**
     * Get all available categories
     */
    function getCategories() { return Object.keys(FOLDERS); }

    return {
        play,
        playRaw,
        preload,
        setCategory,
        setVolume,
        setEnabled,
        isEnabled,
        getEvents,
        getCategories,
        EVENTS,
        FOLDERS
    };
})();
