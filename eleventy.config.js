const fs = require("fs");
const path = require("path");
const markdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");
const markdownItToc = require("markdown-it-toc-done-right");
const horseUtils = require("./src/_data/horse-utils.js");
const sireLineUtils = require("./src/_data/sire-line-utils.js");
const sireLineColors = require("./src/_data/sire_line_colors.json");

const masterDataPath = path.join(__dirname, "vendor/yublog/masterData.json");
const masterData = JSON.parse(fs.readFileSync(masterDataPath, "utf8"));
const horseLineMap = sireLineUtils.buildHorseLineMap(masterData);

const newsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "src/_data/news.json"), "utf8")
);
const strongHorsesData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "src/_data/strong_horses.json"), "utf8")
);
const horsesStats = JSON.parse(
  fs.readFileSync(path.join(__dirname, "src/_data/horses_stats.json"), "utf8")
);
const computedRoutesPath = path.join(
  __dirname,
  "src/_data/computed_routes.json"
);
const routesData = fs.existsSync(computedRoutesPath)
  ? JSON.parse(fs.readFileSync(computedRoutesPath, "utf8"))
  : { 繁殖牝馬起点: {}, 種牡馬終点: {}, ガリレオ終点_繁殖牝馬起点: {} };

const imageCreditsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "src/_data/image_credits.json"), "utf8")
);
const imageCreditsById = Object.fromEntries(
  imageCreditsData.images.map((img) => [img.id, img])
);

const gameUpdatesData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "src/_data/game_updates.json"), "utf8")
);

const rotationSamplesData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "src/_data/rotation_samples.json"), "utf8")
);
const rotationOverseasUi = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "src/_data/rotation_overseas_ui.json"),
    "utf8"
  )
);

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");

  eleventyConfig.addGlobalData("image_credits", imageCreditsData);
  eleventyConfig.addGlobalData("imageCreditsById", imageCreditsById);
  eleventyConfig.addGlobalData("game_updates", gameUpdatesData);
  eleventyConfig.addGlobalData("rotation_samples", rotationSamplesData);
  eleventyConfig.addGlobalData("rotation_overseas_ui", rotationOverseasUi);

  eleventyConfig.addCollection("newsSorted", () =>
    [...newsData].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  );

  let horses = horseUtils.buildHorses(horsesStats).map((h) =>
    sireLineUtils.enrichHorseLine(h, horseLineMap)
  );
  horses.forEach((h) => {
    h.routeSets = horseUtils.routesForHorse(routesData, h);
  });

  const sireLineLegend = Object.entries(sireLineColors.系統).map(
    ([code, meta]) => ({ code, ...meta })
  );
  const sireLineFilterOptions = [...new Set(horses.map((h) => h.lineCode).filter(Boolean))].sort();

  eleventyConfig.addGlobalData("horseLineMap", horseLineMap);
  eleventyConfig.addGlobalData("sire_line_colors", sireLineColors);
  eleventyConfig.addGlobalData("sireLineLegend", sireLineLegend);
  eleventyConfig.addGlobalData("sireLineFilterOptions", sireLineFilterOptions);

  eleventyConfig.on("eleventy.before", () => {
    const cssLines = [
      "/* Generated from src/_data/sire_line_colors.json — do not edit */",
      `/* Source: ${sireLineColors.出典URL} */`,
    ];
    for (const [code, meta] of Object.entries(sireLineColors.系統)) {
      cssLines.push(
        `.line-${code}{--line-bg:${meta.背景};--line-fg:${meta.文字};--line-border:${meta.枠};}`,
        `.line-row-${code}{border-left:4px solid ${meta.枠};}`,
        `.route-chain-node.line-${code}{background:${meta.背景};color:${meta.文字};border-color:${meta.枠};}`
      );
    }
    cssLines.push(
      ".line-unknown{--line-bg:#e5e7eb;--line-fg:#1a1a1a;--line-border:#9ca3af;}"
    );
    fs.writeFileSync(
      path.join(__dirname, "src/assets/css/sire-line-colors.css"),
      cssLines.join("\n") + "\n"
    );
    fs.writeFileSync(
      path.join(__dirname, "src/assets/data/horse-lines.json"),
      JSON.stringify(horseLineMap)
    );
  });

  const galileoRoutesFlat = [];
  for (const [mareName, routes] of Object.entries(
    routesData.ガリレオ終点_繁殖牝馬起点 || {}
  )) {
    const sorted = [...routes].sort(
      (a, b) => (b._score || 0) - (a._score || 0)
    );
    const bestScore = sorted[0]?._score ?? 0;
    const cross = routesData.ガリレオ牝馬への次配合?.[mareName] || null;
    for (const r of routes) {
      const isBest = (r._score || 0) === bestScore;
      galileoRoutesFlat.push({
        mareName,
        route: r,
        score: r._score || 0,
        isBestGalileoRoute: isBest,
        fillyCross: isBest ? cross : null,
      });
    }
  }
  galileoRoutesFlat.sort((a, b) => b.score - a.score);

  eleventyConfig.addGlobalData("computedRoutes", routesData);
  eleventyConfig.addGlobalData("galileoRoutesFlat", galileoRoutesFlat);

  const stallionsByLine = {};
  for (const h of horses) {
    if (h.horseType !== "stallion") continue;
    const line = h.系統 || "不明";
    if (!stallionsByLine[line]) stallionsByLine[line] = [];
    stallionsByLine[line].push(h.名前);
  }
  for (const line of Object.keys(stallionsByLine)) {
    stallionsByLine[line].sort((a, b) => a.localeCompare(b, "ja"));
  }
  eleventyConfig.addGlobalData(
    "stallionsByLine",
    Object.entries(stallionsByLine).sort((a, b) => a[0].localeCompare(b[0], "ja"))
  );

  eleventyConfig.addCollection("horses", () => horses);

  eleventyConfig.addCollection("horsesListJson", () =>
    horses.map((h) => ({
      slug: h.slug,
      name: h.名前,
      type: h.horseType,
      typeJa: h.horseTypeJa,
      dirt: h.ダート || "",
      growth: h.成長型 || "",
      fee: h.種付料_万円 ?? null,
      price: h.価格_万円 ?? null,
      lineCode: h.lineCode || "",
      lineDisplay: h.lineDisplay || "",
    }))
  );

  const strongCases = (strongHorsesData.事例 || []).map((c) => ({
    ...c,
    categories: horseUtils.categorizeAchievement(c.実績),
  }));

  eleventyConfig.addCollection("strongCases", () => strongCases);

  const strongCasesByCategory = {};
  for (const cat of horseUtils.categoryOrder) {
    strongCasesByCategory[cat] = strongCases.filter((c) =>
      c.categories.includes(cat)
    );
  }
  eleventyConfig.addGlobalData("strongCasesByCategory", strongCasesByCategory);

  const md = markdownIt({
    html: true,
    linkify: true,
    typographer: true,
  })
    .use(markdownItAnchor, {
      permalink: markdownItAnchor.permalink.headerLink({
        class: "heading-anchor",
        symbol: "¶",
      }),
      slugify: (s) =>
        encodeURIComponent(
          s
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^\w\u3040-\u30ff\u3400-\u9fff\-]/g, "")
        ),
    })
    .use(markdownItToc, {
      containerClass: "toc",
      listClass: "toc-list",
      listType: "ul",
      level: [2, 3],
      containerHeaderHtml: '<p class="toc-title">目次</p>',
    });

  eleventyConfig.setLibrary("md", md);

  eleventyConfig.addFilter("formatDateJa", (dateStr) => {
    if (!dateStr) return "不明";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Tokyo",
    });
  });

  eleventyConfig.addFilter("labelClass", (label) => {
    switch (label) {
      case "ダビスタ2で確認済み":
      case "公式":
        return "label-verified";
      case "前作の情報":
        return "label-prev";
      case "ツールの計算値（ゲーム内未検証）":
        return "label-tool";
      case "未確認":
      case "未確認（推定）":
        return "label-unknown";
      case "未確認（自分の牧場の実例）":
        return "label-unknown";
      default:
        return "label-unknown";
    }
  });

  eleventyConfig.addFilter("horseSlug", (name) => horseUtils.horseSlug(name));
  eleventyConfig.addFilter("formatToolLabels", (tool) =>
    horseUtils.formatToolLabels(tool)
  );
  eleventyConfig.addFilter("formatSourceLabels", (text) =>
    horseUtils.formatSourceLabels(text)
  );
  eleventyConfig.addFilter("routeSummary", (route) =>
    horseUtils.routeSummary(route)
  );
  eleventyConfig.addFilter("json", (value) => JSON.stringify(value));
  eleventyConfig.addFilter("join", (arr, sep = "、") =>
    Array.isArray(arr) ? arr.join(sep) : ""
  );
  eleventyConfig.addFilter("lineCodeFromStats", (line) => {
    if (!line || typeof line !== "string") return "";
    const idx = line.indexOf("/");
    return idx === -1 ? line : line.slice(0, idx);
  });
  eleventyConfig.addFilter("lineLittleFromStats", (line) => {
    if (!line || typeof line !== "string") return "";
    const idx = line.indexOf("/");
    return idx === -1 ? "" : line.slice(idx + 1);
  });

  eleventyConfig.addFilter("routeStart", (route) => {
    if (!route || typeof route !== "string") return "—";
    const idx = route.indexOf(" →");
    return idx === -1 ? route : route.slice(0, idx);
  });

  const pathPrefix =
    process.env.ELEVENTY_PATH_PREFIX ||
    process.env.PATH_PREFIX ||
    "/";

  return {
    pathPrefix,
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["md", "njk", "html"],
  };
};
