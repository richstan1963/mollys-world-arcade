/* Cabinet Mode — REMOVED (V8 cleanup) */
/* Safe no-ops so any stray references don't crash */

window.CabinetMode = {
    active: false,
    init() {
        // Clear any lingering cabinet mode from localStorage
        localStorage.removeItem('cabinet_mode');
        document.body.classList.remove('cabinet-mode');
    },
    toggle() {},
    insertCoin() {},
    useCredit() { return true; },
};

window.OperatorMenu = {
    visible: false,
    toggle() {},
    show() {},
    hide() {},
};
