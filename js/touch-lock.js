// ==========================================
// TOUCH LOCK (phones, mainly iPhone Safari and Chrome)
// The game is a fixed screen: the page itself must not slide, bounce or zoom under a finger. On iPhone a page
// that moves turns a tap into a tiny drag, and the tap is then cancelled (the button shows its pressed look but
// nothing happens). So: one-finger moves are blocked unless they are inside something that really scrolls
// (a list, a panel), two-finger pinch and double-tap zoom are blocked everywhere.
// The library page scrolls as a whole: html.page-scroll (set in switchView) turns the lock off there.
// Easy taps: iPhone drops a tap when the finger moves even a little. A short touch that moved less than
// TAP_SLOP_PX counts as a tap: the browser's own click is cancelled and the same click is sent at once instead.
// Text fields, dropdowns and disabled buttons keep the browser's own handling.
// Near misses: the game screen is scaled down on phones, so buttons are small. A tap that lands just outside
// every button (within NEAR_PX) goes to the nearest button.
// CSS side in index.html (html, body overflow and overscroll, touch-action on buttons).
// ==========================================
(function () {
    function scrollsHere(el, dx, dy) {
        for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
            const cs = getComputedStyle(el);
            const canY = /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
            const canX = /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
            if ((canY && Math.abs(dy) >= Math.abs(dx)) || (canX && Math.abs(dx) > Math.abs(dy))) return true;
            if (cs.touchAction === 'none') return true; // own drag handling (skill tree): its pointer events still run
        }
        return false;
    }
    const TAP_SLOP_PX = 24, TAP_MAX_MS = 800, NEAR_PX = 14;
    const CLICKABLE = 'button, a[href], [onclick], [role="button"], label, summary';
    function nearestButton(x, y) {
        let best = null, bestD = 1e9;
        for (const r of [5, 10, NEAR_PX]) {
            for (let a = 0; a < 16; a++) {
                const px = x + Math.cos(a * Math.PI / 8) * r, py = y + Math.sin(a * Math.PI / 8) * r;
                const hit = document.elementFromPoint(px, py);
                const b = hit && hit.closest && hit.closest(CLICKABLE);
                if (b && !b.disabled && r < bestD) { best = { el: hit, x: px, y: py }; bestD = r; }
            }
            if (best) return best;
        }
        return null;
    }
    let sx = 0, sy = 0, st = 0, moved = 0, multi = false;
    document.addEventListener('touchstart', e => {
        if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = performance.now(); moved = 0; multi = false; }
        else multi = true;
    }, { passive: true });
    document.addEventListener('touchend', e => {
        if (multi || e.touches.length > 0 || e.changedTouches.length !== 1) return;
        const t = e.changedTouches[0];
        moved = Math.max(moved, Math.hypot(t.clientX - sx, t.clientY - sy));
        if (moved > TAP_SLOP_PX || performance.now() - st > TAP_MAX_MS) return;
        let el = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement;
        if (!el || !el.closest) return;
        if (el.closest('input, textarea, select, [contenteditable], button:disabled, option')) return;
        let cx = t.clientX, cy = t.clientY;
        if (!el.closest(CLICKABLE)) {
            const near = nearestButton(sx, sy);
            if (near && !near.el.closest('input, textarea, select, [contenteditable]')) { el = near.el; cx = near.x; cy = near.y; }
        }
        e.preventDefault(); // no second (browser) click
        el.dispatchEvent(new MouseEvent('click', {
            bubbles: true, cancelable: true, composed: true, view: window, detail: 1,
            clientX: cx, clientY: cy, screenX: t.screenX, screenY: t.screenY
        }));
    }, { passive: false });
    document.addEventListener('touchmove', e => {
        if (document.documentElement.classList.contains('page-scroll')) return;
        if (e.touches.length > 1) { e.preventDefault(); return; } // pinch zoom
        const t = e.touches[0];
        moved = Math.max(moved, Math.hypot(t.clientX - sx, t.clientY - sy));
        if (!scrollsHere(e.target, t.clientX - sx, t.clientY - sy)) e.preventDefault();
    }, { passive: false });
    // iPhone pinch gestures (Safari's own event)
    ['gesturestart', 'gesturechange'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
})();
