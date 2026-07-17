"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { validateSpec } = require("./media-lib.js");

const root = path.resolve(__dirname, "..");
const strict = process.argv.includes("--strict");

(async () => {
  let spec;
  try { spec = JSON.parse(fs.readFileSync(path.join(root, "media/media-spec.json"), "utf8")); }
  catch (error) { console.error(`MEDIA_CONFIG_ERROR: ${error.message}`); process.exit(2); }
  const result = await validateSpec(spec, { sourceRoot: path.join(root, "media-source"), strict });
  result.warnings.forEach((value) => console.warn(`MEDIA_WARNING: ${value}`));
  result.errors.forEach((value) => console.error(`MEDIA_ERROR: ${value}`));
  console.log(`Media check: ${spec.items.length} declared, ${result.errors.length} errors, ${result.warnings.length} warnings.`);
  process.exit(result.errors.length ? 1 : 0);
})().catch((error) => { console.error(`MEDIA_CHECK_FAILED: ${error.stack || error}`); process.exit(1); });
