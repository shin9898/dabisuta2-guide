import { chromium } from "playwright";
import path from "path";

const BASE = "http://127.0.0.1:3456";
const OUT = "/opt/cursor/artifacts/screenshots";

const pages = [
  { file: "mobile-haigo-v2-390.png", path: "/haigo/" },
  { file: "mobile-stud-list-390.png", path: "/stud/" },
  { file: "mobile-stud-galileo-390.png", path: "/stud/Galileo/" },
  {
    file: "mobile-stud-dubaimajesty-390.png",
    path: "/stud/" + encodeURIComponent("ドバイマジェスティ") + "/",
  },
];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 390, height: 844 });

for (const p of pages) {
  await page.goto(`${BASE}${p.path}`, { waitUntil: "networkidle" });
  await page.screenshot({
    path: path.join(OUT, p.file),
    fullPage: true,
  });
  console.log(p.file);
}

await browser.close();
