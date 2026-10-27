/**
 * Round 2 pages (outside main 7): save PNGs under docs/brushup/round2/
 */
import { chromium } from "playwright";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const BASE = "http://127.0.0.1:3456";
const OUT = path.join(process.cwd(), "docs/brushup/round2");

const PAGES = [
  { slug: "stud", path: "/stud/" },
  { slug: "calculator", path: "/calculator/" },
  { slug: "ranch", path: "/ranch/" },
  { slug: "sire-lines", path: "/sire-lines/" },
  { slug: "homebred-stallion", path: "/homebred-stallion/" },
  { slug: "bc", path: "/bc/" },
  { slug: "zen", path: "/zen/" },
  {
    slug: "horse-dubai-majesty",
    path: `/stud/${encodeURIComponent("ドバイマジェスティ")}/`,
  },
];

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", ["-m", "http.server", "3456"], {
      cwd: path.join(process.cwd(), "_site"),
      stdio: "ignore",
    });
    setTimeout(() => resolve(proc), 800);
    proc.on("error", reject);
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  for (const vp of [
    { w: 1280, h: 900, tag: "desktop" },
    { w: 390, h: 844, tag: "mobile" },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    for (const { slug, path: route } of PAGES) {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      if (slug === "stud") {
        await page.waitForSelector("#horse-tbody tr", { timeout: 15000 }).catch(() => {});
      }
      if (slug === "calculator") {
        await page.waitForTimeout(500);
      }
      const file = path.join(OUT, `${slug}-${vp.tag}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log("saved", file);
    }
    await ctx.close();
  }
  await browser.close();
  server.kill("SIGTERM");
}

main();
