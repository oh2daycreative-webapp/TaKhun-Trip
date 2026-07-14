"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const routeServicePath = path.join(root, "apps-script/RouteService.gs");

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeData() {
  return {
    routes: [
      { route_id: "R-10", name_th: "สิบ", name_en: "Ten", short_description_th: "สิบไทย", short_description_en: "Ten short", description_th: "รายละเอียดยาวสิบ", description_en: "Ten detail", duration: "1 วัน", travel_style: "nature| photo |nature||", cover_image_url: "r10.jpg", is_featured: "TRUE", sort_order: "10", status: "published", note: "private" },
      { route_id: "R-2A", name_th: "สอง ก", name_en: "", short_description_th: "สองไทย", short_description_en: "", description_th: "รายละเอียดสอง", description_en: "", duration: "ครึ่งวัน", travel_style: "community|nature", cover_image_url: "r2a.jpg", is_featured: true, sort_order: "2", status: "published", admin_notes: "private" },
      { route_id: "R-2B", name_th: "สอง ข", name_en: "Two B", short_description_th: "สองข", short_description_en: "", description_th: "รายละเอียดสองข", description_en: "", duration: "ครึ่งวัน", travel_style: "photo", cover_image_url: "", is_featured: false, sort_order: 2, status: "published" },
      { route_id: "R-BAD", name_th: "ท้าย", travel_style: "nature", is_featured: "false", sort_order: "later", status: "published" },
      { route_id: "R-DRAFT", name_th: "ร่าง", travel_style: "nature", is_featured: true, sort_order: 0, status: "draft" },
      { route_id: "R-HIDDEN", name_th: "ซ่อน", status: "hidden" },
      { route_id: "R-DELETED", name_th: "ลบ", status: "deleted" }
    ],
    route_places: [
      { route_place_id: "RP-10", route_id: "R-2A", place_id: "P-10", stop_order: "10", status: "published", note_th: "private" },
      { route_place_id: "RP-2A", route_id: "R-2A", place_id: "P-2", stop_order: "2", status: "published" },
      { route_place_id: "RP-BAD-A", route_id: "R-2A", place_id: "P-3", stop_order: "later", status: "published" },
      { route_place_id: "RP-BAD-B", route_id: "R-2A", place_id: "P-4", stop_order: "", status: "published" },
      { route_place_id: "RP-UNPUB", route_id: "R-2A", place_id: "P-5", stop_order: 1, status: "draft" },
      { route_place_id: "RP-MISSING", route_id: "R-2A", place_id: "P-MISSING", stop_order: 3, status: "published" },
      { route_place_id: "RP-OTHER", route_id: "R-10", place_id: "P-10", stop_order: 1, status: "published" }
    ],
    places: [
      { place_id: "P-10", name_th: "สิบ", name_en: "Ten Place", short_description_th: "จุดสิบ", short_description_en: "", phone: "1010", google_maps_url: "https://maps.example/p10", latitude: "8.10", longitude: "98.10", cover_image_url: "p10.jpg", status: "published", password_hash: "secret" },
      { place_id: "P-2", name_th: "สอง", name_en: "", short_description_th: "จุดสอง", short_description_en: "", phone: "202", google_maps_url: "", latitude: "", longitude: "", cover_image_url: "p2.jpg", status: "published" },
      { place_id: "P-3", name_th: "สาม", name_en: "Three", short_description_th: "จุดสาม", short_description_en: "Three short", phone: "", google_maps_url: "", latitude: "8.3", longitude: "98.3", cover_image_url: "", status: "published" },
      { place_id: "P-4", name_th: "สี่", name_en: "", short_description_th: "จุดสี่", short_description_en: "", status: "hidden" },
      { place_id: "P-5", name_th: "ห้า", status: "published" }
    ],
    trip_templates: [
      { template_id: "T-2", name_th: "หนึ่งวัน", name_en: "One Day", duration_type: "one_day", travel_style: "nature| photo |nature||", place_ids: " P-2 |P-MISSING|P-10|P-2||P-4|P-3 ", description_th: "เที่ยวหนึ่งวัน", description_en: "", cover_image_url: "t2.jpg", sort_order: "2", status: "published", note: "private" },
      { template_id: "T-2B", name_th: "ครึ่งวัน", name_en: "", duration_type: "half_day", travel_style: "community|nature", place_ids: "", description_th: "ครึ่งวันไทย", description_en: "", cover_image_url: "", sort_order: 2, status: "published" },
      { template_id: "T-10", name_th: "สองวัน", name_en: "Two Days", duration_type: "two_days_one_night", travel_style: "family", place_ids: "P-10", description_th: "สองวันไทย", description_en: "Two days detail", cover_image_url: "", sort_order: "10", status: "published" },
      { template_id: "T-BAD", name_th: "ท้าย", duration_type: "one_day", travel_style: "nature", place_ids: "P-3", sort_order: "bad", status: "published" },
      { template_id: "T-DRAFT", name_th: "ร่าง", duration_type: "one_day", travel_style: "nature", place_ids: "P-2", sort_order: 1, status: "draft" },
      { template_id: "T-HIDDEN", name_th: "ซ่อน", status: "hidden" },
      { template_id: "T-DELETED", name_th: "ลบ", status: "deleted" }
    ]
  };
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

function loadBackend(options = {}) {
  const data = options.data || makeData();
  const cache = options.cache || createCache();
  const reads = [];
  const context = {
    JSON, Object, Math, Number, String, Array, Date, RegExp, encodeURIComponent, isFinite,
    CacheService: { getScriptCache: () => cache },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(text) { return { text, mime: "", setMimeType(mime) { this.mime = mime; return this; } }; }
    },
    readSheetObjects_: options.readSheetObjects || ((name) => {
      reads.push(name);
      if (!Object.prototype.hasOwnProperty.call(data, name)) throw new Error("missing sheet: " + name);
      return data[name];
    })
  };
  vm.createContext(context);
  vm.runInContext(read("apps-script/ApiResponse.gs"), context, { filename: "apps-script/ApiResponse.gs" });
  const routeSource = fs.existsSync(routeServicePath) ? fs.readFileSync(routeServicePath, "utf8") : "";
  vm.runInContext(routeSource, context, { filename: "apps-script/RouteService.gs" });
  vm.runInContext(read("apps-script/Router.gs"), context, { filename: "apps-script/Router.gs" });
  return { context, data, cache, reads };
}

function requireFunction(context, name) {
  assert.equal(typeof context[name], "function", `${name} must be implemented by RouteService.gs`);
  return context[name];
}

function payload(output) {
  assert.equal(output.mime, "application/json");
  return JSON.parse(output.text);
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

test("getRoutes exposes published rows only, immutable public fields and numeric stable ordering", () => {
  const { context, data } = loadBackend();
  const build = requireFunction(context, "RouteService_buildRoutesResponse_");
  const before = JSON.stringify(data.routes);
  const result = plain(build(data.routes, {}));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.items.map((item) => item.route_id), ["R-2A", "R-2B", "R-10", "R-BAD"]);
  assert.equal(result.data.total, 4);
  assert.deepEqual(Object.keys(result.data.items[0]), ["route_id", "name", "short_description", "duration", "travel_style", "cover_image_url", "is_featured"]);
  assert.equal("status" in result.data.items[0] || "note" in result.data.items[0] || "admin_notes" in result.data.items[0], false);
  assert.equal(JSON.stringify(data.routes), before);
});

test("getRoutes supports only featured style and language behavior", () => {
  const { context, data } = loadBackend();
  const build = requireFunction(context, "RouteService_buildRoutesResponse_");
  assert.deepEqual(plain(build(data.routes, { featured: "true" })).data.items.map((x) => x.route_id), ["R-2A", "R-10"]);
  assert.deepEqual(plain(build(data.routes, { featured: "false" })).data.items.map((x) => x.route_id), ["R-2B", "R-BAD"]);
  assert.deepEqual(plain(build(data.routes, { style: " nature " })).data.items.map((x) => x.route_id), ["R-2A", "R-10", "R-BAD"]);
  assert.deepEqual(plain(build(data.routes, { featured: 1, style: "nature" })).data.items.map((x) => x.route_id), ["R-2A", "R-10"]);
  assert.equal(plain(build(data.routes, { featured: "yes" })).error.code, "VALIDATION_ERROR");
  const english = plain(build(data.routes, { style: "community", lang: "en", page: 99 })).data.items[0];
  assert.equal(english.name, "สอง ก");
  assert.equal(english.short_description, "สองไทย");
  assert.deepEqual(english.travel_style, ["community", "nature"]);
});

test("getRouteDetail validates IDs and hides missing or unpublished routes as not found", () => {
  const { context, data } = loadBackend();
  const build = requireFunction(context, "RouteService_buildRouteDetailResponse_");
  for (const routeId of [undefined, "", "   ", "../R-2A", "<script>"]) {
    assert.equal(plain(build(data.routes, data.route_places, data.places, { route_id: routeId })).error.code, "VALIDATION_ERROR");
  }
  for (const routeId of ["MISSING", "R-DRAFT", "R-HIDDEN", "R-DELETED"]) {
    assert.equal(plain(build(data.routes, data.route_places, data.places, { route_id: routeId })).error.code, "NOT_FOUND");
  }
});

test("getRouteDetail joins published relations and places in numeric stable stop order", () => {
  const { context, data } = loadBackend();
  const build = requireFunction(context, "RouteService_buildRouteDetailResponse_");
  const before = JSON.stringify(data);
  const detail = plain(build(data.routes, data.route_places, data.places, { route_id: " R-2A ", lang: "en" })).data;
  assert.equal(detail.route_id, "R-2A");
  assert.equal(detail.name, "สอง ก");
  assert.equal(detail.description, "รายละเอียดสอง");
  assert.deepEqual(detail.travel_style, ["community", "nature"]);
  assert.deepEqual(detail.places.map((place) => place.place_id), ["P-2", "P-10", "P-3"]);
  assert.deepEqual(detail.places.map((place) => place.stop_order), [2, 10, ""]);
  assert.equal(detail.places[0].name, "สอง");
  assert.equal(detail.places[0].short_description, "จุดสอง");
  assert.deepEqual(Object.keys(detail.places[0]), ["place_id", "stop_order", "name", "short_description", "phone", "google_maps_url", "latitude", "longitude", "cover_image_url"]);
  assert.equal("status" in detail.places[0] || "password_hash" in detail.places[0], false);
  assert.equal(JSON.stringify(data), before);
});

test("getRouteDetail keeps equal and malformed stop orders stable", () => {
  const { context, data } = loadBackend();
  const build = requireFunction(context, "RouteService_buildRouteDetailResponse_");
  const relations = data.route_places.map((row) => ({ ...row }));
  relations[0].stop_order = "2";
  relations[1].stop_order = 2;
  data.places[3].status = "published";
  const places = plain(build(data.routes, relations, data.places, { route_id: "R-2A" })).data.places;
  assert.deepEqual(places.map((place) => place.place_id), ["P-10", "P-2", "P-3", "P-4"]);
});

test("getTripTemplates filters published rows and returns schema-shaped joined places", () => {
  const { context, data } = loadBackend();
  const build = requireFunction(context, "RouteService_buildTripTemplatesResponse_");
  const before = JSON.stringify(data);
  const result = plain(build(data.trip_templates, data.places, {}));
  assert.deepEqual(result.data.items.map((item) => item.template_id), ["T-2", "T-2B", "T-10", "T-BAD"]);
  assert.equal(result.data.total, 4);
  const template = result.data.items[0];
  assert.deepEqual(Object.keys(template), ["template_id", "name", "duration_type", "travel_style", "place_ids", "places", "description", "cover_image_url"]);
  assert.deepEqual(template.travel_style, ["nature", "photo"]);
  assert.deepEqual(template.place_ids, ["P-2", "P-10", "P-3"]);
  assert.deepEqual(template.places.map((place) => place.place_id), ["P-2", "P-10", "P-3"]);
  assert.deepEqual(Object.keys(template.places[0]), ["place_id", "name_th", "name_en", "short_description_th", "short_description_en", "cover_image_url"]);
  assert.equal("status" in template || "note" in template || "password_hash" in template.places[0], false);
  assert.equal(JSON.stringify(data), before);
});

test("getTripTemplates supports duration style combined filters and English fallback", () => {
  const { context, data } = loadBackend();
  const build = requireFunction(context, "RouteService_buildTripTemplatesResponse_");
  assert.deepEqual(plain(build(data.trip_templates, data.places, { duration_type: "one_day" })).data.items.map((x) => x.template_id), ["T-2", "T-BAD"]);
  assert.deepEqual(plain(build(data.trip_templates, data.places, { style: "nature" })).data.items.map((x) => x.template_id), ["T-2", "T-2B", "T-BAD"]);
  assert.deepEqual(plain(build(data.trip_templates, data.places, { duration_type: "half_day", style: "community" })).data.items.map((x) => x.template_id), ["T-2B"]);
  const fallback = plain(build(data.trip_templates, data.places, { duration_type: "half_day", lang: "en", ignored: "x" })).data.items[0];
  assert.equal(fallback.name, "ครึ่งวัน");
  assert.equal(fallback.description, "ครึ่งวันไทย");
  assert.deepEqual(fallback.place_ids, []);
  assert.deepEqual(fallback.places, []);
});

test("route and template joins safely support identifiers that match object prototype keys", () => {
  const { context, data } = loadBackend();
  const buildDetail = requireFunction(context, "RouteService_buildRouteDetailResponse_");
  const buildTemplates = requireFunction(context, "RouteService_buildTripTemplatesResponse_");
  data.places.push({ place_id: "toString", name_th: "ชื่อพิเศษ", short_description_th: "จุดพิเศษ", status: "published" });
  data.route_places.push({ route_place_id: "RP-SPECIAL", route_id: "R-10", place_id: "toString", stop_order: 1, status: "published" });
  data.trip_templates.push({ template_id: "T-SPECIAL", name_th: "ทริปพิเศษ", duration_type: "one_day", travel_style: "nature", place_ids: "toString", sort_order: 20, status: "published" });
  const detail = plain(buildDetail(data.routes, data.route_places, data.places, { route_id: "R-10" }));
  assert.deepEqual(detail.data.places.map((place) => place.place_id), ["P-10", "toString"]);
  const template = plain(buildTemplates(data.trip_templates, data.places, { duration_type: "one_day" })).data.items.find((item) => item.template_id === "T-SPECIAL");
  assert.deepEqual(template.place_ids, ["toString"]);
  assert.equal(template.places[0].name_th, "ชื่อพิเศษ");
});

test("route cache normalizes effective parameters, separates actions and uses required TTLs", () => {
  const cache = createCache();
  const { context, reads } = loadBackend({ cache });
  requireFunction(context, "getRoutes_");
  context.getRoutes_({ featured: " TRUE ", style: " nature ", lang: "EN", page: "99" });
  context.getRoutes_({ style: "nature", lang: "en", featured: true });
  assert.deepEqual(reads, ["routes"]);
  assert.equal(cache.puts[0].ttl, 600);
  assert.match(cache.puts[0].key, /getRoutes/);
  context.getRouteDetail_({ route_id: " R-2A ", lang: "en" });
  context.getRouteDetail_({ route_id: "R-2A", lang: "EN" });
  assert.deepEqual(reads.slice(1), ["routes", "route_places", "places"]);
  assert.equal(cache.puts[1].ttl, 600);
  assert.notEqual(cache.puts[0].key, cache.puts[1].key);
  context.getTripTemplates_({ duration_type: " one_day ", style: " nature ", lang: "EN" });
  context.getTripTemplates_({ style: "nature", lang: "en", duration_type: "one_day" });
  assert.deepEqual(reads.slice(4), ["trip_templates", "places"]);
  assert.equal(cache.puts[2].ttl, 300);
  assert.notEqual(cache.puts[1].key, cache.puts[2].key);
});

test("cache keys separate filters IDs and languages", () => {
  const cache = createCache();
  const { context } = loadBackend({ cache });
  requireFunction(context, "getRoutes_");
  context.getRoutes_({ style: "nature", lang: "th" });
  context.getRoutes_({ style: "photo", lang: "th" });
  context.getRoutes_({ style: "nature", lang: "en" });
  context.getRouteDetail_({ route_id: "R-2A", lang: "th" });
  context.getRouteDetail_({ route_id: "R-10", lang: "th" });
  assert.equal(new Set(cache.puts.map((entry) => entry.key)).size, 5);
});

test("malformed cache reloads while validation and not-found responses are never cached", () => {
  const cache = createCache();
  const { context, reads } = loadBackend({ cache });
  requireFunction(context, "getRoutes_");
  context.getRoutes_({ style: "nature" });
  const key = cache.puts[0].key;
  cache.values.set(key, "not-json");
  context.getRoutes_({ style: "nature" });
  assert.equal(reads.filter((name) => name === "routes").length, 2);
  const putsBeforeErrors = cache.puts.length;
  assert.equal(plain(context.getRoutes_({ featured: "invalid" })).error.code, "VALIDATION_ERROR");
  assert.equal(plain(context.getRouteDetail_({ route_id: "MISSING" })).error.code, "NOT_FOUND");
  assert.equal(plain(context.getRouteDetail_({ route_id: "../bad" })).error.code, "VALIDATION_ERROR");
  assert.equal(cache.puts.length, putsBeforeErrors);
});

test("missing sheets surface only safe JSON server errors through Router", () => {
  const { context } = loadBackend({ readSheetObjects: () => { throw new Error("routes sheet / spreadsheet id / stack secret"); } });
  requireFunction(context, "getRoutes_");
  for (const action of ["getRoutes", "getRouteDetail", "getTripTemplates"]) {
    const parameters = action === "getRouteDetail" ? { action, route_id: "R-2A" } : { action };
    assert.deepEqual(payload(context.routeRequest_("GET", { parameter: parameters })), { ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดของระบบ" } });
  }
});

test("Router dispatches route and trip actions while preserving place and unknown actions", () => {
  const { context } = loadBackend();
  requireFunction(context, "getRoutes_");
  for (const action of ["getRoutes", "getRouteDetail", "getTripTemplates"]) {
    const parameters = action === "getRouteDetail" ? { action, route_id: "R-2A" } : { action };
    assert.equal(payload(context.routeRequest_("GET", { parameter: parameters })).ok, true);
  }
  assert.equal(payload(context.routeRequest_("GET", { parameter: { action: "missing" } })).error.code, "UNKNOWN_ACTION");
  const router = read("apps-script/Router.gs");
  for (const action of ["getPlaces", "getPlaceDetail", "getMapPlaces"]) assert.match(router, new RegExp(`case \\"${action}\\"`));
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("RouteService and public route/trip API verification passed.\n");
