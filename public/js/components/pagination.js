/* Pagination component */
window.Pagination = {
    render(page, totalPages, total) {
        if (totalPages <= 1) return '';

        let buttons = '';
        buttons += `<button ${page <= 1 ? 'disabled' : ''} onclick="Pagination._go(${page - 1})">← Prev</button>`;

        const range = 2;
        const start = Math.max(1, page - range);
        const end = Math.min(totalPages, page + range);

        if (start > 1) {
            buttons += `<button onclick="Pagination._go(1)">1</button>`;
            if (start > 2) buttons += `<span class="page-info">...</span>`;
        }

        for (let i = start; i <= end; i++) {
            buttons += `<button class="${i === page ? 'active' : ''}" onclick="Pagination._go(${i})">${i}</button>`;
        }

        if (end < totalPages) {
            if (end < totalPages - 1) buttons += `<span class="page-info">...</span>`;
            buttons += `<button onclick="Pagination._go(${totalPages})">${totalPages}</button>`;
        }

        buttons += `<button ${page >= totalPages ? 'disabled' : ''} onclick="Pagination._go(${page + 1})">Next →</button>`;
        buttons += `<span class="page-info">${total} total</span>`;

        return `<div class="pagination">${buttons}</div>`;
    },

    onNavigate: null,

    _go(page) {
        if (this.onNavigate) this.onNavigate(page);
    },
};
