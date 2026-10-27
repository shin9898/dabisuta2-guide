/**
 * Wikimedia Commons からガイド用ヒーロー画像を取得し WebP に変換する。
 * メタデータは src/_data/image_credits.json と同期すること。
 * CC BY-SA: リサイズのみ（トリミングなし）。EXIF の向きはピクセルに焼き込む（.rotate()）。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import sharp from "sharp";

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

/** @param {number | undefined} orientation EXIF Orientation (1–8). */
function orientationLabel(orientation) {
  switch (orientation) {
    case undefined:
    case 1:
      return "upright (1 or none)";
    case 2:
      return "mirrored horizontal (2)";
    case 3:
      return "rotated 180° (3)";
    case 4:
      return "mirrored vertical (4)";
    case 5:
      return "mirrored horizontal + 270° CW (5)";
    case 6:
      return "rotated 90° CW (6)";
    case 7:
      return "mirrored horizontal + 90° CW (7)";
    case 8:
      return "rotated 90° CCW (8)";
    default:
      return `unknown (${orientation})`;
  }
}

function needsAutoOrient(orientation) {
  return orientation !== undefined && orientation !== 1;
}

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
  const webp = path.join(OUT, `${id}.webp`);
  execSync(`curl -sL -A "${UA}" -o "${jpg}" "${url}"`, { stdio: "inherit" });

  const before = await sharp(jpg).metadata();
  const rotated = needsAutoOrient(before.orientation);
  console.log(
    `${id}: EXIF orientation ${before.orientation ?? "none"} (${orientationLabel(before.orientation)}); before ${before.width}x${before.height}; auto-orient applied: ${rotated}`
  );

  const afterMeta = await sharp(jpg)
    .rotate()
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 80, effort: 6 })
    .toFile(webp);

  console.log(
    `${id}: wrote ${webp} (${afterMeta.width}x${afterMeta.height}, ${rotated ? "fixed" : "unchanged"})`
  );
}
