import { chromium } from "playwright";
import path from "path";

const BASE = "http://127.0.0.1:3456";
const OUT = "/opt/cursor/artifacts/screenshots";

const pages = [
  { slug: "top", path: "/", name: "トップ" },
  { slug: "haigo", path: "/haigo/", name: "配合" },
  { slug: "stud", path: "/stud/", name: "種牡馬" },
  { slug: "ikusei", path: "/ikusei/", name: "育成" },
  { slug: "ranch", path: "/ranch/", name: "牧場" },
  { slug: "bc", path: "/bc/", name: "BC" },
  { slug: "zen", path: "/zen/", name: "前作" },
];

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

for (const p of pages) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}${p.path}`, { waitUntil: "networkidle" });
  await page.screenshot({
    path: path.join(OUT, `mobile-${p.slug}-390.png`),
    fullPage: true,
  });
  console.log(`mobile-${p.slug}-390.png`);
}

await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.screenshot({
  path: path.join(OUT, "desktop-top-1280.png"),
  fullPage: true,
});
console.log("desktop-top-1280.png");

await browser.close();
