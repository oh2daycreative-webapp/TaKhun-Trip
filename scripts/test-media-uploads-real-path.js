"use strict";
// Task 13: public site upload layer, on the real pages in headless Chrome.
// - public/ is served by a local HTTP server; config.js, the media manifest, every https://script.google.com request
//   and the media origin are intercepted with CDP Fetch, so nothing leaves the machine (the repo config.js points at
//   production; it is never contacted).
// - getPlaceUploads is answered by the REAL backend (apps-script/*.gs via routeRequest_ GET, scripts/test-media-backend-
//   fake.js) after real uploads through adminUploadPlaceImage / adminSavePlaceUploads; images are the real stored bytes.
// - Criterion 15: with no MEDIA_ORIGIN, an API error, a malformed answer, a 4 s timeout or a broken image, the hero,
//   gallery and nearby cards are byte-identical to the page without the upload layer.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const vm = require("node:vm");
const sharp = require("sharp");
const { withCdpBrowser } = require("./test-admin-reviews-cdp.js");
const { createBackend } = require("./test-media-backend-fake.js");

const root = path.join(__dirname, "..");
const PUBLIC = path.join(root, "public");
const P1 = "BTK-001"; // in the bundled content data, has a manifest cover; gets uploads
const P2 = "PLC-23f91739-de8c-4f07-8705-11d88ee1b739"; // manifest cover only
const ORIGIN = "https://media-qa.example";
const API = "https://script.google.com/macros/s/TEST-STAGING/exec";
const EDITOR = "-".padEnd(42, "E") + "A";
const browser = [process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
  process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft/Edge/Application/msedge.exe")].find((p) => p && fs.existsSync(p));
assert.ok(browser, "Chrome or Edge is required");

// ---- fixtures ----
function contentPlace(id) {
  const context = { window: {}, console };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(PUBLIC, "js/content-data.js"), "utf8"), context);
  const place = context.window.TakhunContentData.getPlaceById(id);
  assert.ok(place, "fixture place exists in content-data: " + id);
  return JSON.parse(JSON.stringify(place));
}
function manifestFixture() {
  const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, "assets/media/manifest/media-manifest.json"), "utf8"));
  const cover = manifest.items.find((item) => item.entity_type === "place" && item.entity_id === P1 && item.role === "cover");
  // One manifest gallery photo for P1 (no place has one today), reusing the existing generated cover files.
  manifest.items.push(Object.assign({}, cover, { media_id: "place-qa-manifest-gallery-1", role: "gallery", required: false, alt_th: "แกลเลอรีเดิม", alt_en: "Manifest gallery" }));
  return manifest;
}
async function pair(width, height, color) {
  const svg = (w, h) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${color}"/><rect width="30%" height="20%" fill="#fff"/></svg>`);
  const large = await sharp(svg(width, height)).webp({ quality: 80 }).toBuffer();
  const small = await sharp(svg(800, Math.round(height * 800 / width))).webp({ quality: 80 }).toBuffer();
  return { format: "webp", large_b64: large.toString("base64"), small_b64: small.toString("base64") };
}
async function seededBackend() {
  const backend = createBackend({ placeId: P1, places: [[P2, "published"]], admins: { [EDITOR]: { admin_id: "ADM-22222222-2222-4222-8222-222222222222", role: "editor" } } });
  const upload = async (picture, captions) => {
    const result = JSON.parse(backend.handle(JSON.stringify({ action: "adminUploadPlaceImage", token: EDITOR, payload: Object.assign({ place_id: P1 }, picture, captions) })));
    assert.equal(result.ok, true, JSON.stringify(result));
    return result.data.item;
  };
  const cover = await upload(await pair(1600, 1067, "#1565c0"), { caption_th: "ปกที่อัปโหลด", caption_en: "Uploaded cover" });
  const g1 = await upload(await pair(1600, 1200, "#2e7d32"), { caption_th: "ทะเลสาบ", caption_en: "Lake" });
  const g2 = await upload(await pair(1200, 800, "#6a1b9a"));
  const ids = [cover.upload_id, g1.upload_id, g2.upload_id];
  const saved = JSON.parse(backend.handle(JSON.stringify({ action: "adminSavePlaceUploads", token: EDITOR, payload: { place_id: P1, expected_ids: ids, order: ids, cover_id: cover.upload_id, captions: {} } })));
  assert.equal(saved.ok, true, JSON.stringify(saved));
  return { backend, cover, g1, g2 };
}

// ---- local server for public/ + a cards harness ----
function startServer() {
  const cards = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>cards</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<div id="p1-card"></div><div id="p2-card"></div><div id="p1-hero"></div><div id="product-card"></div></main>
<script src="/js/config.js"></script><script src="/js/api.js"></script><script src="/js/media.js"></script>
<script>
  const render = (id, options) => TakhunMedia.renderImage(document.getElementById(id), Object.assign({ lang: "th", sizes: "100vw" }, options));
  render("p1-card", { mediaId: TakhunMedia.mediaIdFor("place", ${JSON.stringify(P1)}), type: "place", role: "cover", decorative: true });
  render("p2-card", { mediaId: TakhunMedia.mediaIdFor("place", ${JSON.stringify(P2)}), type: "place", role: "cover", decorative: true });
  render("p1-hero", { mediaId: TakhunMedia.mediaIdFor("place", ${JSON.stringify(P1)}), type: "place", role: "hero", fallbackAlt: "P1" });
  render("product-card", { mediaId: TakhunMedia.mediaIdFor("product", "PROD-001"), type: "product", role: "product", decorative: true });
</script></body></html>`;
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png" };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://x").pathname);
    if (pathname === "/__cards.html") { response.writeHead(200, { "content-type": types[".html"] }); response.end(cards); return; }
    const file = path.join(PUBLIC, path.normalize(pathname === "/" ? "/index.html" : pathname));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// ---- one page load under a given scenario ----
// scenario: { origin: true|false, api: "ok"|"error"|"malformed"|"hang", images: "ok"|"broken" }
async function load(base, pagePath, scenario, fixtures, evaluate) {
  const seen = { uploads: [], api: [] };
  return withCdpBrowser(browser, { timeoutMs: 20000, commandTimeoutMs: 60000 }, async (session) => {
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await session.send("Fetch.enable", { patterns: [{ urlPattern: base + "/js/config.js" }, { urlPattern: base + "/assets/media/manifest/media-manifest.json" }, { urlPattern: "https://script.google.com/*" }, { urlPattern: ORIGIN + "/*" }] });
    const fulfill = (requestId, status, body, type) => session.send("Fetch.fulfillRequest", { requestId, responseCode: status, responseHeaders: [{ name: "content-type", value: type }, { name: "access-control-allow-origin", value: "*" }], body: Buffer.from(body).toString("base64") }).catch(() => {});
    session.waitForEvent("Fetch.requestPaused", (event) => {
      const address = new URL(event.request.url);
      if (address.pathname === "/js/config.js" && address.origin === base) {
        const config = { API_URL: API, SITE_URL: "https://takhun-trip.pages.dev", DEFAULT_LANG: "th" };
        if (scenario.origin) config.MEDIA_ORIGIN = ORIGIN;
        fulfill(event.requestId, 200, `"use strict";\nconst APP_CONFIG = Object.freeze(${JSON.stringify(config)});\n`, "text/javascript");
      } else if (address.pathname.endsWith("media-manifest.json")) {
        fulfill(event.requestId, 200, JSON.stringify(fixtures.manifest), "application/json");
      } else if (address.hostname === "script.google.com") {
        const parameter = Object.fromEntries(address.searchParams.entries());
        seen.api.push(parameter.action);
        if (parameter.action === "getPlaceUploads") {
          seen.uploads.push(parameter.place_id || "");
          if (scenario.api === "hang") return false; // never answered: the page must give up after 4 s
          if (scenario.api === "error") { fulfill(event.requestId, 500, "error", "text/plain"); return false; }
          if (scenario.api === "malformed") { fulfill(event.requestId, 200, '{"ok":true,"data":{"covers":{"' + P1 + '":{"key_large":"https://evil.example/x.webp"}}}}', "application/json"); return false; }
          fulfill(event.requestId, 200, fixtures.backend.handleGet(parameter), "application/json");
        } else if (parameter.action === "getPlaceDetail") {
          fulfill(event.requestId, 200, JSON.stringify({ ok: true, data: fixtures.place, message: "success" }), "application/json");
        } else {
          fulfill(event.requestId, 200, fixtures.backend.handleGet(parameter), "application/json");
        }
      } else if (address.origin === ORIGIN) {
        const key = address.pathname.slice(1);
        const bytes = fixtures.backend.objects.get(key);
        if (scenario.images === "broken" || !bytes) fulfill(event.requestId, 404, "", "text/plain");
        else fulfill(event.requestId, 200, bytes, key.endsWith(".jpg") ? "image/jpeg" : "image/webp");
      } else {
        session.send("Fetch.continueRequest", { requestId: event.requestId }).catch(() => {});
      }
      return false;
    }, 600000).catch(() => {});
    const loaded = session.waitForEvent("Page.loadEventFired");
    await session.send("Page.navigate", { url: base + pagePath });
    await loaded;
    const result = await session.evaluate(evaluate(scenario));
    return Object.assign(JSON.parse(result), { seen });
  });
}

const settleScript = (extraMs) => `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (test, ms) => { const end = Date.now() + ms; while (Date.now() < end && !test()) await sleep(25); return test(); };
  const html = (node) => node ? node.outerHTML.replace(/ (?:fetchpriority|loading|decoding)="[^"]*"/g, "") : "";
  await sleep(${extraMs});`;

const detailEval = (scenario) => `(async () => {
  ${settleScript(0)}
  await until(() => document.querySelector("[data-detail-content]") && !document.querySelector("[data-detail-content]").hidden && document.querySelector("[data-detail-hero-media] [data-media-runtime]"), 10000);
  const expectUploaded = ${JSON.stringify(Boolean(scenario.expectUploaded))};
  if (expectUploaded) await until(() => document.querySelector("[data-detail-hero-media] [data-media-runtime=uploaded]") && document.querySelectorAll("[data-detail-gallery] [data-upload-gallery]").length === 2, 8000);
  await sleep(${scenario.api === "hang" ? 4600 : 900});
  const hero = document.querySelector("[data-detail-hero-media]");
  const gallery = document.querySelector("[data-detail-gallery]");
  const nearby = document.querySelector("[data-detail-nearby]");
  const out = {
    hero: html(hero), gallery: html(gallery), nearbyMedia: Array.from(document.querySelectorAll(".detail-nearby-card__media")).map(html),
    heroRuntime: hero.querySelector("[data-media-runtime]").getAttribute("data-media-runtime"),
    heroImg: (() => { const img = hero.querySelector("img"); return img ? { src: img.getAttribute("src"), srcset: img.getAttribute("srcset"), alt: img.alt, complete: img.complete && img.naturalWidth > 0 } : null; })(),
    galleryHidden: gallery.hidden,
    galleryItems: Array.from(gallery.querySelectorAll(".detail-gallery__item")).map((button) => { const img = button.querySelector("img"); return { uploaded: button.hasAttribute("data-upload-gallery"), label: button.getAttribute("aria-label"), alt: img ? img.alt : "", src: img ? img.getAttribute("src") : "" }; })
  };
  const uploadedButton = gallery.querySelector("[data-upload-gallery]");
  if (uploadedButton) {
    uploadedButton.click();
    await until(() => { const i = document.querySelector("[data-lightbox-media] img"); return i && i.complete && i.naturalWidth > 0; }, 4000);
    const img = document.querySelector("[data-lightbox-media] img");
    out.lightbox = img ? { src: img.getAttribute("src"), alt: img.alt } : null;
  }
  return JSON.stringify(out);
})()`;

const cardsEval = (scenario) => `(async () => {
  ${settleScript(0)}
  await until(() => document.querySelector("#p2-card [data-media-runtime=picture]"), 8000);
  if (${JSON.stringify(Boolean(scenario.expectUploaded))}) await until(() => document.querySelector("#p1-card [data-media-runtime=uploaded]"), 8000);
  await sleep(${scenario.api === "hang" ? 4600 : 900});
  const read = (id) => { const node = document.getElementById(id); const runtime = node.querySelector("[data-media-runtime]"); const img = node.querySelector("img"); return { html: html(node), runtime: runtime && runtime.getAttribute("data-media-runtime"), src: img && img.getAttribute("src"), alt: img && img.alt }; };
  return JSON.stringify({ p1: read("p1-card"), p2: read("p2-card"), hero: read("p1-hero"), product: read("product-card") });
})()`;

(async () => {
  const { backend, cover, g1, g2 } = await seededBackend();
  const place = contentPlace(P1);
  place.gallery_media_ids = ["place-qa-manifest-gallery-1"];
  const fixtures = { backend, manifest: manifestFixture(), place };
  const server = await startServer();
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const detail = (scenario) => load(base, "/place-detail.html?id=" + encodeURIComponent(P1), scenario, fixtures, detailEval);
    const cards = (scenario) => load(base, "/__cards.html", scenario, fixtures, cardsEval);

    // --- place detail page ---
    const today = await detail({ origin: false, api: "ok", images: "ok" });
    assert.deepEqual(today.seen.uploads, [], "no MEDIA_ORIGIN: no getPlaceUploads call at all");
    assert.equal(today.heroRuntime, "picture", "today: manifest hero");
    assert.deepEqual(today.galleryItems.map((item) => item.uploaded), [false], "today: manifest gallery only");

    const live = await detail({ origin: true, api: "ok", images: "ok", expectUploaded: true });
    assert.deepEqual(live.seen.uploads, [P1], "exactly one getPlaceUploads call, for this place");
    assert.equal(live.heroRuntime, "uploaded");
    assert.equal(live.heroImg.src, ORIGIN + "/" + cover.key_large);
    assert.equal(live.heroImg.srcset, `${ORIGIN}/${cover.key_small} 800w, ${ORIGIN}/${cover.key_large} 1600w`);
    assert.equal(live.heroImg.complete, true);
    assert.equal(live.heroImg.alt, "ปกที่อัปโหลด", "caption used as alt");
    assert.deepEqual(live.galleryItems.map((item) => item.uploaded), [false, true, true], "manifest gallery first, then uploads; cover not repeated");
    assert.deepEqual(live.galleryItems.slice(1).map((item) => item.src), [ORIGIN + "/" + g1.key_large, ORIGIN + "/" + g2.key_large]);
    assert.equal(live.galleryItems[1].alt, "ทะเลสาบ");
    assert.equal(live.galleryItems[1].label, "ทะเลสาบ");
    assert.ok(live.galleryItems[2].alt.length > 0, "a photo without caption still has alt text");
    assert.deepEqual(live.lightbox, { src: ORIGIN + "/" + g1.key_large, alt: "ทะเลสาบ" });
    assert.deepEqual(live.nearbyMedia, today.nearbyMedia, "nearby cards keep their manifest covers (one call per page)");

    for (const scenario of [{ api: "error" }, { api: "malformed" }, { api: "hang" }, { api: "ok", images: "broken" }]) {
      const fallback = await detail(Object.assign({ origin: true, images: "ok" }, scenario));
      const label = JSON.stringify(scenario);
      assert.deepEqual(fallback.seen.uploads, [P1], label + ": one call");
      assert.equal(fallback.hero, today.hero, label + ": hero identical to today");
      assert.equal(fallback.gallery, today.gallery, label + ": gallery identical to today");
      assert.deepEqual(fallback.nearbyMedia, today.nearbyMedia, label + ": nearby identical to today");
    }

    // --- cards (home / places / map / search all use the same renderer) ---
    const cardsToday = await cards({ origin: false, api: "ok", images: "ok" });
    assert.deepEqual(cardsToday.seen.uploads, []);
    const cardsLive = await cards({ origin: true, api: "ok", images: "ok", expectUploaded: true });
    assert.deepEqual(cardsLive.seen.uploads, [""], "one covers call for the whole page, however many cards");
    assert.deepEqual([cardsLive.p1.runtime, cardsLive.p1.src, cardsLive.p1.alt], ["uploaded", ORIGIN + "/" + cover.key_large, ""], "decorative card stays alt=\"\"");
    assert.deepEqual([cardsLive.hero.runtime, cardsLive.hero.alt], ["uploaded", "ปกที่อัปโหลด"]);
    assert.equal(cardsLive.p2.html, cardsToday.p2.html, "a place without an uploaded cover is unchanged");
    assert.equal(cardsLive.product.html, cardsToday.product.html, "non-place images are unchanged");
    for (const scenario of [{ api: "error" }, { api: "hang" }, { api: "ok", images: "broken" }]) {
      const fallback = await cards(Object.assign({ origin: true, images: "ok" }, scenario));
      for (const id of ["p1", "p2", "hero", "product"]) assert.equal(fallback[id].html, cardsToday[id].html, JSON.stringify(scenario) + " " + id);
    }
    console.log("Public upload layer real-path check passed (detail page + cards; no origin / error / malformed / 4 s timeout / broken image = today).");
  } finally {
    server.close();
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
