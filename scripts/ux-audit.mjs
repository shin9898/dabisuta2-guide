import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BASE = process.env.BASE || "http://127.0.0.1:3456";
const OUT = process.env.OUT || "/opt/cursor/artifacts/screenshots/pdca-before";
fs.mkdirSync(OUT, { recursive: true });

async function shot(page, name, fullPage = true) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage });
  console.log("saved", file);
  return file;
}

const browser = await chromium.launch();
for (const vp of [
  { w: 390, h: 844, tag: "m390" },
  { w: 1280, h: 800, tag: "d1280" },
]) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: vp.w, height: vp.h });

  await page.goto(`${BASE}/haigo/`, { waitUntil: "networkidle" });
  await page.locator("#galileo-routes").scrollIntoViewIfNeeded();
  await shot(page, `cycle0-haigo-galileo-${vp.tag}.png`, vp.w === 390);

  await page.goto(`${BASE}/stud/`, { waitUntil: "networkidle" });
  await page.fill("#horse-search", "ドバイ");
  await page.waitForTimeout(200);
  await shot(page, `cycle0-stud-filter-${vp.tag}.png`);

  await page.goto(`${BASE}/haigo/`, { waitUntil: "networkidle" });
  await page.locator(".case-card").first().scrollIntoViewIfNeeded();
  await shot(page, `cycle0-strong-case-${vp.tag}.png`);

  await page.goto(`${BASE}/calculator/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shot(page, `cycle0-calculator-${vp.tag}.png`);

  await page.goto(
    `${BASE}/stud/${encodeURIComponent("ドバイマジェスティ")}/`,
    { waitUntil: "networkidle" }
  );
  await shot(page, `cycle0-dubai-page-${vp.tag}.png`);

  await page.close();
}
await browser.close();
