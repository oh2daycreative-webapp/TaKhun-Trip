"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = () => fs.readFileSync(path.join(root, "public/js/map.js"), "utf8");

function loadMap(options = {}) {
  const values = new Map(options.storageSeed === undefined ? [] : [["TAKHUN_FAVORITES", options.storageSeed]]);
  const context = {
    console, URL, URLSearchParams, setTimeout, clearTimeout,
    document: options.document || { readyState: "loading", addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } },
    location: { search: options.search || "", pathname: "/map.html", href: `https://example.test/map.html${options.search || ""}` },
    history: { replaceState() {}, pushState() {} },
    navigator: options.navigator || {},
    localStorage: {
      getItem(key) { if (options.storageThrows) throw new Error("blocked"); return values.get(key) ?? null; },
      setItem(key, value) { if (options.storageThrows) throw new Error("blocked"); values.set(key, String(value)); }
    },
    TakhunI18n: {
      getCurrentLang() { return options.lang || "th"; },
      pickLangValue(item, field, lang = options.lang || "th") { return item?.[`${field}_${lang}`] || item?.[`${field}_th`] || ""; },
      t(key) { return key; }
    },
    TakhunPlaceData: options.data || { listPlaces() { return []; }, getPlaceById() { return null; } },
    L: options.leaflet,
    window: null
  };
  context.window = context;
  vm.runInNewContext(source(), context, { filename: "map.js" });
  return { api: context.TakhunMap, context, values };
}

const records = [
  { place_id: "A", status: "published", category: "nature", district: "ban_ta_khun", latitude: 0, longitude: 0, coordinate_status: "approximate", name_th: "ป่า", name_en: "", short_description_th: "ธรรมชาติ", google_maps_url: "", phone: "" },
  { place_id: "B", status: "published", category: "viewpoint", district: "phanom", latitude: "8.5", longitude: "98.5", coordinate_status: "verified", name_th: "วิว", name_en: "View", short_description_th: "ภูเขา", google_maps_url: "https://maps.example/B", phone: "077 123 456" },
  { place_id: "C", status: "published", category: "nature", district: "phanom", latitude: null, longitude: null, coordinate_status: "no_coordinate", name_th: "ไม่มีพิกัด" },
  { place_id: "D", status: "draft", category: "nature", district: "ban_ta_khun", latitude: 8, longitude: 98, coordinate_status: "verified", name_th: "ร่าง" },
  { place_id: "E", status: "published", category: "nature", district: "ban_ta_khun", latitude: 91, longitude: 98, coordinate_status: "verified", name_th: "ผิดช่วง" }
];

const pending = [];
function test(name, callback) {
  pending.push(Promise.resolve().then(callback).then(
    () => process.stdout.write(`PASS ${name}\n`),
    (error) => { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode = 1; }
  ));
}

test("normalizes coordinates and accepts inclusive WGS84 boundaries", () => {
  const { api } = loadMap();
  assert.equal(api.normalizeCoordinate(null), null);
  assert.equal(api.normalizeCoordinate(undefined), null);
  assert.equal(api.normalizeCoordinate(""), null);
  assert.equal(api.normalizeCoordinate("  "), null);
  assert.equal(api.normalizeCoordinate("8.5"), 8.5);
  assert.equal(api.normalizeCoordinate("bad"), null);
  assert.equal(api.normalizeCoordinate(Infinity), null);
  assert.equal(api.isValidCoordinatePair(-90, -180), true);
  assert.equal(api.isValidCoordinatePair(90, 180), true);
  assert.equal(api.isValidCoordinatePair(90.1, 0), false);
  assert.equal(api.isValidCoordinatePair(0, 180.1), false);
  assert.equal(api.isValidCoordinatePair(null, 0), false);
});

test("selects only published markers with valid coordinate pairs", () => {
  const { api } = loadMap();
  assert.deepEqual(Array.from(api.getPublishedPlaces(records).map((item) => item.place_id)), ["A", "B", "C", "E"]);
  assert.deepEqual(Array.from(api.getMarkerPlaces(records).map((item) => item.place_id)), ["A", "B"]);
});

test("combines category district and localized keyword filters", () => {
  const { api } = loadMap({ lang: "en" });
  assert.deepEqual(Array.from(api.filterPlaces(records, { category: "nature", district: "ban_ta_khun", keyword: "ป่า" }, "en").map((item) => item.place_id)), ["A"]);
  assert.deepEqual(Array.from(api.filterPlaces(records, { category: "viewpoint", district: "phanom", keyword: "view" }, "en").map((item) => item.place_id)), ["B"]);
});

test("parses supported queries and safely flags route overlay", () => {
  const { api } = loadMap();
  assert.deepEqual(JSON.parse(JSON.stringify(api.parseQuery("?focus=%20A%20&category=nature&district=phanom&keyword=lake&route=ROUTE-001"))), { focus: "A", category: "nature", district: "phanom", keyword: "lake", route: "ROUTE-001" });
  assert.equal(api.validateIdentifier("MOCK-PLACE_001"), true);
  assert.equal(api.validateIdentifier("../bad"), false);
  assert.equal(api.validateIdentifier("has space"), false);
});

test("resolves focus without falling back to another record", () => {
  const data = { listPlaces() { return records; }, getPlaceById(id) { return records.find((item) => item.place_id === id) || null; } };
  const { api } = loadMap({ data });
  assert.equal(api.resolveFocus("A").state, "ready");
  assert.equal(api.resolveFocus("C").state, "no-coordinate");
  assert.equal(api.resolveFocus("D").state, "not-found");
  assert.equal(api.resolveFocus("UNKNOWN").state, "not-found");
  assert.equal(api.resolveFocus("../bad").state, "not-found");
});

test("focus with coordinates reconciles conflicting filters instead of failing silently", () => {
  const { api } = loadMap();
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.reconcileFocusFilters(records[1], { category: "nature", district: "ban_ta_khun", keyword: "forest" }))),
    { category: "", district: "", keyword: "" }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.reconcileFocusFilters(records[1], { category: "viewpoint", district: "phanom", keyword: "view" }))),
    { category: "viewpoint", district: "phanom", keyword: "view" }
  );
});

test("builds safe conditional action models", () => {
  const { api } = loadMap();
  const direct = api.getActionModel(records[1]);
  assert.equal(direct.detailUrl, "place-detail.html?id=B");
  assert.equal(direct.navigationUrl, "https://maps.example/B");
  assert.equal(direct.phoneUrl, "tel:077123456");
  const coordinates = api.getActionModel(records[0]);
  assert.match(coordinates.navigationUrl, /destination=0%2C0$/);
  assert.equal(coordinates.phoneUrl, "");
  assert.equal(api.validHttpsUrl("javascript:alert(1)"), "");
});

test("favorites normalize and survive corrupted or blocked storage", () => {
  assert.deepEqual(Array.from(loadMap({ storageSeed: '["A",1,"A","B"]' }).api.readFavorites()), ["A", "B"]);
  assert.deepEqual(Array.from(loadMap({ storageSeed: "bad" }).api.readFavorites()), []);
  assert.deepEqual(Array.from(loadMap({ storageThrows: true }).api.toggleFavorite("A")), ["A"]);
  const env = loadMap({ storageSeed: "[]" });
  assert.deepEqual(Array.from(env.api.toggleFavorite("A")), ["A"]);
  assert.equal(env.values.get("TAKHUN_FAVORITES"), '["A"]');
});

test("primary states are exclusive and invalid transitions fail closed", () => {
  const { api } = loadMap();
  const mounts = { loading: { hidden: false }, ready: { hidden: false }, empty: { hidden: false }, error: { hidden: false }, "leaflet-unavailable": { hidden: false } };
  for (const state of Object.keys(mounts)) {
    assert.equal(api.setPrimaryState(mounts, state), state);
    assert.deepEqual(Object.entries(mounts).filter(([, node]) => !node.hidden).map(([name]) => name), [state]);
  }
  assert.throws(() => api.setPrimaryState(mounts, "unknown"), /Unknown map state/);
  assert.ok(Object.values(mounts).every((node) => node.hidden));
});

test("Leaflet availability and tile errors do not alter fallback data", () => {
  const unavailable = loadMap();
  assert.equal(unavailable.api.hasLeaflet(), false);
  const available = loadMap({ leaflet: { map() {} } });
  assert.equal(available.api.hasLeaflet(), true);
  const list = unavailable.api.getPublishedPlaces(records);
  unavailable.api.noteTileError();
  assert.equal(list.length, 4);
});

test("language rendering helpers preserve query state", () => {
  const { api } = loadMap();
  const state = { category: "nature", district: "phanom", keyword: "lake", selectedPlaceId: "B" };
  assert.deepEqual(JSON.parse(JSON.stringify(api.preserveInteractiveState(state))), state);
});

test("Haversine distance is zero at the same point, symmetric, bounded and validates coordinates", () => {
  const { api } = loadMap();
  assert.equal(api.haversineDistanceKm(8.5, 98.5, 8.5, 98.5), 0);
  const forward = api.haversineDistanceKm(0, 0, 1, 0);
  const reverse = api.haversineDistanceKm(1, 0, 0, 0);
  assert.ok(Math.abs(forward - 111.195) < 0.01);
  assert.ok(Math.abs(forward - reverse) < 1e-12);
  assert.ok(Number.isFinite(api.haversineDistanceKm(-90, -180, 90, 180)));
  assert.equal(api.haversineDistanceKm(null, 0, 0, 0), null);
  assert.equal(api.haversineDistanceKm(91, 0, 0, 0), null);
});

test("approximate distance formatting follows meter and kilometer boundaries in Thai and English", () => {
  const { api } = loadMap();
  assert.equal(api.formatApproximateDistance(0, "th"), "< 10 ม.");
  assert.equal(api.formatApproximateDistance(0.009, "en"), "< 10 m");
  assert.equal(api.formatApproximateDistance(0.01, "th"), "10 ม.");
  assert.equal(api.formatApproximateDistance(0.016, "en"), "20 m");
  assert.equal(api.formatApproximateDistance(0.999, "th"), "1.0 กม.");
  assert.equal(api.formatApproximateDistance(1, "th"), "1.0 กม.");
  assert.equal(api.formatApproximateDistance(2.44, "en"), "2.4 km");
  assert.equal(api.formatApproximateDistance(null, "en"), "");
  assert.equal(api.formatApproximateDistance(-1, "th"), "");
});

test("distance sorting uses a stable derived copy and places records without coordinates last", () => {
  const { api } = loadMap();
  const places = [
    { place_id: "far", latitude: 2, longitude: 0, coordinate_status: "verified" },
    { place_id: "missing", latitude: null, longitude: null, coordinate_status: "no_coordinate" },
    { place_id: "equal-a", latitude: 1, longitude: 0, coordinate_status: "verified" },
    { place_id: "invalid", latitude: 91, longitude: 0, coordinate_status: "verified" },
    { place_id: "equal-b", latitude: -1, longitude: 0, coordinate_status: "verified" }
  ];
  const original = places.map((place) => place.place_id);
  const withoutLocation = api.deriveDistanceSortedPlaces(places, null);
  const sorted = api.deriveDistanceSortedPlaces(places, { latitude: 0, longitude: 0 });
  assert.deepEqual(Array.from(withoutLocation, (place) => place.place_id), original);
  assert.deepEqual(Array.from(sorted, (place) => place.place_id), ["equal-a", "equal-b", "far", "missing", "invalid"]);
  assert.deepEqual(places.map((place) => place.place_id), original);
  assert.notEqual(sorted, places);
});

test("current location is requested only after the bound button is activated and uses approved options", () => {
  let calls = 0;
  let request = null;
  const navigator = { geolocation: { getCurrentPosition(success, error, options) { calls += 1; request = { success, error, options }; } } };
  const { api } = loadMap({ navigator });
  const button = { addEventListener(type, handler) { assert.equal(type, "click"); this.click = handler; } };
  api.bindCurrentLocationControl(button);
  assert.equal(calls, 0);
  button.click();
  assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(request.options)), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
});

test("pending location requests are deduplicated and successful coordinates remain memory-only", () => {
  const requests = [];
  const navigator = { geolocation: { getCurrentPosition(success, error, options) { requests.push({ success, error, options }); } } };
  const environment = loadMap({ navigator });
  assert.equal(environment.api.requestCurrentLocation(), true);
  assert.equal(environment.api.requestCurrentLocation(), false);
  assert.equal(requests.length, 1);
  assert.equal(environment.api.getLocationSnapshot().locationStatus, "loading");
  requests[0].success({ coords: { latitude: "8.5", longitude: 98.5, accuracy: "12.4" } });
  const ready = environment.api.getLocationSnapshot();
  assert.deepEqual(JSON.parse(JSON.stringify(ready.userLocation)), { latitude: 8.5, longitude: 98.5, accuracy: 12.4 });
  assert.equal(ready.locationRequestPending, false);
  assert.equal(ready.locationStatus, "ready");
  assert.equal(environment.values.has("TAKHUN_USER_LOCATION"), false);
});

test("location errors map to safe statuses and retain a previous successful location", () => {
  const requests = [];
  const navigator = { geolocation: { getCurrentPosition(success, error) { requests.push({ success, error }); } } };
  const { api } = loadMap({ navigator });
  assert.equal(api.locationStatusFromError({ code: 1 }), "denied");
  assert.equal(api.locationStatusFromError({ code: 2 }), "unavailable");
  assert.equal(api.locationStatusFromError({ code: 3 }), "timeout");
  assert.equal(api.locationStatusFromError({ code: 999 }), "unavailable");
  api.requestCurrentLocation();
  requests[0].success({ coords: { latitude: 8, longitude: 98, accuracy: null } });
  api.requestCurrentLocation();
  requests[1].error({ code: 3 });
  const snapshot = api.getLocationSnapshot();
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.userLocation)), { latitude: 8, longitude: 98, accuracy: null });
  assert.equal(snapshot.locationStatus, "timeout");
  assert.equal(snapshot.locationRequestPending, false);
});

test("unsupported geolocation and invalid returned coordinates fail closed without throwing", () => {
  const unsupported = loadMap();
  assert.equal(unsupported.api.requestCurrentLocation(), false);
  assert.equal(unsupported.api.getLocationSnapshot().locationStatus, "unsupported");

  let success;
  const invalid = loadMap({ navigator: { geolocation: { getCurrentPosition(callback) { success = callback; } } } });
  assert.equal(invalid.api.requestCurrentLocation(), true);
  success({ coords: { latitude: 91, longitude: 98, accuracy: 5 } });
  assert.equal(invalid.api.getLocationSnapshot().locationStatus, "unavailable");
  assert.equal(invalid.api.getLocationSnapshot().userLocation, null);
});

test("user-location marker creation is singleton and repeated success updates the existing marker", () => {
  const created = [];
  const leaflet = {
    divIcon(options) { return options; },
    marker(latlng, options) {
      const attributes = new Map();
      const marker = {
        options, latlng,
        addTo(map) { this.map = map; return this; },
        on(type, handler) { if (type === "add") handler(); return this; },
        setLatLng(next) { this.latlng = next; return this; },
        getElement() { return { setAttribute(name, value) { attributes.set(name, String(value)); } }; },
        attributes
      };
      created.push(marker);
      return marker;
    }
  };
  const { api } = loadMap({ leaflet });
  const map = {};
  const first = api.upsertUserLocationMarker(map, null, { latitude: 8, longitude: 98, accuracy: 10 });
  const second = api.upsertUserLocationMarker(map, first, { latitude: 8.5, longitude: 98.5, accuracy: 8 });
  assert.equal(first, second);
  assert.equal(created.length, 1);
  assert.deepEqual(Array.from(second.latlng), [8.5, 98.5]);
  assert.equal(second.options.icon.className, "map-user-location-marker");
  assert.equal(second.attributes.get("role"), "img");
  assert.equal(second.attributes.get("aria-label"), "map.user_location_marker_label");
});

test("language snapshots preserve raw user coordinates and location request state", () => {
  const { api } = loadMap();
  const value = { category: "nature", district: "phanom", keyword: "lake", selectedPlaceId: "B", userLocation: { latitude: 8, longitude: 98, accuracy: 10 }, locationRequestPending: true, locationStatus: "loading" };
  const snapshot = api.preserveInteractiveState(value);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), value);
  assert.notEqual(snapshot.userLocation, value.userLocation);
});

test("focusing a user location changes only the map viewport", () => {
  const { api } = loadMap();
  const calls = [];
  const map = { getZoom() { return 11; }, setView(latlng, zoom) { calls.push({ latlng, zoom }); } };
  const interactive = { category: "nature", district: "phanom", keyword: "lake", selectedPlaceId: "B" };
  const before = JSON.stringify(interactive);
  assert.equal(api.focusUserLocation(map, { latitude: 8.5, longitude: 98.5 }), true);
  assert.deepEqual(Array.from(calls[0].latlng), [8.5, 98.5]);
  assert.equal(calls[0].zoom, 14);
  assert.equal(JSON.stringify(interactive), before);
  assert.equal(api.focusUserLocation(null, { latitude: 8.5, longitude: 98.5 }), false);
});

Promise.all(pending).then(() => {
  if (!process.exitCode) process.stdout.write("Map behavior verification passed.\n");
});
