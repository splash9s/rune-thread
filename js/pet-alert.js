// ==========================================
// PET DAILY "!" (presentation only)
// A yellow "!" floats over every pet that can still be petted today for friendship (petDailyPlay in js/ui.js:
// the first play of each day per pet adds 1 friendship). It goes away once that pet has been petted today,
// and comes back the next day. Shown on the main page pet, the combat pet and the pets walking in the tent.
// Not shown while visiting a friend's tent (petting there gives no friendship).
// The "!" sits in the pet's own stage, so it scales and moves with it. Reduce motion: no bob.
// ==========================================
const PET_ALERT = {
    offsetY: 14,      // gap between the top of the pet and the bottom of the "!" (stage px)
    bobPx: 4, bobSec: 1.1,
    fontPx: 56
};

const petAlertEls = new Map(); // pet element -> its "!" element

(function petAlertCss() {
    const st = document.createElement('style');
    st.textContent = `.pet-alert { position: absolute; z-index: 61; pointer-events: none; transform: translate(-50%, -100%);
  font-family: Roboto, sans-serif; font-weight: 900; line-height: 1; color: #ffd23a;
  -webkit-text-stroke: 3px #2a1a00; paint-order: stroke fill; text-shadow: 0 3px 0 #000, 0 0 10px rgba(255, 210, 58, .6); }`;
    document.head.appendChild(st);
})();

// Every pet element on screen now, with the pet item it belongs to
function petAlertTargets() {
    const out = [];
    const eq = player && player.equipped && player.equipped.pet;
    ['town-pet', 'combat-pet-sprite'].forEach(id => {
        const el = document.getElementById(id);
        if (el) out.push({ el, item: eq });
    });
    if (typeof tentPetWalkers !== 'undefined' && typeof tentPetItem === 'function') {
        tentPetWalkers.forEach(w => {
            const el = w.lick && w.lick.style.display === 'block' ? w.lick : w.cat;
            out.push({ el, item: tentPetItem(w.token), key: w.cat });
        });
    }
    return out;
}

function petAlertAvailable(item) {
    if (!item || typeof petDayKey !== 'function') return false;
    if (typeof friendTentVisiting === 'function' && friendTentVisiting()) return false;
    return item.lastPlayDay !== petDayKey();
}

function petAlertFrame(now) {
    requestAnimationFrame(petAlertFrame);
    if (document.hidden || typeof player === 'undefined' || !player) return;
    const RM = typeof juiceReduceMotion === 'function' && juiceReduceMotion();
    const used = new Set();
    petAlertTargets().forEach(t => {
        const key = t.key || t.el;
        const parent = t.el.parentElement;
        const shown = parent && petAlertAvailable(t.item) && t.el.style.display !== 'none' && t.el.getClientRects().length > 0;
        let a = petAlertEls.get(key);
        if (!shown) { if (a) a.style.display = 'none'; return; }
        if (!a || a.parentElement !== parent) {
            if (a) a.remove();
            a = document.createElement('div');
            a.className = 'pet-alert';
            a.setAttribute('aria-hidden', 'true');
            a.textContent = '!';
            a.style.fontSize = PET_ALERT.fontPx + 'px';
            parent.appendChild(a);
            petAlertEls.set(key, a);
        }
        used.add(key);
        // The pet's top centre in the parent's own (unscaled) px
        const pr = parent.getBoundingClientRect(), er = t.el.getBoundingClientRect();
        const k = (pr.width / (parent.offsetWidth || 1)) || 1;
        const bob = RM ? 0 : Math.round(Math.sin(now / 1000 / PET_ALERT.bobSec * Math.PI * 2) * PET_ALERT.bobPx);
        a.style.left = Math.round((er.left + er.width / 2 - pr.left) / k) + 'px';
        a.style.top = Math.round((er.top - pr.top) / k - PET_ALERT.offsetY + bob) + 'px';
        a.style.display = 'block';
    });
    // Pets that are gone (a tent walker removed): drop their "!"
    petAlertEls.forEach((a, key) => { if (!used.has(key) && !(key.isConnected)) { a.remove(); petAlertEls.delete(key); } });
}
requestAnimationFrame(petAlertFrame);
