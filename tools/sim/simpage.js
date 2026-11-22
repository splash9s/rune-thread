// Runs inside the real game page. Calls the game's own combat functions on a simulated clock.
// Only stage transitions, potions and the reference player setup are done here.
(function () {
    const noop = () => {};
    // Silence UI and side effects (only rendering / sound / saving)
    ['logMessage', 'showCombatText', 'playSfx', 'updateUI', 'saveGame', 'showModal', 'playAtkFx', 'playCritFx', 'playHeavyFx',
     'playBoltFx', 'showBossBalloon', 'showGroundDrop', 'setMusicTrack', 'playLevelUpFx', 'playPlayerFallAnim', 'checkGuideLowHp',
     'floatFailAt', 'showFloatNotice', 'stageFadeIn', 'stageFadeSet', 'cloudSaveSoon', 'updateQuestProgress', 'checkLevelUps',
     'renderBattleLog', 'showResultItemDetail'].forEach(n => { try { if (typeof window[n] === 'function') window[n] = noop; } catch (e) {} });

    let T = 1e12;
    Date.now = () => T;
    let stageDone = false;
    window.onStageCleared = () => { stageDone = true; };

    // Class level reached at a base level, from the game's own EXP curves and the monsters' EXP ratio
    function jobLvFor(L, jobRatio) {
        let baseTotal = 0;
        for (let l = 1; l < L; l++) baseTotal += baseExpNeed(l);
        let job = baseTotal * jobRatio, j = 1;
        while (j < MAX_CLASS_LV && job >= jobExpNeed(j)) { job -= jobExpNeed(j); j++; }
        return j;
    }
    function monsterJobRatio() {
        let b = 0, jx = 0;
        Object.values(GAME_DATA.paths.earth.maps).forEach(m => (m.enemies || []).forEach(e => { b += e.baseExp || 0; jx += e.jobExp || 0; }));
        return b ? jx / b : 1;
    }

    // Best shop gear for the level: per slot, the item with the highest level requirement <= L (plain, no buffs)
    function bestShopGear(L) {
        const best = {};
        SHOP_ARMORY_ITEMS.forEach(t => {
            if (!t.slot || (t.levelReq || 1) > L) return;
            const cur = best[t.slot];
            if (!cur || (t.levelReq || 1) >= (cur.levelReq || 1)) best[t.slot] = t;
        });
        const eq = {};
        Object.entries(best).forEach(([slot, t]) => { const it = generatePoEItem(t, 1, 0); it.buffs = []; it.debuffs = []; it.refineLevel = 0; eq[slot] = it; });
        return eq;
    }

    // Reference skill build: Berserker first (tiers in order, then the capstone), then Mithril, then Skofnung
    function skillBuild(points) {
        const taken = [];
        const set = new Set();
        const order = [];
        ['ber', 'mit', 'sko', 'arc'].forEach(k => {
            const br = SKILL_BRANCHES.find(b => b.key === k);
            br.tiers.forEach((row, t) => row.forEach((_, i) => order.push(`${k}${t + 1}_${i}`)));
            order.push(`${k}Cap`);
        });
        let guard = 0;
        while (taken.length < points && guard++ < 500) {
            const next = order.find(id => !set.has(id) && skillCanTake(id, set));
            if (!next) break;
            taken.push(next); set.add(next);
        }
        return taken;
    }

    function setupPlayer(L, opts) {
        player.baseLv = L;
        player.jobLv = opts.jobLv != null ? opts.jobLv : jobLvFor(L, opts.jobRatio);
        const pts = 5 + 3 * (L - 1);
        const st = { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 };
        const split = { str: 0.4, vit: 0.3, agi: 0.15, dex: 0.15 };
        let used = 0;
        Object.entries(split).forEach(([k, f]) => { const n = Math.floor(pts * f); st[k] = Math.min(STAT_MAX, 1 + n); used += n; });
        st.str = Math.min(STAT_MAX, st.str + (pts - used));
        player.stats = st;
        player.statPoints = 0;
        player.equipped = Object.assign(bestShopGear(L), { potionSlot: null });
        player.skillTree = { v: 1, taken: opts.skills ? skillBuild(player.jobLv) : [] };
        syncSkillPoints();
        player.runes = defaultRunes();
        player.currentRunRunes = [];
        player.resurrectionPotions = 0;
        player.resurrectionOn = false;
        player.battleSpeed = 1;
        player.vipUntil = 0;
    }

    function runOnce(L, mapKey, opts) {
        setupPlayer(L, opts);
        resetMapRunes();
        player.mhpCarry = 1;
        player.mhpStart = maxHpCounts();
        player.angelUsedThisRun = false;
        currentMode = 'campaign';
        currentEvent = null;
        currentPath = opts.path || 'earth';
        activeMap = GAME_DATA.paths[currentPath].maps[mapKey];
        currentStage = 1;
        maxStages = activeMap.maxStages;
        attackCount = 0;
        stageClearing = false;
        combatPaused = false;
        towerParty = null;
        const d0 = getDerivedStats();
        player.hp = d0.maxHp;
        player.armor = d0.maxArmor;
        let potions = opts.potions == null ? 5 : opts.potions;
        const speed = 1.2;
        const monMs = COMBAT_MONSTER_MS / speed;
        const startStage = () => {
            stageDone = false;
            monsterOpenerRound = true;
            spawnStageMonsters();
            const d = getDerivedStats();
            const pMs = Math.max(400, 2000 - d.aspd * 10) / speed;
            T += 3000;
            return { pMs, tP: T + pMs, tM: T + monMs };
        };
        let s = startStage();
        const tEnd = T + (opts.stallMin || 60) * 60 * 1000; // fight time cap: a stalemate counts as a fail
        while (true) {
            if (s.tP <= s.tM) { T = s.tP; runCombatTick(); s.tP += s.pMs; }
            else {
                T = s.tM; monsterTurnTick(); s.tM += monMs;
                const mx = getDerivedStats().maxHp;
                if (player.hp > 0 && player.hp < mx * 0.35 && potions > 0) {
                    potions--;
                    player.hp = Math.min(mx, player.hp + Math.max(500, Math.floor(mx * 0.2)));
                }
            }
            if (player.hp <= 0) return { cleared: false, stage: currentStage, of: maxStages };
            if (stageDone || (monstersList.length && getAliveMonsters().length === 0)) {
                monstersList.forEach(m => { if (m.hp <= 0 && !m.rewarded) awardKill(m); });
                healPlayer(Math.ceil(getDerivedStats().maxHp * 0.1), 'stage');
                currentStage++;
                if (currentStage > maxStages) return { cleared: true, stage: maxStages, of: maxStages };
                s = startStage();
            }
            if (T > tEnd) return { cleared: false, stage: currentStage, of: maxStages, stalemate: true };
        }
    }

    window.SIM = {
        jobRatio: null,
        info(L) { if (this.jobRatio == null) this.jobRatio = monsterJobRatio(); return { jobLv: jobLvFor(L, this.jobRatio), jobRatio: this.jobRatio }; },
        // n runs of player level L on map mapKey; returns clear rate and average stage reached
        batch(L, mapKey, n, opts = {}) {
            if (this.jobRatio == null) this.jobRatio = monsterJobRatio();
            const o = Object.assign({ jobRatio: this.jobRatio }, opts);
            let clears = 0, stageSum = 0, stalemates = 0, of = 0;
            for (let i = 0; i < n; i++) {
                const r = runOnce(L, mapKey, o);
                if (r.cleared) clears++;
                if (r.stalemate) stalemates++;
                stageSum += r.stage; of = r.of;
            }
            return { L, mapKey, n, clear: clears / n, avgStage: +(stageSum / n).toFixed(1), of, stalemates, jobLv: player.jobLv, skills: skillTakenList().length };
        }
    };
})();
