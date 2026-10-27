/**
 * Crawl built _site: broken internal links, empty hrefs, pages with horizontal overflow.
 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { spawn } from "child_process";

const BASE = "http://127.0.0.1:3456";
const ROOT = path.join(process.cwd(), "_site");

const MAIN_PATHS = [
  "/",
  "/haigo/",
  "/stud/",
  "/calculator/",
  "/homebred-stallion/",
  "/sire-lines/",
  "/schedule/",
  "/overseas/",
  "/ikusei/",
  "/ranch/",
  "/bc/",
  "/zen/",
  "/my-ranch/",
  "/credits/",
];

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["--yes", "serve", "_site", "-l", "3456"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buf = "";
    const done = () => resolve(proc);
    proc.stdout.on("data", (d) => {
      buf += d.toString();
      if (/3456|Accepting/i.test(buf)) done();
    });
    proc.stderr.on("data", (d) => {
      buf += d.toString();
      if (/3456|Accepting/i.test(buf)) done();
    });
    setTimeout(() => {
      if (/3456/.test(buf)) done();
      else reject(new Error("server timeout"));
    }, 20000);
  });
}

function collectHtmlFiles(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) collectHtmlFiles(p, acc);
    else if (ent.name === "index.html") acc.push(p);
  }
  return acc;
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  const issues = [];

  for (const vp of [
    { w: 1280, h: 900, tag: "d1280" },
    { w: 390, h: 844, tag: "m390" },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();

    for (const route of MAIN_PATHS) {
      const url = `${BASE}${route}`;
      const res = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
      if (!res || res.status() >= 400) {
        issues.push({ type: "http", route, status: res?.status(), vp: vp.tag });
      }
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth > doc.clientWidth + 2;
      });
      if (overflow) {
        issues.push({ type: "overflow", route, vp: vp.tag });
      }
      const badLinks = await page.evaluate(() => {
        const out = [];
        for (const a of document.querySelectorAll("a[href]")) {
          const href = a.getAttribute("href") || "";
          if (!href.trim() || href === "#") {
            const text = (a.textContent || "").trim().slice(0, 80);
            if (text) out.push({ href, text });
          }
        }
        return out;
      });
      for (const b of badLinks) {
        issues.push({ type: "empty-link", route, vp: vp.tag, ...b });
      }
    }
    await ctx.close();
  }

  // Sample horse detail
  const page = await browser.newPage();
  await page.goto(
    `${BASE}/stud/${encodeURIComponent("ドバイマジェスティ")}/`,
    { waitUntil: "networkidle" }
  );
  const horseStatus = await page.evaluate(() => document.title);
  if (!horseStatus.includes("ドバイ")) {
    issues.push({ type: "horse-detail", msg: "sample horse page failed" });
  }
  await browser.close();
  server.kill("SIGTERM");

  const htmlCount = collectHtmlFiles(ROOT).length;
  console.log(JSON.stringify({ htmlCount, issueCount: issues.length, issues }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
