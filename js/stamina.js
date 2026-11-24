// ==========================================
// STAMINA
// Starting a campaign run costs 1 stamina. Stamina holds up to 20 and refills 1 every hour while below 20
// (worked out from timestamps, so it also refills while the game is closed).
// Refill: watch an ad or pay 20 diamonds for +3 stamina, 3 times a day in total (resets at local midnight).
// A refill can take stamina above 20; the hourly refill waits until it is below 20 again.
// Saved in player.stamina = { value, lastRegen, refillDay, refillsUsed }.
// ==========================================
const STAMINA = {
    max: 20,
    regenMs: 60 * 60 * 1000,  // +1 every hour
    campaignCost: 1,
    refillAmount: 3,
    refillDiamonds: 20,
    refillsPerDay: 3,
    adSeconds: 5               // placeholder rewarded ad (no ad SDK yet), as for the rune refresh ad
};

const STAMINA_TEXT = {
    en: {
        title: 'Stamina', next: 'Next +1 in', full: 'Full', cost: 'Campaign costs 1 stamina',
        empty: 'Not enough stamina', refills: 'Refills left today', ad: 'Watch ad', watching: 'Watching ad…',
        noRefills: 'No refills left today. Come back tomorrow.', noDiamonds: 'Not enough diamonds',
        got: '+3 Stamina', note: 'Refills 1 every hour, up to 20.'
    },
    th: {
        title: 'สตามิน่า', next: '+1 ในอีก', full: 'เต็ม', cost: 'เล่นแคมเปญใช้ 1 สตามิน่า',
        empty: 'สตามิน่าไม่พอ', refills: 'เติมได้อีกวันนี้', ad: 'ดูโฆษณา', watching: 'กำลังดูโฆษณา…',
        noRefills: 'วันนี้เติมครบแล้ว กลับมาใหม่พรุ่งนี้', noDiamonds: 'เพชรไม่พอ',
        got: '+3 สตามิน่า', note: 'ฟื้นฟู 1 ทุกชั่วโมง สูงสุด 20'
    }
};
function staminaT(k) {
    const lang = (typeof currentLanguage !== 'undefined' && STAMINA_TEXT[currentLanguage]) ? currentLanguage : 'en';
    return STAMINA_TEXT[lang][k] || STAMINA_TEXT.en[k];
}
function staminaDayKey() { return typeof petDayKey === 'function' ? petDayKey() : new Date().toDateString(); }

// The saved state, made on first use (a new or older save starts full)
function staminaState() {
    if (typeof player === 'undefined' || !player) return null;
    let s = player.stamina;
    if (!s || typeof s !== 'object' || !Number.isFinite(s.value)) {
        s = player.stamina = { value: STAMINA.max, lastRegen: Date.now(), refillDay: staminaDayKey(), refillsUsed: 0 };
    }
    if (s.refillDay !== staminaDayKey()) { s.refillDay = staminaDayKey(); s.refillsUsed = 0; }
    return s;
}

// Adds the hourly refills earned since lastRegen. Returns true when the value changed.
function staminaRegen() {
    const s = staminaState();
    if (!s) return false;
    const now = Date.now();
    if (s.value >= STAMINA.max) { s.lastRegen = now; return false; } // full: the hour starts once stamina is spent
    if (!Number.isFinite(s.lastRegen) || s.lastRegen > now) s.lastRegen = now;
    const gained = Math.floor((now - s.lastRegen) / STAMINA.regenMs);
    if (gained <= 0) return false;
    s.value = Math.min(STAMINA.max, s.value + gained);
    s.lastRegen = s.value >= STAMINA.max ? now : s.lastRegen + gained * STAMINA.regenMs;
    return true;
}

function staminaMsToNext() {
    const s = staminaState();
    if (!s || s.value >= STAMINA.max) return 0;
    return Math.max(0, STAMINA.regenMs - (Date.now() - s.lastRegen));
}
function staminaClock(ms) {
    const t = Math.ceil(ms / 1000), m = Math.floor(t / 60), sec = t % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
}
function staminaRefillsLeft() { const s = staminaState(); return s ? Math.max(0, STAMINA.refillsPerDay - s.refillsUsed) : 0; }

// Starting a campaign: takes 1 stamina, or opens the refill window and returns false
function staminaSpendCampaign() {
    staminaRegen();
    const s = staminaState();
    if (!s) return true;
    if (s.value < STAMINA.campaignCost) {
        if (typeof floatFailAt === 'function') floatFailAt(staminaT('empty'));
        staminaOpen();
        return false;
    }
    if (s.value >= STAMINA.max) s.lastRegen = Date.now(); // the hour starts from the first stamina spent
    s.value -= STAMINA.campaignCost;
    staminaRender();
    if (typeof saveGame === 'function') saveGame();
    return true;
}

function staminaAddRefill() {
    const s = staminaState();
    s.refillsUsed++;
    s.value += STAMINA.refillAmount;
    if (typeof floatSuccessAt === 'function') floatSuccessAt(staminaT('got'));
    if (typeof saveGame === 'function') saveGame();
    staminaRender();
}

function staminaRefillDiamonds() {
    if (staminaRefillsLeft() <= 0) { if (typeof floatFailAt === 'function') floatFailAt(staminaT('noRefills')); return; }
    if ((player.diamonds || 0) < STAMINA.refillDiamonds) { if (typeof floatFailAt === 'function') floatFailAt(staminaT('noDiamonds')); return; }
    player.diamonds -= STAMINA.refillDiamonds;
    staminaAddRefill();
    if (typeof updateUI === 'function') updateUI();
}

let staminaAdTimer = null, staminaAdLeft = 0;
function staminaRefillAd() {
    if (staminaAdTimer) return;
    if (staminaRefillsLeft() <= 0) { if (typeof floatFailAt === 'function') floatFailAt(staminaT('noRefills')); return; }
    staminaAdLeft = STAMINA.adSeconds;
    staminaRender();
    staminaAdTimer = setInterval(() => {
        // The window was closed during the ad: stop without a refill
        if (!document.getElementById('stamina-modal')) { clearInterval(staminaAdTimer); staminaAdTimer = null; return; }
        staminaAdLeft--;
        if (staminaAdLeft > 0) { staminaRender(); return; }
        clearInterval(staminaAdTimer); staminaAdTimer = null;
        staminaAddRefill();
    }, 1000);
}

const STAMINA_BOLT_SVG = '<svg viewBox="0 0 24 24" class="stamina-ico" aria-hidden="true"><path d="M13.5 1 4 13.5h6.5L9 23l10-13h-6.8z" fill="#ffd23a" stroke="#5a3a00" stroke-width="1.6" stroke-linejoin="round"/></svg>';

// The refill window (in the game's modal)
function staminaOpen() {
    if (typeof showModal !== 'function') return;
    showModal(staminaT('title'), '', '<div id="stamina-modal"></div>' + (typeof adSlotHTML === 'function' ? adSlotHTML('stamina-refill', 300, 60) : ''));
    staminaRender();
}

function staminaModalHTML() {
    const s = staminaState();
    const left = staminaRefillsLeft();
    const ms = staminaMsToNext();
    const adBusy = !!staminaAdTimer;
    const canDia = left > 0 && !adBusy && (player.diamonds || 0) >= STAMINA.refillDiamonds;
    const btn = 'flex:1; padding:10px 12px; border-radius:12px; font-weight:800; font-size:15px; cursor:pointer; color:#fff; border:1px solid rgba(255,255,255,.15);';
    const off = 'opacity:.45; cursor:not-allowed;';
    return `<div style="display:flex; flex-direction:column; align-items:center; gap:10px; text-align:center;">
        <div style="display:flex; align-items:center; gap:8px; font-size:34px; font-weight:900; color:#ffd23a;">${STAMINA_BOLT_SVG.replace('stamina-ico', 'stamina-ico stamina-ico-lg')}<span>${s.value} / ${STAMINA.max}</span></div>
        <div style="font-size:14px; color:#cbd5e1;">${s.value >= STAMINA.max ? staminaT('full') : `${staminaT('next')} <strong style="color:#fde68a;">${staminaClock(ms)}</strong>`}</div>
        <div style="font-size:12px; color:#94a3b8;">${staminaT('cost')} · ${staminaT('note')}</div>
        <div style="width:100%; border-top:1px solid #334155; margin:4px 0;"></div>
        <div style="font-size:14px; color:#e2e8f0;">${staminaT('refills')}: <strong style="color:${left ? '#86efac' : '#f87171'};">${left} / ${STAMINA.refillsPerDay}</strong></div>
        <div style="display:flex; gap:10px; width:100%;">
            <button onclick="staminaRefillAd()" ${left && !adBusy ? '' : 'disabled'} style="${btn} background:#047857; ${left && !adBusy ? '' : off}">${adBusy ? `▶ ${staminaT('watching')} ${staminaAdLeft}s` : `▶ ${staminaT('ad')} +${STAMINA.refillAmount}`}</button>
            <button onclick="staminaRefillDiamonds()" ${canDia ? '' : 'disabled'} style="${btn} background:#6d28d9; ${canDia ? '' : off}">💎 ${STAMINA.refillDiamonds} → +${STAMINA.refillAmount}</button>
        </div>
    </div>`;
}

// The small stamina pills: next to gold and diamonds in the town and combat headers, and in the campaign panel
function staminaPillHTML(s) {
    const ms = staminaMsToNext();
    return `${STAMINA_BOLT_SVG}<span class="stamina-val">${s.value}/${STAMINA.max}</span>${s.value < STAMINA.max ? `<span class="stamina-next">${staminaClock(ms)}</span>` : ''}`;
}
function staminaEnsurePills() {
    // Its own row just above gold and diamonds (under the Class EXP bar), styled like those pills
    document.querySelectorAll('.town-money:not(.town-stamina)').forEach(box => {
        const prev = box.previousElementSibling;
        if (prev && prev.classList.contains('town-stamina')) return;
        const row = document.createElement('div');
        row.className = 'town-money town-stamina';
        const p = document.createElement('div');
        p.className = 'stamina-pill';
        p.title = staminaT('title');
        p.style.cursor = 'pointer';
        p.onclick = staminaOpen;
        row.appendChild(p);
        box.parentElement.insertBefore(row, box);
    });
    const panel = document.querySelector('#campaign-panel .expo-inner');
    if (panel && !panel.querySelector('.stamina-pill')) {
        const p = document.createElement('div');
        p.className = 'stamina-pill stamina-pill-panel';
        p.style.cursor = 'pointer';
        p.onclick = staminaOpen;
        panel.prepend(p);
    }
}

function staminaRender() {
    const s = staminaState();
    if (!s) return;
    staminaEnsurePills();
    const html = staminaPillHTML(s);
    document.querySelectorAll('.stamina-pill').forEach(p => {
        const h = p.classList.contains('stamina-pill-panel') ? html + `<span class="stamina-cost">${staminaT('cost')}</span>` : html;
        if (p.innerHTML !== h) p.innerHTML = h;
    });
    const m = document.getElementById('stamina-modal');
    if (m) { const h = staminaModalHTML(); if (m.innerHTML !== h) m.innerHTML = h; }
}

(function staminaCss() {
    const st = document.createElement('style');
    st.textContent = `.stamina-ico { width: 22px; height: 22px; display: block; flex: none; }
.ts-inner .town-money .stamina-ico { width: 34px; height: 34px; }
.stamina-ico-lg { width: 40px !important; height: 40px !important; }
.stamina-pill .stamina-val { color: #ffd23a; }
.stamina-pill .stamina-next { font-size: .7em; color: #cbd5e1; font-weight: 700; }
.stamina-pill-panel { display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; margin-bottom: 8px; padding: 6px 14px;
  border-radius: 12px; background: rgba(10,15,25,.9); border: 2px solid #c9a227; font-size: 32px; font-weight: 900; }
.stamina-pill-panel .stamina-ico { width: 34px; height: 34px; }
.stamina-pill-panel .stamina-val { color: #ffd23a !important; }
.stamina-pill-panel .stamina-next { color: #fde68a !important; }
.stamina-pill-panel .stamina-cost { font-size: 20px; color: #e2e8f0 !important; font-weight: 700; }`;
    document.head.appendChild(st);
})();

setInterval(() => {
    if (typeof player === 'undefined' || !player) return;
    if (typeof friendTentVisiting === 'function' && friendTentVisiting()) return; // `player` is a friend's copy
    if (staminaRegen() && typeof saveGame === 'function') saveGame();
    staminaRender();
}, 1000);
