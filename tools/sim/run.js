// Loads the real game (optionally with a candidate MONSTER_CURVE) and runs simulated expeditions.
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:8765/index.html';
const MAPS_SRC = fs.readFileSync(require('path').join(__dirname, '../../data/maps.js'), 'utf8');
function mapsWithCurve(curve) {
    if (!curve) return MAPS_SRC;
    const re = /const MONSTER_CURVE = \[[\s\S]*?\];/;
    const body = 'const MONSTER_CURVE = [\n    ' + curve.map(a => `[${a[0]}, ${a[1]}, ${a[2]}]`).join(', ') + '\n];';
    if (!re.test(MAPS_SRC)) throw new Error('curve not found');
    return MAPS_SRC.replace(re, body);
}
async function withGame(browser, curve, fn) {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.route('**/data/maps.js*', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: mapsWithCurve(curve) }));
    await page.route(/supabase|turnstile|fonts\.(googleapis|gstatic)|jsdelivr/, r => r.abort());
    await page.goto(BASE);
    await page.waitForFunction(() => typeof GAME_DATA !== 'undefined' && typeof runCombatTick === 'function');
    await page.waitForTimeout(500);
    await page.addScriptTag({ path: __dirname + '/simpage.js' });
    try { return await fn(page); } finally { if (errs.length) console.error('page errors:', errs.slice(0, 3)); await page.close(); }
}
module.exports = { withGame, mapsWithCurve };
if (require.main === module) (async () => {
    const browser = await chromium.launch();
    await withGame(browser, null, async page => {
        for (const skills of [false, true]) {
            const t0 = Date.now();
            const r = await page.evaluate(([s]) => SIM.batch(30, 'map30', 20, { skills: s }), [skills]);
            console.log(JSON.stringify(r), ((Date.now() - t0) / 1000).toFixed(1) + 's');
        }
        console.log('class level at base:', JSON.stringify(await page.evaluate(() => [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99].map(L => [L, SIM.info(L).jobLv]))), 'jobRatio', await page.evaluate(() => SIM.jobRatio.toFixed(3)));
    });
    await browser.close();
})();
