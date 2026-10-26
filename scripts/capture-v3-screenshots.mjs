import { chromium } from "playwright";
import path from "path";

const BASE = "http://127.0.0.1:3456";
const OUT = "/opt/cursor/artifacts/screenshots";

const pages = [
  { file: "mobile-haigo-galileo-section-390.png", path: "/haigo/", hash: "#galileo-routes" },
  { file: "mobile-stud-galileo-page-390.png", path: "/stud/Galileo/" },
  { file: "mobile-sire-lines-390.png", path: "/sire-lines/" },
  { file: "mobile-calculator-example-390.png", path: "/calculator/" },
];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 390, height: 844 });

for (const p of pages) {
  await page.goto(`${BASE}${p.path}${p.hash || ""}`, { waitUntil: "networkidle" });
  if (p.hash) {
    await page.locator(p.hash).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  }
  await page.screenshot({
    path: path.join(OUT, p.file),
    fullPage: !p.hash,
  });
  console.log(p.file);
}

await browser.close();
