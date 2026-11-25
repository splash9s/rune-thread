# Rune Thread for Android (Trusted Web Activity)

The Android app is a Trusted Web Activity (TWA) built with Bubblewrap. It opens `https://rune-thread.com/?src=android`
in Chrome without a browser bar. The game sees `?src=android` (js/platform.js) and then:

- **Top-ups** go through Google Play Billing (js/play-billing.js → `supabase/functions/play-purchase`), not Stripe. Google Play requires this for diamonds and gold sold in the app.
- **Rewarded ads** play in a small native AdMob screen (`RewardedAdActivity`). AdMob confirms the reward to `supabase/functions/admob-ssv`, and the game claims it from there (js/rewarded-ad.js).

The website is unchanged: Stripe top-ups and the placeholder ad countdown.

## Files here

| File | What it is |
|---|---|
| `ads-config.json` | AdMob app ID and rewarded ad unit ID. Holds Google's **test** IDs; put yours in before release. |
| `RewardedAdActivity.java.template` | The native ad screen. |
| `apply-native.mjs` | Copies the ad screen into the Bubblewrap project and patches its manifest and build.gradle. |
| `assetlinks.template.json` | Template for `https://rune-thread.com/.well-known/assetlinks.json`. |

`android/twa/` (the generated Bubblewrap project) is where the steps below put the app. Its keystore and build output are git-ignored.

## 1. One-time setup on the server

1. Run `supabase/ad_rewards.sql` in the Supabase SQL editor.
2. Deploy the functions:
   ```
   supabase functions deploy play-purchase
   supabase functions deploy admob-ssv --no-verify-jwt
   ```
3. Google Play service account (for `play-purchase`): in Google Cloud, create a service account and a JSON key. Invite its email in Play Console under **Users and permissions** with "View financial data" and "Manage orders and subscriptions". Then:
   ```
   supabase secrets set PLAY_SERVICE_ACCOUNT_JSON="$(cat key.json)" PLAY_PACKAGE_NAME=com.runethread.game
   ```
4. In AdMob, open the rewarded ad unit → **Server-side verification** → set the callback URL to
   `https://krtzvossvqddhveozcnb.supabase.co/functions/v1/admob-ssv` and press Verify.
5. Upload `app-ads.txt` to the site root: already in the repo as `app-ads.txt` (publisher pub-9953980849513175); it must be live at https://rune-thread.com/app-ads.txt. The Play listing's website must be rune-thread.com.

## 2. Icons (needed before Bubblewrap)

Add these to `assets/app/` (they are listed in `manifest.webmanifest`) and deploy the site:
- `icon-192.png` (192×192), `icon-512.png` (512×512)
- `icon-maskable-512.png` (512×512, logo inside the middle 80% so Android's round mask does not cut it)

## 3. Build the app

Needs Node 18+. Bubblewrap offers to download JDK 17 and the Android SDK on first run.

```
npm i -g @bubblewrap/cli
mkdir android\twa
cd android\twa
bubblewrap init --manifest https://rune-thread.com/manifest.webmanifest
```

Answers that matter: Domain `rune-thread.com`, **Start URL `/?src=android`**, Package ID `com.runethread.game`
(must match `ANDROID_PACKAGE` in js/platform.js and `PLAY_PACKAGE_NAME`), display mode fullscreen,
orientation as the game plays. Let it create a new signing key and **back up `android.keystore` and its passwords**.

Then open `twa-manifest.json` and turn on Play Billing:

```json
"alphaDependencies": { "enabled": true },
"features": { "playBilling": { "enabled": true } }
```

Put your AdMob IDs in `android/ads-config.json`, then:

```
bubblewrap update
node ..\apply-native.mjs
bubblewrap build
```

`bubblewrap build` makes `app-release-bundle.aab` (upload this to Play) and `app-release-signed.apk` (for your phone).
Run `node ..\apply-native.mjs` again after every `bubblewrap update`.

## 4. Digital Asset Links (removes the browser bar)

Copy `assetlinks.template.json` to the site as `/.well-known/assetlinks.json` and put in:
- the **app signing key** SHA-256 from Play Console → App integrity (after the first upload), and
- your upload key's SHA-256 (`bubblewrap fingerprint list`), so a sideloaded test APK works too.

It must be served at exactly `https://rune-thread.com/.well-known/assetlinks.json`, with no redirect. If the host is GitHub Pages, add an empty `.nojekyll` file so the `.well-known` folder is published.

## 5. Play Console products

Create these **in-app products** (one-time, consumable), and set each price in Play Console:

| Product ID | Gives |
|---|---|
| `diamonds_500` | 500 diamonds |
| `diamonds_4000` | 4,000 diamonds |
| `diamonds_8000` | 8,000 diamonds |
| `diamonds_18000` | 18,000 diamonds |
| `diamonds_30000` | 30,000 diamonds |
| `gold_30000` | 30,000 gold |
| `gold_100000` | 100,000 gold |

The IDs are listed in three places that must match: Play Console, `playSku` in js/ui.js, `PRODUCTS` in `supabase/functions/play-purchase/index.ts`.
Products can only be created after an app bundle with billing has been uploaded (internal testing is enough).
Add your Google account as a **license tester** (Play Console → Settings → License testing) to buy without being charged.

## 6. Test on a phone

1. Install `app-release-signed.apk` (`bubblewrap install` with the phone on USB).
2. No browser bar at the top → asset links work.
3. Diamond shop shows Play prices (not `$`), and buying a pack opens Google Play's sheet and adds the diamonds.
4. Stamina refill / rune refresh / Free 10 Diamond play a test ad, and the reward arrives after closing it.
   Closing the ad early gives nothing.

## Not done yet

- Refunds made in Google Play are not taken back in the game yet (Stripe refunds are). Next step: Play's Voided Purchases API or Real-time developer notifications → a negative row in `diamond_topups`, the same way `stripe-webhook` handles `charge.refunded`.
- The top-up descriptions still say USD prices (`desc` in js/ui.js); the price tag shows Play's price.
