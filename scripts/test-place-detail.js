"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function loadModules(options = {}) {
  const values = new Map(options.storageSeed === undefined ? [] : [["TAKHUN_FAVORITES", options.storageSeed]]);
  const events = [];
  const context = {
    console,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    DOMException,
    document: { readyState: "loading", addEventListener() {}, querySelector() { return null; } },
    location: { search: options.search || "", pathname: "/place-detail.html", href: `https://example.test/place-detail.html${options.search || ""}` },
    history: { back() { events.push("back"); } },
    navigator: options.navigator || {},
    localStorage: {
      getItem(key) { if (options.storageThrows) throw new Error("blocked"); return values.get(key) ?? null; },
      setItem(key, value) { if (options.storageThrows) throw new Error("blocked"); values.set(key, String(value)); }
    },
    TakhunI18n: {
      getCurrentLang() { return "th"; },
      pickLangValue(item, field, lang = "th") { return item?.[`${field}_${lang}`] || item?.[`${field}_th`] || ""; },
      t(key) { return key; }
    },
    TakhunApi: options.api || {
      getPlaceDetail(_id, _params, config) { return Promise.resolve(config.mock()); },
      getReviews(_id, _params, config) { return Promise.resolve(config.mock()); },
      submitReview(payload, config) { return Promise.resolve(config.mock(payload)); }
    },
    window: null
  };
  context.window = context;
  vm.runInNewContext(read("public/js/content-data.js"), context, { filename: "content-data.js" });
  vm.runInNewContext(read("public/js/place-data.js"), context, { filename: "place-data.js" });
  vm.runInNewContext(read("public/js/reviews.js"), context, { filename: "reviews.js" });
  vm.runInNewContext(read("public/js/place-detail.js"), context, { filename: "place-detail.js" });
  return { context, data: context.TakhunPlaceData, detail: context.TakhunPlaceDetail, values, events };
}

const pending = [];
function test(name, callback) {
  pending.push(Promise.resolve().then(callback).then(
    () => process.stdout.write(`PASS ${name}\n`),
    (error) => { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode = 1; }
  ));
}

test("shared data preserves canonical IDs, order, and publication counts", () => {
  const { data } = loadModules();
  const records = data.listPlaces();
  assert.equal(records.length, 10);
  assert.equal(records.filter((item) => item.status === "published").length, 10);
  assert.deepEqual(JSON.parse(JSON.stringify(records.map((item) => item.place_id))), ["BTK-001", "BTK-002", "BTK-003", "BTK-004", "BTK-005", "KRN-001", "KRN-002", "KRN-003", "PNM-001", "PNM-002"]);
  assert.equal(new Set(records.map((item) => item.place_id)).size, 10);
});

test("shared data returns defensive normalized copies", () => {
  const { data } = loadModules();
  const first = data.listPlaces()[0];
  assert.ok(Array.isArray(first.activities_th));
  assert.ok(Array.isArray(first.gallery_image_urls));
  assert.equal(first.gallery_image_urls.length, 0, "media remains empty until the Media Pipeline milestone");
  assert.ok(Array.isArray(first.nearby_place_ids));
  assert.ok(Array.isArray(first.reviews));
  first.name_th = "mutated";
  first.activities_th.push("mutated");
  assert.notEqual(data.getPlaceById(first.place_id).name_th, "mutated");
  assert.ok(!data.getPlaceById(first.place_id).activities_th.includes("mutated"));
});

test("nearby lookup is published-only, unique, ordered, and excludes current place", () => {
  const { data } = loadModules();
  const nearby = data.getNearbyPlaces(["BTK-002", "BTK-002", "UNKNOWN", "BTK-001"], "BTK-001");
  assert.deepEqual(JSON.parse(JSON.stringify(nearby.map((item) => item.place_id))), ["BTK-002"]);
});

test("query parsing trims and decodes IDs while validation rejects unsafe IDs", () => {
  const { detail } = loadModules();
  assert.equal(detail.parsePlaceId("?id=%20MOCK-PLACE-001%20"), "MOCK-PLACE-001");
  assert.equal(detail.parsePlaceId(""), "");
  assert.equal(detail.validatePlaceId("MOCK-PLACE_001"), true);
  assert.equal(detail.validatePlaceId(""), false);
  assert.equal(detail.validatePlaceId("has space"), false);
  assert.equal(detail.validatePlaceId("../bad"), false);
  assert.equal(detail.validatePlaceId("A".repeat(100)), true);
  assert.equal(detail.validatePlaceId("A".repeat(101)), false);
});

test("published lookup never falls back and rejects draft or unknown records", () => {
  const { detail } = loadModules();
  assert.equal(detail.findPublishedPlace("BTK-001").place_id, "BTK-001");
  assert.equal(detail.findPublishedPlace("UNKNOWN"), null);
  assert.equal(detail.findPublishedPlace(""), null);
});

test("page state machine exposes exactly one visible primary state", () => {
  const { detail } = loadModules();
  const mounts = {
    loading: { hidden: false },
    ready: { hidden: false },
    "not-found": { hidden: false },
    error: { hidden: false }
  };
  for (const state of ["loading", "ready", "not-found", "error"]) {
    assert.equal(detail.setPageState(mounts, state), state);
    assert.deepEqual(Object.entries(mounts).filter(([, mount]) => !mount.hidden).map(([name]) => name), [state]);
  }
});

test("state transitions always hide the previous state and invalid states fail closed", () => {
  const { detail } = loadModules();
  const mounts = { loading: { hidden: false }, ready: { hidden: false }, "not-found": { hidden: false }, error: { hidden: false } };
  detail.setPageState(mounts, "loading");
  detail.setPageState(mounts, "error");
  assert.equal(mounts.loading.hidden, true);
  assert.equal(mounts.error.hidden, false);
  assert.throws(() => detail.setPageState(mounts, "unknown"), /Unknown page state/);
  assert.ok(Object.values(mounts).every((mount) => mount.hidden), "invalid transitions must not leave stale content visible");
});

test("page resolution distinguishes ready, not-found, and loader errors", () => {
  const readyEnv = loadModules();
  assert.equal(readyEnv.detail.resolvePage("?id=BTK-001").state, "ready");
  assert.equal(readyEnv.detail.resolvePage("?id=UNKNOWN").state, "not-found");
  assert.equal(readyEnv.detail.resolvePage("").state, "not-found");
  assert.equal(readyEnv.detail.resolvePage("?id=MOCK-PLACE-014").state, "not-found");
  assert.equal(readyEnv.detail.resolvePage(`?id=${"A".repeat(65)}`).state, "not-found");
  readyEnv.context.TakhunPlaceData = { getPlaceById() { throw new Error("mock loader failed"); } };
  const failed = readyEnv.detail.resolvePage("?id=MOCK-PLACE-001");
  assert.equal(failed.state, "error");
  assert.equal(failed.place, null);
});

test("detail helpers create conditional and encoded action URLs", () => {
  const { detail, data } = loadModules();
  const place = data.getPlaceById("BTK-001");
  const actions = detail.getActionModel(place);
  assert.equal(actions.detailMapUrl, "", "unverified coordinates must not create an internal map focus URL");
  assert.equal(actions.tripPlannerUrl, "trip-planner.html?add=BTK-001");
  assert.equal(actions.phoneUrl, "tel:0837894493");
  assert.match(actions.googleMapsUrl, /^https:\/\/maps\.app\.goo\.gl\//);
  assert.equal(detail.getActionModel({ place_id: "A/B", latitude: null, longitude: null, phone: "", google_maps_url: "bad" }).tripPlannerUrl, "trip-planner.html?add=A%2FB");
});

test("favorites normalize, persist, and survive corrupted or blocked storage", () => {
  assert.deepEqual([...loadModules({ storageSeed: '["A",1,"A","B"]' }).detail.readFavorites()], ["A", "B"]);
  assert.deepEqual([...loadModules({ storageSeed: "bad-json" }).detail.readFavorites()], []);
  assert.deepEqual([...loadModules({ storageThrows: true }).detail.toggleFavorite("BTK-001")], ["BTK-001"]);
  const env = loadModules({ storageSeed: "[]" });
  assert.deepEqual([...env.detail.toggleFavorite("BTK-001")], ["BTK-001"]);
  assert.equal(env.values.get("TAKHUN_FAVORITES"), '["BTK-001"]');
});

test("share uses Web Share, treats cancellation as neutral, and falls back to clipboard", async () => {
  let shared = 0;
  const nativeEnv = loadModules({ navigator: { async share() { shared += 1; } } });
  assert.equal(await nativeEnv.detail.sharePlace({ title: "T", text: "X", url: "https://example.test" }), "shared");
  assert.equal(shared, 1);
  const cancelEnv = loadModules({ navigator: { async share() { throw new DOMException("cancel", "AbortError"); } } });
  assert.equal(await cancelEnv.detail.sharePlace({ title: "T", text: "X", url: "https://example.test" }), "cancelled");
  let copied = "";
  const copyEnv = loadModules({ navigator: { clipboard: { async writeText(value) { copied = value; } } } });
  assert.equal(await copyEnv.detail.sharePlace({ title: "T", text: "X", url: "https://example.test/copy" }), "copied");
  assert.equal(copied, "https://example.test/copy");
  assert.equal(await loadModules().detail.sharePlace({ title: "T", text: "X", url: "https://example.test" }), "copy_failed");
});

test("place detail gives only its informative hero high priority", () => {
  const detailSource = fs.readFileSync(path.join(root, "public/js/place-detail.js"), "utf8");
  assert.equal((detailSource.match(/fetchPriority:\s*"high"/g) || []).length, 1);
  assert.match(detailSource, /hero[\s\S]*?fallbackAlt:[\s\S]*?loading:\s*"eager"[\s\S]*?fetchPriority:\s*"high"[\s\S]*?sizes:\s*"100vw"/);
  assert.match(detailSource, /detail-nearby-card__image[\s\S]*?decorative:\s*true[\s\S]*?loading:\s*"lazy"/);
});

test("place detail never derives production gallery media from URL array entries", () => {
  const detailSource = fs.readFileSync(path.join(root, "public/js/place-detail.js"), "utf8");
  const body = /function renderGallery\(place, lang\) \{([\s\S]*?)\n  \}/.exec(detailSource)?.[1] || "";
  assert.doesNotMatch(body, /gallery_image_urls|place-.*-gallery|image_url|https?:/);
  assert.match(body, /mount\.hidden\s*=\s*true/);
  assert.match(body, /mount\.replaceChildren\(\)/);
});

Promise.all(pending).then(() => {
  if (!process.exitCode) process.stdout.write("Place detail behavior verification passed.\n");
});
