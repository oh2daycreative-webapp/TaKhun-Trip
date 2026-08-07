"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/js/products.js"), "utf8");
const canonicalSource = fs.readFileSync(path.join(__dirname, "../public/js/content-data.js"), "utf8");
const i18nSource = fs.readFileSync(path.join(__dirname, "../public/js/i18n.js"), "utf8");

function loadProducts() {
  const context = {
    URL,
    URLSearchParams,
    console,
    document: {
      readyState: "loading",
      addEventListener() {},
      querySelector() { return null; }
    },
    location: { href: "https://example.test/products.html", pathname: "/products.html", search: "" },
    window: null
  };
  context.window = context;
  vm.runInNewContext(canonicalSource, context, { filename: "content-data.js" });
  vm.runInNewContext(source, context, { filename: "products.js" });
  return context.TakhunProducts;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const api = loadProducts();

function loadI18n() {
  const context = { window: null };
  context.window = context;
  vm.runInNewContext(i18nSource, context, { filename: "i18n.js" });
  return context.TakhunI18n;
}

for (const name of [
  "parseProductId", "validateProductId", "parseProductFilters", "filterProducts",
  "normalizeProductList", "normalizeProductDetail", "localized", "normalizeBoolean",
  "sortProducts", "priceState", "safePhoneHref", "safeExternalUrl", "detailUrl",
  "relatedPlaceUrl", "mapUrl", "resolveListState", "resolveDetailState", "mockGetProducts",
  "mockGetProductDetail", "setPageState", "productContactModel", "validateDetailRequestId"
]) {
  assert.equal(typeof api[name], "function", `missing helper ${name}`);
}

assert.equal(api.parseProductId("?id=%20PROD-001%20"), "PROD-001");
assert.equal(api.parseProductId(""), "");
for (const id of ["PROD-001", "mock_product-2", "A1"]) assert.equal(api.validateProductId(id), true, id);
for (const id of ["", "   ", "bad id", "../bad", "<script>", "javascript:alert(1)", "A/B"]) {
  assert.equal(api.validateProductId(id), false, id);
}
assert.equal(api.validateDetailRequestId("INVALID", false), false, "local canonical mode must reject non-PROD detail IDs without an API request");
assert.equal(api.validateDetailRequestId("PROD-NOT-FOUND", false), true);
assert.equal(api.validateDetailRequestId("INVALID", true), true, "configured API mode must preserve the existing generic ID contract");

{
  const parsed = api.parseProductFilters("?category=honey&district=ban_ta_khun&related_place_id=BTK-003&ignored=x");
  assert.deepEqual(plain(parsed.filters), { category: "honey", district: "ban_ta_khun", related_place_id: "BTK-003" });
  assert.deepEqual(plain(parsed.invalid), []);
  const invalid = api.parseProductFilters("?category=unknown&district=space%20value&related_place_id=../bad");
  assert.deepEqual(plain(invalid.filters), {});
  assert.deepEqual(plain(invalid.invalid), ["category", "district", "related_place_id"]);
}

{
  const original = [
    { product_id: "P-1", category: "honey", district: "ban_ta_khun", related_place_id: "BTK-003" },
    { product_id: "P-2", category: "food", district: "phanom", related_place_id: "PNM-001" }
  ];
  const snapshot = JSON.stringify(original);
  assert.deepEqual(plain(api.filterProducts(original, { category: "honey", district: "ban_ta_khun", related_place_id: "BTK-003" }).map((item) => item.product_id)), ["P-1"]);
  assert.deepEqual(plain(api.filterProducts(original, { category: "souvenir" })), []);
  assert.equal(JSON.stringify(original), snapshot);
}

{
  const data = { items: [{ product_id: "PROD-001", name: "Honey" }], total: 1 };
  const normalized = api.normalizeProductList(data);
  assert.notEqual(normalized.items, data.items);
  assert.equal(normalized.total, 1);
  assert.equal(normalized.items[0].product_id, "PROD-001");
  assert.throws(() => api.normalizeProductList({ items: "bad" }), /MALFORMED_RESPONSE/);
  assert.throws(() => api.normalizeProductList({ items: [{}] }), /MALFORMED_RESPONSE/);
  assert.equal(api.normalizeProductDetail({ product_id: "PROD-001" }).product_id, "PROD-001");
  assert.equal(api.normalizeProductDetail(null), null, "local fallback not-found must resolve to the not-found state");
  assert.throws(() => api.normalizeProductDetail({ name: "Missing ID" }), /MALFORMED_RESPONSE/);
}

assert.equal(api.localized({ name_th: "น้ำผึ้ง", name_en: "Honey" }, "name", "en"), "Honey");
assert.equal(api.localized({ name_th: "น้ำผึ้ง", name_en: "" }, "name", "en"), "น้ำผึ้ง");
assert.equal(api.localized({ name: "API localized" }, "name", "en"), "API localized");

for (const value of [true, 1, "1", "true", "TRUE"]) assert.equal(api.normalizeBoolean(value), true);
for (const value of [false, 0, "0", "false", "", null, undefined]) assert.equal(api.normalizeBoolean(value), false);

{
  const original = [
    { product_id: "P-1", is_featured: "false", sort_order: 1 },
    { product_id: "P-2", is_featured: "true", sort_order: "10" },
    { product_id: "P-3", is_featured: true, sort_order: "2" },
    { product_id: "P-4", is_featured: true, sort_order: null }
  ];
  const snapshot = JSON.stringify(original);
  assert.deepEqual(plain(api.sortProducts(original).map((item) => item.product_id)), ["P-3", "P-2", "P-4", "P-1"]);
  assert.equal(JSON.stringify(original), snapshot);
}

assert.deepEqual(plain(api.priceState({ price_range: "เริ่มต้น 150 บาท" })), { kind: "value", value: "เริ่มต้น 150 บาท" });
for (const value of [undefined, null, "", "   ", 0, "0"]) {
  assert.deepEqual(plain(api.priceState({ price_range: value })), { kind: "contact", value: "" });
}

assert.equal(api.safePhoneHref("+66 (0)81-234-5678"), "tel:+660812345678");
assert.equal(api.safePhoneHref("081 234 5678"), "tel:0812345678");
for (const value of ["", "123", "081abc", "javascript:alert(1)", "+--"]) assert.equal(api.safePhoneHref(value), "");
assert.equal(api.safeExternalUrl("https://example.com/contact"), "https://example.com/contact");
assert.equal(api.safeExternalUrl("http://example.com/path"), "http://example.com/path");
for (const value of ["", "/relative", "javascript:alert(1)", "data:text/html,hi", "ftp://example.com"]) {
  assert.equal(api.safeExternalUrl(value), "");
}

assert.equal(api.detailUrl("PROD A/B"), "product-detail.html?id=PROD%20A%2FB");
assert.equal(api.relatedPlaceUrl("BTK A/B"), "place-detail.html?id=BTK%20A%2FB");
assert.equal(api.mapUrl({ google_maps_url: "https://maps.example/place" }), "https://maps.example/place");
assert.equal(api.mapUrl({ latitude: "8.987654", longitude: "98.765432" }), "https://www.google.com/maps/search/?api=1&query=8.987654%2C98.765432");
assert.equal(api.mapUrl({ latitude: "999", longitude: "98.765432" }), "");
assert.equal(api.mapUrl({ google_maps_url: "javascript:bad", related_place_id: "BTK-003" }), "map.html?focus=BTK-003");
assert.equal(api.mapUrl({ related_place: { place_id: "BTK-004" } }), "map.html?focus=BTK-004");
assert.equal(api.mapUrl({}), "");

assert.equal(api.resolveListState({ loading: true }), "loading");
assert.equal(api.resolveListState({ error: true }), "error");
assert.equal(api.resolveListState({ items: [], filtered: false }), "empty");
assert.equal(api.resolveListState({ items: [], filtered: true }), "filtered-empty");
assert.equal(api.resolveListState({ items: [{ product_id: "P-1" }] }), "ready");

{
  const stateNames = ["loading", "ready", "empty", "filtered-empty", "error"];
  const stateMap = Object.fromEntries(stateNames.map((name) => [name, { hidden: false }]));

  for (const activeState of stateNames) {
    assert.equal(api.setPageState(stateMap, activeState), true, activeState);
    for (const stateName of stateNames) {
      assert.equal(
        stateMap[stateName].hidden,
        stateName !== activeState,
        `${activeState} must be the only visible products state (unexpected ${stateName})`
      );
    }
  }
}

assert.equal(api.resolveDetailState({ validId: false }), "invalid-id");
assert.equal(api.resolveDetailState({ loading: true, validId: true }), "loading");
assert.equal(api.resolveDetailState({ error: true, validId: true }), "error");
assert.equal(api.resolveDetailState({ validId: true, product: null }), "not-found");
assert.equal(api.resolveDetailState({ validId: true, product: { product_id: "P-1" } }), "ready");

{
  const stateNames = ["loading", "ready", "invalid-id", "not-found", "error"];
  const states = Object.fromEntries(stateNames.map((name) => [name, { hidden: false }]));
  for (const active of stateNames) {
    assert.equal(api.setPageState(states, active), true);
    assert.deepEqual(stateNames.filter((name) => !states[name].hidden), [active], `${active} must be exclusive`);
  }
  const durian = api.mockGetProductDetail("PROD-BTK-DURIAN");
  assert.equal(api.resolveDetailState({ validId: true, product: durian }), "ready");
  api.setPageState(states, "ready");
  assert.deepEqual(stateNames.filter((name) => !states[name].hidden), ["ready"]);
  api.setPageState(states, "not-found");
  assert.equal(states.ready.hidden, true);
  api.setPageState(states, "error");
  assert.equal(states.ready.hidden, true);
}

{
  const durian = api.mockGetProductDetail("PROD-BTK-DURIAN");
  const contact = api.productContactModel(durian);
  assert.equal(contact.visible, false, "canonical durian must not show an unverified contact card");
  assert.deepEqual(plain(contact.actions), []);
  assert.equal(durian.related_place_id, "BTK-002");
  assert.equal(api.relatedPlaceUrl(durian.related_place_id), "place-detail.html?id=BTK-002");
}

{
  const mocks = api.mockGetProducts({ category: "honey", district: "ban_ta_khun" });
  assert.ok(mocks.items.length >= 1);
  assert.ok(mocks.items.every((item) => item.category === "honey" && item.district === "ban_ta_khun"));
  const all = api.mockGetProducts({}).items;
  assert.equal(all.length, 7);
  assert.ok(all.every((item) => api.priceState(item).kind === "contact"), "unverified product prices must remain hidden");
  assert.ok(all.some((item) => item.related_place_id));
  assert.ok(all.every((item) => !api.safePhoneHref(item.phone) && !api.safeExternalUrl(item.contact_url)), "placeholder product contacts must be absent");
  assert.equal(api.mockGetProductDetail("MOCK-PROD-404"), null);
}

{
  const i18n = loadI18n();
  const keys = [
    "products.heading", "products.intro", "products.featured_title", "products.all_title",
    "products.category", "products.district", "products.related_place_id", "products.filters",
    "products.clear_filters", "products.view_details", "products.contact_price", "products.producer",
    "products.contact", "products.call", "products.navigate", "products.loading", "products.empty_title",
    "products.filtered_empty_title", "products.error_title", "products.retry", "products.categories.honey",
    "products.districts.ban_ta_khun", "product_detail.loading", "product_detail.invalid_title",
    "product_detail.not_found_title", "product_detail.error_title", "product_detail.no_contact",
    "product_detail.no_related_place", "product_detail.view_related_place", "product_channels.price",
    "product_channels.producer_group", "product_channels.line", "product_channels.facebook", "product_channels.website"
  ];
  for (const lang of ["th", "en"]) {
    i18n.setCurrentLang(lang);
    for (const key of keys) assert.notEqual(i18n.t(key), key, `${key} missing in ${lang}`);
  }
}

assert.equal((source.match(/fetchPriority:\s*"high"/g) || []).length, 1);
assert.match(source, /mediaIdFor\("product", product\.product_id\)/);
assert.match(source, /product-card__image[\s\S]*?decorative:\s*true[\s\S]*?loading:\s*"lazy"/);
assert.match(source, /product-detail-page__image[\s\S]*?fallbackAlt:[\s\S]*?loading:\s*"eager"[\s\S]*?fetchPriority:\s*"high"/);
assert.match(source, /\(min-width: 901px\) 33vw, \(min-width: 621px\) 50vw, 100vw/);
assert.match(source, /\(min-width: 901px\) 58vw, 100vw/);
assert.doesNotMatch(source, /renderImage\([\s\S]*?image_url/);

process.stdout.write("Products behavior verification passed.\n");
