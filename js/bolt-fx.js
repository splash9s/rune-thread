// ==========================================
// BOLT EFFECTS: each bolt falls from outside the top right of the monster it hits,
// lands on the monster's centre, plays its element's explosion frames, then fades out.
// Called from the bolt code in combat.js (bolt runes, Arcane skill nodes, Arcane Strike).
// Art: graphic/new/spell (keyed to assets/combat/bolt). Sizes are the files' own pixel sizes.
// ==========================================
const BOLT_FX_ART = {
    fire: {
        bolt: { src: 'assets/combat/bolt/firebolt_q85.webp', w: 300, h: 231 },
        frames: [
            { src: 'assets/combat/bolt/fireexplode1_q85.webp', w: 409, h: 340 },
            { src: 'assets/combat/bolt/fireexplode2_q85.webp', w: 409, h: 340 },
            { src: 'assets/combat/bolt/fireexplode3_q85.webp', w: 409, h: 340 }
        ]
    },
    ice: {
        bolt: { src: 'assets/combat/bolt/icebolt_q85.webp', w: 300, h: 231 },
        frames: [
            { src: 'assets/combat/bolt/iceexplode1_q85.webp', w: 302, h: 294 },
            { src: 'assets/combat/bolt/iceexplode2_q85.webp', w: 302, h: 294 }
        ]
    },
    wind: {
        bolt: { src: 'assets/combat/bolt/windbolt_q85.webp', w: 300, h: 258 },
        frames: [
            { src: 'assets/combat/bolt/windexplode1_q85.webp', w: 404, h: 360 },
            { src: 'assets/combat/bolt/windexplode2_q85.webp', w: 404, h: 360 }
        ]
    },
    earth: {
        bolt: { src: 'assets/combat/bolt/earthbolt_q85.webp', w: 292, h: 300 },
        frames: [
            { src: 'assets/combat/bolt/earthexplode1_q85.webp', w: 420, h: 323 },
            { src: 'assets/combat/bolt/earthexplode2_q85.webp', w: 420, h: 323 }
        ]
    }
};
const BOLT_FX = {
    boltScale: 0.55,    // bolt drawn at this fraction of its file size (design px)
    explodeScale: 0.55, // explosion frames likewise
    fromX: 320,         // start point, relative to where the bolt lands: right of the monster...
    fromY: -400,        // ...and above it, outside the sprite
    fallMs: 300,        // time to fall from the start point to the monster's centre
    staggerMs: 120,     // gap between the bolts of one cast
    jitter: 28,         // each bolt lands up to this far from the exact centre
    frameMs: 120,       // time each explosion frame stays on screen
    fadeMs: 320,        // the last frame holds, grows a little and fades out over this time
    tipX: 0.06,         // the bolt's tip (bottom left of the picture), as a fraction of its width...
    tipY: 0.94,         // ...and height: the tip is what lands on the centre
    dmgRise: 40,        // a bolt's damage number starts this far above the monster's centre
    dmgSpreadX: 45,     // ...and this far left (1st, 3rd bolt) or right (2nd, 4th bolt)
    dmgStepY: 38,       // each later bolt's number starts this much higher
    totalDelayMs: 150,  // the cast's total appears this long after its last bolt lands
    totalGap: 30        // ...this far above the highest bolt number
};

// Gap between two casts that proc on the same hit, so they play one after another (about one cast's length)
const BOLT_CAST_GAP_MS = 4 * 120 + 300;
// count: bolts in this cast (one fall and explosion each). element: fire / water (Ice) / wind / earth.
// delayMs: wait before this cast starts (used when several elements proc on one hit)
// damages: each bolt's damage; bolt i shows damages[i] in its element's colour when it explodes
// place: which page the bolts play on: the combat stage (default) or the main page (the straw man)
const BOLT_FX_PLACES = {
    combat: { view: 'view-combat', inner: '#combat-stage .ts-inner' },
    town: { view: 'view-town', inner: '#view-town .ts-inner' }
};
function playBoltFx(element, selector, count, delayMs = 0, damages = [], place = 'combat') {
    const elem = element === 'water' ? 'water' : element; // CSS colour classes use the element keys (water = Ice)
    const where = BOLT_FX_PLACES[place] || BOLT_FX_PLACES.combat;
    const view = document.getElementById(where.view);
    if (!view || view.classList.contains('hidden')) return;
    const art = BOLT_FX_ART[element === 'water' ? 'ice' : element];
    const inner = document.querySelector(where.inner);
    const anchor = document.querySelector(selector);
    if (!art || !inner || !anchor) return;
    // Monster centre in the stage's design coordinates (measured now, before the lineup can change)
    const ib = inner.getBoundingClientRect();
    const sc = (ib.width / inner.offsetWidth) || 1;
    const b = anchor.getBoundingClientRect();
    const cx = (b.left + b.width / 2 - ib.left) / sc;
    const cy = (b.top + b.height / 2 - ib.top) / sc;
    for (let i = 0; i < Math.max(1, count || 1); i++) {
        const jx = (Math.random() * 2 - 1) * BOLT_FX.jitter;
        const jy = (Math.random() * 2 - 1) * BOLT_FX.jitter;
        const dmg = damages[i];
        setTimeout(() => dropOneBolt(inner, art, cx + jx, cy + jy, dmg, elem, i, cx, cy), delayMs + i * BOLT_FX.staggerMs);
    }
    // The cast's total, after its last bolt has exploded, above the bolts' own numbers
    const n = Math.max(1, count || 1);
    const sum = damages.slice(0, n).reduce((a, d) => a + (Number(d) || 0), 0);
    if (n > 1 && sum > 0) {
        setTimeout(() => showBoltTotal(inner, cx, cy, sum, elem, n), delayMs + (n - 1) * BOLT_FX.staggerMs + BOLT_FX.fallMs + BOLT_FX.totalDelayMs);
    }
}
// The total of one cast: bigger, in the element's colour, above the stack of bolt numbers
function showBoltTotal(inner, x, y, sum, elem, n) {
    const d = document.createElement('div');
    d.className = `combat-dmg bolt bolt-total elem-${elem}`;
    d.textContent = sum;
    d.style.left = x + 'px';
    d.style.top = (y - BOLT_FX.dmgRise - n * BOLT_FX.dmgStepY - BOLT_FX.totalGap) + 'px';
    inner.appendChild(d);
    setTimeout(() => d.remove(), 1300);
}

// One bolt: falls from the top right so that its tip lands on (x, y), then explodes there
function dropOneBolt(inner, art, x, y, dmg, elem, n, cx, cy) {
    const w = art.bolt.w * BOLT_FX.boltScale, h = art.bolt.h * BOLT_FX.boltScale;
    const img = document.createElement('img');
    img.className = 'bolt-fx';
    img.alt = '';
    img.src = art.bolt.src;
    img.style.width = w + 'px';
    img.style.height = h + 'px';
    img.style.left = (x - w * BOLT_FX.tipX) + 'px';
    img.style.top = (y - h * BOLT_FX.tipY) + 'px';
    inner.appendChild(img);
    const fall = img.animate([
        { transform: `translate(${BOLT_FX.fromX}px, ${BOLT_FX.fromY}px)`, opacity: 0.5 },
        { transform: 'translate(0, 0)', opacity: 1 }
    ], { duration: BOLT_FX.fallMs, easing: 'cubic-bezier(.5, 0, 1, .6)' }); // speeds up as it falls
    fall.onfinish = () => {
        img.remove();
        explodeBolt(inner, art, x, y);
        showBoltDamage(inner, cx, cy, dmg, elem, n);
        if (typeof playSfx === 'function' && SFX.bolt && SFX.bolt[elem]) playSfx(SFX.bolt[elem]); // the element's impact sound
    };
    fall.oncancel = () => img.remove();
}

// The bolt's own damage number, in its element's colour, rising from the monster's centre.
// n (0-3): the bolt's place in its cast; numbers fan out left/right and step up so the four never overlap.
function showBoltDamage(inner, x, y, dmg, elem, n = 0) {
    if (dmg == null) return;
    const d = document.createElement('div');
    d.className = `combat-dmg bolt elem-${elem}`;
    d.textContent = dmg;
    d.style.left = (x + (n % 2 ? 1 : -1) * BOLT_FX.dmgSpreadX) + 'px';
    d.style.top = (y - BOLT_FX.dmgRise - n * BOLT_FX.dmgStepY) + 'px';
    inner.appendChild(d);
    setTimeout(() => d.remove(), 900);
}

// Explosion frames centred on (x, y); the last frame holds, grows a little and fades out
function explodeBolt(inner, art, x, y) {
    const img = document.createElement('img');
    img.className = 'bolt-fx';
    img.alt = '';
    inner.appendChild(img);
    let f = 0;
    const show = () => {
        const fr = art.frames[f];
        const w = fr.w * BOLT_FX.explodeScale, h = fr.h * BOLT_FX.explodeScale;
        img.src = fr.src;
        img.style.width = w + 'px';
        img.style.height = h + 'px';
        img.style.left = (x - w / 2) + 'px';
        img.style.top = (y - h / 2) + 'px';
        if (f === art.frames.length - 1) {
            const total = BOLT_FX.frameMs + BOLT_FX.fadeMs;
            const hold = BOLT_FX.frameMs / total;
            const fade = img.animate([
                { opacity: 1, transform: 'scale(1)', offset: 0 },
                { opacity: 1, transform: 'scale(1)', offset: hold },
                { opacity: 0, transform: 'scale(1.15)', offset: 1 }
            ], { duration: total, easing: 'ease-in', fill: 'forwards' });
            fade.onfinish = () => img.remove();
            fade.oncancel = () => img.remove();
            return;
        }
        f++;
        setTimeout(show, BOLT_FX.frameMs);
    };
    show();
}

// Decode every bolt picture once, shortly after load, so the first cast does not stall while they decode
setTimeout(() => {
    Object.values(BOLT_FX_ART).forEach(a => [a.bolt, ...a.frames].forEach(f => {
        const im = new Image();
        im.src = f.src;
        if (im.decode) im.decode().catch(() => {});
        (window.__boltFxKeep = window.__boltFxKeep || []).push(im); // keep them referenced so they stay decoded
    }));
}, 2000);
