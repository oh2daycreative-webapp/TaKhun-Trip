"use strict";
// public/admin/js/admin-api.js (task 11): the 6 place-upload wrappers. Request payloads are checked before sending,
// responses are validated strictly (unknown keys, keys outside the place's allowlist, wrong types → MALFORMED_RESPONSE),
// and the upload errors (IMAGE_REJECTED + reason, LIMIT_*, STORAGE_ERROR, BUSY, OUTCOME_UNKNOWN, UPLOAD_DISABLED) keep
// their codes. Uploads get a longer timeout than other writes and are never retried.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/admin/js/admin-api.js"), "utf8");
const ENDPOINT = "https://api.example/exec";
const TOKEN = "-".padEnd(43, "A");
const PLACE_ID = "PLC-dd3b43b8-b698-416f-8494-4b44f1659654";
const STEM = "uploads/places/plc-dd3b43b8-b698-416f-8494-4b44f1659654/" + "a".repeat(32);
let passed = 0;
async function test(name, body) {
  try { await body(); passed += 1; process.stdout.write(`ok - ${name}\n`); }
  catch (error) { process.stderr.write(`not ok - ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

function item(overrides = {}) {
  return Object.assign({
    upload_id: "UPL-7a75c018-12f0-477d-aa1b-8a638d736d24", place_id: PLACE_ID, sort_order: 1, is_cover: false, format: "webp",
    key_large: STEM + "-1600.webp", key_small: STEM + "-800.webp", width_large: 1600, height_large: 1000, width_small: 800, height_small: 500,
    caption_th: "ทะเลสาบ", caption_en: "Lake", created_at: "2026-10-31T05:00:00.000Z"
  }, overrides);
}
const listData = (overrides = {}) => Object.assign({ enabled: true, can_write: true, limits: { per_place: 20, daily_left: 97, max_bytes_large: 2097152, max_bytes_small: 614400 }, items: [item()], delete_pending: 0 }, overrides);
const ok = (data) => ({ ok: true, data, message: "success" });
const fail = (code, extra = {}) => ({ ok: false, error: Object.assign({ code, message: "ข้อความ" }, extra) });

function load(respond) {
  const calls = [], timers = [];
  const context = {
    URL, location: { href: "https://site.example/admin/place-edit.html" },
    AbortController: class { constructor() { this.signal = { aborted: false, addEventListener() {} }; this.abort = () => { this.signal.aborted = true; }; } },
    setTimeout(callback, delay) { timers.push(delay); return timers.length; },
    clearTimeout() {},
    fetch: async (url, options) => { const body = JSON.parse(options.body); calls.push(body); const result = respond(body, calls.length); if (result instanceof Error) throw result; return { ok: true, status: 200, text: async () => JSON.stringify(result) }; },
    console: { log() {}, info() {}, warn() {}, error() {} }
  };
  context.APP_CONFIG = Object.freeze({ API_URL: ENDPOINT, DEFAULT_LANG: "th" });
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "admin-api.js" });
  return { api: context.TakhunAdminApi, calls, timers };
}
async function codeOf(run) { try { await (typeof run === "function" ? run() : run); return "OK"; } catch (error) { return error.code; } }
const plain = (v) => JSON.parse(JSON.stringify(v));

(async () => {
  await test("exports the 6 wrappers", () => {
    const { api } = load(() => ok({}));
    for (const name of ["getPlaceUploads", "uploadPlaceImage", "deletePlaceUpload", "retryPlaceUploadDeletes", "savePlaceUploads", "testMediaStorage"]) assert.equal(typeof api[name], "function", name);
  });

  await test("getPlaceUploads: exact request, validated response", async () => {
    const env = load(() => ok(listData()));
    const result = plain(await env.api.getPlaceUploads(TOKEN, { place_id: PLACE_ID }));
    assert.deepEqual(env.calls[0], { action: "adminGetPlaceUploads", token: TOKEN, payload: { place_id: PLACE_ID } });
    assert.deepEqual(result, listData());
    assert.equal(await codeOf(() => env.api.getPlaceUploads(TOKEN, { place_id: "bad id" })), "VALIDATION_ERROR");
    assert.equal(await codeOf(() => env.api.getPlaceUploads(TOKEN, { place_id: PLACE_ID, extra: 1 })), "VALIDATION_ERROR");
    assert.equal(env.calls.length, 1, "invalid requests are never sent");
  });

  await test("getPlaceUploads: malformed responses rejected (extra key, key of another place, bad key, wrong types)", async () => {
    const bad = [
      listData({ extra: 1 }),
      listData({ items: [item({ key_large: "uploads/places/other/" + "a".repeat(32) + "-1600.webp" })] }),
      listData({ items: [item({ key_large: "https://evil.example/x.webp" })] }),
      listData({ items: [item({ key_small: STEM + "-800.jpg" })] }),
      listData({ items: [item({ place_id: "PLC-other" })] }),
      listData({ items: [item({ is_cover: "true" })] }),
      listData({ items: [item({ sort_order: Number.NaN })] }),
      listData({ items: [item({ caption_th: "ก".repeat(201) })] }),
      listData({ items: [item({ extra: 1 })] }),
      listData({ delete_pending: -1 }),
      listData({ limits: { per_place: 20 } })
    ];
    for (const data of bad) {
      const env = load(() => ok(data));
      assert.equal(await codeOf(() => env.api.getPlaceUploads(TOKEN, { place_id: PLACE_ID })), "MALFORMED_RESPONSE", JSON.stringify(data).slice(0, 120));
    }
  });

  await test("uploadPlaceImage: exact payload, longer timeout (90 s), one attempt only, result validated", async () => {
    const payload = { place_id: PLACE_ID, format: "webp", large_b64: "UklGRg==", small_b64: "UklGRg==", caption_th: "ปก", caption_en: "Cover" };
    const env = load(() => ok({ item: item(), duplicate: false, audit_status: "recorded", files_verified: true }));
    const result = plain(await env.api.uploadPlaceImage(TOKEN, payload));
    assert.deepEqual(env.calls[0], { action: "adminUploadPlaceImage", token: TOKEN, payload });
    assert.deepEqual(env.timers, [90000]);
    assert.equal(result.item.upload_id, item().upload_id);
    const dup = load(() => ok({ item: item(), duplicate: true, audit_status: "not_needed" }));
    assert.equal(plain(await dup.api.uploadPlaceImage(TOKEN, payload)).duplicate, true);
    const bounce = load(() => ({ ok: false, error: { code: "UNKNOWN_ACTION", message: "x" } }));
    assert.equal(await codeOf(() => bounce.api.uploadPlaceImage(TOKEN, payload)), "REDIRECT_BOUNCE");
    assert.equal(bounce.calls.length, 1, "a write is never repeated");
    const network = load(() => new TypeError("Failed to fetch"));
    assert.equal(await codeOf(() => network.api.uploadPlaceImage(TOKEN, payload)), "NETWORK_ERROR");
    assert.equal(network.calls.length, 1);
  });

  await test("uploadPlaceImage: bad payloads are refused before sending", async () => {
    const env = load(() => ok({}));
    const good = { place_id: PLACE_ID, format: "webp", large_b64: "AAAA", small_b64: "AAAA" };
    for (const bad of [{ ...good, format: "png" }, { ...good, large_b64: "" }, { ...good, small_b64: "not base64!" }, { ...good, extra: 1 }, { ...good, caption_th: "ก".repeat(201) }, { ...good, place_id: "" }]) {
      assert.equal(await codeOf(() => env.api.uploadPlaceImage(TOKEN, bad)), "VALIDATION_ERROR", JSON.stringify(bad).slice(0, 80));
    }
    assert.equal(env.calls.length, 0);
  });

  await test("upload errors keep their codes; IMAGE_REJECTED carries an allowlisted reason", async () => {
    const payload = { place_id: PLACE_ID, format: "webp", large_b64: "AAAA", small_b64: "AAAA" };
    for (const code of ["UPLOAD_DISABLED", "LIMIT_PLACE", "LIMIT_DAILY", "STORAGE_ERROR", "BUSY", "OUTCOME_UNKNOWN", "NOT_FOUND", "FORBIDDEN"]) {
      const env = load(() => fail(code));
      assert.equal(await codeOf(() => env.api.uploadPlaceImage(TOKEN, payload)), code);
    }
    for (const reason of ["format", "exif", "width", "aspect", "size", "mismatch"]) {
      const env = load(() => fail("IMAGE_REJECTED", { reason }));
      const error = await env.api.uploadPlaceImage(TOKEN, payload).catch((e) => e);
      assert.deepEqual([error.code, error.reason], ["IMAGE_REJECTED", reason]);
    }
    const odd = load(() => fail("IMAGE_REJECTED", { reason: "<script>" }));
    assert.equal(await codeOf(() => odd.api.uploadPlaceImage(TOKEN, payload)), "MALFORMED_RESPONSE");
    const extra = load(() => fail("LIMIT_DAILY", { reason: "aspect" }));
    assert.equal(await codeOf(() => extra.api.uploadPlaceImage(TOKEN, payload)), "MALFORMED_RESPONSE", "reason only with IMAGE_REJECTED");
  });

  await test("deletePlaceUpload / retryPlaceUploadDeletes: payloads and results", async () => {
    const env = load((body) => body.action === "adminDeletePlaceUpload" ? ok({ deleted: true, file_deleted: false, audit_status: "unconfirmed" }) : ok({ retried: 2, still_pending: 1 }));
    const ids = [item().upload_id];
    assert.deepEqual(plain(await env.api.deletePlaceUpload(TOKEN, { place_id: PLACE_ID, upload_id: ids[0], expected_ids: ids })), { deleted: true, file_deleted: false, audit_status: "unconfirmed" });
    assert.deepEqual(env.calls[0].payload, { place_id: PLACE_ID, upload_id: ids[0], expected_ids: ids });
    assert.deepEqual(plain(await env.api.retryPlaceUploadDeletes(TOKEN, { place_id: PLACE_ID })), { retried: 2, still_pending: 1 });
    assert.equal(await codeOf(() => env.api.deletePlaceUpload(TOKEN, { place_id: PLACE_ID, upload_id: "x", expected_ids: ids })), "VALIDATION_ERROR");
    assert.equal(await codeOf(() => env.api.deletePlaceUpload(TOKEN, { place_id: PLACE_ID, upload_id: ids[0], expected_ids: [ids[0], ids[0]] })), "VALIDATION_ERROR");
    const conflict = load(() => fail("CONFLICT"));
    assert.equal(await codeOf(() => conflict.api.deletePlaceUpload(TOKEN, { place_id: PLACE_ID, upload_id: ids[0], expected_ids: ids })), "CONFLICT");
  });

  await test("savePlaceUploads: payload (order = permutation, cover in order or null, captions TH+EN <= 200) and result", async () => {
    const a = item().upload_id, b = "UPL-b";
    const items = [item({ upload_id: b, sort_order: 1, is_cover: true, key_large: "uploads/places/plc-dd3b43b8-b698-416f-8494-4b44f1659654/" + "b".repeat(32) + "-1600.jpg", key_small: "uploads/places/plc-dd3b43b8-b698-416f-8494-4b44f1659654/" + "b".repeat(32) + "-800.jpg", format: "jpeg" }), item({ sort_order: 2 })];
    const env = load(() => ok({ items, changed: ["MEDIA_REORDER", "MEDIA_SET_COVER"], audit_status: "recorded" }));
    const payload = { place_id: PLACE_ID, expected_ids: [a, b], order: [b, a], cover_id: b, captions: { [a]: { th: "ก", en: "a" } } };
    const result = plain(await env.api.savePlaceUploads(TOKEN, payload));
    assert.deepEqual(env.calls[0].payload, payload);
    assert.deepEqual(result.changed, ["MEDIA_REORDER", "MEDIA_SET_COVER"]);
    for (const bad of [{ ...payload, order: [a] }, { ...payload, order: [a, "UPL-c"] }, { ...payload, cover_id: "UPL-c" }, { ...payload, captions: { "UPL-c": { th: "", en: "" } } },
      { ...payload, captions: { [a]: { th: "ก".repeat(201), en: "" } } }, { ...payload, captions: { [a]: { th: "ก" } } }]) {
      assert.equal(await codeOf(() => env.api.savePlaceUploads(TOKEN, bad)), "VALIDATION_ERROR");
    }
    const badChanged = load(() => ok({ items, changed: ["DROP_TABLE"], audit_status: "recorded" }));
    assert.equal(await codeOf(() => badChanged.api.savePlaceUploads(TOKEN, payload)), "MALFORMED_RESPONSE");
  });

  await test("testMediaStorage: {} payload; steps validated (no keys or other fields allowed)", async () => {
    const steps = [{ step: "PUT", status: 200, ok: true }, { step: "EXISTS", status: 206, ok: true }, { step: "DELETE", status: 204, ok: true }, { step: "GONE", status: 404, ok: true }];
    const env = load(() => ok({ ok: true, steps }));
    assert.deepEqual(plain(await env.api.testMediaStorage(TOKEN)), { ok: true, steps });
    assert.deepEqual(env.calls[0], { action: "adminTestMediaStorage", token: TOKEN, payload: {} });
    const leak = load(() => ok({ ok: true, steps: [{ step: "PUT", status: 200, ok: true, key: "uploads/healthcheck/x" }] }));
    assert.equal(await codeOf(() => leak.api.testMediaStorage(TOKEN)), "MALFORMED_RESPONSE");
    const config = load(() => ok({ ok: false, steps: [{ step: "PUT", status: "CONFIG", ok: false }] }));
    assert.equal(plain(await config.api.testMediaStorage(TOKEN)).steps[0].status, "CONFIG");
  });

  if (!process.exitCode) process.stdout.write(`${passed} admin place uploads API tests passed\n`);
})();
