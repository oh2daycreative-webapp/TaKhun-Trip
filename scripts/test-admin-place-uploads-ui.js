"use strict";
// public/admin/js/admin-place-uploads.js (task 11) in real headless Chrome/Edge (CDP helper): the photos section with
// the real admin CSS, a stubbed TakhunAdminApi / TakhunImageResize / confirm. Covers every owner requirement:
// roles/switch/archived visibility, one-at-a-time uploads with visible statuses, "ไม่แน่ใจผล" + reload without resend,
// Thai image reasons (4:1 crop), audit warning, delete_pending + retry, CONFLICT + reload, up/down, cover, captions,
// delete confirm, and a phone-width layout (360 px: no sideways scroll, touch-size buttons).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { withCdpBrowser } = require("./test-admin-reviews-cdp.js");

const root = path.join(__dirname, "..");
const browsers = [
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
  process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft/Edge/Application/msedge.exe")
];
const browser = browsers.find((candidate) => candidate && fs.existsSync(candidate));
assert.ok(browser, "Chrome or Edge is required for the uploads UI check");
const url = (file) => pathToFileURL(path.join(root, file)).href;

// The stub API keeps a server-like model so list/upload/delete/save stay consistent.
const harness = `
const PLACE = "PLC-dd3b43b8-b698-416f-8494-4b44f1659654", PREFIX = "uploads/places/" + PLACE.toLowerCase() + "/";
let seq = 0;
const hex = (n) => n.toString(16).padStart(32, "0");
function item(n, extra) { return Object.assign({ upload_id: "UPL-" + n, place_id: PLACE, sort_order: n, is_cover: false, format: "webp", key_large: PREFIX + hex(n) + "-1600.webp", key_small: PREFIX + hex(n) + "-800.webp", width_large: 1600, height_large: 1067, width_small: 800, height_small: 533, caption_th: "", caption_en: "", created_at: "2026-10-31T05:00:00.000Z" }, extra || {}); }
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
window.server = null;
function reset(options) {
  window.server = Object.assign({ enabled: true, can_write: true, daily_left: 50, delete_pending: 0, items: [item(1), item(2, { is_cover: true, caption_th: "ปก" })], calls: [], active: 0, maxActive: 0,
    uploadPlan: [], deletePlan: [], savePlan: [], listFail: null, gate: null }, options || {});
  seq = 10;
}
const count = (name) => server.calls.filter((c) => c === name).length;
async function track(name, fn) {
  server.calls.push(name); server.active += 1; server.maxActive = Math.max(server.maxActive, server.active);
  try { if (server.gate) await server.gate.promise; return await fn(); } finally { server.active -= 1; }
}
const fail = (code, extra) => Object.assign(new Error("x"), { code }, extra || {});
window.TakhunAdminApi = {
  getPlaceUploads: (token, p) => track("list", async () => {
    if (server.listFail) { const f = server.listFail; server.listFail = null; throw fail(f); }
    return { enabled: server.enabled, can_write: server.can_write, limits: { per_place: 20, daily_left: server.daily_left, max_bytes_large: 2097152, max_bytes_small: 614400 }, items: server.items.map((i) => Object.assign({}, i)), delete_pending: server.delete_pending };
  }),
  uploadPlaceImage: (token, p) => track("upload", async () => {
    const plan = server.uploadPlan.shift() || "ok";
    if (plan === "dup") return { item: Object.assign({}, server.items[0]), duplicate: true, audit_status: "not_needed" };
    if (typeof plan === "object") throw fail(plan.code, plan.reason ? { reason: plan.reason } : {});
    seq += 1; const created = item(seq, { sort_order: server.items.length + 1 });
    server.items.push(created); server.daily_left -= 1;
    return { item: created, duplicate: false, audit_status: plan === "unconfirmed" ? "unconfirmed" : "recorded", files_verified: plan !== "unverified" };
  }),
  deletePlaceUpload: (token, p) => track("delete", async () => {
    window.lastDelete = p;
    const plan = server.deletePlan.shift() || "ok";
    if (typeof plan === "object") throw fail(plan.code);
    server.items = server.items.filter((i) => i.upload_id !== p.upload_id);
    if (plan === "pending") server.delete_pending += 1;
    return { deleted: true, file_deleted: plan !== "pending", audit_status: plan === "unconfirmed" ? "unconfirmed" : "recorded" };
  }),
  retryPlaceUploadDeletes: () => track("retry", async () => { const n = server.delete_pending; server.delete_pending = 0; return { retried: n, still_pending: 0 }; }),
  savePlaceUploads: (token, p) => track("save", async () => {
    window.lastSave = p;
    const plan = server.savePlan.shift() || "ok";
    if (typeof plan === "object") throw fail(plan.code);
    server.items = p.order.map((id, index) => Object.assign({}, server.items.find((i) => i.upload_id === id), { sort_order: index + 1, is_cover: id === p.cover_id, caption_th: p.captions[id].th, caption_en: p.captions[id].en }));
    return { items: server.items.map((i) => Object.assign({}, i)), changed: ["MEDIA_REORDER"], audit_status: plan === "unconfirmed" ? "unconfirmed" : "recorded" };
  })
};
window.TakhunImageResize = {
  MESSAGES: { DECODE: "เปิดรูปนี้ไม่ได้" },
  prepare: async (file) => {
    if (file.name.startsWith("wide")) throw Object.assign(new Error("รูปยาวหรือกว้างเกิน 4:1 กรุณาครอปรูปก่อนอัปโหลด"), { code: "ASPECT" });
    if (file.name.startsWith("heic")) throw Object.assign(new Error("เบราว์เซอร์นี้เปิดไฟล์ HEIC ไม่ได้ กรุณาเลือกรูปแบบ JPEG (iPhone: การตั้งค่า > กล้อง > รูปแบบ > ความเข้ากันได้มากที่สุด)"), { code: "HEIC" });
    return { format: "webp", large: { bytes: new Uint8Array([82,73,70,70]), width: 1600, height: 1067 }, small: { bytes: new Uint8Array([82,73,70,70]), width: 800, height: 533 }, quality: { large: .82, small: .82 } };
  },
  toBase64: () => "UklGRg=="
};
window.confirmAnswer = true; window.confirms = [];
const tick = () => new Promise((r) => setTimeout(r, 0));
async function mount(options) {
  reset(options && options.server);
  const host = document.getElementById("host");
  host.innerHTML = '<section data-admin-place-uploads hidden></section>';
  const rootNode = host.firstChild;
  const controller = await window.TakhunAdminPlaceUploads.init({ root: rootNode, api: window.TakhunAdminApi, resize: window.TakhunImageResize, token: "T".repeat(43), placeId: PLACE,
    archived: Boolean(options && options.archived), mediaOrigin: "https://pub-a134ff2bc8744d26a7a47c053e933127.r2.dev", confirm: (text) => { confirms.push(text); return confirmAnswer; } });
  return { root: rootNode, controller };
}
const $ = (r, s) => r.querySelector(s);
const visible = (n) => Boolean(n) && !n.hidden && !n.closest("[hidden]") && n.getClientRects().length > 0;
const texts = (r, s) => Array.from(r.querySelectorAll(s)).map((n) => n.textContent.trim());
function pickFiles(r, names) {
  const input = $(r, "input[type=file]"); const dt = new DataTransfer();
  names.forEach((n) => dt.items.add(new File([new Uint8Array([1,2,3])], n, { type: "image/jpeg" })));
  input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
}
async function settle() { for (let i = 0; i < 20; i += 1) await tick(); }
const rgb = (text) => (text.match(/[0-9.]+/g) || []).map(Number);
function background(node) { for (let n = node; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length === 3 || (c.length === 4 && c[3] > 0)) return c.slice(0, 3); } return [255, 255, 255]; }
function luminance(c) { const s = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]; }
function contrast(node) { const a = luminance(rgb(getComputedStyle(node).color)), b = luminance(background(node)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
function opacity(node) { let o = 1; for (let n = node; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; }
function inline(label) { const input = label.querySelector("input"), text = label.querySelector("span"); const a = input.getBoundingClientRect(), b = text.getBoundingClientRect(); return a.right <= b.left + 1 && Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) <= 10; }
const box = (r) => { const node = r.querySelector(".admin-uploads__result"); return { visible: visible(node), tone: node.dataset.tone || "", icon: (node.querySelector(".admin-uploads__result-icon") || {}).textContent || "", text: (node.querySelector(".admin-uploads__result-text") || {}).textContent || "", role: node.getAttribute("role"), live: node.getAttribute("aria-live") }; };
`;

const scenarios = `
// D24 condition 2: the phone hint after a failed upload round (shown only on a phone, only for failures a computer can help with).
window.__runHint = async () => {
  const out = {};
  const hint = (r) => { const node = r.querySelector(".admin-uploads__result-hint"); return node && visible(node) ? node.textContent : ""; };
  const round = async (files, plan) => {
    const { root: r } = await mount();
    server.uploadPlan = plan || [];
    pickFiles(r, files); await settle(); await settle(); await settle();
    return { hint: hint(r), text: (r.querySelector(".admin-uploads__result-text") || {}).textContent || "", role: r.querySelector(".admin-uploads__result").getAttribute("role") };
  };
  out.heic = await round(["heic-1.heic", "a.jpg"], ["ok"]);
  out.storage = await round(["a.jpg"], [{ code: "STORAGE_ERROR" }]);
  out.timeout = await round(["a.jpg"], [{ code: "TIMEOUT" }]);
  out.success = await round(["a.jpg", "b.jpg"], ["ok", "ok"]);
  out.aspectOnly = await round(["wide.jpg"]);
  const { root: r } = await mount();
  server.uploadPlan = [{ code: "STORAGE_ERROR" }]; pickFiles(r, ["a.jpg"]); await settle(); await settle();
  r.querySelector("li [data-role=down]").click();
  out.clearedOnNextAction = hint(r);
  out.scrollWidth = document.documentElement.scrollWidth; out.clientWidth = document.documentElement.clientWidth;
  return JSON.stringify(out);
};

window.__run = async () => {
  const out = {};
  // 1. normal load
  let { root: r, controller: c } = await mount();
  out.load = { visible: !r.hidden, items: texts(r, ".admin-uploads__item figcaption"), cover: c.snapshot().cover, uploadVisible: visible($(r, ".admin-uploads__picker")),
    quota: $(r, ".admin-uploads__quota").textContent, saveBar: visible($(r, ".admin-uploads__savebar")), thumb: $(r, ".admin-uploads__thumb").getAttribute("src"), help: $(r, ".admin-uploads__help").textContent };
  // 2. server says no write → hidden
  ({ root: r } = await mount({ server: { can_write: false } }));
  out.noWrite = { hidden: r.hidden };
  // 3. switch off: upload hidden, notice, delete + reorder still usable
  ({ root: r, controller: c } = await mount({ server: { enabled: false } }));
  out.disabled = { upload: visible($(r, ".admin-uploads__picker")), notice: $(r, ".admin-uploads__notice").textContent, noticeVisible: visible($(r, ".admin-uploads__notice")),
    deleteEnabled: !$(r, "[data-role=delete]").disabled, downEnabled: !$(r, "[data-role=down]").disabled };
  // 4. archived: upload hidden, order/cover/captions disabled, delete enabled
  ({ root: r, controller: c } = await mount({ archived: true }));
  out.archived = { upload: visible($(r, ".admin-uploads__picker")), notice: $(r, ".admin-uploads__notice").textContent, deleteEnabled: !$(r, "[data-role=delete]").disabled,
    downDisabled: $(r, "[data-role=down]").disabled, captionDisabled: $(r, "[data-role=caption]").disabled, coverDisabled: $(r, "[data-role=cover]").disabled };
  // 5. reorder with buttons, cover, captions → save bar; upload + delete blocked while unsaved; save sends the right payload; audit warning
  ({ root: r, controller: c } = await mount());
  $(r, "li[data-upload-id='UPL-1'] [data-role=down]").click();
  const focusAfterMove = document.activeElement && document.activeElement.getAttribute("aria-label");
  $(r, "li[data-upload-id='UPL-1'] [data-role=cover]").click();
  const cap = $(r, "li[data-upload-id='UPL-1'] [data-role=caption][data-lang=th]"); cap.value = "  ทะเลสาบ  "; cap.dispatchEvent(new Event("input"));
  out.dirty = { order: c.snapshot().order, saveBar: visible($(r, ".admin-uploads__savebar")), pickDisabled: $(r, "input[type=file]").disabled, deleteDisabled: $(r, "[data-role=delete]").disabled, focusAfterMove };
  server.savePlan = ["unconfirmed"];
  $(r, ".admin-uploads__save").click(); await settle();
  out.save = { payload: window.lastSave, saveBar: visible($(r, ".admin-uploads__savebar")), alert: $(r, ".admin-uploads__alert").textContent, alertVisible: visible($(r, ".admin-uploads__alert")), order: c.snapshot().items, cover: c.snapshot().cover };
  // 6. discard
  $(r, "li[data-upload-id='UPL-2'] [data-role=up]") && $(r, "li[data-upload-id='UPL-2'] [data-role=down]").click();
  $(r, ".admin-uploads__discard").click();
  out.discard = { dirty: c.snapshot().dirty, order: c.snapshot().order };
  // 7. three photos in one pick: crop message, success, server EXIF refusal; strictly one at a time; visible "กำลังอัปโหลด"
  ({ root: r, controller: c } = await mount());
  server.uploadPlan = ["ok", { code: "IMAGE_REJECTED", reason: "exif" }];
  server.gate = deferred();
  pickFiles(r, ["wide.jpg", "a.jpg", "b.jpg"]); await settle();
  const during = texts(r, ".admin-uploads__queue-item");
  server.gate.resolve(); server.gate = null; await settle(); await settle();
  out.queue = { during, after: texts(r, ".admin-uploads__queue-item"), uploads: count("upload"), maxActive: server.maxActive, items: c.snapshot().items.length, status: c.snapshot().status, quota: $(r, ".admin-uploads__quota").textContent,
    newThumb: $(r, "li[data-upload-id='UPL-11'] img") && $(r, "li[data-upload-id='UPL-11'] img").getAttribute("src").slice(0, 5) };
  // 8. timeout: "ไม่แน่ใจผล", the rest not sent, list reloaded, the photo never resent
  for (const code of ["TIMEOUT", "OUTCOME_UNKNOWN", "REDIRECT_BOUNCE"]) {
    ({ root: r, controller: c } = await mount());
    server.uploadPlan = [{ code }];
    const listBefore = count("list");
    pickFiles(r, ["a.jpg", "b.jpg"]); await settle(); await settle();
    out["uncertain_" + code] = { queue: texts(r, ".admin-uploads__queue-item"), uploads: count("upload"), reloads: count("list") - listBefore, alert: $(r, ".admin-uploads__alert").textContent, status: c.snapshot().status };
  }
  // 9. daily cap stops the queue
  ({ root: r, controller: c } = await mount());
  server.uploadPlan = ["ok", { code: "LIMIT_DAILY" }];
  pickFiles(r, ["a.jpg", "b.jpg", "c.jpg"]); await settle(); await settle();
  out.limit = { queue: texts(r, ".admin-uploads__queue-item"), uploads: count("upload") };
  // 10. more photos than room (20 per place)
  const many = Array.from({ length: 19 }, (_, i) => item(i + 1));
  ({ root: r, controller: c } = await mount({ server: { items: many } }));
  pickFiles(r, ["a.jpg", "b.jpg", "c.jpg"]); await settle(); await settle();
  out.room = { queue: texts(r, ".admin-uploads__queue-item"), uploads: count("upload") };
  // 11. duplicate + files not verified + audit unconfirmed
  ({ root: r, controller: c } = await mount());
  server.uploadPlan = ["dup", "unverified"];
  pickFiles(r, ["a.jpg", "b.jpg"]); await settle(); await settle();
  out.dup = { queue: texts(r, ".admin-uploads__queue-item"), items: c.snapshot().items.length, alert: $(r, ".admin-uploads__alert").textContent };
  // 12. delete: confirm no → nothing; yes → expected ids; file not deleted → pending box + retry
  ({ root: r, controller: c } = await mount());
  window.confirmAnswer = false; $(r, "li[data-upload-id='UPL-2'] [data-role=delete]").click(); await settle();
  const deletesAfterNo = count("delete");
  window.confirmAnswer = true; server.deletePlan = ["pending"];
  $(r, "li[data-upload-id='UPL-2'] [data-role=delete]").click(); await settle();
  out.del = { deletesAfterNo, request: window.lastDelete, items: c.snapshot().items, pendingVisible: visible($(r, ".admin-uploads__pending")), pendingText: $(r, ".admin-uploads__pending p").textContent, confirm: confirms[confirms.length - 1] };
  $(r, ".admin-uploads__retry").click(); await settle();
  out.del.afterRetry = visible($(r, ".admin-uploads__pending"));
  // 13. CONFLICT on save → reload message; reload clears it
  ({ root: r, controller: c } = await mount());
  $(r, "li[data-upload-id='UPL-1'] [data-role=down]").click();
  server.savePlan = [{ code: "CONFLICT" }];
  $(r, ".admin-uploads__save").click(); await settle();
  out.conflict = { box: visible($(r, ".admin-uploads__conflict")), text: $(r, ".admin-uploads__conflict").textContent, saveBar: visible($(r, ".admin-uploads__savebar")), pick: visible($(r, ".admin-uploads__picker")) };
  $(r, ".admin-uploads__reload").click(); await settle();
  out.conflict.after = { box: visible($(r, ".admin-uploads__conflict")), dirty: c.snapshot().dirty };
  // 14. CONFLICT on delete too; uncertain delete reloads
  ({ root: r, controller: c } = await mount());
  server.deletePlan = [{ code: "TIMEOUT" }];
  const listsBefore = count("list");
  $(r, "[data-role=delete]").click(); await settle(); await settle();
  out.deleteUncertain = { reloads: count("list") - listsBefore, deletes: count("delete"), alert: $(r, ".admin-uploads__alert").textContent };
  // 15. read error → retry button
  reset({ listFail: "NETWORK_ERROR" });
  const host = document.getElementById("host"); host.innerHTML = '<section hidden></section>';
  c = await window.TakhunAdminPlaceUploads.init({ root: host.firstChild, api: window.TakhunAdminApi, resize: window.TakhunImageResize, token: "T".repeat(43), placeId: PLACE, archived: false, mediaOrigin: "" });
  out.readError = { box: visible($(host, ".admin-uploads__read-error")) };
  $(host, ".admin-uploads__read-error button").click(); await settle();
  out.readError.after = { box: visible($(host, ".admin-uploads__read-error")), items: c.snapshot().items.length, noThumbOrigin: $(host, ".admin-uploads__thumb--none") !== null };
  // 17. UX round: delete readable in both states, radios inline + label clickable, result box tones/icons/position
  ({ root: r, controller: c } = await mount());
  const freshBox = box(r);
  const del = $(r, "[data-role=delete]");
  out.ux = { deleteEnabled: { contrast: contrast(del), opacity: opacity(del) } };
  $(r, "li[data-upload-id='UPL-1'] [data-role=down]").click();
  out.ux.deleteDisabled = { disabled: del.isConnected ? $(r, "[data-role=delete]").disabled : true, contrast: contrast($(r, "[data-role=delete]")), opacity: opacity($(r, "[data-role=delete]")) };
  $(r, ".admin-uploads__discard").click();
  out.ux.inline = { cover: inline($(r, ".admin-uploads__cover")), noCover: inline($(r, ".admin-uploads__no-cover")) };
  $(r, "li[data-upload-id='UPL-1'] .admin-uploads__cover span").click();
  out.ux.labelClick = c.snapshot().cover;
  $(r, ".admin-uploads__no-cover span").click();
  out.ux.noCoverClick = c.snapshot().cover;
  $(r, ".admin-uploads__discard").click();
  out.ux.afterLoad = freshBox;
  server.uploadPlan = ["dup"]; pickFiles(r, ["a.jpg"]); await settle(); await settle();
  out.ux.dup = box(r);
  pickFiles(r, ["a.jpg", "b.jpg"]); await settle(); await settle();
  out.ux.allOk = box(r);
  const resultNode = $(r, ".admin-uploads__result"), listNode = $(r, ".admin-uploads__list");
  out.ux.position = { aboveList: resultNode.getBoundingClientRect().bottom <= listNode.getBoundingClientRect().top, beforeQueue: resultNode.nextElementSibling === $(r, ".admin-uploads__alert") && $(r, ".admin-uploads__alert").nextElementSibling === $(r, ".admin-uploads__queue") };
  await settle(); out.ux.kept = box(r).text;
  server.uploadPlan = [{ code: "STORAGE_ERROR" }]; pickFiles(r, ["a.jpg"]); await settle(); await settle();
  out.ux.allFailed = box(r);
  $(r, "li[data-upload-id='UPL-1'] [data-role=down]").click(); $(r, ".admin-uploads__save").click(); await settle();
  out.ux.saved = box(r);
  server.deletePlan = ["pending"]; $(r, "[data-role=delete]").click(); await settle();
  out.ux.pending = box(r);
  server.deletePlan = ["ok"]; $(r, "[data-role=delete]").click(); await settle();
  out.ux.deleted = box(r);
  server.uploadPlan = [{ code: "TIMEOUT" }]; pickFiles(r, ["a.jpg"]); await settle(); await settle();
  out.ux.uncertain = box(r);
  out.ux.alertIcon = $(r, ".admin-uploads__alert p") && getComputedStyle($(r, ".admin-uploads__alert p"), "::before").content;
  reset({ listFail: "NETWORK_ERROR" });
  const host2 = document.getElementById("host"); host2.innerHTML = '<section hidden></section>';
  await window.TakhunAdminPlaceUploads.init({ root: host2.firstChild, api: window.TakhunAdminApi, resize: window.TakhunImageResize, token: "T".repeat(43), placeId: PLACE, archived: false, mediaOrigin: "" });
  out.ux.readError = box(host2);
  // 18. polish: the queue clears when a new action starts; duplicate line uses the warning colour; disabled up/down readable
  ({ root: r, controller: c } = await mount());
  const up = $(r, "li[data-upload-id='UPL-1'] [data-role=up]");
  out.polish = { upDisabled: up.disabled, upContrast: contrast(up), upOpacity: opacity(up) };
  server.uploadPlan = ["dup"]; pickFiles(r, ["02-landscape.jpg"]); await settle(); await settle();
  const dupState = $(r, ".admin-uploads__queue-item--duplicate .admin-uploads__queue-state");
  out.polish.dupColor = dupState ? getComputedStyle(dupState).color : "";
  out.polish.queueBefore = texts(r, ".admin-uploads__queue-item");
  server.deletePlan = ["ok"]; $(r, "[data-role=delete]").click(); await settle();
  out.polish.afterDelete = { queue: texts(r, ".admin-uploads__queue-item"), hidden: !visible($(r, ".admin-uploads__queue")) };
  server.uploadPlan = ["dup"]; pickFiles(r, ["02-landscape.jpg"]); await settle(); await settle();
  $(r, "[data-role=down]") && $(r, "li [data-role=up]:not([disabled])") && $(r, "li [data-role=up]:not([disabled])").click();
  out.polish.afterMove = texts(r, ".admin-uploads__queue-item").length;
  $(r, ".admin-uploads__discard").click();
  out.polish.afterDiscard = texts(r, ".admin-uploads__queue-item").length;
  server.uploadPlan = ["dup"]; pickFiles(r, ["02-landscape.jpg"]); await settle(); await settle();
  $(r, ".admin-uploads__no-cover span").click(); // one photo left (the cover): clearing the cover is the unsaved change
  out.polish.queueBeforeSave = texts(r, ".admin-uploads__queue-item").length;
  $(r, ".admin-uploads__save").click(); await settle();
  out.polish.afterSave = texts(r, ".admin-uploads__queue-item").length;
  // 19. D24 containment: a HEIC in a 3-photo pick is refused in the browser and never sent; the others upload;
  //     leaving the page while an upload runs asks first (beforeunload)
  ({ root: r, controller: c } = await mount());
  server.gate = deferred();
  pickFiles(r, ["a.jpg", "heic-1.heic", "b.jpg"]); await settle();
  const leaving = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(leaving);
  out.contain = { leaveAsked: leaving.defaultPrevented };
  server.gate.resolve(); server.gate = null; await settle(); await settle();
  out.contain.queue = texts(r, ".admin-uploads__queue-item");
  out.contain.uploads = count("upload");
  out.contain.items = c.snapshot().items.length;
  const idle = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(idle);
  out.contain.leaveAskedWhenIdle = idle.defaultPrevented;
  // 16. phone width: no sideways scroll, touch-size buttons
  ({ root: r, controller: c } = await mount());
  $(r, "li[data-upload-id='UPL-1'] [data-role=down]").click();
  const sizes = Array.from(r.querySelectorAll("button, .admin-uploads__pick")).filter(visible).map((b) => Math.round(b.getBoundingClientRect().height));
  out.layout = { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, minButton: Math.min(...sizes), widest: Math.max(...Array.from(r.querySelectorAll("*")).map((n) => n.getBoundingClientRect().right)) };
  return JSON.stringify(out);
};
`;

function page() {
  const css = ["main.css", "components.css", "mobile.css", "admin.css", "admin-places.css"].map((name) => `<link rel="stylesheet" href="${url("public/css/" + name)}">`).join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css}</head>
<body class="admin-body"><main class="admin-main"><section class="admin-place-edit"><div id="host"></div></section></main>
<script src="${url("public/admin/js/admin-place-uploads.js")}"></script><script>${harness}${scenarios}</script></body></html>`;
}

const PHONE_UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36";
async function run(width, height, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "takhun-uploads-ui-"));
  const file = path.join(directory, "uploads.html");
  fs.writeFileSync(file, page());
  try {
    return JSON.parse(await withCdpBrowser(browser, { timeoutMs: 20000, commandTimeoutMs: 60000 }, async (session) => {
      await session.send("Page.enable");
      await session.send("Runtime.enable");
      await session.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 900, screenWidth: width, screenHeight: height });
      if (options.phone) await session.send("Emulation.setUserAgentOverride", { userAgent: PHONE_UA, userAgentMetadata: { brands: [{ brand: "Chromium", version: "150" }], fullVersion: "150.0.0.0", platform: "Android", platformVersion: "10", architecture: "", model: "K", mobile: true } });
      const loaded = session.waitForEvent("Page.loadEventFired");
      await session.send("Page.navigate", { url: pathToFileURL(file).href });
      await loaded;
      return session.evaluate(options.scenario || "window.__run()");
    }));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function check(out, width) {
  const tag = ` (${width}px)`;
  assert.equal(out.load.visible, true, "section visible" + tag);
  assert.deepEqual(out.load.items.map((t) => t.split(" · ")[0]), ["รูปที่ 1", "รูปที่ 2"]);
  assert.equal(out.load.cover, "UPL-2");
  assert.equal(out.load.uploadVisible, true);
  assert.match(out.load.quota, /เพิ่มได้อีก 18 รูป · วันนี้อัปโหลดได้อีก 50 รูป/);
  assert.equal(out.load.saveBar, false);
  assert.equal(out.load.thumb, "https://pub-a134ff2bc8744d26a7a47c053e933127.r2.dev/uploads/places/plc-dd3b43b8-b698-416f-8494-4b44f1659654/" + "1".padStart(32, "0") + "-800.webp");
  assert.match(out.load.help, /ห้ามใส่ข้อมูลส่วนบุคคลในคำบรรยาย/);

  assert.equal(out.noWrite.hidden, true, "hidden when the server says no write rights");

  assert.equal(out.disabled.upload, false, "upload hidden when the switch is off");
  assert.equal(out.disabled.noticeVisible, true);
  assert.match(out.disabled.notice, /ปิดการอัปโหลดรูปอยู่ในขณะนี้/);
  assert.equal(out.disabled.deleteEnabled, true, "delete still possible when the switch is off (D11)");
  assert.equal(out.disabled.downEnabled, true);

  assert.equal(out.archived.upload, false);
  assert.match(out.archived.notice, /เก็บถาวร/);
  assert.equal(out.archived.deleteEnabled, true);
  assert.deepEqual([out.archived.downDisabled, out.archived.captionDisabled, out.archived.coverDisabled], [true, true, true]);

  assert.deepEqual(out.dirty.order, ["UPL-2", "UPL-1"]);
  assert.deepEqual([out.dirty.saveBar, out.dirty.pickDisabled, out.dirty.deleteDisabled], [true, true, true]);
  assert.equal(out.dirty.focusAfterMove, "เลื่อนรูปที่ 2 ขึ้น", "focus follows the moved photo");
  assert.deepEqual(out.save.payload, { place_id: "PLC-dd3b43b8-b698-416f-8494-4b44f1659654", expected_ids: ["UPL-1", "UPL-2"], order: ["UPL-2", "UPL-1"], cover_id: "UPL-1",
    captions: { "UPL-2": { th: "ปก", en: "" }, "UPL-1": { th: "ทะเลสาบ", en: "" } } });
  assert.equal(out.save.saveBar, false);
  assert.equal(out.save.alertVisible, true);
  assert.match(out.save.alert, /ยืนยันบันทึกประวัติ \(activity log\) ไม่ได้/);
  assert.deepEqual([out.save.order, out.save.cover], [["UPL-2", "UPL-1"], "UPL-1"]);
  assert.deepEqual(out.discard, { dirty: false, order: ["UPL-2", "UPL-1"] });

  assert.ok(out.queue.during.some((t) => t.startsWith("a.jpgกำลังอัปโหลด")), "visible กำลังอัปโหลด: " + JSON.stringify(out.queue.during));
  assert.ok(out.queue.during.some((t) => t === "b.jpgรอคิว"));
  assert.deepEqual(out.queue.after, ["wide.jpgไม่สำเร็จ: รูปยาวหรือกว้างเกิน 4:1 กรุณาครอปรูปก่อนอัปโหลด", "a.jpgอัปโหลดแล้ว", "b.jpgไม่สำเร็จ: รูปยังมีข้อมูลแฝง (EXIF/GPS) กรุณาเลือกรูปใหม่"]);
  assert.equal(out.queue.uploads, 2);
  assert.equal(out.queue.maxActive, 1, "one request at a time");
  assert.equal(out.queue.items, 3);
  assert.equal(out.queue.status, "อัปโหลดเสร็จ 1 จาก 3 รูป · ไม่สำเร็จ 2 รูป (ดูรายการด้านล่าง)");
  assert.match(out.queue.quota, /เพิ่มได้อีก 17 รูป · วันนี้อัปโหลดได้อีก 49 รูป/);
  assert.equal(out.queue.newThumb, "blob:", "new photo previewed from the local file");

  for (const code of ["TIMEOUT", "OUTCOME_UNKNOWN", "REDIRECT_BOUNCE"]) {
    const entry = out["uncertain_" + code];
    assert.deepEqual(entry.queue, ["a.jpgไม่แน่ใจผล", "b.jpgยังไม่ได้ส่ง"], code);
    assert.equal(entry.uploads, 1, code + ": never resent");
    assert.equal(entry.reloads, 1, code + ": list reloaded");
    assert.match(entry.alert, /ไม่แน่ใจผล · โหลดรายการรูปใหม่แล้ว/);
    assert.match(entry.alert, /ระบบไม่ส่งซ้ำเอง/);
  }

  assert.deepEqual(out.limit.queue, ["a.jpgอัปโหลดแล้ว", "b.jpgไม่สำเร็จ: วันนี้อัปโหลดรูปครบจำนวนที่กำหนดแล้ว กรุณาลองใหม่พรุ่งนี้", "c.jpgยังไม่ได้ส่ง"]);
  assert.equal(out.limit.uploads, 2);
  assert.deepEqual(out.room.queue, ["a.jpgอัปโหลดแล้ว", "b.jpgไม่สำเร็จ: เกินจำนวนสูงสุด 20 รูปต่อสถานที่", "c.jpgไม่สำเร็จ: เกินจำนวนสูงสุด 20 รูปต่อสถานที่"]);
  assert.equal(out.room.uploads, 1, "the 21st photo is never sent");

  assert.deepEqual(out.dup.queue, ["a.jpgมีรูปนี้อยู่แล้ว", "b.jpgอัปโหลดแล้ว"]);
  assert.equal(out.dup.items, 3);
  assert.match(out.dup.alert, /ตรวจยืนยันไฟล์ในที่เก็บรูปไม่ได้/);

  assert.equal(out.del.deletesAfterNo, 0, "cancelled confirm sends nothing");
  assert.deepEqual(out.del.request, { place_id: "PLC-dd3b43b8-b698-416f-8494-4b44f1659654", upload_id: "UPL-2", expected_ids: ["UPL-1", "UPL-2"] });
  assert.deepEqual(out.del.items, ["UPL-1"]);
  assert.match(out.del.confirm, /ลบรูปที่ 2 ออกจากเว็บไซต์/);
  assert.equal(out.del.pendingVisible, true);
  assert.match(out.del.pendingText, /ยังลบออกจากที่เก็บรูปไม่สำเร็จ/);
  assert.equal(out.del.afterRetry, false);

  assert.equal(out.conflict.box, true);
  assert.match(out.conflict.text, /รายการรูปถูกแก้ไขจากที่อื่น กรุณาโหลดรายการล่าสุด/);
  assert.deepEqual([out.conflict.saveBar, out.conflict.pick], [false, false], "no save or upload while in conflict");
  assert.deepEqual(out.conflict.after, { box: false, dirty: false });

  assert.deepEqual(out.deleteUncertain.reloads, 1);
  assert.equal(out.deleteUncertain.deletes, 1);
  assert.match(out.deleteUncertain.alert, /ไม่แน่ใจผล/);

  assert.equal(out.readError.box, true);
  assert.deepEqual(out.readError.after, { box: false, items: 2, noThumbOrigin: true });

  // UX round (owner, 2026-10-31)
  const ux = out.ux;
  assert.ok(ux.deleteEnabled.contrast >= 4.5 && ux.deleteEnabled.opacity === 1, "delete readable: " + JSON.stringify(ux.deleteEnabled));
  assert.ok(ux.deleteDisabled.disabled && ux.deleteDisabled.contrast >= 4.5 && ux.deleteDisabled.opacity === 1, "disabled delete readable: " + JSON.stringify(ux.deleteDisabled));
  assert.deepEqual(ux.inline, { cover: true, noCover: true }, "radio inline with its label");
  assert.deepEqual([ux.labelClick, ux.noCoverClick], ["UPL-1", null], "clicking the label text picks the radio");
  assert.equal(ux.afterLoad.visible, false, "no box until there is a result");
  const expectBox = (actual, tone, icon, text) => { assert.deepEqual([actual.visible, actual.tone, actual.icon, actual.role, actual.live], [true, tone, icon, "status", "polite"], JSON.stringify(actual)); assert.equal(actual.text, text); };
  expectBox(ux.dup, "warn", "⚠", "อัปโหลดเสร็จ 0 รูป · มีอยู่แล้ว 1 รูป");
  expectBox(ux.allOk, "ok", "✓", "อัปโหลดเสร็จ 2 รูป");
  assert.deepEqual(ux.position, { aboveList: true, beforeQueue: true });
  assert.equal(ux.kept, "อัปโหลดเสร็จ 2 รูป", "kept until the next action");
  expectBox(ux.allFailed, "error", "✕", "อัปโหลดไม่สำเร็จ 1 รูป: ไม่ได้บันทึกข้อมูล: เชื่อมต่อที่เก็บรูปไม่สำเร็จ");
  expectBox(ux.saved, "ok", "✓", "บันทึกลำดับ รูปปก และคำบรรยายแล้ว");
  expectBox(ux.pending, "warn", "⚠", "ลบรูปออกจากเว็บแล้ว แต่ลบไฟล์ในที่เก็บรูปยังไม่สำเร็จ · กดลองลบไฟล์อีกครั้งได้");
  expectBox(ux.deleted, "ok", "✓", "ลบรูปแล้ว");
  expectBox(ux.uncertain, "warn", "⚠", "ไม่แน่ใจผล");
  assert.equal(ux.alertIcon, "\"⚠ \"", "warnings carry an icon too");
  expectBox(ux.readError, "error", "✕", "โหลดรายการรูปไม่สำเร็จ · เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่");
  // D24 containment: HEIC never sent, the rest upload; leaving mid-upload asks first, not when idle
  assert.equal(out.contain.leaveAsked, true, "beforeunload guard while uploading");
  assert.equal(out.contain.leaveAskedWhenIdle, false, "no guard when idle");
  assert.deepEqual(out.contain.queue, ["a.jpgอัปโหลดแล้ว", "heic-1.heicไม่สำเร็จ: เบราว์เซอร์นี้เปิดไฟล์ HEIC ไม่ได้ กรุณาเลือกรูปแบบ JPEG (iPhone: การตั้งค่า > กล้อง > รูปแบบ > ความเข้ากันได้มากที่สุด)", "b.jpgอัปโหลดแล้ว"]);
  assert.equal(out.contain.uploads, 2, "the HEIC is never sent");
  assert.equal(out.contain.items, 4);
  // polish round
  assert.equal(out.polish.upDisabled, true);
  assert.ok(out.polish.upContrast >= 4.5 && out.polish.upOpacity === 1, "disabled up readable: " + JSON.stringify(out.polish));
  assert.equal(out.polish.dupColor, "rgb(138, 90, 0)", "duplicate line in the warning colour");
  assert.deepEqual(out.polish.queueBefore, ["02-landscape.jpgมีรูปนี้อยู่แล้ว"]);
  assert.deepEqual(out.polish.afterDelete, { queue: [], hidden: true }, "delete clears the old queue");
  assert.equal(out.polish.afterDiscard, 0, "discard clears the queue");
  assert.equal(out.polish.afterSave, 0, "save clears the queue");
  assert.ok(out.polish.queueBeforeSave > 0, "the queue had a line before save");
  assert.ok(out.layout.scrollWidth <= out.layout.clientWidth, `no sideways scroll at ${width}px: ${out.layout.scrollWidth} > ${out.layout.clientWidth}`);
  assert.ok(out.layout.widest <= out.layout.clientWidth + 0.5, `nothing sticks out at ${width}px: ${out.layout.widest}`);
  assert.ok(out.layout.minButton >= 44, `touch-size buttons at ${width}px: ${out.layout.minButton}px`);
}

async function mediaLayout(width) {
  return withCdpBrowser(browser, { timeoutMs: 20000, commandTimeoutMs: 30000 }, async (session) => {
    await session.send("Page.enable");
    await session.send("Emulation.setScriptExecutionDisabled", { value: true });
    await session.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 900, screenWidth: width, screenHeight: 900 });
    const loaded = session.waitForEvent("Page.loadEventFired");
    await session.send("Page.navigate", { url: url("public/admin/place-edit.html") });
    await loaded;
    await session.send("Emulation.setScriptExecutionDisabled", { value: false });
    return session.evaluate(`(() => {
      for (const node of document.querySelectorAll("[hidden]")) if (!node.closest("dialog") && !node.matches("input")) node.hidden = false;
      for (const node of document.querySelectorAll("[aria-hidden=true]")) if (!node.closest("dialog") && !node.matches("input")) node.setAttribute("aria-hidden", "false");
      document.body.classList.remove("admin-auth-pending");
      const hero = document.querySelector(".admin-place-media__hero"), gallery = document.querySelector(".admin-place-media__gallery"), note = document.querySelector("[data-admin-place-media-upload-note]");
      const a = hero.getBoundingClientRect(), b = gallery.getBoundingClientRect();
      return { heroTop: Math.round(a.top), galleryTop: Math.round(b.top), heroLeft: Math.round(a.left), galleryLeft: Math.round(b.left), heroBottom: Math.round(a.bottom),
        noteInHero: hero.contains(note), mountKeepsNote: !document.querySelector("[data-admin-place-media-hero]").contains(note) };
    })()`);
  });
}

function checkIntegration() {
  const html = fs.readFileSync(path.join(root, "public/admin/place-edit.html"), "utf8");
  const edit = fs.readFileSync(path.join(root, "public/admin/js/admin-place-edit.js"), "utf8");
  // The section sits outside the draft form (live at once, D20), inside the page content.
  assert.match(html, /<\/form>[\s\S]*<section class="admin-uploads" data-admin-place-uploads hidden aria-busy="false"><\/section>[\s\S]*<\/section>\s*<\/main>/);
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  const at = (name) => scripts.indexOf(name);
  assert.ok(at("js/admin-api.js") < at("js/admin-image-resize.js") && at("js/admin-image-resize.js") < at("js/admin-place-uploads.js") && at("js/admin-place-uploads.js") < at("js/admin-place-edit.js"), scripts.join(" "));
  // Started in both load paths (editable and read-only, e.g. archived), only for editor roles, never in create mode.
  assert.equal((edit.match(/await initUploads\(\);/g) || []).length, 2);
  assert.match(edit, /async function initUploads\(\) \{ if \(!elements\.uploads \|\| !global\.TakhunAdminPlaceUploads \|\| !global\.TakhunImageResize \|\| state\.mode !== "edit" \|\| !state\.placeId \|\| !writable\(\)\) return;/);
  assert.match(edit, /archived:state\.archived, mediaOrigin:mediaOrigin\(\)/);
  assert.match(edit, /catch \(_uploadsError\) \{ state\.uploadsComponent = null; \}/, "a failure in the photos section never blocks the page");
  // The "สื่อ" section explains that an uploaded cover is used first (owner UX round).
  assert.match(html, /<div class="admin-place-media__hero"><div data-admin-place-media-hero>[\s\S]*?<\/div><p class="admin-place-media__upload-note" data-admin-place-media-upload-note>[^<]*รูปภาพที่อัปโหลด[^<]*ใช้รูปนั้นเป็นรูปปกก่อน[^<]*<\/p><\/div><div class="admin-place-media__gallery">/);
}

(async () => {
  checkIntegration();
  const desktop = await mediaLayout(1280), phone = await mediaLayout(360);
  assert.equal(desktop.noteInHero, true, "the note sits inside the Hero box");
  assert.equal(desktop.mountKeepsNote, true, "the note is outside the element the media script rewrites");
  assert.ok(desktop.heroTop === desktop.galleryTop && desktop.galleryLeft > desktop.heroLeft, "Hero and Gallery side by side on desktop: " + JSON.stringify(desktop));
  assert.ok(phone.galleryTop >= phone.heroBottom && phone.galleryLeft === phone.heroLeft, "stacked at phone width: " + JSON.stringify(phone));
  for (const [width, height] of [[1280, 900], [360, 800]]) check(await run(width, height), width);
  // D24 condition 2: the phone hint
  const HINT = "ถ้าอัปโหลดจากมือถือไม่ได้ ให้ใช้คอมพิวเตอร์";
  const phoneHint = await run(360, 800, { phone: true, scenario: "window.__runHint()" });
  assert.deepEqual([phoneHint.heic.hint, phoneHint.storage.hint, phoneHint.timeout.hint], [HINT, HINT, HINT], "phone: hint after a resize failure, an upload failure and an uncertain result: " + JSON.stringify(phoneHint));
  assert.equal(phoneHint.timeout.text, "ไม่แน่ใจผล");
  assert.equal(phoneHint.success.hint, "", "phone: no hint after full success");
  assert.equal(phoneHint.aspectOnly.hint, "", "phone: no hint when only a file rule refused the photo (a computer would not help)");
  assert.equal(phoneHint.clearedOnNextAction, "", "the hint goes with the next action");
  assert.equal(phoneHint.heic.role, "status", "announced with the result box");
  assert.ok(phoneHint.scrollWidth <= phoneHint.clientWidth, "no sideways scroll with the hint at 360 px");
  const desktopHint = await run(1280, 900, { scenario: "window.__runHint()" });
  assert.deepEqual([desktopHint.heic.hint, desktopHint.storage.hint, desktopHint.timeout.hint, desktopHint.success.hint], ["", "", "", ""], "desktop: never the phone hint");
  console.log("Admin place uploads UI native browser check passed at 1280x900 and 360x800.");
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
