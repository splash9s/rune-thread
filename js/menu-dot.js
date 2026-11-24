// ==========================================
// MENU NOTIFICATION DOT (presentation only)
// Every menu "new" mark that used the alert picture (assets/page01/alert_q85.webp) is now a red dot:
// a red sphere with a small highlight and a soft glow, no white border. It pops in once each time it
// appears, then glows softly. Reduce motion (the in-game setting or the system setting): no pop and no
// glow, the dot just fades in.
//
// How it works: every <img> with the alert picture is swapped for a <span class="menu-dot"> at the
// same place. The same id, classes and inline position/display are kept, so the existing show/hide
// code (setAlert, refreshFriendAlert, claim checks, ...) works unchanged. Its size comes from this
// file, not the old picture size. A MutationObserver converts alerts added later (menus built with innerHTML).
// ==========================================
(function menuDotInit() {
    const ALERT_SRC = 'alert_q85.webp';
    const SELECTOR = 'img[src*="' + ALERT_SRC + '"]';
    const DOT_PX = 24;

    const st = document.createElement('style');
    st.textContent = `
.menu-dot { position: absolute; width: ${DOT_PX}px; height: ${DOT_PX}px; border-radius: 50%; box-sizing: border-box;
  pointer-events: none; z-index: 10; display: block;
  background:
    radial-gradient(circle at 32% 28%, rgba(255,255,255,.95) 0 9%, rgba(255,255,255,0) 14%),
    radial-gradient(circle at 50% 50%, #ff6b6b 0%, #ef4444 45%, #b91c1c 85%, #7f1d1d 100%);
  box-shadow: 0 2px 4px rgba(0,0,0,.6), 0 0 0 1px rgba(127,29,29,.9);
  animation: menu-dot-pop .5s cubic-bezier(.2,1.6,.4,1) both, menu-dot-glow 1.8s ease-in-out .5s infinite; }
.menu-dot.menu-dot-inline { position: relative; vertical-align: middle; margin-left: 4px; }
@keyframes menu-dot-pop { 0% { transform: scale(0); } 100% { transform: scale(1); } }
@keyframes menu-dot-glow {
  0%, 100% { box-shadow: 0 2px 4px rgba(0,0,0,.6), 0 0 0 1px rgba(127,29,29,.9), 0 0 6px 1px rgba(255,80,80,.35); }
  50%      { box-shadow: 0 2px 4px rgba(0,0,0,.6), 0 0 0 1px rgba(127,29,29,.9), 0 0 14px 4px rgba(255,80,80,.7); }
}
@keyframes menu-dot-fade { from { opacity: 0; } to { opacity: 1; } }
html.menu-dot-still .menu-dot { animation: menu-dot-fade .4s ease both; }
@media (prefers-reduced-motion: reduce) { .menu-dot { animation: menu-dot-fade .4s ease both; } }`;
    document.head.appendChild(st);

    // Reduce motion: the game's own setting (boss-intro.js juiceReduceMotion) or the system setting
    function still() {
        try { return typeof juiceReduceMotion === 'function' ? !!juiceReduceMotion() : false; }
        catch (e) { return false; }
    }
    function refreshStill() { document.documentElement.classList.toggle('menu-dot-still', still()); }
    refreshStill();
    setInterval(refreshStill, 1000);
    if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (mq.addEventListener) mq.addEventListener('change', refreshStill);
    }

    // Swap one alert picture for a red dot. Keeps the id, classes and inline position/display.
    function convert(img) {
        if (!img.parentNode) return;
        const span = document.createElement('span');
        span.className = (img.className ? img.className + ' ' : '') + 'menu-dot';
        span.setAttribute('style', img.getAttribute('style') || '');
        span.style.width = '';   // size comes from .menu-dot
        span.style.height = '';
        if (img.id) span.id = img.id;
        span.setAttribute('aria-hidden', 'true');
        if (img.id === 'alert-stat-pts') span.classList.add('menu-dot-inline'); // sits in the "Pts" line
        img.replaceWith(span);
    }
    function convertIn(node) {
        if (!node || node.nodeType !== 1) return;
        if (node.matches && node.matches(SELECTOR)) convert(node);
        else if (node.querySelectorAll) node.querySelectorAll(SELECTOR).forEach(convert);
    }

    convertIn(document.body);
    new MutationObserver(records => {
        for (const r of records) r.addedNodes.forEach(convertIn);
    }).observe(document.body, { childList: true, subtree: true });
})();
