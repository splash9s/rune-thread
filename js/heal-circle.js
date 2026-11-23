// ==========================================
// HEALING CIRCLE (game juice, presentation only)
// For the big, earned heals in combat (a Potion, and the stage-start regen): the hero squashes on landing, kicks up dust, and a healing circle spreads from its feet across the floor (flat ellipse, 4 glyphs
// orbiting, green motes rising). The heal is then shown as 5 ticks of "+N", one every 20 ticks, and the circle fades.
//
// It never changes HP: healPlayer() applies the heal exactly as before. The circle only splits the amount that was
// actually healed into 5 numbers. Going over the cap shows "MAX" (with a gold cap line on the last tick); healing at
// full HP shows "FULL" in a dimmed circle, so a heal that did nothing still reads clearly.
//
// Presentation clock (requestAnimationFrame + performance.now); every value in 60 Hz ticks or seconds.
// Uses the shared Effects settings from js/boss-intro.js. Reduce motion: the squash and spread become fades.
// Timings are 30% shorter than the first version (all tick values scaled by 0.7).
// ==========================================
const HEAL_CIRCLE = {
    sources: ['Potion', 'stage'], // healPlayer sources that get the circle (small rune heals keep the plain number)
    px: 4,                 // stage px per pixel-art px (nearest neighbour)
    hopPx: 0,              // no jump: the hero does not leave the ground
    upTicks: 0,            // (no hop phase)
    downTicks: 0,
    squashX: 1.12, squashY: 0.86, squashTicks: 6,
    dust: 8, dustTicks: 14, dustSpreadPx: 26,
    radiusPx: 22,          // circle radius (pixel-art px); drawn flat: height = width / 4
    spreadTicks: 10,       // spreads out, easeOutBack
    ringTicks: 13,         // the ring that runs out ahead of it
    glyphs: ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ'], glyphTurnSec: 1.7, // 4 runes orbit once per glyphTurnSec
    moteEvery: 4, moteTicks: 25, moteRisePx: 70,
    tickCount: 5, tickEvery: 14, // heal numbers: 5 of them, 14 ticks apart (the first on landing)
    fadeTicks: 11,
    color: '#5cff8a', dark: '#0f6b35',
    tickSound: { notes: [880, 1320], sec: 0.18, gain: 0.12, stepSec: 0.04 }
};
let healCircleRun = null;

const hcEaseOutQuad = x => 1 - (1 - x) * (1 - x);
const hcEaseInQuad = x => x * x;
const hcEaseOutBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const hcClamp = x => Math.max(0, Math.min(1, x));

// gained: HP actually added. asked: the heal amount before the cap.
function playHealCircle(gained, asked) {
    cancelHealCircle();
    const view = document.getElementById('view-combat');
    const inner = document.querySelector('#combat-stage .ts-inner');
    const hero = document.getElementById('combat-player-sprite');
    const I = typeof juiceIntensity === 'function' ? juiceIntensity() : 1;
    if (!view || view.classList.contains('hidden') || !inner || !hero || I <= 0) return false;
    const C = HEAL_CIRCLE, P = C.px, RM = typeof juiceReduceMotion === 'function' && juiceReduceMotion();
    const feet = typeof combatHeroFeet === 'function' ? combatHeroFeet() : { x: 515, y: 871 };
    const R = C.radiusPx * P, W = R * 2, H = Math.round(W / 4);
    const root = document.createElement('div');
    root.id = 'heal-circle';
    root.style.left = Math.round(feet.x - R) + 'px';
    root.style.top = Math.round(feet.y - H / 2) + 'px';
    root.style.width = W + 'px';
    root.style.height = H + 'px';
    const full = gained <= 0;
    root.innerHTML = `<svg class="hc-floor" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">`
        + `<ellipse class="hc-fill" cx="${R}" cy="${H / 2}" rx="${R - 2}" ry="${H / 2 - 2}" fill="${C.color}" fill-opacity=".22" stroke="${C.color}" stroke-width="4"/>`
        + `<ellipse cx="${R}" cy="${H / 2}" rx="${Math.round(R * 0.62)}" ry="${Math.round(H * 0.31)}" fill="none" stroke="${C.color}" stroke-width="2" stroke-dasharray="6 6"/>`
        + `</svg><svg class="hc-ring" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><ellipse cx="${R}" cy="${H / 2}" rx="${R - 2}" ry="${H / 2 - 2}" fill="none" stroke="#e8fff0" stroke-width="3"/></svg>`
        + C.glyphs.map(g => `<span class="hc-glyph">${g}</span>`).join('');
    if (full) root.classList.add('full');
    inner.appendChild(root);
    const run = {
        start: performance.now(), raf: 0, root, hero, inner, feet, R, H, RM, I, gained, asked, full,
        floor: root.querySelector('.hc-floor'), ring: root.querySelector('.hc-ring'), glyphs: [...root.querySelectorAll('.hc-glyph')],
        dust: [], motes: [], landed: false, ticksShown: 0, lastMote: -1
    };
    healCircleRun = run;
    // The amount actually healed, split over the ticks (whole numbers, adding up to the real total)
    const n = C.tickCount;
    run.parts = Array.from({ length: n }, (_, i) => Math.floor(gained * (i + 1) / n) - Math.floor(gained * i / n));
    const landTick = C.upTicks + C.downTicks;
    const endTick = landTick + (C.tickCount - 1) * C.tickEvery + C.tickEvery + C.fadeTicks;

    const frame = now => {
        if (healCircleRun !== run) return;
        const tick = (now - run.start) / (1000 / 60);
        // Hop and stomp (reduced motion: the hero dims while "in the air" instead)
        let y = 0, sx = 1, sy = 1, op = 1;
        if (tick < C.upTicks) { const k = hcEaseOutQuad(tick / C.upTicks); y = -C.hopPx * P * k * I; op = 1 - 0.3 * k; }
        else if (tick < landTick) { const k = hcEaseInQuad((tick - C.upTicks) / C.downTicks); y = -C.hopPx * P * I * (1 - k); op = 0.7 + 0.3 * k; }
        else if (tick < landTick + C.squashTicks) {
            const w = Math.sin(Math.PI * (tick - landTick) / C.squashTicks);
            sx = 1 + (C.squashX - 1) * w * I; sy = 1 + (C.squashY - 1) * w * I;
        }
        if (RM) { y = 0; sx = sy = 1; hero.style.opacity = op < 1 ? op.toFixed(3) : ''; }
        else {
            hero.style.translate = y ? `0 ${Math.round(y)}px` : '';
            hero.style.transformOrigin = (sx !== 1) ? '50% 100%' : '';
            hero.style.scale = (sx !== 1) ? `${sx.toFixed(3)} ${sy.toFixed(3)}` : '';
        }
        // Landing: dust, circle spreads, first heal tick
        if (tick >= landTick && !run.landed) { run.landed = true; run.landAt = tick; hcDust(run); }
        if (run.landed) {
            const s = hcClamp((tick - run.landAt) / C.spreadTicks);
            const fade = hcClamp((tick - (endTick - C.fadeTicks)) / C.fadeTicks);
            const spread = RM ? 1 : Math.max(0, hcEaseOutBack(s));
            run.floor.style.transform = `scale(${spread.toFixed(3)})`;
            run.root.style.opacity = ((RM ? s : 1) * (1 - fade) * (run.full ? 0.5 : 1)).toFixed(3);
            const rk = hcClamp((tick - run.landAt) / C.ringTicks);
            run.ring.style.transform = `scale(${(RM ? 1 : 0.3 + 0.9 * hcEaseOutQuad(rk)).toFixed(3)})`;
            run.ring.style.opacity = (1 - rk).toFixed(3);
            // Glyphs orbit on the flat ellipse (reduced motion: they stay put and pulse)
            const turn = (now - run.start) / 1000 / C.glyphTurnSec * Math.PI * 2;
            run.glyphs.forEach((g, i) => {
                const a = (RM ? 0 : turn) + i * Math.PI / 2;
                const gx = run.R + Math.cos(a) * run.R * 0.82 * spread, gy = run.H / 2 + Math.sin(a) * run.H / 2 * 0.82 * spread;
                g.style.left = Math.round(gx) + 'px';
                g.style.top = Math.round(gy) + 'px';
                g.style.opacity = RM ? (0.6 + 0.4 * Math.sin(now / 300 + i)).toFixed(3) : '';
            });
            // A green mote rises every moteEvery ticks
            const m = Math.floor((tick - run.landAt) / C.moteEvery);
            if (m > run.lastMote && fade < 1) { run.lastMote = m; hcMote(run, now); }
            // Heal ticks: one every tickEvery ticks, starting on the landing
            const due = Math.min(C.tickCount, Math.floor((tick - run.landAt) / C.tickEvery) + 1);
            while (run.ticksShown < due) { hcTick(run, run.ticksShown); run.ticksShown++; }
        }
        hcParticles(run, now);
        if (tick >= endTick) { cancelHealCircle(); return; }
        run.raf = requestAnimationFrame(frame);
    };
    run.raf = requestAnimationFrame(frame);
    return true;
}

// Puts the hero back and removes everything (safe to call at any time)
function cancelHealCircle() {
    const run = healCircleRun;
    healCircleRun = null;
    if (!run) return;
    cancelAnimationFrame(run.raf);
    run.root.remove();
    run.dust.concat(run.motes).forEach(d => d.el.remove());
    run.hero.style.translate = run.hero.style.scale = run.hero.style.transformOrigin = run.hero.style.opacity = '';
}

function hcTick(run, i) {
    const C = HEAL_CIRCLE;
    if (run.full) { if (i === 0) showCombatText('#combat-player-sprite', 'FULL', 'heal-cap'); return; }
    const amt = run.parts[i];
    if (amt > 0) showCombatText('#combat-player-sprite', '+' + amt, 'heal');
    // Over the cap: the last tick also says MAX (the heal was bigger than the missing HP)
    if (i === C.tickCount - 1 && run.asked > run.gained) showCombatText('#combat-player-sprite', 'MAX', 'heal-cap', 120);
    biToneSafe(); // soft chime; its visual twin is the number
}
function biToneSafe() {
    const t = HEAL_CIRCLE.tickSound;
    if (typeof biTone === 'function') biTone('sine', t.notes, t.sec, t.gain, t.stepSec);
}

function hcDust(run) {
    const C = HEAL_CIRCLE, n = Math.round(C.dust * Math.max(0.4, run.I));
    for (let i = 0; i < n; i++) {
        const el = document.createElement('div');
        el.className = 'hc-dust';
        run.inner.appendChild(el);
        run.dust.push({ el, born: performance.now(), life: C.dustTicks * 1000 / 60, x: run.feet.x, y: run.feet.y - 4,
            vx: (i % 2 ? 1 : -1) * (0.4 + Math.random() * 0.6) * C.dustSpreadPx * C.px, vy: -(4 + Math.random() * 14) });
    }
}
function hcMote(run, now) {
    const C = HEAL_CIRCLE;
    const el = document.createElement('div');
    el.className = 'hc-mote';
    run.inner.appendChild(el);
    const a = Math.random() * Math.PI * 2;
    run.motes.push({ el, born: now, life: C.moteTicks * 1000 / 60, x: run.feet.x + Math.cos(a) * run.R * 0.7, y: run.feet.y + Math.sin(a) * run.H * 0.35, rise: true });
}
function hcParticles(run, now) {
    const keep = d => {
        const k = (now - d.born) / d.life;
        if (k >= 1) { d.el.remove(); return false; }
        let x = d.x, y = d.y;
        if (d.rise) { if (!run.RM) y -= HEAL_CIRCLE.moteRisePx * k; }
        else if (!run.RM) { const e = hcEaseOutQuad(k); x += d.vx * e; y += d.vy * e; }
        d.el.style.left = Math.round(x) + 'px';
        d.el.style.top = Math.round(y) + 'px';
        d.el.style.opacity = (1 - k).toFixed(3);
        return true;
    };
    run.dust = run.dust.filter(keep);
    run.motes = run.motes.filter(keep);
}
