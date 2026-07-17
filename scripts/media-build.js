"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { GENERATED_FOLDERS, buildMedia } = require("./media-lib.js");

const root = path.resolve(__dirname, "..");
const outputRoot = path.join(root, "public/assets/media/generated");
const manifestPath = path.join(root, "public/assets/media/manifest/media-manifest.json");

function clean() {
  const allowed = path.join(root, "public/assets/media");
  if (!path.resolve(outputRoot).startsWith(`${path.resolve(allowed)}${path.sep}`)) throw new Error("Refusing to clean outside public media root.");
  fs.rmSync(outputRoot, { recursive: true, force: true });
  for (const folder of GENERATED_FOLDERS) {
    const targetDirectory = path.join(outputRoot, folder);
    fs.mkdirSync(targetDirectory, { recursive: true });
    fs.writeFileSync(path.join(targetDirectory, ".gitkeep"), "", "utf8");
  }
  fs.writeFileSync(manifestPath, "{\n  \"version\": 1,\n  \"items\": []\n}\n", "utf8");
  console.log("Cleaned generated media outputs and reset the public manifest.");
}

(async () => {
  if (process.argv.includes("--clean")) { clean(); return; }
  const spec = JSON.parse(fs.readFileSync(path.join(root, "media/media-spec.json"), "utf8"));
  const manifest = await buildMedia({
    spec,
    sourceRoot: path.join(root, "media-source"),
    outputRoot,
    manifestPath,
    publicPathPrefix: "assets/media/generated"
  });
  console.log(`Built ${manifest.items.length} media items.`);
})().catch((error) => { console.error(`MEDIA_BUILD_FAILED: ${error.message}`); process.exit(1); });
