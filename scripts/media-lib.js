"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const PROFILES = Object.freeze({
  hero: Object.freeze({ ratio: "16:9", outputs: [[640, 360], [960, 540], [1440, 810], [1920, 1080]] }),
  cover: Object.freeze({ ratio: "3:2", outputs: [[480, 320], [800, 533], [1200, 800], [1600, 1067]] }),
  card: Object.freeze({ ratio: "16:9", outputs: [[480, 270], [800, 450], [1200, 675]] }),
  product: Object.freeze({ ratio: "1:1", outputs: [[400, 400], [800, 800], [1200, 1200]] }),
  gallery: Object.freeze({ ratio: "3:2", outputs: [[640, 427], [1200, 800], [1800, 1200]] })
});

const ENTITY_FOLDERS = Object.freeze({ home: "home", place: "places", route: "routes", product: "products", event: "events", gallery: "gallery", shared: "shared" });
const GENERATED_FOLDERS = Object.freeze([...new Set(Object.values(ENTITY_FOLDERS))]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SOURCE_PATTERN = /^[a-z0-9][a-z0-9/-]*\.(?:jpg|jpeg|png)$/;

function inside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function ratioNumber(value) {
  const match = /^(\d+):(\d+)$/.exec(String(value || ""));
  return match ? Number(match[1]) / Number(match[2]) : NaN;
}

async function validateSpec(spec, options = {}) {
  const sourceRoot = path.resolve(options.sourceRoot || "media-source");
  const strict = options.strict === true;
  const errors = [];
  const warnings = [];
  const seen = new Set();
  if (!spec || spec.version !== 1 || !Array.isArray(spec.items)) return { errors: ["spec must contain version 1 and an items array"], warnings, items: [] };
  for (const item of spec.items) {
    const id = String(item?.media_id || "");
    if (!ID_PATTERN.test(id)) errors.push(`invalid media_id: ${id || "(empty)"}`);
    if (seen.has(id)) errors.push(`duplicate media_id: ${id}`);
    seen.add(id);
    const sourceFile = String(item?.source_file || "").replaceAll("\\", "/");
    if (!SOURCE_PATTERN.test(sourceFile)) errors.push(`unsupported source filename: ${sourceFile || "(empty)"}`);
    const profile = PROFILES[item?.profile];
    if (!profile) errors.push(`unknown profile for ${id}: ${item?.profile || "(empty)"}`);
    if (profile && item?.ratio !== profile.ratio) errors.push(`profile ratio mismatch for ${id}: expected ${profile.ratio}`);
    if (!ENTITY_FOLDERS[item?.entity_type]) errors.push(`invalid entity_type for ${id}: ${item?.entity_type || "(empty)"}`);
    if (!String(item?.entity_id || "").trim()) errors.push(`missing entity_id for ${id}`);
    if (!String(item?.alt_th || "").trim() || !String(item?.alt_en || "").trim()) errors.push(`missing bilingual alt text for ${id}`);
    const absolute = path.resolve(sourceRoot, sourceFile);
    if (!inside(sourceRoot, absolute)) { errors.push(`source path escapes media-source for ${id}`); continue; }
    if (!fs.existsSync(absolute)) {
      const message = `missing ${item?.required === true ? "required" : "optional"} source: ${sourceFile}`;
      (item?.required === true ? errors : warnings).push(message);
      continue;
    }
    try {
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) { errors.push(`source symlink is not allowed: ${sourceFile}`); continue; }
      const metadata = await sharp(absolute).metadata();
      if (!metadata.width || !metadata.height || !["jpeg", "png"].includes(metadata.format)) throw new Error("unsupported decoded format");
      if (profile) {
        const [minimumWidth, minimumHeight] = profile.outputs.at(-1);
        if (metadata.width < minimumWidth || metadata.height < minimumHeight) errors.push(`source too small for ${id}: ${metadata.width}x${metadata.height}, minimum ${minimumWidth}x${minimumHeight}`);
        const difference = Math.abs((metadata.width / metadata.height) / ratioNumber(item.ratio) - 1);
        if (difference > 0.15) errors.push(`incorrect ratio for ${id}: ${(difference * 100).toFixed(1)}% difference`);
        else if (difference > 0.03) warnings.push(`ratio warning for ${id}: ${(difference * 100).toFixed(1)}% difference`);
      }
      if (metadata.width * metadata.height > 40_000_000) warnings.push(`very large source for ${id}: ${metadata.width * metadata.height} pixels`);
    } catch (error) { errors.push(`malformed image for ${id}: ${error.message}`); }
  }
  if (strict && warnings.length) errors.push(...warnings.map((value) => `strict: ${value}`));
  return { errors, warnings, items: spec.items };
}

function publicItem(item, outputs) {
  return {
    media_id: item.media_id,
    entity_type: item.entity_type,
    entity_id: item.entity_id,
    role: item.role,
    ratio: item.ratio,
    required: item.required === true,
    alt_th: item.alt_th,
    alt_en: item.alt_en,
    fallback: `assets/media/placeholders/${item.fallback}.svg`,
    outputs: outputs.sort((left, right) => left.width - right.width)
  };
}

function stableJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function digest(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }

async function buildMedia({ spec, sourceRoot, outputRoot, manifestPath, publicPathPrefix = path.basename(outputRoot) }) {
  const validation = await validateSpec(spec, { sourceRoot, strict: true });
  if (validation.errors.length) throw new Error(validation.errors.join("\n"));
  const outputParent = path.dirname(path.resolve(outputRoot));
  const stage = path.join(outputParent, `.media-stage-${process.pid}-${Date.now()}`);
  const manifestTemp = `${manifestPath}.tmp-${process.pid}-${Date.now()}`;
  fs.mkdirSync(stage, { recursive: true });
  try {
    for (const folder of GENERATED_FOLDERS) {
      const targetDirectory = path.join(stage, folder);
      fs.mkdirSync(targetDirectory, { recursive: true });
      fs.writeFileSync(path.join(targetDirectory, ".gitkeep"), "", "utf8");
    }
    const items = [];
    for (const item of [...spec.items].sort((a, b) => a.media_id.localeCompare(b.media_id))) {
      const folder = ENTITY_FOLDERS[item.entity_type];
      const profile = PROFILES[item.profile];
      const source = path.resolve(sourceRoot, item.source_file);
      const outputs = [];
      for (const [width, height] of profile.outputs) {
        const filename = `${item.media_id}-${width}.webp`;
        const targetDirectory = path.join(stage, folder);
        const target = path.join(targetDirectory, filename);
        fs.mkdirSync(targetDirectory, { recursive: true });
        await sharp(source).rotate().resize(width, height, { fit: "cover", position: item.focal_position || "centre" }).webp({ quality: 82, alphaQuality: 100, smartSubsample: true, effort: 4 }).toFile(target);
        const data = fs.readFileSync(target);
        const metadata = await sharp(data).metadata();
        if (metadata.format !== "webp" || metadata.width !== width || metadata.height !== height) throw new Error(`generated output mismatch: ${filename}`);
        for (const key of ["exif", "xmp", "iptc", "tifftagPhotoshop"]) if (metadata[key] !== undefined) throw new Error(`generated metadata leak in ${filename}: ${key}`);
        outputs.push({ width, height, path: path.posix.join(publicPathPrefix.replaceAll("\\", "/"), folder, filename), bytes: data.length, sha256: digest(data) });
      }
      items.push(publicItem(item, outputs));
    }
    const manifest = { version: 1, items };
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestTemp, stableJson(manifest), "utf8");
    const backup = `${outputRoot}.backup-${process.pid}-${Date.now()}`;
    if (fs.existsSync(outputRoot)) fs.renameSync(outputRoot, backup);
    try {
      fs.renameSync(stage, outputRoot);
      fs.renameSync(manifestTemp, manifestPath);
      fs.rmSync(backup, { recursive: true, force: true });
    } catch (error) {
      fs.rmSync(outputRoot, { recursive: true, force: true });
      if (fs.existsSync(backup)) fs.renameSync(backup, outputRoot);
      throw error;
    }
    return manifest;
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
    fs.rmSync(manifestTemp, { force: true });
  }
}

module.exports = Object.freeze({ PROFILES, GENERATED_FOLDERS, validateSpec, buildMedia, stableJson });
