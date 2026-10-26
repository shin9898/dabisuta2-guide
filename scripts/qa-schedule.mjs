import { chromium } from "playwright";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const BASE = "http://127.0.0.1:3456";
const OUT = "/opt/cursor/artifacts/screenshots";
const CYCLE = process.argv[2] || "1";

const issues = [];

function log(msg) {
  console.log(`[schedule QA cycle ${CYCLE}] ${msg}`);
}

async function shot(page, name) {
  const file = `schedule-cycle${CYCLE}-${name}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: false });
  log(`screenshot ${file}`);
}

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
      else reject(new Error(`server timeout: ${buf.slice(0, 200)}`));
    }, 20000);
  });
}

async function runViewport(browser, viewport, prefix) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto(`${BASE}/schedule/`, { waitUntil: "networkidle" });
  await page.waitForSelector("#schedule-app:not([hidden])", { timeout: 30000 });
  await shot(page, `${prefix}-timeline-default`);

  await page.locator(".schedule-preset-btn[data-preset='triple']").click();
  await page.waitForTimeout(400);
  await shot(page, `${prefix}-preset-triple`);

  await page.locator('button[data-view="list"]').click();
  await page.waitForTimeout(400);
  await shot(page, `${prefix}-list-view`);

  await page.locator("#filter-grade").selectOption("I");
  await page.waitForTimeout(300);
  await shot(page, `${prefix}-filter-g1`);

  const stats = await page.locator("#schedule-stats").textContent();
  if (!stats || !/表示/.test(stats)) {
    issues.push(`${prefix} schedule stats missing`);
  }

  const firstStar = page.locator(
    "#schedule-panel-list:not([hidden]) [data-action='target'], #schedule-panel-timeline:not([hidden]) [data-action='target']"
  ).first();
  if (await firstStar.count()) {
    await firstStar.click({ force: true });
    await page.waitForTimeout(200);
    await shot(page, `${prefix}-target-star`);
  }

  await page.locator(".schedule-preset-btn[data-preset='arcRoute']").click();
  await page.waitForTimeout(500);
  await shot(page, `${prefix}-preset-arc`);

  if (consoleErrors.length) {
    issues.push(`${prefix} JS: ${consoleErrors.join(" | ")}`);
  }

  await context.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let server = null;
  if (!process.env.QA_SERVER_RUNNING) {
    server = await startServer();
  }
  const browser = await chromium.launch();
  try {
    await runViewport(browser, { width: 1280, height: 900 }, "desktop");
    await runViewport(browser, { width: 390, height: 844 }, "mobile");
  } finally {
    await browser.close();
    server?.kill("SIGTERM");
  }
  if (issues.length) {
    console.log(JSON.stringify({ cycle: CYCLE, issues }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ cycle: CYCLE, issues: [], ok: true }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
