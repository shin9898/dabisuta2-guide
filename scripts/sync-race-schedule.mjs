/**
 * 湯一路番組表 JSON を取得し src/assets/data/race_schedule.json に保存する。
 * 出典: https://ds2.yublog.com/info/race_program/data/race_schedule.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../src/assets/data/race_schedule.json");
const URL =
  "https://ds2.yublog.com/info/race_program/data/race_schedule.json";

const res = await fetch(URL);
if (!res.ok) {
  console.error(`fetch failed: ${res.status}`);
  process.exit(1);
}
const text = await res.text();
JSON.parse(text);
fs.writeFileSync(OUT, text);
console.log(`Wrote ${OUT} (${text.length} bytes)`);
