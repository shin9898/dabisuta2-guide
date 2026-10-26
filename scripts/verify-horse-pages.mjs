import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { buildHorses } = require("../src/_data/horse-utils.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const stats = JSON.parse(
  fs.readFileSync(path.join(root, "src/_data/horses_stats.json"), "utf8")
);
const siteDir = path.join(root, "_site", "stud");

const horses = buildHorses(stats);
const missing = [];

for (const horse of horses) {
  const pagePath = path.join(siteDir, horse.slug, "index.html");
  if (!fs.existsSync(pagePath)) {
    missing.push({ name: horse.名前, slug: horse.slug, expected: pagePath });
  }
}

const listHtml = path.join(root, "_site", "stud", "index.html");
if (!fs.existsSync(listHtml)) {
  console.error("Missing stud list page:", listHtml);
  process.exit(1);
}

if (missing.length) {
  console.error(`Missing ${missing.length} horse page(s):`);
  for (const m of missing.slice(0, 20)) {
    console.error(`  - ${m.name} (${m.slug})`);
  }
  if (missing.length > 20) {
    console.error(`  ... and ${missing.length - 20} more`);
  }
  process.exit(1);
}

let linkErrors = 0;
for (const horse of horses) {
  const pagePath = path.join(siteDir, horse.slug, "index.html");
  const encodedPath = path.join(
    siteDir,
    ...horse.slug.split("/").map((seg) => seg),
    "index.html"
  );
  if (!fs.existsSync(pagePath) && pagePath !== encodedPath) {
    linkErrors++;
  }
  const hrefSlug = encodeURIComponent(horse.slug);
  if (hrefSlug !== horse.slug && !fs.existsSync(pagePath)) {
    console.error("List link would 404:", horse.名前, hrefSlug);
    linkErrors++;
  }
}

if (linkErrors) process.exit(1);

console.log(`OK: ${horses.length} horse pages present under _site/stud/<name>/index.html`);
console.log(`List links use encodeURIComponent(slug); slugs are Unicode path segments.`);
