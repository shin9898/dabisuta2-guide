const fs = require("fs");
const path = require("path");
const markdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");
const markdownItToc = require("markdown-it-toc-done-right");
const horseUtils = require("./src/_data/horse-utils.js");

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

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");

  eleventyConfig.addCollection("newsSorted", () =>
    [...newsData].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  );

  const horses = horseUtils.buildHorses(horsesStats);
  horses.forEach((h) => {
    h.routeSets = horseUtils.routesForHorse(routesData, h);
  });

  const galileoRoutesFlat = [];
  for (const [mareName, routes] of Object.entries(
    routesData.ガリレオ終点_繁殖牝馬起点 || {}
  )) {
    for (const r of routes) {
      galileoRoutesFlat.push({
        mareName,
        route: r,
        score: r._score || 0,
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
        return "label-verified";
      case "前作の情報":
        return "label-prev";
      case "ツールの計算値（ゲーム内未検証）":
        return "label-tool";
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
