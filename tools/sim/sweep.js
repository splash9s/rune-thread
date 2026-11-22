// Sweep: clear rate per map level for player levels L+5, L, L-5, L-10, with and without skills.
// Usage: node sweep.js [curveJsonFile] [n]
const { chromium } = require('playwright');
const fs = require('fs');
const { withGame } = require('./run.js');
const curve = process.argv[2] && process.argv[2] !== '-' ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : null;
const N = +(process.argv[3] || 40);
const MAPS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90];
const ONLY = process.argv[4]; // 'N' (no skills) or 'S' (skills) or both
(async () => {
    const browser = await chromium.launch();
    const rows = [];
    await withGame(browser, curve, async page => {
        for (const M of MAPS) {
            const key = 'map' + M;
            const row = { M };
            for (const skills of (ONLY === 'N' ? [false] : ONLY === 'S' ? [true] : [false, true])) {
                for (const d of [5, 0, -5, -10]) {
                    const L = Math.max(1, Math.min(99, M + d));
                    if (M + d > 99 || M + d < 1) { row[(skills ? 'S' : 'N') + d] = null; continue; }
                    const t0 = Date.now();
                    const r = await page.evaluate(([L, key, n, s]) => SIM.batch(L, key, n, { skills: s, stallMin: 15 }), [L, key, N, skills]);
                    row[(skills ? 'S' : 'N') + d] = Math.round(r.clear * 100);
                    process.stderr.write(`  M${M} L${L} ${skills ? 'S' : 'N'} clear ${Math.round(r.clear * 100)}% stage ${r.avgStage}/${r.of} stall ${r.stalemates} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
                }
            }
            rows.push(row);
            process.stderr.write(`map ${M} done\n`);
        }
    });
    await browser.close();
    const f = v => v == null ? '  -' : String(v).padStart(3);
    console.log('Map | no skills: L+5  L  L-5 L-10 | skills: L+5  L  L-5 L-10');
    rows.forEach(r => console.log(String(r.M).padStart(3) + ' |            ' + [5, 0, -5, -10].map(d => f(r['N' + d])).join('  ') + ' |         ' + [5, 0, -5, -10].map(d => f(r['S' + d])).join('  ')));
    fs.writeFileSync(__dirname + '/sweep_' + (curve ? 'candidate' : 'current') + '_' + (ONLY || 'NS') + '.json', JSON.stringify(rows));
})();
