"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/js/events.js"), "utf8");
const i18nSource = fs.readFileSync(path.join(__dirname, "../public/js/i18n.js"), "utf8");

function loadEvents(search = "") {
  const context = {
    URL, URLSearchParams, Intl, console,
    document: { readyState: "loading", addEventListener() {}, querySelector() { return null; } },
    location: { href: "https://example.test/events.html", pathname: "/events.html", search },
    window: null
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "events.js" });
  return context.TakhunEvents;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function isoOffset(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function loadEventsController() {
  class FakeNode {
    constructor() { this.hidden = false; this.value = ""; this.children = []; this.listeners = {}; this.textContent = ""; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    replaceChildren(...children) { this.children = children; }
    append(...children) { this.children.push(...children); }
    setAttribute(name, value) { this[name] = value; }
    querySelector(selector) { return this.queries?.[selector] || null; }
  }
  const selectors = [
    ".events-page", "[data-events-loading]", "[data-events-ready]", "[data-events-empty]",
    "[data-events-filtered-empty]", "[data-events-invalid-filter]", "[data-events-error]",
    "[data-events-filter-form]", "[data-events-summary]", "[data-events-upcoming-count]", "[data-events-past-count]", "[data-events-featured-section]",
    "[data-events-featured]", "[data-events-past-section]", "[data-events-grid]",
    "[data-events-demo-notice]", "[data-events-retry]"
  ];
  const nodes = Object.fromEntries(selectors.map((selector) => [selector, new FakeNode()]));
  const type = new FakeNode();
  const month = new FakeNode();
  nodes["[data-events-filter-form]"].queries = {
    '[data-event-filter="type"]': type,
    '[data-event-filter="month"]': month
  };
  const clear = new FakeNode();
  const document = {
    readyState: "complete", listeners: {},
    querySelector(selector) { return nodes[selector] || null; },
    querySelectorAll(selector) { return selector === "[data-events-clear]" ? [clear] : []; },
    createElement() { return new FakeNode(); },
    createTextNode(text) { const node = new FakeNode(); node.textContent = text; return node; },
    addEventListener(typeName, listener) { this.listeners[typeName] = listener; }
  };
  const requests = [];
  const urls = [];
  let lang = "th";
  const context = {
    URL, URLSearchParams, Intl, console, document,
    location: { href: "https://example.test/events.html", pathname: "/events.html", search: "" },
    history: { replaceState(_state, _title, url) { urls.push(url); } },
    APP_CONFIG: { API_URL: "https://api.example/exec" },
    TakhunI18n: {
      t(key) {
        if (key === "events.section_count_one") return lang === "en" ? "{count} event found" : "พบ {count} กิจกรรม";
        if (key === "events.section_count_many") return lang === "en" ? "{count} events found" : "พบ {count} กิจกรรม";
        return key;
      },
      getCurrentLang() { return lang; },
      applyTranslations() {}
    },
    TakhunApi: { getEvents(params) { const request = deferred(); requests.push({ params: JSON.parse(JSON.stringify(params)), request }); return request.promise; } },
    window: null
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "events.js" });
  return { nodes, type, clear, document, form: nodes["[data-events-filter-form]"], requests, urls, setLang(value) { lang = value; } };
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }

const api = loadEvents();
const helpers = [
  "parseEventId", "validateEventId", "parseEventFilters", "filterEvents", "normalizeEventList",
  "normalizeEventDetail", "localized", "normalizeBoolean", "parseDateParts", "formatEventDate",
  "formatTimeRange", "classifyEvent", "sortEvents", "safePhoneHref", "safeExternalUrl",
  "eventDetailUrl", "relatedPlaceUrl", "mapUrl", "resolveListState", "resolveDetailState",
  "setPageState", "mockGetEvents", "mockGetEventDetail", "createRequestGate", "filtersUrl",
  "partitionEvents", "callActionLabel"
];
for (const name of helpers) assert.equal(typeof api[name], "function", `missing helper ${name}`);

assert.equal(api.parseEventId("?id=%20EVT-001%20"), "EVT-001");
for (const id of ["EVT-001", "event_2", "A1"]) assert.equal(api.validateEventId(id), true, id);
for (const id of ["", "   ", "bad id", "../bad", "<script>", "javascript:alert(1)", "A/B"]) assert.equal(api.validateEventId(id), false, id);

{
  const parsed = api.parseEventFilters("?type=festival&month=2026-08&ignored=x");
  assert.deepEqual(plain(parsed.filters), { type: "festival", month: "2026-08" });
  assert.deepEqual(plain(parsed.invalid), []);
  const invalid = api.parseEventFilters("?type=unknown&month=2026-13");
  assert.deepEqual(plain(invalid.filters), {});
  assert.deepEqual(plain(invalid.invalid), ["type", "month"]);
}

{
  const gate = api.createRequestGate();
  const first = gate.begin();
  assert.equal(gate.isCurrent(first), true);
  const second = gate.begin();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
}

assert.equal(api.filtersUrl("/events.html", {}), "/events.html");
assert.equal(api.filtersUrl("/events.html", { type: "community_market", month: "2026-08" }), "/events.html?type=community_market&month=2026-08");

{
  const records = [
    { event_id: "CURRENT", event_date: "2026-07-13" },
    { event_id: "UPCOMING", event_date: "2026-07-14" },
    { event_id: "PAST", event_date: "2026-07-12" }
  ];
  const snapshot = JSON.stringify(records);
  const groups = api.partitionEvents(records, new Date(2026, 6, 13, 12));
  assert.deepEqual(plain(groups.upcoming.map((event) => event.event_id)), ["CURRENT", "UPCOMING"]);
  assert.deepEqual(plain(groups.past.map((event) => event.event_id)), ["PAST"]);
  assert.equal(new Set([...groups.upcoming, ...groups.past]).size, records.length);
  assert.equal(JSON.stringify(records), snapshot);
  assert.throws(() => api.partitionEvents([{ event_id: "BAD", event_date: "bad" }], new Date(2026, 6, 13, 12)), /MALFORMED_RESPONSE/);
}

{
  const events = [
    { event_id: "E-1", event_type: "festival", event_date: "2026-08-01" },
    { event_id: "E-2", event_type: "learning", event_date: "2026-09-01" }
  ];
  const snapshot = JSON.stringify(events);
  assert.deepEqual(plain(api.filterEvents(events, { type: "festival" }).map((event) => event.event_id)), ["E-1"]);
  assert.deepEqual(plain(api.filterEvents(events, { month: "2026-09" }).map((event) => event.event_id)), ["E-2"]);
  assert.deepEqual(plain(api.filterEvents(events, { type: "festival", month: "2026-08" }).map((event) => event.event_id)), ["E-1"]);
  assert.equal(api.filterEvents(events, { type: "otop" }).length, 0);
  assert.equal(JSON.stringify(events), snapshot);
}

{
  const normalized = api.normalizeEventList({ items: [
    { event_id: "EVT-001", status: "published", event_date: "2026-08-01" },
    { event_id: "EVT-002", status: "draft", event_date: "2026-08-02" }
  ], total: 2 });
  assert.deepEqual(plain(normalized.items.map((event) => event.event_id)), ["EVT-001"]);
  assert.throws(() => api.normalizeEventList({ items: "bad" }), /MALFORMED_RESPONSE/);
  assert.throws(() => api.normalizeEventList({ items: [{}] }), /MALFORMED_RESPONSE/);
  assert.equal(api.normalizeEventDetail(null), null);
  assert.equal(api.normalizeEventDetail({ event_id: "EVT-001", event_date: "2026-08-01" }).event_id, "EVT-001");
  assert.throws(() => api.normalizeEventList({ items: [{ event_id: "EVT-003", event_date: "bad" }] }), /MALFORMED_RESPONSE/);
  assert.throws(() => api.normalizeEventDetail({ event_id: "EVT-003" }), /MALFORMED_RESPONSE/);
}

assert.equal(api.localized({ title_th: "งานไทย", title_en: "English" }, "title", "en"), "English");
assert.equal(api.localized({ title_th: "งานไทย", title_en: "" }, "title", "en"), "งานไทย");
assert.equal(api.localized({ title: "API localized" }, "title", "en"), "API localized");
for (const value of [true, 1, "1", "true", "TRUE"]) assert.equal(api.normalizeBoolean(value), true);
for (const value of [false, 0, "0", "false", "", null, undefined]) assert.equal(api.normalizeBoolean(value), false);

assert.deepEqual(plain(api.parseDateParts("2026-08-01")), { year: 2026, month: 8, day: 1, iso: "2026-08-01" });
for (const value of ["", "01/08/2026", "2026-02-30", "2026-13-01", "2026-8-1", null]) assert.equal(api.parseDateParts(value), null);
for (const lang of ["th", "en"]) {
  const formatted = api.formatEventDate("2026-08-01", lang);
  assert.ok(formatted && !/Invalid Date|NaN|undefined|null/.test(formatted));
}
assert.equal(api.formatEventDate("bad", "th"), "");
assert.equal(api.formatTimeRange("10:00", "16:00"), "10:00–16:00");
assert.equal(api.formatTimeRange("10:00", ""), "10:00");
assert.equal(api.formatTimeRange("", ""), "");
assert.equal(api.formatTimeRange("99:00", "16:00"), "");

const today = new Date(2026, 6, 13, 12, 0, 0);
assert.equal(api.classifyEvent({ event_date: "2026-07-13" }, today), "current");
assert.equal(api.classifyEvent({ event_date: "2026-07-14" }, today), "upcoming");
assert.equal(api.classifyEvent({ event_date: "2026-07-12" }, today), "past");
assert.equal(api.classifyEvent({ event_date: "bad" }, today), "unknown");

{
  const events = [
    { event_id: "PAST", event_date: "2026-07-01" },
    { event_id: "UP-2", event_date: "2026-08-02" },
    { event_id: "TODAY", event_date: "2026-07-13" },
    { event_id: "UP-1", event_date: "2026-08-01", is_featured: "false" },
    { event_id: "UP-1B", event_date: "2026-08-01", is_featured: "true" }
  ];
  const snapshot = JSON.stringify(events);
  assert.deepEqual(plain(api.sortEvents(events, today).map((event) => event.event_id)), ["TODAY", "UP-1B", "UP-1", "UP-2", "PAST"]);
  assert.equal(JSON.stringify(events), snapshot);
}

assert.equal(api.safePhoneHref("+66 (0)81-234-5678"), "tel:+660812345678");
assert.equal(api.callActionLabel("081 234 5678", "โทร"), "โทร 081 234 5678");
assert.equal(api.callActionLabel("javascript:alert(1)", "โทร"), "");
for (const value of ["", "123", "081abc", "javascript:alert(1)"]) assert.equal(api.safePhoneHref(value), "");
assert.equal(api.safeExternalUrl("https://example.com/register"), "https://example.com/register");
assert.equal(api.safeExternalUrl("http://example.com/register"), "http://example.com/register");
for (const value of ["javascript:alert(1)", "data:text/html,hi", "ftp://example.com", "/relative"]) assert.equal(api.safeExternalUrl(value), "");
assert.equal(api.eventDetailUrl("EVT A/B"), "event-detail.html?id=EVT%20A%2FB");
assert.equal(api.relatedPlaceUrl("BTK A/B"), "place-detail.html?id=BTK%20A%2FB");
assert.equal(api.mapUrl({ google_maps_url: "https://maps.example/place" }), "https://maps.example/place");
assert.equal(api.mapUrl({ latitude: "8.987654", longitude: "98.765432" }), "https://www.google.com/maps/search/?api=1&query=8.987654%2C98.765432");
assert.equal(api.mapUrl({ related_place_id: "BTK-004" }), "map.html?focus=BTK-004");
assert.equal(api.mapUrl({ google_maps_url: "javascript:bad" }), "");

for (const [input, expected] of [
  [{ loading: true }, "loading"], [{ error: true }, "error"], [{ invalidFilter: true }, "invalid-filter"],
  [{ items: [] }, "empty"], [{ items: [], filtered: true }, "filtered-empty"], [{ items: [{}] }, "ready"]
]) assert.equal(api.resolveListState(input), expected);
for (const [input, expected] of [
  [{ idState: "missing" }, "missing-id"], [{ idState: "invalid" }, "invalid-id"],
  [{ loading: true }, "loading"], [{ error: true }, "error"], [{ event: null }, "not-found"],
  [{ event: { event_id: "E-1" } }, "ready"]
]) assert.equal(api.resolveDetailState(input), expected);

{
  const names = ["loading", "ready", "empty", "filtered-empty", "invalid-filter", "error"];
  const states = Object.fromEntries(names.map((name) => [name, { hidden: false }]));
  for (const active of names) {
    assert.equal(api.setPageState(states, active), true);
    assert.equal(Object.values(states).filter((state) => !state.hidden).length, 1);
  }
}

{
  const all = api.mockGetEvents({ status: "all" }).items;
  assert.ok(all.some((event) => api.classifyEvent(event, new Date()) === "current"));
  assert.ok(all.some((event) => api.classifyEvent(event, new Date()) === "upcoming"));
  assert.ok(all.some((event) => !event.start_time && !event.end_time));
  assert.ok(all.some((event) => api.safeExternalUrl(event.register_url)));
  assert.ok(all.some((event) => !api.safeExternalUrl(event.register_url)));
  assert.ok(all.some((event) => event.related_place_id));
  assert.ok(all.some((event) => !event.related_place_id));
  assert.equal(api.mockGetEventDetail("MOCK-EVT-404"), null);
}

{
  const context = { window: null };
  context.window = context;
  vm.runInNewContext(i18nSource, context, { filename: "i18n.js" });
  const keys = [
    "events.heading", "events.intro", "events.upcoming", "events.all", "events.event_type", "events.month",
    "events.filters", "events.clear_filters", "events.date", "events.time", "events.venue", "events.view_details",
    "events.loading", "events.empty_title", "events.filtered_empty_title", "events.invalid_filter_title", "events.error_title",
    "events.retry", "events.today", "events.upcoming_status", "events.past", "events.section_count_one", "events.section_count_many", "event_detail.heading", "event_detail.loading",
    "event_detail.invalid_title", "event_detail.missing_title", "event_detail.not_found_title", "event_detail.error_title",
    "event_detail.contact", "event_detail.call", "event_detail.register", "event_detail.navigate", "event_detail.related_place",
    "event_detail.view_related_place", "event_detail.no_registration", "event_detail.no_contact"
  ];
  for (const lang of ["th", "en"]) {
    context.TakhunI18n.setCurrentLang(lang);
    for (const key of keys) assert.notEqual(context.TakhunI18n.t(key), key, `${key} missing in ${lang}`);
  }
}

async function testControllerOrchestration() {
  const harness = loadEventsController();
  assert.equal(harness.requests.length, 1);
  assert.deepEqual(harness.requests[0].params, { status: "all", lang: "th" });

  const full = [
    { event_id: "CURRENT", event_date: isoOffset(0), status: "published" },
    { event_id: "UPCOMING-1", event_date: isoOffset(1), status: "published" },
    { event_id: "UPCOMING-2", event_date: isoOffset(2), status: "published" },
    { event_id: "PAST", event_date: isoOffset(-1), status: "published" }
  ];
  harness.requests[0].request.resolve({ items: full, total: 4 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.nodes["[data-events-upcoming-count]"].textContent, "พบ 3 กิจกรรม");
  assert.equal(harness.nodes["[data-events-past-count]"].textContent, "พบ 1 กิจกรรม");
  assert.equal(harness.nodes["[data-events-featured]"].children.length, 3);
  assert.equal(harness.nodes["[data-events-grid]"].children.length, 1);

  const callsBeforeLanguageChange = harness.requests.length;
  harness.setLang("en");
  harness.document.listeners["takhun:languagechange"]();
  assert.equal(harness.requests.length, callsBeforeLanguageChange);
  assert.equal(harness.nodes["[data-events-upcoming-count]"].textContent, "3 events found");
  assert.equal(harness.nodes["[data-events-past-count]"].textContent, "1 event found");

  harness.type.value = "festival";
  harness.form.listeners.submit({ preventDefault() {} });
  assert.equal(harness.requests.length, 2);
  assert.equal(harness.requests[1].params.type, "festival");
  assert.equal(harness.urls.at(-1), "/events.html?type=festival");

  harness.setLang("th");
  harness.document.listeners["takhun:languagechange"]();
  assert.equal(harness.requests.length, 2);
  assert.equal(harness.nodes["[data-events-loading]"].hidden, false);
  assert.equal(harness.nodes["[data-events-ready]"].hidden, true);
  harness.requests[1].request.resolve({ items: [full[1]], total: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.nodes["[data-events-upcoming-count]"].textContent, "พบ 1 กิจกรรม");
  assert.equal(harness.nodes["[data-events-past-count]"].textContent, "");

  harness.type.value = "otop";
  harness.form.listeners.submit({ preventDefault() {} });
  harness.requests[2].request.resolve({ items: [full[3]], total: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.nodes["[data-events-upcoming-count]"].textContent, "");
  assert.equal(harness.nodes["[data-events-featured-section]"].hidden, true);
  assert.equal(harness.nodes["[data-events-past-count]"].textContent, "พบ 1 กิจกรรม");

  harness.type.value = "festival";
  harness.form.listeners.submit({ preventDefault() {} });
  harness.type.value = "other";
  harness.form.listeners.submit({ preventDefault() {} });
  harness.requests[4].request.resolve({ items: [], total: 0 });
  await new Promise((resolve) => setImmediate(resolve));
  harness.requests[3].request.reject(new Error("stale failure"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.nodes["[data-events-error]"].hidden, true);
  assert.equal(harness.nodes["[data-events-filtered-empty]"].hidden, false);
  assert.equal(harness.nodes["[data-events-upcoming-count]"].textContent, "");
  assert.equal(harness.nodes["[data-events-past-count]"].textContent, "");

  harness.clear.listeners.click();
  assert.equal(harness.requests.length, 6);
  assert.deepEqual(harness.requests[5].params, { status: "all", lang: "th" });
  assert.equal(harness.urls.at(-1), "/events.html");
  harness.requests[5].request.resolve({ items: full, total: 4 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.nodes["[data-events-upcoming-count]"].textContent, "พบ 3 กิจกรรม");
  assert.equal(harness.nodes["[data-events-past-count]"].textContent, "พบ 1 กิจกรรม");
}

testControllerOrchestration().then(() => process.stdout.write("Events behavior verification passed.\n"), (error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
