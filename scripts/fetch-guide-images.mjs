/**
 * Wikimedia Commons からガイド用ヒーロー画像を取得し WebP に変換する。
 * メタデータは src/_data/image_credits.json と同期すること。
 *
 * 依存: curl, ImageMagick (convert), cwebp
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
    "https://upload.wikimedia.org/wikipedia/commons/2/22/Z_wy%C5%9Bcig%C3%B3w_-_Do_startu_%2860546%29.jpg",
  "hero-haigo":
    "https://upload.wikimedia.org/wikipedia/commons/a/a2/Iceland_Horses_Mare_and_Foal_9244.jpg",
  "hero-ikusei":
    "https://upload.wikimedia.org/wikipedia/commons/a/ad/Disused_horse_underpass_from_stables_to_the_training_race_track%2C_S%C5%82u%C5%BCewiec_%282%29.jpg",
  "hero-schedule":
    "https://upload.wikimedia.org/wikipedia/commons/7/72/Horse_Race_Starting_Gate_%2814304242538%29.jpg",
  "hero-overseas":
    "https://upload.wikimedia.org/wikipedia/commons/7/7b/Horseracing_Churchill_Downs.jpg",
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
  execSync(`cwebp -q 78 -m 6 "${scaled}" -o "${webp}"`, { stdio: "inherit" });
  console.log(`Wrote ${webp}`);
}
