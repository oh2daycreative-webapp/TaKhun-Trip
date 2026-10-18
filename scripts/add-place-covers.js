"use strict";
// One-off (2026-10-19 release): add covers for the 3 re-entered places that had none (KRN-001, KRN-003, PNM-002).
// Builds only these items. A full `media-build` is not possible because the other covers' sources are not in the repo.
// It uses the media-build encoder settings (rotate, 3:2 cover crop, webp q82), with two differences:
//  - Sizes larger than the cropped source are skipped, so nothing is upscaled.
//  - A source a little wider than 3:2 is centre-cropped. The strict ratio warning is not applied.
// Originals are only read, never changed. Outputs carry no EXIF, XMP or IPTC data; this is checked after encoding.
// Usage: node scripts/add-place-covers.js <source-dir>            (dry run)
//        node scripts/add-place-covers.js <source-dir> --apply
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const { PROFILES, stableJson } = require("./media-lib.js");

const root = path.resolve(__dirname, "..");
const COVERS = [
  { file: "KRN-001.jpg", entity_id: "PLC-68d2338f-a8f2-4d6d-bdbc-4ab8ac8ab39e", alt_th: "พระธาตุหินนิลเปา", alt_en: "Phra That Hin Nin Pao" },
  { file: "KRN-003.jpg", entity_id: "PLC-23f91739-de8c-4f07-8705-11d88ee1b739", alt_th: "OASIS Forest Garden", alt_en: "OASIS Forest Garden" },
  { file: "PNM-002.jpg", entity_id: "PLC-6d706013-ce22-46a6-b2e1-061a8da902b7", alt_th: "อุทยานธรรมเขานาในหลวง", alt_en: "Khao Na Nai Luang Dharma Park" }
];
const sourceDir = process.argv[2];
const apply = process.argv.includes("--apply");
if (!sourceDir || !fs.existsSync(sourceDir)) throw new Error("usage: add-place-covers.js <source-dir> [--apply]");
const specPath = path.join(root, "media/media-spec.json");
const manifestPath = path.join(root, "public/assets/media/manifest/media-manifest.json");
const outDir = path.join(root, "public/assets/media/generated/places");
const byId = (items) => items.sort((a, b) => a.media_id.localeCompare(b.media_id));

(async () => {
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const cover of COVERS) {
    const mediaId = `place-${cover.entity_id.toLowerCase()}-cover`;
    if (spec.items.some((item) => item.media_id === mediaId) || manifest.items.some((item) => item.media_id === mediaId)) throw new Error(`already present: ${mediaId}`);
    const source = path.join(sourceDir, cover.file);
    const meta = await sharp(source).metadata();
    const rotated = (meta.orientation || 1) >= 5;
    const width = rotated ? meta.height : meta.width;
    const height = rotated ? meta.width : meta.height;
    // Size of the centre 3:2 crop taken from the source.
    const cropWidth = Math.min(width, Math.round(height * 1.5));
    const cropHeight = Math.min(height, Math.round(width / 1.5));
    const sizes = PROFILES.cover.outputs.filter(([w, h]) => w <= cropWidth && h <= cropHeight);
    const skipped = PROFILES.cover.outputs.filter(([w, h]) => !(w <= cropWidth && h <= cropHeight)).map(([w, h]) => `${w}x${h}`);
    console.log(`${cover.file} ${width}x${height} -> crop ${cropWidth}x${cropHeight}; sizes ${sizes.map(([w]) => w).join("/")}${skipped.length ? `; NOT MADE (would upscale): ${skipped.join(", ")}` : ""}`);
    if (!sizes.length) throw new Error(`source too small: ${cover.file}`);
    if (!apply) continue;
    const outputs = [];
    for (const [w, h] of sizes) {
      const filename = `${mediaId}-${w}.webp`;
      const target = path.join(outDir, filename);
      // Same chain as media-lib buildMedia. sharp drops all metadata unless withMetadata() is called.
      await sharp(source).rotate().resize(w, h, { fit: "cover", position: "centre" }).webp({ quality: 82, alphaQuality: 100, smartSubsample: true, effort: 4 }).toFile(target);
      const data = fs.readFileSync(target);
      const out = await sharp(data).metadata();
      if (out.format !== "webp" || out.width !== w || out.height !== h) throw new Error(`output mismatch: ${filename}`);
      for (const key of ["exif", "xmp", "iptc", "tifftagPhotoshop"]) if (out[key] !== undefined) throw new Error(`metadata leak in ${filename}: ${key}`);
      outputs.push({ width: w, height: h, path: `assets/media/generated/places/${filename}`, bytes: data.length, sha256: crypto.createHash("sha256").update(data).digest("hex") });
    }
    spec.items.push({ media_id: mediaId, entity_type: "place", entity_id: cover.entity_id, source_file: `places/${mediaId}.jpg`, role: "cover", ratio: "3:2", required: true, alt_th: cover.alt_th, alt_en: cover.alt_en, profile: "cover", focal_position: "centre", fallback: "cover" });
    manifest.items.push({ media_id: mediaId, entity_type: "place", entity_id: cover.entity_id, role: "cover", ratio: "3:2", required: true, alt_th: cover.alt_th, alt_en: cover.alt_en, fallback: "assets/media/placeholders/cover.svg", outputs });
  }
  if (apply) {
    fs.writeFileSync(specPath, stableJson({ ...spec, items: byId(spec.items) }));
    fs.writeFileSync(manifestPath, stableJson({ ...manifest, items: byId(manifest.items) }));
    console.log("spec + manifest updated");
  }
})().catch((error) => { console.error(`ADD_COVERS_FAILED: ${error.message}`); process.exit(1); });
