#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const {
  loadMasterData,
  createEngine,
  createHomebredHorse,
  evaluateMating,
  evalToGenerationRow,
  routeScore,
  buildRouteObject,
  searchRoutesForMare,
  isGalileoFinish,
  rebuildBroodmareAlongRoute,
  rankStallionsForBroodmare,
} = require("./breeding-lib.cjs");

const TOP_FILLY_CROSS = 5;

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "src/_data/computed_routes.json");

const BEAM_WIDTH = 25;
const MAX_ROUTES_PER_MARE = 5;
const MAX_GALILEO_PER_MARE = 3;
const MIN_SCORE = 200;
const TYPICAL_MARE_COUNT = 30;

function searchGalileoRoutes(mare, stallions, engine, masterData, galileo) {
  const stallionMap = new Map(stallions.map((s) => [s.NAME, s]));
  let frontier = [{ mare, gens: [], stallions: [] }];

  for (let depth = 0; depth < 2; depth++) {
    const next = [];
    for (const state of frontier) {
      for (const st of stallions) {
        const result = evaluateMating(engine, st, state.mare);
        if (result.dangerous) continue;
        const row = evalToGenerationRow(result);
        const daughter = createHomebredHorse(
          `__g_${depth}_${state.mare.NAME}_${st.NAME}`,
          "broodmare",
          st,
          state.mare,
          masterData
        );
        next.push({
          mare: daughter,
          gens: [...state.gens, row],
          stallions: [...state.stallions, st.NAME],
        });
      }
    }
    next.sort((a, b) => routeScore(b.gens[b.gens.length - 1]) - routeScore(a.gens[a.gens.length - 1]));
    frontier = next.slice(0, BEAM_WIDTH);
  }

  const routes = [];
  for (const state of frontier) {
    const result = evaluateMating(engine, galileo, state.mare);
    if (result.dangerous) continue;
    const row = evalToGenerationRow(result);
    const stallionNames = [...state.stallions, galileo.NAME];
    const gens = [...state.gens, row];
    const route = buildRouteObject(mare.NAME, stallionNames, gens, stallionMap);
    if (route.score >= MIN_SCORE || row.完璧 || (row.面白い && row.凝った)) {
      routes.push(route);
    }
  }
  return routes
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_GALILEO_PER_MARE);
}

function stripInternal(route) {
  const { score, finalSire, ...rest } = route;
  return { ...rest, _score: score, _finalSire: finalSire };
}

function main() {
  const master = loadMasterData(ROOT);
  const engine = createEngine(master);
  const stallions = master.stallion;
  const broodmares = master.broodmare;
  const galileo = stallions.find((s) => s.NAME === "Galileo");
  if (!galileo) throw new Error("Galileo not in master data");

  const byMare = {};
  const galileoByMare = {};
  const galileoFillyCrossByMare = {};
  const byStallionEnd = {};
  const stallionMap = new Map(stallions.map((s) => [s.NAME, s]));
  const mareByName = new Map(broodmares.map((m) => [m.NAME, m]));

  const t0 = Date.now();
  const tCross0 = Date.now();
  for (let i = 0; i < broodmares.length; i++) {
    const mare = broodmares[i];
    const routes = searchRoutesForMare(mare, stallions, engine, master, {
      beamWidth: BEAM_WIDTH,
      maxRoutes: MAX_ROUTES_PER_MARE,
      minScore: MIN_SCORE,
    });
    byMare[mare.NAME] = routes.map(stripInternal);

    const gRoutes = searchGalileoRoutes(mare, stallions, engine, master, galileo);
    if (gRoutes.length) galileoByMare[mare.NAME] = gRoutes.map(stripInternal);

    for (const r of routes) {
      const end = r.finalSire;
      if (!byStallionEnd[end]) byStallionEnd[end] = [];
      byStallionEnd[end].push({ ...stripInternal(r), _startMare: mare.NAME });
    }
    if ((i + 1) % 50 === 0) {
      console.log(`  ${i + 1}/${broodmares.length} mares...`);
    }
  }

  let fillyCrossPerfect = 0;
  for (const [mareName, routes] of Object.entries(galileoByMare)) {
    if (!routes.length) continue;
    const best = [...routes].sort((a, b) => (b._score || 0) - (a._score || 0))[0];
    const startMare = mareByName.get(mareName);
    if (!startMare || !best.種付け?.length) continue;
    try {
      const filly = rebuildBroodmareAlongRoute(
        startMare,
        best.種付け,
        master,
        stallionMap
      );
      const ranked = rankStallionsForBroodmare(filly, stallions, engine, {
        topN: TOP_FILLY_CROSS,
      });
      if (!ranked.length) continue;
      const hasPerfect = ranked.some((c) => c.row.完璧);
      if (hasPerfect) fillyCrossPerfect++;
      galileoFillyCrossByMare[mareName] = {
        基準ルート_種付け: best.種付け,
        基準ルートスコア: best._score || 0,
        ガリレオ牝馬: `自家製_${mareName}_Galileo牝`,
        候補: ranked.map((c) => ({
          種牡馬: c.name,
          種付料_万円: c.price,
          評価: c.row,
          _score: c.score,
        })),
      };
    } catch (err) {
      console.warn("Galileo filly cross skipped:", mareName, err.message);
    }
  }
  const fillyCrossMs = Date.now() - tCross0;

  for (const s of stallions) {
    if (!byStallionEnd[s.NAME]) byStallionEnd[s.NAME] = [];
    byStallionEnd[s.NAME].sort((a, b) => (b._score || 0) - (a._score || 0));
    byStallionEnd[s.NAME] = byStallionEnd[s.NAME].slice(0, MAX_ROUTES_PER_MARE);
  }

  const horsesStats = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src/_data/horses_stats.json"), "utf8")
  );
  const lineMap = new Map();
  for (const s of horsesStats.種牡馬) {
    lineMap.set(s.名前, s.系統 || "不明");
  }

  const typicalMares = [...horsesStats.繁殖牝馬]
    .sort((a, b) => (b.価格_万円 || 0) - (a.価格_万円 || 0))
    .slice(0, TYPICAL_MARE_COUNT)
    .map((m) => m.名前);

  const lineStats = {};
  for (const mareName of typicalMares) {
    const routes = byMare[mareName] || [];
    for (const r of routes) {
      const sire = r._finalSire || r.種付け?.[r.種付け.length - 1];
      const line = lineMap.get(sire) || "不明";
      if (!lineStats[line]) lineStats[line] = { count: 0, scoreSum: 0, perfect: 0 };
      lineStats[line].count++;
      lineStats[line].scoreSum += r._score || 0;
      const last = r.各代?.[r.各代.length - 1];
      if (last?.完璧) lineStats[line].perfect++;
    }
  }
  const lineRanking = Object.entries(lineStats)
    .map(([line, v]) => ({
      系統: line,
      ルート件数: v.count,
      平均スコア: Math.round((v.scoreSum / v.count) * 10) / 10,
      完璧終点: v.perfect,
    }))
    .sort((a, b) => b.平均スコア - a.平均スコア || b.ルート件数 - a.ルート件数);

  const maresWithRoutes = Object.values(byMare).filter((a) => a.length).length;
  const galileoMares = Object.keys(galileoByMare).length;

  const output = {
    注記:
      "湯一路(ds2.yublog.com)公開の logic.js + masterData を Node で再現。ゲーム内未検証。",
    探索方法: {
      世代: 3,
      ビーム幅: BEAM_WIDTH,
      各繁殖牝馬の上位: MAX_ROUTES_PER_MARE,
      ガリレオ終点の上位: MAX_GALILEO_PER_MARE,
      最小スコア: MIN_SCORE,
      危険配合: "logic.js の dangerous 判定で除外",
      説明:
        "各代で全種牡馬(237)を試し、中間牝馬はスコア上位のみビーム幅25で残す。最終代の評価でランク付け。",
    },
    生成日時: new Date().toISOString(),
    統計: {
      繁殖牝馬数: broodmares.length,
      ルートが1件以上の繁殖牝馬: maresWithRoutes,
      ガリレオ終点ルートがある繁殖牝馬: galileoMares,
      ガリレオ牝馬_次配合を計算した繁殖牝馬: Object.keys(galileoFillyCrossByMare).length,
      ガリレオ牝馬_次配合で完璧が上位候補に含まれる繁殖牝馬: fillyCrossPerfect,
      ガリレオ牝馬_次配合計算時間_ms: fillyCrossMs,
      種牡馬終点数: Object.keys(byStallionEnd).length,
      計算時間_ms: Date.now() - t0,
    },
    繁殖牝馬起点: byMare,
    種牡馬終点: byStallionEnd,
    ガリレオ終点_繁殖牝馬起点: galileoByMare,
    ガリレオ牝馬への次配合: galileoFillyCrossByMare,
    ガリレオ牝馬への次配合_注記:
      "各繁殖牝馬の最良ガリレオ終点3代ルートを辿って自家製ガリレオ牝馬を仮定し、全種牡馬との1回配合を湯一路 logic.js で評価（危険除外）。中間牝馬はすべて自家製想定。",
    大系統ランキング_典型牝馬: {
      典型牝馬の定義: `価格上位${TYPICAL_MARE_COUNT}頭（horses_stats 繁殖牝馬）`,
      集計: "各ルートの終点種牡馬の系統（horses_stats の「系統」）で集計",
      ランキング: lineRanking,
    },
  };

  fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log("Wrote", OUT);
  console.log(JSON.stringify(output.統計, null, 2));
}

main();
