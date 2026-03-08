/* ═══════════════════════════════════════════════════════
   Input Validation & Sanitization Middleware
   ═══════════════════════════════════════════════════════ */

/**
 * Sanitize a string — strip HTML, control chars, trim, limit length
 */
function sanitizeString(val, maxLen = 500) {
    if (typeof val !== 'string') return val;
    return val.replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim().slice(0, maxLen);
}

/**
 * Deep-sanitize request body — clean all string values recursively
 */
function deepSanitize(obj, depth = 5) {
    if (depth <= 0) return obj;
    if (typeof obj === 'string') return sanitizeString(obj);
    if (Array.isArray(obj)) return obj.slice(0, 200).map(v => deepSanitize(v, depth - 1));
    if (obj && typeof obj === 'object') {
        const clean = {};
        for (const key of Object.keys(obj).slice(0, 100)) {
            clean[sanitizeString(key, 100)] = deepSanitize(obj[key], depth - 1);
        }
        return clean;
    }
    return obj;
}

/**
 * Global body sanitization middleware — mount on app
 */
export function sanitizeBody(req, res, next) {
    if (req.body && typeof req.body === 'object') {
        req.body = deepSanitize(req.body);
    }
    next();
}

/**
 * Per-route schema validator
 * Usage: validate({ player_id: { required: true, type: 'number', min: 1 }, name: { type: 'string', maxLength: 50 } })
 */
export function validate(schema) {
    return (req, res, next) => {
        const errors = [];
        for (const [field, rules] of Object.entries(schema)) {
            const val = req.body[field];
            if (rules.required && (val === undefined || val === null || val === '')) {
                errors.push(`${field} is required`);
                continue;
            }
            if (val !== undefined && val !== null) {
                if (rules.type === 'number' && typeof val !== 'number') errors.push(`${field} must be a number`);
                if (rules.type === 'string' && typeof val !== 'string') errors.push(`${field} must be a string`);
                if (rules.type === 'boolean' && typeof val !== 'boolean') errors.push(`${field} must be a boolean`);
                if (rules.type === 'array' && !Array.isArray(val)) errors.push(`${field} must be an array`);
                if (rules.min !== undefined && val < rules.min) errors.push(`${field} must be >= ${rules.min}`);
                if (rules.max !== undefined && val > rules.max) errors.push(`${field} must be <= ${rules.max}`);
                if (rules.maxLength && typeof val === 'string' && val.length > rules.maxLength) errors.push(`${field} max length ${rules.maxLength}`);
                if (rules.enum && !rules.enum.includes(val)) errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
            }
        }
        if (errors.length) return res.status(400).json({ error: errors.join('; ') });
        next();
    };
}
