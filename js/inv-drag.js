// ==========================================
// INVENTORY DRAG LIFT (game juice, presentation only)
// Dragging a bag item: the item lifts off its slot (a 1 px press, then a 3 px lift with easeOutBack and a dark
// shadow under it), follows the cursor with a lag, and leaves a 30% ghost of itself in its slot.
// Dropping works exactly as before (invDrop swaps or merges). A drag that ends on its own slot, or nowhere,
// settles back into its slot with no sound.
//
// The browser's own drag image is replaced by a transparent one, so only this lifted copy is drawn.
// It runs on its own presentation clock (requestAnimationFrame + performance.now) and never touches item data.
// Every value is in INV_DRAG; ticks are 60 Hz.
// Uses the shared Effects settings from js/boss-intro.js: intensity Off = plain drag, reduce motion = no lift
// travel (the shadow fades in instead) and the copy snaps to the cursor. No shake, no flash.
// ==========================================
const INV_DRAG = {
    dipPx: 1,           // press: the item dips this far, over dipTicks
    dipTicks: 5,
    liftPx: 3,          // lift: rises from the dip to -liftPx over liftTicks (easeOutBack)
    liftTicks: 5,
    follow: 0.4,        // share of the gap to the cursor closed each tick (so fast moves stretch the gap)
    ghostOpacity: 0.3,  // the empty slot keeps the item at this opacity while it is carried
    shadowW: 84, shadowH: 16,
    shadowOffsetY: 92,  // shadow centre below the item's top (item is 104 px tall)
    shadowOpacity: 0.55,
    settleTicks: 10,    // a drop that does not change anything: back into its slot (easeOutQuad)
    settleWhenNoDrop: true,
    // Snap drop: a release over a slot eases the copy to the slot (easeOutBack), lift drops to 0,
    // the slot bumps up 2 px, two sparks pop from its top corners and a thunk confirms it
    snapTicks: 6,
    bumpPx: 2, bumpTicks: 8,
    sparkTicks: 12, sparkPx: 10,
    thunk: { hz: [140, 90], sec: 0.12, gain: 0.25, stepSec: 0.03 }
};

let invLift = null; // { index, srcEl, float, shadow, x, y, tx, ty, startAt, phase, dropped, settleFrom }
const invBlankDrag = (() => { const c = document.createElement('canvas'); c.width = c.height = 1; return c; })();

function invLiftIntensity() { return typeof juiceIntensity === 'function' ? juiceIntensity() : 1; }
function invLiftReduce() { return typeof juiceReduceMotion === 'function' && juiceReduceMotion(); }
const invEaseOutBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const invEaseOutQuad = x => 1 - (1 - x) * (1 - x);
const invClamp = x => Math.max(0, Math.min(1, x));

// Called from the slot's dragstart (before the browser makes its drag image)
function invLiftStart(e, index) {
    const srcEl = e.target && e.target.closest ? e.target.closest('[data-idx]') : null;
    if (!srcEl || invLiftIntensity() <= 0) return;
    invLiftCleanup(); // a new lift never stacks on an old one
    try { e.dataTransfer.setDragImage(invBlankDrag, 0, 0); } catch (_) {}
    const r = srcEl.getBoundingClientRect();
    const float = srcEl.cloneNode(true);
    ['id', 'data-idx', 'draggable'].forEach(a => float.removeAttribute(a));
    [...float.querySelectorAll('[onclick],[ondragstart],[ondragover],[ondrop],[ondragend]')].forEach(n => {
        ['onclick', 'ondragstart', 'ondragover', 'ondrop', 'ondragend'].forEach(a => n.removeAttribute(a));
    });
    float.id = 'inv-lift-copy';
    float.setAttribute('aria-hidden', 'true');
    float.style.cssText = `position:fixed; left:0; top:0; width:${r.width}px; height:${r.height}px; margin:0; pointer-events:none; z-index:9999; will-change:transform;`;
    const shadow = document.createElement('div');
    shadow.id = 'inv-lift-shadow';
    shadow.setAttribute('aria-hidden', 'true');
    shadow.style.cssText = `position:fixed; left:0; top:0; width:${INV_DRAG.shadowW}px; height:${INV_DRAG.shadowH}px; pointer-events:none; z-index:9998; opacity:0;`;
    document.body.appendChild(shadow);
    document.body.appendChild(float);
    // The ghost: the item in its own slot fades to 30%; the frame and slot stay
    const icon = srcEl.querySelector('span.flex');
    if (icon) icon.style.opacity = String(INV_DRAG.ghostOpacity);
    invLift = {
        index, srcEl, float, shadow, icon, w: r.width, h: r.height,
        grabX: e.clientX - r.left, grabY: e.clientY - r.top,
        x: r.left, y: r.top, tx: r.left, ty: r.top,
        startAt: performance.now(), phase: 'lift', dropped: false, raf: 0
    };
    invLift.raf = requestAnimationFrame(invLiftFrame);
}

// The drag event fires on the source all the way through the drag; clientX/Y are 0 on its last event
function invLiftMove(e) {
    if (!invLift || invLift.phase !== 'lift') return;
    if (!e.clientX && !e.clientY) return;
    invLift.tx = e.clientX - invLift.grabX;
    invLift.ty = e.clientY - invLift.grabY;
}

// Called by invDrop: landed = the item was set down on a different slot (the grid redraws, nothing settles)
function invLiftLanded(landed, toIdx) {
    if (!invLift) return;
    invLift.dropped = !!landed;
    invLift.snapTo = landed && toIdx != null ? toIdx : null;
    if (!landed && INV_DRAG.settleWhenNoDrop) invLiftSettle();
}

// Called by the source's dragend (after any drop)
function invLiftEnd() {
    if (!invLift) return;
    if (invLift.phase === 'settle') { invLiftCleanup(); return; }
    if (invLift.dropped && invLift.snapTo != null && invLift.phase === 'lift') { invLiftSnap(); return; }
    if (invLift.dropped) { invLiftCleanup(); return; }
    invLiftSettle(); // dropped nowhere, or on the slot it came from
}

function invLiftSettle() {
    if (!invLift || invLift.phase === 'settle') return;
    invLift.phase = 'settle';
    invLift.settleFrom = { x: invLift.x, y: invLift.y, lift: invLift.liftNow || 0 };
    invLift.settleAt = performance.now();
    if (invLift.icon) invLift.icon.style.opacity = '';
}

function invLiftFrame(now) {
    const L = invLift;
    if (!L) return;
    const C = INV_DRAG, I = invLiftIntensity(), RM = invLiftReduce();
    const ticks = (now - (L.last || now)) * 60 / 1000; // ticks since the last frame (presentation clock)
    L.last = now;
    const t = (now - L.startAt) * 60 / 1000; // ticks since the lift started
    let lift = 0, dip = 0, shadowA = 0;

    if (L.phase === 'lift') {
        // Follow: close a share of the gap each tick (reduced motion: snap to the cursor)
        const k = RM ? 1 : 1 - Math.pow(1 - C.follow, Math.max(0, ticks));
        L.x += (L.tx - L.x) * k;
        L.y += (L.ty - L.y) * k;
        // Press: dip for dipTicks, then lift with easeOutBack for liftTicks
        if (t < C.dipTicks) dip = C.dipPx * I * Math.sin(Math.PI * 0.5 * t / C.dipTicks);
        else {
            const p = invClamp((t - C.dipTicks) / C.liftTicks);
            lift = C.liftPx * I * invEaseOutBack(p);
            dip = C.dipPx * I * (1 - p);
        }
        shadowA = invClamp((t - C.dipTicks) / C.liftTicks) * C.shadowOpacity * I;
        L.liftNow = lift;
    } else if (L.phase === 'snap') {
        const p = invClamp((now - L.snapAt) * 60 / 1000 / C.snapTicks);
        const e = invEaseOutBack(p);
        L.x = L.snapFrom.x + (L.snapTo.x - L.snapFrom.x) * e;
        L.y = L.snapFrom.y + (L.snapTo.y - L.snapFrom.y) * e;
        lift = L.snapFrom.lift * (1 - p);
        shadowA = C.shadowOpacity * I * (1 - p);
        if (p >= 1) { invLiftCleanup(); return; }
    } else if (L.phase === 'settle') {
        const p = invClamp((now - L.settleAt) * 60 / 1000 / C.settleTicks);
        const e = invEaseOutQuad(p);
        const r = L.srcEl && L.srcEl.isConnected ? L.srcEl.getBoundingClientRect() : null;
        const tx = r ? r.left : L.settleFrom.x, ty = r ? r.top : L.settleFrom.y;
        L.x = L.settleFrom.x + (tx - L.settleFrom.x) * e;
        L.y = L.settleFrom.y + (ty - L.settleFrom.y) * e;
        lift = L.settleFrom.lift * (1 - e);
        shadowA = C.shadowOpacity * I * (1 - e);
        if (p >= 1) { invLiftCleanup(); return; }
    }

    // Whole pixels, so the copy never sits between two pixel-art pixels
    const x = Math.round(L.x), y = Math.round(L.y + dip - lift);
    L.float.style.transform = `translate(${x}px, ${y}px)`;
    const sx = x + L.w / 2 - C.shadowW / 2, sy = Math.round(L.y + C.shadowOffsetY);
    L.shadow.style.transform = `translate(${Math.round(sx)}px, ${sy}px)`;
    L.shadow.style.background = 'radial-gradient(ellipse at center, rgba(0,0,0,.85) 0%, rgba(0,0,0,0) 70%)';
    L.shadow.style.opacity = String(shadowA.toFixed(3));
    L.raf = requestAnimationFrame(invLiftFrame);
}

// Removes the copy and shadow and puts the slot's item back to full opacity (safe to call any time)
function invLiftCleanup() {
    if (!invLift) return;
    cancelAnimationFrame(invLift.raf);
    invLift.float.remove();
    invLift.shadow.remove();
    if (invLift.icon && invLift.icon.isConnected) invLift.icon.style.opacity = '';
    invLift = null;
}

// The drag event fires on the source all the way through the drag (bubbles to the page)
document.addEventListener('drag', invLiftMove);

// Snap drop: the copy eases onto the slot it was released over, then the slot bumps and sparks pop
function invLiftSnap() {
    const L = invLift, C = INV_DRAG;
    const to = document.querySelector(`#inventory-grid [data-idx="${L.snapTo}"]`);
    if (!to) { invLiftCleanup(); return; }
    const r = to.getBoundingClientRect();
    L.phase = 'snap';
    L.snapFrom = { x: L.x, y: L.y, lift: L.liftNow || 0 };
    L.snapTo = { x: r.left, y: r.top };
    L.snapAt = performance.now();
    invSnapBump(to);
    invSnapSparks(r);
    invSnapThunk();
}
function invSnapBump(el) {
    const C = INV_DRAG, I = invLiftIntensity(), RM = invLiftReduce();
    if (I <= 0) return;
    const ms = C.bumpTicks * 1000 / 60;
    const frames = RM
        ? [{ opacity: 1 }, { opacity: 0.6, offset: 0.5 }, { opacity: 1 }]
        : [{ transform: 'translateY(0px)' }, { transform: `translateY(${-Math.round(C.bumpPx * I)}px)`, offset: 0.5 }, { transform: 'translateY(0px)' }];
    try { el.animate(frames, { duration: ms, easing: 'ease-out' }); } catch (_) {}
}
function invSnapSparks(r) {
    const C = INV_DRAG, I = invLiftIntensity(), RM = invLiftReduce();
    if (I <= 0) return;
    const ms = C.sparkTicks * 1000 / 60;
    [[r.left, r.top, -1], [r.right, r.top, 1]].forEach(([x, y, dir]) => {
        const s = document.createElement('div');
        s.setAttribute('aria-hidden', 'true');
        s.style.cssText = `position:fixed; left:${Math.round(x - 2)}px; top:${Math.round(y - 2)}px; width:4px; height:4px; background:#fff3b0; box-shadow:0 0 0 2px rgba(255,212,94,.6); pointer-events:none; z-index:9999;`;
        document.body.appendChild(s);
        const d = RM ? 0 : C.sparkPx * I * dir;
        const anim = s.animate([
            { transform: 'translate(0,0)', opacity: 1 },
            { transform: `translate(${d}px, ${-Math.round(C.sparkPx * I)}px)`, opacity: 0 }
        ], { duration: ms, easing: 'ease-out' });
        anim.onfinish = () => s.remove();
        anim.oncancel = () => s.remove();
    });
}
function invSnapThunk() {
    const T = INV_DRAG.thunk;
    if (typeof biTone === 'function') biTone('triangle', T.hz, T.sec, T.gain, T.stepSec);
}
