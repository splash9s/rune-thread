// ==========================================
// INVENTORY SLOT HOVER GLOW (game juice, presentation only)
// When the pointer enters a bag slot: its border turns gold and a 35% gold fill fades in over 3 ticks.
// Leaving fades it out over 8 ticks (a short trail). The hovered item hops 1 px, and its name shows under the grid.
// Each new slot entered plays one soft tick; staying on the same slot never repeats it.
//
// One glow element is drawn over the slot (fixed, in the page), so the grid's redraws never affect it.
// Presentation clock: requestAnimationFrame + performance.now; every value in INV_HOVER, in 60 Hz ticks.
// Uses the shared Effects settings from js/boss-intro.js. Intensity Off turns the glow off.
// Reduce motion: no 1 px hop; the name fades in place instead. The gold border and fill stay, so it still reads.
// No shake, no flash, nothing on the HUD moves.
// ==========================================
const INV_HOVER = {
    fillAlpha: 0.35,     // gold fill at full strength
    fadeInTicks: 3,
    fadeOutTicks: 8,
    hopPx: 1,            // the hovered item hops this far (whole pixels)
    border: '#ffd45e',
    rgb: '255, 212, 94', // gold, used for the border, fill and name
    nameOffsetY: 10,     // name sits this far under the grid
    tick: { hz: 1400, sec: 0.03, gain: 0.12 }
};

let invHover = { idx: -1, el: null, alpha: 0, target: 0, last: 0, raf: 0, icon: null, overlay: null, label: null, lastName: '' };

function invHoverIntensity() { return typeof juiceIntensity === 'function' ? juiceIntensity() : 1; }
function invHoverReduce() { return typeof juiceReduceMotion === 'function' && juiceReduceMotion(); }

function invHoverEls() {
    if (!invHover.overlay) {
        const o = document.createElement('div');
        o.id = 'inv-hover-glow';
        o.setAttribute('aria-hidden', 'true');
        o.style.cssText = 'position:fixed; left:0; top:0; width:0; height:0; pointer-events:none; z-index:9000; opacity:1; box-sizing:border-box;';
        document.body.appendChild(o);
        const l = document.createElement('div');
        l.id = 'inv-hover-name';
        l.setAttribute('aria-hidden', 'true');
        l.style.cssText = 'position:fixed; left:0; top:0; transform:translateX(-50%); pointer-events:none; z-index:9000; opacity:0; white-space:nowrap; font-family:Roboto,"Noto Sans Thai",sans-serif; font-weight:700; font-size:18px; letter-spacing:2px; color:#ffd45e; -webkit-text-stroke:2px #000; paint-order:stroke fill; text-shadow:0 2px 0 #000;';
        document.body.appendChild(l);
        invHover.overlay = o;
        invHover.label = l;
    }
    return invHover;
}

// Pointer entered a slot (or moved to a different one)
function invHoverEnter(slot) {
    if (invHoverIntensity() <= 0) return;
    const idx = Number(slot.dataset.idx);
    if (idx === invHover.idx && invHover.target === 1) return; // same slot: nothing repeats
    invHoverEls();
    invHover.idx = idx;
    invHover.el = slot;
    invHover.target = 1;
    invHoverTick();
    invHoverStart();
}

// Pointer left the grid, or moved onto a gap between slots
function invHoverLeave() {
    if (invHover.target === 0) return;
    invHover.target = 0;
    invHover.idx = -1;
    invHoverStart();
}

function invHoverTick() {
    const T = INV_HOVER.tick;
    if (typeof biTone === 'function') biTone('sine', [T.hz], T.sec, T.gain);
}

function invHoverStart() {
    if (!invHover.raf) {
        invHover.last = performance.now();
        invHover.raf = requestAnimationFrame(invHoverFrame);
    }
}

function invHoverFrame(now) {
    const H = invHover, C = INV_HOVER, I = invHoverIntensity(), RM = invHoverReduce();
    const dt = Math.min(0.1, (now - H.last) / 1000) * 60; // ticks since the last frame
    H.last = now;
    // Fade: in over fadeInTicks, out over fadeOutTicks
    const rate = H.target > H.alpha ? dt / C.fadeInTicks : dt / C.fadeOutTicks;
    H.alpha = H.target > H.alpha ? Math.min(H.target, H.alpha + rate) : Math.max(H.target, H.alpha - rate);
    const a = H.alpha * I;

    const grid = document.getElementById('inventory-grid');
    const visible = grid && grid.getClientRects().length > 0 && I > 0;
    // The slot may have been redrawn since it was entered: find it again by its index
    if (H.idx >= 0 && (!H.el || !H.el.isConnected) && grid) H.el = grid.querySelector(`[data-idx="${H.idx}"]`);
    const slot = H.el && H.el.isConnected ? H.el : null;

    if (!visible || (!slot && H.alpha <= 0)) {
        H.overlay.style.opacity = '0';
        H.label.style.opacity = '0';
        invHoverSetIcon(null, 0);
        if (H.alpha <= 0 && H.target === 0) { H.raf = 0; return; }
        H.raf = requestAnimationFrame(invHoverFrame);
        return;
    }

    if (slot) {
        const r = slot.getBoundingClientRect();
        const o = H.overlay.style;
        o.left = Math.round(r.left) + 'px';
        o.top = Math.round(r.top) + 'px';
        o.width = Math.round(r.width) + 'px';
        o.height = Math.round(r.height) + 'px';
        o.border = `2px solid rgba(${C.rgb}, ${a.toFixed(3)})`;
        o.background = `rgba(${C.rgb}, ${(C.fillAlpha * a).toFixed(3)})`;
        o.opacity = '1';
        // Hop: the item rises 1 px while hovered (reduced motion: no hop)
        const hop = (!RM && H.target === 1 && H.alpha >= 0.5) ? -Math.round(C.hopPx * I) : 0;
        invHoverSetIcon(slot.querySelector('span.flex'), hop);
        // Name under the grid (only when the slot holds an item)
        const item = typeof openInventory === 'function' ? openInventory()[H.idx] : null;
        if (item && item.name) H.lastName = String(item.name).toUpperCase();
        const lb = H.label.style;
        const gr = grid.getBoundingClientRect();
        lb.left = Math.round(gr.left + gr.width / 2) + 'px';
        lb.top = Math.round(gr.bottom + C.nameOffsetY) + 'px';
        H.label.textContent = H.lastName;
        lb.opacity = item ? String(a.toFixed(3)) : '0';
    } else {
        H.overlay.style.opacity = '0';
        H.label.style.opacity = '0';
    }

    if (H.target === 0 && H.alpha <= 0) {
        H.overlay.style.opacity = '0';
        H.label.style.opacity = '0';
        invHoverSetIcon(null, 0);
        H.raf = 0;
        return;
    }
    H.raf = requestAnimationFrame(invHoverFrame);
}

// The hopped item: only one item is ever hopped; the previous one goes back to rest
function invHoverSetIcon(icon, px) {
    const H = invHover;
    if (H.icon && H.icon !== icon) H.icon.style.transform = '';
    H.icon = icon;
    if (icon) icon.style.transform = px ? `translateY(${px}px)` : '';
}

// Pointer events on the grid: pointerover reports the slot under the pointer (bubbles from the slot)
(function invHoverBind() {
    const bind = () => {
        const grid = document.getElementById('inventory-grid');
        if (!grid || grid.dataset.invHover) return;
        grid.dataset.invHover = '1';
        grid.addEventListener('pointerover', e => {
            const slot = e.target.closest ? e.target.closest('[data-idx]') : null;
            if (slot && grid.contains(slot)) invHoverEnter(slot); else invHoverLeave();
        });
        grid.addEventListener('pointerleave', invHoverLeave);
    };
    bind();
    // The grid is built once, but this covers a page that creates it later
    document.addEventListener('pointerover', bind, { once: true, capture: true });
})();
