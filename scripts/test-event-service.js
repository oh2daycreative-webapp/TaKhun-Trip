"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const plain = (value) => JSON.parse(JSON.stringify(value));

function data() {
  return {
    events: [
      { event_id: "EV-TODAY", title_th: "วันนี้", title_en: "Today", event_type: "festival", event_date: "2026-07-15", start_time: "09:00", end_time: "10:00", location_th: "ตลาด", location_en: "Market", related_place_id: "toString", description_th: "วันนี้ไทย", description_en: "Today detail", image_url: "today.jpg", contact_name: "ผู้จัด", contact_phone: "1", register_url: "javascript:bad", google_maps_url: "https://maps.example/today", latitude: "8", longitude: "98", is_featured: true, status: "published", admin_notes: "secret" },
      { event_id: "EV-FUTURE", title_th: "อนาคต", title_en: "", event_type: "learning", event_date: "2026-08-01", start_time: "", end_time: "", location_th: "ชุมชน", location_en: "", related_place_id: "P-DRAFT", description_th: "เรียนรู้", description_en: "", image_url: "", contact_name: "", contact_phone: "", register_url: "", google_maps_url: "", latitude: "", longitude: "", is_featured: "false", status: "published" },
      { event_id: "EV-PAST-A", title_th: "อดีต ก", event_type: "otop", event_date: "2026-07-01", location_th: "ก", description_th: "ก", is_featured: false, status: "published" },
      { event_id: "EV-PAST-B", title_th: "อดีต ข", event_type: "otop", event_date: "2026-07-01", location_th: "ข", description_th: "ข", is_featured: false, status: "published" },
      { event_id: "EV-BAD", title_th: "วันที่เสีย", event_type: "other", event_date: "2026-02-30", location_th: "", status: "published" },
      { event_id: "EV-DRAFT", title_th: "ร่าง", event_date: "2026-07-15", status: "draft" },
      { event_id: "EV-HIDDEN", title_th: "ซ่อน", event_date: "2026-07-15", status: "hidden" },
      { event_id: "EV-DELETED", title_th: "ลบ", event_date: "2026-07-15", status: "deleted" }
    ],
    places: [
      { place_id: "toString", name_th: "สถานที่พิเศษ", name_en: "Special Place", status: "published", password_hash: "secret" },
      { place_id: "P-DRAFT", name_th: "ร่าง", status: "draft" }
    ]
  };
}

function cache() { const values = new Map(); const puts = []; return { values, puts, get(key) { return values.get(key) || null; }, put(key, value, ttl) { puts.push({ key, value, ttl }); values.set(key, value); } }; }
function load(options = {}) {
  const source = data(); const store = options.cache || cache(); const reads = [];
  const context = { JSON, Object, Math, Number, String, Array, Date, RegExp, encodeURIComponent, isFinite, CacheService: { getScriptCache: () => store }, readSheetObjects_: (name) => { reads.push(name); return source[name]; } };
  vm.createContext(context);
  const file = path.join(root, "apps-script/EventService.gs");
  vm.runInContext(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "", context, { filename: "apps-script/EventService.gs" });
  return { context, source, store, reads };
}
function required(context, name) { assert.equal(typeof context[name], "function", `${name} must be implemented by EventService.gs`); return context[name]; }
function test(name, fn) { try { fn(); process.stdout.write(`PASS ${name}\n`); } catch (error) { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode = 1; } }

test("events use deterministic valid dates and status boundaries with stable ordering", () => {
  const { context, source } = load(); const build = required(context, "EventService_buildEventsResponse_"); const before = JSON.stringify(source.events);
  assert.deepEqual(plain(build(source.events, { status: "upcoming" }, "2026-07-15")).data.items.map((item) => item.event_id), ["EV-TODAY", "EV-FUTURE"]);
  assert.deepEqual(plain(build(source.events, { status: "past" }, "2026-07-15")).data.items.map((item) => item.event_id), ["EV-PAST-A", "EV-PAST-B"]);
  assert.deepEqual(plain(build(source.events, { status: "all" }, "2026-07-15")).data.items.map((item) => item.event_id), ["EV-PAST-A", "EV-PAST-B", "EV-TODAY", "EV-FUTURE"]);
  assert.equal(JSON.stringify(source.events), before);
});

test("events filter documented type month featured and reject invalid parameters", () => {
  const { context, source } = load(); const build = required(context, "EventService_buildEventsResponse_");
  assert.deepEqual(plain(build(source.events, { type: "otop", month: "2026-07", status: "all" }, "2026-07-15")).data.items.map((item) => item.event_id), ["EV-PAST-A", "EV-PAST-B"]);
  assert.deepEqual(plain(build(source.events, { featured: "true", status: "all", lang: "en" }, "2026-07-15")).data.items.map((item) => item.title), ["Today"]);
  assert.equal(plain(build(source.events, { featured: "yes" }, "2026-07-15")).error.code, "VALIDATION_ERROR");
  assert.equal(plain(build(source.events, { status: "current" }, "2026-07-15")).error.code, "VALIDATION_ERROR");
  assert.equal(plain(build(source.events, { month: "2026-13" }, "2026-07-15")).error.code, "VALIDATION_ERROR");
});

test("event public projections omit internal fields and English falls back to Thai", () => {
  const { context, source } = load(); const build = required(context, "EventService_buildEventsResponse_");
  const item = plain(build(source.events, { type: "learning", status: "all", lang: "en" }, "2026-07-15")).data.items[0];
  assert.equal(item.title, "อนาคต"); assert.equal(item.location, "ชุมชน");
  assert.deepEqual(Object.keys(item), ["event_id", "title", "event_type", "event_date", "start_time", "end_time", "location", "image_url", "contact_name", "contact_phone", "register_url"]);
  assert.equal("status" in item || "admin_notes" in item, false);
});

test("event detail validates IDs dates and joins only published places without leaking internals", () => {
  const { context, source } = load(); const build = required(context, "EventService_buildEventDetailResponse_");
  for (const id of [undefined, "", "../EV-TODAY"]) assert.equal(plain(build(source.events, source.places, { event_id: id })).error.code, "VALIDATION_ERROR");
  for (const id of ["MISSING", "EV-DRAFT", "EV-HIDDEN", "EV-DELETED", "EV-BAD"]) assert.equal(plain(build(source.events, source.places, { event_id: id })).error.code, "NOT_FOUND");
  const detail = plain(build(source.events, source.places, { event_id: " EV-TODAY ", lang: "en" })).data;
  assert.equal(detail.title, "Today"); assert.equal(detail.location, "Market");
  assert.deepEqual(detail.related_place, { place_id: "toString", name: "Special Place" });
  assert.equal(detail.related_place_id, "toString"); assert.equal(detail.register_url, "javascript:bad");
  assert.equal("status" in detail || "admin_notes" in detail || "password_hash" in detail.related_place, false);
  assert.equal(plain(build(source.events, source.places, { event_id: "EV-FUTURE" })).data.related_place, null);
});

test("event cache normalizes keys uses 300 seconds recovers malformed data and skips errors", () => {
  const store = cache(); const { context, reads } = load({ cache: store }); required(context, "getEvents_");
  context.getEvents_({ status: " ALL ", type: " otop ", month: "2026-07", featured: " FALSE ", lang: "EN", ignored: "x" });
  context.getEvents_({ lang: "en", featured: false, month: "2026-07", type: "otop", status: "all" });
  assert.deepEqual(reads, ["events"]); assert.equal(store.puts[0].ttl, 300);
  context.getEventDetail_({ event_id: " EV-TODAY ", lang: "EN" }); context.getEventDetail_({ event_id: "EV-TODAY", lang: "en" });
  assert.deepEqual(reads.slice(1), ["events", "places"]); assert.notEqual(store.puts[0].key, store.puts[1].key);
  const puts = store.puts.length; assert.equal(plain(context.getEvents_({ status: "current" })).error.code, "VALIDATION_ERROR"); assert.equal(plain(context.getEventDetail_({ event_id: "MISSING" })).error.code, "NOT_FOUND"); assert.equal(store.puts.length, puts);
  const eventReadsBeforeMalformedRecovery = reads.filter((name) => name === "events").length;
  store.values.set(store.puts[0].key, "not-json"); context.getEvents_({ status: "all", type: "otop", month: "2026-07", featured: false, lang: "en" });
  assert.equal(reads.filter((name) => name === "events").length, eventReadsBeforeMalformedRecovery + 1);
});

test("event list cache key changes at the local calendar boundary", () => {
  const store = cache(); const { context, reads } = load({ cache: store }); required(context, "getEvents_");
  context.EventService_today_ = () => "2026-07-15";
  context.getEvents_({ status: "upcoming", lang: "th" });
  context.EventService_today_ = () => "2026-07-16";
  context.getEvents_({ status: "upcoming", lang: "th" });
  assert.deepEqual(reads, ["events", "events"]);
  assert.notEqual(store.puts[0].key, store.puts[1].key);
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("EventService verification passed.\n");
