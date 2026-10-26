const fs = require("fs");
const path = require("path");
const { BreedingEngine } = require("../vendor/yublog/logic.js");

const HOMEBRED_FACTOR_LABELS = [
  "短距離",
  "速力",
  "パワー",
  "底力",
  "長距離",
  "ダート",
  "丈夫さ",
  "早熟型",
  "晩成型",
  "堅実さ",
  "気性難",
];

const OM_LATE = { ノーザンテースト: "efik", オグリキャップ: "faga" };

const GALILEO_NAMES = new Set(["Galileo", "ガリレオ"]);

function loadMasterData(rootDir) {
  const file = path.join(rootDir, "vendor/yublog/masterData.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function createEngine(masterData) {
  return new BreedingEngine(masterData, { ancestorComplete: false });
}

function createHomebredHorse(name, type, stallion, broodmare, masterData) {
  if (
    ![stallion, broodmare].every(
      (horse) =>
        horse &&
        Array.isArray(horse.ANCESTOR) &&
        horse.ANCESTOR.length === 30 &&
        /^[a-o]{4}$/.test(horse.OMOSHIRO)
    )
  ) {
    throw new Error("両親の血統または面白系統のデータが不足しています。");
  }
  const template = masterData[type][0];
  const horse = Object.fromEntries(
    Object.entries(template).map(([key, value]) => [
      key,
      typeof value === "number" ? 0 : typeof value === "string" ? "" : undefined,
    ])
  );
  horse.NAME = name;
  horse.SYSTEM_BIG = stallion.SYSTEM_BIG;
  horse.SYSTEM_LITTELE = stallion.SYSTEM_LITTELE;
  horse.ANCESTOR = [stallion.NAME, broodmare.NAME];
  for (const [start, end] of [[0, 2], [2, 6], [6, 14]]) {
    horse.ANCESTOR.push(
      ...stallion.ANCESTOR.slice(start, end),
      ...broodmare.ANCESTOR.slice(start, end)
    );
  }
  const father = stallion.OMOSHIRO;
  const mother = broodmare.OMOSHIRO;
  const fLate = OM_LATE[stallion.NAME];
  const mLate = OM_LATE[broodmare.NAME];
  horse.OMOSHIRO =
    (fLate ? fLate[0] : father[0]) +
    father[2] +
    (mLate ? mLate[0] : mother[0]) +
    mother[2];
  horse.MIGOTO =
    type === "stallion"
      ? father[1] + father[3] + mother[1] + mother[3]
      : "";
  return horse;
}

function evaluateMating(engine, stallion, broodmare) {
  return engine.evaluate(stallion, broodmare, null);
}

function evalToGenerationRow(result) {
  return {
    完璧: !!result.perfect,
    面白い: !!result.omoshiro,
    見事: !!result.migoto,
    凝った: !!result.kotta,
    ニックス: result.nicks || 0,
    インブリード: result.inbreedList ? [...result.inbreedList] : [],
    合計血量: `${Math.round(result.bloodTotal * 10000) / 100}%`,
    危険: !!result.dangerous,
  };
}

function routeScore(lastGen) {
  if (lastGen.危険) return -1;
  let score = 0;
  if (lastGen.完璧) score += 1000;
  if (lastGen.面白い && lastGen.凝った) score += 800;
  else if (lastGen.面白い) score += 400;
  if (lastGen.見事) score += 300;
  if (lastGen.凝った) score += 200;
  score += (lastGen.ニックス || 0) * 15;
  const blood = parseFloat(String(lastGen.合計血量).replace("%", ""));
  if (!Number.isNaN(blood)) score += blood / 10;
  return score;
}

function formatRouteString(startMare, stallions) {
  let s = startMare;
  for (let i = 0; i < stallions.length; i++) {
    const label = i < stallions.length - 1 ? `娘${i + 1}` : "仔";
    s += ` →(${stallions[i]})→ ${label}`;
  }
  return s;
}

function buildRouteObject(startMare, stallionNames, generations, stallionMap) {
  const 種付け = [...stallionNames];
  const 種付料合計_万円 = 種付け.reduce(
    (sum, name) => sum + (stallionMap.get(name)?.PRICE || 0),
    0
  );
  return {
    route: formatRouteString(startMare, 種付け),
    種付け,
    種付料合計_万円,
    各代: generations,
    score: routeScore(generations[generations.length - 1]),
    finalSire: 種付け[種付け.length - 1],
  };
}

function isGalileoFinish(name) {
  return GALILEO_NAMES.has(name);
}

function rebuildBroodmareAlongRoute(startMare, stallionNames, masterData, stallionMap) {
  let mare = startMare;
  for (const name of stallionNames) {
    const st = stallionMap.get(name);
    if (!st) throw new Error(`Unknown stallion in route: ${name}`);
    mare = createHomebredHorse(
      `__route_${startMare.NAME}_${name}`,
      "broodmare",
      st,
      mare,
      masterData
    );
  }
  return mare;
}

function rankStallionsForBroodmare(broodmare, stallions, engine, options = {}) {
  const topN = options.topN ?? 5;
  const results = [];
  for (const st of stallions) {
    const result = evaluateMating(engine, st, broodmare);
    if (result.dangerous) continue;
    const row = evalToGenerationRow(result);
    results.push({
      name: st.NAME,
      price: st.PRICE ?? 0,
      row,
      score: routeScore(row),
    });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topN);
}

function searchRoutesForMare(mare, stallions, engine, masterData, options = {}) {
  const beamWidth = options.beamWidth ?? 25;
  const maxRoutes = options.maxRoutes ?? 5;
  const minScore = options.minScore ?? 200;
  const stallionMap = new Map(stallions.map((s) => [s.NAME, s]));

  let frontier = [{ mare, gens: [], stallions: [], score: 0 }];

  for (let depth = 0; depth < 3; depth++) {
    const next = [];
    for (const state of frontier) {
      for (const st of stallions) {
        const result = evaluateMating(engine, st, state.mare);
        if (result.dangerous) continue;
        const row = evalToGenerationRow(result);
        const daughter =
          depth < 2
            ? createHomebredHorse(
                `__tmp_${depth}_${state.mare.NAME}_${st.NAME}`,
                "broodmare",
                st,
                state.mare,
                masterData
              )
            : null;
        next.push({
          mare: daughter,
          gens: [...state.gens, row],
          stallions: [...state.stallions, st.NAME],
          score: routeScore(row),
        });
      }
    }
    next.sort((a, b) => b.score - a.score);
    frontier = next.slice(0, beamWidth);
    if (!frontier.length) break;
  }

  const routes = frontier
    .filter((s) => s.stallions.length === 3)
    .map((s) =>
      buildRouteObject(mare.NAME, s.stallions, s.gens, stallionMap)
    )
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score);

  const dedup = new Map();
  for (const r of routes) {
    const key = r.種付け.join(">");
    if (!dedup.has(key) || dedup.get(key).score < r.score) dedup.set(key, r);
  }
  return [...dedup.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxRoutes);
}

module.exports = {
  loadMasterData,
  createEngine,
  createHomebredHorse,
  evaluateMating,
  evalToGenerationRow,
  routeScore,
  searchRoutesForMare,
  buildRouteObject,
  isGalileoFinish,
  rebuildBroodmareAlongRoute,
  rankStallionsForBroodmare,
  GALILEO_NAMES,
};
