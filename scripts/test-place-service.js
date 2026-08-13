"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeRows() {
  return [
    { place_id: "P-4", name_th: "ท้าย", name_en: "", district: "phanom", province: "สุราษฎร์ธานี", route_group: "nearby_phanom", category: "nature", short_description_th: "น้ำตก", short_description_en: "", description_th: "ธรรมชาติ", description_en: "", activities_th: "เดินป่า", activities_en: "", highlight_th: "เงียบสงบ", highlight_en: "", phone: "", line_url: "", facebook_url: "", website_url: "", google_maps_url: "", latitude: "91", longitude: "99", coordinate_status: "pending_verify", open_time_th: "", open_time_en: "", fee_th: "", fee_en: "", cover_image_url: "", gallery_image_urls: "", video_url: "", tags: "น้ำตก|ป่า", recommended_duration: "", best_time_th: "", best_time_en: "", nearby_place_ids: "", is_featured: "false", is_main_route_point: "false", sort_order: "bad", status: "published", note: "private" },
    { place_id: "P-2", name_th: "เขื่อน", name_en: "Dam", district: "ban_ta_khun", province: "สุราษฎร์ธานี", route_group: "main_point_2", category: "nature", short_description_th: "วิวสวย", short_description_en: "", description_th: "รายละเอียด", description_en: "", activities_th: "ล่องเรือ", activities_en: "", highlight_th: "ภูเขา", highlight_en: "", phone: "222", line_url: "", facebook_url: "", website_url: "", google_maps_url: "https://maps.example/p2", latitude: "8.9", longitude: "98.7", coordinate_status: "verified", open_time_th: "ทุกวัน", open_time_en: "", fee_th: "ฟรี", fee_en: "", cover_image_url: "p2.jpg", gallery_image_urls: "https://legacy.example/a.jpg|https://legacy.example/b.jpg", gallery_media_ids: "place-p2-gallery-b|place-p2-gallery-a", video_url: "", tags: "เขื่อน|เรือ", recommended_duration: "2 ชั่วโมง", best_time_th: "เช้า", best_time_en: "", nearby_place_ids: "P-1|DRAFT", is_featured: "TRUE", is_main_route_point: "1", sort_order: "2", status: "published", admin_notes: "secret" },
    { place_id: "P-1", name_th: "ชุมชน", name_en: "Community", district: "ban_ta_khun", province: "สุราษฎร์ธานี", route_group: "main_point_1", category: "community_tourism", short_description_th: "ของดีชุมชน", short_description_en: "Local", description_th: "รายละเอียดชุมชน", description_en: "", activities_th: "ชิมอาหาร", activities_en: "", highlight_th: "อาหาร", highlight_en: "", phone: "111", line_url: "", facebook_url: "", website_url: "", google_maps_url: "https://maps.example/p1", latitude: "-90", longitude: "180", coordinate_status: "verified", open_time_th: "เช้า", open_time_en: "", fee_th: "", fee_en: "", cover_image_url: "p1.jpg", gallery_image_urls: "", video_url: "", tags: "ชุมชน", recommended_duration: "1 ชั่วโมง", best_time_th: "เย็น", best_time_en: "", nearby_place_ids: "", is_featured: true, is_main_route_point: true, sort_order: 1, status: "published", password_hash: "secret" },
    { place_id: "DRAFT", name_th: "ร่าง", district: "ban_ta_khun", category: "nature", latitude: "8", longitude: "98", is_featured: true, is_main_route_point: true, sort_order: 0, status: "draft" },
    { place_id: "HIDDEN", name_th: "ซ่อน", district: "ban_ta_khun", category: "nature", latitude: "8", longitude: "98", status: "hidden" },
    { place_id: "DELETED", name_th: "ลบ", district: "ban_ta_khun", category: "nature", latitude: "8", longitude: "98", status: "deleted" },
    { place_id: "NO-LAT", name_th: "ไม่มีละติจูด", district: "ban_ta_khun", category: "nature", latitude: "", longitude: "98", status: "published" },
    { place_id: "NO-LNG", name_th: "ไม่มีลองจิจูด", district: "ban_ta_khun", category: "nature", latitude: "8", longitude: "", status: "published" },
    { place_id: "BAD", name_th: "พิกัดเสีย", district: "ban_ta_khun", category: "nature", latitude: "abc", longitude: "NaN", status: "published" },
    { place_id: "BAD-LNG", name_th: "ลองจิจูดเกิน", district: "ban_ta_khun", category: "nature", latitude: "8", longitude: "181", status: "published" },
    { place_id: "BLANK", name_th: "", district: "", category: "", status: "published" }
  ];
}

function createCache(seed = {}) {
  const values = new Map(Object.entries(seed));
  const puts = [];
  return {
    values,
    puts,
    get(key) { return values.has(key) ? values.get(key) : null; },
    put(key, value, ttl) { puts.push({ key, value, ttl }); values.set(key, value); }
  };
}

function createProperties(initial = "1", options = {}) {
  const values = new Map();
  if (initial !== null) values.set("PLACE_PUBLIC_CACHE_EPOCH", initial);
  const calls = [];
  return {
    values,
    calls,
    getProperty(key) {
      calls.push({ method: "get", key });
      if (options.throwGet) throw new Error("raw property read secret");
      return values.has(key) ? values.get(key) : null;
    },
    setProperty(key, value) {
      calls.push({ method: "set", key, value });
      if (options.throwSet) throw new Error("raw property write secret");
      values.set(key, options.corruptSet === undefined ? value : options.corruptSet);
    },
    deleteProperty(key) {
      calls.push({ method: "delete", key });
      if (options.throwDelete) throw new Error("raw property delete secret");
      if (!options.retainOnDelete) values.delete(key);
    }
  };
}

function loadBackend(options = {}) {
  const cache = options.cache || createCache();
  const properties = options.properties || createProperties();
  const rows = options.rows || makeRows();
  const context = {
    JSON,
    Object,
    Math,
    Number,
    String,
    Array,
    Date,
    console,
    CacheService: { getScriptCache: () => cache },
    PropertiesService: { getScriptProperties: () => properties },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(text) {
        return { text, mime: "", setMimeType(mime) { this.mime = mime; return this; } };
      }
    },
    readSheetObjects_: options.readSheetObjects || ((name) => {
      assert.equal(name, "places");
      return rows;
    })
  };
  vm.createContext(context);
  for (const file of ["apps-script/Config.gs", "apps-script/ApiResponse.gs", "apps-script/PlaceService.gs", "apps-script/Router.gs"]) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return { context, cache, rows, properties };
}

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

function payload(output) {
  assert.equal(output.mime, "application/json");
  return JSON.parse(output.text);
}

test("published visibility excludes draft hidden and deleted without mutating source", () => {
  const { context, rows } = loadBackend();
  const before = JSON.stringify(rows);
  const result = plain(context.buildPlacesResponse_(rows, {}));
  assert.deepEqual(result.data.items.map((item) => item.place_id), ["P-1", "P-2", "BLANK", "P-4", "BAD", "BAD-LNG", "NO-LNG", "NO-LAT"]);
  assert.equal(JSON.stringify(rows), before);
  assert.equal(result.data.items.some((item) => "note" in item || "admin_notes" in item || "password_hash" in item), false);
});

test("getPlaces supports every documented text filter and localized keyword fallback", () => {
  const { context, rows } = loadBackend();
  assert.deepEqual(plain(context.buildPlacesResponse_(rows, { district: "phanom" })).data.items.map((x) => x.place_id), ["P-4"]);
  assert.deepEqual(plain(context.buildPlacesResponse_(rows, { category: "community_tourism" })).data.items.map((x) => x.place_id), ["P-1"]);
  assert.deepEqual(plain(context.buildPlacesResponse_(rows, { route_group: "main_point_2" })).data.items.map((x) => x.place_id), ["P-2"]);
  assert.deepEqual(plain(context.buildPlacesResponse_(rows, { keyword: "LOCAL", lang: "en" })).data.items.map((x) => x.place_id), ["P-1"]);
  assert.deepEqual(plain(context.buildPlacesResponse_(rows, { keyword: "วิวสวย", lang: "en" })).data.items.map((x) => x.place_id), ["P-2"]);
  assert.equal(plain(context.buildPlacesResponse_(rows, { district: "" })).data.total, 8);
});

test("getPlaces combines filters and safely normalizes true false one and zero", () => {
  const { context, rows } = loadBackend();
  assert.deepEqual(plain(context.buildPlacesResponse_(rows, { district: "ban_ta_khun", category: "nature", featured: "true", main_route: 1 })).data.items.map((x) => x.place_id), ["P-2"]);
  assert.deepEqual(plain(context.buildPlacesResponse_(rows, { featured: "false" })).data.items.map((x) => x.place_id), ["BLANK", "P-4", "BAD", "BAD-LNG", "NO-LNG", "NO-LAT"]);
  assert.deepEqual(plain(context.buildPlacesResponse_(rows, { main_route: "0" })).data.items.map((x) => x.place_id), ["BLANK", "P-4", "BAD", "BAD-LNG", "NO-LNG", "NO-LAT"]);
  assert.equal(plain(context.buildPlacesResponse_(rows, { featured: false })).ok, true);
  assert.equal(plain(context.buildPlacesResponse_(rows, { featured: "yes" })).error.code, "VALIDATION_ERROR");
});

test("pagination defaults validates bounds and reports exact metadata", () => {
  const { context, rows } = loadBackend();
  const defaults = plain(context.buildPlacesResponse_(rows, {}));
  assert.deepEqual({ page: defaults.data.page, page_size: defaults.data.page_size, total: defaults.data.total, total_pages: defaults.data.total_pages }, { page: 1, page_size: 20, total: 8, total_pages: 1 });
  const custom = plain(context.buildPlacesResponse_(rows, { page: "2", page_size: "3" }));
  assert.deepEqual(custom.data.items.map((x) => x.place_id), ["P-4", "BAD", "BAD-LNG"]);
  assert.deepEqual({ page: custom.data.page, page_size: custom.data.page_size, total: custom.data.total, total_pages: custom.data.total_pages }, { page: 2, page_size: 3, total: 8, total_pages: 3 });
  assert.deepEqual(plain(context.buildPlacesResponse_(rows, { page: 99, page_size: 20 })).data.items, []);
  for (const params of [{ page: 0 }, { page: "x" }, { page: 1.5 }, { page_size: 0 }, { page_size: "x" }, { page_size: 101 }]) {
    assert.equal(plain(context.buildPlacesResponse_(rows, params)).error.code, "VALIDATION_ERROR");
  }
});

test("sorting is featured desc numeric sort asc name asc stable and non-mutating", () => {
  const { context, rows } = loadBackend();
  const before = rows.map((row) => row.place_id);
  const result = plain(context.buildPlacesResponse_(rows, {}));
  assert.deepEqual(result.data.items.slice(0, 2).map((x) => x.place_id), ["P-1", "P-2"]);
  assert.equal(result.data.items.at(-1).place_id, "NO-LAT");
  assert.deepEqual(rows.map((row) => row.place_id), before);
});

test("list projection follows API contract and language fallback", () => {
  const { context, rows } = loadBackend();
  const item = plain(context.buildPlacesResponse_(rows, { category: "nature", featured: true, lang: "en" })).data.items[0];
  assert.deepEqual(Object.keys(item), ["place_id", "name", "name_th", "name_en", "district", "category", "route_group", "short_description", "phone", "google_maps_url", "latitude", "longitude", "cover_image_url", "is_featured", "is_main_route_point"]);
  assert.equal(item.name, "Dam");
  assert.equal(item.short_description, "วิวสวย");
});

test("detail validates identifiers and hides all unpublished records as not found", () => {
  const { context, rows } = loadBackend();
  for (const id of [undefined, "", "   ", "../P-1", "<script>"]) assert.equal(plain(context.buildPlaceDetailResponse_(rows, { place_id: id })).error.code, "VALIDATION_ERROR");
  for (const id of ["MISSING", "DRAFT", "HIDDEN", "DELETED"]) assert.equal(plain(context.buildPlaceDetailResponse_(rows, { place_id: id })).error.code, "NOT_FOUND");
  assert.equal(plain(context.buildPlaceDetailResponse_(rows, { place_id: " P-2 " })).data.place_id, "P-2");
});

test("detail projection uses schema fields only and defaults unavailable joins", () => {
  const { context, rows } = loadBackend();
  const detail = plain(context.buildPlaceDetailResponse_(rows, { place_id: "P-2", lang: "en" })).data;
  assert.equal(detail.name, "Dam");
  assert.equal(detail.description, "รายละเอียด");
  assert.deepEqual(detail.gallery_image_urls, ["https://legacy.example/a.jpg", "https://legacy.example/b.jpg"]);
  assert.deepEqual(detail.gallery_media_ids, ["place-p2-gallery-b", "place-p2-gallery-a"]);
  assert.deepEqual(detail.tags, ["เขื่อน", "เรือ"]);
  assert.deepEqual(detail.nearby_places, []);
  assert.deepEqual(detail.reviews_summary, { average_rating: 0, review_count: 0 });
  assert.equal("status" in detail || "nearby_place_ids" in detail || "admin_notes" in detail, false);
});

test("Public Gallery projection preserves only canonical complete serialization and never infers legacy URLs", () => {
  const { context, rows } = loadBackend();
  const source = rows.find((row) => row.place_id === "P-2");
  assert.deepEqual(plain(context.buildPlaceDetailResponse_([source], { place_id: "P-2" })).data.gallery_media_ids,
    ["place-p2-gallery-b", "place-p2-gallery-a"]);
  for (const gallery_media_ids of [
    " place-p2-gallery-a", "place-p2-gallery-a ", "place-p2-gallery-a||place-p2-gallery-b",
    "place-p2-gallery-a|place-p2-gallery-a", "PLACE-P2-GALLERY-A", "bad_id",
    Array.from({ length: 51 }, (_value, index) => `place-p2-gallery-${index + 1}`).join("|")
  ]) {
    const projected = plain(context.buildPlaceDetailResponse_([{ ...source, gallery_media_ids }], { place_id: "P-2" })).data;
    assert.deepEqual(projected.gallery_media_ids, [], gallery_media_ids);
  }
  const legacyOnly = plain(context.buildPlaceDetailResponse_([{ ...source, gallery_media_ids: "", gallery_image_urls: "https://legacy.example/private.jpg" }], { place_id: "P-2" })).data;
  assert.deepEqual(legacyOnly.gallery_media_ids, []);
});

test("Public projection changes only after a complete draft snapshot is promoted", () => {
  const { context, rows } = loadBackend();
  const before = plain(context.buildPlaceDetailResponse_(rows, { place_id: "P-2", lang: "th" }));
  const activeDraft = {
    ...rows.find((row) => row.place_id === "P-2"),
    name_th: "published only after promotion",
    description_th: "new complete draft content",
    gallery_media_ids: "place-p2-gallery-new",
    draft_version: 4,
    base_published_version: 1,
    created_by: "ADM-private",
    updated_by: "ADM-private",
    raw_secret: "DRAFT-ONLY"
  };

  assert.notEqual(before.data.name_th, "published only after promotion");
  assert.equal(JSON.stringify(before).includes("published only after promotion"), false);

  const failedPublishRows = rows.map((row) => ({ ...row }));
  assert.deepEqual(
    plain(context.buildPlaceDetailResponse_(failedPublishRows, { place_id: "P-2", lang: "th" })),
    before,
    "a failed Publish must leave the retained Public snapshot unchanged"
  );

  const promotedRows = rows.map((row) => row.place_id === "P-2"
    ? { ...activeDraft, status: "published", entity_version: 4, published_version: 2 }
    : { ...row });
  const after = plain(context.buildPlaceDetailResponse_(promotedRows, { place_id: "P-2", lang: "th" }));
  assert.equal(after.data.name_th, "published only after promotion");
  assert.equal(after.data.description, "new complete draft content");
  assert.deepEqual(after.data.gallery_media_ids, ["place-p2-gallery-new"]);
  for (const forbidden of ["draft_version", "base_published_version", "created_by", "updated_by", "raw_secret"]) {
    assert.equal(JSON.stringify(after).includes(forbidden), false, `${forbidden} must not enter Public output`);
  }
});

test("Public lifecycle isolation follows only committed Place status", () => {
  const { context, rows } = loadBackend();
  const retained = rows.find((row) => row.place_id === "P-2");
  const published = plain(context.buildPlaceDetailResponse_([{ ...retained, status: "published" }], { place_id: "P-2", lang: "th" }));
  assert.equal(published.ok, true);
  for (const status of ["draft", "archived"]) {
    const lifecycleRows = [{ ...retained, status }];
    assert.equal(plain(context.buildPlaceDetailResponse_(lifecycleRows, { place_id: "P-2", lang: "th" })).error.code, "NOT_FOUND");
    assert.deepEqual(plain(context.buildPlacesResponse_(lifecycleRows, {})).data.items, []);
  }
  assert.deepEqual(
    plain(context.buildPlaceDetailResponse_([{ ...retained, status: "published" }], { place_id: "P-2", lang: "th" })),
    published,
    "failed Unpublish or Archive must leave the prior Public snapshot visible"
  );
});

test("map returns only published finite in-range coordinate pairs", () => {
  const { context, rows } = loadBackend();
  const result = plain(context.buildMapPlacesResponse_(rows, {}));
  assert.deepEqual(result.data.places.map((x) => x.place_id), ["P-1", "P-2"]);
  assert.equal(result.data.places[0].latitude, -90);
  assert.equal(result.data.places[0].longitude, 180);
  assert.deepEqual(Object.keys(result.data.places[0]), ["place_id", "name", "category", "district", "route_group", "latitude", "longitude", "google_maps_url", "phone", "cover_image_url", "is_main_route_point", "sort_order"]);
});

test("map supports only documented category district and main route filters", () => {
  const { context, rows } = loadBackend();
  assert.deepEqual(plain(context.buildMapPlacesResponse_(rows, { category: "nature" })).data.places.map((x) => x.place_id), ["P-2"]);
  assert.deepEqual(plain(context.buildMapPlacesResponse_(rows, { category: "all" })).data.places.map((x) => x.place_id), ["P-1", "P-2"]);
  assert.deepEqual(plain(context.buildMapPlacesResponse_(rows, { district: "ban_ta_khun", route: "main" })).data.places.map((x) => x.place_id), ["P-1", "P-2"]);
  assert.equal(plain(context.buildMapPlacesResponse_(rows, { route: "other" })).error.code, "VALIDATION_ERROR");
  assert.deepEqual(plain(context.buildMapPlacesResponse_(rows, {})).data.main_route, { route_id: "ROUTE-001", place_ids: ["P-1", "P-2"] });
});

test("public cache uses action and effective filters, hits, recovers malformed values and never stores errors", () => {
  const cache = createCache();
  let reads = 0;
  const { context } = loadBackend({ cache, readSheetObjects: () => { reads += 1; return makeRows(); } });
  const first = plain(context.getPlaces_({ category: "nature", page: "1" }));
  const second = plain(context.getPlaces_({ page: "1", category: "nature" }));
  assert.deepEqual(second, first);
  assert.equal(reads, 1);
  assert.equal(cache.puts.length, 1);
  assert.equal(cache.puts[0].ttl, 300);
  context.getPlaces_({ category: "community_tourism", page: "1" });
  assert.equal(reads, 2);
  assert.notEqual(cache.puts[0].key, cache.puts[1].key);
  context.getPlaceDetail_({ place_id: "P-1" });
  context.getMapPlaces_({ category: "nature" });
  assert.equal(cache.puts.some((entry) => entry.key.includes(":getPlaceDetail:")), true);
  assert.equal(cache.puts.some((entry) => entry.key.includes(":getMapPlaces:")), true);
  const readsBeforeMalformedRecovery = reads;
  cache.values.set(cache.puts[0].key, "not-json");
  context.getPlaces_({ category: "nature", page: "1" });
  assert.equal(reads, readsBeforeMalformedRecovery + 1);
  const putsBeforeError = cache.puts.length;
  const invalid = plain(context.getPlaces_({ featured: "invalid" }));
  assert.equal(invalid.error.code, "VALIDATION_ERROR");
  assert.equal(cache.puts.length, putsBeforeError);
});

test("Place cache epoch validates reads and bumps with verified deterministic state", () => {
  const established = loadBackend({ properties: createProperties("7") });
  assert.equal(established.context.PlaceService_cacheEpoch_(), 7);
  assert.equal(established.context.PlaceService_cacheEpochKey_(), "place-epoch:7");
  assert.equal(loadBackend({ properties: createProperties(null) }).context.PlaceService_cacheEpoch_(), 1);
  for (const malformed of ["", "0", "01", "-1", "1.0", " 1", "1 ", "9007199254740992", 1, true]) {
    assert.throws(() => loadBackend({ properties: createProperties(malformed) }).context.PlaceService_cacheEpoch_(), /CACHE_EPOCH/);
  }

  const properties = createProperties("7");
  const { context } = loadBackend({ properties });
  assert.equal(context.PlaceService_bumpCacheEpoch_(), 8);
  assert.equal(properties.values.get("PLACE_PUBLIC_CACHE_EPOCH"), "8");

  const absentProperties = createProperties(null);
  const absent = loadBackend({ properties: absentProperties });
  assert.equal(absent.context.PlaceService_bumpCacheEpoch_(), 2);
  assert.equal(absentProperties.values.get("PLACE_PUBLIC_CACHE_EPOCH"), "2");

  assert.throws(() => loadBackend({ properties: createProperties("9007199254740991") }).context.PlaceService_bumpCacheEpoch_(), /CACHE_EPOCH/);
  assert.throws(() => loadBackend({ properties: createProperties("7", { corruptSet: "9" }) }).context.PlaceService_bumpCacheEpoch_(), /CACHE_EPOCH/);
});

test("all three Place cache actions change namespace by epoch and ignore client epoch input", () => {
  const cache = createCache();
  const properties = createProperties("1");
  let reads = 0;
  const { context } = loadBackend({ cache, properties, readSheetObjects: () => { reads += 1; return makeRows(); } });
  const calls = [
    () => context.getPlaces_({ category: "nature", cache_epoch: 999, token: "session-secret" }),
    () => context.getPlaceDetail_({ place_id: "P-1", epoch: "client", session_id: "session-secret" }),
    () => context.getMapPlaces_({ category: "nature", PLACE_PUBLIC_CACHE_EPOCH: "client" })
  ];
  calls.forEach((call) => { call(); call(); });
  assert.equal(reads, 3);
  assert.equal(cache.puts.length, 3);
  cache.puts.forEach((entry) => assert.match(entry.key, /^public:(getPlaces|getPlaceDetail|getMapPlaces):place-epoch:1(?::|$)/));
  properties.values.set("PLACE_PUBLIC_CACHE_EPOCH", "2");
  calls.forEach((call) => call());
  assert.equal(reads, 6);
  cache.puts.slice(3).forEach((entry) => assert.match(entry.key, /:place-epoch:2(?::|$)/));
  assert.equal(cache.puts.some((entry) => /999|client|session-secret|PLACE_PUBLIC_CACHE_EPOCH/.test(entry.key)), false);
});

test("malformed or unavailable epoch bypasses cache without leaking property details", () => {
  for (const properties of [createProperties("bad"), createProperties("1", { throwGet: true })]) {
    const cache = createCache();
    let reads = 0;
    const { context } = loadBackend({ cache, properties, readSheetObjects: () => { reads += 1; return makeRows(); } });
    const first = plain(context.getPlaces_({ category: "nature" }));
    const second = plain(context.getPlaces_({ category: "nature" }));
    assert.equal(first.ok, true);
    assert.deepEqual(second, first);
    assert.equal(reads, 2);
    assert.equal(cache.puts.length, 0);
    assert.equal(JSON.stringify(first).includes("property"), false);
    assert.equal(JSON.stringify(first).includes("PLACE_PUBLIC_CACHE_EPOCH"), false);
  }
});

test("Gallery Settings and Categories cache namespaces ignore Place epoch changes", () => {
  const cases = [
    { file: "apps-script/GalleryService.gs", action: "getGallery_", sheet: "gallery", parameters: {} },
    { file: "apps-script/SettingsService.gs", action: "getSettings_", sheet: "settings", parameters: {} },
    { file: "apps-script/CategoryService.gs", action: "getCategories_", sheet: "categories", parameters: {} }
  ];
  cases.forEach((entry) => {
    const cache = createCache();
    const properties = createProperties("1");
    let reads = 0;
    const context = {
      JSON, Object, Math, Number, String, Array, Date, RegExp, encodeURIComponent, isFinite,
      CacheService: { getScriptCache: () => cache },
      PropertiesService: { getScriptProperties: () => properties },
      readSheetObjects_(name) { assert.equal(name, entry.sheet); reads += 1; return []; }
    };
    vm.createContext(context);
    vm.runInContext(read(entry.file), context, { filename: entry.file });
    assert.equal(plain(context[entry.action](entry.parameters)).ok, true);
    properties.values.set("PLACE_PUBLIC_CACHE_EPOCH", "2");
    assert.equal(plain(context[entry.action](entry.parameters)).ok, true);
    assert.equal(reads, 1, `${entry.action} must reuse its cache across Place epoch changes`);
    assert.equal(cache.puts.length, 1);
    assert.equal(cache.puts[0].key.includes("place-epoch"), false);
  });
});

test("router dispatches all place actions and returns JSON errors for unknown methods actions and exceptions", () => {
  const { context } = loadBackend();
  for (const action of ["getPlaces", "getPlaceDetail", "getMapPlaces"]) {
    const params = action === "getPlaceDetail" ? { action, place_id: "P-1" } : { action };
    assert.equal(payload(context.routeRequest_("GET", { parameter: params })).ok, true);
  }
  assert.equal(payload(context.routeRequest_("GET", { parameter: { action: "missing" } })).error.code, "UNKNOWN_ACTION");
  assert.equal(payload(context.routeRequest_("POST", { parameter: { action: "getPlaces" } })).error.code, "UNKNOWN_ACTION");
  assert.equal(payload(context.routeRequest_("GET", {})).error.code, "UNKNOWN_ACTION");
  context.getPlaces_ = () => { throw new Error("places / spreadsheet id / stack secret"); };
  const error = payload(context.routeRequest_("GET", { parameter: { action: "getPlaces" } }));
  assert.deepEqual(error, { ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดของระบบ" } });
});

test("sheet reader handles missing empty headers-only blank and short rows without writes", () => {
  const source = read("apps-script/SheetService.gs");
  function run(values, missing = false) {
    let writes = 0;
    const sheet = missing ? null : { getDataRange: () => ({ getValues: () => values }), clear: () => { writes += 1; } };
    const context = {
      getAppConfig_: () => ({ spreadsheetId: "configured" }),
      SpreadsheetApp: { openById: () => ({ getSheetByName: (name) => { assert.equal(name, "places"); return sheet; } }) }
    };
    vm.createContext(context);
    vm.runInContext(source, context, { filename: "apps-script/SheetService.gs" });
    let result;
    try { result = plain(context.readSheetObjects_("places")); } catch (error) { result = { error: error.message }; }
    return { result, writes };
  }
  assert.deepEqual(run([], false).result, []);
  assert.deepEqual(run([[" id ", "name"], ["P-1"], ["", ""], ["P-2", "Two"]]).result, [{ id: "P-1", name: "" }, { id: "P-2", name: "Two" }]);
  assert.deepEqual(run([["id"]]).result, []);
  assert.match(run([], true).result.error, /not available/i);
  assert.equal(run([["id"], ["P-1"]]).writes, 0);
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("PlaceService and public place API verification passed.\n");
