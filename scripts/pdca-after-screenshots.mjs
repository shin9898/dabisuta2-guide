import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BASE = "http://127.0.0.1:3456";
const OUT = "/opt/cursor/artifacts/screenshots/pdca-after";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 390, height: 844 });

async function shot(name, pathUrl, action) {
  await page.goto(`${BASE}${pathUrl}`, { waitUntil: "networkidle" });
  if (action) await action(page);
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log(file);
}

await shot("after-cycle1-nav-breadcrumb-m390.png", "/stud/");
await shot("after-cycle2-galileo-filter-m390.png", "/haigo/", async (p) => {
  await p.locator("#galileo-routes").scrollIntoViewIfNeeded();
  await p.fill("#galileo-mare-filter", "ドバイマジェスティ");
  await p.waitForTimeout(200);
});
await shot("after-cycle2-stud-filter-dirt-m390.png", "/stud/", async (p) => {
  await p.selectOption("#horse-dirt", "○");
  await p.fill("#horse-search", "");
  await p.waitForTimeout(200);
});
await shot("after-cycle3-strong-case-compare-m390.png", "/haigo/", async (p) => {
  await p.locator(".case-card", { hasText: "ペンネニルヴァーナ" }).scrollIntoViewIfNeeded();
});
await shot("after-cycle3-calculator-combobox-m390.png", "/calculator/", async (p) => {
  await p.waitForTimeout(1200);
});
await shot("after-cycle3-dubai-routes-m390.png", `/stud/${encodeURIComponent("ドバイマジェスティ")}/`);

await browser.close();
