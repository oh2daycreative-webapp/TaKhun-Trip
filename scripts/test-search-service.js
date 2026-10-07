"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const searchFile = path.join(root, "apps-script/SearchService.gs");
const serviceFiles = ["PlaceService.gs", "RouteService.gs", "ProductService.gs", "EventService.gs"];
const SECTION_KEYS = ["places", "products", "events", "routes"];
const ITEM_KEYS = {
  places: ["place_id", "name", "short_description", "category", "district", "cover_image_url"],
  products: ["product_id", "name", "description", "category", "producer_name", "image_url"],
  events: ["event_id", "title", "event_type", "event_date", "start_time", "end_time", "location", "image_url"],
  routes: ["route_id", "name", "short_description", "duration", "travel_style", "cover_image_url"]
};
const ID_FIELDS = { places: "place_id", products: "product_id", events: "event_id", routes: "route_id" };
const plain = (value) => JSON.parse(JSON.stringify(value));
const clone = (value) => plain(value);

function place(id, order, overrides = {}) {
  return { place_id: id, name_th: `สถานที่ ${id}`, name_en: `Place ${id}`, district: "ban_ta_khun", category: "nature", route_group: "main_point_1", short_description_th: `คำอธิบาย ${id}`, short_description_en: `Description ${id}`, phone: "", google_maps_url: "", latitude: "", longitude: "", cover_image_url: "place.jpg", is_featured: false, is_main_route_point: false, sort_order: order, status: "published", internal_note: "secret", ...overrides };
}
function route(id, order, overrides = {}) {
  return { route_id: id, name_th: `เส้นทาง ${id}`, name_en: `Route ${id}`, short_description_th: `คำอธิบาย ${id}`, short_description_en: `Description ${id}`, duration: "1 วัน", travel_style: "nature|photo", cover_image_url: "route.jpg", is_featured: false, sort_order: order, status: "published", internal_note: "secret", ...overrides };
}
function product(id, order, overrides = {}) {
  return { product_id: id, name_th: `สินค้า ${id}`, name_en: `Product ${id}`, category: "honey", producer_name: "ชุมชน", related_place_id: "", district: "ban_ta_khun", description_th: `คำอธิบาย ${id}`, description_en: `Description ${id}`, price_range: "", phone: "", contact_url: "", google_maps_url: "", image_url: "product.jpg", is_featured: false, sort_order: order, status: "published", internal_note: "secret", ...overrides };
}
function event(id, date, overrides = {}) {
  return { event_id: id, title_th: `กิจกรรม ${id}`, title_en: `Event ${id}`, event_type: "festival", event_date: date, start_time: "09:00", end_time: "10:00", location_th: "บ้านตาขุน", location_en: "Ban Ta Khun", image_url: "event.jpg", contact_name: "", contact_phone: "", register_url: "", status: "published", internal_note: "secret", ...overrides };
}
function baseRows() {
  return {
    places: [place("P-1", 1)],
    routes: [route("R-1", 1)],
    products: [product("PR-1", 1)],
    events: [event("E-PAST", "2026-01-01"), event("E-CURRENT", "2026-07-15"), event("E-FUTURE", "2026-12-31")]
  };
}

function createCache(options = {}) {
  const values = new Map(); const gets = []; const puts = [];
  return {
    values, gets, puts,
    get(key) { gets.push(key); if (options.throwGet) throw new Error("cache read failed"); return values.has(key) ? values.get(key) : null; },
    put(key, value, ttl) { puts.push({ key, value, ttl }); if (options.throwPut) throw new Error("cache write failed"); values.set(key, value); }
  };
}

function createProperties(initial = "1") {
  const values = new Map();
  if (initial !== null) values.set("PLACE_PUBLIC_CACHE_EPOCH", initial);
  return { values, getProperty(key) { return values.has(key) ? values.get(key) : null; } };
}

function load(options = {}) {
  const rows = clone(options.rows || baseRows());
  const cache = options.cache || createCache();
  const properties = options.properties || createProperties();
  const reads = [];
  const builderCalls = [];
  const context = {
    JSON, Object, Math, Number, String, Array, Date, RegExp,
    encodeURIComponent, decodeURIComponent, isFinite,
    CacheService: { getScriptCache: () => { if (options.throwCacheService) throw new Error("cache unavailable"); return cache; } },
    PropertiesService: { getScriptProperties: () => properties },
    readSheetObjects_: (name) => {
      reads.push(name);
      if (options.failRead === name) throw new Error(`source failed: ${name}`);
      return rows[name] || [];
    }
  };
  // Generation races and eviction are tested with the real helper in test-admin-content-service.js.
  context.ContentCacheService_key_ = () => "content-epoch:test";
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "apps-script", "Config.gs"), "utf8"), context, { filename: "apps-script/Config.gs" });
  serviceFiles.forEach((name) => vm.runInContext(fs.readFileSync(path.join(root, "apps-script", name), "utf8"), context, { filename: `apps-script/${name}` }));
  ["buildPlacesResponse_", "RouteService_buildRoutesResponse_", "ProductService_buildProductsResponse_", "EventService_buildEventsResponse_"].forEach((name) => {
    const original = context[name];
    context[name] = function (...args) {
      builderCalls.push({ name, parameters: clone(args[1] || {}) });
      if (options.failBuilder === name) throw new Error("builder failed");
      if (options.malformedBuilder === name) return { ok: true, data: { wrong: [] }, message: "success" };
      return original.apply(this, args);
    };
  });
  ["getPlaces_", "getRoutes_", "getProducts_", "getEvents_"].forEach((name) => { context[name] = () => { throw new Error(`Search must not call cached endpoint ${name}`); }; });
  if (fs.existsSync(searchFile)) vm.runInContext(fs.readFileSync(searchFile, "utf8"), context, { filename: "apps-script/SearchService.gs" });
  return { context, rows, cache, reads, builderCalls, properties };
}

function required(context, name = "searchAll_") {
  assert.equal(typeof context[name], "function", `${name} must be implemented by apps-script/SearchService.gs`);
  return context[name];
}

function assertExactSuccess(response) {
  assert.deepEqual(Object.keys(response), ["ok", "data", "message"]);
  assert.equal(response.ok, true); assert.equal(response.message, "success");
  assert.deepEqual(Object.keys(response.data), [...SECTION_KEYS, "total"]);
  let returned = 0;
  SECTION_KEYS.forEach((section) => {
    assert.equal(Array.isArray(response.data[section]), true);
    assert.ok(response.data[section].length <= 10);
    const ids = new Set();
    response.data[section].forEach((item) => {
      assert.deepEqual(Object.keys(item), ITEM_KEYS[section]);
      assert.equal(ids.has(item[ID_FIELDS[section]]), false); ids.add(item[ID_FIELDS[section]]);
    });
    returned += response.data[section].length;
  });
  assert.equal(Number.isInteger(response.data.total), true);
  assert.ok(response.data.total >= returned);
}

function test(name, fn) {
  try { fn(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

test("empty missing and whitespace keywords return exact success without sheets or cache", () => {
  for (const parameters of [{}, { keyword: "" }, { keyword: " \t\r\n " }]) {
    const loaded = load(); const search = required(loaded.context);
    const response = plain(search(parameters)); assertExactSuccess(response);
    SECTION_KEYS.forEach((section) => assert.deepEqual(response.data[section], []));
    assert.equal(response.data.total, 0); assert.deepEqual(loaded.reads, []); assert.deepEqual(loaded.cache.gets, []);
  }
});

test("keyword normalization counts Unicode code points and rejects only 101 or more", () => {
  for (const keyword of ["ก", "😀", "ก".repeat(100), "😀".repeat(100)]) {
    const loaded = load({ rows: { places: [], products: [], events: [], routes: [] } });
    const response = plain(required(loaded.context)({ keyword })); assertExactSuccess(response);
  }
  for (const keyword of ["ก".repeat(101), "😀".repeat(101)]) {
    const loaded = load();
    assert.deepEqual(plain(required(loaded.context)({ keyword })), { ok: false, error: { code: "VALIDATION_ERROR", message: "พารามิเตอร์ keyword ไม่ถูกต้อง" } });
    assert.deepEqual(loaded.reads, []); assert.equal(loaded.cache.puts.length, 0);
  }
});

test("NFC whitespace lowercase and effective language produce canonical cache keys", () => {
  const decomposed = "Cafe\u0301   NEEDLE";
  const first = load({ rows: { places: [], products: [], events: [], routes: [] } });
  required(first.context)({ keyword: `  ${decomposed} `, lang: "unknown", ignored: "x" });
  assert.equal(first.cache.gets[0], "public:searchAll:place-epoch:1:content-epoch:test:keyword=caf%C3%A9%20needle:lang=th");
  const second = load({ rows: { places: [], products: [], events: [], routes: [] } });
  required(second.context)({ keyword: "CAFÉ NEEDLE", lang: "en", domain: "gallery" });
  assert.equal(second.cache.gets[0], "public:searchAll:place-epoch:1:content-epoch:test:keyword=caf%C3%A9%20needle:lang=en");
  assert.deepEqual(second.builderCalls.map((call) => call.parameters.lang), ["en", "en", "en", "en"]);
});

test("matches only approved public fields with Thai English fallback and travel style", () => {
  const rows = {
    places: [place("P-TH", 1, { name_th: "น้ำตกสายรุ้ง", name_en: "Rainbow Falls" }), place("P-FALLBACK", 2, { name_th: "ชุมชนเขียว", name_en: "" })],
    routes: [route("R-STYLE", 1, { name_th: "เส้นทาง", name_en: "Route", travel_style: "nature|photo" })],
    products: [product("PR-CASE", 1, { name_th: "น้ำผึ้ง", name_en: "Forest HONEY" })],
    events: [event("E-LOC", "2026-07-15", { title_th: "งาน", title_en: "Fair", location_th: "ตลาดคลองแสง", location_en: "Khlong Saeng Market" })]
  };
  assert.deepEqual(plain(required(load({ rows }).context)({ keyword: "ตกสาย", lang: "th" })).data.places.map((x) => x.place_id), ["P-TH"]);
  assert.deepEqual(plain(required(load({ rows }).context)({ keyword: "rain", lang: "en" })).data.places.map((x) => x.place_id), ["P-TH"]);
  assert.deepEqual(plain(required(load({ rows }).context)({ keyword: "ชุมชนเขียว", lang: "en" })).data.places.map((x) => x.place_id), ["P-FALLBACK"]);
  assert.deepEqual(plain(required(load({ rows }).context)({ keyword: "honey", lang: "en" })).data.products.map((x) => x.product_id), ["PR-CASE"]);
  assert.deepEqual(plain(required(load({ rows }).context)({ keyword: "forest honey", lang: "en" })).data.products.map((x) => x.product_id), ["PR-CASE"]);
  assert.deepEqual(plain(required(load({ rows }).context)({ keyword: "forest", lang: "en" })).data.products.map((x) => x.product_id), ["PR-CASE"]);
  assert.deepEqual(plain(required(load({ rows }).context)({ keyword: "nature", lang: "en" })).data.routes.map((x) => x.route_id), ["R-STYLE"]);
  assert.deepEqual(plain(required(load({ rows }).context)({ keyword: "market", lang: "en" })).data.events.map((x) => x.event_id), ["E-LOC"]);
  const normalizedRows = { places: [place("P-NFC", 1, { name_th: "Cafe\u0301   Lake" })], products: [], events: [], routes: [] };
  assert.deepEqual(plain(required(load({ rows: normalizedRows }).context)({ keyword: "Café Lake" })).data.places.map((x) => x.place_id), ["P-NFC"]);
});

test("returns exact projections stable builder order visibility and valid event dates without mutation", () => {
  const rows = baseRows();
  rows.places.push(place("P-DRAFT", 0, { name_th: "ค้นหา", status: "draft" }), place("P-HIDDEN", 0, { name_th: "ค้นหา", status: "hidden" }), place("P-DELETED", 0, { name_th: "ค้นหา", status: "deleted" }));
  rows.events.push(event("E-BAD", "2026-02-30", { title_th: "ค้นหา" }));
  Object.values(rows).forEach((items) => items.forEach((item) => { if (item.status === "published") { if (item.name_th) item.name_th += " ค้นหา"; if (item.title_th) item.title_th += " ค้นหา"; } }));
  const loaded = load({ rows }); const before = JSON.stringify(loaded.rows);
  const response = plain(required(loaded.context)({ keyword: "ค้นหา" })); assertExactSuccess(response);
  assert.deepEqual(response.data.events.map((x) => x.event_id), ["E-PAST", "E-CURRENT", "E-FUTURE"]);
  assert.equal(JSON.stringify(response).includes("secret"), false);
  assert.equal(JSON.stringify(response).includes("status"), false);
  assert.equal(JSON.stringify(loaded.rows), before);
  assert.deepEqual(loaded.reads, ["places", "routes", "products", "events"]);
  assert.deepEqual(loaded.builderCalls.map((call) => call.name), ["buildPlacesResponse_", "RouteService_buildRoutesResponse_", "ProductService_buildProductsResponse_", "EventService_buildEventsResponse_"]);
  assert.equal(loaded.builderCalls.at(-1).parameters.status, "all");
});

test("deduplicates first valid prototype-like IDs before limits and totals all unique matches", () => {
  const rows = { places: [], products: [], events: [], routes: [] };
  const ids = ["constructor", "toString", "__proto__", ...Array.from({ length: 10 }, (_, i) => `ID-${i}`)];
  ids.forEach((id, index) => {
    rows.places.push(place(id, index + 1, { name_th: `ค้นหา a-first ${id}` }), place(id, index + 1, { name_th: `ค้นหา z-duplicate ${id}` }));
  });
  const response = plain(required(load({ rows }).context)({ keyword: "ค้นหา" })); assertExactSuccess(response);
  assert.deepEqual(response.data.places.map((x) => x.place_id), ids.slice(0, 10));
  assert.equal(response.data.places[0].name.includes("a-first"), true);
  assert.equal(response.data.total, ids.length);
});

test("collects every Place and Product builder page from one sheet read with no missing items", () => {
  const rows = { places: [], products: [], events: [], routes: [] };
  for (let index = 1; index <= 205; index += 1) {
    rows.places.push(place(`P-${index}`, index, { name_th: `needle place ${index}` }));
    rows.products.push(product(`PR-${index}`, index, { name_th: `needle product ${index}` }));
  }
  const loaded = load({ rows }); const response = plain(required(loaded.context)({ keyword: "needle" })); assertExactSuccess(response);
  assert.equal(response.data.total, 410); assert.equal(response.data.places.length, 10); assert.equal(response.data.products.length, 10);
  assert.equal(loaded.reads.filter((name) => name === "places").length, 1); assert.equal(loaded.reads.filter((name) => name === "products").length, 1);
  assert.deepEqual(loaded.builderCalls.filter((call) => call.name === "buildPlacesResponse_").map((call) => call.parameters.page), [1, 2, 3]);
  assert.deepEqual(loaded.builderCalls.filter((call) => call.name === "ProductService_buildProductsResponse_").map((call) => call.parameters.page), [1, 2, 3]);
  loaded.builderCalls.filter((call) => ["buildPlacesResponse_", "ProductService_buildProductsResponse_"].includes(call.name)).forEach((call) => assert.ok(call.parameters.page_size <= 100));
});

test("one or all empty domains keep exact shape", () => {
  const one = baseRows(); one.routes = [];
  const oneResponse = plain(required(load({ rows: one }).context)({ keyword: "สถานที่" })); assertExactSuccess(oneResponse); assert.deepEqual(oneResponse.data.routes, []);
  const emptyResponse = plain(required(load({ rows: { places: [], products: [], events: [], routes: [] } }).context)({ keyword: "anything" })); assertExactSuccess(emptyResponse);
  SECTION_KEYS.forEach((section) => assert.deepEqual(emptyResponse.data[section], [])); assert.equal(emptyResponse.data.total, 0);
});

test("read builder and malformed builder failures are atomic safe and never cached", () => {
  for (const options of [{ failRead: "products" }, { failBuilder: "RouteService_buildRoutesResponse_" }, { malformedBuilder: "EventService_buildEventsResponse_" }]) {
    const loaded = load(options); const response = plain(required(loaded.context)({ keyword: "x" }));
    assert.deepEqual(response, { ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดของระบบ" } });
    assert.equal("data" in response, false); assert.equal(loaded.cache.puts.length, 0);
  }
});

test("cache hit miss exact validation TTL failures and errors follow contract", () => {
  const loaded = load({ rows: { places: [], products: [], events: [], routes: [] } });
  const first = plain(required(loaded.context)({ keyword: "Needle", lang: "invalid" })); assertExactSuccess(first);
  assert.equal(loaded.cache.puts.length, 1); assert.equal(loaded.cache.puts[0].ttl, 300);
  const reads = loaded.reads.length; assert.deepEqual(plain(required(loaded.context)({ keyword: " needle ", lang: "th" })), first); assert.equal(loaded.reads.length, reads);

  const invalidVariants = [
    "not-json",
    JSON.stringify({ ok: true, data: { places: [], products: [], events: [], total: 0 }, message: "success" }),
    JSON.stringify({ ok: true, data: { places: [], products: [], events: [], routes: [], total: 0, extra: true }, message: "success" }),
    JSON.stringify({ ok: true, data: { places: [{ place_id: "P", name: "n", short_description: "", category: "", district: "", cover_image_url: "", extra: "x" }], products: [], events: [], routes: [], total: 1 }, message: "success" }),
    JSON.stringify({ ok: true, data: { places: [{ place_id: "P", name: 1, short_description: "", category: "", district: "", cover_image_url: "" }], products: [], events: [], routes: [], total: 1 }, message: "success" }),
    JSON.stringify({ ok: true, data: { places: [{ place_id: "P", name: "n", short_description: "", category: "", district: "", cover_image_url: "" }, { place_id: "P", name: "n", short_description: "", category: "", district: "", cover_image_url: "" }], products: [], events: [], routes: [], total: 2 }, message: "success" }),
    JSON.stringify({ ok: true, data: { places: [{ place_id: "P", name: "n", short_description: "", category: "", district: "", cover_image_url: "" }], products: [], events: [], routes: [], total: 0 }, message: "success" }),
    JSON.stringify({ ok: true, data: { places: Array.from({ length: 11 }, (_, index) => ({ place_id: `P-${index}`, name: "n", short_description: "", category: "", district: "", cover_image_url: "" })), products: [], events: [], routes: [], total: 11 }, message: "success" }),
    JSON.stringify({ ok: true, data: { places: [], products: [], events: [], routes: [], total: -1 }, message: "success" }),
    JSON.stringify({ ok: true, data: { places: [], products: [], events: [], routes: [], total: "0" }, message: "success" })
  ];
  invalidVariants.forEach((cached) => {
    const cache = createCache(); cache.values.set("public:searchAll:place-epoch:1:content-epoch:test:keyword=needle:lang=th", cached);
    const recovery = load({ cache, rows: { places: [], products: [], events: [], routes: [] } });
    assertExactSuccess(plain(required(recovery.context)({ keyword: "needle" }))); assert.equal(recovery.reads.length, 4); assert.equal(cache.puts.length, 1);
  });
  const cacheFailure = load({ cache: createCache({ throwGet: true, throwPut: true }), rows: { places: [], products: [], events: [], routes: [] } });
  assertExactSuccess(plain(required(cacheFailure.context)({ keyword: "needle" }))); assert.equal(cacheFailure.reads.length, 4);
  const unavailable = load({ throwCacheService: true, rows: { places: [], products: [], events: [], routes: [] } });
  assertExactSuccess(plain(required(unavailable.context)({ keyword: "needle" }))); assert.equal(unavailable.reads.length, 4);
  const error = load({ failRead: "places" }); required(error.context)({ keyword: "needle" }); assert.equal(error.cache.puts.length, 0);
});

test("Search cache becomes unreachable after the Place epoch changes", () => {
  const properties = createProperties("1");
  const loaded = load({ properties });
  const first = plain(required(loaded.context)({ keyword: "place", lang: "en", epoch: "client" }));
  const reads = loaded.reads.length;
  assert.deepEqual(plain(required(loaded.context)({ keyword: "place", lang: "en" })), first);
  assert.equal(loaded.reads.length, reads);
  properties.values.set("PLACE_PUBLIC_CACHE_EPOCH", "2");
  assert.deepEqual(plain(required(loaded.context)({ keyword: "place", lang: "en" })), first);
  assert.equal(loaded.reads.length, reads * 2);
  assert.match(loaded.cache.puts.at(-1).key, /^public:searchAll:place-epoch:2:/);
  assert.equal(JSON.stringify(first).includes("epoch"), false);
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("SearchService verification passed.\n");
