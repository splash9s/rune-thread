// ==========================================
// EQUIP FLASH (game juice, presentation only)
// When an item is equipped (drag onto a gear slot): the slot frame flashes white for 3 ticks (only when screen flash
// is on), a gold ring grows from 8 to 22 px, 10 sparks burst from the slot, a metallic clink plays, and the stat that
// changed turns green for 40 ticks with a "+N" rising beside it (ATK 5 -> 9 shows +4).
//
// Wraps executeEquipItem() only to read the stat before and after. The equip itself is unchanged.
// Presentation clock: requestAnimationFrame + WAAPI timings in 60 Hz ticks. Values in EQUIP_FLASH.
// Uses the Effects settings in js/boss-intro.js: flash Off skips the white frame (the ring and sparks still play),
// reduce motion swaps the ring growth and spark travel for fades, intensity Off turns the effect off.
// Every sound has a visual twin: the clink is the ring, the sparks and the green stat. No shake.
// ==========================================
const EQUIP_FLASH = {
    frameTicks: 3,       // white frame flash on the slot (flash setting Full only; Reduced uses a faint one)
    frameOpacity: { full: 0.85, reduced: 0.3, off: 0 },
    ringFromPx: 8, ringToPx: 22, ringTicks: 14,
    sparks: 10, sparkTicks: 18, sparkPx: 26,
    statTicks: 40,       // the green stat holds this long
    riseTicks: 40, risePx: 18,
    colour: '#5cff8a',
    clink: { hz: [2600, 3900, 2100], sec: 0.14, gain: 0.2, stepSec: 0.025 }
};

const eqFlashTimers = new Map(); // stat element -> timer, so repeated equips never stack

function eqFlashIntensity() { return typeof juiceIntensity === 'function' ? juiceIntensity() : 1; }
function eqFlashReduce() { return typeof juiceReduceMotion === 'function' && juiceReduceMotion(); }

// Equip: slot name (e.g. 'weapon'), the stat before and after
function equipFlashPlay(slot, before, after) {
    const I = eqFlashIntensity();
    if (I <= 0) return;
    const RM = eqFlashReduce();
    const el = document.querySelector(`#view-character [data-eq="${slot}"], [data-eq="${slot}"]`);
    if (el) slotFlash(el, I, RM);
    if (after !== before) statFlash(after - before, I, RM);
}

function ticksMs(t) { return t * 1000 / 60; }

function slotFlash(el, I, RM) {
    const C = EQUIP_FLASH;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    // White frame (skipped when screen flash is off; reduced is faint)
    const flashSetting = typeof juiceSettings === 'function' ? juiceSettings().flash : 'full';
    const fo = (C.frameOpacity[flashSetting] ?? 0) * Math.min(1, I);
    if (fo > 0 && (typeof juiceFlashAllowed !== 'function' || juiceFlashAllowed())) {
        const f = document.createElement('div');
        f.setAttribute('aria-hidden', 'true');
        f.style.cssText = `position:fixed; left:${Math.round(r.left)}px; top:${Math.round(r.top)}px; width:${Math.round(r.width)}px; height:${Math.round(r.height)}px; background:#fff; pointer-events:none; z-index:9999; border-radius:4px;`;
        document.body.appendChild(f);
        const a = f.animate([{ opacity: fo }, { opacity: 0 }], { duration: ticksMs(C.frameTicks), easing: 'linear' });
        a.onfinish = () => f.remove(); a.oncancel = () => f.remove();
    }
    // Gold ring 8 -> 22 px (radius), sparks burst from the slot
    const ring = document.createElement('div');
    ring.setAttribute('aria-hidden', 'true');
    ring.style.cssText = `position:fixed; left:${Math.round(cx)}px; top:${Math.round(cy)}px; width:0; height:0; pointer-events:none; z-index:9999;`;
    const dot = document.createElement('div');
    dot.style.cssText = 'position:absolute; border:3px solid #ffd45e; border-radius:50%; box-sizing:border-box; translate:-50% -50%; left:0; top:0;';
    ring.appendChild(dot);
    document.body.appendChild(ring);
    const from = C.ringFromPx * I + 0, to = C.ringToPx * I + 0;
    const ringAnim = dot.animate(RM
        ? [{ width: `${to * 2}px`, height: `${to * 2}px`, opacity: 0.9 }, { width: `${to * 2}px`, height: `${to * 2}px`, opacity: 0 }]
        : [{ width: `${from * 2}px`, height: `${from * 2}px`, opacity: 1 }, { width: `${to * 2}px`, height: `${to * 2}px`, opacity: 0 }],
        { duration: ticksMs(C.ringTicks), easing: 'ease-out' });
    ringAnim.onfinish = () => ring.remove(); ringAnim.oncancel = () => ring.remove();
    for (let i = 0; i < C.sparks; i++) {
        const s = document.createElement('div');
        s.setAttribute('aria-hidden', 'true');
        s.style.cssText = `position:fixed; left:${Math.round(cx - 2)}px; top:${Math.round(cy - 2)}px; width:4px; height:4px; background:#fff3b0; box-shadow:0 0 0 2px rgba(255,212,94,.6); pointer-events:none; z-index:9999;`;
        document.body.appendChild(s);
        const a = (i / C.sparks) * Math.PI * 2;
        const d = RM ? 0 : C.sparkPx * I;
        const anim = s.animate([
            { transform: 'translate(0,0)', opacity: 1 },
            { transform: `translate(${Math.round(Math.cos(a) * d)}px, ${Math.round(Math.sin(a) * d)}px)`, opacity: 0 }
        ], { duration: ticksMs(C.sparkTicks), easing: 'ease-out' });
        anim.onfinish = () => s.remove(); anim.oncancel = () => s.remove();
    }
    // Metallic clink (visual twin: the ring and sparks above)
    if (typeof biTone === 'function') biTone('triangle', C.clink.hz, C.clink.sec, C.clink.gain, C.clink.stepSec);
}

// The stat: the changed number turns green for statTicks; "+N" rises beside it
function statFlash(delta, I, RM) {
    const C = EQUIP_FLASH;
    const ids = ['derived-atk', 'combat-derived-atk'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const prev = eqFlashTimers.get(el);
        if (prev) clearTimeout(prev.t);
        if (prev && prev.rise) prev.rise.remove();
        el.style.color = C.colour;
        const r = el.getBoundingClientRect();
        if (!r.width) return; // not on screen: the colour still shows when it is
        const rise = document.createElement('div');
        rise.setAttribute('aria-hidden', 'true');
        rise.textContent = (delta > 0 ? '+' : '') + delta;
        rise.style.cssText = `position:fixed; left:${Math.round(r.right + 6)}px; top:${Math.round(r.top)}px; pointer-events:none; z-index:9999; color:${C.colour}; font-family:Roboto,sans-serif; font-weight:700; font-size:18px; -webkit-text-stroke:2px #000; paint-order:stroke fill;`;
        document.body.appendChild(rise);
        const ra = rise.animate(RM
            ? [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }]
            : [{ transform: 'translateY(0px)', opacity: 1 }, { transform: `translateY(${-Math.round(C.risePx * I)}px)`, opacity: 0 }],
            { duration: ticksMs(C.riseTicks), easing: 'ease-out' });
        ra.onfinish = () => rise.remove(); ra.oncancel = () => rise.remove();
        const t = setTimeout(() => { el.style.color = ''; eqFlashTimers.delete(el); }, ticksMs(C.statTicks));
        eqFlashTimers.set(el, { t, rise });
    });
}

// Wrap the equip so the stat can be read before and after (the equip itself is unchanged)
(function equipFlashHook() {
    if (typeof executeEquipItem !== 'function') return;
    const orig = executeEquipItem;
    executeEquipItem = function (index, targetSlot) {
        const before = typeof getDerivedStats === 'function' ? getDerivedStats().atk : 0;
        const ok = orig.apply(this, arguments);
        if (ok) {
            const after = typeof getDerivedStats === 'function' ? getDerivedStats().atk : before;
            setTimeout(() => equipFlashPlay(targetSlot, before, after), 0); // after the redraw
        }
        return ok;
    };
})();
