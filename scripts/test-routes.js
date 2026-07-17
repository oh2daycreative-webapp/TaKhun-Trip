"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/js/routes.js"), "utf8");
const canonicalSource = fs.readFileSync(path.join(__dirname, "../public/js/content-data.js"), "utf8");
const i18nSource = fs.readFileSync(path.join(__dirname, "../public/js/i18n.js"), "utf8");

function loadRoutes() {
  const context = { URLSearchParams, window: null };
  context.window = context;
  vm.runInNewContext(canonicalSource, context, { filename: "content-data.js" });
  vm.runInNewContext(source, context, { filename: "routes.js" });
  return context.TakhunRoutes;
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }

const api = loadRoutes();

function loadI18n() {
  const context = { window: null };
  context.window = context;
  vm.runInNewContext(i18nSource, context, { filename: "i18n.js" });
  return context.TakhunI18n;
}

for (const name of ["parseRouteId", "validateRouteId", "promoteFeaturedRoutes", "sortRouteStops", "detailUrl", "mapUrl", "tripPlannerUrl", "placeDetailUrl", "resolveListState", "resolveDetailState", "mockGetRoutes", "mockGetRouteDetail", "setPageState"]) {
  assert.equal(typeof api?.[name], "function", `${name} must be public`);
}

assert.equal(api.parseRouteId("?id=%20ROUTE-001%20"), "ROUTE-001");
assert.equal(api.parseRouteId(""), "");
assert.equal(api.validateRouteId("ROUTE-001"), true);
assert.equal(api.validateRouteId(""), false);
assert.equal(api.validateRouteId("../bad"), false);
assert.equal(api.validateRouteId("has space"), false);

{
  const original = [
    { route_id: "A", is_featured: false },
    { route_id: "B", is_featured: true },
    { route_id: "C", is_featured: false },
    { route_id: "D", is_featured: true }
  ];
  const result = api.promoteFeaturedRoutes(original);
  assert.deepEqual(plain(result.map((route) => route.route_id)), ["B", "D", "A", "C"]);
  assert.deepEqual(plain(original.map((route) => route.route_id)), ["A", "B", "C", "D"]);
}

{
  const original = [
    { place_id: "TEN", stop_order: "10" },
    { place_id: "MISSING" },
    { place_id: "TWO", stop_order: "2" },
    { place_id: "BAD", stop_order: "later" },
    { place_id: "EMPTY", stop_order: "" },
    { place_id: "ALSO-TWO", stop_order: 2 }
  ];
  const result = api.sortRouteStops(original);
  assert.deepEqual(plain(result.map((stop) => stop.place_id)), ["TWO", "ALSO-TWO", "TEN", "MISSING", "BAD", "EMPTY"]);
  assert.deepEqual(plain(original.map((stop) => stop.place_id)), ["TEN", "MISSING", "TWO", "BAD", "EMPTY", "ALSO-TWO"]);
}

assert.equal(api.detailUrl("ROUTE A/B"), "route-detail.html?id=ROUTE%20A%2FB");
assert.equal(api.mapUrl("ROUTE A/B"), "map.html?route=ROUTE%20A%2FB");
assert.equal(api.tripPlannerUrl("ROUTE A/B"), "trip-planner.html?from_route=ROUTE%20A%2FB");
assert.equal(api.placeDetailUrl("PLACE A/B"), "place-detail.html?id=PLACE%20A%2FB");

{
  assert.equal(api.resolveListState({ loading: true }), "loading");
  assert.equal(api.resolveListState({ items: [] }), "empty");
  assert.equal(api.resolveListState({ items: [{}] }), "ready");
  assert.equal(api.resolveListState({ error: new Error("failed") }), "error");
  assert.equal(api.resolveDetailState({ loading: true, id: "ROUTE-001" }), "loading");
  assert.equal(api.resolveDetailState({ id: "" }), "invalid-id");
  assert.equal(api.resolveDetailState({ id: "../bad" }), "invalid-id");
  assert.equal(api.resolveDetailState({ id: "ROUTE-404", error: { code: "NOT_FOUND" } }), "not-found");
  assert.equal(api.resolveDetailState({ id: "ROUTE-001", error: new Error("failed") }), "error");
  assert.equal(api.resolveDetailState({ id: "ROUTE-001", route: null }), "not-found");
  assert.equal(api.resolveDetailState({ id: "ROUTE-001", route: { route_id: "ROUTE-001" } }), "ready");

  const mounts = Object.fromEntries(["loading", "ready", "empty", "error", "not-found", "invalid-id"].map((state) => [state, { hidden: false }]));
  for (const state of Object.keys(mounts)) {
    assert.equal(api.setPageState(mounts, state), state);
    for (const [key, mount] of Object.entries(mounts)) assert.equal(mount.hidden, key !== state);
  }
  assert.throws(() => api.setPageState(mounts, "unknown"), /Unknown route page state/);
}

{
  const list = api.mockGetRoutes();
  assert.ok(list.items.some((route) => route.is_featured === true));
  assert.equal(list.items.length, 4);
  const detail = api.mockGetRouteDetail("ROUTE-BTK-CORE");
  assert.deepEqual(plain(api.sortRouteStops(detail.places).map((stop) => stop.stop_order)), [1, 2, 3, 4]);
  assert.equal(api.mockGetRouteDetail("MOCK-ROUTE-404"), null);
}

process.stdout.write("Routes behavior verification passed.\n");

{
  const i18n = loadI18n();
  const keys = [
    "routes_page.heading", "routes_page.intro", "routes_page.loading", "routes_page.empty_title", "routes_page.error_title", "routes_page.view_route", "routes_page.open_map",
    "route_detail.loading", "route_detail.invalid_title", "route_detail.not_found_title", "route_detail.error_title", "route_detail.timeline_title", "route_detail.no_stops", "route_detail.view_place", "route_detail.open_map", "route_detail.add_to_trip"
  ];
  for (const lang of ["th", "en"]) {
    i18n.setCurrentLang(lang);
    for (const key of keys) assert.notEqual(i18n.t(key), key, `${key} missing in ${lang}`);
  }
}
