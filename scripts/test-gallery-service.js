"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const plain = (value) => JSON.parse(JSON.stringify(value));
function rows() { return [
  { media_id: "gallery-dam-lake-001", title_th: "เขื่อน", title_en: "Dam", media_type: "image", category: "dam_lake", related_place_id: "P-1", image_url: "", video_url: "", thumbnail_url: "", caption_th: "วิวเขื่อน", caption_en: "Dam view", credit: "เจ้าของโครงการ", sort_order: "1", status: "published" },
  { media_id: "G-10", title_th: "สิบ", title_en: "Ten", media_type: "image", category: "place", related_place_id: "P-1", image_url: "https://image/10", video_url: "", thumbnail_url: "", caption_th: "คำบรรยาย", caption_en: "Caption", credit: "ช่างภาพ", sort_order: "10", status: "published", admin_notes: "secret" },
  { media_id: "G-2A", title_th: "สอง ก", title_en: "", media_type: "video", category: "event", related_place_id: "P-2", image_url: "", video_url: "javascript:bad", thumbnail_url: "thumb.jpg", caption_th: "ไทย", caption_en: "", credit: "", sort_order: "2", status: "published" },
  { media_id: "G-2B", title_th: "สอง ข", media_type: "image", category: "place", related_place_id: "P-1", image_url: "", video_url: "", thumbnail_url: "", caption_th: "", credit: "", sort_order: 2, status: "published", password_hash: "secret" },
  { media_id: "G-BAD-ORDER", title_th: "ท้าย", media_type: "image", category: "other", related_place_id: "", image_url: "bad", sort_order: "later", status: "published" },
  { media_id: "G-BAD-TYPE", title_th: "ชนิดเสีย", media_type: "audio", category: "other", sort_order: 1, status: "published" },
  { media_id: "G-DRAFT", title_th: "ร่าง", media_type: "image", category: "place", sort_order: 0, status: "draft" },
  { media_id: "G-HIDDEN", title_th: "ซ่อน", media_type: "image", category: "place", status: "hidden" },
  { media_id: "G-DELETED", title_th: "ลบ", media_type: "image", category: "place", status: "deleted" }
]; }
function cache() { const values = new Map(); const puts = []; return { values, puts, get(key) { return values.get(key) || null; }, put(key, value, ttl) { puts.push({ key, value, ttl }); values.set(key, value); } }; }
function load(options = {}) { const source = rows(); const store = options.cache || cache(); const reads = []; let generation = options.generation || "content-epoch:one"; const context = { JSON, Object, Math, Number, String, Array, Date, RegExp, encodeURIComponent, isFinite, CacheService: { getScriptCache: () => store }, ContentCacheService_key_: () => { if (options.generationError) throw new Error("CONTENT_CACHE_UNAVAILABLE"); return generation; }, readSheetObjects_: () => { reads.push("gallery"); return source; } }; vm.createContext(context); const file = path.join(root, "apps-script/GalleryService.gs"); vm.runInContext(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "", context, { filename: "apps-script/GalleryService.gs" }); return { context, source, store, reads, setGeneration(value) { generation = value; } }; }
function required(context, name) { assert.equal(typeof context[name], "function", `${name} must be implemented by GalleryService.gs`); return context[name]; }
function test(name, fn) { try { fn(); process.stdout.write(`PASS ${name}\n`); } catch (error) { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode = 1; } }

test("gallery exposes only published valid media with numeric stable sorting and no mutation", () => {
  const { context, source } = load(); const build = required(context, "GalleryService_buildGalleryResponse_"); const before = JSON.stringify(source);
  const response = plain(build(source, {}));
  assert.deepEqual(response.data.items.map((item) => item.media_id), ["gallery-dam-lake-001", "G-2A", "G-2B", "G-10", "G-BAD-ORDER"]);
  assert.deepEqual(Object.keys(response.data.items[0]), ["media_id", "title", "media_type", "category", "related_place_id", "image_url", "video_url", "thumbnail_url", "caption", "credit"]);
  assert.equal(response.data.items.some((item) => "status" in item || "sort_order" in item || "admin_notes" in item || "password_hash" in item), false);
  assert.equal(JSON.stringify(source), before);
});

test("gallery supports documented combined filters and English fallback", () => {
  const { context, source } = load(); const build = required(context, "GalleryService_buildGalleryResponse_");
  assert.deepEqual(plain(build(source, { media_type: "image", related_place_id: "P-1" })).data.items.map((item) => item.media_id), ["gallery-dam-lake-001", "G-2B", "G-10"]);
  const fallback = plain(build(source, { lang: "en" })).data.items.find((item) => item.media_id === "G-2A"); assert.equal(fallback.title, "สอง ก"); assert.equal(fallback.caption, "ไทย"); assert.equal(fallback.video_url, "javascript:bad");
  assert.equal(plain(build(source, { media_type: "audio" })).error.code, "VALIDATION_ERROR");
  assert.deepEqual(plain(build(source, { category: "dam_lake" })).data.items.map((item) => item.media_id), ["gallery-dam-lake-001"]);
  for (const category of ["dam_lake", "mountain_nature", "community_life", "food_fruit", "activity_tradition"]) assert.equal(plain(build(source, { category })).ok, true);
  for (const category of ["place", "route", "event", "product", "community", "hero", "other", "unknown"]) assert.equal(plain(build(source, { category })).error.code, "VALIDATION_ERROR");
  assert.equal(plain(build(source, { related_place_id: "../bad" })).error.code, "VALIDATION_ERROR");
});

test("gallery cache normalizes effective keys uses 600 seconds and recovers malformed values", () => {
  const store = cache(); const { context, reads } = load({ cache: store }); required(context, "getGallery_");
  context.getGallery_({ category: " DAM_LAKE ", media_type: " IMAGE ", related_place_id: " P-1 ", lang: "EN", ignored: "x" });
  context.getGallery_({ lang: "en", related_place_id: "P-1", media_type: "image", category: "dam_lake" });
  assert.deepEqual(reads, ["gallery"]); assert.equal(store.puts[0].ttl, 600);
  context.getGallery_({ category: "activity_tradition", lang: "en" }); assert.notEqual(store.puts[0].key, store.puts[1].key);
  const puts = store.puts.length; assert.equal(plain(context.getGallery_({ category: "bad" })).error.code, "VALIDATION_ERROR"); assert.equal(store.puts.length, puts);
  store.values.set(store.puts[0].key, "not-json"); context.getGallery_({ category: "dam_lake", media_type: "image", related_place_id: "P-1", lang: "en" });
  assert.equal(reads.length, 3);
  assert.match(store.puts[0].key, /content-epoch:one/);
});

test("gallery cache generation isolates mutations and in-flight old readers", () => {
  const store = cache(); const h = load({ cache: store });
  h.context.getGallery_({ lang: "th" });
  const oldKey = store.puts.at(-1).key;
  h.setGeneration("content-epoch:two");
  h.context.getGallery_({ lang: "th" });
  const newKey = store.puts.at(-1).key;
  assert.notEqual(newKey, oldKey);
  assert.match(newKey, /content-epoch:two/);
  h.setGeneration("content-epoch:old-reader");
  h.context.GalleryService_cached_("getGallery", { lang: "th" }, () => {
    h.setGeneration("content-epoch:new-after-write");
    return { ok: true, data: { items: [], total: 0 }, message: "success" };
  });
  assert.match(store.puts.at(-1).key, /content-epoch:old-reader/);
  assert.doesNotMatch(store.puts.at(-1).key, /content-epoch:new-after-write/);
  const uncached = load({ generationError: true });
  assert.equal(uncached.context.getGallery_({}).ok, true);
  assert.equal(uncached.store.puts.length, 0);
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("GalleryService verification passed.\n");
