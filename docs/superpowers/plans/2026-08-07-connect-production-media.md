# Connect Production Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect approved local production media to all in-scope public Takhun Trip pages through the existing shared runtime, with responsive sources, correct localized/decorative alt behavior, safe local fallbacks, and controlled loading priority.

**Architecture:** Extend the existing `public/js/media.js` runtime rather than creating a parallel renderer. Public page controllers remain thin adapters that map stable entity IDs to approved media IDs and provide presentation context such as role, sizes, loading, priority, and decorative semantics.

**Tech Stack:** Vanilla HTML, CSS, JavaScript, Node-based regression scripts, PowerShell regression runner, existing local WebP media pipeline.

## Global Constraints

- This is a frontend-only integration. Do not change Apps Script, public API contracts, Google Sheets data/schema, admin/CMS behavior, or canonical content data.
- Do not modify `media/media-spec.json`, `media-source/**`, `public/assets/media/generated/**`, `public/assets/media/manifest/media-manifest.json`, or `public/assets/media/placeholders/**`.
- Consume only the existing public manifest, generated WebP files, and local SVG placeholders.
- Never use `cover_image_url`, `image_url`, `thumbnail_url`, or `hero_image_url` as a production image source or fallback. Existing response validation may retain those fields.
- Never introduce a remote image fallback, CDN, image service, data URL, blob URL, or second manifest/picture renderer.
- Keep `public/js/media.js` as the one shared renderer; page controllers only derive media IDs and pass presentation options.
- Preserve the existing Apps Script/API behavior, Thai/English behavior, public page state machines, safe link handling, overlay/favorite controls, and Gallery video policy.
- Use mobile-first `sizes` values that match existing page breakpoints and keep visible card ratios aligned with approved profiles.
- Informative images use manifest `alt_th`/`alt_en`; redundant card thumbnails and the About background use `alt=""`.
- Informative uncovered-media placeholders use localized `fallbackAlt`; decorative fallbacks are hidden from assistive technology.
- Each applicable document may have only one `fetchpriority="high"` image: Home, Place detail, Route detail, Product detail, Event detail, or About primary media.
- Non-critical images use `loading="lazy"`; Gallery lightbox media may be eager after user activation but stays normal priority.
- Use DOM construction only. Do not add `innerHTML`, unsafe URL assignment, source path exposure, or user-controlled manifest paths.
- Keep the current framework-free and dependency-free frontend. Do not change `package.json` or `package-lock.json`.
- Use TDD for every behavioral change. Every task must complete RED, minimal GREEN, focused regression, `git diff --check`, and its own commit.
- `npm.cmd test` and `npm.cmd run build` must remain green.
- Do not run `media:check` or `media:build` as milestone acceptance commands; private ignored originals are outside scope and generated files must remain unchanged.
- The live Gallery Sheet ambiguity is locked out of scope: do not seed or edit Gallery data. Frontend support for a valid local image `media_id` with empty `image_url`/`media_url` is sufficient.

## Shared Runtime Interface Contract

Define this contract in Tasks 1–2 and use the same names in Tasks 3–9.

### `isLocalPlaceholderPath(value)`

```js
isLocalPlaceholderPath(value) -> boolean
```

Returns `true` only for these exact public paths:

```text
assets/media/placeholders/hero.svg
assets/media/placeholders/cover.svg
assets/media/placeholders/product.svg
assets/media/placeholders/gallery.svg
```

### `pictureModel(mediaId, lang = "th")`

```js
pictureModel(mediaId, lang = "th") -> null | {
  alt: string,
  src: string,
  srcset: string,
  width: number,
  height: number,
  fallback: string,
  outputs: Array<{ width: number, height: number, path: string, bytes?: number, sha256?: string }>
}
```

- Outputs are valid only when `path` passes `isLocalGeneratedPath`, and `width`/`height` are positive integers.
- Outputs are sorted ascending by `width`; the largest output supplies `src`, `width`, and `height`.
- `lang === "en"` selects non-empty `alt_en`, falling back to `alt_th`; every other language selects `alt_th`.
- `fallback` is the manifest value only when `isLocalPlaceholderPath` accepts it; otherwise it is an empty string and the renderer uses `placeholderPath(role)`.

### `renderImage(mount, options = {})`

```js
renderImage(mount, {
  mediaId: string,
  type?: "home" | "place" | "route" | "product" | "event" | "gallery" | "shared",
  role?: "hero" | "cover" | "card" | "product" | "gallery",
  className?: string,
  alt?: string,
  fallbackAlt?: string,
  decorative?: boolean,
  loading?: "eager" | "lazy",
  fetchPriority?: "high" | "low" | "auto",
  sizes?: string,
  lang?: "th" | "en",
  fallbackFactory?: () => Node | null
}) -> Node | null
```

Semantic precedence is fixed:

```js
const approvedAlt = options.decorative
  ? ""
  : Object.hasOwn(options, "alt")
    ? String(options.alt || "")
    : model.alt || String(options.fallbackAlt || "");

const placeholderAlt = options.decorative
  ? ""
  : String(options.fallbackAlt || options.alt || "");
```

- Apply `loading` and a valid `fetchPriority` to both the immediate placeholder `<img>` and upgraded generated `<img>`.
- Apply `sizes`, `srcset`, intrinsic `width`, and intrinsic `height` to the upgraded image.
- A decorative `fallbackFactory` result receives `aria-hidden="true"` and no semantic `role`/`aria-label`.
- The manifest fallback is used after a generated-image error; invalid/missing manifest fallback uses the role placeholder.
- Preserve the existing per-mount generation token, disconnected-mount guard, and replacement of only `[data-media-runtime]` so sibling overlays survive.
- Preserve explicit `alt` compatibility for existing out-of-scope callers in Map, Search, and Favorites. In-scope approved informative media should normally omit `alt` so manifest alt wins.

---

### Task 1: Harden Manifest Normalization and Picture Models

**Files:**
- Modify: `scripts/test-media.js:211-224`
- Modify: `public/js/media.js:23-46`

**Interfaces:**
- Consumes: existing `mediaIdFor(type, id)`, `placeholderPath(role)`, `isLocalGeneratedPath(value)`, `normalizeManifest(value)`, and `loadManifest(fetcher)`.
- Produces: public `isLocalPlaceholderPath(value)` and the exact `pictureModel(mediaId, lang)` return shape defined above.

- [ ] **Step 1: Add a reusable runtime loader and failing manifest/model contract blocks**

Refactor the current one-off VM setup in `scripts/test-media.js` into this helper, without changing media build tests:

```js
function loadBrowserMedia({ document, fetch } = {}) {
  const source = fs.readFileSync(path.join(root, "public/js/media.js"), "utf8");
  const context = { window: {}, URL, console, setTimeout, clearTimeout };
  context.window.window = context.window;
  if (document) context.window.document = document;
  if (fetch) context.window.fetch = fetch;
  vm.runInNewContext(source, context, { filename: "media.js" });
  return { api: context.window.TakhunMedia, source, window: context.window };
}
```

Add test blocks with these exact names and core assertions:

```js
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
    ratio: "16:9", required: true, alt_th: "ภาพไทย", alt_en: "English image",
    fallback: "assets/media/placeholders/hero.svg", source_file: "media-source/private.jpg",
    outputs: [
      { width: 1440, height: 810, path: "assets/media/generated/home/fixture-hero-1440.webp" },
      { width: 640, height: 360, path: "assets/media/generated/home/fixture-hero-640.webp" },
      { width: 0, height: 360, path: "assets/media/generated/home/bad-width.webp" },
      { width: 960, height: 540, path: "https://example.test/remote.webp" }
    ]
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
  assert.equal(api.pictureModel("fixture-hero", "th").alt, "ภาพไทย");
  assert.equal(JSON.stringify(api.normalizeManifest(manifest)).includes("source_file"), false);
});
```

Also assert that an invalid manifest fallback normalizes to `""`, non-positive/non-integer dimensions are removed, an item with no valid outputs produces `null`, and empty `alt_en` falls back to `alt_th`.

- [ ] **Step 2: Run the focused test to prove RED**

Run: `node scripts/test-media.js`

Expected: FAIL because `isLocalPlaceholderPath` is absent and `pictureModel` does not return `width`, `height`, or `fallback`.

- [ ] **Step 3: Implement strict normalization and the model shape**

In `public/js/media.js`:

```js
const PLACEHOLDER_PATTERN = /^assets\/media\/placeholders\/(?:hero|cover|product|gallery)\.svg$/;
function isLocalPlaceholderPath(value) { return PLACEHOLDER_PATTERN.test(String(value || "")); }
function validDimension(value) { return Number.isInteger(value) && value > 0; }
```

Change `normalizeManifest` to construct an allowlisted item object, filter each output through `isLocalGeneratedPath` plus `validDimension(width/height)`, sort by width, and normalize invalid fallback to `""`. Do not copy unknown keys such as `source_file`.

Change `pictureModel` to return the exact shared contract, taking `width` and `height` from `outputs.at(-1)` and copying `outputs` defensively. Add `isLocalPlaceholderPath` to the frozen `TakhunMedia` export.

- [ ] **Step 4: Run GREEN and focused regressions**

Run:

```powershell
node scripts/test-media.js
npm.cmd run media:test
node --check public/js/media.js
```

Expected: all media tests pass and the syntax check exits 0.

- [ ] **Step 5: Inspect and commit Task 1**

Run:

```powershell
git diff --check
git diff -- public/js/media.js scripts/test-media.js
git add public/js/media.js scripts/test-media.js
git commit -m "feat: harden public media models"
```

Expected staged files: exactly `public/js/media.js` and `scripts/test-media.js`.

---

### Task 2: Add Accessible Responsive Rendering Semantics

**Files:**
- Modify: `scripts/test-media.js`
- Modify: `public/js/media.js:48-96`

**Interfaces:**
- Consumes: Task 1 `pictureModel`, `isLocalPlaceholderPath`, `placeholderPath`, `loadManifest`, and the existing per-mount generation field.
- Produces: the exact `renderImage(mount, options)` contract defined in Shared Runtime Interface Contract.

- [ ] **Step 1: Add a minimal fake DOM and failing renderer tests**

Add a `FakeElement` fixture to `scripts/test-media.js` that supports `children`, `parentNode`, `isConnected`, `append`, `prepend`, `replaceWith`, `remove`, `querySelector("[data-media-runtime]")`, `setAttribute`, `removeAttribute`, `addEventListener`, and manual event dispatch. Its `ownerDocument.createElement(tag)` must return another `FakeElement`.

Add these exact test blocks:

```js
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
```

Add this third block:

```js
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
```

- [ ] **Step 2: Run the focused test to prove RED**

Run: `node scripts/test-media.js`

Expected: FAIL because current rendering lacks `fallbackAlt`, `decorative`, `fetchPriority`, intrinsic dimensions, and manifest-fallback behavior.

- [ ] **Step 3: Implement the minimal renderer helpers**

Add small internal helpers in `public/js/media.js`:

```js
function applyRequestOptions(image, options) {
  if (options.loading === "eager" || options.loading === "lazy") image.loading = options.loading;
  if (["high", "low", "auto"].includes(options.fetchPriority)) {
    image.fetchPriority = options.fetchPriority;
    image.setAttribute("fetchpriority", options.fetchPriority);
  }
}

function hideDecorativeFallback(node, decorative) {
  if (!node || !decorative) return node;
  node.setAttribute?.("aria-hidden", "true");
  node.removeAttribute?.("role");
  node.removeAttribute?.("aria-label");
  return node;
}
```

Update `renderImage` so its immediate local placeholder uses `placeholderAlt`, request options, and the requested class. After manifest load, build one `<picture>` containing one `<img>` with approved alt precedence, `src`, `srcset`, `sizes`, intrinsic dimensions, and request options. On generated-image failure, call the same fallback path with `model.fallback || placeholderPath(role)`. Keep the generation and `isConnected` guards before every asynchronous replacement.

Do not add `<source>`, a remote branch, a new fetch, or `innerHTML`.

- [ ] **Step 4: Run GREEN and focused regressions**

Run:

```powershell
node scripts/test-media.js
npm.cmd run media:test
node --check public/js/media.js
```

Expected: all renderer/model tests pass.

- [ ] **Step 5: Inspect and commit Task 2**

Run:

```powershell
git diff --check
git diff -- public/js/media.js scripts/test-media.js
git add public/js/media.js scripts/test-media.js
git commit -m "feat: add accessible responsive media rendering"
```

Expected staged files: exactly `public/js/media.js` and `scripts/test-media.js`.

---

### Task 3: Apply Home Media and Single-LCP Policy

**Files:**
- Modify: `scripts/test-home.js:44-226`
- Modify: `public/js/home.js:261-372`

**Interfaces:**
- Consumes: Task 2 `TakhunMedia.mediaIdFor` and `TakhunMedia.renderImage` options `fallbackAlt`, `decorative`, `loading`, `fetchPriority`, `sizes`, and `lang`.
- Produces: no new public API; Home remains a thin adapter with one fixed informative hero and lazy decorative entity cards.

- [ ] **Step 1: Add failing Home media-policy assertions**

Append a block inside `run()` named by its assertion message `"Home uses one manifest-alt LCP and lazy decorative cards"`:

```js
assert.equal((source.match(/fetchPriority:\s*"high"/g) || []).length, 1, "Home must have exactly one high-priority image");
assert.match(source, /mediaId:\s*"home-hero-ratchaprapha"[\s\S]*?loading:\s*"eager"[\s\S]*?fetchPriority:\s*"high"[\s\S]*?sizes:\s*"100vw"/);
assert.doesNotMatch(source, /home-hero-ratchaprapha[\s\S]*?alt:\s*(?:lang|format)/, "Home hero must use manifest alt");
assert.match(source, /function appendImage[\s\S]*?decorative:\s*true[\s\S]*?loading:\s*"lazy"/);
assert.match(source, /mediaId:\s*global\.TakhunMedia\.mediaIdFor\(type, id\)/);
assert.doesNotMatch(source, /renderImage\([\s\S]*?(?:cover_image_url|image_url)/, "API image URLs must not be render sources");
```

Also assert exact card sizes appear:

```js
const HOME_THREE_COLUMN_SIZES = "(min-width: 900px) 33vw, (min-width: 600px) 50vw, 100vw";
const HOME_ROUTE_SIZES = "(min-width: 900px) calc(21vw - 1rem), (min-width: 600px) 42vw, 100vw";
assert.match(source, new RegExp(HOME_THREE_COLUMN_SIZES.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(source, new RegExp(HOME_ROUTE_SIZES.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
```

- [ ] **Step 2: Run the Home test to prove RED**

Run: `node scripts/test-home.js`

Expected: FAIL because Home still passes generic `alt`, lacks `decorative`, and has no `fetchPriority`.

- [ ] **Step 3: Implement the Home adapter changes**

Change the internal helper to accept an explicit size contract:

```js
function appendImage(mount, type, id, name, sizes) {
  const fallbackFactory = () => imageFallback(name);
  if (!global.TakhunMedia?.renderImage) { const node = fallbackFactory(); node.setAttribute("aria-hidden", "true"); mount.append(node); return; }
  global.TakhunMedia.renderImage(mount, {
    mediaId: global.TakhunMedia.mediaIdFor(type, id), type,
    role: type === "product" ? "product" : type === "route" ? "card" : "cover",
    className: "home-card__image", decorative: true, loading: "lazy", sizes,
    lang: global.TakhunI18n?.getCurrentLang?.(), fallbackFactory
  });
}
```

Pass `HOME_THREE_COLUMN_SIZES` from place/event cards and `HOME_ROUTE_SIZES` from route cards. Keep the constants near the existing Home constants.

Render the hero as:

```js
global.TakhunMedia?.renderImage?.(heroMount, {
  mediaId: "home-hero-ratchaprapha", type: "home", role: "hero",
  className: "home-card__image", fallbackAlt: t("home.image_fallback"),
  loading: "eager", fetchPriority: "high", sizes: "100vw", lang
});
```

Do not add the second Home hero, product cards, Gallery preview, or URL fallback.

- [ ] **Step 4: Run GREEN and focused regressions**

Run:

```powershell
node scripts/test-home.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-home.ps1
node scripts/test-media.js
node --check public/js/home.js
```

Expected: Home behavior/static contracts and shared media tests pass.

- [ ] **Step 5: Inspect and commit Task 3**

Run:

```powershell
git diff --check
git diff -- public/js/home.js scripts/test-home.js
git add public/js/home.js scripts/test-home.js
git commit -m "feat: connect home production media"
```

Expected staged files: exactly `public/js/home.js` and `scripts/test-home.js`.

---

### Task 4: Apply Places and Place Detail Media Policies

**Files:**
- Modify: `scripts/test-places.js:50-130`
- Modify: `scripts/test-place-detail.js:62-182`
- Modify: `public/js/places.js:126-140`
- Modify: `public/js/place-detail.js:126-136, 194-221, 225-235, 276-282`

**Interfaces:**
- Consumes: Task 2 shared renderer contract and deterministic `mediaIdFor("place", placeId)`.
- Produces: no new public API; list/nearby thumbnails are decorative, the detail hero is informative and high priority, and unapproved place-gallery URL entries never create media IDs or image nodes.

- [ ] **Step 1: Add failing list and detail policy tests**

In `scripts/test-places.js`, add a test named `"place cards use lazy decorative local media for covered and uncovered IDs"`:

```js
test("place cards use lazy decorative local media for covered and uncovered IDs", () => {
  assert.match(source, /mediaId:\s*global\.TakhunMedia\.mediaIdFor\("place", place\.place_id\)/);
  assert.match(source, /decorative:\s*true/);
  assert.match(source, /loading:\s*"lazy"/);
  assert.match(source, /sizes:\s*"\(min-width: 900px\) 33vw, \(min-width: 600px\) 50vw, 100vw"/);
  assert.doesNotMatch(source, /renderImage\([\s\S]*?cover_image_url/);
  assert.doesNotMatch(source, /const approved(?:Places|Ids)|new Set\([^)]*BTK-001/, "coverage must stay manifest-owned");
});
```

In `scripts/test-place-detail.js`, add tests with these exact names:

```js
test("place detail gives only its informative hero high priority", () => {
  const detailSource = fs.readFileSync(path.join(root, "public/js/place-detail.js"), "utf8");
  assert.equal((detailSource.match(/fetchPriority:\s*"high"/g) || []).length, 1);
  assert.match(detailSource, /hero[\s\S]*?fallbackAlt:[\s\S]*?loading:\s*"eager"[\s\S]*?fetchPriority:\s*"high"[\s\S]*?sizes:\s*"100vw"/);
  assert.match(detailSource, /detail-nearby-card__image[\s\S]*?decorative:\s*true[\s\S]*?loading:\s*"lazy"/);
});

test("place detail never derives production gallery media from URL array entries", () => {
  const detailSource = fs.readFileSync(path.join(root, "public/js/place-detail.js"), "utf8");
  const body = /function renderGallery\(place, lang\) \{([\s\S]*?)\n  \}/.exec(detailSource)?.[1] || "";
  assert.doesNotMatch(body, /gallery_image_urls|place-.*-gallery|image_url|https?:/);
  assert.match(body, /mount\.hidden\s*=\s*true/);
  assert.match(body, /mount\.replaceChildren\(\)/);
});
```

Retain the existing canonical assertion that current `gallery_image_urls` is empty. Shared runtime tests from Tasks 1–2 prove covered IDs upgrade and unknown IDs remain on local placeholders.

- [ ] **Step 2: Run focused tests to prove RED**

Run:

```powershell
node scripts/test-places.js
node scripts/test-place-detail.js
```

Expected: FAIL on missing decorative/priority options and URL-array-driven `renderGallery`.

- [ ] **Step 3: Implement minimal Places adapters**

In `public/js/places.js`, keep `mediaIdFor("place", place.place_id)`, remove the generic approved-image `alt`, and pass:

```js
{
  role: "cover", className: "place-card__image", decorative: true,
  loading: "lazy", sizes: "(min-width: 900px) 33vw, (min-width: 600px) 50vw, 100vw",
  lang, fallbackFactory
}
```

When `TakhunMedia` is unavailable, mark the page-created card fallback `aria-hidden="true"`.

In `public/js/place-detail.js`, make `appendImage` accept explicit `decorative`, `loading`, `fetchPriority`, `sizes`, and `fallbackAlt` through its existing options object. Do not pass a generic `alt` for approved images.

- Detail hero: informative, `fallbackAlt: format("place_detail.image_alt", { name })`, eager, high, `100vw`.
- Nearby card: decorative, lazy, `"(min-width: 768px) 50vw, 100vw"`.
- Runtime-unavailable decorative fallback: `aria-hidden="true"` with semantic role/label removed.

Replace the current URL-count-driven `renderGallery` body with:

```js
function renderGallery(_place, _lang) {
  const mount = global.document.querySelector("[data-detail-gallery]");
  mount.hidden = true;
  mount.replaceChildren();
}
```

Leave the existing lightbox helpers in place for a future approved manifest-driven gallery implementation, but do not call them from current place data.

- [ ] **Step 4: Run GREEN and focused regressions**

Run:

```powershell
node scripts/test-places.js
node scripts/test-place-detail.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-places.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-place-detail.ps1
node scripts/test-media.js
node --check public/js/places.js
node --check public/js/place-detail.js
```

Expected: all focused tests pass; uncovered IDs remain covered by shared-runtime fallback tests.

- [ ] **Step 5: Inspect and commit Task 4**

Run:

```powershell
git diff --check
git diff -- public/js/places.js public/js/place-detail.js scripts/test-places.js scripts/test-place-detail.js
git add public/js/places.js public/js/place-detail.js scripts/test-places.js scripts/test-place-detail.js
git commit -m "feat: connect place production media"
```

Expected staged files: exactly those four paths.

---

### Task 5: Apply Routes, Route Detail, and Stop Media Policies

**Files:**
- Modify: `scripts/test-routes.js:30-115`
- Modify: `public/js/routes.js:127-150, 221-256`

**Interfaces:**
- Consumes: Task 2 shared renderer; `mediaIdFor("route", route_id)` and `mediaIdFor("place", stop.place_id)`.
- Produces: no new public API; internal `appendImage` accepts an options object so featured/standard list sizes differ without duplicating rendering.

- [ ] **Step 1: Add failing Route media contracts**

Append assertions to `scripts/test-routes.js` under a comment `// Production media policy`:

```js
assert.equal((source.match(/fetchPriority:\s*"high"/g) || []).length, 1, "Route detail must own the only high-priority image");
assert.match(source, /mediaIdFor\("route", route\.route_id\)/);
assert.match(source, /mediaIdFor\("place", stop\.place_id\)/);
assert.match(source, /route-explorer-card__image[\s\S]*?decorative:\s*true[\s\S]*?loading:\s*"lazy"/);
assert.match(source, /FEATURED_ROUTE_SIZES/);
assert.match(source, /STANDARD_ROUTE_SIZES/);
assert.notEqual(/const FEATURED_ROUTE_SIZES = "([^"]+)"/.exec(source)?.[1], /const STANDARD_ROUTE_SIZES = "([^"]+)"/.exec(source)?.[1]);
assert.match(source, /route-detail-page__image[\s\S]*?fallbackAlt:[\s\S]*?loading:\s*"eager"[\s\S]*?fetchPriority:\s*"high"/);
assert.match(source, /route-stop__media[\s\S]*?decorative:\s*true[\s\S]*?loading:\s*"lazy"[\s\S]*?sizes:\s*"20rem"/);
assert.doesNotMatch(source, /renderImage\([\s\S]*?cover_image_url/);
```

Use these exact constants in the expected source contract:

```js
const FEATURED_ROUTE_SIZES = "(min-width: 768px) calc(50vw - 2rem), 100vw";
const STANDARD_ROUTE_SIZES = "(min-width: 768px) calc(50vw - 3rem), 100vw";
```

- [ ] **Step 2: Run the Route test to prove RED**

Run: `node scripts/test-routes.js`

Expected: FAIL because list/detail renderers still pass generic alt, share one size, and omit priority/decorative semantics.

- [ ] **Step 3: Implement Route adapter options**

Change the internal helper signature to:

```js
function appendImage(mount, type, id, name, className, {
  role = "cover", sizes = "100vw", decorative = true
} = {})
```

Pass `decorative`, lazy loading, `sizes`, current language, and the current fallback factory to shared `renderImage`; remove generic approved-image `alt`. Mark direct decorative fallback nodes hidden from assistive technology.

In `renderRouteCard`, pass `{ role: "card", sizes: featured ? FEATURED_ROUTE_SIZES : STANDARD_ROUTE_SIZES, decorative: true }`.

In `appendDetailImage`, pass manifest-owned informative alt behavior with:

```js
{
  mediaId: global.TakhunMedia.mediaIdFor("route", route.route_id), type: "route", role: "card",
  className: "route-detail-page__image", fallbackAlt: format("route_detail.image_alt", { name }),
  loading: "eager", fetchPriority: "high", sizes: "100vw",
  lang: global.TakhunI18n?.getCurrentLang?.(), fallbackFactory
}
```

Route-stop options are `decorative: true`, `loading: "lazy"`, and `sizes: "20rem"`. Preserve title/link accessible names and current route state logic.

- [ ] **Step 4: Run GREEN and focused regressions**

Run:

```powershell
node scripts/test-routes.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-routes.ps1
node scripts/test-media.js
node --check public/js/routes.js
```

Expected: Route behavior/static contracts and media tests pass.

- [ ] **Step 5: Inspect and commit Task 5**

Run:

```powershell
git diff --check
git diff -- public/js/routes.js scripts/test-routes.js
git add public/js/routes.js scripts/test-routes.js
git commit -m "feat: connect route production media"
```

Expected staged files: exactly `public/js/routes.js` and `scripts/test-routes.js`.

---

### Task 6: Apply Product and Event Media Policies

**Files:**
- Modify: `scripts/test-products.js:37-224`
- Modify: `scripts/test-events.js:39-357`
- Modify: `public/js/products.js:187-195, 201-211, 328-333`
- Modify: `public/js/events.js:255-263, 280-291, 419-425`

**Interfaces:**
- Consumes: Task 2 shared renderer; product/event entity-ID mapping.
- Produces: no new public API; list cards are lazy/decorative and detail primary media is informative/eager/high.

- [ ] **Step 1: Add failing Product and Event policy assertions**

In `scripts/test-products.js`, append:

```js
assert.equal((source.match(/fetchPriority:\s*"high"/g) || []).length, 1);
assert.match(source, /mediaIdFor\("product", product\.product_id\)/);
assert.match(source, /product-card__image[\s\S]*?decorative:\s*true[\s\S]*?loading:\s*"lazy"/);
assert.match(source, /product-detail-page__image[\s\S]*?fallbackAlt:[\s\S]*?loading:\s*"eager"[\s\S]*?fetchPriority:\s*"high"/);
assert.match(source, /\(min-width: 901px\) 33vw, \(min-width: 621px\) 50vw, 100vw/);
assert.match(source, /\(min-width: 901px\) 58vw, 100vw/);
assert.doesNotMatch(source, /renderImage\([\s\S]*?image_url/);
```

In `scripts/test-events.js`, append equivalent assertions:

```js
assert.equal((source.match(/fetchPriority:\s*"high"/g) || []).length, 1);
assert.match(source, /mediaIdFor\("event", event\.event_id\)/);
assert.match(source, /event-card__image[\s\S]*?decorative:\s*true[\s\S]*?loading:\s*"lazy"/);
assert.match(source, /event-detail-page__image[\s\S]*?fallbackAlt:[\s\S]*?loading:\s*"eager"[\s\S]*?fetchPriority:\s*"high"/);
assert.match(source, /\(min-width: 960px\) 33vw, \(min-width: 640px\) 50vw, 100vw/);
assert.match(source, /\(min-width: 960px\) 58vw, 100vw/);
assert.doesNotMatch(source, /renderImage\([\s\S]*?image_url/);
```

Keep existing product contact, event status/date, filter, and controller-orchestration assertions unchanged.

- [ ] **Step 2: Run focused tests to prove RED**

Run:

```powershell
node scripts/test-products.js
node scripts/test-events.js
```

Expected: FAIL because the controllers use generic alt, unconditional detail `100vw`, and no decorative/high-priority options.

- [ ] **Step 3: Implement minimal Product and Event adapters**

For Product:

```js
const PRODUCT_CARD_SIZES = "(min-width: 901px) 33vw, (min-width: 621px) 50vw, 100vw";
const PRODUCT_DETAIL_SIZES = "(min-width: 901px) 58vw, 100vw";
```

- List: `decorative: true`, lazy, `PRODUCT_CARD_SIZES`, product role, no `alt`.
- Detail: `fallbackAlt: format("products.image_alt", { name })`, eager, high, `PRODUCT_DETAIL_SIZES`, no explicit approved-image `alt`.
- Direct decorative fallback: hidden from assistive technology.

For Event:

```js
const EVENT_CARD_SIZES = "(min-width: 960px) 33vw, (min-width: 640px) 50vw, 100vw";
const EVENT_DETAIL_SIZES = "(min-width: 960px) 58vw, 100vw";
```

- List: `decorative: true`, lazy, `EVENT_CARD_SIZES`, cover role, no `alt`.
- Detail: `fallbackAlt: format("events.image_alt", { name })`, eager, high, `EVENT_DETAIL_SIZES`, no explicit approved-image `alt`.
- Preserve the current event list partitions, date state, links, and API image fields in normalization only.

- [ ] **Step 4: Run GREEN and focused regressions**

Run:

```powershell
node scripts/test-products.js
node scripts/test-events.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-products.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-events.ps1
node scripts/test-media.js
node --check public/js/products.js
node --check public/js/events.js
```

Expected: Product/Event behavior and shared media tests pass.

- [ ] **Step 5: Inspect and commit Task 6**

Run:

```powershell
git diff --check
git diff -- public/js/products.js public/js/events.js scripts/test-products.js scripts/test-events.js
git add public/js/products.js public/js/events.js scripts/test-products.js scripts/test-events.js
git commit -m "feat: connect product and event media"
```

Expected staged files: exactly those four paths.

---

### Task 7: Open Gallery Images from Local Media IDs

**Files:**
- Modify: `scripts/test-gallery.js:160-178`
- Modify: `public/js/gallery.js:130-136, 190-207, 244-261`

**Interfaces:**
- Consumes: Task 2 shared renderer and existing `validateMediaId`, `normalizeMediaType`, `safeMediaUrl`, and video URL validators.
- Produces: `openViewerState(state, item, trigger)` returns `mode: "image"` for a valid image `media_id` even when image URL fields are empty; video modes remain unchanged.

- [ ] **Step 1: Replace the old remote-image gate test with failing local-ID contracts**

Change the viewer-state block in `scripts/test-gallery.js` to include:

```js
const localImage = api.openViewerState(initial, {
  media_id: "GALLERY-DAM-LAKE-001", media_type: "image", image_url: "", media_url: ""
}, trigger);
assert.equal(localImage.mode, "image");
assert.equal(api.openViewerState(initial, { media_id: "bad id", media_type: "image", image_url: "https://example.com/a.jpg" }, trigger).mode, "invalid");
assert.equal(api.openViewerState(initial, { media_id: "G-4", media_type: "image", image_url: "javascript:bad" }, trigger).mode, "image", "remote image fields are ignored for valid local IDs");
assert.equal(api.openViewerState(initial, { media_id: "G-2", media_type: "video", video_url: "https://cdn.example/v.mp4" }, trigger).mode, "video");
assert.equal(api.openViewerState(initial, { media_id: "G-3", media_type: "video", video_url: "https://youtube.com/watch?v=1" }, trigger).mode, "external");
assert.equal(api.openViewerState(initial, { media_id: "G-5", media_type: "video", video_url: "javascript:bad" }, trigger).mode, "invalid");
```

Add static renderer assertions:

```js
assert.match(source, /mediaIdFor\("gallery", item\.media_id\)/);
assert.match(source, /gallery-card__image[\s\S]*?fallbackAlt:[\s\S]*?loading:\s*"lazy"/);
assert.match(source, /\(min-width: 1080px\) 33vw, \(min-width: 640px\) 50vw, 100vw/);
assert.match(source, /viewerMedia[\s\S]*?loading:\s*"eager"[\s\S]*?sizes:\s*"\(min-width: 1280px\) 72rem, 90vw"/);
assert.doesNotMatch(source, /renderImage\([\s\S]*?(?:image_url|media_url|thumbnail_url)/);
```

- [ ] **Step 2: Run Gallery test to prove RED**

Run: `node scripts/test-gallery.js`

Expected: FAIL because empty image URLs currently produce `mode: "invalid"` and renderers override manifest alt.

- [ ] **Step 3: Implement local image mode and manifest-owned alt**

Change `openViewerState` image selection to:

```js
if (mediaType === "image" && validateMediaId(item?.media_id)) mode = "image";
```

Do not call `safeMediaUrl` for images. Keep direct-video and external-video branches exactly as validated today.

For Gallery cards and lightbox images:

- keep `mediaIdFor("gallery", item.media_id)`;
- remove explicit `alt` so manifest bilingual alt wins;
- pass `fallbackAlt: localized(item, "alt_text", lang) || format("gallery.image_alt", { name })`;
- cards: lazy and `"(min-width: 1080px) 33vw, (min-width: 640px) 50vw, 100vw"`;
- activated lightbox: eager, no `fetchPriority: "high"`, and `"(min-width: 1280px) 72rem, 90vw"`;
- preserve informative fallback role/label, dialog focus, close, navigation, and video rendering.

Keep `mockGallery({}).items` empty and do not add a fallback record or Sheet operation.

- [ ] **Step 4: Run GREEN and focused regressions**

Run:

```powershell
node scripts/test-gallery.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-gallery.ps1
node scripts/test-media.js
node --check public/js/gallery.js
```

Expected: local image ID tests and unchanged video tests pass.

- [ ] **Step 5: Inspect and commit Task 7**

Run:

```powershell
git diff --check
git diff -- public/js/gallery.js scripts/test-gallery.js
git add public/js/gallery.js scripts/test-gallery.js
git commit -m "fix: open gallery images from local media ids"
```

Expected staged files: exactly `public/js/gallery.js` and `scripts/test-gallery.js`.

---

### Task 8: Give the About Runtime Sole Hero Ownership

**Files:**
- Modify: `scripts/test-about.js:8-30, 77-87, 97-144`
- Modify: `public/js/about.js:166-193, 206-215`
- Modify: `public/about.html:47-51`

**Interfaces:**
- Consumes: Task 2 `renderImage` decorative/eager/high semantics and fixed `mediaIdFor("shared", "shared-about-project")` mapping.
- Produces: one runtime-owned decorative About hero node; `hero_image_url` remains normalized for API compatibility but is never used by the media renderer.

- [ ] **Step 1: Add failing About ownership and accessibility tests**

Read `public/about.html` in `scripts/test-about.js` and add:

```js
const html = fs.readFileSync(path.join(__dirname, "../public/about.html"), "utf8");
assert.doesNotMatch(html, /data-about-hero-image/, "About must not keep a competing static hero image");
assert.match(html, /class="about-page__hero-media" aria-hidden="true"/);
assert.match(html, /data-about-hero-fallback/);
assert.equal((source.match(/fetchPriority:\s*"high"/g) || []).length, 1);
assert.match(source, /mediaIdFor\("shared", "shared-about-project"\)/);
assert.match(source, /decorative:\s*true[\s\S]*?loading:\s*"eager"[\s\S]*?fetchPriority:\s*"high"[\s\S]*?sizes:\s*"100vw"/);
assert.doesNotMatch(source, /renderImage\([\s\S]*?hero_image_url/);
```

Keep the existing `normalizeSettingsResponse` expectation containing `hero_image_url`; this proves the API contract is preserved even though rendering ignores it.

- [ ] **Step 2: Run About test to prove RED**

Run: `node scripts/test-about.js`

Expected: FAIL because the static hero `<img>` remains and runtime options lack decorative/high semantics.

- [ ] **Step 3: Simplify About media ownership**

Remove only this static node from `public/about.html`:

```html
<img class="about-page__hero-image" data-about-hero-image alt="" hidden>
```

In `public/js/about.js`, remove the `heroImage` query and replace `setImage(image, fallback, _value, altKey)` with a zero-URL renderer:

```js
function renderHeroMedia(fallback) {
  if (!global.TakhunMedia?.renderImage || !heroMedia) { fallback.hidden = false; return; }
  fallback.hidden = true;
  global.TakhunMedia.renderImage(heroMedia, {
    mediaId: global.TakhunMedia.mediaIdFor("shared", "shared-about-project"),
    type: "shared", role: "hero", className: "about-page__hero-image",
    decorative: true, loading: "eager", fetchPriority: "high", sizes: "100vw",
    lang: global.TakhunI18n?.getCurrentLang?.(),
    fallbackFactory: () => { fallback.hidden = false; return fallback; }
  });
}
```

Call `renderHeroMedia(heroFallback)` from `renderReady`. Do not remove `hero_image_url` from normalization, API tests, or settings data.

- [ ] **Step 4: Run GREEN and focused regressions**

Run:

```powershell
node scripts/test-about.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-about.ps1
node scripts/test-media.js
node --check public/js/about.js
```

Expected: About behavior/static contracts and shared media tests pass.

- [ ] **Step 5: Inspect and commit Task 8**

Run:

```powershell
git diff --check
git diff -- public/about.html public/js/about.js scripts/test-about.js
git add public/about.html public/js/about.js scripts/test-about.js
git commit -m "feat: connect about production hero"
```

Expected staged files: exactly those three paths.

---

### Task 9: Align Media Ratios, Add Static Security Contracts, and Run Final Regression

**Files:**
- Modify: `scripts/test-media.js:249-279`
- Modify: `public/css/components.css:60-67, 144, 174, 197-213, 298-300, 410-412, 509-510`

**Interfaces:**
- Consumes: approved ratios from the existing manifest pipeline: cover/gallery 3:2, route card 16:9, product 1:1.
- Produces: CSS aspect-ratio contracts and repository-wide static assertions that in-scope controllers use the one shared renderer without private/remote production sources.

- [ ] **Step 1: Add failing CSS and source-safety tests**

Add these exact test blocks to `scripts/test-media.js`:

```js
await test("public media containers match approved production ratios", () => {
  const css = fs.readFileSync(path.join(root, "public/css/components.css"), "utf8");
  assert.match(css, /\.home-page \.place-card__media[^\{]*\{[^}]*aspect-ratio:\s*3\s*\/\s*2/);
  assert.match(css, /\.home-page \.route-card__media[^\{]*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(css, /\.place-card--listing \.place-card__image-wrap[^\{]*\{[^}]*aspect-ratio:\s*3\s*\/\s*2/);
  assert.match(css, /\.place-detail-page \.detail-gallery__media[^\{]*\{[^}]*aspect-ratio:\s*3\s*\/\s*2/);
  assert.match(css, /\.routes-page \.route-explorer-card__media[^\{]*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(css, /\.products-page \.product-card__media[^\{]*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(css, /\.events-page \.event-card__media[^\{]*\{[^}]*aspect-ratio:\s*3\s*\/\s*2/);
  assert.match(css, /\.gallery-page \.gallery-card__image[^\{]*\{[^}]*aspect-ratio:\s*3\s*\/\s*2/);
});

await test("public controllers never render API image URLs or private media sources", () => {
  const files = ["home.js", "places.js", "place-detail.js", "routes.js", "products.js", "events.js", "gallery.js", "about.js"];
  for (const file of files) {
    const controller = fs.readFileSync(path.join(root, "public/js", file), "utf8");
    assert.equal(controller.includes("media-source"), false, file);
    assert.equal(/\.innerHTML\s*=/.test(controller), false, file);
    const calls = controller.match(/TakhunMedia(?:\?\.)?\.renderImage\([\s\S]*?\}\s*\)/g) || [];
    for (const call of calls) assert.equal(/\b(?:cover_image_url|image_url|thumbnail_url|hero_image_url)\b/.test(call), false, `${file}: ${call}`);
  }
});
```

- [ ] **Step 2: Run the media test to prove RED**

Run: `node scripts/test-media.js`

Expected: FAIL on current 4:3 Product/Gallery, 16:10 Event, missing scoped Home/Route ratio declarations, and Place gallery ratio.

- [ ] **Step 3: Apply minimal scoped CSS ratio rules**

Update only existing media-container selectors:

```css
.home-page .place-card__media,
.home-page .event-card__media { aspect-ratio: 3 / 2; min-height: 0; }
.home-page .route-card__media { aspect-ratio: 16 / 9; min-height: 0; }
.place-card--listing .place-card__image-wrap { aspect-ratio: 3 / 2; min-height: 0; }
.place-detail-page .detail-gallery__media { aspect-ratio: 3 / 2; }
.routes-page .route-explorer-card__media { aspect-ratio: 16 / 9; min-height: 0; }
.products-page .product-card__media { aspect-ratio: 1 / 1; }
.events-page .event-card__media { aspect-ratio: 3 / 2; }
.gallery-page .gallery-card__image { aspect-ratio: 3 / 2; }
```

Remove or override the desktop featured-route `min-height: 27rem` declarations that force a non-16:9 crop. Preserve image `object-fit: cover`, Gallery lightbox `contain`, hero tall crops, overlays, pseudo-landscape fallback layers, and existing breakpoints.

- [ ] **Step 4: Run GREEN, focused page contracts, and manual QA**

Run:

```powershell
node scripts/test-media.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-home.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-places.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-place-detail.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-routes.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-products.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-events.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-gallery.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-about.ps1
```

In a second terminal, run `python -m http.server 8000 --directory public`, open `http://localhost:8000/`, and complete this matrix with cache disabled once and enabled once. Stop the local server after QA:

| View | Required checks |
| --- | --- |
| Mobile TH | Home, all list/detail pages, Gallery dialog, About; verify crop, local fallback, touch controls, Thai informative alt, and no overflow. |
| Mobile EN | Switch language on covered and uncovered records; verify English manifest alt, decorative empty alt, no duplicate runtime nodes, and stable state labels. |
| Desktop TH | Verify multi-column candidate sizing, featured routes, split details, route stops, Gallery grid/lightbox, and hero contrast. |
| Desktop EN | Keyboard through cards/favorites/Gallery; verify focus restoration, non-repetitive announcements, overlays, and one high-priority primary image per applicable page. |

In browser network tools confirm image requests are only the same-origin manifest, generated WebP paths, and local SVG placeholders. The existing external-video path may request a validated video only after the established Gallery action.

- [ ] **Step 5: Inspect and commit Task 9**

Run:

```powershell
git diff --check
git diff -- public/css/components.css scripts/test-media.js
git add public/css/components.css scripts/test-media.js
git commit -m "style: align production media aspect ratios"
```

Expected staged files: exactly `public/css/components.css` and `scripts/test-media.js`.

## Acceptance-Criteria Traceability

| Approved design criterion | Plan coverage |
| --- | --- |
| One shared runtime; no page-specific manifest/picture builder | Tasks 1–2 define the runtime; Tasks 3–8 only pass options; Task 9 source scan. |
| Stable entity-ID mapping with no API/Sheet changes | Tasks 3–8 mapping assertions; Global Constraints. |
| Local generated paths and placeholders only | Tasks 1–2 validation/error tests; Task 9 source scan. |
| Responsive `srcset`, `sizes`, and intrinsic dimensions | Tasks 1–2 model/DOM tests; Tasks 3–8 exact sizes; Task 9 ratios. |
| One eager high-priority primary image per applicable page | Tasks 3–6 and 8 exact-count tests; Task 7 explicitly remains normal priority. |
| Manifest bilingual alt and decorative empty alt | Tasks 1–2 runtime tests; Tasks 3–8 page semantics. |
| Safe unknown-ID/manifest/image/placeholder failure | Tasks 1–2 failure tests; Tasks 4–6 uncovered entities rely on that single behavior. |
| Gallery valid local image ID with empty URL | Task 7. |
| Gallery videos unchanged | Task 7 direct/external/invalid video assertions. |
| Place detail does not render URL-array galleries | Task 4. |
| About has one decorative runtime-owned hero | Task 8. |
| Card/profile ratios and overlay preservation | Task 2 sibling test; Task 9 CSS/static and manual QA. |
| No source leak, unsafe URL, or `innerHTML` regression | Tasks 1–2 strict allowlists; Task 9 source scan; existing media hash/leak tests. |
| Private/generated/manifest assets unchanged | Global Constraints and Final Changed-File Inspection. |
| Tests and build green | Focused commands per task and Final Acceptance Commands. |

## Final Changed-File Inspection

The implementation should contain only these production/test paths:

```text
public/about.html
public/css/components.css
public/js/about.js
public/js/events.js
public/js/gallery.js
public/js/home.js
public/js/media.js
public/js/place-detail.js
public/js/places.js
public/js/products.js
public/js/routes.js
scripts/test-about.js
scripts/test-events.js
scripts/test-gallery.js
scripts/test-home.js
scripts/test-media.js
scripts/test-place-detail.js
scripts/test-places.js
scripts/test-products.js
scripts/test-routes.js
```

Before acceptance, compare `git diff --name-only origin/main...HEAD` with this allowlist plus the approved design and this plan. Fail the review if any Apps Script, API, canonical data, admin, package, lock, media source, generated asset, manifest, placeholder, or deployment path appears.

The live Gallery record remains an operational/content concern. Its absence does not authorize a Sheet, Apps Script, API, or mock-data change in this plan.

## Final Acceptance Commands

- [ ] `npm.cmd test`
- [ ] `npm.cmd run build`
- [ ] JavaScript syntax check for tracked `*.js`:

  ```powershell
  git ls-files "*.js" | ForEach-Object { node --check $_; if ($LASTEXITCODE -ne 0) { throw "JavaScript syntax check failed: $_" } }
  ```

- [ ] `git diff --check`
- [ ] Final changed-file inspection:

  ```powershell
  git status --short --branch
  git diff --name-status origin/main...HEAD
  git diff --stat origin/main...HEAD
  git diff --name-only origin/main...HEAD | Where-Object { $_ -match '^(apps-script/|media-source/|media/media-spec\.json$|public/assets/media/|public/admin/|public/js/(api|content-data|place-data)\.js$|package(?:-lock)?\.json$)' }
  ```

  Expected final command output: empty. The name-status/stat outputs must contain only the approved design, this plan, and the implementation allowlist above.
