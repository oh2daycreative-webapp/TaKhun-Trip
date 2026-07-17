"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/js/gallery.js"), "utf8");
const canonicalSource = fs.readFileSync(path.join(__dirname, "../public/js/content-data.js"), "utf8");

function loadGallery(search = "") {
  const context = {
    URL, URLSearchParams, console,
    document: { readyState: "loading", addEventListener() {}, querySelector() { return null; } },
    location: { href: "https://example.test/gallery.html", pathname: "/gallery.html", search },
    window: null
  };
  context.window = context;
  vm.runInNewContext(canonicalSource, context, { filename: "content-data.js" });
  vm.runInNewContext(source, context, { filename: "gallery.js" });
  return context.TakhunGallery;
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const api = loadGallery();

for (const name of [
  "validateMediaId", "validateCategory", "validateMediaType", "normalizeMediaType",
  "parseGalleryFilters", "filterGallery", "clearFilters", "localized", "safeMediaUrl",
  "safeThumbnailUrl", "safeExternalUrl", "isDirectVideoUrl", "normalizeBoolean",
  "normalizeSortOrder", "sortGalleryItems", "relatedPlaceUrl", "mapUrl",
  "normalizeGalleryResponse", "resolveState", "setPageState", "createRequestGate",
  "createViewerState", "openViewerState", "closeViewerState"
]) assert.equal(typeof api[name], "function", `missing helper ${name}`);

assert.equal(typeof api.galleryCategoryOptions, "function", "galleryCategoryOptions must build the filter from canonical content");
assert.deepEqual(plain(api.galleryCategoryOptions("th")), [
  { value: "dam_lake", label: "เขื่อนและทะเลสาบ" },
  { value: "mountain_nature", label: "ขุนเขาและธรรมชาติ" },
  { value: "community_life", label: "ชุมชนและวิถีชีวิต" },
  { value: "food_fruit", label: "อาหารและผลไม้" },
  { value: "activity_tradition", label: "กิจกรรมและงานประเพณี" }
]);
assert.deepEqual(plain(api.galleryCategoryOptions("en")), [
  { value: "dam_lake", label: "Dam and Lake" },
  { value: "mountain_nature", label: "Mountains and Nature" },
  { value: "community_life", label: "Community and Local Life" },
  { value: "food_fruit", label: "Food and Fruit" },
  { value: "activity_tradition", label: "Activities and Traditions" }
]);
for (const lang of ["th", "en"]) {
  const options = api.galleryCategoryOptions(lang);
  assert.equal(options.length, 5);
  assert.ok(options.every((option) => !option.label.startsWith("gallery.categories.")));
  assert.ok(options.every((option) => !["place", "route", "event", "product", "community", "hero", "other"].includes(option.value)));
}

for (const id of ["GAL-001", "media_2", "A1"]) assert.equal(api.validateMediaId(id), true);
for (const id of ["", "bad id", "../bad", "A/B", "javascript:bad"]) assert.equal(api.validateMediaId(id), false);
for (const category of ["dam_lake", "mountain_nature", "community_life", "food_fruit", "activity_tradition"]) assert.equal(api.validateCategory(category), true);
assert.equal(api.validateCategory("unknown"), false);
assert.equal(api.validateMediaType("image"), true);
assert.equal(api.validateMediaType("video"), true);
assert.equal(api.validateMediaType("audio"), false);
assert.equal(api.normalizeMediaType(" IMAGE "), "image");
assert.equal(api.normalizeMediaType("movie"), "");

{
  const parsed = api.parseGalleryFilters("?category=dam_lake&media_type=video&related_place_id=BTK-001&ignored=x");
  assert.deepEqual(plain(parsed.filters), { category: "dam_lake", media_type: "video", related_place_id: "BTK-001" });
  assert.deepEqual(plain(parsed.invalid), []);
  const invalid = api.parseGalleryFilters("?category=bad&media_type=audio&related_place_id=bad%20id");
  assert.deepEqual(plain(invalid.filters), {});
  assert.deepEqual(plain(invalid.invalid), ["category", "media_type", "related_place_id"]);
  assert.deepEqual(plain(api.clearFilters()), {});
}

{
  const items = [
    { media_id: "G-1", category: "place", media_type: "image", related_place_id: "BTK-1" },
    { media_id: "G-2", category: "event", media_type: "video", related_place_id: "BTK-2" },
    { media_id: "G-3", category: "place", media_type: "video", related_place_id: "BTK-1" }
  ];
  const snapshot = JSON.stringify(items);
  assert.deepEqual(plain(api.filterGallery(items, { category: "place" }).map((item) => item.media_id)), ["G-1", "G-3"]);
  assert.deepEqual(plain(api.filterGallery(items, { media_type: "video" }).map((item) => item.media_id)), ["G-2", "G-3"]);
  assert.deepEqual(plain(api.filterGallery(items, { related_place_id: "BTK-1" }).map((item) => item.media_id)), ["G-1", "G-3"]);
  assert.deepEqual(plain(api.filterGallery(items, { category: "place", media_type: "video", related_place_id: "BTK-1" }).map((item) => item.media_id)), ["G-3"]);
  assert.equal(api.filterGallery(items, { category: "hero" }).length, 0);
  assert.equal(JSON.stringify(items), snapshot);
}

assert.equal(api.localized({ title_th: "ชื่อไทย", title_en: "English", title: "API" }, "title", "en"), "English");
assert.equal(api.localized({ title_th: "ชื่อไทย", title_en: "", title: "API" }, "title", "en"), "ชื่อไทย");
assert.equal(api.localized({ title: "API" }, "title", "en"), "API");

for (const value of ["https://example.com/a.jpg", "http://example.com/a.png"]) {
  assert.equal(api.safeMediaUrl(value), value);
  assert.equal(api.safeThumbnailUrl(value), value);
  assert.equal(api.safeExternalUrl(value), value);
}
for (const value of ["javascript:alert(1)", "data:text/html,x", "ftp://example.com/a", "file:///tmp/a", "/relative.jpg", ""]) {
  assert.equal(api.safeMediaUrl(value), "");
  assert.equal(api.safeThumbnailUrl(value), "");
  assert.equal(api.safeExternalUrl(value), "");
}
for (const value of ["https://cdn.example/video.mp4", "https://cdn.example/video.WEBM?token=1", "http://cdn.example/v.ogg#t=2"]) assert.equal(api.isDirectVideoUrl(value), true);
for (const value of ["https://youtube.com/watch?v=1", "https://example.com/video", "javascript:bad"]) assert.equal(api.isDirectVideoUrl(value), false);

for (const value of [true, "true", 1, "1"]) assert.equal(api.normalizeBoolean(value), true);
for (const value of [false, "false", 0, "0", "yes", null]) assert.equal(api.normalizeBoolean(value), false);
assert.equal(api.normalizeSortOrder("2"), 2);
assert.equal(api.normalizeSortOrder(0), 0);
assert.equal(api.normalizeSortOrder("bad"), null);

{
  const items = [
    { media_id: "A", is_featured: false, sort_order: 2 },
    { media_id: "B", is_featured: "true", sort_order: 5 },
    { media_id: "C", is_featured: 1, sort_order: "1" },
    { media_id: "D", is_featured: false, sort_order: "bad" },
    { media_id: "E", is_featured: false, sort_order: 2 }
  ];
  const snapshot = JSON.stringify(items);
  assert.deepEqual(plain(api.sortGalleryItems(items).map((item) => item.media_id)), ["C", "B", "A", "E", "D"]);
  assert.equal(JSON.stringify(items), snapshot);
}

assert.equal(api.relatedPlaceUrl("BTK A/B"), "place-detail.html?id=BTK%20A%2FB");
assert.equal(api.mapUrl("BTK A/B"), "map.html?focus=BTK%20A%2FB");
assert.throws(() => api.normalizeGalleryResponse(null), /MALFORMED_RESPONSE/);
assert.throws(() => api.normalizeGalleryResponse({ items: "bad" }), /MALFORMED_RESPONSE/);
assert.throws(() => api.normalizeGalleryResponse({ items: [{}] }), /MALFORMED_RESPONSE/);
assert.deepEqual(plain(api.normalizeGalleryResponse({ items: [{ media_id: "G-1", media_type: "image" }], total: 1 }).items.map((item) => item.media_id)), ["G-1"]);

for (const [input, expected] of [
  [{ initial: true }, "initial"], [{ loading: true }, "loading"], [{ invalidFilter: true }, "invalid-filter"],
  [{ malformed: true }, "malformed-response"], [{ error: true }, "error"], [{ mediaLoadError: true }, "media-load-error"],
  [{ items: [] }, "empty"], [{ items: [], filtered: true }, "filtered-empty"], [{ items: [{}] }, "ready"]
]) assert.equal(api.resolveState(input), expected);

{
  const names = ["initial", "loading", "ready", "empty", "filtered-empty", "error", "invalid-filter", "malformed-response", "media-load-error"];
  const states = Object.fromEntries(names.map((name) => [name, { hidden: false }]));
  for (const active of names) {
    assert.equal(api.setPageState(states, active), true);
    assert.equal(Object.values(states).filter((state) => !state.hidden).length, 1);
  }
  assert.equal(api.setPageState(states, "unknown"), false);
}

{
  const gate = api.createRequestGate();
  const first = gate.begin();
  const second = gate.begin();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
}

{
  const trigger = { id: "button" };
  const item = { media_id: "G-1", media_type: "image", image_url: "https://example.com/a.jpg" };
  const initial = api.createViewerState();
  const opened = api.openViewerState(initial, item, trigger);
  assert.equal(opened.isOpen, true);
  assert.equal(opened.item.media_id, "G-1");
  assert.equal(opened.returnFocus, trigger);
  const closed = api.closeViewerState(opened);
  assert.equal(closed.isOpen, false);
  assert.equal(closed.returnFocus, trigger);
  assert.equal(api.openViewerState(initial, { media_id: "G-2", media_type: "video", video_url: "https://cdn.example/v.mp4" }, trigger).mode, "video");
  assert.equal(api.openViewerState(initial, { media_id: "G-3", media_type: "video", video_url: "https://youtube.com/watch?v=1" }, trigger).mode, "external");
  assert.equal(api.openViewerState(initial, { media_id: "G-4", media_type: "image", image_url: "javascript:bad" }, trigger).mode, "invalid");
}

process.stdout.write("Gallery behavior verification passed.\n");

assert.equal(api.mockGallery({}).items.length, 0, "gallery must remain an intentional empty state until the Media Pipeline milestone");
