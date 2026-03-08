/* Search bar with debounce */
window.SearchBar = {
    render(placeholder = 'Search games...', value = '') {
        return `
            <div class="search-wrap">
                <input type="text" class="search-input" id="searchInput"
                       placeholder="${placeholder}" value="${H.escHtml(value)}"
                       autocomplete="off">
            </div>
        `;
    },

    bind(callback, delay = 300) {
        const input = document.getElementById('searchInput');
        if (!input) return;
        let timer;
        input.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => callback(input.value), delay);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { input.value = ''; callback(''); }
        });
    },
};
