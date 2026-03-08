/* Simple hash-based SPA router */
window.Router = {
    routes: {},
    current: null,

    register(path, handler) {
        this.routes[path] = handler;
    },

    navigate(hash) {
        window.location.hash = hash;
    },

    start() {
        const handle = () => {
            const hash = window.location.hash || '#/';
            const hashPath = hash.slice(1).split('?')[0]; // Strip query params before matching
            const [path, ...rest] = hashPath.split('/').filter(Boolean);
            const routePath = '/' + (path || '');
            const params = rest;

            // Update active nav link
            document.querySelectorAll('.nav-link').forEach(link => {
                const view = link.dataset.view;
                link.classList.toggle('active',
                    (routePath === '/' && view === 'home') ||
                    routePath === '/' + view
                );
            });

            // Find matching route
            let handler = this.routes[routePath];
            if (!handler) {
                // Try wildcard routes like /game/:id
                for (const [route, h] of Object.entries(this.routes)) {
                    if (route.includes(':')) {
                        const routeParts = route.split('/');
                        const hashParts = ('/' + (path || '') + (rest.length ? '/' + rest.join('/') : '')).split('/');
                        if (routeParts.length === hashParts.length) {
                            const routeParams = {};
                            let match = true;
                            for (let i = 0; i < routeParts.length; i++) {
                                if (routeParts[i].startsWith(':')) {
                                    routeParams[routeParts[i].slice(1)] = hashParts[i];
                                } else if (routeParts[i] !== hashParts[i]) {
                                    match = false;
                                    break;
                                }
                            }
                            if (match) {
                                handler = () => h(routeParams);
                                break;
                            }
                        }
                    }
                }
            }

            if (handler) {
                this.current = routePath;
                const app = document.getElementById('app');
                app.innerHTML = '<div class="loading">Loading...</div>';
                try {
                    handler(params);
                } catch (e) {
                    console.error('Route error:', e);
                    app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Something went wrong</h3><p>${e.message}</p></div>`;
                }
            }
        };

        window.addEventListener('hashchange', handle);
        handle();
    },
};
