/**
 * Wikimedia Commons からガイド用ヒーロー画像を取得し WebP に変換する。
 * メタデータは src/_data/image_credits.json と同期すること。
 * CC BY-SA: リサイズのみ（トリミングなし）。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CREDITS = path.join(ROOT, "src/_data/image_credits.json");
const OUT = path.join(ROOT, "src/assets/images/guide");
const TMP = path.join(ROOT, "tmp-img");
const UA =
  "dabisuta2-guide/1.0 (https://github.com/shin9898/dabisuta2-guide)";

const DOWNLOADS = {
  "hero-home":
    "https://upload.wikimedia.org/wikipedia/commons/8/88/%E6%9D%B1%E4%BA%AC%E7%AB%B6%E9%A6%AC%E5%A0%B420231014-P1032226.jpg",
  "hero-haigo":
    "https://upload.wikimedia.org/wikipedia/commons/d/d1/%E4%B8%AD%E5%B1%B1%E7%AB%B6%E9%A6%AC%E5%A0%B4%E3%83%91%E3%83%89%E3%83%83%E3%82%AF20250601-P1068679.jpg",
  "hero-ikusei":
    "https://upload.wikimedia.org/wikipedia/commons/5/56/Tokyo_Racecourse_220605k.jpg",
  "hero-schedule":
    "https://upload.wikimedia.org/wikipedia/commons/3/31/Ohi_Racecourse_%2810163%29.jpg",
  "hero-overseas":
    "https://upload.wikimedia.org/wikipedia/commons/2/2e/Hippodrome_de_Longchamp_2021.jpg",
};

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const credits = JSON.parse(fs.readFileSync(CREDITS, "utf8"));
const ids = new Set(credits.images.map((i) => i.id));

for (const [id, url] of Object.entries(DOWNLOADS)) {
  if (!ids.has(id)) {
    console.warn(`skip ${id}: not in image_credits.json`);
    continue;
  }
  const jpg = path.join(TMP, `${id}.jpg`);
  const scaled = path.join(TMP, `${id}-s.jpg`);
  const webp = path.join(OUT, `${id}.webp`);
  execSync(`curl -sL -A "${UA}" -o "${jpg}" "${url}"`, { stdio: "inherit" });
  execSync(
    `convert "${jpg}" -resize 1200x> -strip -interlace Plane "${scaled}"`,
    { stdio: "inherit" }
  );
  execSync(`cwebp -q 80 -m 6 "${scaled}" -o "${webp}"`, { stdio: "inherit" });
  console.log(`Wrote ${webp}`);
}
