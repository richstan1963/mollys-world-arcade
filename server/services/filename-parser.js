// Parses ROM filenames into clean display names + metadata

const REGION_PATTERNS = [
    { pattern: /\((?:U|USA|US)\)/i, region: 'USA' },
    { pattern: /\((?:J|Japan|JP)\)/i, region: 'Japan' },
    { pattern: /\((?:E|Europe|EU)\)/i, region: 'Europe' },
    { pattern: /\((?:W|World)\)/i, region: 'World' },
    { pattern: /\((?:K|Korea|KR)\)/i, region: 'Korea' },
    { pattern: /\((?:F|France|FR)\)/i, region: 'France' },
    { pattern: /\((?:G|Germany|DE)\)/i, region: 'Germany' },
    { pattern: /\((?:S|Spain|ES)\)/i, region: 'Spain' },
    { pattern: /\((?:I|Italy|IT)\)/i, region: 'Italy' },
    { pattern: /\((?:A|Australia|AU)\)/i, region: 'Australia' },
];

// Tags to strip entirely
const STRIP_PATTERNS = [
    /\[!\]/g,                    // Verified good dump
    /\[b\d*\]/gi,               // Bad dump
    /\[h\d*\w*\]/gi,            // Hack
    /\[o\d*\]/gi,               // Overdump
    /\[t\d*\]/gi,               // Trainer
    /\[f\d*\]/gi,               // Fixed
    /\[a\d*\]/gi,               // Alternate
    /\[p\d*\]/gi,               // Pirate
    /\(Rev\s*\w*\)/gi,          // Revision
    /\(V\d+\.?\d*\)/gi,        // Version
    /\(Beta\w*\)/gi,            // Beta
    /\(Proto\w*\)/gi,           // Prototype
    /\(Sample\)/gi,             // Sample
    /\(Demo\)/gi,               // Demo
    /\(Unl\)/gi,                // Unlicensed
    /\(PD\)/gi,                 // Public Domain
    /\(\d{4}\)/g,               // Year in parens
];

export function parseFilename(filename) {
    // Remove extension
    let name = filename.replace(/\.[^.]+$/, '');

    // Extract region
    let region = null;
    for (const rp of REGION_PATTERNS) {
        if (rp.pattern.test(name)) {
            region = rp.region;
            name = name.replace(rp.pattern, '');
            break;
        }
    }

    // Extract year if present
    let year = null;
    const yearMatch = name.match(/\((\d{4})\)/);
    if (yearMatch) year = yearMatch[1];

    // Strip all metadata tags
    for (const pattern of STRIP_PATTERNS) {
        name = name.replace(pattern, '');
    }

    // Strip any remaining parenthesized/bracketed content
    name = name.replace(/\([^)]*\)/g, '');
    name = name.replace(/\[[^\]]*\]/g, '');

    // Clean up separators
    name = name
        .replace(/_/g, ' ')
        .replace(/\./g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\s*-\s*$/, '')
        .trim();

    return { clean_name: name, region, year };
}
