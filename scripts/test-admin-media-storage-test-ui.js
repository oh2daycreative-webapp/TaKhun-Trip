"use strict";
// Task 12: the R2 connection-test button on the settings page (super_admin only, spec T11, criterion 13).
// Real path in headless Chrome: real admin-api.js + real admin-media-storage-test.js on the settings page CSS; every
// request goes over a CDP binding to the REAL backend (apps-script/*.gs via routeRequest_; fake R2 refuses a wrong
// access key id with 400, like live staging). Checks: super_admin pass (4 steps ผ่าน, green ✓), wrong key (red ✕ +
// hint), missing settings (CONFIG), timeout (yellow ⚠, safe to retry), editor sees nothing and sends nothing, no key
// or secret ever shown, console logging, 360 px layout; plus the page / settings hook statically.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { withCdpBrowser } = require("./test-admin-reviews-cdp.js");
const { createBackend } = require("./test-media-backend-fake.js");

const root = path.join(__dirname, "..");
const SUPER = "-".padEnd(42, "S") + "A", EDITOR = "-".padEnd(42, "E") + "A";
const ADMINS = { [SUPER]: { admin_id: "ADM-33333333-3333-4333-8333-333333333333", role: "super_admin" }, [EDITOR]: { admin_id: "ADM-22222222-2222-4222-8222-222222222222", role: "editor" } };
const browser = [process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
  process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft/Edge/Application/msedge.exe")].find((p) => p && fs.existsSync(p));
assert.ok(browser, "Chrome or Edge is required");
const url = (file) => pathToFileURL(path.join(root, file)).href;
// Task 15 (5 Nov): storage events as the backend keeps them (oldest first); one tampered entry is dropped by the server.
const SEEDED_EVENTS = [
  { at: "2026-11-05T06:30:00.000Z", step: "HEAD health", attempts: "network, network, network", ok: false, ms: 3000 },
  { at: "2026-11-05T06:59:27.123Z", step: "DELETE 800", attempts: "503, 503, 204", ok: true, ms: 3410 },
  { at: "2026-11-05T07:00:00.000Z", step: "<img src=x onerror=alert(1)>", attempts: "403", ok: false, ms: 0 },
  { at: "2026-11-05T07:36:46.000Z", step: "PUT 1600", attempts: "403", ok: false, ms: 0 }];

function staticChecks() {
  const html = fs.readFileSync(path.join(root, "public/admin/settings.html"), "utf8");
  const settings = fs.readFileSync(path.join(root, "public/admin/js/admin-settings.js"), "utf8");
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(scripts.indexOf("js/admin-api.js") < scripts.indexOf("js/admin-media-storage-test.js") && scripts.indexOf("js/admin-media-storage-test.js") < scripts.indexOf("js/admin-settings.js"), scripts.join(" "));
  // Its own section, outside the settings form, hidden until the module shows it for a super_admin.
  assert.match(html, /<\/form>\s*<\/section>\s*<section class="admin-media-test" data-admin-media-test hidden aria-labelledby="admin-media-test-title"><\/section>/);
  // Started from the settings page init with the server-confirmed role; a failure there never blocks the settings form.
  assert.match(settings, /try\{const mediaRoot=global\.document\.querySelector\("\[data-admin-media-test\]"\);if\(mediaRoot&&global\.TakhunAdminMediaStorageTest\)global\.TakhunAdminMediaStorageTest\.init\(\{root:mediaRoot,api:global\.TakhunAdminApi,token:session\.token,role:auth\.admin&&auth\.admin\.role\|\|session\.role\}\);\}catch\(_mediaTestError\)\{\}/);
}

function page() {
  const css = ["main.css", "components.css", "mobile.css", "admin.css"].map((name) => `<link rel="stylesheet" href="${url("public/css/" + name)}">`).join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css}</head>
<body class="admin-body"><main class="admin-main"><section class="admin-media-test" data-admin-media-test hidden aria-labelledby="admin-media-test-title"></section></main>
<script>
  const APP_CONFIG = Object.freeze({ API_URL: "https://script.google.com/macros/s/AKfycbzlF57vzvOiISulDbC7P6Y2CDEqhqC3NUZWFrd-I9KIBDEN6hYfpfhVWkmdlS9RxmXP9g/exec", DEFAULT_LANG: "th" });
  window.consoleLines = [];
  for (const level of ["log", "info", "warn", "error"]) { const original = console[level].bind(console); console[level] = (...args) => { consoleLines.push(level + ": " + args.join(" ")); original(...args); }; }
  window.pending = {}; window.requests = []; window.failNext = 0; let next = 0;
  window.fetch = (address, options) => new Promise((resolve, reject) => {
    const body = JSON.parse(options.body); requests.push(body.action);
    if (failNext > 0) { failNext -= 1; const error = new Error("The operation was aborted."); error.name = "AbortError"; reject(error); return; }
    const id = ++next; pending[id] = resolve; window.__backend(JSON.stringify({ id, body: options.body }));
  });
  window.__reply = (id, text) => { const resolve = pending[id]; delete pending[id]; resolve({ ok: true, status: 200, text: async () => text }); };
</script>
<script src="${url("public/admin/js/admin-api.js")}"></script>
<script src="${url("public/admin/js/admin-media-storage-test.js")}"></script>
</body></html>`;
}

const scenario = `(async () => {
  const out = {};
  const until = async (test) => { for (let i = 0; i < 400 && !test(); i += 1) await new Promise((r) => setTimeout(r, 25)); };
  const visible = (n) => Boolean(n) && !n.hidden && !n.closest("[hidden]") && n.getClientRects().length > 0;
  const rootNode = document.querySelector("[data-admin-media-test]");
  const read = () => ({ visible: visible(rootNode), tone: (rootNode.querySelector(".admin-media-test__result") || {}).dataset ? rootNode.querySelector(".admin-media-test__result").dataset.tone : "",
    icon: (rootNode.querySelector(".admin-media-test__result-icon") || {}).textContent || "", text: (rootNode.querySelector(".admin-media-test__result-text") || {}).textContent || "",
    role: rootNode.querySelector(".admin-media-test__result") && rootNode.querySelector(".admin-media-test__result").getAttribute("role"),
    steps: Array.from(rootNode.querySelectorAll(".admin-media-test__step")).map((n) => n.textContent), all: rootNode.textContent, button: rootNode.querySelector(".admin-media-test__run"),
    eventsVisible: visible(rootNode.querySelector(".admin-media-test__events")), eventsTitle: (rootNode.querySelector(".admin-media-test__events h3") || {}).textContent || "",
    events: Array.from(rootNode.querySelectorAll(".admin-media-test__event")).filter(visible).map((n) => n.textContent),
    eventsEmpty: visible(rootNode.querySelector(".admin-media-test__events-empty")) ? rootNode.querySelector(".admin-media-test__events-empty").textContent : "" });
  const run = async () => { const before = requests.length; read().button.click(); await until(() => requests.length > before && !read().button.disabled); const r = read(); delete r.button; return r; };
  // editor: nothing shown, nothing sent
  let c = TakhunAdminMediaStorageTest.init({ root: rootNode, api: TakhunAdminApi, token: ${JSON.stringify(EDITOR)}, role: "editor" });
  out.editor = { controller: c === null, hidden: rootNode.hidden, children: rootNode.children.length, requests: requests.length };
  // super_admin
  c = TakhunAdminMediaStorageTest.init({ root: rootNode, api: TakhunAdminApi, token: ${JSON.stringify(SUPER)}, role: "super_admin" });
  const initial = read(); delete initial.button;
  out.initial = Object.assign(initial, { requests: requests.length, title: rootNode.querySelector("h2").textContent, buttonText: rootNode.querySelector(".admin-media-test__run").textContent });
  out.pass = await run();
  window.__setEvents(${JSON.stringify(JSON.stringify(SEEDED_EVENTS))});
  out.withEvents = await run();
  window.__setKey("AKIDTESTx");
  out.wrongKey = await run();
  window.__setKey(null);
  out.config = await run();
  window.__setKey("AKIDTEST");
  failNext = 1;
  out.timeout = await run();
  out.again = await run();
  out.requests = requests.slice();
  out.console = consoleLines.slice();
  out.layout = { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, button: Math.round(rootNode.querySelector(".admin-media-test__run").getBoundingClientRect().height) };
  return JSON.stringify(out);
})()`;

async function run(width) {
  const backend = createBackend({ placeId: "PLC-x", admins: ADMINS });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "takhun-media-test-ui-"));
  const file = path.join(directory, "settings.html");
  fs.writeFileSync(file, page());
  try {
    return JSON.parse(await withCdpBrowser(browser, { timeoutMs: 20000, commandTimeoutMs: 120000 }, async (session) => {
      await session.send("Page.enable");
      await session.send("Runtime.enable");
      await session.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 900, screenWidth: width, screenHeight: 900 });
      await session.send("Runtime.addBinding", { name: "__backend" });
      await session.send("Runtime.addBinding", { name: "__setKeyBinding" });
      await session.send("Runtime.addBinding", { name: "__setEventsBinding" });
      session.waitForEvent("Runtime.bindingCalled", (event) => {
        if (event.name === "__setEventsBinding") { backend.props.MEDIA_R2_EVENTS = JSON.parse(event.payload); return false; }
        if (event.name === "__setKeyBinding") {
          const value = JSON.parse(event.payload);
          if (value === null) delete backend.props.R2_ACCESS_KEY_ID; else backend.props.R2_ACCESS_KEY_ID = value;
          return false;
        }
        if (event.name !== "__backend") return false;
        const { id, body } = JSON.parse(event.payload);
        const text = backend.handle(body);
        session.send("Runtime.evaluate", { expression: `window.__reply(${id}, ${JSON.stringify(text)})` }).catch(() => {});
        return false;
      }, 600000).catch(() => {});
      const loaded = session.waitForEvent("Page.loadEventFired");
      await session.send("Page.navigate", { url: pathToFileURL(file).href });
      await loaded;
      await session.evaluate(`window.__setKey = (value) => window.__setKeyBinding(JSON.stringify(value)); window.__setEvents = (text) => window.__setEventsBinding(JSON.stringify(text))`);
      return session.evaluate(scenario);
    }));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function check(out, width) {
  assert.deepEqual(out.editor, { controller: true, hidden: true, children: 0, requests: 0 }, "editor: nothing shown, nothing sent");
  assert.equal(out.initial.visible, true);
  assert.equal(out.initial.requests, 0, "nothing runs until the button is pressed");
  assert.equal(out.initial.title, "ทดสอบการเชื่อมต่อที่เก็บรูป");
  assert.equal(out.initial.buttonText, "ทดสอบการเชื่อมต่อ");
  const box = (r, tone, icon, text) => { assert.deepEqual([r.tone, r.icon, r.role], [tone, icon, "status"], JSON.stringify(r).slice(0, 300)); assert.equal(r.text, text); };

  box(out.pass, "ok", "✓", "เชื่อมต่อที่เก็บรูปได้ปกติ ผ่านครบ 4 ขั้น");
  assert.deepEqual(out.pass.steps, ["เขียนไฟล์ทดสอบผ่าน", "ตรวจว่ามีไฟล์ผ่าน", "ลบไฟล์ทดสอบผ่าน", "ตรวจว่าไฟล์หายไปผ่าน"]);
  // Storage events: an empty state first, then the kept events newest first, in Thai, Bangkok time, no key or URL.
  assert.deepEqual([out.pass.eventsVisible, out.pass.eventsTitle, out.pass.events, out.pass.eventsEmpty],
    [true, "เหตุขัดข้องล่าสุดของที่เก็บรูป", [], "ยังไม่มีเหตุขัดข้องที่บันทึกไว้"]);
  assert.deepEqual([out.withEvents.eventsVisible, out.withEvents.eventsEmpty], [true, ""]);
  assert.deepEqual(out.withEvents.events, [
    "5 พ.ย. 14:36:46 · อัปโหลดรูปใหญ่ · ไม่สำเร็จ · ผลแต่ละครั้ง 403 · 0.0 วินาที",
    "5 พ.ย. 13:59:27 · ลบรูปเล็ก · สำเร็จเมื่อลองซ้ำ · ผลแต่ละครั้ง 503, 503, 204 · 3.4 วินาที",
    "5 พ.ย. 13:30:00 · ตรวจไฟล์ทดสอบ · ไม่สำเร็จ · ผลแต่ละครั้ง เชื่อมต่อไม่ได้, เชื่อมต่อไม่ได้, เชื่อมต่อไม่ได้ · 3.0 วินาที"]);
  assert.doesNotMatch(out.withEvents.all, /<img|onerror/, "a tampered entry never reaches the page");

  box(out.wrongKey, "error", "✕", "เชื่อมต่อที่เก็บรูปไม่ได้ · ตรวจ R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY ใน Script Properties และสิทธิ์ของ token");
  assert.deepEqual(out.wrongKey.steps, ["เขียนไฟล์ทดสอบไม่ผ่าน (รหัส 400)", "ตรวจว่ามีไฟล์ไม่ผ่าน (รหัส 400)", "ลบไฟล์ทดสอบไม่ผ่าน (รหัส 400)", "ตรวจว่าไฟล์หายไปไม่ผ่าน (รหัส 400)"]);

  box(out.config, "error", "✕", "เชื่อมต่อที่เก็บรูปไม่ได้ · ตั้งค่า R2_* ใน Script Properties ไม่ครบหรือชื่อผิด");
  assert.ok(out.config.steps.every((s) => s.endsWith("ไม่ผ่าน (ตั้งค่าไม่ครบ)")), JSON.stringify(out.config.steps));

  box(out.timeout, "warn", "⚠", "ไม่แน่ใจผล · กดทดสอบอีกครั้งได้ (การทดสอบไม่เปลี่ยนข้อมูลของเว็บ)");
  assert.deepEqual(out.timeout.steps, []);
  box(out.again, "ok", "✓", "เชื่อมต่อที่เก็บรูปได้ปกติ ผ่านครบ 4 ขั้น");

  assert.deepEqual(out.requests, Array(6).fill("adminTestMediaStorage"), "one request per press, never resent");
  assert.deepEqual([out.timeout.eventsVisible, out.again.eventsVisible, out.again.events.length], [false, true, 3], "no list without an answer; back on the next run");
  for (const r of [out.pass, out.withEvents, out.wrongKey, out.config, out.again]) {
    assert.doesNotMatch(r.all, /uploads\/|healthcheck|AKID|sEcReT|r2\.cloudflarestorage|Credential=|Signature/, "no key, secret or URL on the page");
  }
  assert.ok(out.console.includes("warn: [media storage test] run: TIMEOUT"), JSON.stringify(out.console));
  assert.ok(out.console.every((line) => !line.includes(SUPER) && !line.includes("AKID")), "no token or key in the console");
  assert.ok(out.layout.scrollWidth <= out.layout.clientWidth, `no sideways scroll at ${width}px`);
  assert.ok(out.layout.button >= 44, `touch-size button at ${width}px`);
}

(async () => {
  staticChecks();
  for (const width of [1280, 360]) check(await run(width), width);
  console.log("Admin media storage test UI check passed (real admin-api.js + backend) at 1280 and 360 px.");
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
