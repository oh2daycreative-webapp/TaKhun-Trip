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

function loadBrowserMedia({ document, fetch } = {}) {
  const source = fs.readFileSync(path.join(root, "public/js/media.js"), "utf8");
  const context = { window: {}, URL, console, setTimeout, clearTimeout };
  context.window.window = context.window;
  if (document) context.window.document = document;
  if (fetch) context.window.fetch = fetch;
  vm.runInNewContext(source, context, { filename: "media.js" });
  return { api: context.window.TakhunMedia, source, window: context.window };
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.isConnected = true;
    this.style = {};
    this._attributes = new Map();
    this._listeners = new Map();
  }

  append(...nodes) { nodes.forEach((node) => this._insert(node, this.children.length)); }
  prepend(...nodes) { nodes.reverse().forEach((node) => this._insert(node, 0)); }
  _insert(node, index) {
    node.remove?.();
    this.children.splice(index, 0, node);
    node.parentNode = this;
    node.isConnected = this.isConnected;
  }
  replaceWith(node) {
    const parent = this.parentNode;
    if (!parent) return;
    const index = parent.children.indexOf(this);
    if (index < 0) return;
    node.remove?.();
    parent.children.splice(index, 1, node);
    this.parentNode = null;
    node.parentNode = parent;
    node.isConnected = parent.isConnected;
  }
  remove() {
    const parent = this.parentNode;
    if (!parent) return;
    const index = parent.children.indexOf(this);
    if (index >= 0) parent.children.splice(index, 1);
    this.parentNode = null;
  }
  querySelector(selector) {
    if (selector !== "[data-media-runtime]") return null;
    for (const child of this.children) {
      if (child._attributes.has("data-media-runtime")) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  setAttribute(name, value) { this._attributes.set(name, String(value)); }
  getAttribute(name) { return this._attributes.get(name) || null; }
  removeAttribute(name) { this._attributes.delete(name); }
  addEventListener(type, listener, options = {}) {
    const listeners = this._listeners.get(type) || [];
    listeners.push({ listener, once: options.once === true });
    this._listeners.set(type, listeners);
  }
  dispatch(type) {
    const listeners = this._listeners.get(type) || [];
    this._listeners.set(type, listeners.filter((entry) => !entry.once));
    listeners.forEach((entry) => entry.listener({ type, target: this }));
  }
}

function createMediaDom() {
  const document = { createElement(tag) { return new FakeElement(tag, document); } };
  return { document, mount: document.createElement("div") };
}

function fixtureManifest() {
  return { version: 1, items: [{
    media_id: "fixture-hero", entity_type: "home", entity_id: "HOME", role: "hero",
    ratio: "16:9", required: true, alt_th: "ภาพไทย", alt_en: "English image",
    fallback: "assets/media/placeholders/hero.svg",
    outputs: [
      { width: 640, height: 360, path: "assets/media/generated/home/fixture-hero-640.webp" },
      { width: 1440, height: 810, path: "assets/media/generated/home/fixture-hero-1440.webp" }
    ]
  }] };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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

  await test("runtime maps every entity type and validates only local media paths", () => {
    const { api } = loadBrowserMedia();
    assert.equal(api.mediaIdFor("place", "BTK-001"), "place-btk-001-cover");
    assert.equal(api.mediaIdFor("route", "ROUTE-BTK-CORE"), "route-btk-core-cover");
    assert.equal(api.mediaIdFor("product", "PROD-BTK-HONEY"), "product-btk-honey-cover");
    assert.equal(api.mediaIdFor("event", "EVENT-HEART-OF-HILLS-2026"), "event-heart-of-hills-2026-cover");
    assert.equal(api.mediaIdFor("gallery", "GALLERY-DAM-LAKE-001"), "gallery-dam-lake-001");
    assert.equal(api.mediaIdFor("shared", "SHARED-ABOUT-PROJECT"), "shared-about-project");
    assert.equal(api.mediaIdFor("home", "hero-ratchaprapha"), "home-hero-ratchaprapha");
    assert.equal(api.mediaIdFor("unknown", "BTK-001"), "");
    assert.equal(api.isLocalGeneratedPath("assets/media/generated/places/place-btk-001-cover-800.webp"), true);
    for (const value of ["https://example.test/a.webp", "/assets/media/generated/a.webp", "assets/media/generated/../a.webp", "media-source/a.webp", "assets/media/generated/a.jpg"]) assert.equal(api.isLocalGeneratedPath(value), false);
    assert.equal(api.isLocalPlaceholderPath("assets/media/placeholders/hero.svg"), true);
    for (const value of ["https://example.test/hero.svg", "assets/media/placeholders/../hero.svg", "assets/media/placeholders/custom.svg"]) assert.equal(api.isLocalPlaceholderPath(value), false);
  });

  await test("runtime rejects malformed outputs and returns localized intrinsic picture metadata", async () => {
    const manifest = { version: 1, items: [{
      media_id: "fixture-hero", entity_type: "home", entity_id: "HOME", role: "hero",
      ratio: "16:9", required: true, alt_th: "Ã Â¸Â Ã Â¸Â²Ã Â¸Å¾Ã Â¹â€žÃ Â¸â€”Ã Â¸Â¢", alt_en: "English image",
      fallback: "assets/media/placeholders/hero.svg", source_file: "media-source/private.jpg",
      outputs: [
        { width: 1440, height: 810, path: "assets/media/generated/home/fixture-hero-1440.webp" },
        { width: 640, height: 360, path: "assets/media/generated/home/fixture-hero-640.webp" },
        { width: 0, height: 360, path: "assets/media/generated/home/bad-width.webp" },
        { width: 960, height: 540, path: "https://example.test/remote.webp" },
        { width: 800.5, height: 450, path: "assets/media/generated/home/bad-decimal.webp" }
      ]
    }, {
      media_id: "fixture-empty", entity_type: "home", entity_id: "HOME", role: "hero",
      ratio: "16:9", required: true, alt_th: "Thai fallback", alt_en: "",
      fallback: "assets/media/placeholders/custom.svg",
      outputs: [{ width: 640, height: -1, path: "assets/media/generated/home/bad-height.webp" }]
    }, {
      media_id: "fixture-alt-fallback", entity_type: "home", entity_id: "HOME", role: "hero",
      ratio: "16:9", required: true, alt_th: "Thai fallback", alt_en: "",
      fallback: "assets/media/placeholders/hero.svg",
      outputs: [{ width: 640, height: 360, path: "assets/media/generated/home/fixture-alt-fallback-640.webp" }]
    }] };
    const { api } = loadBrowserMedia({ fetch: async () => ({ ok: true, json: async () => manifest }) });
    await api.loadManifest();
    assert.deepEqual(JSON.parse(JSON.stringify(api.pictureModel("fixture-hero", "en"))), {
      alt: "English image",
      src: "assets/media/generated/home/fixture-hero-1440.webp",
      srcset: "assets/media/generated/home/fixture-hero-640.webp 640w, assets/media/generated/home/fixture-hero-1440.webp 1440w",
      width: 1440,
      height: 810,
      fallback: "assets/media/placeholders/hero.svg",
      outputs: [
        { width: 640, height: 360, path: "assets/media/generated/home/fixture-hero-640.webp" },
        { width: 1440, height: 810, path: "assets/media/generated/home/fixture-hero-1440.webp" }
      ]
    });
    assert.equal(api.pictureModel("fixture-hero", "th").alt, "Ã Â¸Â Ã Â¸Â²Ã Â¸Å¾Ã Â¹â€žÃ Â¸â€”Ã Â¸Â¢");
    assert.equal(api.pictureModel("fixture-empty", "en"), null);
    assert.equal(api.pictureModel("fixture-alt-fallback", "en").alt, "Thai fallback");
    const normalized = api.normalizeManifest(manifest);
    assert.equal(normalized.items[1].fallback, "");
    assert.equal(api.pictureModel("fixture-hero", "fr").alt, "Ã Â¸Â Ã Â¸Â²Ã Â¸Å¾Ã Â¹â€žÃ Â¸â€”Ã Â¸Â¢");
    assert.equal(JSON.stringify(normalized).includes("source_file"), false);
  });

  await test("runtime helper rejects external content and resolves local role placeholders", () => {
    const { api, source } = loadBrowserMedia();
    assert.equal(api.placeholderPath("product"), "assets/media/placeholders/product.svg");
    assert.match(source, /replaceWith\(picture\)/, "responsive upgrade must preserve card overlays and controls");
    assert.match(source, /data-media-runtime/, "re-rendering must replace the prior runtime image instead of duplicating it");
  });

  await test("runtime renderer propagates responsive metadata and preserves sibling overlays", async () => {
    const { document, mount } = createMediaDom();
    const badge = document.createElement("span");
    mount.append(badge);
    const manifest = fixtureManifest();
    const { api } = loadBrowserMedia({ document, fetch: async () => ({ ok: true, json: async () => manifest }) });
    const placeholder = api.renderImage(mount, {
      mediaId: "fixture-hero", role: "hero", className: "hero-image",
      fallbackAlt: "Fallback image", loading: "eager", fetchPriority: "high",
      sizes: "100vw", lang: "en"
    });
    assert.equal(placeholder.src, "assets/media/placeholders/hero.svg");
    assert.equal(placeholder.alt, "Fallback image");
    assert.equal(placeholder.loading, "eager");
    assert.equal(placeholder.fetchPriority, "high");
    await flushPromises();
    const picture = mount.querySelector("[data-media-runtime]");
    const image = picture.children[0];
    assert.equal(image.alt, "English image");
    assert.equal(image.srcset.includes("640w"), true);
    assert.equal(image.sizes, "100vw");
    assert.equal(image.width, 1440);
    assert.equal(image.height, 810);
    assert.equal(image.loading, "eager");
    assert.equal(image.fetchPriority, "high");
    assert.equal(mount.children.includes(badge), true);
  });

  await test("runtime renderer ignores errors from a replaced placeholder", async () => {
    const { document, mount } = createMediaDom();
    const { api } = loadBrowserMedia({ document, fetch: async () => ({ ok: true, json: async () => fixtureManifest() }) });
    const placeholder = api.renderImage(mount, { mediaId: "fixture-hero", lang: "en" });
    await flushPromises();
    const picture = mount.querySelector("[data-media-runtime]");
    placeholder.dispatch("error");
    assert.equal(mount.querySelector("[data-media-runtime]"), picture);
  });

  await test("runtime renderer separates decorative alt from informative fallback alt", async () => {
    const { document, mount } = createMediaDom();
    const semanticFallback = document.createElement("span");
    semanticFallback.setAttribute("role", "img");
    semanticFallback.setAttribute("aria-label", "Generic image");
    const { api } = loadBrowserMedia({ document, fetch: async () => ({ ok: true, json: async () => fixtureManifest() }) });
    const placeholder = api.renderImage(mount, { mediaId: "fixture-hero", decorative: true, fallbackAlt: "Ignored", fallbackFactory: () => semanticFallback });
    assert.equal(placeholder.alt, "");
    placeholder.dispatch("error");
    assert.equal(semanticFallback.getAttribute("aria-hidden"), "true");
    assert.equal(semanticFallback.getAttribute("role"), null);
    assert.equal(semanticFallback.getAttribute("aria-label"), null);

    const second = createMediaDom();
    api.renderImage(second.mount, { mediaId: "fixture-hero", decorative: true, fallbackAlt: "Ignored" });
    await flushPromises();
    assert.equal(second.mount.querySelector("[data-media-runtime]").children[0].alt, "");
  });

  await test("runtime renderer ignores stale upgrades and fails back to local nodes", async () => {
    const gate = deferred();
    const firstDom = createMediaDom();
    const fallbackNode = firstDom.document.createElement("span");
    const { api } = loadBrowserMedia({
      document: firstDom.document,
      fetch: () => gate.promise
    });
    api.renderImage(firstDom.mount, { mediaId: "fixture-hero", fallbackAlt: "First", lang: "th" });
    api.renderImage(firstDom.mount, {
      mediaId: "fixture-hero", fallbackAlt: "Second", lang: "en", fetchPriority: "urgent",
      fallbackFactory: () => fallbackNode
    });
    gate.resolve({ ok: true, json: async () => fixtureManifest() });
    await flushPromises();
    const latestImage = firstDom.mount.querySelector("[data-media-runtime]").children[0];
    assert.equal(latestImage.alt, "English image", "the older Thai render must not replace the newer English render");
    assert.equal(latestImage.fetchPriority || "", "", "invalid priority must be omitted");
    latestImage.dispatch("error");
    const localPlaceholder = firstDom.mount.querySelector("[data-media-runtime]");
    assert.equal(localPlaceholder.src, "assets/media/placeholders/hero.svg");
    localPlaceholder.dispatch("error");
    assert.equal(firstDom.mount.querySelector("[data-media-runtime]"), fallbackNode);

    const disconnected = createMediaDom();
    const delayed = deferred();
    const secondRuntime = loadBrowserMedia({ document: disconnected.document, fetch: () => delayed.promise }).api;
    const initial = secondRuntime.renderImage(disconnected.mount, { mediaId: "fixture-hero" });
    disconnected.mount.isConnected = false;
    delayed.resolve({ ok: true, json: async () => fixtureManifest() });
    await flushPromises();
    assert.equal(disconnected.mount.querySelector("[data-media-runtime]"), initial);
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
