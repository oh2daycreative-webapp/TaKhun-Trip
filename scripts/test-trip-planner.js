"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/js/trip-planner.js"), "utf8");
const canonicalSource = fs.readFileSync(path.join(__dirname, "../public/js/content-data.js"), "utf8");

function loadPlanner(overrides = {}) {
  const context = { URLSearchParams, window: null, ...overrides };
  context.window = context;
  vm.runInNewContext(canonicalSource, context, { filename: "content-data.js" });
  vm.runInNewContext(source, context, { filename: "trip-planner.js" });
  return context.TakhunTripPlanner;
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }
function test(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}

const api = loadPlanner();
for (const name of ["parseQuery", "validateRouteId", "validatePlaceId", "sortRoutePlaces", "templatePlaceIds", "createPlan", "normalizePlan", "applyRoute", "addPlace", "removePlace", "clearPlan", "toStorageRecord", "readStoredPlan", "writeStoredPlan", "mapUrl", "placeDetailUrl", "sharePayload", "resolveState"]) {
  assert.equal(typeof api?.[name], "function", `${name} must be public`);
}

test("derives ordered unique template IDs when expanded places are absent", () => {
  assert.deepEqual(plain(api.templatePlaceIds({ places: [], place_ids: ["A", "B", "A", "../bad"] })), ["A", "B"]);
  assert.deepEqual(plain(api.templatePlaceIds({ places: [{ place_id: "C" }, { place_id: "D" }], place_ids: ["A"] })), ["C", "D"]);
});

test("parses both supported queries and reports invalid identifiers", () => {
  assert.deepEqual(plain(api.parseQuery("?from_route=ROUTE-001&add=BTK-001")), { fromRoute: "ROUTE-001", add: "BTK-001", invalidFromRoute: false, invalidAdd: false });
  assert.deepEqual(plain(api.parseQuery("?from_route=bad%20id&add=../bad")), { fromRoute: "", add: "", invalidFromRoute: true, invalidAdd: true });
  assert.equal(api.validateRouteId("MOCK-ROUTE-001"), true);
  assert.equal(api.validatePlaceId("MOCK-PLACE-001"), true);
  assert.equal(api.validateRouteId(""), false);
  assert.equal(api.validatePlaceId("has space"), false);
});

test("sorts route stops numerically, keeps invalid orders stable at the end, and clones", () => {
  const original = [{ place_id: "TEN", stop_order: "10" }, { place_id: "BAD-A", stop_order: "later" }, { place_id: "TWO", stop_order: "2" }, { place_id: "BAD-B" }];
  const sorted = api.sortRoutePlaces(original);
  assert.deepEqual(plain(sorted.map((place) => place.place_id)), ["TWO", "TEN", "BAD-A", "BAD-B"]);
  assert.deepEqual(plain(original.map((place) => place.place_id)), ["TEN", "BAD-A", "TWO", "BAD-B"]);
  assert.notEqual(sorted[0], original[2]);
});

test("applies routes before added places without mutation and prevents duplicates", () => {
  const route = { route_id: "ROUTE-001", places: [{ place_id: "B", stop_order: 2, name_th: "B" }, { place_id: "A", stop_order: 1, name_th: "A" }] };
  const initial = api.createPlan();
  const routed = api.applyRoute(initial, route);
  const duplicate = api.addPlace(routed.plan, { place_id: "A", name_th: "A duplicate" });
  const added = api.addPlace(duplicate.plan, { place_id: "C", name_th: "C" });
  assert.deepEqual(plain(added.plan.places.map((place) => place.place_id)), ["A", "B", "C"]);
  assert.equal(duplicate.added, false);
  assert.equal(added.added, true);
  assert.deepEqual(plain(route.places.map((place) => place.place_id)), ["B", "A"]);
  assert.deepEqual(plain(initial.places), []);
});

test("removes a place and clears plan content immutably", () => {
  const plan = api.normalizePlan({ duration_type: "one_day", travel_style: ["nature"], route_id: "ROUTE-001", places: [{ place_id: "A" }, { place_id: "B" }] });
  assert.deepEqual(plain(api.removePlace(plan, "A").places.map((place) => place.place_id)), ["B"]);
  assert.deepEqual(plain(api.clearPlan(plan)), plain(api.createPlan()));
  assert.deepEqual(plain(plan.places.map((place) => place.place_id)), ["A", "B"]);
});

test("normalizes enums, identifiers, duplicates, and storage shape", () => {
  const plan = api.normalizePlan({ duration_type: "future", travel_style: ["nature", "nature", "bad"], route_id: "bad route", places: [{ place_id: "A", name_th: "A", secret: "drop" }, { place_id: "A" }, { place_id: "../bad" }] });
  assert.equal(plan.duration_type, "");
  assert.deepEqual(plain(plan.travel_style), ["nature"]);
  assert.equal(plan.route_id, "");
  assert.deepEqual(plain(plan.places), [{ place_id: "A", name_th: "A" }]);
  const record = api.toStorageRecord(plan, "2026-07-13T00:00:00.000Z");
  assert.equal(record.version, 2);
  assert.deepEqual(plain(record.place_ids), ["A"]);
  assert.equal(record.updated_at, "2026-07-13T00:00:00.000Z");
});

test("migrates version 1 storage and removes stale or mock relations", () => {
  const storage = { getItem() { return JSON.stringify({ version: 1, route_id: "MOCK-ROUTE-001", places: [{ place_id: "MOCK-PLACE-001" }, { place_id: "BTK-004" }, { place_id: "STALE" }] }); } };
  const result = api.readStoredPlan(storage);
  assert.equal(result.migrated, true);
  assert.equal(result.plan.route_id, "");
  assert.deepEqual(plain(result.plan.places.map((place) => place.place_id)), ["BTK-004"]);
});

test("survives malformed or blocked storage and persists the existing key", () => {
  const result = api.readStoredPlan({ getItem: () => "{bad" });
  assert.equal(result.malformed, true);
  assert.deepEqual(plain(result.plan), plain(api.createPlan()));
  let savedKey = "";
  const storage = { setItem(key, value) { savedKey = key; JSON.parse(value); } };
  assert.equal(api.writeStoredPlan(storage, api.createPlan()), true);
  assert.equal(savedKey, "TAKHUN_TRIP_PLAN");
  assert.equal(api.writeStoredPlan({ setItem() { throw new Error("blocked"); } }, api.createPlan()), false);
});

test("builds encoded URLs and a compact share payload", () => {
  assert.equal(api.mapUrl({ route_id: "ROUTE A/B", places: [] }), "map.html?route=ROUTE%20A%2FB");
  assert.equal(api.mapUrl({ places: [{ place_id: "PLACE A/B" }] }), "map.html?focus=PLACE%20A%2FB");
  assert.equal(api.mapUrl({ places: [] }), "map.html");
  assert.equal(api.placeDetailUrl("PLACE A/B"), "place-detail.html?id=PLACE%20A%2FB");
  const payload = api.sharePayload({ places: [{ place_id: "A" }, { place_id: "B" }] }, "https://example.test/trip-planner.html?add=A", "My Trip", "2 stops");
  assert.deepEqual(plain(payload), { title: "My Trip", text: "2 stops", url: "https://example.test/trip-planner.html?add=A" });
  assert.equal(payload.url.includes("place_ids"), false);
});

test("normalizes primary UI states", () => {
  assert.equal(api.resolveState({ loading: true }), "loading");
  assert.equal(api.resolveState({ error: new Error("no") }), "error");
  assert.equal(api.resolveState({ places: [] }), "empty");
  assert.equal(api.resolveState({ places: [{}] }), "ready");
});
