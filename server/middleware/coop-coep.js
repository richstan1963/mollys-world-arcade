// COOP/COEP enables SharedArrayBuffer for EmulatorJS multi-threaded mode.
// Only set headers for browsers that support 'credentialless' (Chrome 96+, Firefox 119+).
// Safari/iOS doesn't support it — EmulatorJS falls back to single-threaded mode (still fast for retro games).
// Also skip for tunneled/proxied requests where cross-origin isolation can cause issues.
export function coopCoep(req, res, next) {
    const ua = req.headers['user-agent'] || '';
    const isSafari = ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium');
    const isIOS = /iPad|iPhone|iPod/.test(ua);

    // Only apply isolation headers for desktop Chrome/Firefox (not Safari, not iOS)
    if (!isSafari && !isIOS) {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    }
    next();
}
