"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const canonicalSource = fs.readFileSync(path.join(root, "public/js/content-data.js"), "utf8");
const dataSource = fs.readFileSync(path.join(root, "public/js/place-data.js"), "utf8");
const source = fs.readFileSync(path.join(root, "public/js/places.js"), "utf8");

function loadModule(storageSeed = null, storageThrows = false, liveApi = null) {
  const values = new Map(storageSeed === null ? [] : [["TAKHUN_FAVORITES", storageSeed]]);
  const context = {
    TakhunApi: liveApi || undefined,
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

// F-07 (owner decision 2026-10-16): the list shows the LIVE published places (getPlaces), never the bundled
// ten-place snapshot in content-data.js (which stays in git only as the source for re-entry).
function liveItem(id, lang, extra = {}) {
  return { place_id: id, name: `${id}-${lang}`, name_th: `${id}-th`, name_en: `${id}-en`, district: "phanom", category: "nature",
    route_group: "", short_description: lang === "en" ? `${id} short en` : `${id} short th`, phone: "", google_maps_url: "", latitude: "", longitude: "",
    cover_image_url: "", is_featured: false, is_main_route_point: false, ...extra };
}
function fakeLiveApi(pagesByLang, calls = []) {
  return { async getPlaces(params) { calls.push({ ...params }); const data = pagesByLang[params.lang][params.page - 1];
    if (data instanceof Error) throw data; return data; } };
}

test("F-07 loads live published places across pages, merges TH/EN, and ignores the bundled snapshot", async () => {
  const calls = [];
  const live = fakeLiveApi({
    th: [{ items: [liveItem("PLC-1", "th", { latitude: 9.1, longitude: 98.7 })], total: 2, total_pages: 2 }, { items: [liveItem("PLC-2", "th")], total: 2, total_pages: 2 }],
    en: [{ items: [liveItem("PLC-1", "en", { latitude: 9.1, longitude: 98.7 })], total: 2, total_pages: 2 }, { items: [liveItem("PLC-2", "en", { short_description: "PLC-2 short th" })], total: 2, total_pages: 2 }]
  }, calls);
  const { api } = loadModule(null, false, live);
  const all = await api.loadPlaces();
  assert.deepEqual(JSON.parse(JSON.stringify(all.map((place) => place.place_id))), ["PLC-1", "PLC-2"], "only live places; none of the ten bundled ones");
  assert.ok(all.every((place) => place.status === "published"));
  assert.equal(all[0].short_description_en, "PLC-1 short en");
  assert.equal(all[1].short_description_en, "", "backend Thai fallback is not stored as English");
  assert.equal(all[0].latitude, 9.1);
  assert.equal(all[1].latitude, null, "no coordinates -> no map button");
  assert.equal(api.canOpenMap(all[1]), false);
  assert.deepEqual(calls.map((call) => [call.lang, call.page, call.page_size]).sort(), [["en", 1, 100], ["en", 2, 100], ["th", 1, 100], ["th", 2, 100]]);
  assert.equal(api.filterPlaces(all, api.createPageState().filters, "th").length, 2);
});

test("F-07 a live failure or malformed page rejects with no static fallback", async () => {
  for (const pages of [{ th: [new Error("NETWORK_ERROR")], en: [{ items: [], total: 0, total_pages: 0 }] },
    { th: [{ items: "x", total_pages: 1 }], en: [{ items: [], total: 0, total_pages: 0 }] }]) {
    const { api } = loadModule(null, false, fakeLiveApi(pages));
    await assert.rejects(api.loadPlaces());
  }
  const { api } = loadModule();
  await assert.rejects(api.loadPlaces(), /Live place API is unavailable/, "no TakhunApi -> error, never the bundled list");
});

test("F-06 a hidden .button (load more when everything is shown) is really hidden by CSS", () => {
  const css = fs.readFileSync(path.join(root, "public/css/main.css"), "utf8");
  const buttonRule = css.indexOf(".button {");
  const hiddenRule = css.indexOf(".button[hidden] { display: none; }");
  assert.ok(buttonRule !== -1 && hiddenRule > buttonRule, ".button[hidden] must exist after .button so the attribute wins");
  const { api } = loadModule();
  assert.equal(api.paginatePlaces([{ place_id: "A" }], 1).hasMore, false, "1 of 1 shown -> the button gets hidden");
});

test("F-07 zero live places is a valid empty list", async () => {
  const { api } = loadModule(null, false, fakeLiveApi({ th: [{ items: [], total: 0, total_pages: 0 }], en: [{ items: [], total: 0, total_pages: 0 }] }));
  assert.equal((await api.loadPlaces()).length, 0);
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

test("place cards use lazy decorative local media for covered and uncovered IDs", () => {
  assert.match(source, /mediaId:\s*global\.TakhunMedia\.mediaIdFor\("place", place\.place_id\)/);
  assert.match(source, /decorative:\s*true/);
  assert.match(source, /loading:\s*"lazy"/);
  assert.match(source, /sizes:\s*"\(min-width: 900px\) 33vw, \(min-width: 600px\) 50vw, 100vw"/);
  assert.doesNotMatch(source, /renderImage\([\s\S]*?cover_image_url/);
  assert.doesNotMatch(source, /const approved(?:Places|Ids)|new Set\([^)]*BTK-001/, "coverage must stay manifest-owned");
});

Promise.all(pendingTests).then(() => {
  if (!process.exitCode) process.stdout.write("Places behavior verification passed.\n");
});
