const categoriesMeta = require("./horse_categories.json");

/** URL path segment and output directory name (Unicode). Do not use encodeURIComponent — static hosts decode URLs to Unicode paths. */
function horseSlug(name) {
  if (!name) return "unknown";
  return String(name)
    .trim()
    .replace(/[/\\?#]/g, "")
    .replace(/\s+/g, " ");
}

function categorizeAchievement(text) {
  if (!text) return ["その他"];
  const cats = new Set();
  for (const [cat, keywords] of Object.entries(categoriesMeta.rules)) {
    if (keywords.some((kw) => text.includes(kw))) {
      cats.add(cat);
    }
  }
  if (cats.size === 0) cats.add("その他");
  return categoriesMeta.order.filter((c) => cats.has(c));
}

function formatToolLabels(tool) {
  if (!tool) return "計算データなし";
  const parts = [];
  if (tool.完璧) parts.push("完璧");
  if (tool.面白い) {
    parts.push(tool.面白判定可否 ? "面白" : "面白(判定不可)");
  } else if (tool.面白判定可否 === false) {
    parts.push("面白×");
  }
  if (tool.見事) {
    parts.push(tool.見事判定可否 ? "見事" : "見事(判定不可)");
  } else if (tool.見事判定可否 === false) {
    parts.push("見事×");
  }
  if (tool.凝った) parts.push("凝った");
  if (tool.ニックス > 0) parts.push(`ニックス★${tool.ニックス}`);
  return parts.length ? parts.join("・") : "（ラベルなし）";
}

function formatSourceLabels(labelText) {
  if (!labelText) return "（出典にラベル記載なし）";
  return labelText;
}

function buildHorses(stats) {
  const stallions = (stats.種牡馬 || []).map((h) => ({
    ...h,
    horseType: "stallion",
    horseTypeJa: "種牡馬",
    slug: horseSlug(h.名前),
  }));
  const mares = (stats.繁殖牝馬 || []).map((h) => ({
    ...h,
    horseType: "mare",
    horseTypeJa: "繁殖牝馬",
    slug: horseSlug(h.名前),
  }));
  return [...stallions, ...mares].sort((a, b) =>
    a.名前.localeCompare(b.名前, "ja")
  );
}

function routesForHorse(routes, horse) {
  if (horse.horseType === "stallion") {
    return routes.種牡馬終点?.[horse.名前] || [];
  }
  return routes.繁殖牝馬起点?.[horse.名前] || [];
}

function routeSummary(route) {
  const last = route.各代?.[route.各代.length - 1];
  if (!last) return "不明";
  if (last.完璧) return "完璧";
  if (last.面白い && last.凝った) return "面白+凝った";
  if (last.面白い) return "面白";
  if (last.見事) return "見事";
  return "その他";
}

module.exports = {
  horseSlug,
  categorizeAchievement,
  formatToolLabels,
  formatSourceLabels,
  buildHorses,
  routesForHorse,
  routeSummary,
  categoryOrder: categoriesMeta.order,
};
