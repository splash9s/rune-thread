// ==========================================
// LOW HEALTH WARNING (game juice, presentation only)
// The game has an HP bar, not hearts: "one heart left" = HP at or below LOW_HP.threshold of max HP in combat.
// While low: at 90 bpm (1.5 Hz, well under 3 Hz) each beat plays a lub-dub heartbeat and a soft red pulse on the
// screen edges. Sound and screen colour carry the warning. (No heart icon, no '!' over the hero: removed 2026-11-23.)
//
// Presentation clock: requestAnimationFrame + performance.now. Reads HP only; never changes it or any game rule.
// Uses the shared Effects settings in js/boss-intro.js (shake, flash, reduce motion, intensity).
//   flash full/reduced/off scales the edge pulse (off: no pulse, the edges hold a faint steady red instead).
//   reduce motion: the red edge pulse holds steady instead of pulsing.
// The edge pulse is one per beat, 1.5 per second: under the 3-per-second limit, and it only tints the edges.
// ==========================================
const LOW_HP = {
    threshold: 0.25,      // fraction of max HP that counts as "last heart"
    bpm: 90,              // beats per minute (1.5 Hz)
    beatTicks: 9,         // a beat's pulse lasts this long (60 Hz ticks)
    dubDelaySec: 0.14,    // second thump of the lub-dub
    edge: { full: 0.38, reduced: 0.18, off: 0, steady: 0.12, widthPx: 170 }, // edge pulse peak opacity per flash setting
    sound: { lubHz: 62, dubHz: 52, sec: 0.16, gain: 0.55 },
    hpPollMs: 200         // how often HP is read
};

let lowHpState = { on: false, raf: 0, lastPoll: 0, low: false, beat: -1, els: null };

function lowHpEls() {
    if (lowHpState.els && document.body.contains(lowHpState.els.edge)) return lowHpState.els;
    const inner = document.querySelector('#combat-stage .ts-inner');
    const hpRow = document.getElementById('player-hp-text');
    if (!inner || !hpRow) return null;
    hpRow.parentElement.style.position = 'relative';
    const edge = document.createElement('div');
    edge.id = 'lowhp-edge';
    edge.style.setProperty('--lowhp-w', LOW_HP.edge.widthPx + 'px');
    inner.appendChild(edge);
    const label = document.createElement('div'); // screen readers
    label.className = 'sr-only';
    label.setAttribute('role', 'status');
    hpRow.parentElement.appendChild(label);
    lowHpState.els = { edge, label };
    return lowHpState.els;
}

function lowHpHide(els) {
    if (!els) return;
    els.edge.style.display = 'none';
    els.edge.style.opacity = '';
    els.label.textContent = '';
}

function lowHpFrame(now) {
    lowHpState.raf = requestAnimationFrame(lowHpFrame);
    const view = document.getElementById('view-combat');
    const els = lowHpEls();
    if (!els) return;
    if (typeof juiceAllFx === 'function' && !juiceAllFx()) { lowHpHide(els); return; } // All effects off: no red edge or heartbeat
    if (!view || view.classList.contains('hidden') || document.hidden) { lowHpHide(els); lowHpState.low = false; return; }
    if (now - lowHpState.lastPoll > LOW_HP.hpPollMs) {
        lowHpState.lastPoll = now;
        try {
            const max = getDerivedStats().maxHp;
            const I = typeof juiceIntensity === 'function' ? juiceIntensity() : 1;
            const was = lowHpState.low;
            lowHpState.low = I > 0 && player.hp > 0 && max > 0 && player.hp / max <= LOW_HP.threshold;
            if (lowHpState.low && !was) { lowHpState.start = now; lowHpState.beat = -1; els.label.textContent = 'Low health'; }
        } catch (e) { lowHpState.low = false; }
    }
    if (!lowHpState.low) { lowHpHide(els); return; }

    const RM = typeof juiceReduceMotion === 'function' && juiceReduceMotion();
    const flashMode = typeof juiceSettings === 'function' ? juiceSettings().flash : 'full';
    const I = typeof juiceIntensity === 'function' ? juiceIntensity() : 1;
    const period = 60000 / LOW_HP.bpm;
    const t = now - lowHpState.start;
    const beat = Math.floor(t / period);
    const into = (t % period) / (1000 / 60); // ticks into this beat
    // One heartbeat sound per beat; its visual twin is the edge pulse
    if (beat !== lowHpState.beat) { lowHpState.beat = beat; lowHpHeartbeat(); }
    const w = into < LOW_HP.beatTicks ? Math.sin(Math.PI * into / LOW_HP.beatTicks) : 0;

    // Edge pulse: soft red on the screen edges only (centre stays clear)
    const peak = (LOW_HP.edge[flashMode] ?? 0) * I;
    els.edge.style.display = 'block';
    els.edge.style.opacity = (peak > 0 ? LOW_HP.edge.steady + (peak - LOW_HP.edge.steady) * w : LOW_HP.edge.steady).toFixed(3);
}

// Lub-dub (synthesised); its visual twin is the edge pulse
function lowHpHeartbeat() {
    try {
        const vol = typeof sfxVolumeNow === 'function' ? sfxVolumeNow() : 0;
        if (vol <= 0 || (typeof pageIsActive !== 'undefined' && !pageIsActive)) return;
        const ctx = typeof sfxContext === 'function' ? sfxContext() : null;
        if (!ctx || ctx.state !== 'running') return;
        const S = LOW_HP.sound;
        [[S.lubHz, 0, 1], [S.dubHz, LOW_HP.dubDelaySec, 0.7]].forEach(([hz, at, g0]) => {
            const t0 = ctx.currentTime + at;
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(hz * 1.4, t0);
            o.frequency.exponentialRampToValueAtTime(hz, t0 + 0.05);
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(Math.min(1, S.gain * g0 * vol), t0 + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + S.sec);
            o.connect(g).connect(ctx.destination);
            o.start(t0); o.stop(t0 + S.sec + 0.02);
        });
    } catch (e) { /* no sound; the edge still pulses */ }
}

lowHpState.raf = requestAnimationFrame(lowHpFrame);
