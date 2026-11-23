// ==========================================
// TOUCH LOCK (phones, mainly iPhone Safari and Chrome)
// The game is a fixed screen: the page itself must not slide, bounce or zoom under a finger. On iPhone a page
// that moves turns a tap into a tiny drag, and the tap is then cancelled (the button shows its pressed look but
// nothing happens). So: one-finger moves are blocked unless they are inside something that really scrolls
// (a list, a panel), two-finger pinch and double-tap zoom are blocked everywhere.
// The library page scrolls as a whole: html.page-scroll (set in switchView) turns the lock off there.
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
    let sx = 0, sy = 0;
    document.addEventListener('touchstart', e => {
        if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
    }, { passive: true });
    document.addEventListener('touchmove', e => {
        if (document.documentElement.classList.contains('page-scroll')) return;
        if (e.touches.length > 1) { e.preventDefault(); return; } // pinch zoom
        const t = e.touches[0];
        if (!scrollsHere(e.target, t.clientX - sx, t.clientY - sy)) e.preventDefault();
    }, { passive: false });
    // iPhone pinch gestures (Safari's own event)
    ['gesturestart', 'gesturechange'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
})();
