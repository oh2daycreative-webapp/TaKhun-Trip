"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const homeFile = path.join(__dirname, "../public/js/home.js");
assert.ok(fs.existsSync(homeFile), "public/js/home.js must exist");
const source = fs.readFileSync(homeFile, "utf8");
const contentSource = fs.readFileSync(path.join(__dirname, "../public/js/content-data.js"), "utf8");

function loadHomeModule() {
  const context = { URL, console, setTimeout, clearTimeout, Date, Intl, window: null };
  context.window = context;
  vm.runInNewContext(contentSource, context, { filename: "content-data.js" });
  vm.runInNewContext(source, context, { filename: "home.js" });
  return context.TakhunHome;
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function validEnvelope(overrides = {}) {
  return {
    ok: true,
    data: {
      featured_routes: [{ route_id: "ROUTE-001", name: "Route", short_description: "Route summary", duration: "1 วัน", travel_style: ["nature", "future_style"], cover_image_url: "https://example.test/route.jpg", is_featured: true }],
      featured_places: [{ place_id: "PLACE-001", name: "Place", category: "nature", short_description: "Place summary", cover_image_url: "https://example.test/place.jpg", is_featured: true }],
      featured_products: [],
      upcoming_events: [],
      gallery_preview: [],
      ...overrides
    },
    message: "success"
  };
}

async function run() {
  const home = loadHomeModule();
  for (const name of [
    "normalizeLang", "normalizeHomeResponse", "resolveHomeState", "setPrimaryState",
    "safeImageUrl", "placeDetailUrl", "routeDetailUrl", "categoryLabel", "durationLabel",
    "styleLabel", "mapPlace", "mapRoute", "mapEvent", "localizedInspiration", "mockHomeResponse", "createHomeController"
  ]) assert.equal(typeof home?.[name], "function", `missing helper ${name}`);

  {
    const input = validEnvelope();
    const snapshot = JSON.stringify(input);
    const normalized = home.normalizeHomeResponse(input);
    assert.deepEqual(Object.keys(plain(normalized.data)).sort(), ["featured_places", "featured_products", "featured_routes", "gallery_preview", "upcoming_events"]);
    assert.equal(JSON.stringify(input), snapshot, "normalization must not mutate the API response");
    assert.notEqual(normalized, input);
    assert.notEqual(normalized.data, input.data);
    assert.notEqual(normalized.data.featured_places, input.data.featured_places);
    assert.notEqual(normalized.data.featured_places[0], input.data.featured_places[0]);
    normalized.data.featured_places[0].name = "Changed";
    assert.equal(input.data.featured_places[0].name, "Place");
  }

  for (const invalid of [
    null,
    [],
    { ok: false, data: validEnvelope().data },
    { ok: true, data: null },
    { ok: true, data: { ...validEnvelope().data, extra_section: [] } },
    { ok: true, data: { ...validEnvelope().data, featured_products: {} } },
    validEnvelope({ featured_places: [{ place_id: "", name: "Place", category: "nature", short_description: "", cover_image_url: "", is_featured: true }] }),
    validEnvelope({ featured_routes: [{ route_id: "ROUTE-001", name: "Route", short_description: "", duration: "", travel_style: ["nature", 5], cover_image_url: "", is_featured: true }] })
  ]) assert.throws(() => home.normalizeHomeResponse(invalid), /MALFORMED_RESPONSE/);

  {
    const places = Array.from({ length: 6 }, (_value, index) => ({ place_id: `P-${index}`, name: `P${index}`, category: "nature", short_description: "", cover_image_url: "", is_featured: true }));
    const routes = Array.from({ length: 4 }, (_value, index) => ({ route_id: `R-${index}`, name: `R${index}`, short_description: "", duration: "", travel_style: [], cover_image_url: "", is_featured: true }));
    const normalized = home.normalizeHomeResponse(validEnvelope({ featured_places: places, featured_routes: routes }));
    assert.equal(normalized.data.featured_places.length, 4);
    assert.equal(normalized.data.featured_routes.length, 2);
  }

  assert.equal(home.normalizeLang("en"), "en");
  assert.equal(home.normalizeLang("EN"), "th");
  assert.equal(home.normalizeLang("fr"), "th");
  assert.equal(home.placeDetailUrl("P /?"), "place-detail.html?id=P%20%2F%3F");
  assert.equal(home.routeDetailUrl("R /?"), "route-detail.html?id=R%20%2F%3F");
  assert.equal(home.safeImageUrl("https://example.test/a.jpg"), "https://example.test/a.jpg");
  assert.equal(home.safeImageUrl("http://example.test/a.jpg"), "http://example.test/a.jpg");
  for (const unsafe of ["", "javascript:alert(1)", "data:image/png;base64,AA", "file:///tmp/a", "blob:https://example.test/id", "/relative.jpg"]) assert.equal(home.safeImageUrl(unsafe), "");

  {
    const labels = { "places.categories.nature": "Nature", "trip_planner.duration_one_day": "1 Day", "routes_page.styles.nature": "Nature" };
    const t = (key) => labels[key] || key;
    assert.equal(home.categoryLabel("nature", t), "Nature");
    assert.equal(home.categoryLabel("future_category", t), "future_category");
    assert.equal(home.durationLabel("1 วัน", t), "1 Day");
    assert.equal(home.durationLabel("3 ชั่วโมง", t), "3 ชั่วโมง");
    assert.equal(home.styleLabel("nature", t), "Nature");
    assert.equal(home.styleLabel("future_style", t), "future_style");
    const place = home.mapPlace(validEnvelope().data.featured_places[0], t);
    assert.deepEqual(plain(place), { id: "PLACE-001", title: "Place", category: "Nature", description: "Place summary", href: "place-detail.html?id=PLACE-001", imageUrl: "https://example.test/place.jpg", featured: true });
    assert.equal("tone" in place, false);
    assert.equal("phone" in place, false);
    const route = home.mapRoute(validEnvelope().data.featured_routes[0], t);
    assert.deepEqual(plain(route), { id: "ROUTE-001", title: "Route", description: "Route summary", duration: "1 Day", styles: ["Nature", "future_style"], href: "route-detail.html?id=ROUTE-001", imageUrl: "https://example.test/route.jpg", featured: true });
    assert.equal("stops" in route, false);
    assert.equal("tone" in route, false);
  }

  assert.equal(home.resolveHomeState({ loading: true }), "loading");
  assert.equal(home.resolveHomeState({ error: new Error("network") }), "error");
  assert.equal(home.resolveHomeState({ places: [], routes: [] }), "empty");
  assert.equal(home.resolveHomeState({ places: [{}], routes: [] }), "ready");
  assert.equal(home.resolveHomeState({ places: [], routes: [{}] }), "ready");
  {
    const mounts = Object.fromEntries(["loading", "ready", "empty", "error"].map((name) => [name, { hidden: false }]));
    for (const state of Object.keys(mounts)) {
      assert.equal(home.setPrimaryState(mounts, state), state);
      assert.deepEqual(Object.entries(mounts).filter(([, mount]) => !mount.hidden).map(([name]) => name), [state]);
    }
    assert.throws(() => home.setPrimaryState(mounts, "unknown"), /Unknown home state/);
    assert.ok(Object.values(mounts).every((mount) => mount.hidden));
  }

  {
    const first = deferred();
    const calls = [];
    const snapshots = [];
    const controller = home.createHomeController({ initialLang: "th", loadHome(lang) { calls.push(lang); return first.promise; }, onChange(snapshot) { snapshots.push(snapshot); } });
    const requestA = controller.load();
    const requestB = controller.load();
    assert.equal(requestA, requestB, "pending requests for the same language must be deduplicated");
    assert.deepEqual(calls, ["th"]);
    assert.equal(controller.getSnapshot().state, "loading");
    first.resolve(validEnvelope());
    await requestA;
    assert.equal(controller.getSnapshot().state, "ready");
    await controller.setLanguage("th");
    assert.deepEqual(calls, ["th"], "same effective language must not refetch");
    assert.ok(snapshots.some((snapshot) => snapshot.state === "loading"));
  }

  {
    const thai = deferred();
    const english = deferred();
    const calls = [];
    const controller = home.createHomeController({ initialLang: "th", loadHome(lang) { calls.push(lang); return lang === "th" ? thai.promise : english.promise; } });
    const thaiRequest = controller.load();
    const englishRequest = controller.setLanguage("en");
    assert.deepEqual(calls, ["th", "en"]);
    english.resolve(validEnvelope({ featured_places: [], featured_routes: [] }));
    await englishRequest;
    assert.equal(controller.getSnapshot().lang, "en");
    assert.equal(controller.getSnapshot().state, "empty");
    thai.resolve(validEnvelope());
    await thaiRequest;
    assert.equal(controller.getSnapshot().lang, "en");
    assert.equal(controller.getSnapshot().state, "empty", "stale success must not overwrite the latest state");
  }

  {
    const thai = deferred();
    const english = deferred();
    const controller = home.createHomeController({ initialLang: "th", loadHome(lang) { return lang === "th" ? thai.promise : english.promise; } });
    const thaiRequest = controller.load();
    const englishRequest = controller.setLanguage("en");
    english.resolve(validEnvelope());
    await englishRequest;
    thai.reject(new Error("stale failure"));
    await thaiRequest;
    assert.equal(controller.getSnapshot().state, "ready", "stale rejection must be ignored");
  }

  {
    const thai = deferred();
    const english = deferred();
    const calls = [];
    const controller = home.createHomeController({ initialLang: "th", loadHome(lang) { calls.push(lang); return lang === "th" ? thai.promise : english.promise; } });
    const firstThai = controller.load();
    const englishRequest = controller.setLanguage("en");
    const secondThai = controller.setLanguage("th");
    assert.deepEqual(calls, ["th", "en"], "returning to a language with an in-flight request must reuse it");
    thai.resolve(validEnvelope());
    await Promise.all([firstThai, secondThai]);
    assert.equal(controller.getSnapshot().lang, "th");
    assert.equal(controller.getSnapshot().state, "ready");
    english.resolve(validEnvelope({ featured_places: [], featured_routes: [] }));
    await englishRequest;
    assert.equal(controller.getSnapshot().state, "ready", "the stale middle-language response must be ignored");
  }

  {
    let attempts = 0;
    const snapshots = [];
    const controller = home.createHomeController({ initialLang: "en", loadHome() { attempts += 1; return attempts === 1 ? Promise.reject(new Error("network")) : Promise.resolve(validEnvelope()); }, onChange(snapshot) { snapshots.push(snapshot); } });
    await controller.load();
    assert.equal(controller.getSnapshot().state, "error");
    assert.equal(snapshots.at(-1).pending, false, "Retry must be enabled after the failed request settles");
    await controller.retry();
    assert.equal(attempts, 2);
    assert.equal(controller.getSnapshot().state, "ready");
  }

  {
    const th = home.localizedInspiration("th");
    const en = home.localizedInspiration("en");
    assert.equal(th.length, 5);
    assert.equal(en.length, 5);
    assert.notEqual(th[0].name, en[0].name);
    assert.deepEqual(th.map(({ href, tone, icon }) => ({ href, tone, icon })), en.map(({ href, tone, icon }) => ({ href, tone, icon })));
    const eventTestDate = new Date("2026-07-17T12:00:00+07:00");
    const mockTh = home.mockHomeResponse("th", eventTestDate);
    const mockEn = home.mockHomeResponse("en", eventTestDate);
    assert.notEqual(mockTh.data.featured_places[0].name, mockEn.data.featured_places[0].name);
    assert.notEqual(mockTh.data.featured_routes[0].name, mockEn.data.featured_routes[0].name);
    assert.equal(mockTh.data.upcoming_events[0].event_id, "EVENT-HEART-OF-HILLS-2026");
    assert.equal(home.normalizeHomeResponse(mockEn).ok, true);
  }

  assert.doesNotMatch(source, /\.innerHTML\s*=/, "home.js must not assign innerHTML");
  assert.doesNotMatch(source, /\beval\s*\(/, "home.js must not use eval");
  process.stdout.write("Home behavior verification passed.\n");
}

run().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
