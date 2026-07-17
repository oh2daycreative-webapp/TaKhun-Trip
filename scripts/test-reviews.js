"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const controllerPath = path.join(root, "public/js/reviews.js");

assert.equal(
  fs.existsSync(controllerPath),
  true,
  "Public Reviews must have an isolated public/js/reviews.js controller."
);

const context = {
  console,
  URL,
  URLSearchParams,
  Intl,
  Date,
  Number,
  Math,
  Object,
  Array,
  String,
  Promise,
  setTimeout,
  clearTimeout,
  document: { readyState: "loading", addEventListener() {} },
  window: null
};
context.window = context;
vm.runInNewContext(fs.readFileSync(controllerPath, "utf8"), context, { filename: "public/js/reviews.js" });

assert.equal(typeof context.TakhunReviews, "object", "Reviews controller must expose window.TakhunReviews.");
for (const name of ["validatePlaceId", "parseReviewPage", "setState", "normalizeResponse", "parseCreatedAt", "formatReviewDate", "buildMockResponse", "createController"]) {
  assert.equal(typeof context.TakhunReviews[name], "function", `Reviews controller must expose ${name}().`);
}
assert.equal(context.TakhunReviews.PAGE_SIZE, 10, "Reviews UI page size must be 10.");

const reviews = context.TakhunReviews;
const plain = (value) => JSON.parse(JSON.stringify(value));

assert.equal(reviews.validatePlaceId("A"), true);
assert.equal(reviews.validatePlaceId(`A${"b".repeat(99)}`), true, "Backend permits IDs up to 100 characters.");
for (const invalid of ["", `A${"b".repeat(100)}`, "../bad", "has space", null]) {
  assert.equal(reviews.validatePlaceId(invalid), false, `Invalid place ID must be rejected: ${String(invalid)}`);
}

assert.equal(reviews.parseReviewPage("?id=P-1"), 1);
assert.equal(reviews.parseReviewPage("?id=P-1&review_page=3"), 3);
for (const search of ["?review_page=0", "?review_page=-1", "?review_page=1.5", "?review_page=x"]) {
  assert.equal(reviews.parseReviewPage(search), 1, `Invalid review_page must normalize to 1: ${search}`);
}

const mounts = Object.fromEntries(["idle", "loading", "ready", "empty", "error"].map((name) => [name, { hidden: false }]));
for (const state of Object.keys(mounts)) {
  assert.equal(reviews.setState(mounts, state), state);
  assert.deepEqual(Object.entries(mounts).filter(([, mount]) => !mount.hidden).map(([name]) => name), [state]);
}
assert.throws(() => reviews.setState(mounts, "unknown"), /review state/i);

const sourceItem = {
  review_id: "R-1", place_id: "P-1", reviewer_name: "Alice", is_anonymous: false,
  rating: 4, comment: "Safe text", admin_reply: "Thanks", created_at: "2026-07-16 10:20:30",
  status: "approved", approved_by: "SECRET", updated_at: "SECRET", unknown: "SECRET"
};
const source = { items: [sourceItem], summary: { average_rating: 4.4, review_count: 1 }, total: 1 };
const normalized = plain(reviews.normalizeResponse(source, "P-1"));
assert.deepEqual(Object.keys(normalized.items[0]), ["review_id", "place_id", "reviewer_name", "is_anonymous", "rating", "comment", "admin_reply", "created_at"]);
assert.deepEqual(normalized.summary, { average_rating: 4.4, review_count: 1 });
assert.equal(normalized.total, 1);
normalized.items[0].comment = "changed";
assert.equal(sourceItem.comment, "Safe text", "Normalization must not mutate or retain source item objects.");

const anonymous = plain(reviews.normalizeResponse({
  items: [{ ...sourceItem, reviewer_name: "", is_anonymous: true }],
  summary: { average_rating: 4, review_count: 1 }, total: 1
}, "P-1"));
assert.equal(anonymous.items[0].reviewer_name, "");

for (const malformed of [
  null,
  { items: [], summary: { average_rating: 0, review_count: 1 }, total: 0 },
  { items: [], summary: { average_rating: 1, review_count: 0 }, total: 0 },
  { items: [], summary: { average_rating: 6, review_count: 0 }, total: 0 },
  { items: [sourceItem], summary: { average_rating: 0, review_count: 0 }, total: 0 },
  { items: [{ ...sourceItem, rating: 4.5 }], summary: { average_rating: 4.5, review_count: 1 }, total: 1 },
  { items: [{ ...sourceItem, reviewer_name: " ", is_anonymous: false }], summary: { average_rating: 4, review_count: 1 }, total: 1 },
  { items: [{ ...sourceItem, place_id: "OTHER" }], summary: { average_rating: 4, review_count: 1 }, total: 1 }
]) assert.throws(() => reviews.normalizeResponse(malformed, "P-1"), /review response/i);

const mockRows = Array.from({ length: 12 }, (_, index) => ({
  review_id: `MOCK-${index + 1}`, reviewer_name: `Name ${index + 1}`, is_anonymous: false,
  rating: index % 2 ? 4 : 5, comment_th: `ความคิดเห็น ${index + 1}`, admin_reply_th: "",
  created_at: "2026-07-16 10:20:30", status: "approved"
}));
mockRows.push({ ...mockRows[0], review_id: "PENDING", status: "pending" });
const mockPage2 = plain(reviews.buildMockResponse("P-1", mockRows, 2, 10));
assert.equal(mockPage2.items.length, 2);
assert.equal(mockPage2.total, 12);
assert.equal(mockPage2.summary.review_count, 12);
assert.equal(mockPage2.summary.average_rating, 4.5);
assert.deepEqual(Object.keys(mockPage2.items[0]), ["review_id", "place_id", "reviewer_name", "is_anonymous", "rating", "comment", "admin_reply", "created_at"]);

assert.equal(reviews.parseCreatedAt("2024-02-29 23:59:59") instanceof Date, true);
for (const invalid of ["", "2023-02-29 10:00:00", "2026-13-01 00:00:00", "2026-07-16T10:20:30", "2026-07-16 24:00:00"]) {
  assert.equal(reviews.parseCreatedAt(invalid), null, `Malformed review date must be omitted: ${invalid}`);
}
assert.match(reviews.formatReviewDate("2026-07-16 10:20:30", "en"), /2026/);
assert.match(reviews.formatReviewDate("2026-07-16 10:20:30", "th"), /2569/);
assert.equal(reviews.formatReviewDate("bad", "th"), "");

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.hidden = false;
    this.disabled = false;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = "";
    this.className = "";
    this.focusCount = 0;
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; this.textContent = ""; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type) { this.listeners.delete(type); }
  click() { return this.listeners.get("click")?.({ preventDefault() {} }); }
  focus() { this.focusCount += 1; }
}

function allText(node) {
  return `${node?.textContent || ""}${(node?.children || []).map(allText).join("")}`;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function response(placeId, options = {}) {
  const items = options.items === undefined ? [{
    review_id: "R-1", place_id: placeId, reviewer_name: "Secret Name", is_anonymous: true,
    rating: 4, comment: "<b>literal review</b>", admin_reply: "Official reply", created_at: "2026-07-16 10:20:30"
  }] : options.items;
  const total = options.total ?? items.length;
  return { items, summary: { average_rating: options.average ?? (total ? 4.2 : 0), review_count: total }, total };
}

function makeHarness(options = {}) {
  const mounts = Object.fromEntries(["idle", "loading", "ready", "empty", "error"].map((name) => [name, new FakeElement()]));
  const elements = {
    summary: new FakeElement(), list: new FakeElement(), pagination: new FakeElement("nav"),
    previous: new FakeElement("button"), next: new FakeElement("button"), retry: new FakeElement("button"),
    indicator: new FakeElement(), heading: new FakeElement("h2")
  };
  const location = { href: `https://example.test/place-detail.html${options.search || "?id=P-1"}`, search: options.search || "?id=P-1", pathname: "/place-detail.html" };
  const historyCalls = [];
  function updateLocation(url) { const parsed = new URL(url, location.href); location.href = parsed.href; location.search = parsed.search; }
  const history = {
    pushState(_state, _title, url) { historyCalls.push(["push", String(url)]); updateLocation(url); },
    replaceState(_state, _title, url) { historyCalls.push(["replace", String(url)]); updateLocation(url); }
  };
  const calls = [];
  const api = options.api || { async getReviews(placeId, params, config) { calls.push({ placeId, params, config }); return response(placeId, options.response); } };
  let lang = "th";
  const messages = {
    "place_detail.anonymous_reviewer": { th: "นักท่องเที่ยว", en: "Traveler" },
    "place_detail.review_rating_label": { th: "ให้คะแนน {rating} จาก 5 ดาว", en: "Rated {rating} out of 5 stars" },
    "place_detail.review_admin_reply": { th: "คำตอบจากผู้ดูแล", en: "Admin reply" },
    "place_detail.review_summary_full": { th: "{average}/5 จาก {count} รีวิว", en: "{average}/5 from {count} reviews" },
    "place_detail.review_page_indicator": { th: "หน้า {page} จาก {pages}", en: "Page {page} of {pages}" },
    "place_detail.review_previous": { th: "ก่อนหน้า", en: "Previous" },
    "place_detail.review_next": { th: "ถัดไป", en: "Next" },
    "place_detail.review_previous_label": { th: "ไปหน้ารีวิวก่อนหน้า", en: "Go to previous review page" },
    "place_detail.review_next_label": { th: "ไปหน้ารีวิวถัดไป", en: "Go to next review page" }
  };
  const i18n = { getCurrentLang: () => lang, setLang(value) { lang = value; }, t(key) { return messages[key]?.[lang] || key; } };
  const controller = reviews.createController({
    api, i18n, document: { createElement: (tag) => new FakeElement(tag) }, location, history,
    mounts, elements, onSummary: options.onSummary || (() => {}), getMockRows: options.getMockRows || (() => [])
  });
  return { controller, mounts, elements, location, historyCalls, calls, i18n };
}

async function runLifecycleTests() {
  {
    const summaryEvents = [];
    const harness = makeHarness({ onSummary: (summary) => summaryEvents.push(summary) });
    const loaded = harness.controller.setPlace({ place_id: "P-1", reviews: [] });
    assert.equal(harness.mounts.loading.hidden, false, "Place ready must enter independent reviews-loading.");
    await loaded;
    assert.deepEqual(plain(harness.calls.map(({ placeId, params }) => ({ placeId, params }))), [{ placeId: "P-1", params: { page: 1, page_size: 10 } }]);
    assert.equal(harness.mounts.ready.hidden, false);
    assert.equal(summaryEvents[0], null, "A new request must clear stale summary first.");
    assert.deepEqual(plain(summaryEvents.at(-1)), { average_rating: 4.2, review_count: 1 });
    assert.match(allText(harness.elements.list), /<b>literal review<\/b>/, "Review text must remain literal text content.");
    assert.doesNotMatch(allText(harness.elements.list), /Secret Name/, "Anonymous reviews must not expose reviewer_name.");
    assert.match(allText(harness.elements.list), /นักท่องเที่ยว/);
    assert.match(allText(harness.elements.list), /★★★★☆/);
    assert.match(allText(harness.elements.list), /4\/5/);
    assert.match(allText(harness.elements.list), /คำตอบจากผู้ดูแลOfficial reply/);
    const rating = harness.elements.list.children[0].children[0].children[1];
    assert.equal(rating.getAttribute("aria-label"), "ให้คะแนน 4 จาก 5 ดาว");
  }

  {
    const pageResponses = new Map([
      [1, response("P-1", { total: 21, average: 4.6 })],
      [2, response("P-1", { total: 21, average: 4.6 })]
    ]);
    const harness = makeHarness({ api: { async getReviews(placeId, params) { harness.calls.push({ placeId, params }); return pageResponses.get(params.page); } } });
    await harness.controller.setPlace({ place_id: "P-1", reviews: [] });
    assert.equal(harness.elements.pagination.hidden, false);
    assert.equal(harness.elements.previous.disabled, true);
    assert.equal(harness.elements.next.disabled, false);
    assert.equal(harness.elements.indicator.textContent, "หน้า 1 จาก 3");
    await harness.elements.next.click();
    assert.deepEqual(harness.calls.map((call) => call.params.page), [1, 2]);
    assert.match(harness.historyCalls.at(-1)[1], /review_page=2/);
    assert.equal(harness.elements.heading.focusCount, 1, "Page changes must focus the reviews heading after success.");
  }

  {
    const harness = makeHarness({
      search: "?id=P-1&review_page=5&keep=safe",
      api: { async getReviews(placeId, params) { harness.calls.push({ placeId, params }); return params.page === 5 ? response(placeId, { items: [], total: 12, average: 4.5 }) : response(placeId, { total: 12, average: 4.5 }); } }
    });
    await harness.controller.setPlace({ place_id: "P-1", reviews: [] });
    assert.deepEqual(harness.calls.map((call) => call.params.page), [5, 2], "Out-of-range pages must reload the last valid page once.");
    assert.equal(harness.historyCalls.filter(([mode]) => mode === "replace").length, 1);
    assert.match(harness.location.search, /review_page=2/);
    assert.match(harness.location.search, /keep=safe/);
  }

  {
    const pending = deferred();
    const harness = makeHarness({ api: { getReviews(placeId, params) { harness.calls.push({ placeId, params }); return pending.promise; } } });
    const first = harness.controller.setPlace({ place_id: "P-1", reviews: [] });
    const retry = harness.controller.retry();
    assert.equal(first, retry, "Retry while pending must return the deduplicated in-flight Promise.");
    assert.equal(harness.calls.length, 1);
    pending.resolve(response("P-1"));
    await first;
  }

  {
    const first = deferred();
    const summaryEvents = [];
    const harness = makeHarness({
      onSummary: (summary) => summaryEvents.push(summary),
      api: { getReviews(placeId, params) { harness.calls.push({ placeId, params }); return placeId === "P-1" ? first.promise : Promise.resolve(response("P-2", { average: 5 })); } }
    });
    const stale = harness.controller.setPlace({ place_id: "P-1", reviews: [] });
    await harness.controller.setPlace({ place_id: "P-2", reviews: [] });
    first.resolve(response("P-1", { average: 1 }));
    await stale;
    assert.deepEqual(plain(summaryEvents.at(-1)), { average_rating: 5, review_count: 1 }, "Stale responses must not replace the current place model.");
  }

  {
    const harness = makeHarness();
    await harness.controller.setPlace({ place_id: "P-1", reviews: [] });
    const calls = harness.calls.length;
    const focus = harness.elements.heading.focusCount;
    harness.i18n.setLang("en");
    harness.controller.handleLanguageChange();
    assert.equal(harness.calls.length, calls, "Language changes must re-render cached reviews without refetching.");
    assert.equal(harness.elements.heading.focusCount, focus, "Language changes must not steal focus.");
    assert.match(allText(harness.elements.list), /Traveler/);
    assert.equal(harness.elements.indicator.textContent, "Page 1 of 1");
  }

  {
    const harness = makeHarness({ search: "?id=bad%20id&review_page=2" });
    await harness.controller.setPlace({ place_id: "bad id", reviews: [] });
    assert.equal(harness.calls.length, 0, "Invalid places must keep reviews idle without calling the API.");
    assert.equal(harness.mounts.idle.hidden, false);
  }

  {
    let attempts = 0;
    const harness = makeHarness({ api: { async getReviews(placeId) { attempts += 1; if (attempts === 1) throw new Error("secret raw API error"); return response(placeId); } } });
    await harness.controller.setPlace({ place_id: "P-1", reviews: [] });
    assert.equal(harness.mounts.error.hidden, false);
    const beforeUrl = harness.location.href;
    await harness.elements.retry.click();
    assert.equal(attempts, 2);
    assert.equal(harness.mounts.ready.hidden, false);
    assert.equal(harness.location.href, beforeUrl, "Retry must not change the URL.");
    assert.equal(harness.elements.heading.focusCount, 1, "Successful retry must focus the Reviews heading.");
  }

  {
    const harness = makeHarness({ response: { items: [], total: 12, average: 4.5 } });
    await harness.controller.setPlace({ place_id: "P-1", reviews: [] });
    assert.equal(harness.mounts.error.hidden, false, "An empty in-range page with a positive total is malformed.");
  }
}

runLifecycleTests().then(
  () => process.stdout.write("Public Reviews controller verification passed.\n"),
  (error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
);
