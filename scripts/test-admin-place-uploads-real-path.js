"use strict";
// Task 11 bug fix (live staging, 2026-10-31): the real response {"ok":true,"data":{...}} (no "message") was shown as
// "โหลดรายการรูปไม่สำเร็จ" because admin-api.js required a "message" key, and the UI test stubbed admin-api.js out.
// This test runs the REAL path in headless Chrome: real admin-api.js + real admin-image-resize.js + real
// admin-place-uploads.js; every fetch goes over a CDP binding to the REAL backend (apps-script/*.gs via
// routeRequest_, fakes only for Sheets/R2/Lock/Cache) and gets the server's exact response text back.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const sharp = require("sharp");
const { withCdpBrowser } = require("./test-admin-reviews-cdp.js");
const { createBackend } = require("./test-media-backend-fake.js");

const root = path.join(__dirname, "..");
const PLACE = "PLC-dd3b43b8-b698-416f-8494-4b44f1659654";
const TOKEN = "-".padEnd(42, "A") + "A";
const ADMIN = { admin_id: "ADM-22222222-2222-4222-8222-222222222222", role: "editor" };
const LIVE_LIST_RESPONSE = '{"ok":true,"data":{"enabled":true,"can_write":true,"limits":{"per_place":20,"daily_left":96,"max_bytes_large":2097152,"max_bytes_small":614400},"items":[],"delete_pending":0}}';
const browser = [process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
  process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft/Edge/Application/msedge.exe")].find((p) => p && fs.existsSync(p));
assert.ok(browser, "Chrome or Edge is required");
const url = (file) => pathToFileURL(path.join(root, file)).href;

async function photo(width, height, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/><rect width="40%" height="20%" fill="#fff"/></svg>`;
  return (await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer()).toString("base64");
}

function page() {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${url("public/css/main.css")}"><link rel="stylesheet" href="${url("public/css/admin.css")}"><link rel="stylesheet" href="${url("public/css/admin-places.css")}"></head>
<body><main><section data-admin-place-uploads hidden></section></main>
<script>
  const APP_CONFIG = Object.freeze({ API_URL: "https://script.google.com/macros/s/AKfycbzlF57vzvOiISulDbC7P6Y2CDEqhqC3NUZWFrd-I9KIBDEN6hYfpfhVWkmdlS9RxmXP9g/exec", DEFAULT_LANG: "th" });
  window.consoleLines = [];
  for (const level of ["log", "info", "warn", "error"]) { const original = console[level].bind(console); console[level] = (...args) => { consoleLines.push(level + ": " + args.join(" ")); original(...args); }; }
  // fetch → CDP binding → real backend in Node. "failNext" makes the next request fail like a dropped connection.
  window.pending = {}; window.requests = []; window.failNext = 0; let next = 0;
  window.fetch = (address, options) => new Promise((resolve, reject) => {
    const body = JSON.parse(options.body); requests.push(body.action);
    if (failNext > 0) { failNext -= 1; reject(new TypeError("Failed to fetch")); return; }
    const id = ++next; pending[id] = resolve; window.__backend(JSON.stringify({ id, body: options.body }));
  });
  window.__reply = (id, text) => { const resolve = pending[id]; delete pending[id]; resolve({ ok: true, status: 200, text: async () => text }); };
</script>
<script src="${url("public/admin/js/admin-api.js")}"></script>
<script src="${url("public/admin/js/admin-image-resize.js")}"></script>
<script src="${url("public/admin/js/admin-place-uploads.js")}"></script>
</body></html>`;
}

const scenario = (photos) => `(async () => {
  const out = {};
  const settle = async () => { for (let i = 0; i < 30; i += 1) await new Promise((r) => setTimeout(r, 20)); };
  const until = async (test) => { for (let i = 0; i < 300 && !test(); i += 1) await new Promise((r) => setTimeout(r, 50)); };
  const visible = (n) => Boolean(n) && !n.hidden && !n.closest("[hidden]");
  const root = document.querySelector("[data-admin-place-uploads]");
  const init = () => TakhunAdminPlaceUploads.init({ root, api: TakhunAdminApi, resize: TakhunImageResize, token: ${JSON.stringify(TOKEN)}, placeId: ${JSON.stringify(PLACE)}, archived: false, mediaOrigin: "" });
  // 1. First load fails like a dropped connection → read error; retry must send a NEW request and then load.
  failNext = 1;
  let c = await init();
  out.readError = { box: visible(root.querySelector(".admin-uploads__read-error")), status: root.querySelector(".admin-uploads__result-text").textContent, requests: requests.length, console: consoleLines.slice() };
  root.querySelector(".admin-uploads__read-error button").click();
  await until(() => c.snapshot().loaded); await settle();
  out.retry = { requests: requests.length, box: visible(root.querySelector(".admin-uploads__read-error")), loaded: c.snapshot().loaded, empty: visible(root.querySelector(".admin-uploads__empty")),
    quota: root.querySelector(".admin-uploads__quota").textContent, picker: visible(root.querySelector(".admin-uploads__picker")) };
  // 2. Upload through the real client + real resize + real server checks.
  const files = ${JSON.stringify(photos)};
  const dt = new DataTransfer();
  for (const [name, b64] of Object.entries(files)) { const raw = atob(b64); const u = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i += 1) u[i] = raw.charCodeAt(i); dt.items.add(new File([u], name, { type: "image/jpeg" })); }
  const input = root.querySelector("input[type=file]"); input.files = dt.files; input.dispatchEvent(new Event("change"));
  await until(() => !c.snapshot().busy && c.snapshot().queue.length && c.snapshot().queue.every((q) => !["queued", "resizing", "uploading"].includes(q.state))); await settle();
  out.upload = c.snapshot();
  // 3. Save order + cover + captions, then delete one, through the real server.
  const ids = c.snapshot().items;
  c.move(ids[0], 1); c.setCover(ids[0]); c.setCaption(ids[0], "th", "  ทะเลสาบ  "); c.setCaption(ids[0], "en", "=Lake");
  await c.save(); await settle();
  out.save = c.snapshot();
  window.confirm = () => true;
  await c.remove(ids[1]); await settle();
  out.remove = c.snapshot();
  out.requests = requests.slice();
  out.consoleAfter = consoleLines.slice();
  return JSON.stringify(out);
})()`;

(async () => {
  // The live response is exactly what the real backend produces for an empty place.
  const backend = createBackend({ placeId: PLACE, admins: { [TOKEN]: ADMIN } });
  const live = backend.handle(JSON.stringify({ action: "adminGetPlaceUploads", token: TOKEN, payload: { place_id: PLACE } }));
  const normalized = JSON.parse(live); normalized.data.limits.daily_left = 96;
  assert.equal(JSON.stringify(normalized), LIVE_LIST_RESPONSE, "fixture = the response seen live on staging");

  const photos = { "landscape.jpg": await photo(3000, 2000, "#1565c0"), "portrait.jpg": await photo(1500, 2000, "#2e7d32"), "panorama.jpg": await photo(5000, 1000, "#ef6c00") };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "takhun-uploads-real-"));
  const file = path.join(directory, "page.html");
  fs.writeFileSync(file, page());
  let out;
  try {
    out = JSON.parse(await withCdpBrowser(browser, { timeoutMs: 20000, commandTimeoutMs: 120000 }, async (session) => {
      await session.send("Page.enable");
      await session.send("Runtime.enable");
      await session.send("Runtime.addBinding", { name: "__backend" });
      // Answer every page request with the real backend's response text (the predicate never matches: it is a listener).
      session.waitForEvent("Runtime.bindingCalled", (event) => {
        if (event.name !== "__backend") return false;
        const { id, body } = JSON.parse(event.payload);
        const text = backend.handle(body);
        session.send("Runtime.evaluate", { expression: `window.__reply(${id}, ${JSON.stringify(text)})` }).catch(() => {});
        return false;
      }, 600000).catch(() => {});
      const loaded = session.waitForEvent("Page.loadEventFired");
      await session.send("Page.navigate", { url: pathToFileURL(file).href });
      await loaded;
      return session.evaluate(scenario(photos));
    }));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }

  if (process.env.DEBUG_REAL_PATH) console.log(JSON.stringify({ readError: out.readError, retry: out.retry, requests: out.requests, upload: out.upload && out.upload.queue }, null, 1));
  // Bug 2 + logging: a failed read is visible in the console (code only, no token) and retry sends a new request.
  assert.equal(out.readError.box, true);
  assert.equal(out.readError.requests, 1);
  assert.ok(out.readError.console.some((line) => /^warn: \[place uploads\] load: NETWORK_ERROR$/.test(line)), JSON.stringify(out.readError.console));
  assert.equal(out.retry.requests, 2, "retry sends a new request");
  // Bug 1: the real success envelope (no "message") loads.
  assert.deepEqual([out.retry.box, out.retry.loaded, out.retry.empty, out.retry.picker], [false, true, true, true]);
  assert.match(out.retry.quota, /เพิ่มได้อีก 20 รูป · วันนี้อัปโหลดได้อีก 100 รูป/);

  // Real uploads through the real server checks.
  const states = Object.fromEntries(out.upload.queue.map((q) => [q.name, q.state + (q.detail ? ": " + q.detail : "")]));
  assert.deepEqual(states, { "landscape.jpg": "done", "portrait.jpg": "done", "panorama.jpg": "failed: รูปยาวหรือกว้างเกิน 4:1 กรุณาครอปรูปก่อนอัปโหลด" });
  assert.equal(out.upload.items.length, 2);
  assert.equal(backend.table("media_uploads").length, 2, "2 rows (one is deleted later; rows are kept)");
  assert.deepEqual(out.upload.warnings, []);

  // Save and delete through the real server.
  assert.equal(out.save.dirty, false, JSON.stringify(out.save).slice(0, 300));
  assert.equal(out.save.cover, out.upload.items[0]);
  assert.deepEqual(out.save.items, [out.upload.items[1], out.upload.items[0]]);
  const saved = backend.table("media_uploads").find((r) => r.upload_id === out.upload.items[0]);
  assert.deepEqual([saved.is_cover, saved.caption_th, saved.caption_en], ["true", "ทะเลสาบ", "=Lake"]);
  assert.deepEqual(out.remove.items, [out.upload.items[0]]);
  assert.equal(out.remove.status, "ลบรูปแล้ว");
  assert.equal(backend.objects.size, 2);
  assert.deepEqual(out.requests, ["adminGetPlaceUploads", "adminGetPlaceUploads", "adminUploadPlaceImage", "adminUploadPlaceImage", "adminSavePlaceUploads", "adminDeletePlaceUpload"]);
  assert.ok(out.consoleAfter.every((line) => !line.includes(TOKEN)), "no token in the console");
  console.log("Admin place uploads real-path browser check passed (real admin-api.js + resize + backend).");
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
