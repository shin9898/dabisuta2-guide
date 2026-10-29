import { chromium } from "playwright";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const OUT = path.join(process.cwd(), "docs/brushup/rotation");

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
  for (const [w, h, tag] of [
    [1280, 900, "desktop"],
    [390, 844, "mobile"],
  ]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto("http://127.0.0.1:3456/rotation-builder/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForSelector("#rotation-main:not([hidden])", { timeout: 20000 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(OUT, `rotation-builder-${tag}.png`),
      fullPage: tag === "mobile",
    });
    console.log("saved", tag);
    await page.close();
  }
  await browser.close();
  server.kill("SIGTERM");
}

main();
