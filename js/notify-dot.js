// ==========================================
// MENU NOTIFICATIONS: NEW-ITEM DOT (game juice, presentation only)
// When a skill finishes learning, a red dot pops onto the corner of the SKILLS tab (replacing its "!" alert image).
// While unseen, a pink ring expands from it every 40 ticks (1.5 Hz). Resting the cursor on the tab for 10 ticks
// counts as seen: the dot shrinks away in 6 ticks with 4 sparks, and the notice is cleared.
// A notice queues while the tab is not on screen, and shows the moment it is.
//
// The dot is drawn on the page in screen space and is never shaken. Presentation clock: requestAnimationFrame +
// performance.now. Values in NOTIFY_DOT, in 60 Hz ticks. Uses the Effects settings in js/boss-intro.js:
// intensity Off = a static dot (the notice still shows; only the motion stops), reduce motion = no ring, and the
// pop fades in place instead of growing. Flash and shake are not used.
// ==========================================
const NOTIFY_DOT = {
    tabId: 'char-skills-btn',
    px: 4,                  // stage px per pixel-art px, as in the other juice
    showDelayTicks: 30,     // the skill finishes learning, then the dot pops after this
    popTicks: 12, radiusPx: 3, // radius 0 -> radiusPx (pixel-art px), easeOutBack
    ring: { fromPx: 3, toPx: 9, everyTicks: 40, colour: '#ff6fb1' }, // pink ring, 1.5 Hz
    seenRestTicks: 10,      // cursor resting on the tab this long counts as seen
    shrinkTicks: 6,
    sparks: 4, sparkPx: 10, sparkTicks: 14,
    dot: '#e0242b', rim: '#ffffff'
};

const notifyState = { queue: [], state: 'off', showAt: 0, popAt: 0, shrinkAt: 0, ringAt: 0, hoverSince: 0, dot: null, raf: 0, last: 0, bound: false };

function notifyDotIntensity() { return typeof juiceIntensity === 'function' ? juiceIntensity() : 1; }
function notifyDotReduce() { return typeof juiceReduceMotion === 'function' && juiceReduceMotion(); }
const notifyEaseOutBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const notifyClamp = x => Math.max(0, Math.min(1, x));

// Called when something the player should look at has changed (e.g. a skill learned)
function notifyNewNotice(kind) {
    if (!notifyState.queue.includes(kind)) notifyState.queue.push(kind);
    notifyEnsureDot();
    if (notifyState.state === 'off') {
        notifyState.state = 'waiting';
        notifyState.showAt = performance.now() + NOTIFY_DOT.showDelayTicks * 1000 / 60;
    }
    notifyStart();
}

function notifyEnsureDot() {
    if (notifyState.dot) return notifyState.dot;
    const d = document.createElement('div');
    d.id = 'notify-dot';
    d.setAttribute('aria-hidden', 'true');
    d.style.cssText = 'position:fixed; left:0; top:0; width:0; height:0; pointer-events:none; z-index:9500; display:none;';
    const ring = document.createElement('div');
    ring.className = 'nd-ring';
    ring.style.cssText = `position:absolute; left:0; top:0; border:3px solid ${NOTIFY_DOT.ring.colour}; border-radius:50%; box-sizing:border-box; translate:-50% -50%; opacity:0;`;
    const dot = document.createElement('div');
    dot.className = 'nd-dot';
    dot.style.cssText = `position:absolute; left:0; top:0; background:${NOTIFY_DOT.dot}; border:2px solid ${NOTIFY_DOT.rim}; border-radius:50%; box-sizing:border-box; translate:-50% -50%;`;
    d.appendChild(ring);
    d.appendChild(dot);
    document.body.appendChild(d);
    notifyState.dot = d;
    return d;
}

// Hover on the tab: resting the cursor there counts as seen
function notifyBindTab() {
    const tab = document.getElementById(NOTIFY_DOT.tabId);
    if (!tab || tab.dataset.notify) return;
    tab.dataset.notify = '1';
    tab.addEventListener('pointerenter', () => { notifyState.hoverSince = performance.now(); });
    tab.addEventListener('pointerleave', () => { notifyState.hoverSince = 0; });
}

function notifyStart() {
    if (!notifyState.raf) {
        notifyState.last = performance.now();
        notifyState.raf = requestAnimationFrame(notifyFrame);
    }
}

// Sparks at the dot when it is seen
function notifySparks(x, y) {
    const C = NOTIFY_DOT, I = notifyDotIntensity(), RM = notifyDotReduce();
    if (I <= 0) return;
    for (let i = 0; i < C.sparks; i++) {
        const s = document.createElement('div');
        s.setAttribute('aria-hidden', 'true');
        s.style.cssText = `position:fixed; left:${Math.round(x - 2)}px; top:${Math.round(y - 2)}px; width:4px; height:4px; background:#fff3b0; pointer-events:none; z-index:9500;`;
        document.body.appendChild(s);
        const a = (i / C.sparks) * Math.PI * 2 + Math.PI / 4;
        const d = RM ? 0 : C.sparkPx * I;
        const anim = s.animate([
            { transform: 'translate(0,0)', opacity: 1 },
            { transform: `translate(${Math.round(Math.cos(a) * d)}px, ${Math.round(Math.sin(a) * d)}px)`, opacity: 0 }
        ], { duration: C.sparkTicks * 1000 / 60, easing: 'ease-out' });
        anim.onfinish = () => s.remove(); anim.oncancel = () => s.remove();
    }
}

function notifyFrame(now) {
    const N = notifyState, C = NOTIFY_DOT, I = notifyDotIntensity(), RM = notifyDotReduce();
    N.last = now;
    const tab = document.getElementById(C.tabId);
    const r = tab ? tab.getBoundingClientRect() : null;
    const onScreen = !!(r && r.width > 0);
    notifyBindTab();
    // The "!" alert image on the tab is replaced by this dot
    if (tab) { const old = document.getElementById('alert-char-skills'); if (old) old.style.display = 'none'; }
    const d = N.dot;

    // Waiting: the notice shows once the tab can be seen
    if (N.state === 'waiting' && onScreen && now >= N.showAt) { N.state = 'popping'; N.popAt = now; }

    if (N.state === 'off' || !onScreen || !d) {
        if (d) d.style.display = 'none';
        if (N.state === 'off') { N.raf = 0; return; }
        N.raf = requestAnimationFrame(notifyFrame);
        return;
    }

    // Anchor: the tab's top-right corner (fixed to the page, so the tab's redraws do not move it)
    const ax = Math.round(r.right - 6), ay = Math.round(r.top + 6);
    d.style.display = 'block';
    d.style.left = ax + 'px';
    d.style.top = ay + 'px';
    const dot = d.querySelector('.nd-dot'), ring = d.querySelector('.nd-ring');
    const full = C.radiusPx * C.px * 2;

    if (N.state === 'popping') {
        const p = notifyClamp((now - N.popAt) * 60 / 1000 / C.popTicks);
        const k = RM ? p : notifyEaseOutBack(p);
        const size = Math.max(0, full * k);
        dot.style.width = dot.style.height = size + 'px';
        dot.style.opacity = RM ? String(p.toFixed(3)) : '1';
        if (p >= 1) { N.state = 'on'; N.ringAt = now; }
    }

    if (N.state === 'on') {
        dot.style.width = dot.style.height = full + 'px';
        dot.style.opacity = '1';
        // Seen: the cursor has rested on the tab long enough
        if (N.hoverSince && now - N.hoverSince >= C.seenRestTicks * 1000 / 60) {
            N.state = 'shrinking'; N.shrinkAt = now;
            notifySparks(ax, ay);
            N.queue = [];
        } else if (!RM && I > 0) {
            // Pink ring from fromPx to toPx every everyTicks (1.5 Hz, not shown with reduced motion)
            const period = C.ring.everyTicks * 1000 / 60;
            const q = ((now - N.ringAt) % period) / period;
            const rr = (C.ring.fromPx + (C.ring.toPx - C.ring.fromPx) * q) * C.px * I;
            ring.style.width = ring.style.height = Math.round(rr * 2) + 'px';
            ring.style.opacity = String((1 - q).toFixed(3));
        } else {
            ring.style.opacity = '0';
        }
    }

    if (N.state === 'shrinking') {
        const p = notifyClamp((now - N.shrinkAt) * 60 / 1000 / C.shrinkTicks);
        const size = full * (1 - p);
        dot.style.width = dot.style.height = size + 'px';
        dot.style.opacity = RM ? String((1 - p).toFixed(3)) : '1';
        ring.style.opacity = '0';
        if (p >= 1) { N.state = 'off'; d.style.display = 'none'; N.raf = 0; return; }
    }

    if (N.state !== 'off') { N.raf = requestAnimationFrame(notifyFrame); return; }
    N.raf = 0;
}
