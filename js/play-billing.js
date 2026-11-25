// ==========================================
// GOOGLE PLAY BILLING (Android app only)
// Google Play requires its own billing for diamonds and gold sold inside the Android app, so there the top-ups
// use Play instead of the Stripe links. The website keeps Stripe.
// - Digital Goods API: Play prices for the shop, and purchases that were paid but not finished yet.
// - Payment Request API: opens Google Play's purchase sheet.
// After payment, the play-purchase server function checks the purchase with Google, records it in diamond_topups
// and consumes it (so the pack can be bought again). The game then claims it like a Stripe top-up.
// Each top-up in DIAMOND_SHOP_ITEMS (ui.js) names its Play product with playSku.
// ==========================================
const PLAY_BILLING_METHOD = 'https://play.google.com/billing';
const playPrices = {}; // Play product ID -> price text from Google Play (in the player's currency)
let playBillingService = null;
let playBillingStarted = false;

async function playBillingInit() {
    if (playBillingService) return playBillingService;
    if (!isAndroidApp() || !('getDigitalGoodsService' in window)) return null;
    try {
        playBillingService = await window.getDigitalGoodsService(PLAY_BILLING_METHOD);
    } catch (e) {
        console.warn('Google Play Billing is not available:', e);
        return null;
    }
    return playBillingService;
}

function playSkus() {
    return (typeof DIAMOND_SHOP_ITEMS !== 'undefined' ? DIAMOND_SHOP_ITEMS : []).filter(i => i.playSku).map(i => i.playSku);
}

// Loads the Play prices once; the shop shows them instead of the website's USD prices
async function playLoadPrices() {
    const s = await playBillingInit();
    if (!s) return;
    try {
        const details = await s.getDetails(playSkus());
        for (const d of details) {
            let text = `${d.price.value} ${d.price.currency}`;
            try { text = new Intl.NumberFormat(navigator.language, { style: 'currency', currency: d.price.currency }).format(Number(d.price.value)); } catch (e) {}
            playPrices[d.itemId] = text;
        }
        if (typeof renderDiamondShop === 'function') renderDiamondShop();
    } catch (e) {
        console.warn('Play prices failed:', e);
    }
}

// Asks the server to check a purchase with Google and credit it. Safe to repeat for the same purchase.
async function playVerifyPurchase(sku, purchaseToken) {
    if (typeof cloudClient === 'undefined' || !cloudClient) throw new Error('not connected');
    const { data, error } = await cloudClient.functions.invoke('play-purchase', { body: { productId: sku, purchaseToken } });
    if (error) throw error;
    if (!data || !data.ok) throw new Error((data && data.error) || 'purchase not confirmed');
    return data;
}

// Purchases that were paid but never finished (the app closed, or the server could not be reached): finish them now
async function playRecoverPurchases() {
    const s = await playBillingInit();
    if (!s) return;
    try {
        const list = await s.listPurchases();
        let any = false;
        for (const p of list) {
            try { await playVerifyPurchase(p.itemId, p.purchaseToken); any = true; } catch (e) { console.warn('Play purchase recovery failed:', e); }
        }
        if (any && typeof claimDiamondTopups === 'function') await claimDiamondTopups();
    } catch (e) {
        console.warn('Play purchase list failed:', e);
    }
}

// Called after sign-in (cloud.js): prices, then any unfinished purchases
function playBillingStart() {
    if (playBillingStarted || !isAndroidApp()) return;
    playBillingStarted = true;
    playLoadPrices();
    playRecoverPurchases();
}

// Buys one top-up through Google Play
async function playBuy(item) {
    const s = await playBillingInit();
    if (!s) { if (typeof floatFailAt === 'function') floatFailAt('Google Play purchases are not available'); return; }
    let response;
    try {
        const request = new PaymentRequest(
            [{ supportedMethods: PLAY_BILLING_METHOD, data: { sku: item.playSku } }],
            { total: { label: 'Total', amount: { currency: 'USD', value: '0' } } } // required by the API; Play shows its own price
        );
        response = await request.show();
    } catch (e) {
        if (e && e.name === 'AbortError') return; // the player closed the purchase sheet
        console.warn('Play purchase did not start:', e);
        if (typeof floatFailAt === 'function') floatFailAt('The purchase could not start');
        return;
    }
    const token = response.details && response.details.purchaseToken;
    try {
        await playVerifyPurchase(item.playSku, token);
        await response.complete('success');
        if (typeof claimDiamondTopups === 'function') await claimDiamondTopups();
    } catch (e) {
        console.warn('Play purchase check failed:', e);
        try { await response.complete('fail'); } catch (e2) {}
        // Google keeps the purchase unfinished, so the next start (playRecoverPurchases) credits it
        if (typeof showModal === 'function') {
            showModal('Payment received', 'Your payment went through, but the game could not confirm it yet. Your top-up will be added the next time you open the game.', '');
        }
    }
}
