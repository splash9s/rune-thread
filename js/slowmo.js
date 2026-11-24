// ==========================================
// BOSS LAST HIT: SLOW MOTION (campaign)
// When the hit that kills a campaign boss lands (and no monster is left), time slows down:
//  - every animation on the combat stage (hit numbers, bolts, lunges, idle bobbing) plays at SLOWMO.rate,
//  - effect timers (slash frames, bolt explosions, number lifetimes) are stretched by fxMs(),
//  - the boss's own hurt and death frames run on slowed time (slowmoElapsed),
//  - the hero holds the strike pose, the music drops in pitch,
//  - a white impact flash, then a dark vignette with the light on the boss.
// Then time eases back to normal and the stage ends as usual (it waits slowmoExtraMs longer).
// ==========================================
const SLOWMO = {
    rate: 0.25,     // speed while slowed (1 = normal)
    holdMs: 1400,   // real time spent at that speed
    rampMs: 500,    // real time to ease back to normal speed
    musicRate: 0.6  // music speed (and pitch) while slowed
};
let slowmoAt = 0; // when the current slow motion started (0 = none)

// Speed of time right now: SLOWMO.rate during the hold, then a straight ramp back up to 1
function slowmoRate(now = Date.now()) {
    if (!slowmoAt) return 1;
    const t = now - slowmoAt;
    if (t < 0 || t >= SLOWMO.holdMs + SLOWMO.rampMs) return 1;
    if (t < SLOWMO.holdMs) return SLOWMO.rate;
    return SLOWMO.rate + (1 - SLOWMO.rate) * (t - SLOWMO.holdMs) / SLOWMO.rampMs;
}
function slowmoActive(now = Date.now()) { return slowmoRate(now) < 1; }
// An effect step of ms (normal time) lasts this long in real time when it starts now
function fxMs(ms) { return ms / slowmoRate(); }
// Game time that passed between from and now (real ms), counting slowed stretches at their speed
function slowmoElapsed(from, now = Date.now()) {
    if (!slowmoAt || now <= from) return now - from;
    const s = slowmoAt, h = s + SLOWMO.holdMs, e = h + SLOWMO.rampMs;
    const span = (a, b) => Math.max(0, Math.min(b, now) - Math.max(a, from));
    const before = span(-Infinity, s), hold = span(s, h), after = span(e, Infinity);
    // Ramp: the speed rises linearly, so integrate it over the part of the ramp inside [from, now]
    const r0 = Math.max(from, h), r1 = Math.min(now, e);
    let ramp = 0;
    if (r1 > r0) {
        const v = x => SLOWMO.rate + (1 - SLOWMO.rate) * (x - h) / SLOWMO.rampMs;
        ramp = (r1 - r0) * (v(r0) + v(r1)) / 2;
    }
    return before + hold * SLOWMO.rate + ramp + after;
}
// Real time the slow motion adds (the stage-end wait grows by this)
function slowmoExtraMs() {
    if (!slowmoAt) return 0;
    const left = slowmoAt + SLOWMO.holdMs + SLOWMO.rampMs - Date.now();
    if (left <= 0) return 0;
    return SLOWMO.holdMs * (1 - SLOWMO.rate) + SLOWMO.rampMs * (1 - SLOWMO.rate) / 2;
}

// Start it on the boss at lineup index idx (called when the killing blow lands)
function startBossSlowmo(idx) {
    const view = document.getElementById('view-combat');
    if (!view || view.classList.contains('hidden')) return;
    if (typeof juiceAllFx === 'function' && !juiceAllFx()) return;
    slowmoAt = Date.now();
    // Hero: the strike pose stays up through the slowed part
    if (typeof combatPlayerAttack !== 'undefined' && combatPlayerAttack.at) {
        const since = Date.now() - combatPlayerAttack.at;
        combatPlayerAttack.dur = Math.max(combatPlayerAttack.dur || 0, since + SLOWMO.holdMs + SLOWMO.rampMs / 2);
    }
    // Light on the boss: flash, then a vignette centred on it (drawn after the lineup has the dead boss)
    setTimeout(() => slowmoOverlay(idx), 0);
    slowmoMusic(true);
    clearInterval(startBossSlowmo.timer);
    startBossSlowmo.timer = setInterval(() => {
        const rate = slowmoRate();
        try {
            view.getAnimations({ subtree: true }).forEach(a => { if (a.playbackRate !== rate) a.playbackRate = rate; });
        } catch (e) { /* older browsers: no animation slowing */ }
        if (rate >= 1) {
            clearInterval(startBossSlowmo.timer);
            slowmoMusic(false);
            const ov = document.getElementById('slowmo-overlay');
            if (ov) { ov.classList.add('out'); setTimeout(() => ov.remove(), 600); }
        }
    }, 30);
}

function slowmoOverlay(idx) {
    const inner = document.querySelector('#combat-stage .ts-inner');
    if (!inner) return;
    document.getElementById('slowmo-overlay')?.remove();
    let cx = 1300, cy = 700;
    const anchor = document.querySelector(`#monsters-lineup-container > div:nth-child(${idx + 1}) img`);
    if (anchor) {
        const ib = inner.getBoundingClientRect();
        const sc = (ib.width / inner.offsetWidth) || 1;
        const b = anchor.getBoundingClientRect();
        cx = (b.left + b.width / 2 - ib.left) / sc;
        cy = (b.top + b.height / 2 - ib.top) / sc;
    }
    const ov = document.createElement('div');
    ov.id = 'slowmo-overlay';
    ov.style.setProperty('--sx', cx + 'px');
    ov.style.setProperty('--sy', cy + 'px');
    ov.innerHTML = '<div class="slowmo-vignette"></div><div class="slowmo-flash"></div>';
    inner.appendChild(ov);
}

// Music slows and drops in pitch during the slow motion
function slowmoMusic(on) {
    try {
        if (typeof musicEl === 'undefined' || !musicEl) return;
        if ('preservesPitch' in musicEl) musicEl.preservesPitch = !on;
        if ('webkitPreservesPitch' in musicEl) musicEl.webkitPreservesPitch = !on;
        musicEl.playbackRate = on ? SLOWMO.musicRate : 1;
    } catch (e) { /* music keeps its speed */ }
}
