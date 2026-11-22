# Monster curve simulator

Runs campaign expeditions inside the real game page (the game's own combat code on a simulated clock),
with the reference player from the Ragnatale project doc `claude/monster-curve.md`.

Setup: serve the repo root on port 8765 (`python -m http.server 8765`), Node with Playwright installed.

- `node run.js` - self-test on map 30.
- `node sweep.js - 20 S` - clear rates for every campaign map at player levels L+5, L, L-5, L-10 (`S` with skills, `N` without; `-` = the curve in data/maps.js, or a JSON file with a candidate curve).
- `node fit.js 10,30,50` - per map, finds the multiplier k (ATK x k, HP x sqrt(k)) that makes a player 5 levels under clear about 50% with skills, then verifies.

Results are a guide: real players also have runes, refine, sets and drops.
