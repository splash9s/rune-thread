// ==========================================
// AVATAR UNLOCK POPUP (presentation only)
// When an avatar with an unlock rule (AVATAR_SET in js/ui.js) becomes unlocked, a popup shows it with a shining
// effect: gold rays turn behind it, a gloss sweeps across the picture, sparkles twinkle, and a chime plays.
// It says which condition was met (e.g. "Reached Base Lv. 20"). "Use avatar" sets it at once; "Close" keeps the old one.
//
// Unlocks already earned when a save loads (or when this feature first runs) are taken as seen: no popup for them.
// Seen avatars are kept in player.avatarsSeen. Several unlocks at once queue and show one after another.
// Waits while the sign-in page, the boss intro or the boss slow motion is on screen.
// Uses the Effects settings in js/boss-intro.js: intensity Off = no rays, gloss or sparkles; reduce motion = rays
// stand still and the popup fades in instead of popping.
// ==========================================
const AVATAR_UNLOCK = {
    pollMs: 500,
    popTicks: 18,          // pop in (easeOutBack)
    rayTurnSec: 8,         // rays turn once in this long
    glossEverySec: 2.2,    // a gloss sweeps across the picture this often
    sparkles: 10,
    chime: { hz: [784, 1046.5, 1318.5, 1568], sec: 0.7, gain: 0.2, stepSec: 0.09 }
};

const avatarUnlockState = { queue: [], showing: false, polled: 0 };

// The avatars that have an unlock rule (the open ones never need a popup)
function avatarUnlockRuled() {
    return typeof AVATAR_SET === 'undefined' ? [] : AVATAR_SET.filter(a => a.lv || a.boss || a.spend || a.die || a.hit);
}

// The condition that was met, said as done
function avatarUnlockReason(av) {
    const r = typeof avatarRule === 'function' ? avatarRule(av) : null;
    if (!r) return '';
    if (r.lv) return `Reached Base Lv. ${r.lv}`;
    if (r.boss) return `Defeated the Map Lv. ${r.boss} boss on all 4 elements`;
    if (r.spend) return `Bought more than ${r.spend} diamonds in total`;
    if (r.die) return `Died ${r.die} times in total`;
    if (r.hit) return `Hit the straw man ${r.hit} times in total`;
    return '';
}

// Takes every avatar unlocked right now as already seen (a loaded save is not a new unlock).
// A save that already lists its seen avatars keeps them; only the ones it lacks are added.
// fresh: the loaded save had no list of its own, so build it from what is unlocked now.
function avatarUnlockResync(fresh = true) {
    if (typeof player === 'undefined' || !player || typeof isAvatarUnlocked !== 'function') return;
    if (!fresh && Array.isArray(player.avatarsSeen)) { avatarUnlockState.queue = []; return; }
    player.avatarsSeen = avatarUnlockRuled().filter(a => isAvatarUnlocked(a.path)).map(a => a.path);
    avatarUnlockState.queue = [];
}

function avatarUnlockPoll() {
    if (typeof player === 'undefined' || !player || typeof isAvatarUnlocked !== 'function') return;
    if (typeof friendTentVisiting === 'function' && friendTentVisiting()) return; // a friend's data is loaded, not yours
    if (!Array.isArray(player.avatarsSeen)) { avatarUnlockResync(); return; }
    const seen = new Set(player.avatarsSeen);
    avatarUnlockRuled().forEach(a => {
        if (!seen.has(a.path) && isAvatarUnlocked(a.path)) {
            player.avatarsSeen.push(a.path);
            avatarUnlockState.queue.push(a.path);
        }
    });
    if (!avatarUnlockState.showing && avatarUnlockState.queue.length && avatarUnlockCanShow()) avatarUnlockShow(avatarUnlockState.queue.shift());
}

function avatarUnlockCanShow() {
    const signin = document.getElementById('view-signin');
    if (signin && !signin.classList.contains('hidden') && signin.getClientRects().length > 0) return false;
    if (typeof bossIntroRunning === 'function' && bossIntroRunning()) return false;
    if (typeof slowmoActive === 'function' && slowmoActive()) return false;
    return true;
}

function avatarUnlockCss() {
    if (document.getElementById('avatar-unlock-css')) return;
    const st = document.createElement('style');
    st.id = 'avatar-unlock-css';
    st.textContent = `
#avatar-unlock { position: fixed; inset: 0; z-index: 9800; display: flex; align-items: center; justify-content: center; background: rgba(5, 4, 10, .72); }
#avatar-unlock .au-card { position: relative; width: min(360px, 88vw); padding: 26px 22px 20px; border-radius: 18px; text-align: center;
  background: linear-gradient(#2a2213, #15110a); border: 2px solid #c9a227; box-shadow: 0 0 0 4px #000, 0 0 40px rgba(255, 200, 80, .35); color: #f5ecd6; font-family: Roboto, 'Noto Sans Thai', sans-serif; }
#avatar-unlock .au-kicker { font-weight: 900; font-size: 13px; letter-spacing: 4px; color: #f5d27a; }
#avatar-unlock .au-title { font-weight: 900; font-size: 26px; letter-spacing: 1px; color: #ffd45e; -webkit-text-stroke: 1px #3a2400; text-shadow: 0 2px 0 #000; margin-top: 2px; }
#avatar-unlock .au-stage { position: relative; width: 200px; height: 200px; margin: 14px auto 10px; }
#avatar-unlock .au-rays { position: absolute; inset: -40px; border-radius: 50%;
  background: repeating-conic-gradient(rgba(255, 214, 110, .55) 0deg 10deg, rgba(255, 214, 110, 0) 10deg 30deg);
  -webkit-mask: radial-gradient(circle, #000 25%, transparent 70%); mask: radial-gradient(circle, #000 25%, transparent 70%); }
#avatar-unlock .au-glow { position: absolute; inset: 10px; border-radius: 50%; background: radial-gradient(circle, rgba(255, 220, 120, .55), rgba(255, 220, 120, 0) 70%); }
#avatar-unlock .au-pic { position: absolute; inset: 30px; border-radius: 16px; overflow: hidden; border: 3px solid #ffd45e; box-shadow: 0 0 0 3px #000, 0 0 24px rgba(255, 212, 94, .6); background: #1d1a14; }
#avatar-unlock .au-pic img { width: 100%; height: 100%; object-fit: cover; display: block; }
#avatar-unlock .au-gloss { position: absolute; top: -20%; bottom: -20%; width: 40%; left: -60%; transform: skewX(-20deg);
  background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.75), rgba(255,255,255,0)); pointer-events: none; }
#avatar-unlock .au-spark { position: absolute; width: 8px; height: 8px; background: #fff3b0; transform: rotate(45deg); box-shadow: 0 0 8px #ffd45e; }
#avatar-unlock .au-cond { display: flex; gap: 8px; align-items: center; justify-content: center; margin: 4px 0 16px; padding: 8px 10px; border-radius: 10px;
  background: rgba(92, 255, 138, .08); border: 1px solid rgba(92, 255, 138, .4); color: #b9ffcc; font-weight: 700; font-size: 14px; }
#avatar-unlock .au-cond b { color: #5cff8a; font-size: 16px; }
#avatar-unlock .au-btns { display: flex; gap: 10px; }
#avatar-unlock .au-btns button { flex: 1; padding: 10px 0; border-radius: 10px; font-weight: 800; font-size: 14px; cursor: pointer; }
#avatar-unlock .au-use { background: #f0a020; color: #1a1205; border: 2px solid #000; }
#avatar-unlock .au-use:hover { background: #ffb83a; }
#avatar-unlock .au-close { background: #1e2a44; color: #dfe6f5; border: 2px solid #0f1830; }
#avatar-unlock .au-close:hover { background: #2a3a5c; }`;
    document.head.appendChild(st);
}

function avatarUnlockShow(av) {
    avatarUnlockCss();
    const C = AVATAR_UNLOCK;
    const I = typeof juiceIntensity === 'function' ? juiceIntensity() : 1;
    const RM = typeof juiceReduceMotion === 'function' && juiceReduceMotion();
    avatarUnlockState.showing = true;
    const root = document.createElement('div');
    root.id = 'avatar-unlock';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'New avatar unlocked');
    const reason = avatarUnlockReason(av);
    root.innerHTML = `<div class="au-card">
        <div class="au-kicker">NEW AVATAR</div>
        <div class="au-title">UNLOCKED!</div>
        <div class="au-stage">
            <div class="au-rays"></div><div class="au-glow"></div>
            <div class="au-pic"><img alt=""><div class="au-gloss"></div></div>
        </div>
        <div class="au-cond"><b>✓</b><span></span></div>
        <div class="au-btns"><button type="button" class="au-use">Use avatar</button><button type="button" class="au-close">Close</button></div>
    </div>`;
    root.querySelector('.au-pic img').src = av;
    root.querySelector('.au-cond span').textContent = reason;
    document.body.appendChild(root);

    const card = root.querySelector('.au-card'), rays = root.querySelector('.au-rays'), glow = root.querySelector('.au-glow');
    const gloss = root.querySelector('.au-gloss'), stage = root.querySelector('.au-stage');
    if (I <= 0) { rays.style.display = glow.style.display = gloss.style.display = 'none'; }

    // Pop in
    const popMs = C.popTicks * 1000 / 60;
    card.animate(RM ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: popMs, easing: RM ? 'linear' : 'cubic-bezier(.34,1.56,.64,1)' });

    // Sparkles around the picture (twinkle in place)
    const sparks = [];
    if (I > 0) for (let i = 0; i < C.sparkles; i++) {
        const s = document.createElement('div');
        s.className = 'au-spark';
        const a = (i / C.sparkles) * Math.PI * 2, d = 92 + (i % 2) * 12;
        s.style.left = Math.round(100 + Math.cos(a) * d - 4) + 'px';
        s.style.top = Math.round(100 + Math.sin(a) * d - 4) + 'px';
        stage.appendChild(s);
        sparks.push({ el: s, phase: i * 0.7 });
    }

    const start = performance.now();
    let raf = 0;
    const frame = now => {
        const t = (now - start) / 1000;
        if (I > 0) {
            if (!RM) rays.style.transform = `rotate(${(t / C.rayTurnSec * 360) % 360}deg)`;
            glow.style.opacity = (0.75 + 0.25 * Math.sin(t * 3)).toFixed(3);
            const g = (t % C.glossEverySec) / 0.6; // the sweep takes 0.6 s, then waits
            gloss.style.left = g < 1 ? `${Math.round(-60 + 180 * g)}%` : '-60%';
            sparks.forEach(sp => {
                const k = (Math.sin(t * 4 + sp.phase) + 1) / 2;
                sp.el.style.opacity = (0.2 + 0.8 * k).toFixed(3);
                sp.el.style.transform = `rotate(45deg) scale(${RM ? 1 : (0.6 + 0.6 * k).toFixed(3)})`;
            });
        }
        raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    if (typeof biTone === 'function') biTone('triangle', C.chime.hz, C.chime.sec, C.chime.gain, C.chime.stepSec);

    const close = () => {
        cancelAnimationFrame(raf);
        root.remove();
        avatarUnlockState.showing = false;
        if (typeof saveGame === 'function') saveGame(); // keep avatarsSeen
    };
    root.querySelector('.au-use').onclick = () => {
        if (typeof pickPlayerAvatar === 'function') {
            player.avatar = av;
            if (typeof selectedAvatarChoice !== 'undefined') selectedAvatarChoice = av;
            if (typeof updateUI === 'function') updateUI();
        }
        close();
    };
    root.querySelector('.au-close').onclick = close;
    root.addEventListener('pointerdown', e => { if (e.target === root) close(); }); // click outside the card
    root.querySelector('.au-use').focus();
}

(function avatarUnlockLoop() {
    const tick = () => {
        try { avatarUnlockPoll(); } catch (e) { /* never break the game */ }
        setTimeout(tick, AVATAR_UNLOCK.pollMs);
    };
    setTimeout(tick, 2000); // after the save has loaded
})();
