"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const homeFile = path.join(root, "apps-script/HomeService.gs");
const serviceFiles = [
  "PlaceService.gs", "RouteService.gs", "ProductService.gs",
  "EventService.gs", "GalleryService.gs"
];

const SECTION_KEYS = [
  "featured_routes", "featured_places", "featured_products",
  "upcoming_events", "gallery_preview"
];
const ITEM_KEYS = {
  featured_routes: ["route_id", "name", "short_description", "duration", "travel_style", "cover_image_url", "is_featured"],
  featured_places: ["place_id", "name", "name_th", "name_en", "district", "category", "route_group", "short_description", "phone", "google_maps_url", "latitude", "longitude", "cover_image_url", "is_featured", "is_main_route_point"],
  featured_products: ["product_id", "name", "category", "producer_name", "related_place_id", "description", "price_range", "phone", "contact_url", "google_maps_url", "image_url", "is_featured"],
  upcoming_events: ["event_id", "title", "event_type", "event_date", "start_time", "end_time", "location", "image_url", "contact_name", "contact_phone", "register_url"],
  gallery_preview: ["media_id", "title", "media_type", "category", "related_place_id", "image_url", "video_url", "thumbnail_url", "caption", "credit"]
};
const LIMITS = { featured_routes: 2, featured_places: 4, featured_products: 4, upcoming_events: 3, gallery_preview: 6 };

const plain = (value) => JSON.parse(JSON.stringify(value));
const clone = (value) => plain(value);

function route(id, order, overrides = {}) {
  return { route_id: id, name_th: `เส้นทาง ${id}`, name_en: `Route ${id}`, short_description_th: `รายละเอียด ${id}`, short_description_en: `Description ${id}`, duration: "1 วัน", travel_style: "nature|photo", cover_image_url: "route.jpg", is_featured: true, sort_order: order, status: "published", internal_note: "secret", ...overrides };
}
function place(id, order, overrides = {}) {
  return { place_id: id, name_th: `สถานที่ ${id}`, name_en: `Place ${id}`, district: "ban_ta_khun", category: "nature", route_group: "main_point_1", short_description_th: `คำอธิบาย ${id}`, short_description_en: `Description ${id}`, phone: "0123", google_maps_url: "https://maps.example", latitude: "", longitude: "", cover_image_url: "place.jpg", is_featured: true, is_main_route_point: false, sort_order: order, status: "published", admin_note: "secret", ...overrides };
}
function product(id, order, overrides = {}) {
  return { product_id: id, name_th: `สินค้า ${id}`, name_en: `Product ${id}`, category: "honey", producer_name: "ชุมชน", related_place_id: "P-1", district: "ban_ta_khun", description_th: `คำอธิบาย ${id}`, description_en: `Description ${id}`, price_range: "100", phone: "0123", contact_url: "https://contact.example", google_maps_url: "https://maps.example", image_url: "product.jpg", is_featured: true, sort_order: order, status: "published", cost_price: "secret", ...overrides };
}
function event(id, date, overrides = {}) {
  return { event_id: id, title_th: `กิจกรรม ${id}`, title_en: `Event ${id}`, event_type: "festival", event_date: date, start_time: "09:00", end_time: "10:00", location_th: "บ้านตาขุน", location_en: "Ban Ta Khun", image_url: "event.jpg", contact_name: "Contact", contact_phone: "0123", register_url: "https://register.example", status: "published", internal_note: "secret", ...overrides };
}
function gallery(id, order, overrides = {}) {
  return { media_id: id, title_th: `ภาพ ${id}`, title_en: `Media ${id}`, media_type: "image", category: "place", related_place_id: "P-1", image_url: "image.jpg", video_url: "", thumbnail_url: "thumb.jpg", caption_th: `คำบรรยาย ${id}`, caption_en: `Caption ${id}`, credit: "เครดิต", sort_order: order, status: "published", internal_note: "secret", ...overrides };
}

function baseRows() {
  return {
    routes: [route("R-2", 2), route("R-1", 1), route("R-1", 1, { name_th: "รายการซ้ำ" }), route("R-3", 3), route("R-NO", 0, { is_featured: false }), route("R-DRAFT", 0, { status: "draft" }), route("", 0)],
    places: [place("P-4", 4), place("P-1", 1, { name_en: "" }), place("P-2", 2), place("P-3", 3), place("P-5", 5), place("P-NO", 0, { is_featured: false }), place("P-HIDDEN", 0, { status: "hidden" }), place("", 0)],
    products: [product("PR-4", 4), product("PR-1", 1), product("PR-2", 2), product("PR-3", 3), product("PR-5", 5), product("PR-NO", 0, { is_featured: false }), product("PR-DRAFT", 0, { status: "draft" }), product("", 0)],
    events: [event("E-LATER", "2026-07-20"), event("E-TODAY", "2026-07-15"), event("E-NEXT", "2026-07-16"), event("E-FOURTH", "2026-07-21"), event("E-PAST", "2026-07-14"), event("E-BAD", "2026-02-30"), event("E-DRAFT", "2026-07-15", { status: "draft" }), event("", "2026-07-15")],
    gallery: [gallery("G-6", 6), gallery("G-1", 1), gallery("G-2", 2), gallery("G-3", 3), gallery("G-4", 4), gallery("G-5", 5), gallery("G-7", 7), gallery("G-DRAFT", 0, { status: "draft" }), gallery("G-BAD", 0, { media_type: "audio" }), gallery("", 0)]
  };
}

function createCache(options = {}) {
  const values = new Map();
  const gets = [];
  const puts = [];
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
  assert.equal(fs.existsSync(homeFile), true, "apps-script/HomeService.gs must exist before Home tests can pass");
  const rows = clone(options.rows || baseRows());
  const cache = options.cache || createCache();
  const properties = options.properties || createProperties();
  const reads = [];
  const builderCalls = [];
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ["2026-07-15T06:00:00.000Z"])); }
  }
  const context = {
    JSON, Object, Math, Number, String, Array, RegExp, encodeURIComponent, decodeURIComponent, isFinite,
    Date: FixedDate,
    CacheService: { getScriptCache: () => { if (options.throwCacheService) throw new Error("cache unavailable"); return cache; } },
    PropertiesService: { getScriptProperties: () => properties },
    readSheetObjects_: (name) => {
      reads.push(name);
      if (options.failRead === name) throw new Error("source failed: " + name);
      return rows[name] || [];
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "apps-script", "Config.gs"), "utf8"), context, { filename: "apps-script/Config.gs" });
  serviceFiles.forEach((name) => vm.runInContext(fs.readFileSync(path.join(root, "apps-script", name), "utf8"), context, { filename: `apps-script/${name}` }));
  ["RouteService_buildRoutesResponse_", "buildPlacesResponse_", "ProductService_buildProductsResponse_", "EventService_buildEventsResponse_", "GalleryService_buildGalleryResponse_"].forEach((name) => {
    const original = context[name];
    context[name] = function (...args) { builderCalls.push({ name, parameters: clone(args[1] || {}) }); return original.apply(this, args); };
  });
  if (options.failBuilder) context[options.failBuilder] = () => ({ ok: false, error: { code: "TEST_FAILURE", message: "unsafe detail" } });
  ["getRoutes_", "getPlaces_", "getProducts_", "getEvents_", "getGallery_"].forEach((name) => { context[name] = () => { throw new Error(`Home must not call cached endpoint ${name}`); }; });
  vm.runInContext(fs.readFileSync(homeFile, "utf8"), context, { filename: "apps-script/HomeService.gs" });
  assert.equal(typeof context.getHomeData_, "function", "getHomeData_ must be implemented");
  return { context, rows, cache, reads, builderCalls, properties };
}

function assertExactSuccess(response) {
  assert.deepEqual(Object.keys(response), ["ok", "data", "message"]);
  assert.equal(response.ok, true);
  assert.equal(response.message, "success");
  assert.deepEqual(Object.keys(response.data), SECTION_KEYS);
  SECTION_KEYS.forEach((section) => {
    assert.equal(Array.isArray(response.data[section]), true);
    assert.ok(response.data[section].length <= LIMITS[section]);
    response.data[section].forEach((item) => assert.deepEqual(Object.keys(item), ITEM_KEYS[section]));
  });
}

function test(name, fn) {
  try { fn(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

test("returns exact five-section contract projections limits visibility and stable builder order", () => {
  const { context, rows, reads, builderCalls } = load();
  const before = JSON.stringify(rows);
  const response = plain(context.getHomeData_({ lang: "th" }));
  assertExactSuccess(response);
  assert.deepEqual(response.data.featured_routes.map((item) => item.route_id), ["R-1", "R-2"]);
  assert.deepEqual(response.data.featured_places.map((item) => item.place_id), ["P-1", "P-2", "P-3", "P-4"]);
  assert.deepEqual(response.data.featured_products.map((item) => item.product_id), ["PR-1", "PR-2", "PR-3", "PR-4"]);
  assert.deepEqual(response.data.upcoming_events.map((item) => item.event_id), ["E-TODAY", "E-NEXT", "E-LATER"]);
  assert.deepEqual(response.data.gallery_preview.map((item) => item.media_id), ["G-1", "G-2", "G-3", "G-4", "G-5", "G-6"]);
  assert.deepEqual(reads, ["routes", "places", "products", "events", "gallery"]);
  assert.deepEqual(builderCalls.map((call) => call.name), ["RouteService_buildRoutesResponse_", "buildPlacesResponse_", "ProductService_buildProductsResponse_", "EventService_buildEventsResponse_", "GalleryService_buildGalleryResponse_"]);
  assert.equal(builderCalls[0].parameters.featured, true);
  assert.equal(builderCalls[1].parameters.featured, true);
  assert.equal(builderCalls[2].parameters.featured, true);
  assert.equal(builderCalls[3].parameters.status, "upcoming");
  assert.equal(JSON.stringify(rows), before);
  assert.equal(JSON.stringify(response).includes("secret"), false);
  assert.equal(JSON.stringify(response).includes('"items"'), false);
});

test("normalizes language uses English fallback and separates only effective cache keys", () => {
  const omitted = load(); assert.equal(plain(omitted.context.getHomeData_({})).data.featured_places[0].name, "สถานที่ P-1");
  assert.equal(omitted.cache.puts[0].key, "public:getHomeData:place-epoch:1:lang=th");
  const thai = load(); thai.context.getHomeData_({ lang: "th" }); assert.equal(thai.cache.puts[0].key, "public:getHomeData:place-epoch:1:lang=th");
  const unknown = load(); unknown.context.getHomeData_({ lang: "xx" }); assert.equal(unknown.cache.puts[0].key, "public:getHomeData:place-epoch:1:lang=th");
  const english = load(); const response = plain(english.context.getHomeData_({ lang: "en" }));
  assert.equal(english.cache.puts[0].key, "public:getHomeData:place-epoch:1:lang=en");
  assert.equal(response.data.featured_places[0].name, "สถานที่ P-1");
  assert.equal(response.data.featured_places[1].name, "Place P-2");
  english.builderCalls.forEach((call) => assert.equal(call.parameters.lang, "en"));
});

test("deduplicates first valid item independently with prototype-like identifiers", () => {
  const ids = ["__proto__", "constructor", "toString"];
  const rows = { routes: [], places: [], products: [], events: [], gallery: [] };
  ids.forEach((id, index) => {
    rows.routes.push(route(id, index + 1), route(id, index + 1, { name_th: "duplicate" }));
    rows.places.push(place(id, index + 1), place(id, index + 1, { name_th: "duplicate" }));
    rows.products.push(product(id, index + 1), product(id, index + 1, { name_th: "duplicate" }));
    rows.events.push(event(id, `2026-07-${15 + index}`), event(id, `2026-07-${15 + index}`, { title_th: "duplicate" }));
    rows.gallery.push(gallery(id, index + 1), gallery(id, index + 1, { title_th: "duplicate" }));
  });
  const response = plain(load({ rows }).context.getHomeData_({}));
  assert.deepEqual(response.data.featured_routes.map((item) => item.route_id), ids.slice(0, 2));
  assert.deepEqual(response.data.featured_places.map((item) => item.place_id), ids);
  assert.deepEqual(response.data.featured_products.map((item) => item.product_id), ids);
  assert.deepEqual(response.data.upcoming_events.map((item) => item.event_id), ids);
  assert.deepEqual(response.data.gallery_preview.map((item) => item.media_id), ids);
  assert.equal(response.data.featured_places[0].name, "duplicate");
});

test("returns empty arrays for one or all empty sections", () => {
  const oneEmpty = baseRows(); oneEmpty.products = [];
  const response = plain(load({ rows: oneEmpty }).context.getHomeData_({}));
  assertExactSuccess(response); assert.deepEqual(response.data.featured_products, []);
  const allEmpty = plain(load({ rows: { routes: [], places: [], products: [], events: [], gallery: [] } }).context.getHomeData_({}));
  assertExactSuccess(allEmpty); SECTION_KEYS.forEach((key) => assert.deepEqual(allEmpty.data[key], []));
});

test("fails atomically and never caches source or builder failures", () => {
  const readFailure = load({ failRead: "products" });
  const readResponse = plain(readFailure.context.getHomeData_({}));
  assert.deepEqual(readResponse, { ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดของระบบ" } });
  assert.equal("data" in readResponse, false); assert.equal(readFailure.cache.puts.length, 0);
  const builderFailure = load({ failBuilder: "EventService_buildEventsResponse_" });
  const builderResponse = plain(builderFailure.context.getHomeData_({}));
  assert.deepEqual(builderResponse, { ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดของระบบ" } });
  assert.equal(builderFailure.cache.puts.length, 0);
});

test("uses exact validated cache for miss hit and TTL 300", () => {
  const loaded = load(); const first = plain(loaded.context.getHomeData_({}));
  assertExactSuccess(first); assert.equal(loaded.cache.puts.length, 1); assert.equal(loaded.cache.puts[0].ttl, 300);
  assert.equal(loaded.cache.puts[0].key, "public:getHomeData:place-epoch:1:lang=th");
  const reads = loaded.reads.length; const second = plain(loaded.context.getHomeData_({ lang: "invalid" }));
  assert.deepEqual(second, first); assert.equal(loaded.reads.length, reads); assert.equal(loaded.cache.puts.length, 1);
});

test("rejects malformed cached JSON wrong sections extra sections and extra item fields", () => {
  const variants = [
    "not-json",
    JSON.stringify({ ok: true, data: {}, message: "success" }),
    JSON.stringify({ ok: true, data: { featured_routes: [], featured_places: [], featured_products: [], upcoming_events: [], gallery_preview: [], extra: [] }, message: "success" })
  ];
  variants.forEach((cached) => {
    const cache = createCache(); cache.values.set("public:getHomeData:place-epoch:1:lang=th", cached);
    const loaded = load({ cache }); assertExactSuccess(plain(loaded.context.getHomeData_({}))); assert.equal(loaded.reads.length, 5); assert.equal(cache.puts.length, 1);
  });
  const cache = createCache(); const seeded = load({ cache }); const valid = plain(seeded.context.getHomeData_({}));
  valid.data.featured_routes[0].status = "published";
  cache.values.set("public:getHomeData:place-epoch:1:lang=th", JSON.stringify(valid)); cache.puts.length = 0; seeded.reads.length = 0;
  assertExactSuccess(plain(seeded.context.getHomeData_({}))); assert.equal(seeded.reads.length, 5); assert.equal(cache.puts.length, 1);
});

test("continues through CacheService read and write failures", () => {
  const unavailable = load({ throwCacheService: true }); assertExactSuccess(plain(unavailable.context.getHomeData_({}))); assert.equal(unavailable.reads.length, 5);
  const broken = load({ cache: createCache({ throwGet: true, throwPut: true }) }); assertExactSuccess(plain(broken.context.getHomeData_({}))); assert.equal(broken.reads.length, 5);
});

test("Home cache becomes unreachable after the Place epoch changes", () => {
  const properties = createProperties("1");
  const loaded = load({ properties });
  const first = plain(loaded.context.getHomeData_({ lang: "th", epoch: "client" }));
  const reads = loaded.reads.length;
  assert.deepEqual(plain(loaded.context.getHomeData_({ lang: "th" })), first);
  assert.equal(loaded.reads.length, reads);
  properties.values.set("PLACE_PUBLIC_CACHE_EPOCH", "2");
  assert.deepEqual(plain(loaded.context.getHomeData_({ lang: "th" })), first);
  assert.equal(loaded.reads.length, reads * 2);
  assert.equal(loaded.cache.puts.at(-1).key, "public:getHomeData:place-epoch:2:lang=th");
  assert.equal(JSON.stringify(first).includes("epoch"), false);
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("HomeService verification passed.\n");
