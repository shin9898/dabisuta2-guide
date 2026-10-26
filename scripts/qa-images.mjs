import { chromium } from "playwright";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const BASE = "http://127.0.0.1:3456";
const OUT = "/opt/cursor/artifacts/screenshots";

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
      else reject(new Error(`server timeout`));
    }, 20000);
  });
}

async function run(browser, viewport, prefix) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".page-hero__img");
  await page.screenshot({
    path: path.join(OUT, `images-${prefix}-home-hero.png`),
    fullPage: false,
  });

  await page.goto(`${BASE}/credits/`, { waitUntil: "networkidle" });
  await page.screenshot({
    path: path.join(OUT, `images-${prefix}-credits.png`),
    fullPage: false,
  });

  await page.goto(`${BASE}/haigo/`, { waitUntil: "networkidle" });
  await page.screenshot({
    path: path.join(OUT, `images-${prefix}-haigo-hero.png`),
    fullPage: false,
  });

  await ctx.close();
  return errors;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let server = null;
  if (!process.env.QA_SERVER_RUNNING) {
    server = await startServer();
  }
  const browser = await chromium.launch();
  const issues = [];
  try {
    issues.push(...(await run(browser, { width: 1280, height: 900 }, "desktop")));
    issues.push(...(await run(browser, { width: 390, height: 844 }, "mobile")));
  } finally {
    await browser.close();
    server?.kill("SIGTERM");
  }
  if (issues.length) {
    console.log(JSON.stringify({ issues }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
