"use strict";
// Reviews switch (owner decision 2026-10-19): the public place page shows the review section and the summary line
// only when the public settings say reviews_enabled === true. Off, missing or a failed settings read hides both and
// never loads reviews.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

// Minimal permissive DOM: any unknown method is a no-op; append/replaceChildren keep children for inspection.
function element(tag = "div") {
  const target = { tagName: String(tag).toUpperCase(), hidden: false, children: [], style: {}, dataset: {}, textContent: "", className: "",
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } } };
  return new Proxy(target, {
    get(t, key) {
      if (key in t) return t[key];
      if (key === "then" || typeof key === "symbol") return undefined;
      if (key === "querySelector") return () => element();
      if (key === "querySelectorAll") return () => [];
      return (...args) => {
        if (key === "replaceChildren") t.children = [];
        if (key === "append" || key === "replaceChildren") t.children.push(...args);
        return undefined;
      };
    },
    set(t, key, value) { t[key] = value; return true; }
  });
}

async function runPage({ settings, settingsError }) {
  const nodes = new Map();
  const node = (selector) => { if (!nodes.has(selector)) nodes.set(selector, element()); return nodes.get(selector); };
  const reviewsSection = node("[data-detail-reviews]");
  reviewsSection.hidden = true; // as in place-detail.html
  const calls = { settings: 0, reviews: [] };
  const place = { place_id: "PLC-1", name_th: "ที่ทดสอบ", short_description_th: "สั้น", category: "nature", district: "phanom" };
  const context = {
    console, URL, URLSearchParams, setTimeout, clearTimeout, Promise,
    document: { readyState: "complete", title: "", querySelector: node, querySelectorAll: () => [], createElement: (tag) => element(tag), addEventListener() {} },
    location: { search: "?id=PLC-1", pathname: "/place-detail.html", href: "https://example.test/place-detail.html?id=PLC-1" },
    history: { back() {} },
    navigator: {},
    localStorage: { getItem() { return null; }, setItem() {} },
    addEventListener() {},
    TakhunI18n: { getCurrentLang: () => "th", pickLangValue: (item, field) => item?.[`${field}_th`] || "", t: (key) => key, format: (key) => key },
    TakhunApi: {
      getPlaceDetail: () => Promise.resolve(place),
      getSettings: () => { calls.settings += 1; return settingsError ? Promise.reject(new Error("NETWORK_ERROR")) : Promise.resolve(settings); }
    },
    TakhunReviews: { createController: (options) => ({
      setPlace: async (value) => { calls.reviews.push(value ? value.place_id : null); if (value) options.onSummary({ review_count: 2, average_rating: 4.5 }); },
      handleLanguageChange() {}, handlePopState() {}
    }) }
  };
  context.window = context;
  vm.runInNewContext(read("public/js/content-data.js"), context, { filename: "content-data.js" });
  vm.runInNewContext(read("public/js/place-data.js"), context, { filename: "place-data.js" });
  vm.runInNewContext(read("public/js/place-detail.js"), context, { filename: "place-detail.js" });
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
  const summary = node("[data-detail-summary]");
  const summaryLine = summary.children.find((child) => child.className === "detail-review-summary");
  return { reviewsSection, summary, summaryLine, calls };
}

const cases = [
  ["off", { settings: { reviews_enabled: false } }, false],
  ["missing", { settings: {} }, false],
  ["string TRUE is not a boolean", { settings: { reviews_enabled: "TRUE" } }, false],
  ["settings read fails", { settingsError: true }, false],
  ["on", { settings: { reviews_enabled: true } }, true]
];

(async () => {
  for (const [name, options, shown] of cases) {
    const { reviewsSection, summary, summaryLine, calls } = await runPage(options);
    assert.ok(summary.children.length > 0, `${name}: summary rendered`);
    assert.equal(calls.settings, 1, `${name}: settings read once`);
    assert.equal(reviewsSection.hidden, !shown, `${name}: review section hidden=${!shown}`);
    assert.deepEqual(calls.reviews.filter(Boolean), shown ? ["PLC-1"] : [], `${name}: reviews loaded only when on`);
    assert.equal(Boolean(summaryLine), shown, `${name}: summary line present only when on`);
    process.stdout.write(`PASS reviews switch: ${name}\n`);
  }
  const html = read("public/place-detail.html");
  assert.match(html, /<section[^>]*data-detail-reviews[^>]*\shidden>/, "review section starts hidden (no flash before settings load)");
  process.stdout.write("PASS reviews section starts hidden in place-detail.html\n");
})().catch((error) => { process.stderr.write(`FAIL ${error.stack}\n`); process.exitCode = 1; });
