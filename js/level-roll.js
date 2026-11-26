// ==========================================
// LEVEL HUD: LEVEL NUMBER FLIP (game juice, presentation only)
// Base level up: the level number rolls in its badge (old number slides up and out, the new one rises from below
// with easeOutBack), a gold ring grows from the badge, 10 sparks burst, a chime plays and a small LEVEL UP label shows.
//
// Reads player.baseLv / baseExp only; the game still updates every number and bar itself. HUD only: nothing shakes.
// Presentation clock: requestAnimationFrame + performance.now. Values in LEVEL_ROLL, in 60 Hz ticks.
// Uses the Effects settings in js/boss-intro.js: intensity Off = numbers change at once, no effects. Reduce motion:
// the roll becomes a crossfade in place and the orb fades along its path. Flash is not used.
// ==========================================
const LEVEL_ROLL = {
    px: 4,
    rollTicks: 12, rollPx: 14,           // number rises from this far below, easeOutBack
    ring: { fromPx: 4, toPx: 20, ticks: 18, colour: '#ffd45e' },
    sparks: 10, sparkPx: 22, sparkTicks: 18,
    label: { text: 'LEVEL UP', ticks: 60, fadeTicks: 12, offsetY: 36 },
    chime: { hz: [1046.5, 1568, 2093], sec: 0.5, gain: 0.2, stepSec: 0.07 },
    pollMs: 100
};

const levelRollState = { lastBaseLv: null, lastBaseExp: null, lastJobLv: null, polled: 0, last: 0, bound: false };

function levelRollIntensity() { return typeof juiceIntensity === 'function' ? juiceIntensity() : 1; }
function levelRollReduce() { return typeof juiceReduceMotion === 'function' && juiceReduceMotion(); }
const lrEaseOutBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const lrClamp = x => Math.max(0, Math.min(1, x));
const lrMs = t => t * 1000 / 60;

// Visible elements of the base level number (town and combat headers)
function levelRollTargets() {
    return ['header-base-lv', 'header-base-lv-c'].map(id => document.getElementById(id))
        .filter(el => el && el.getClientRects().length > 0);
}

// The level number rolls: the old one slides up and out, the new one rises from below
function levelRollNumber(el, oldText, newText) {
    const C = LEVEL_ROLL, I = levelRollIntensity(), RM = levelRollReduce();
    const ms = lrMs(C.rollTicks);
    if (I <= 0) return;
    const holder = el.parentElement;
    if (holder && getComputedStyle(holder).position === 'static') holder.style.position = 'relative';
    const old = document.createElement('span');
    old.setAttribute('aria-hidden', 'true');
    old.textContent = oldText;
    const cs = getComputedStyle(el);
    old.style.cssText = `position:absolute; left:${el.offsetLeft}px; top:${el.offsetTop}px; font:${cs.font}; color:${cs.color}; pointer-events:none;`;
    holder.appendChild(old);
    old.animate(RM
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ transform: 'translateY(0px)', opacity: 1 }, { transform: `translateY(${-Math.round(C.rollPx * I)}px)`, opacity: 0 }],
        { duration: ms, easing: 'ease-in', fill: 'forwards' }).onfinish = () => old.remove();
    const rise = el.animate(RM
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ transform: `translateY(${Math.round(C.rollPx * I)}px)` }, { transform: 'translateY(0px)' }],
        { duration: ms, easing: RM ? 'linear' : 'cubic-bezier(.34,1.56,.64,1)' });
    rise.onfinish = () => {};
    // Badge feedback: ring, sparks, chime, label (visual twins of the chime)
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (!RM) levelRollRing(cx, cy, I);
    levelRollSparks(cx, cy, I, RM);
    levelRollLabel(cx, r.bottom, I, RM);
    if (typeof biTone === 'function') biTone('triangle', C.chime.hz, C.chime.sec, C.chime.gain, C.chime.stepSec);
}

function levelRollRing(cx, cy, I) {
    const C = LEVEL_ROLL;
    const ring = document.createElement('div');
    ring.setAttribute('aria-hidden', 'true');
    const d = document.createElement('div');
    d.style.cssText = `position:absolute; left:0; top:0; border:3px solid ${C.ring.colour}; border-radius:50%; box-sizing:border-box; translate:-50% -50%;`;
    ring.style.cssText = `position:fixed; left:${Math.round(cx)}px; top:${Math.round(cy)}px; pointer-events:none; z-index:9600;`;
    ring.appendChild(d);
    document.body.appendChild(ring);
    const from = C.ring.fromPx * C.px * I, to = C.ring.toPx * C.px * I;
    const a = d.animate([
        { width: `${from * 2}px`, height: `${from * 2}px`, opacity: 1 },
        { width: `${to * 2}px`, height: `${to * 2}px`, opacity: 0 }
    ], { duration: lrMs(C.ring.ticks), easing: 'ease-out' });
    a.onfinish = () => ring.remove(); a.oncancel = () => ring.remove();
}

function levelRollSparks(cx, cy, I, RM) {
    const C = LEVEL_ROLL;
    for (let i = 0; i < C.sparks; i++) {
        const s = document.createElement('div');
        s.setAttribute('aria-hidden', 'true');
        s.style.cssText = `position:fixed; left:${Math.round(cx - 2)}px; top:${Math.round(cy - 2)}px; width:4px; height:4px; background:#fff3b0; box-shadow:0 0 0 2px rgba(255,212,94,.6); pointer-events:none; z-index:9600;`;
        document.body.appendChild(s);
        const a = (i / C.sparks) * Math.PI * 2;
        const d = RM ? 0 : C.sparkPx * I;
        const anim = s.animate([
            { transform: 'translate(0,0)', opacity: 1 },
            { transform: `translate(${Math.round(Math.cos(a) * d)}px, ${Math.round(Math.sin(a) * d)}px)`, opacity: 0 }
        ], { duration: lrMs(C.sparkTicks), easing: 'ease-out' });
        anim.onfinish = () => s.remove(); anim.oncancel = () => s.remove();
    }
}

function levelRollLabel(cx, bottom, I, RM) {
    const C = LEVEL_ROLL;
    const l = document.createElement('div');
    l.setAttribute('aria-hidden', 'true');
    l.textContent = C.label.text;
    l.style.cssText = `position:fixed; left:${Math.round(cx)}px; top:${Math.round(bottom + C.label.offsetY)}px; transform:translateX(-50%); pointer-events:none; z-index:9600; font-family:Roboto,sans-serif; font-weight:900; font-size:18px; letter-spacing:3px; color:#ffd45e; -webkit-text-stroke:2px #000; paint-order:stroke fill; text-shadow:0 2px 0 #000; white-space:nowrap;`;
    document.body.appendChild(l);
    const total = lrMs(C.label.ticks), fade = lrMs(C.label.fadeTicks) / total;
    const a = l.animate(RM
        ? [{ opacity: 1, offset: 0 }, { opacity: 1, offset: 1 - fade }, { opacity: 0, offset: 1 }]
        : [{ transform: 'translate(-50%, 0)', opacity: 1, offset: 0 }, { transform: 'translate(-50%, -6px)', opacity: 1, offset: 1 - fade }, { transform: 'translate(-50%, -10px)', opacity: 0, offset: 1 }],
        { duration: total, easing: 'linear' });
    a.onfinish = () => l.remove(); a.oncancel = () => l.remove();
}

// Polls the base level and EXP, and reacts only to real changes
// Loading a save sets the numbers at once: take them as they are, with no roll, ring or orb
function levelRollResync() {
    if (typeof player === 'undefined' || !player) return;
    levelRollState.lastBaseLv = player.baseLv;
    levelRollState.lastBaseExp = player.baseExp;
}
function levelRollPoll(now) {
    if (now - levelRollState.polled < LEVEL_ROLL.pollMs) return;
    levelRollState.polled = now;
    const S = levelRollState;
    if (typeof player === 'undefined' || !player) return;
    if (typeof friendTentVisiting === 'function' && friendTentVisiting()) return; // the friend's tent swaps in their level: not a level up
    const lv = player.baseLv, xp = player.baseExp;
    if (S.lastBaseLv === null) { S.lastBaseLv = lv; S.lastBaseExp = xp; S.lastText = null; return; }
    if (lv !== S.lastBaseLv) {
        const oldLv = S.lastBaseLv;
        S.lastBaseLv = lv;
        levelRollTargets().forEach(el => levelRollNumber(el, String(oldLv), String(lv)));
    }
    S.lastBaseExp = xp;
}

function levelRollFrame(now) {
    levelRollPoll(now);
    requestAnimationFrame(levelRollFrame);
}
requestAnimationFrame(levelRollFrame);
