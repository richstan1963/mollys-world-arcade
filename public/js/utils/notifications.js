/* Notification Manager — Polls for unread notifications */
window.NotificationManager = {
    playerId: null,
    pollInterval: null,
    lastCount: 0,
    lastChecked: null,

    init(playerId) {
        this.stop();
        this.playerId = playerId;
        if (!playerId) return;

        // Immediate first check
        this.check();

        // Poll every 30 seconds
        this.pollInterval = setInterval(() => this.check(), 30000);
    },

    stop() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        this.playerId = null;
        this.lastCount = 0;
        this.updateBadge(0);
    },

    async check() {
        if (!this.playerId) return;

        try {
            const data = await API.get(`/api/notifications/${this.playerId}/unread-count`);
            const count = data.count || 0;

            // Show toast for new notifications (only if count increased)
            if (count > this.lastCount && this.lastChecked !== null) {
                const diff = count - this.lastCount;
                const plural = diff === 1 ? 'notification' : 'notifications';
                this.showToast({ title: `${diff} new ${plural}`, type: 'info' });
            }

            this.lastCount = count;
            this.lastChecked = Date.now();
            this.updateBadge(count);
        } catch (e) {
            // Silent fail — notifications are non-critical
        }
    },

    showToast(notification) {
        if (typeof SFX !== 'undefined') SFX.click?.();
        if (typeof H !== 'undefined') {
            H.toast(notification.title || 'New notification', notification.type || 'info');
        }
    },

    updateBadge(count) {
        // Update the sidebar notification badge
        const badge = document.getElementById('notifBadge');
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.style.display = 'flex';
                badge.classList.add('notif-badge-pulse');
                // Remove pulse after animation
                setTimeout(() => badge.classList.remove('notif-badge-pulse'), 600);
            } else {
                badge.style.display = 'none';
            }
        }

        // Also update any inline badge indicators
        const inlineBadges = document.querySelectorAll('.notif-inline-badge');
        inlineBadges.forEach(el => {
            if (count > 0) {
                el.textContent = count;
                el.style.display = 'inline-flex';
            } else {
                el.style.display = 'none';
            }
        });
    },

    async markRead(notificationId) {
        if (!this.playerId) return;
        try {
            await API.post(`/api/notifications/${this.playerId}/read`, { notification_id: notificationId });
            this.check(); // Refresh count
        } catch (e) { /* silent */ }
    },

    async markAllRead() {
        if (!this.playerId) return;
        try {
            await API.post(`/api/notifications/${this.playerId}/read-all`);
            this.lastCount = 0;
            this.updateBadge(0);
        } catch (e) { /* silent */ }
    },
};
