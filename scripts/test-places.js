"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const canonicalSource = fs.readFileSync(path.join(root, "public/js/content-data.js"), "utf8");
const dataSource = fs.readFileSync(path.join(root, "public/js/place-data.js"), "utf8");
const source = fs.readFileSync(path.join(root, "public/js/places.js"), "utf8");

function loadModule(storageSeed = null, storageThrows = false) {
  const values = new Map(storageSeed === null ? [] : [["TAKHUN_FAVORITES", storageSeed]]);
  const context = {
    console,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    document: { readyState: "loading", addEventListener() {}, querySelector() { return null; } },
    location: { search: "", pathname: "/places.html" },
    history: { replaceState() {}, pushState() {} },
    localStorage: {
      getItem(key) { if (storageThrows) throw new Error("blocked"); return values.get(key) ?? null; },
      setItem(key, value) { if (storageThrows) throw new Error("blocked"); values.set(key, String(value)); }
    },
    window: null
  };
  context.window = context;
  vm.runInNewContext(canonicalSource, context, { filename: "content-data.js" });
  vm.runInNewContext(dataSource, context, { filename: "place-data.js" });
  vm.runInNewContext(source, context, { filename: "places.js" });
  return { api: context.TakhunPlaces, values };
}

const pendingTests = [];
function test(name, callback) {
  pendingTests.push(Promise.resolve().then(callback).then(
    () => process.stdout.write(`PASS ${name}\n`),
    (error) => { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode = 1; }
  ));
}

const records = [
  { place_id: "MOCK A/B", status: "published", name_th: "น้ำตกตัวอย่าง", name_en: "Sample Falls", short_description_th: "ธรรมชาติ", district: "ban_ta_khun", category: "nature", route_group: "main_point_1", latitude: 8, longitude: 98, google_maps_url: "https://maps.example/a" },
  { place_id: "MOCK-002", status: "published", name_th: "ชุมชนตัวอย่าง", name_en: "", short_description_th: "งานชุมชน", district: "phanom", category: "community_tourism", route_group: "", latitude: null, longitude: null, google_maps_url: "" },
  { place_id: "MOCK-DRAFT", status: "draft", name_th: "ฉบับร่าง", district: "ban_ta_khun", category: "nature", route_group: "main_point_1" }
];

test("exposes isolated data, filter, pagination, URL and storage helpers", () => {
  const { api } = loadModule();
  for (const name of ["loadPlaces", "parseQuery", "filterPlaces", "getFilterOptions", "paginatePlaces", "detailUrl", "canOpenMap", "readFavorites", "writeFavorites", "toggleFavorite", "createPageState"]) {
    assert.equal(typeof api?.[name], "function", `${name} must be public`);
  }
});

test("loads the ten canonical published places without mock identifiers", async () => {
  const { api } = loadModule();
  const all = await api.loadPlaces();
  assert.equal(all.length, 10);
  const published = api.filterPlaces(all, api.createPageState().filters, "th");
  assert.equal(published.length, 10);
  assert.ok(published.every((place) => place.status === "published"));
  assert.ok(all.every((place) => !place.place_id.startsWith("MOCK-")));
  assert.equal(all.find((place) => place.place_id === "BTK-005")?.name_th, "วัดเขาพัง");
});

test("parses all supported query parameters and ignores unknown enum values", () => {
  const { api } = loadModule();
  const options = { districts: ["ban_ta_khun"], categories: ["nature"], routeGroups: ["main_point_1"] };
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.parseQuery("?keyword=lake&district=ban_ta_khun&category=nature&route_group=main_point_1", options))),
    { keyword: "lake", district: "ban_ta_khun", category: "nature", route_group: "main_point_1" }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.parseQuery("?keyword=x&district=bad&category=new-value&route_group=nope", options))),
    { keyword: "x", district: "", category: "", route_group: "" }
  );
});

test("combines filters and searches localized values with Thai fallback", () => {
  const { api } = loadModule();
  const combined = api.filterPlaces(records, { keyword: "sample", district: "ban_ta_khun", category: "nature", route_group: "main_point_1" }, "en");
  assert.equal(combined.length, 1);
  assert.equal(api.filterPlaces(records, { keyword: "งานชุมชน", district: "", category: "", route_group: "" }, "en").length, 1);
});

test("derives only populated filter options and tolerates future values", () => {
  const { api } = loadModule();
  const options = api.getFilterOptions(records);
  assert.deepEqual([...options.districts], ["ban_ta_khun", "phanom"]);
  assert.deepEqual([...options.categories], ["community_tourism", "nature"]);
  assert.deepEqual([...options.routeGroups], ["main_point_1"]);
});

test("paginates without duplicates and reports completion", () => {
  const { api } = loadModule();
  const items = Array.from({ length: 25 }, (_, index) => ({ place_id: `MOCK-${index}` }));
  const page1 = api.paginatePlaces(items, 1, 12);
  const page2 = api.paginatePlaces(items, 2, 12);
  const page3 = api.paginatePlaces(items, 3, 12);
  assert.equal(page1.items.length, 12);
  assert.equal(page2.items.length, 24);
  assert.equal(page3.items.length, 25);
  assert.equal(new Set(page3.items.map((item) => item.place_id)).size, 25);
  assert.equal(page3.hasMore, false);
});

test("encodes detail identifiers and exposes map availability only with coordinates", () => {
  const { api } = loadModule();
  assert.equal(api.detailUrl("MOCK A/B"), "place-detail.html?id=MOCK%20A%2FB");
  assert.equal(api.canOpenMap(records[0]), true);
  assert.equal(api.canOpenMap(records[1]), false);
});

test("normalizes favorites and survives corrupted or blocked storage", () => {
  assert.deepEqual([...loadModule('["A",1,"A","B"]').api.readFavorites()], ["A", "B"]);
  assert.deepEqual([...loadModule("not-json").api.readFavorites()], []);
  assert.deepEqual([...loadModule(null, true).api.readFavorites()], []);
});

test("persists favorite toggles as an array of identifiers", () => {
  const environment = loadModule("[]");
  assert.deepEqual([...environment.api.toggleFavorite("MOCK-1")], ["MOCK-1"]);
  assert.equal(environment.values.get("TAKHUN_FAVORITES"), '["MOCK-1"]');
  assert.deepEqual([...environment.api.toggleFavorite("MOCK-1")], []);
});

Promise.all(pendingTests).then(() => {
  if (!process.exitCode) process.stdout.write("Places behavior verification passed.\n");
});
