"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourcePath = path.join(__dirname, "../public/js/search.js");
assert.equal(fs.existsSync(sourcePath), true, "RED: missing public/js/search.js");
const source = fs.readFileSync(sourcePath, "utf8");

function loadSearch() {
  const context = {
    URL, URLSearchParams, Intl, console,
    document: { readyState: "loading", addEventListener() {}, querySelector() { return null; } },
    location: { pathname: "/search.html", search: "", href: "https://example.test/search.html" },
    history: { pushState() {}, replaceState() {} },
    window: null
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "search.js" });
  return context.TakhunSearch;
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const api = loadSearch();

for (const name of [
  "normalizeQuery", "parseSearchQuery", "validateQuery", "searchUrl", "writeSearchHistory",
  "normalizeSearchResponse", "shownCount", "resultCountKind", "detailUrl", "safeImageUrl",
  "parseDateParts", "formatEventDate", "formatTimeRange", "resolvePrimaryState", "setPrimaryState",
  "createSearchController"
]) assert.equal(typeof api[name], "function", `RED: TakhunSearch.${name} is undefined`);

assert.equal(api.normalizeQuery("  Cafe\u0301  \n  Lake  "), "Café Lake");
assert.equal(api.normalizeQuery(null), "");
assert.equal(api.normalizeQuery({ toString() { throw new Error("secret"); } }), "");
assert.equal(api.parseSearchQuery("?q=%20น้ำผึ้ง%20%20ป่า&keyword=ignored"), "น้ำผึ้ง ป่า");
assert.equal(api.parseSearchQuery("?keyword=ignored"), "");
assert.deepEqual(plain(api.validateQuery("")), { valid: false, reason: "required", query: "" });
assert.deepEqual(plain(api.validateQuery("😀".repeat(100))), { valid: true, reason: "", query: "😀".repeat(100) });
assert.deepEqual(plain(api.validateQuery("😀".repeat(101))), { valid: false, reason: "too-long", query: "😀".repeat(101) });
assert.equal(api.searchUrl("/search.html", " น้ำผึ้ง  ป่า "), "/search.html?q=%E0%B8%99%E0%B9%89%E0%B8%B3%E0%B8%9C%E0%B8%B6%E0%B9%89%E0%B8%87+%E0%B8%9B%E0%B9%88%E0%B8%B2");
assert.equal(api.searchUrl("/search.html", ""), "/search.html");

{
  const calls = [];
  const history = { pushState(...args) { calls.push(["push", ...args]); }, replaceState(...args) { calls.push(["replace", ...args]); } };
  api.writeSearchHistory(history, "/search.html", " lake ", "push");
  api.writeSearchHistory(history, "/search.html", "", "replace");
  assert.deepEqual(plain(calls), [
    ["push", {}, "", "/search.html?q=lake"],
    ["replace", {}, "", "/search.html"]
  ]);
}

const response = {
  places: [{ place_id: "P/1", name: "Lake", short_description: "Still water", category: "nature", district: "ban_ta_khun", cover_image_url: "https://cdn.example/p.jpg" }],
  products: [{ product_id: "PR 1", name: "Honey", description: "Forest honey", category: "honey", producer_name: "Community", image_url: "" }],
  events: [{ event_id: "E#1", title: "Fair", event_type: "festival", event_date: "2026-07-16", start_time: "09:05", end_time: "10:30", location: "Market", image_url: "https://cdn.example/e.jpg" }],
  routes: [{ route_id: "R?1", name: "Loop", short_description: "One day", duration: "1 day", travel_style: ["nature", "photo"], cover_image_url: "http://cdn.example/r.jpg" }],
  total: 8
};

{
  const snapshot = JSON.stringify(response);
  const normalized = plain(api.normalizeSearchResponse(response));
  assert.equal(JSON.stringify(response), snapshot, "normalization must not mutate API data");
  assert.notEqual(normalized.places, response.places);
  assert.notEqual(normalized.routes[0].travel_style, response.routes[0].travel_style);
  assert.equal(api.shownCount(normalized), 4);
  assert.equal(api.resultCountKind(normalized), "limited");
  normalized.total = 4;
  assert.equal(api.resultCountKind(normalized), "exact");
}

for (const malformed of [
  null,
  { places: [], products: [], events: [], routes: [] },
  { places: [], products: [], events: [], routes: [], total: -1 },
  { places: [], products: [], events: [], routes: [], total: 0, extra: true },
  { places: [{ place_id: "P", name: "Name", short_description: "", category: "", district: "" }], products: [], events: [], routes: [], total: 1 },
  { places: [], products: [], events: [], routes: [{ route_id: "R", name: "Route", short_description: "", duration: "", travel_style: "nature", cover_image_url: "" }], total: 1 }
]) assert.throws(() => api.normalizeSearchResponse(malformed), (error) => error?.code === "MALFORMED_RESPONSE");

{
  const invalidDate = plain(response);
  invalidDate.events[0].event_date = "2026-02-30";
  invalidDate.total = 4;
  const normalized = plain(api.normalizeSearchResponse(invalidDate));
  assert.deepEqual(normalized.events, [], "invalid calendar-date events must not render");
  assert.equal(normalized.total, 4);
}

assert.equal(api.detailUrl("places", "P/1"), "place-detail.html?id=P%2F1");
assert.equal(api.detailUrl("routes", "R?1"), "route-detail.html?id=R%3F1");
assert.equal(api.detailUrl("products", "PR 1"), "product-detail.html?id=PR%201");
assert.equal(api.detailUrl("events", "E#1"), "event-detail.html?id=E%231");
assert.equal(api.detailUrl("unknown", "X"), "");

for (const url of ["https://example.com/a.png", "http://example.com/a.png"]) assert.equal(api.safeImageUrl(url), url);
for (const url of ["javascript:alert(1)", "data:image/png,x", "blob:https://example.com/x", "/relative.png", "image.png", ""]) assert.equal(api.safeImageUrl(url), "");

assert.deepEqual(plain(api.parseDateParts("2024-02-29")), { year: 2024, month: 2, day: 29 });
for (const date of ["2023-02-29", "2026-02-30", "16-07-2026", "2026-7-16", ""]) assert.equal(api.parseDateParts(date), null);
assert.match(api.formatEventDate("2026-07-16", "en"), /2026/);
assert.equal(api.formatEventDate("2026-02-30", "en"), "");
assert.equal(api.formatTimeRange("09:05", ""), "09:05");
assert.equal(api.formatTimeRange("09:05", "10:30"), "09:05–10:30");
for (const invalid of [["9:05", ""], ["24:00", ""], ["09:00", "10:60"], ["", "10:00"]]) assert.equal(api.formatTimeRange(...invalid), "");

for (const state of ["idle", "loading", "ready", "empty", "validation-error", "request-error"]) assert.equal(api.resolvePrimaryState(state), state);
assert.equal(api.resolvePrimaryState("unknown"), "request-error");
{
  const elements = Object.fromEntries(["idle", "loading", "ready", "empty", "validation-error", "request-error"].map((key) => [key, { hidden: false }]));
  assert.equal(api.setPrimaryState(elements, "ready"), true);
  assert.equal(Object.entries(elements).filter(([, value]) => !value.hidden).map(([key]) => key).join(""), "ready");
  assert.equal(api.setPrimaryState(elements, "bad"), false);
}

async function controllerTests() {
  {
    const calls = [];
    const states = [];
    const controller = api.createSearchController({
      request: async (params) => { calls.push(plain(params)); return response; },
      getLanguage: () => "en",
      onChange: (snapshot) => states.push(plain(snapshot))
    });
    assert.equal(controller.getSnapshot().state, "idle");
    await controller.load("  lake  ", { reason: "submit" });
    assert.deepEqual(calls, [{ keyword: "lake", lang: "en" }]);
    assert.equal(controller.getSnapshot().state, "ready");
    assert.equal(controller.getSnapshot().query, "lake");
    assert.equal(controller.getSnapshot().focusTarget, "results");
    assert.ok(states.some((state) => state.state === "loading"));
  }

  {
    let calls = 0;
    const controller = api.createSearchController({ request: async () => { calls += 1; return response; } });
    await controller.load("   ", { reason: "submit" });
    assert.equal(calls, 0);
    assert.equal(controller.getSnapshot().state, "validation-error");
    assert.equal(controller.getSnapshot().validationReason, "required");
    assert.equal(controller.getSnapshot().focusTarget, "error");
    await controller.load("😀".repeat(101), { reason: "submit" });
    assert.equal(calls, 0);
    assert.equal(controller.getSnapshot().validationReason, "too-long");
  }

  {
    let resolvePending;
    let calls = 0;
    const controller = api.createSearchController({ request: () => { calls += 1; return new Promise((resolve) => { resolvePending = resolve; }); } });
    const first = controller.load("lake", { reason: "initial" });
    const duplicate = controller.load(" lake ", { reason: "submit" });
    await Promise.resolve();
    assert.equal(calls, 1, "same canonical query/lang must deduplicate while pending");
    resolvePending(response);
    await Promise.all([first, duplicate]);
    assert.equal(controller.getSnapshot().focusTarget, "results", "explicit submit must retain focus intent when deduplicated with an initial request");
  }

  {
    const pending = [];
    const controller = api.createSearchController({ request: (params) => new Promise((resolve) => pending.push({ params, resolve })) });
    const oldLoad = controller.load("old", { reason: "initial" });
    const newLoad = controller.load("new", { reason: "submit" });
    await Promise.resolve();
    pending[1].resolve({ places: [], products: [], events: [], routes: [], total: 0 });
    await newLoad;
    pending[0].resolve(response);
    await oldLoad;
    assert.equal(controller.getSnapshot().query, "new");
    assert.equal(controller.getSnapshot().state, "empty", "stale response must not overwrite current state");
  }

  {
    let lang = "th";
    let calls = 0;
    const controller = api.createSearchController({
      request: async () => { calls += 1; if (calls === 1) throw new Error("secret internal detail"); return response; },
      getLanguage: () => lang
    });
    await controller.load("lake", { reason: "initial" });
    assert.equal(controller.getSnapshot().state, "request-error");
    assert.equal(JSON.stringify(controller.getSnapshot()).includes("secret"), false);
    await controller.retry();
    assert.equal(calls, 2, "retry must create a new request");
    lang = "en";
    await controller.languageChanged();
    assert.equal(calls, 3, "language change with a valid query must refetch");
    assert.equal(controller.getSnapshot().focusTarget, "", "language refetch must not steal focus");
  }

  {
    let calls = 0;
    const controller = api.createSearchController({ request: async () => { calls += 1; return response; } });
    await controller.load("", { reason: "idle" });
    await controller.languageChanged();
    assert.equal(calls, 0, "idle/validation state must not refetch on language change");
    assert.equal(controller.getSnapshot().state, "idle");
  }

  {
    let calls = 0;
    const controller = api.createSearchController({ request: async () => { calls += 1; return response; } });
    await controller.load("😀".repeat(101), { reason: "initial" });
    assert.equal(calls, 0);
    assert.equal(controller.getSnapshot().state, "validation-error", "an invalid deep link must show validation without requesting");
    assert.equal(controller.getSnapshot().focusTarget, "", "an invalid deep link must not steal focus");
  }

  process.stdout.write("Search behavior verification passed.\n");
}

controllerTests().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
