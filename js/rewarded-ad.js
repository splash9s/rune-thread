// ==========================================
// REWARDED AD (watch an ad for a reward)
// Used by: the rune refresh (combat), the stamina refill (stamina.js) and the Free 10 Diamond card (ui.js).
// playRewardedAd(slot, seconds, onTick, onDone) plays the ad, then gives the reward.
//   onTick(left, stop) runs at once and then once per second while the ad plays (left = seconds still to watch).
//   stop() ends the ad early with no reward (for example when the window was closed); onDone is not called then.
//   onDone() gives the reward.
// Returns stop, so a caller can tell an ad is playing (truthy) and end it. Returns null when no ad could start.
// Android app: a real AdMob rewarded ad (playAndroidRewardedAd below).
// Website: placeholder, there is no web ad network yet, so this is only the countdown.
// ==========================================
function playRewardedAd(slot, seconds, onTick, onDone) {
    if (typeof isAndroidApp === 'function' && isAndroidApp()) return playAndroidRewardedAd(slot, seconds, onTick, onDone);
    let left = seconds;
    let timer = null;
    let stopped = false;
    const stop = () => { stopped = true; if (timer) clearInterval(timer); timer = null; };
    onTick(left, stop);
    if (stopped) return stop;
    timer = setInterval(() => {
        if (stopped) return;
        left--;
        if (left > 0) { onTick(left, stop); return; }
        stop();
        onDone();
    }, 1000);
    return stop;
}

// Android app: the ad plays in the app's own ad screen (RewardedAdActivity, AdMob), opened with an intent link.
// When the player earns the reward, AdMob calls the admob-ssv server function, which records it for this player
// and this ad (the nonce). Back in the game, the page claims that record once (claim_ad_reward) and gives the reward.
// Closing the ad early, or an ad that never loaded, gives nothing.
const ANDROID_AD_OPEN_MS = 15000;  // the ad screen must open within this time
const ANDROID_AD_CLAIM_MS = 15000; // after the player returns, how long to wait for AdMob's server call
function androidAdFail(text) { if (typeof floatFailAt === 'function') floatFailAt(text); }
function playAndroidRewardedAd(slot, seconds, onTick, onDone) {
    const uid = typeof cloudUserId !== 'undefined' ? cloudUserId : null;
    if (!uid || typeof cloudClient === 'undefined' || !cloudClient) { androidAdFail('Sign in to watch ads'); return null; }
    const nonce = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    const startedAt = Date.now();
    let timer = null, stopped = false, hidden = false, returnedAt = 0, claiming = false;
    const onVisible = () => {
        if (document.visibilityState === 'hidden') hidden = true;
        else if (hidden && !returnedAt) returnedAt = Date.now();
    };
    const stop = () => {
        stopped = true;
        if (timer) clearInterval(timer);
        timer = null;
        document.removeEventListener('visibilitychange', onVisible);
    };
    const tryClaim = async () => {
        if (claiming || stopped) return;
        claiming = true;
        try {
            const { data, error } = await cloudClient.rpc('claim_ad_reward', { p_slot: slot, p_nonce: nonce });
            if (!error && data === true && !stopped) { stop(); onDone(); return; }
        } catch (e) {}
        claiming = false;
    };
    onTick(seconds, stop);
    if (stopped) return stop;
    document.addEventListener('visibilitychange', onVisible);
    timer = setInterval(() => {
        if (stopped) return;
        onTick(seconds, stop); // lets the caller stop when its window was closed
        if (stopped) return;
        if (returnedAt) {
            tryClaim();
            if (Date.now() - returnedAt > ANDROID_AD_CLAIM_MS) { stop(); androidAdFail('No reward: the ad was not finished'); }
        } else if (!hidden && Date.now() - startedAt > ANDROID_AD_OPEN_MS) {
            stop();
            androidAdFail('The ad could not open');
        }
    }, 1000);
    // Must run inside the player's tap, so it stays synchronous
    const q = 'slot=' + encodeURIComponent(slot) + '&nonce=' + encodeURIComponent(nonce) + '&uid=' + encodeURIComponent(uid);
    location.href = 'intent://rewarded?' + q + '#Intent;scheme=runethread;package=' + ANDROID_PACKAGE + ';end';
    return stop;
}
