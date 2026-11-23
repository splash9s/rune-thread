// ==========================================
// BOSS INTRO: NAME CARD (game juice, presentation only)
// When a boss stage starts: letterbox bars close in and the music dips, the boss squashes, hops and slams down
// (dust, screen shake, small flash, deep thump), the hero flinches, then the boss's name slides in from the
// right in gold with a gold rule under it, holds, and slides off left while the bars open.
//
// Runs on its own presentation clock (requestAnimationFrame + performance.now); it never touches the combat
// timers, monster stats or any game rule. Timings are in 60 Hz ticks (BI_TICK) or seconds; nothing counts rendered frames.
// Shake moves only the world layers (background, ground, monsters, hero), never the HUD or screen-space text.
//
// Accessibility settings (Settings > Effects, saved in player.juice):
//   shake 0-100 %   multiplies every screen shake (this one and Heavy Strike's)
//   flash           full / reduced / off. At most 3 flashes in any 1 s window, flashes stay faint (opacity <= 0.2).
//   reduceMotion    on, or the system's prefers-reduced-motion: movement and scaling become opacity changes
//   intensity       off / subtle / medium / high: scales shake, squash, hop and flash together
// Every sound has a visual twin: the thump goes with the dust ring and the slam; the music dip goes with the bars.
// ==========================================
const BI_TICK = 1000 / 60; // one 60 Hz tick in ms

const BOSS_INTRO = {
    barsInTicks: 18,       // letterbox bars close in
    barHeight: 96,         // px (design 1920x1080) at full intensity
    squashStart: 6,        // tick the squash starts
    squashTicks: 8,        // boss squashes down before the hop
    squashY: 0.88,         // squash: height scale...
    squashX: 1.08,         // ...and width scale
    hopTicks: 10,          // rise
    hopPx: 10,             // hop height
    stretchY: 1.06,        // stretched while in the air
    fallTicks: 4,          // slam down
    trauma: 0.2,           // screen trauma added on the slam (shake = trauma^2 x shakeMaxPx)
    traumaDecayPerSec: 0.9,
    shakeMaxPx: 40,        // shake offset at trauma 1
    shakeFreqHz: 24,       // how fast the shake changes direction
    dustCount: 14,         // dust puffs at the boss's feet
    dustTicks: 30,         // dust life
    dustSpreadPx: 130,
    flashOpacity: { full: 0.2, reduced: 0.08, off: 0 }, // whole-screen flash peak (kept faint)
    flashTicks: 8,
    flashMaxPerSecond: 3,  // never more than this many flashes in any 1 s window
    heroFlinchPx: 6,       // hero steps back this far on the slam
    heroFlinchTicks: 14,
    nameDelayTicks: 4,     // name starts this long after the slam
    nameInTicks: 16,       // slides in from the right (biEaseOut)
    nameFromPx: 520,
    ruleTicks: 12,         // gold rule grows under the name
    holdSec: 1.3,          // card holds
    outTicks: 12,          // card slides off left and fades, bars open
    outPx: 260,
    musicDip: 0.35,        // music volume while the boss arrives (fraction of the set volume)
    thump: { startHz: 70, endHz: 32, sec: 0.42, gain: 0.9, noiseGain: 0.35 },
    presets: { off: 0, subtle: 0.4, medium: 0.7, high: 1 } // intensity multipliers
};
const JUICE_DEFAULTS = { shake: 100, flash: 'full', reduceMotion: false, intensity: 'high' };

// ---------- settings ----------
function juiceSettings() {
    if (typeof player === 'undefined') return { ...JUICE_DEFAULTS };
    if (!player.juice) player.juice = {};
    Object.keys(JUICE_DEFAULTS).forEach(k => { if (player.juice[k] === undefined) player.juice[k] = JUICE_DEFAULTS[k]; });
    return player.juice;
}
function juiceReduceMotion() {
    const sys = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    return !!(juiceSettings().reduceMotion || sys);
}
function juiceIntensity() { return BOSS_INTRO.presets[juiceSettings().intensity] ?? 1; }
// Multiplier for every screen shake in the game (0 when reduced motion is on)
function juiceShakeScale() {
    if (juiceReduceMotion()) return 0;
    return Math.max(0, Math.min(100, Number(juiceSettings().shake) || 0)) / 100 * juiceIntensity();
}
// Flash rate limit: at most flashMaxPerSecond in any 1 s window
const juiceFlashTimes = [];
function juiceFlashAllowed(now = performance.now()) {
    while (juiceFlashTimes.length && now - juiceFlashTimes[0] > 1000) juiceFlashTimes.shift();
    if (juiceFlashTimes.length >= BOSS_INTRO.flashMaxPerSecond) return false;
    juiceFlashTimes.push(now);
    return true;
}
function juiceFlashOpacity() { const I = juiceIntensity(); return I > 0 ? (BOSS_INTRO.flashOpacity[juiceSettings().flash] ?? 0) * Math.max(0.5, I) : 0; }

// ---------- easing ----------
const biEaseOut = x => 1 - Math.pow(1 - x, 3);
const biEaseIn = x => x * x * x;
const biClamp = x => Math.max(0, Math.min(1, x));

// ---------- the intro ----------
let bossIntroRun = null;

function playBossIntro(boss) {
    cancelBossIntro(); // a new intro never stacks on an old one
    const view = document.getElementById('view-combat');
    const inner = document.querySelector('#combat-stage .ts-inner');
    const lineup = document.getElementById('monsters-lineup-container');
    if (!view || view.classList.contains('hidden') || !inner || !lineup || !boss) return;
    const C = BOSS_INTRO, I = juiceIntensity(), RM = juiceReduceMotion();
    const idx = Math.max(0, (typeof monstersList !== 'undefined' ? monstersList.indexOf(boss) : 0));

    // Layers (screen space, never shaken)
    const root = document.createElement('div');
    root.id = 'boss-intro';
    root.innerHTML = '<div class="bi-bar bi-top"></div><div class="bi-bar bi-bot"></div><div class="bi-flash"></div>'
        + '<div class="bi-card"><div class="bi-kicker">BOSS</div><div class="bi-name"></div><div class="bi-rule"></div></div>';
    root.querySelector('.bi-name').textContent = String(boss.name || 'Boss').replace(/\s*\((Mini )?Boss\)\s*$/i, ''); // the BOSS label above says it
    inner.appendChild(root);
    const top = root.querySelector('.bi-top'), bot = root.querySelector('.bi-bot');
    const flash = root.querySelector('.bi-flash'), card = root.querySelector('.bi-card'), rule = root.querySelector('.bi-rule');
    const barH = Math.round(C.barHeight * Math.max(0.5, I || 0.5));
    top.style.height = bot.style.height = barH + 'px';

    // Boss pose goes through CSS variables on the lineup container (the lineup is redrawn often; the container stays)
    lineup.classList.add('boss-intro-on');
    lineup.style.setProperty('--bi-n', String(idx + 1));
    lineup.dataset.biIdx = String(idx + 1);

    const world = ['earth-bg', 'earth-base', 'monsters-lineup-container', 'combat-player-sprite', 'combat-player-shadow', 'combat-pet-sprite']
        .map(id => document.getElementById(id)).filter(Boolean);
    const hero = document.getElementById('combat-player-sprite');

    const run = { start: performance.now(), raf: 0, trauma: 0, slamAt: null, dust: [], root, lineup, world, hero, thumped: false, flashed: false, musicDipped: false };
    bossIntroRun = run;
    musicDip(true);

    const slamTick = C.squashStart + C.squashTicks + C.hopTicks + C.fallTicks;
    const nameStart = slamTick + C.nameDelayTicks;
    const ruleStart = nameStart + C.nameInTicks;
    const holdEnd = ruleStart + C.ruleTicks + C.holdSec * 60;
    const endTick = holdEnd + C.outTicks;
    let lastNow = run.start;

    const frame = now => {
        if (bossIntroRun !== run) return;
        const tick = (now - run.start) / BI_TICK;
        const dt = Math.min(0.1, (now - lastNow) / 1000);
        lastNow = now;

        // Bars: close in, then open with the card's exit
        const barIn = biClamp(tick / C.barsInTicks), barOut = biClamp((tick - holdEnd) / C.outTicks);
        const barK = biEaseOut(barIn) * (1 - biEaseIn(barOut));
        if (RM) { top.style.opacity = bot.style.opacity = barK.toFixed(3); top.style.transform = bot.style.transform = 'none'; }
        else {
            top.style.transform = `translateY(${Math.round(-barH * (1 - barK))}px)`;
            bot.style.transform = `translateY(${Math.round(barH * (1 - barK))}px)`;
        }

        // Boss: squash, hop, slam (reduced motion: it dims while gathering and snaps back to full on the slam)
        let sx = 1, sy = 1, y = 0, op = 1;
        const s0 = C.squashStart, s1 = s0 + C.squashTicks, h1 = s1 + C.hopTicks;
        if (tick >= s0 && tick < s1) {
            const k = biEaseOut((tick - s0) / C.squashTicks);
            sy = 1 + (C.squashY - 1) * k * I; sx = 1 + (C.squashX - 1) * k * I; op = 1 - 0.35 * k;
        } else if (tick >= s1 && tick < h1) {
            const k = biEaseOut((tick - s1) / C.hopTicks);
            y = -C.hopPx * I * k; sy = 1 + (C.stretchY - 1) * I * k; op = 0.65;
        } else if (tick >= h1 && tick < slamTick) {
            const k = biEaseIn((tick - h1) / C.fallTicks);
            y = -C.hopPx * I * (1 - k); sy = C.stretchY + (1 - C.stretchY) * k; op = 0.65;
        }
        if (RM) { sx = sy = 1; y = 0; } else op = 1;
        lineup.style.setProperty('--bi-sx', sx.toFixed(3));
        lineup.style.setProperty('--bi-sy', sy.toFixed(3));
        lineup.style.setProperty('--bi-y', Math.round(y) + 'px');
        lineup.style.setProperty('--bi-op', op.toFixed(3));

        // Slam: trauma, dust, flash, thump, hero flinch (once)
        if (tick >= slamTick && run.slamAt === null) {
            run.slamAt = now;
            run.trauma = Math.min(1, run.trauma + C.trauma);
            spawnDust(run, idx);
            if (!run.thumped) { run.thumped = true; playThump(); }
            const fo = juiceFlashOpacity();
            if (fo > 0 && juiceFlashAllowed(now)) { run.flashed = true; run.flashAt = now; run.flashPeak = fo; }
        }

        // Flash (faint, rate limited)
        if (run.flashed) {
            const k = biClamp((now - run.flashAt) / (C.flashTicks * BI_TICK));
            flash.style.opacity = (run.flashPeak * (1 - k)).toFixed(3);
        }

        // Shake: trauma^2 x max, scaled by the player's shake setting, whole pixels, world layers only
        run.trauma = Math.max(0, run.trauma - C.traumaDecayPerSec * dt);
        const amp = run.trauma * run.trauma * C.shakeMaxPx * juiceShakeScale();
        const t = now / 1000 * C.shakeFreqHz;
        const shx = Math.round(amp * (Math.sin(t * 6.1) * 0.6 + Math.sin(t * 2.3 + 1.7) * 0.4));
        const shy = Math.round(amp * (Math.sin(t * 5.3 + 0.9) * 0.6 + Math.sin(t * 3.1 + 2.2) * 0.4));
        // Hero flinch: steps back on the slam (reduced motion: dims briefly instead)
        let fl = 0, heroOp = 1;
        if (run.slamAt !== null) {
            const k = biClamp((now - run.slamAt) / (C.heroFlinchTicks * BI_TICK));
            const w = Math.sin(Math.PI * k);
            if (RM) heroOp = 1 - 0.3 * w; else fl = -Math.round(C.heroFlinchPx * I * w);
        }
        world.forEach(el => {
            const extra = el === hero ? fl : 0;
            el.style.translate = (shx || extra || shy) ? `${shx + extra}px ${shy}px` : '';
        });
        if (hero) hero.style.opacity = heroOp < 1 ? heroOp.toFixed(3) : '';

        // Dust puffs
        updateDust(run, now);

        // Name card: in from the right (reduced motion: fades in place), rule grows, holds, out to the left and fades
        const nIn = biEaseOut(biClamp((tick - nameStart) / C.nameInTicks));
        const rIn = biEaseOut(biClamp((tick - ruleStart) / C.ruleTicks));
        const out = biEaseIn(biClamp((tick - holdEnd) / C.outTicks));
        const cardOp = tick < nameStart ? 0 : nIn * (1 - out);
        card.style.opacity = cardOp.toFixed(3);
        card.style.translate = RM ? '0 0' : `${Math.round(C.nameFromPx * (1 - nIn) - C.outPx * out)}px 0`;
        if (RM) { rule.style.transform = 'none'; rule.style.opacity = rIn.toFixed(3); }
        else rule.style.transform = `scaleX(${rIn.toFixed(3)})`;

        if (tick >= endTick && run.trauma <= 0.001) { cancelBossIntro(); return; }
        run.raf = requestAnimationFrame(frame);
    };
    run.raf = requestAnimationFrame(frame);
}

// Stops the intro and puts every actor back exactly where it was (safe to call any time)
function cancelBossIntro() {
    const run = bossIntroRun;
    bossIntroRun = null;
    if (!run) return;
    cancelAnimationFrame(run.raf);
    run.root.remove();
    run.lineup.classList.remove('boss-intro-on');
    ['--bi-n', '--bi-sx', '--bi-sy', '--bi-y', '--bi-op'].forEach(p => run.lineup.style.removeProperty(p));
    delete run.lineup.dataset.biIdx;
    run.world.forEach(el => { el.style.translate = ''; });
    if (run.hero) run.hero.style.opacity = '';
    run.dust.forEach(d => d.el.remove());
    musicDip(false);
}

// ---------- dust ----------
function spawnDust(run, idx) {
    const C = BOSS_INTRO;
    const inner = document.querySelector('#combat-stage .ts-inner');
    const anchor = document.querySelector(`#monsters-lineup-container > div:nth-child(${idx + 1}) img`);
    if (!inner || !anchor) return;
    const ib = inner.getBoundingClientRect(), sc = (ib.width / inner.offsetWidth) || 1, b = anchor.getBoundingClientRect();
    const fx = (b.left + b.width / 2 - ib.left) / sc, fy = (b.bottom - ib.top) / sc - 6;
    // Impact ring: the visual twin of the thump
    const ring = document.createElement('div');
    ring.className = 'bi-ring';
    ring.style.left = Math.round(fx) + 'px';
    ring.style.top = Math.round(fy) + 'px';
    run.root.appendChild(ring);
    run.dust.push({ el: ring, born: performance.now(), ring: true });
    const n = Math.round(C.dustCount * Math.max(0.4, juiceIntensity() || 0.4));
    for (let i = 0; i < n; i++) {
        const el = document.createElement('div');
        el.className = 'bi-dust';
        const side = i % 2 ? 1 : -1;
        run.root.appendChild(el);
        run.dust.push({ el, born: performance.now(), x: fx, y: fy, vx: side * (0.35 + Math.random() * 0.65) * C.dustSpreadPx,
            vy: -(10 + Math.random() * 40), size: 8 + Math.round(Math.random() * 10) });
    }
}
function updateDust(run, now) {
    const C = BOSS_INTRO, life = C.dustTicks * BI_TICK, RM = juiceReduceMotion();
    run.dust = run.dust.filter(d => {
        const k = (now - d.born) / life;
        if (k >= 1) { d.el.remove(); return false; }
        if (d.ring) {
            const s = RM ? 1 : 0.4 + 1.2 * biEaseOut(k);
            d.el.style.transform = `translate(-50%, -50%) scale(${s.toFixed(3)}, ${(s * 0.32).toFixed(3)})`;
            d.el.style.opacity = (0.9 * (1 - k)).toFixed(3);
            return true;
        }
        const e = biEaseOut(k);
        const x = RM ? d.x + d.vx * 0.25 : d.x + d.vx * e, y = RM ? d.y : d.y + d.vy * e;
        d.el.style.left = Math.round(x - d.size / 2) + 'px';
        d.el.style.top = Math.round(y - d.size / 2) + 'px';
        d.el.style.width = d.el.style.height = d.size + 'px';
        d.el.style.opacity = (0.8 * (1 - k)).toFixed(3);
        return true;
    });
}

// ---------- sound: deep thump (synthesised; its visual twin is the impact ring) ----------
function playThump() {
    try {
        const vol = typeof sfxVolumeNow === 'function' ? sfxVolumeNow() : 0;
        if (vol <= 0 || (typeof pageIsActive !== 'undefined' && !pageIsActive)) return;
        const ctx = typeof sfxContext === 'function' ? sfxContext() : null;
        if (!ctx || ctx.state !== 'running') return;
        const P = BOSS_INTRO.thump, t0 = ctx.currentTime;
        const osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(P.startHz, t0);
        osc.frequency.exponentialRampToValueAtTime(P.endHz, t0 + P.sec);
        g.gain.setValueAtTime(Math.min(1, P.gain * vol), t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + P.sec);
        osc.connect(g).connect(ctx.destination);
        osc.start(t0); osc.stop(t0 + P.sec + 0.02);
        // Short low noise burst for the impact
        const len = Math.floor(ctx.sampleRate * 0.12), buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), ng = ctx.createGain();
        lp.type = 'lowpass'; lp.frequency.value = 400;
        ng.gain.value = Math.min(1, P.noiseGain * vol);
        src.buffer = buf; src.connect(lp).connect(ng).connect(ctx.destination);
        src.start(t0);
    } catch (e) { /* no sound; the ring still shows */ }
}

// The world goes quiet: music dips while the boss arrives (the letterbox bars are its visual twin)
function musicDip(on) {
    try {
        if (typeof musicEl === 'undefined' || !musicEl || typeof trackVolumeNow !== 'function') return;
        musicEl.volume = Math.max(0, Math.min(1, trackVolumeNow() * (on ? BOSS_INTRO.musicDip : 1)));
    } catch (e) { /* music keeps its volume */ }
}

// ---------- settings UI (Settings page) ----------
function renderJuiceSettings() {
    const s = juiceSettings();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const sl = document.getElementById('juice-shake');
    if (sl) sl.value = s.shake;
    set('juice-shake-text', s.shake + '%');
    set('juice-flash-btn', 'Screen flash: ' + ({ full: 'Full', reduced: 'Reduced', off: 'Off' })[s.flash]);
    set('juice-motion-btn', 'Reduce motion: ' + (s.reduceMotion ? 'On' : 'Off'));
    set('juice-intensity-btn', 'Effect intensity: ' + s.intensity[0].toUpperCase() + s.intensity.slice(1));
}
function setJuiceShake(v) { juiceSettings().shake = Math.max(0, Math.min(100, Math.round(Number(v) || 0))); renderJuiceSettings(); }
function cycleJuiceFlash() { const s = juiceSettings(), o = ['full', 'reduced', 'off']; s.flash = o[(o.indexOf(s.flash) + 1) % o.length]; renderJuiceSettings(); juiceSave(); }
function toggleJuiceMotion() { const s = juiceSettings(); s.reduceMotion = !s.reduceMotion; renderJuiceSettings(); juiceSave(); }
function cycleJuiceIntensity() { const s = juiceSettings(), o = ['off', 'subtle', 'medium', 'high']; s.intensity = o[(o.indexOf(s.intensity) + 1) % o.length]; renderJuiceSettings(); juiceSave(); }
function juiceSave() { if (typeof saveGame === 'function') saveGame(); }
