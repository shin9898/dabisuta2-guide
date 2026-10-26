import { chromium } from "playwright";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const BASE = "http://127.0.0.1:3456";
const OUT = "/opt/cursor/artifacts/screenshots";
const CYCLE = process.argv[2] || "1";

const issues = [];

function log(msg) {
  console.log(`[QA cycle ${CYCLE}] ${msg}`);
}

async function shot(page, name) {
  const file = `qa-cycle${CYCLE}-${name}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: false });
  log(`screenshot ${file}`);
}

async function checkConsole(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

async function runChecks(browser, viewport, prefix) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto(`${BASE}/stud/`, { waitUntil: "networkidle" });
  await shot(page, `${prefix}-stud-list`);
  const lineSelect = page.locator("#horse-line");
  if (await lineSelect.count()) {
    await lineSelect.selectOption({ index: 1 });
    await page.waitForTimeout(300);
  }
  await shot(page, `${prefix}-stud-line-filter`);

  await page.goto(`${BASE}/stud/%E3%83%89%E3%83%90%E3%82%A4%E3%83%9E%E3%82%B8%E3%82%A7%E3%82%B9%E3%83%86%E3%82%A3/`, {
    waitUntil: "networkidle",
  });
  await shot(page, `${prefix}-horse-dubai`);

  await page.goto(`${BASE}/haigo/#galileo-routes`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const chips = page.locator("#galileo-routes-table").locator("..").locator("..").locator(".route-eval-chip");
  const chipCount = await page.locator(".route-eval-chip").count();
  if (chipCount >= 4) {
    await page.locator(".route-eval-chip").nth(3).click();
    await page.locator(".route-eval-chip").nth(1).click();
    await page.waitForTimeout(200);
    await shot(page, `${prefix}-haigo-eval-kotta-omoshiro`);
  }
  await page.locator(".route-eval-chip").first().click();
  await page.waitForTimeout(200);
  await shot(page, `${prefix}-haigo-eval-kanpeki`);

  await page.goto(`${BASE}/stud/`, { waitUntil: "networkidle" });
  await page.locator("#horse-search").fill("zzzznotfound");
  await page.waitForTimeout(200);
  const emptyHidden = await page.locator("#horse-empty").isHidden();
  if (emptyHidden) issues.push(`${prefix} empty state not shown for horse search`);

  await page.goto(`${BASE}/calculator/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await shot(page, `${prefix}-calculator-routes`);
  await page.goto(`${BASE}/calculator/#homebred-stallion`, { waitUntil: "networkidle" });
  await page.locator("#hs-calc").click();
  await page.waitForTimeout(1500);
  await shot(page, `${prefix}-calculator-stallion`);

  await page.goto(`${BASE}/sire-lines/`, { waitUntil: "networkidle" });
  await shot(page, `${prefix}-sire-lines`);

  await page.goto(`${BASE}/homebred-stallion/`, { waitUntil: "networkidle" });
  await shot(page, `${prefix}-homebred-guide`);

  if (consoleErrors.length) {
    issues.push(`${prefix} JS errors: ${consoleErrors.join(" | ")}`);
  }
  await context.close();
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

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let server = null;
  if (!process.env.QA_SERVER_RUNNING) {
    server = await startServer();
  }
  const browser = await chromium.launch();
  try {
    await runChecks(browser, { width: 1280, height: 800 }, "desktop");
    await runChecks(browser, { width: 390, height: 844 }, "mobile");
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
