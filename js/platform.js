// ==========================================
// PLATFORM: is the game running inside the Android app (a Trusted Web Activity)?
// The Android app opens "/?src=android" (startUrl in the Bubblewrap twa-manifest.json, see android/README.md).
// The flag is kept for the tab's session, so a reload or a link that drops the query still counts as the app.
// In the app, top-ups go through Google Play Billing (play-billing.js) and rewarded ads through AdMob (rewarded-ad.js).
// ==========================================
const ANDROID_PACKAGE = 'com.runethread.game'; // must match packageId in the Bubblewrap twa-manifest.json
const IS_ANDROID_APP = (function () {
    const fromUrl = /[?&]src=android(&|$)/.test(location.search)
        || (document.referrer || '').indexOf('android-app://' + ANDROID_PACKAGE) === 0;
    try {
        if (fromUrl) sessionStorage.setItem('rt_android_app', '1');
        return sessionStorage.getItem('rt_android_app') === '1';
    } catch (e) {
        return fromUrl;
    }
})();
function isAndroidApp() { return IS_ANDROID_APP; }
