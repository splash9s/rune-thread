// Phones held upright: a "Play in landscape" button (shown from the first load while the phone is in portrait).
// Android browsers: full screen, then the screen is locked sideways. iPhone and in-app browsers (LINE etc.) do not let
// a page turn the screen, so a short tip asks the player to turn the phone instead.
(function () {
    const isTouch = () => (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
    const isPortrait = () => window.innerHeight > window.innerWidth;
    let dismissed = false; // the ✕ hides the button until the page is opened again

    function box() {
        let b = document.getElementById('landscape-btn');
        if (!b) {
            b = document.createElement('div');
            b.id = 'landscape-btn';
            b.innerHTML = '<button id="landscape-go" type="button">&#10227; Play in landscape</button>'
                + '<button id="landscape-x" type="button" aria-label="Close">&#10005;</button>';
            document.body.appendChild(b);
            b.querySelector('#landscape-go').addEventListener('click', goLandscape);
            b.querySelector('#landscape-x').addEventListener('click', () => { dismissed = true; update(); });
        }
        return b;
    }

    async function goLandscape() {
        let locked = false;
        try {
            const de = document.documentElement;
            if (!document.fullscreenElement && de.requestFullscreen) await de.requestFullscreen({ navigationUI: 'hide' });
            if (screen.orientation && screen.orientation.lock) {
                await screen.orientation.lock('landscape');
                locked = true;
            }
        } catch (e) { locked = false; }
        if (!locked) showTip();
        setTimeout(update, 500);
    }

    function showTip() {
        let t = document.getElementById('landscape-tip');
        if (!t) {
            t = document.createElement('div');
            t.id = 'landscape-tip';
            document.body.appendChild(t);
        }
        const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
        t.innerHTML = '<b>Turn your phone sideways</b> for the best view.'
            + (iphone ? '<br>If it does not turn, switch off Portrait Orientation Lock in Control Center.' : '');
        t.style.display = 'block';
        clearTimeout(showTip.timer);
        showTip.timer = setTimeout(() => { t.style.display = 'none'; }, 6000);
    }

    function update() {
        if (!document.body) return;
        const show = !dismissed && isTouch() && isPortrait();
        box().style.display = show ? 'flex' : 'none';
        if (!isPortrait()) { const t = document.getElementById('landscape-tip'); if (t) t.style.display = 'none'; }
    }

    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', () => setTimeout(update, 300));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', update);
    else update();
})();
