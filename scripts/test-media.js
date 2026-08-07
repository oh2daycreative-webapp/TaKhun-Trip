"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const requiredIds = [
  "home-hero-ratchaprapha", "home-hero-heart-mountain",
  "place-btk-001-cover", "place-btk-002-cover", "place-btk-003-cover",
  "place-btk-004-cover", "place-btk-005-cover", "place-krn-002-cover",
  "place-pnm-001-cover", "route-btk-core-cover", "route-btk-heart-cover",
  "route-krn-nature-cover", "product-btk-durian-cover",
  "product-btk-honey-cover", "product-btk-textile-cover",
  "event-heart-of-hills-2026-cover", "shared-about-project",
  "gallery-dam-lake-001"
].sort();

function test(name, fn) {
  return Promise.resolve().then(fn).then(
    () => console.log(`PASS ${name}`),
    (error) => { error.message = `${name}: ${error.message}`; throw error; }
  );
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function run() {
  await test("declares every approved media architecture file", () => {
    const files = [
      "media/media-spec.json", "media-source/README.md", "docs/MEDIA_REQUIREMENTS.md",
      "scripts/media-lib.js", "scripts/media-check.js", "scripts/media-build.js",
      "public/js/media.js", "public/favicon.svg",
      "public/assets/media/placeholders/hero.svg",
      "public/assets/media/placeholders/cover.svg",
      "public/assets/media/placeholders/product.svg",
      "public/assets/media/placeholders/gallery.svg",
      "public/assets/media/manifest/media-manifest.json"
    ];
    for (const file of files) assert.equal(fs.existsSync(path.join(root, file)), true, `missing ${file}`);
  });

  const media = require("./media-lib.js");

  await test("pins sharp and exposes the exact approved npm contracts", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    assert.equal(pkg.dependencies.sharp, "0.35.3");
    assert.deepEqual(Object.keys(pkg.scripts).sort(), ["build", "media:build", "media:check", "media:clean", "media:test", "test"].sort());
  });

  await test("private spec has exactly 18 sorted approved required IDs", () => {
    const spec = JSON.parse(fs.readFileSync(path.join(root, "media/media-spec.json"), "utf8"));
    assert.equal(spec.version, 1);
    assert.deepEqual(spec.items.map((item) => item.media_id), requiredIds);
    assert.equal(spec.items.every((item) => item.required === true), true);
    assert.equal(JSON.stringify(spec).includes("generated_at"), false);
  });

  await test("public manifest contains every approved generated asset without source leaks", () => {
    const manifestPath = path.join(
      root,
      "public/assets/media/manifest/media-manifest.json"
    );
    const text = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(text);

    assert.equal(manifest.version, 1);
    assert.equal(manifest.items.length, requiredIds.length);
    assert.deepEqual(
      manifest.items.map((item) => item.media_id),
      requiredIds
    );

    assert.equal(
      /source_file|media-source|\.jpe?g|\.png/i.test(text),
      false
    );

    for (const item of manifest.items) {
      assert.equal(item.required, true, `${item.media_id} is not required`);
      assert.equal(
        typeof item.alt_th === "string" && item.alt_th.trim().length > 0,
        true,
        `${item.media_id} missing alt_th`
      );
      assert.equal(
        typeof item.alt_en === "string" && item.alt_en.trim().length > 0,
        true,
        `${item.media_id} missing alt_en`
      );
      assert.equal(
        Array.isArray(item.outputs) && item.outputs.length > 0,
        true,
        `${item.media_id} has no generated outputs`
      );

      for (const output of item.outputs) {
        assert.match(
          output.path,
          /^assets\/media\/generated\/.+\.webp$/,
          `${item.media_id} has a non-local generated path`
        );
        assert.equal(
          Number.isInteger(output.width) && output.width > 0,
          true,
          `${output.path} has invalid width`
        );
        assert.equal(
          Number.isInteger(output.height) && output.height > 0,
          true,
          `${output.path} has invalid height`
        );
        assert.equal(
          Number.isInteger(output.bytes) && output.bytes > 0,
          true,
          `${output.path} has invalid byte size`
        );
        assert.match(
          output.sha256,
          /^[a-f0-9]{64}$/,
          `${output.path} has invalid SHA-256`
        );

        const generatedFile = path.join(root, "public", output.path);

        assert.equal(
          fs.existsSync(generatedFile),
          true,
          `missing ${output.path}`
        );
        assert.equal(
          fs.statSync(generatedFile).size,
          output.bytes,
          `${output.path} byte size does not match manifest`
        );
        assert.equal(
          sha256(generatedFile),
          output.sha256,
          `${output.path} SHA-256 does not match manifest`
        );
      }
    }
  });

  await test("validates filename IDs duplicates missing files and ratio policy", async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "takhun-media-validate-"));
    try {
      const validSource = path.join(temp, "valid.jpg");
      await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#087c7a" } }).jpeg().toFile(validSource);
      const base = { media_id: "valid-hero", source_file: "valid.jpg", entity_type: "home", entity_id: "HOME", role: "hero", ratio: "16:9", required: true, alt_th: "ภาพทดสอบ", alt_en: "Test image", profile: "hero", focal_position: "centre", fallback: "hero" };
      const result = await media.validateSpec({ version: 1, items: [base] }, { sourceRoot: temp, strict: false });
      assert.deepEqual(result.errors, []);
      const bad = await media.validateSpec({ version: 1, items: [base, { ...base }, { ...base, media_id: "Bad ID", source_file: "missing.gif" }] }, { sourceRoot: temp, strict: false });
      assert.ok(bad.errors.some((value) => value.includes("duplicate media_id")));
      assert.ok(bad.errors.some((value) => value.includes("invalid media_id")));
      assert.ok(bad.errors.some((value) => value.includes("unsupported source filename")));
      assert.ok(bad.errors.some((value) => value.includes("missing required source")));
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });

  await test("builds deterministic WebP outputs without metadata or source leaks", async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "takhun-media-build-"));
    try {
      const sourceRoot = path.join(temp, "sources");
      const outputRoot = path.join(temp, "generated");
      const manifestPath = path.join(temp, "manifest.json");
      fs.mkdirSync(sourceRoot, { recursive: true });
      const source = path.join(sourceRoot, "fixture.jpg");
      await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#f0aa28" } }).jpeg().withMetadata({ orientation: 6 }).toFile(source);
      const spec = { version: 1, items: [{ media_id: "fixture-hero", source_file: "fixture.jpg", entity_type: "home", entity_id: "HOME", role: "hero", ratio: "16:9", required: true, alt_th: "ภาพทดสอบ", alt_en: "Test image", profile: "hero", focal_position: "centre", fallback: "hero" }] };
      const first = await media.buildMedia({ spec, sourceRoot, outputRoot, manifestPath });
      for (const folder of ["home", "places", "routes", "products", "events", "gallery", "shared"]) {
        assert.equal(fs.existsSync(path.join(outputRoot, folder, ".gitkeep")), true, `build removed generated/${folder}/.gitkeep`);
      }
      assert.deepEqual(first.items[0].outputs.map((item) => item.width), [640, 960, 1440, 1920]);
      const output = path.join(temp, first.items[0].outputs[0].path);
      const metadata = await sharp(output).metadata();
      assert.equal(metadata.format, "webp");
      for (const key of ["exif", "xmp", "iptc", "tifftagPhotoshop"]) assert.equal(metadata[key], undefined);
      const firstText = fs.readFileSync(manifestPath, "utf8");
      const firstHash = sha256(output);
      const second = await media.buildMedia({ spec, sourceRoot, outputRoot, manifestPath });
      assert.deepEqual(second, first);
      assert.equal(fs.readFileSync(manifestPath, "utf8"), firstText);
      assert.equal(sha256(output), firstHash);
      assert.equal(/source_file|media-source|fixture\.jpg/i.test(firstText), false);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });

  await test("failed required build preserves the previous generated tree and manifest", async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "takhun-media-atomic-"));
    try {
      const outputRoot = path.join(temp, "generated");
      const manifestPath = path.join(temp, "manifest.json");
      fs.mkdirSync(outputRoot, { recursive: true });
      fs.writeFileSync(path.join(outputRoot, "sentinel.webp"), "old");
      fs.writeFileSync(manifestPath, "old manifest\n");
      const spec = { version: 1, items: [{ media_id: "missing-hero", source_file: "missing.jpg", entity_type: "home", entity_id: "HOME", role: "hero", ratio: "16:9", required: true, alt_th: "ขาด", alt_en: "Missing", profile: "hero", focal_position: "centre", fallback: "hero" }] };
      await assert.rejects(media.buildMedia({ spec, sourceRoot: path.join(temp, "sources"), outputRoot, manifestPath }), /missing required source/);
      assert.equal(fs.readFileSync(path.join(outputRoot, "sentinel.webp"), "utf8"), "old");
      assert.equal(fs.readFileSync(manifestPath, "utf8"), "old manifest\n");
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });

  await test("runtime helper rejects external content and resolves local role placeholders", () => {
    const source = fs.readFileSync(path.join(root, "public/js/media.js"), "utf8");
    const context = { window: {}, URL, console, setTimeout, clearTimeout };
    context.window.window = context.window;
    vm.runInNewContext(source, context, { filename: "media.js" });
    const api = context.window.TakhunMedia;
    assert.equal(api.mediaIdFor("place", "BTK-001"), "place-btk-001-cover");
    assert.equal(api.mediaIdFor("route", "ROUTE-BTK-CORE"), "route-btk-core-cover");
    assert.equal(api.placeholderPath("product"), "assets/media/placeholders/product.svg");
    assert.equal(api.isLocalGeneratedPath("https://example.com/photo.webp"), false);
    assert.equal(api.isLocalGeneratedPath("assets/media/generated/places/place-btk-001-cover-800.webp"), true);
    assert.match(source, /replaceWith\(picture\)/, "responsive upgrade must preserve card overlays and controls");
    assert.match(source, /data-media-runtime/, "re-rendering must replace the prior runtime image instead of duplicating it");
  });

  await test("all 27 HTML pages link the local favicon with correct relative paths", () => {
    const htmlFiles = [];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith(".html") && htmlFiles.push(path.join(dir, entry.name)));
    walk(path.join(root, "public"));
    assert.equal(htmlFiles.length, 27);
    for (const file of htmlFiles) {
      const html = fs.readFileSync(file, "utf8");
      const expected = file.includes(`${path.sep}admin${path.sep}`) ? "../favicon.svg" : "favicon.svg";
      assert.match(html, new RegExp(`<link rel="icon" href="${expected.replace(".", "\\.")}" type="image/svg\\+xml">`), path.relative(root, file));
    }
    const favicon = fs.readFileSync(path.join(root, "public/favicon.svg"), "utf8");
    assert.equal(/<script|<image|(?:xlink:)?href=/i.test(favicon), false);
  });

  await test("source originals are ignored while structure and public outputs stay trackable", () => {
    const ignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
    assert.match(ignore, /node_modules\//);
    assert.match(ignore, /media-source/);
    assert.equal(ignore.includes("public/assets/media/generated"), false);
    assert.equal(ignore.includes("public/assets/media/manifest"), false);
    for (const folder of ["home", "places", "routes", "products", "events", "gallery", "shared"]) assert.equal(fs.existsSync(path.join(root, "public/assets/media/generated", folder, ".gitkeep")), true, `missing generated/${folder}/.gitkeep`);
  });

  await test("media pages load the shared runtime before controllers and all renderers use it", () => {
    const pages = {
      "index.html": "home.js", "search.html": "search.js", "map.html": "map.js",
      "routes.html": "routes.js", "route-detail.html": "routes.js",
      "places.html": "places.js", "place-detail.html": "place-detail.js",
      "products.html": "products.js", "product-detail.html": "products.js",
      "events.html": "events.js", "event-detail.html": "events.js",
      "gallery.html": "gallery.js", "favorites.html": "favorites.js", "about.html": "about.js"
    };
    for (const [page, controller] of Object.entries(pages)) {
      const html = fs.readFileSync(path.join(root, "public", page), "utf8");
      const mediaIndex = html.indexOf('<script src="js/media.js"></script>');
      const controllerIndex = html.indexOf(`<script src="js/${controller}"></script>`);
      assert.ok(mediaIndex >= 0, `${page} missing media runtime`);
      assert.ok(controllerIndex < 0 || mediaIndex < controllerIndex, `${page} loads media runtime too late`);
    }
    for (const file of ["home.js", "places.js", "place-detail.js", "map.js", "routes.js", "products.js", "events.js", "gallery.js", "favorites.js", "search.js", "about.js"]) {
      const source = fs.readFileSync(path.join(root, "public/js", file), "utf8");
      assert.match(source, /TakhunMedia\??\.renderImage/, `${file} does not use the shared media renderer`);
    }
    const homeHtml = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
    const homeSource = fs.readFileSync(path.join(root, "public/js/home.js"), "utf8");
    assert.match(homeHtml, /data-home-hero-media/);
    assert.match(homeSource, /home-hero-ratchaprapha/);
  });

  await test("full PowerShell regression suite includes the media contract", () => {
    const orchestrator = fs.readFileSync(path.join(root, "scripts/test.ps1"), "utf8");
    assert.match(orchestrator, /test-media\.js/);
    assert.match(orchestrator, /Media pipeline verification failed/);
  });
}

run().catch((error) => { console.error(error.stack || error); process.exit(1); });
