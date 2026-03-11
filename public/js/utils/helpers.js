/* Shared helper functions */
window.H = {
    $(sel, parent = document) { return parent.querySelector(sel); },
    $$(sel, parent = document) { return [...parent.querySelectorAll(sel)]; },

    formatBytes(bytes) {
        if (!bytes) return '—';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
        return (bytes / 1073741824).toFixed(1) + ' GB';
    },

    formatDuration(seconds) {
        if (!seconds) return '—';
        if (seconds < 60) return seconds + 's';
        if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + (seconds % 60) + 's';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return h + 'h ' + m + 'm';
    },

    timeAgo(dateStr) {
        if (!dateStr) return '—';
        const d = new Date(dateStr + (dateStr.includes('Z') ? '' : 'Z'));
        const now = Date.now();
        const diff = now - d.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return mins + 'm ago';
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + 'h ago';
        const days = Math.floor(hrs / 24);
        if (days < 30) return days + 'd ago';
        return d.toLocaleDateString();
    },

    escHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    toast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.textContent = message;
        container.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
        // Sound FX
        if (typeof SFX !== 'undefined') {
            if (type === 'error') SFX.error();
            else SFX.toast();
        }
    },

    artworkSrc(game) {
        if (game.artwork_path) {
            // Encode each segment so spaces/special chars in filenames work correctly
            const encoded = game.artwork_path.split('/').map(encodeURIComponent).join('/');
            return `/artwork/${encoded}`;
        }
        return null;
    },

    systemEmoji(systemId) {
        const map = {
            nes: '🎮', snes: '🎮', n64: '🎮', gb: '🎮', gbc: '🎮', gba: '🎮', nds: '📱',
            genesis: '🕹️', sms: '🕹️', gamegear: '🕹️', saturn: '🕹️', '32x': '🕹️',
            psx: '💿', psp: '💿',
            atari2600: '👾', atari7800: '👾', jaguar: '👾', lynx: '👾',
            tg16: '📺', ngp: '🎮', arcade: '🕹️', fbneo: '🕹️',
            wonderswan: '🎮', vb: '🥽', '3do': '💿', coleco: '👾', dos: '💾',
        };
        return map[systemId] || '🎮';
    },

    systemImg(systemId) {
        return `/assets/img/system-icons/${systemId}.png`;
    },
};
