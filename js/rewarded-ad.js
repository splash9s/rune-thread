// ==========================================
// REWARDED AD (watch an ad for a reward)
// Used by: the rune refresh (combat), the stamina refill (stamina.js) and the Free 10 Diamond card (ui.js).
// playRewardedAd(slot, seconds, onTick, onDone) plays the ad, then gives the reward.
//   onTick(left, stop) runs at once and then once per second while the ad plays (left = seconds still to watch).
//   stop() ends the ad early with no reward (for example when the window was closed); onDone is not called then.
//   onDone() gives the reward.
// Returns stop, so a caller can tell an ad is playing (truthy) and end it.
// Placeholder: there is no ad network yet, so this is only the countdown. When one is connected, replace the body
// with its rewarded-ad call and keep the same arguments.
// ==========================================
function playRewardedAd(slot, seconds, onTick, onDone) {
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
