"use strict";
// apps-script/MediaUploadPublicService.gs (task 7): public GET getPlaceUploads and its cache generation.
// Loads the real Config.gs, SheetService.gs, R2SigV4.gs, MediaUploadSchema.gs and MediaUploadPublicService.gs with a
// fake spreadsheet (counts reads) and a fake CacheService.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const FILES = ["Config.gs", "SheetService.gs", "R2SigV4.gs", "MediaUploadSchema.gs", "MediaUploadPublicService.gs"];
const SOURCES = FILES.map((name) => [name, fs.readFileSync(path.join(ROOT, "apps-script", name), "utf8")]);
let passed = 0;
function test(name, body) {
  try { body(); passed += 1; process.stdout.write(`ok - ${name}\n`); }
  catch (error) { process.stderr.write(`not ok - ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

const HEADERS = [
  "upload_id", "entity_type", "entity_id", "status", "object_state", "is_cover", "sort_order", "format", "sha256",
  "key_large", "key_small", "width_large", "height_large", "bytes_large", "width_small", "height_small", "bytes_small",
  "caption_th", "caption_en", "created_at", "created_by", "updated_at", "updated_by", "deleted_at", "deleted_by"
];
const P1 = "plc-6d706013-ce22-46a6-b2e1-061a8da902b7";
const hex = (n) => String(n).repeat(32).slice(0, 32);
const photo = (place, n, extra = {}) => {
  const seg = place.toLowerCase();
  const values = { upload_id: `UPL-${place}-${n}`, entity_type: "place", entity_id: place, status: "active", object_state: "stored", is_cover: "false",
    sort_order: String(n), format: "webp", sha256: hex(n).repeat(2), key_large: `uploads/places/${seg}/${hex(n)}-1600.webp`, key_small: `uploads/places/${seg}/${hex(n)}-800.webp`,
    width_large: "1600", height_large: "1200", bytes_large: "1000", width_small: "800", height_small: "600", bytes_small: "500",
    caption_th: "", caption_en: "", created_at: "2026-10-30T00:00:00.000Z", created_by: "ADM-secret-admin", updated_at: "", updated_by: "ADM-secret-admin", deleted_at: "", deleted_by: "", ...extra };
  return HEADERS.map((h) => values[h]);
};

function sheet(rows, reads, name) {
  return {
    getName: () => name,
    getLastRow: () => rows.length,
    getLastColumn: () => rows[0].length,
    getDataRange: () => ({ getValues: () => { reads.push(name); return rows.map((r) => r.slice()); } })
  };
}

function load({ uploads = [], places, noUploads = false, cacheThrows = false } = {}) {
  const reads = [], store = new Map(), cacheOps = [];
  const placeRows = [["place_id", "name_th", "status"], ...(places || [[P1, "A", "published"], ["BTK-001", "B", "published"], ["BTK-002", "C", "draft"], ["BTK-003", "D", "archived"]])];
  const uploadRows = [HEADERS, ...uploads];
  const sheets = { places: sheet(placeRows, reads, "places") };
  if (!noUploads) sheets.media_uploads = sheet(uploadRows, reads, "media_uploads");
  let uuid = 0;
  const cache = {
    get: (k) => { cacheOps.push(["get", k]); if (cacheThrows) throw new Error("cache down"); return store.has(k) ? store.get(k) : null; },
    put: (k, v, ttl) => { cacheOps.push(["put", k, ttl]); if (cacheThrows) throw new Error("cache down"); store.set(k, v); },
    remove: (k) => { cacheOps.push(["remove", k]); if (cacheThrows) throw new Error("cache down"); store.delete(k); }
  };
  const context = {
    console: { log() {} }, JSON,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === "SPREADSHEET_ID" ? "sid" : null) }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => sheets[n] || null }) },
    CacheService: { getScriptCache: () => cache },
    Utilities: { getUuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}` }
  };
  vm.createContext(context);
  for (const [name, source] of SOURCES) vm.runInContext(source, context, { filename: `apps-script/${name}` });
  const get = (params = {}) => JSON.parse(JSON.stringify(context.getPlaceUploads_(params)));
  return { context, get, reads, store, cacheOps, uploadRows, placeRows };
}

test("list (no place_id): covers of published places only, from active rows; keys and sizes only, no admin fields", () => {
  const env = load({ uploads: [
    photo(P1, 1), photo(P1, 2, { is_cover: "true", caption_th: "'=ทะเล", caption_en: "Lake" }),
    photo("BTK-001", 3, { is_cover: "true", status: "deleted" }),
    photo("BTK-002", 4, { is_cover: "true" }), photo("BTK-003", 5, { is_cover: "true" })
  ] });
  const res = env.get();
  assert.equal(res.ok, true);
  assert.deepEqual(Object.keys(res.data.covers), [P1]);
  assert.deepEqual(res.data.covers[P1], { format: "webp", key_large: `uploads/places/${P1}/${hex(2)}-1600.webp`, key_small: `uploads/places/${P1}/${hex(2)}-800.webp`,
    width: 1600, height: 1200, width_small: 800, height_small: 600, caption_th: "=ทะเล", caption_en: "Lake" });
  assert.equal(JSON.stringify(res).includes("ADM-secret-admin"), false);
  assert.equal(JSON.stringify(res).includes("UPL-"), false);
});

test("detail (place_id): cover + all active photos in sort order; draft/archived/unknown places get an empty result (D20)", () => {
  const env = load({ uploads: [photo(P1, 3), photo(P1, 1, { is_cover: "true" }), photo(P1, 2, { status: "deleted" }), photo("BTK-002", 4)] });
  const res = env.get({ place_id: P1 });
  assert.equal(res.data.place_id, P1);
  assert.equal(res.data.cover.key_large, `uploads/places/${P1}/${hex(1)}-1600.webp`);
  assert.deepEqual(res.data.gallery.map((g) => g.key_small), [1, 3].map((n) => `uploads/places/${P1}/${hex(n)}-800.webp`));
  for (const id of ["BTK-002", "BTK-003", "NOPE-1"]) assert.deepEqual(env.get({ place_id: id }).data, { place_id: id, cover: null, gallery: [] });
});

test("rows whose keys do not match the allowlist or the place are never published", () => {
  const env = load({ uploads: [
    photo(P1, 1, { is_cover: "true", key_large: "uploads/places/other/" + hex(1) + "-1600.webp" }),
    photo(P1, 2, { key_small: "https://evil.example/x.webp" }), photo(P1, 3)
  ] });
  assert.deepEqual(env.get().data.covers, {});
  assert.deepEqual(env.get({ place_id: P1 }).data.gallery.map((g) => g.width_small), [800]);
});

test("bad place_id -> VALIDATION_ERROR; missing media_uploads sheet -> ok and empty (the site works as before, C2)", () => {
  const env = load();
  for (const id of ["a b", "x".repeat(101), "<script>"]) assert.equal(env.get({ place_id: id }).error.code, "VALIDATION_ERROR");
  const missing = load({ noUploads: true });
  assert.deepEqual(missing.get().data, { covers: {} });
  assert.deepEqual(missing.get({ place_id: P1 }).data, { place_id: P1, cover: null, gallery: [] });
});

test("cache: the second read is served from cache (no sheet read); 300 s TTL; a removed generation means fresh data", () => {
  const env = load({ uploads: [photo(P1, 1, { is_cover: "true" })] });
  env.get();
  const readsAfterFirst = env.reads.length;
  env.get();
  assert.equal(env.reads.length, readsAfterFirst, "served from cache");
  assert.ok(env.cacheOps.some((op) => op[0] === "put" && op[2] === 300));
  env.uploadRows.push(photo("BTK-001", 7, { is_cover: "true" }));
  assert.deepEqual(Object.keys(env.get().data.covers), [P1], "stale until the writer refreshes");
  env.context.MediaUploadPublicService_invalidateUnderLock_();
  assert.deepEqual(Object.keys(env.get().data.covers).sort(), ["BTK-001", P1].sort());
});

test("a reader that loaded data before a write can only cache it under the old generation", () => {
  const env = load({ uploads: [photo(P1, 1, { is_cover: "true" })] });
  const oldKey = env.context.MediaUploadPublicService_cacheKey_("*");
  env.context.MediaUploadPublicService_invalidateUnderLock_();
  const newKey = env.context.MediaUploadPublicService_cacheKey_("*");
  assert.notEqual(oldKey, newKey);
  assert.equal(oldKey.split(":")[0], "media-uploads-public");
});

test("cache failures never break the public read", () => {
  const env = load({ uploads: [photo(P1, 1, { is_cover: "true" })], cacheThrows: true });
  assert.deepEqual(Object.keys(env.get().data.covers), [P1]);
  assert.doesNotThrow(() => env.context.MediaUploadPublicService_invalidateUnderLock_());
});

test("no top-level calls to Apps Script services (safe in any file load order)", () => {
  const source = SOURCES.find(([name]) => name === "MediaUploadPublicService.gs")[1];
  assert.doesNotThrow(() => vm.runInContext(source, vm.createContext({}), { filename: "apps-script/MediaUploadPublicService.gs" }));
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write(`${passed} MediaUploadPublicService tests passed\n`);
