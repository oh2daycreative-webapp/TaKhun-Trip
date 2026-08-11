"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function data() {
  return {
    products: [
      { product_id: "PR-10", name_th: "สิบ", name_en: "Ten", category: "honey", producer_name: "กลุ่มสิบ", related_place_id: "P-1", district: "ban_ta_khun", description_th: "น้ำผึ้งไทย", description_en: "Honey", price_range: "100", phone: "10", contact_url: "https://example.com/10", google_maps_url: "https://maps.example/10", latitude: "8.1", longitude: "98.1", image_url: "10.jpg", tags: "น้ำผึ้ง| ของฝาก |น้ำผึ้ง", is_featured: "TRUE", sort_order: "10", status: "published", admin_notes: "secret" },
      { product_id: "PR-2A", name_th: "สอง ก", name_en: "", category: "handicraft", producer_name: "กลุ่มสอง", related_place_id: "toString", district: "phanom", description_th: "ผ้าทอชุมชน", description_en: "", price_range: "", phone: "20", contact_url: "", google_maps_url: "", latitude: "", longitude: "", image_url: "2.jpg", tags: "ผ้า", is_featured: true, sort_order: "2", status: "published" },
      { product_id: "PR-2B", name_th: "สอง ข", category: "honey", producer_name: "กลุ่มบี", related_place_id: "P-DRAFT", district: "ban_ta_khun", description_th: "น้ำผึ้งป่า", price_range: "200", is_featured: false, sort_order: 2, status: "published", password_hash: "secret" },
      { product_id: "PR-BAD", name_th: "ท้าย", category: "fruit", producer_name: "สวน", related_place_id: "MISSING", district: "khiri_rat_nikhom", description_th: "ผลไม้", is_featured: "false", sort_order: "later", status: "published" },
      { product_id: "PR-DRAFT", name_th: "ร่าง", category: "honey", is_featured: true, sort_order: 0, status: "draft" },
      { product_id: "PR-HIDDEN", name_th: "ซ่อน", status: "hidden" },
      { product_id: "PR-DELETED", name_th: "ลบ", status: "deleted" }
    ],
    places: [
      { place_id: "P-1", name_th: "สถานที่หนึ่ง", name_en: "Place One", status: "published", admin_notes: "secret" },
      { place_id: "toString", name_th: "ชื่อพิเศษ", name_en: "", status: "published", password_hash: "secret" },
      { place_id: "P-DRAFT", name_th: "ร่าง", status: "draft" }
    ]
  };
}

function cache() {
  const values = new Map();
  const puts = [];
  return { values, puts, get(key) { return values.get(key) || null; }, put(key, value, ttl) { puts.push({ key, value, ttl }); values.set(key, value); } };
}

function properties(initial = "1") {
  const values = new Map();
  if (initial !== null) values.set("PLACE_PUBLIC_CACHE_EPOCH", initial);
  return { values, getProperty(key) { return values.has(key) ? values.get(key) : null; } };
}

function load(options = {}) {
  const source = data();
  const store = options.cache || cache();
  const propertyStore = options.properties || properties();
  const reads = [];
  const context = {
    JSON, Object, Math, Number, String, Array, Date, RegExp, encodeURIComponent, isFinite,
    CacheService: { getScriptCache: () => store },
    PropertiesService: { getScriptProperties: () => propertyStore },
    readSheetObjects_: options.readSheetObjects || ((name) => { reads.push(name); return source[name]; })
  };
  vm.createContext(context);
  vm.runInContext(read("apps-script/Config.gs"), context, { filename: "apps-script/Config.gs" });
  vm.runInContext(read("apps-script/PlaceService.gs"), context, { filename: "apps-script/PlaceService.gs" });
  const file = path.join(root, "apps-script/ProductService.gs");
  vm.runInContext(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "", context, { filename: "apps-script/ProductService.gs" });
  return { context, source, store, reads, properties: propertyStore };
}

function required(context, name) {
  assert.equal(typeof context[name], "function", `${name} must be implemented by ProductService.gs`);
  return context[name];
}

function test(name, fn) {
  try { fn(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

test("products expose only published public projections with stable numeric ordering", () => {
  const { context, source } = load();
  const build = required(context, "ProductService_buildProductsResponse_");
  const before = JSON.stringify(source.products);
  const response = plain(build(source.products, {}));
  assert.deepEqual(response.data.items.map((item) => item.product_id), ["PR-2A", "PR-10", "PR-2B", "PR-BAD"]);
  assert.deepEqual(Object.keys(response.data.items[0]), ["product_id", "name", "category", "producer_name", "related_place_id", "description", "price_range", "phone", "contact_url", "google_maps_url", "image_url", "is_featured"]);
  assert.equal(response.data.items.some((item) => "status" in item || "sort_order" in item || "admin_notes" in item || "password_hash" in item), false);
  assert.equal(JSON.stringify(source.products), before);
});

test("products validate documented filters pagination boolean keyword and English fallback", () => {
  const { context, source } = load();
  const build = required(context, "ProductService_buildProductsResponse_");
  assert.deepEqual(plain(build(source.products, { category: "honey", district: "ban_ta_khun" })).data.items.map((item) => item.product_id), ["PR-10", "PR-2B"]);
  assert.deepEqual(plain(build(source.products, { related_place_id: "P-1", featured: "true" })).data.items.map((item) => item.product_id), ["PR-10"]);
  assert.deepEqual(plain(build(source.products, { keyword: "HONEY", lang: "en" })).data.items.map((item) => item.product_id), ["PR-10"]);
  assert.deepEqual(plain(build(source.products, { keyword: "ผ้าทอ", lang: "en" })).data.items.map((item) => item.product_id), ["PR-2A"]);
  const page = plain(build(source.products, { page: "2", page_size: "2" }));
  assert.deepEqual({ ids: page.data.items.map((item) => item.product_id), page: page.data.page, page_size: page.data.page_size, total: page.data.total, total_pages: page.data.total_pages }, { ids: ["PR-2B", "PR-BAD"], page: 2, page_size: 2, total: 4, total_pages: 2 });
  for (const params of [{ featured: "yes" }, { category: "unknown" }, { district: "unknown" }, { page: 0 }, { page_size: 101 }, { page: "x" }]) assert.equal(plain(build(source.products, params)).error?.code, "VALIDATION_ERROR");
});

test("product detail validates IDs hides unpublished rows and joins only published places safely", () => {
  const { context, source } = load();
  const build = required(context, "ProductService_buildProductDetailResponse_");
  for (const id of [undefined, "", "../PR-10"]) assert.equal(plain(build(source.products, source.places, { product_id: id })).error.code, "VALIDATION_ERROR");
  for (const id of ["MISSING", "PR-DRAFT", "PR-HIDDEN", "PR-DELETED"]) assert.equal(plain(build(source.products, source.places, { product_id: id })).error.code, "NOT_FOUND");
  const detail = plain(build(source.products, source.places, { product_id: " PR-2A ", lang: "en" })).data;
  assert.equal(detail.name, "สอง ก");
  assert.deepEqual(detail.related_place, { place_id: "toString", name: "ชื่อพิเศษ" });
  assert.deepEqual(detail.tags, ["ผ้า"]);
  assert.deepEqual(Object.keys(detail), ["product_id", "name", "category", "producer_name", "related_place", "description", "price_range", "phone", "contact_url", "google_maps_url", "latitude", "longitude", "image_url", "tags"]);
  assert.equal(plain(build(source.products, source.places, { product_id: "PR-2B" })).data.related_place, null);
  assert.equal(plain(build(source.products, source.places, { product_id: "PR-BAD" })).data.related_place, null);
});

test("product cache normalizes effective keys uses 300 seconds and never caches errors", () => {
  const store = cache();
  const { context, reads } = load({ cache: store });
  required(context, "getProducts_");
  context.getProducts_({ category: " honey ", featured: " TRUE ", page: "1", page_size: "20", lang: "EN", ignored: "x" });
  context.getProducts_({ lang: "en", page_size: 20, page: 1, featured: true, category: "honey" });
  assert.deepEqual(reads, ["products"]);
  assert.equal(store.puts[0].ttl, 300);
  context.getProductDetail_({ product_id: " PR-10 ", lang: "EN" });
  context.getProductDetail_({ product_id: "PR-10", lang: "en" });
  assert.deepEqual(reads.slice(1), ["products", "places"]);
  assert.notEqual(store.puts[0].key, store.puts[1].key);
  const puts = store.puts.length;
  assert.equal(plain(context.getProducts_({ featured: "invalid" })).error.code, "VALIDATION_ERROR");
  assert.equal(plain(context.getProductDetail_({ product_id: "MISSING" })).error.code, "NOT_FOUND");
  assert.equal(store.puts.length, puts);
  const productReadsBeforeMalformedRecovery = reads.filter((name) => name === "products").length;
  store.values.set(store.puts[0].key, "not-json");
  context.getProducts_({ category: "honey", featured: true, page: 1, page_size: 20, lang: "en" });
  assert.equal(reads.filter((name) => name === "products").length, productReadsBeforeMalformedRecovery + 1);
});

test("only Product Detail changes namespace with the Place epoch", () => {
  const propertyStore = properties("1");
  const store = cache();
  const { context, reads } = load({ cache: store, properties: propertyStore });
  context.getProducts_({ page: 1, epoch: "client" });
  const listReads = reads.length;
  propertyStore.values.set("PLACE_PUBLIC_CACHE_EPOCH", "2");
  context.getProducts_({ page: 1 });
  assert.equal(reads.length, listReads);
  assert.equal(store.puts[0].key.includes("place-epoch"), false);

  context.getProductDetail_({ product_id: "PR-10" });
  const detailReads = reads.length;
  assert.match(store.puts.at(-1).key, /:getProductDetail:place-epoch:2:/);
  propertyStore.values.set("PLACE_PUBLIC_CACHE_EPOCH", "3");
  context.getProductDetail_({ product_id: "PR-10" });
  assert.equal(reads.length, detailReads + 2);
  assert.match(store.puts.at(-1).key, /:getProductDetail:place-epoch:3:/);
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("ProductService verification passed.\n");
