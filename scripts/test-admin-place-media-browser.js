"use strict";
// Native browser check for the Hero and Gallery option previews (F-31). The real admin-place-media.js runs in headless
// Chrome/Edge from an `admin/` folder, as on the site; the manifest paths are site-root relative, so every preview
// must load from `<root>/assets/...`, never `<root>/admin/assets/...`.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { pathToFileURL } = require("node:url");
const { withCdpBrowser } = require("./test-admin-reviews-cdp.js");

const root = path.join(__dirname, "..");
const moduleSource = fs.readFileSync(path.join(root, "public/admin/js/admin-place-media.js"), "utf8");
const browsers = [
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
  process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft/Edge/Application/msedge.exe")
];
const browser = browsers.find((candidate) => candidate && fs.existsSync(candidate));
assert.ok(browser, "Chrome or Edge is required for the native place media preview check");

const ids = ["place-plc-a-cover", "place-plc-a-gallery-a", "place-plc-a-gallery-b"];
const item = (media_id, role) => ({
  media_id, entity_type: "place", entity_id: "PLC-A", role, alt_th: `ภาพ ${media_id}`, alt_en: media_id,
  fallback: `assets/media/placeholders/${role}.svg`,
  outputs: [{ width: 64, height: 48, path: `assets/media/generated/places/${media_id}-64.webp` }]
});

function page() {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="root"><div id="hero"></div><div id="options"></div><ol id="selected"></ol><p id="status"></p>
<div id="form"><input id="search"><button id="go">ค้นหา</button></div><button id="prev"></button><span id="page"></span><button id="next"></button></div>
<script>${moduleSource}</script><script>
window.__mediaRun = (async () => {
  const $ = (id) => document.getElementById(id);
  await window.TakhunAdminPlaceMedia.init({
    mode: "edit", placeId: "PLC-A", hero: ${JSON.stringify(item(ids[0], "cover"))}, selectedIds: [],
    mounts: { root: $("root"), hero: $("hero"), options: $("options"), selected: $("selected"), status: $("status"),
      searchForm: $("form"), searchInput: $("search"), searchButton: $("go"), previous: $("prev"), next: $("next"), page: $("page") },
    loadOptions: async () => ({ items: ${JSON.stringify(ids.slice(1).map((id) => item(id, "gallery")))}, page: 1, page_size: 20, total: 2, total_pages: 1 })
  });
  const images = Array.from(document.querySelectorAll("img"));
  await Promise.all(images.map((img) => img.complete ? null : new Promise((done) => { img.addEventListener("load", done); img.addEventListener("error", done); })));
  return JSON.stringify(images.map((img) => ({ src: img.src, width: img.naturalWidth })));
})().catch((error) => "FAIL " + error.message);
</script></body></html>`;
}

(async () => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), "takhun-place-media-browser-"));
  let raw;
  try {
    const generated = path.join(site, "assets/media/generated/places");
    fs.mkdirSync(generated, { recursive: true });
    fs.mkdirSync(path.join(site, "admin"));
    const webp = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#2f6f4f" } }).webp().toBuffer();
    for (const id of ids) fs.writeFileSync(path.join(generated, `${id}-64.webp`), webp);
    const file = path.join(site, "admin/place-edit-media.html");
    fs.writeFileSync(file, page());
    raw = await withCdpBrowser(browser, { timeoutMs: 20000, commandTimeoutMs: 60000 }, async (session) => {
      await session.send("Page.enable");
      await session.send("Runtime.enable");
      const loaded = session.waitForEvent("Page.loadEventFired");
      await session.send("Page.navigate", { url: pathToFileURL(file).href });
      await loaded;
      return session.evaluate("window.__mediaRun");
    });
  } finally {
    fs.rmSync(site, { recursive: true, force: true });
  }
  assert.equal(typeof raw, "string", "browser result missing");
  assert.ok(!raw.startsWith("FAIL"), raw.slice(0, 300));
  const images = JSON.parse(raw);
  assert.equal(images.length, 3, "Hero preview + 2 Gallery option previews");
  for (const image of images) {
    assert.doesNotMatch(image.src, /\/admin\/assets\//, `F-31: ${image.src} resolves under /admin/`);
    assert.match(image.src, /\/assets\/media\/generated\/places\/place-plc-a-[a-z-]+-64\.webp$/);
    assert.equal(image.width, 64, `preview did not load: ${image.src}`);
  }
  console.log("Admin place media native browser check passed: Hero and 2 Gallery previews load from the site root.");
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
