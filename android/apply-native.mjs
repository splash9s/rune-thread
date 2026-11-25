// Rune Thread: adds the AdMob rewarded ad screen to the Bubblewrap Android project.
// Run after `bubblewrap init` and again after every `bubblewrap update` (which rewrites the manifest and build.gradle):
//   node android/apply-native.mjs [project folder, default android/twa]
// Reads the package name from twa-manifest.json and the AdMob IDs from android/ads-config.json. Safe to run twice.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2] || path.join(here, "twa"));
const read = (p) => fs.readFileSync(p, "utf8");
const must = (p) => { if (!fs.existsSync(p)) { console.error(`Not found: ${p}\nRun bubblewrap init in ${dir} first.`); process.exit(1); } return p; };

const twa = JSON.parse(read(must(path.join(dir, "twa-manifest.json"))));
const pkg = twa.packageId;
const cfg = JSON.parse(read(path.join(here, "ads-config.json")));
if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(pkg || "")) { console.error(`Bad packageId in twa-manifest.json: ${pkg}`); process.exit(1); }
if (cfg.admobAppId.startsWith("ca-app-pub-3940256099942544")) console.warn("ads-config.json still has Google's TEST ad IDs (fine for testing, replace before release).");

// 1. The ad screen
const javaDir = path.join(dir, "app", "src", "main", "java", ...pkg.split("."));
fs.mkdirSync(javaDir, { recursive: true });
const java = read(path.join(here, "RewardedAdActivity.java.template")).replace(/__PACKAGE__/g, pkg).replace(/__AD_UNIT_ID__/g, cfg.rewardedAdUnitId);
fs.writeFileSync(path.join(javaDir, "RewardedAdActivity.java"), java);

// 2. AndroidManifest.xml: the AdMob app ID and the ad screen, opened by runethread://rewarded
const manifestPath = must(path.join(dir, "app", "src", "main", "AndroidManifest.xml"));
let manifest = read(manifestPath).replace(/\s*<!-- rune-thread-ads -->[\s\S]*?<!-- \/rune-thread-ads -->/, "");
const block = `
        <!-- rune-thread-ads -->
        <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="${cfg.admobAppId}" />
        <activity
            android:name="${pkg}.RewardedAdActivity"
            android:exported="true"
            android:excludeFromRecents="true"
            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden"
            android:theme="@android:style/Theme.Translucent.NoTitleBar">
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="runethread" android:host="rewarded" />
            </intent-filter>
        </activity>
        <!-- /rune-thread-ads -->
`;
const end = manifest.lastIndexOf("</application>");
if (end < 0) { console.error("No </application> in AndroidManifest.xml"); process.exit(1); }
const lineStart = manifest.lastIndexOf("\n", end) + 1; // insert above the </application> line
manifest = manifest.slice(0, lineStart) + block.replace(/^\n/, "") + manifest.slice(lineStart);
fs.writeFileSync(manifestPath, manifest);

// 3. app/build.gradle: the AdMob and consent libraries (AdMob needs minSdk 23 or higher)
const gradlePath = must(path.join(dir, "app", "build.gradle"));
let gradle = read(gradlePath);
if (!gradle.includes("play-services-ads")) {
  gradle = gradle.replace(/dependencies\s*\{/, (m) => `${m}
    implementation 'com.google.android.gms:play-services-ads:23.6.0'
    implementation 'com.google.android.ump:user-messaging-platform:3.1.0'`);
}
gradle = gradle.replace(/minSdkVersion\s+(\d+)/, (m, v) => (Number(v) < 23 ? "minSdkVersion 23" : m));
fs.writeFileSync(gradlePath, gradle);

console.log(`Ad screen added to ${dir} for ${pkg}.`);
