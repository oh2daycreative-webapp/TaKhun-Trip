"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function reviews() {
  return [
    { review_id: "R-OLD", place_id: "P-1", reviewer_name: "Old", is_anonymous: false, rating: 4, comment: "old", admin_reply: "reply", status: "approved", created_at: "2026-07-01 09:00:00", updated_at: "secret", approved_by: "ADM" },
    { review_id: "R-NEW-A", place_id: "P-1", reviewer_name: "Hidden Name", is_anonymous: true, rating: 5, comment: "'=formula", admin_reply: "'+reply", status: "approved", created_at: "2026-07-02 10:00:00", approved_at: "secret" },
    { review_id: "R-NEW-B", place_id: "P-1", reviewer_name: "Stable", is_anonymous: false, rating: 4, comment: "same time", admin_reply: "", status: "approved", created_at: "2026-07-02 10:00:00" },
    { review_id: "R-BAD-A", place_id: "P-1", reviewer_name: "Bad A", rating: 3, comment: "bad date A", status: "approved", created_at: "2026-99-99 10:00:00" },
    { review_id: "R-BAD-B", place_id: "P-1", reviewer_name: "Bad B", rating: 1, comment: "bad date B", status: "approved", created_at: "" },
    { review_id: "R-BAD-RATING", place_id: "P-1", reviewer_name: "Bad Rating", rating: 9, comment: "invalid rating", status: "approved", created_at: "2026-07-05 00:00:00" },
    { review_id: "R-BLANK-COMMENT", place_id: "P-1", reviewer_name: "Blank", rating: 5, comment: " ", status: "approved", created_at: "2026-07-05 00:00:00" },
    { review_id: "R-PENDING", place_id: "P-1", reviewer_name: "Pending", rating: 1, comment: "pending", status: "pending", created_at: "2026-07-03 00:00:00" },
    { review_id: "R-HIDDEN", place_id: "P-1", reviewer_name: "Hidden", rating: 1, comment: "hidden", status: "hidden", created_at: "2026-07-03 00:00:00" },
    { review_id: "R-DELETED", place_id: "P-1", reviewer_name: "Deleted", rating: 1, comment: "deleted", status: "deleted", created_at: "2026-07-03 00:00:00" },
    { review_id: "R-OTHER", place_id: "P-2", reviewer_name: "Other", rating: 5, comment: "other", status: "approved", created_at: "2026-07-04 00:00:00" }
  ];
}

function makeCache() {
  const values = new Map(); const puts = [];
  return { values, puts, get(key) { return values.get(key) || null; }, put(key, value, ttl) { puts.push({ key, value, ttl }); values.set(key, value); } };
}

function load(options = {}) {
  const reviewRows = options.reviews || reviews();
  const placeRows = options.places || [{ place_id: "P-1", status: "published" }, { place_id: "P-2", status: "draft" }];
  const cache = options.cache || makeCache();
  const appended = [];
  const lock = options.lock || { acquired: false, released: 0, tryLock(ms) { assert.equal(ms, 10000); this.acquired = true; return true; }, releaseLock() { this.released += 1; } };
  const context = {
    JSON, Object, Math, Number, String, Array, Date, RegExp, encodeURIComponent, isFinite,
    CacheService: { getScriptCache: () => cache },
    LockService: { getScriptLock: () => lock },
    Utilities: { getUuid: () => "123e4567-e89b-12d3-a456-426614174000", formatDate: (_date, zone, pattern) => { assert.equal(zone, "Asia/Bangkok"); assert.equal(pattern, "yyyy-MM-dd HH:mm:ss"); return "2026-07-15 14:30:00"; } },
    Session: { getScriptTimeZone: () => "Asia/Bangkok" },
    readSheetObjects_(name) { if (name === "reviews") return reviewRows; if (name === "places") return placeRows; throw new Error("unexpected sheet"); },
    appendSheetObject_(name, required, record) { appended.push({ name, required: [...required], record: { ...record } }); if (options.appendError) throw new Error("sheet secret"); }
  };
  vm.createContext(context);
  const file = path.join(root, "apps-script/ReviewService.gs");
  vm.runInContext(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "", context, { filename: "apps-script/ReviewService.gs" });
  return { context, reviewRows, placeRows, cache, appended, lock };
}

function required(context, name) { assert.equal(typeof context[name], "function", `${name} must be implemented`); return context[name]; }
function test(name, fn) { try { fn(); process.stdout.write(`PASS ${name}\n`); } catch (error) { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode = 1; } }

test("getReviews exposes approved public projection sorted newest-first and stable without mutation", () => {
  const { context, reviewRows, placeRows } = load();
  const build = required(context, "ReviewService_buildReviewsResponse_"); const before = JSON.stringify(reviewRows);
  const response = plain(build(reviewRows, placeRows, { place_id: " P-1 ", page_size: 100 }));
  assert.deepEqual(response.data.items.map((item) => item.review_id), ["R-NEW-A", "R-NEW-B", "R-OLD", "R-BAD-A", "R-BAD-B"]);
  assert.deepEqual(Object.keys(response.data.items[0]), ["review_id", "place_id", "reviewer_name", "is_anonymous", "rating", "comment", "admin_reply", "created_at"]);
  assert.equal(response.data.items[0].reviewer_name, "นักท่องเที่ยว");
  assert.equal(response.data.items[0].comment, "=formula");
  assert.equal(response.data.items[0].admin_reply, "+reply");
  assert.equal(response.data.items.some((item) => "status" in item || "approved_by" in item || "approved_at" in item || "updated_at" in item), false);
  assert.equal(JSON.stringify(reviewRows), before);
});

test("getReviews validates pagination reports exact total and summary from all approved rows", () => {
  const { context, reviewRows, placeRows } = load(); const build = required(context, "ReviewService_buildReviewsResponse_");
  const response = plain(build(reviewRows, placeRows, { place_id: "P-1", page: 2, page_size: 2 }));
  assert.deepEqual(response.data.items.map((item) => item.review_id), ["R-OLD", "R-BAD-A"]);
  assert.deepEqual(response.data.summary, { average_rating: 3.4, review_count: 5 });
  assert.equal(response.data.total, 5); assert.deepEqual(Object.keys(response.data), ["items", "summary", "total"]);
  const empty = plain(build(reviewRows, [{ place_id: "EMPTY", status: "published" }], { place_id: "EMPTY" }));
  assert.deepEqual(empty.data, { items: [], summary: { average_rating: 0, review_count: 0 }, total: 0 });
  for (const params of [{}, { place_id: " " }, { place_id: "../bad" }, { place_id: "P-1", page: 0 }, { place_id: "P-1", page_size: 101 }, { place_id: "P-1", page: 1.5 }]) assert.equal(plain(build(reviewRows, placeRows, params)).error.code, "VALIDATION_ERROR");
  assert.equal(plain(build(reviewRows, placeRows, { place_id: "UNKNOWN" })).error.code, "NOT_FOUND");
  assert.equal(plain(build(reviewRows, placeRows, { place_id: "P-2" })).error.code, "NOT_FOUND");
});

test("getReviews caches only successful normalized responses for 300 seconds", () => {
  const cache = makeCache(); const env = load({ cache }); required(env.context, "getReviews_");
  env.context.getReviews_({ place_id: " P-1 ", page: "1", page_size: "20", lang: "en", ignored: "x" });
  env.context.getReviews_({ page_size: 20, place_id: "P-1", page: 1 });
  assert.equal(cache.puts.length, 1); assert.equal(cache.puts[0].ttl, 300); assert.doesNotMatch(cache.puts[0].key, /lang/);
  cache.values.set(cache.puts[0].key, "bad-json"); env.context.getReviews_({ place_id: "P-1", page: 1, page_size: 20 }); assert.equal(cache.puts.length, 2);
  const puts = cache.puts.length; env.context.getReviews_({ place_id: "UNKNOWN" }); env.context.getReviews_({ place_id: "P-1", page: 0 }); assert.equal(cache.puts.length, puts);
});

test("submitReview validates contract uses one lock and writes server-owned pending record", () => {
  const env = load(); const submit = required(env.context, "submitReview_");
  const response = plain(submit({ place_id: " P-1 ", reviewer_name: " =Alice ", is_anonymous: false, rating: 5, comment: " +Great ", review_id: "CLIENT", status: "approved", admin_reply: "owned", approved_by: "ADM", created_at: "old" }));
  assert.deepEqual(response, { ok: true, data: { review_id: "REV-123e4567-e89b-12d3-a456-426614174000", status: "pending" }, message: "ส่งรีวิวแล้ว รอตรวจสอบก่อนเผยแพร่" });
  assert.equal(env.appended.length, 1); assert.equal(env.appended[0].name, "reviews");
  assert.deepEqual(env.appended[0].record, { review_id: "REV-123e4567-e89b-12d3-a456-426614174000", place_id: "P-1", reviewer_name: "'=Alice", is_anonymous: false, rating: 5, comment: "'+Great", admin_reply: "", status: "pending", created_at: "2026-07-15 14:30:00", updated_at: "2026-07-15 14:30:00", approved_at: "", approved_by: "" });
  assert.equal(env.lock.acquired, true); assert.equal(env.lock.released, 1);
});

test("submitReview rejects invalid input unpublished places and releases after append failure", () => {
  for (const payload of [{ place_id: "P-1", rating: 0, comment: "x" }, { place_id: "P-1", rating: 1.5, comment: "x" }, { place_id: "P-1", rating: "5", comment: "x" }, { place_id: "P-1", rating: true, comment: "x" }, { place_id: "P-1", rating: [5], comment: "x" }, { place_id: "P-1", rating: {}, comment: "x" }, { place_id: "P-1", rating: 5, comment: " " }, { place_id: "P-1", rating: 5, comment: "x".repeat(1001) }, { place_id: "P-1", rating: 5, comment: "x", is_anonymous: "true" }]) {
    const env = load(); assert.equal(plain(required(env.context, "submitReview_")(payload)).error.code, "VALIDATION_ERROR"); assert.equal(env.appended.length, 0);
  }
  assert.equal(plain(required(load().context, "submitReview_")({ place_id: "P-2", rating: 5, comment: "x" })).error.code, "NOT_FOUND");
  const timeout = load({ lock: { released: 0, tryLock() { return false; }, releaseLock() { this.released += 1; } } }); assert.throws(() => required(timeout.context, "submitReview_")({ place_id: "P-1", rating: 5, comment: "x" })); assert.equal(timeout.lock.released, 0);
  const failed = load({ appendError: true }); assert.throws(() => required(failed.context, "submitReview_")({ place_id: "P-1", rating: 5, comment: "x" })); assert.equal(failed.lock.released, 1);
});

test("formula defense round-trips every approved dangerous prefix and preserves normal apostrophes", () => {
  const { context } = load(); const escape = required(context, "ReviewService_escapeSheetText_"); const unescape = required(context, "ReviewService_unescapeSheetText_");
  for (const prefix of ["=", "+", "-", "@"]) {
    const source = `${prefix}payload`; const stored = escape(source); assert.equal(stored, `'${source}`); assert.equal(unescape(stored), source);
  }
  assert.equal(unescape("'ordinary"), "'ordinary");
});

test("SheetService appends by real header order and fails closed for missing headers", () => {
  const writes = []; const headers = ["comment", "review_id", "status", "place_id"];
  const sheet = { getDataRange: () => ({ getValues: () => [headers] }), getLastColumn: () => headers.length, getLastRow: () => 1, getRange(row, column, height, width) { return { setValues(values) { writes.push({ row, column, height, width, values }); } }; } };
  const context = { String, Object, Array, getAppConfig_: () => ({ spreadsheetId: "configured" }), SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) } };
  vm.createContext(context); vm.runInContext(read("apps-script/SheetService.gs"), context, { filename: "apps-script/SheetService.gs" });
  required(context, "appendSheetObject_")("reviews", ["review_id", "place_id", "status", "comment"], { review_id: "R", place_id: "P", status: "pending", comment: "safe" });
  assert.deepEqual(plain(writes[0]), { row: 2, column: 1, height: 1, width: 4, values: [["safe", "R", "pending", "P"]] });
  assert.throws(() => required(context, "appendSheetObject_")("reviews", ["missing"], {}));
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("ReviewService verification passed.\n");
