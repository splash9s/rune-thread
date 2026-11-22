// Per-map fit: find k so a level M-5 player with skills clears map M about 50% of the time.
// Candidate anchor: HP x sqrt(k), ATK x k (only that map's anchor changes). Then verify L, L-5, L-10 and no-skills L.
// Usage: node fit.js 10,30,50 > out.json
const { chromium } = require('playwright');
const fs = require('fs');
const { withGame } = require('./run.js');
const SRC = fs.readFileSync(require('path').join(__dirname, '../../data/maps.js'), 'utf8');
const BASE = JSON.parse('[' + SRC.match(/const MONSTER_CURVE = \[([\s\S]*?)\];/)[1].replace(/\s+/g, ' ') + ']');
const maps = process.argv[2].split(',').map(Number);
const N = 20;
function curveWith(M, k) {
    return BASE.map(([lv, hp, atk]) => lv === M ? [lv, +(hp * Math.sqrt(k)).toFixed(1), +(atk * k).toFixed(2)] : [lv, hp, atk]);
}
async function clear(browser, M, k, L, skills, n = N) {
    return withGame(browser, curveWith(M, k), page => page.evaluate(([L, key, n, s]) => SIM.batch(L, key, n, { skills: s, stallMin: 15 }), [L, 'map' + M, n, skills]));
}
(async () => {
    const browser = await chromium.launch();
    const out = {};
    for (const M of maps) {
        let lo = Math.log(0.6), hi = Math.log(8), best = null;
        for (let it = 0; it < 7; it++) {
            const mid = (lo + hi) / 2, k = Math.exp(mid);
            const r = await clear(browser, M, k, M - 5, true);
            process.stderr.write(`M${M} k=${k.toFixed(2)} L-5 skills clear ${Math.round(r.clear * 100)}% stage ${r.avgStage}/${r.of}\n`);
            if (!best || Math.abs(r.clear - 0.5) < Math.abs(best.c - 0.5)) best = { k, c: r.clear };
            if (r.clear > 0.5) lo = mid; else hi = mid;
        }
        const k = best.k;
        const v = {};
        for (const [lab, L, s] of [['L_S', M, true], ['Lm5_S', M - 5, true], ['Lm10_S', M - 10, true], ['L_N', M, false], ['Lp5_N', M + 5, false]]) {
            if (L < 1) { v[lab] = null; continue; }
            const r = await clear(browser, M, k, L, s, 30);
            v[lab] = Math.round(r.clear * 100);
        }
        out[M] = { k: +k.toFixed(3), verify: v };
        process.stderr.write(`M${M} => k ${k.toFixed(2)} ${JSON.stringify(v)}\n`);
        fs.writeFileSync(__dirname + `/fit_${maps.join('-')}.json`, JSON.stringify(out, null, 1));
    }
    await browser.close();
    console.log(JSON.stringify(out, null, 1));
})();
