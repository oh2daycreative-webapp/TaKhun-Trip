"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const servicePath = path.join(root, "apps-script/CategoryService.gs");
const plain = (value) => JSON.parse(JSON.stringify(value));
const PUBLIC_FIELDS = ["category_id", "category_type", "name", "icon", "color"];

function categoryRows() {
  return [
    { category_id: "CAT-10", category_type: "place", name_th: " สิบ ", name_en: " Ten ", icon: " pin ", color: " #111111 ", sort_order: "10", status: "published", note: "secret" },
    { category_id: "CAT-2A", category_type: "product", name_th: "สอง ก", name_en: "", icon: "bag", color: "#222222", sort_order: "2", status: "published" },
    { category_id: "CAT-2B", category_type: "event", name_th: "สอง ข", name_en: "Two B", icon: "calendar", color: "#333333", sort_order: 2, status: "published", password_hash: "secret" },
    { category_id: "CAT-BLANK", category_type: "gallery", name_th: "ท้ายว่าง", name_en: "", icon: "", color: "", sort_order: "", status: "published" },
    { category_id: "CAT-NAN", category_type: "route_style", name_th: "ท้าย NaN", sort_order: "NaN", status: "published" },
    { category_id: "CAT-INF", category_type: "place", name_th: "ท้าย Infinity", sort_order: "Infinity", status: "published" },
    { category_id: "DUP", category_type: "invalid", name_th: "invalid first", sort_order: 0, status: "published" },
    { category_id: "DUP", category_type: "place", name_th: "แถวแรกที่ถูกต้อง", sort_order: 1, status: "published" },
    { category_id: "DUP", category_type: "product", name_th: "duplicate must lose", sort_order: 0, status: "published" },
    { category_id: "__proto__", category_type: "place", name_th: "Prototype", sort_order: 3, status: "published" },
    { category_id: "constructor", category_type: "place", name_th: "Constructor", sort_order: 4, status: "published" },
    { category_id: "toString", category_type: "place", name_th: "To String", sort_order: 5, status: "published" },
    { category_id: "CAT-DRAFT", category_type: "place", name_th: "ร่าง", sort_order: 0, status: "draft" },
    { category_id: "CAT-HIDDEN", category_type: "place", name_th: "ซ่อน", sort_order: 0, status: "hidden" },
    { category_id: "CAT-ARCHIVED", category_type: "place", name_th: "เก็บ", sort_order: 0, status: "archived" },
    { category_id: "CAT-DELETED", category_type: "place", name_th: "ลบ", sort_order: 0, status: "deleted" },
    { category_id: "", category_type: "place", name_th: "missing id", status: "published" },
    { category_id: "CAT-NO-TYPE", category_type: "", name_th: "missing type", status: "published" },
    { category_id: "CAT-NO-NAME", category_type: "place", name_th: "", status: "published" },
    { category_id: "CAT-BAD-TYPE", category_type: "other", name_th: "bad type", status: "published" },
    { category_id: "CAT-UPPER-TYPE", category_type: "PLACE", name_th: "uppercase type", status: "published" },
    null
  ];
}

function createCache() {
  const values = new Map();
  const puts = [];
  return {
    values,
    puts,
    get(key) { return values.has(key) ? values.get(key) : null; },
    put(key, value, ttl) { puts.push({ key, value, ttl }); values.set(key, value); }
  };
}

function load(options = {}) {
  const source = options.rows || categoryRows();
  const store = options.cache || createCache();
  const reads = [];
  const context = {
    JSON, Object, Math, Number, String, Array, RegExp, encodeURIComponent, isFinite,
    CacheService: options.cacheService || { getScriptCache: () => store },
    readSheetObjects_: options.readSheetObjects_ || ((name) => {
      reads.push(name);
      assert.equal(name, "categories");
      return source;
    })
  };
  vm.createContext(context);
  vm.runInContext(fs.existsSync(servicePath) ? fs.readFileSync(servicePath, "utf8") : "", context, { filename: "apps-script/CategoryService.gs" });
  return { context, source, store, reads };
}

function required(context, name) {
  assert.equal(typeof context[name], "function", `${name} must be implemented by CategoryService.gs`);
  return context[name];
}

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

test("categories expose published valid rows in numeric stable order without mutation", () => {
  const { context, source } = load();
  const build = required(context, "CategoryService_buildCategoriesResponse_");
  const before = JSON.stringify(source);
  const response = plain(build(source, {}));
  assert.equal(response.ok, true);
  assert.deepEqual(response.data.items.map((item) => item.category_id), [
    "DUP", "CAT-2A", "CAT-2B", "__proto__", "constructor", "toString", "CAT-10", "CAT-BLANK", "CAT-NAN", "CAT-INF"
  ]);
  assert.deepEqual(Object.keys(response.data), ["items"]);
  for (const item of response.data.items) assert.deepEqual(Object.keys(item), PUBLIC_FIELDS);
  assert.equal(response.data.items.some((item) => "name_th" in item || "name_en" in item || "sort_order" in item || "status" in item || "note" in item || "password_hash" in item), false);
  assert.equal(response.data.items.filter((item) => item.category_id === "DUP").length, 1);
  assert.equal(response.data.items.find((item) => item.category_id === "DUP").name, "แถวแรกที่ถูกต้อง");
  assert.equal(Object.prototype.pollute, undefined);
  assert.equal(JSON.stringify(source), before);
});

test("categories support all five types and reject invalid type parameters", () => {
  const { context, source } = load();
  const build = required(context, "CategoryService_buildCategoriesResponse_");
  const expected = ["place", "product", "event", "gallery", "route_style"];
  assert.deepEqual([...new Set(plain(build(source, {})).data.items.map((item) => item.category_type))].sort(), expected.slice().sort());
  for (const type of expected) {
    const response = plain(build(source, { type }));
    assert.equal(response.ok, true);
    assert.equal(response.data.items.length > 0, true);
    assert.equal(response.data.items.every((item) => item.category_type === type), true);
  }
  assert.equal(plain(build(source, { type: "other" })).error.code, "VALIDATION_ERROR");
});

test("categories localize English with Thai fallback and normalize unknown language to Thai", () => {
  const { context, source } = load();
  const build = required(context, "CategoryService_buildCategoriesResponse_");
  const thai = plain(build(source, { type: "product" })).data.items;
  const english = plain(build(source, { type: "product", lang: "EN" })).data.items;
  const unknown = plain(build(source, { type: "place", lang: "jp" })).data.items;
  assert.equal(thai.find((item) => item.category_id === "CAT-2A").name, "สอง ก");
  assert.equal(english.find((item) => item.category_id === "CAT-2A").name, "สอง ก");
  assert.equal(plain(build(source, { type: "event", lang: "en" })).data.items[0].name, "Two B");
  assert.equal(unknown.find((item) => item.category_id === "CAT-10").name, "สิบ");
});

test("categories exclude every unpublished or malformed row and return empty success", () => {
  const { context } = load({ rows: [] });
  const build = required(context, "CategoryService_buildCategoriesResponse_");
  const malformed = categoryRows().filter((row) => row && ["CAT-DRAFT", "CAT-HIDDEN", "CAT-ARCHIVED", "CAT-DELETED", "", "CAT-NO-TYPE", "CAT-NO-NAME", "CAT-BAD-TYPE", "CAT-UPPER-TYPE"].includes(row.category_id));
  assert.deepEqual(plain(build(malformed, {})), { ok: true, data: { items: [] }, message: "success" });
  assert.deepEqual(plain(build([], {})), { ok: true, data: { items: [] }, message: "success" });
  assert.deepEqual(plain(build([null], {})), { ok: true, data: { items: [] }, message: "success" });
});

test("categories cache normalized all and filter keys for 1800 seconds", () => {
  const store = createCache();
  const { context, reads } = load({ cache: store });
  const getCategories = required(context, "getCategories_");
  getCategories({ lang: "JP", ignored: "x" });
  getCategories({ lang: "th" });
  assert.deepEqual(reads, ["categories"]);
  assert.equal(store.puts[0].key, "public:getCategories:lang=th:type=all");
  assert.equal(store.puts[0].ttl, 1800);
  getCategories({ type: " PLACE ", lang: " EN " });
  getCategories({ lang: "en", type: "place" });
  assert.equal(reads.length, 2);
  assert.equal(store.puts[1].key, "public:getCategories:lang=en:type=place");
  const puts = store.puts.length;
  assert.equal(plain(getCategories({ type: "bad" })).error.code, "VALIDATION_ERROR");
  assert.equal(reads.length, 2);
  assert.equal(store.puts.length, puts);
});

test("categories reject malformed or extra-field cached projections and reload", () => {
  const key = "public:getCategories:lang=th:type=all";
  const unsafeValues = [
    "not-json",
    JSON.stringify({ ok: true, data: { items: [], total: 0 }, message: "success" }),
    JSON.stringify({ ok: true, data: { items: [{ category_id: "C", category_type: "place", name: "N", icon: "", color: "", status: "published" }] }, message: "success" }),
    JSON.stringify({ ok: true, data: { items: [{ category_id: "C", category_type: "place", name: "N", icon: "", color: 1 }] }, message: "success" }),
    JSON.stringify({ ok: false, error: { code: "SERVER_ERROR", message: "bad" } })
  ];
  for (const cached of unsafeValues) {
    const store = createCache();
    store.values.set(key, cached);
    const { context, reads } = load({ cache: store });
    plain(required(context, "getCategories_")({}));
    assert.deepEqual(reads, ["categories"]);
    assert.equal(store.puts.length, 1);
  }
});

test("categories accept exact cached projection and tolerate CacheService failures", () => {
  const key = "public:getCategories:lang=en:type=place";
  const cached = { ok: true, data: { items: [{ category_id: "C", category_type: "place", name: "Name", icon: "pin", color: "#fff" }] }, message: "success" };
  const store = createCache();
  store.values.set(key, JSON.stringify(cached));
  const hit = load({ cache: store });
  assert.deepEqual(plain(required(hit.context, "getCategories_")({ type: "place", lang: "en" })), cached);
  assert.deepEqual(hit.reads, []);

  const cacheFailure = load({ cacheService: { getScriptCache() { throw new Error("cache unavailable"); } } });
  assert.equal(plain(required(cacheFailure.context, "getCategories_")({})).ok, true);
  assert.deepEqual(cacheFailure.reads, ["categories"]);
});

test("categories never cache sheet errors", () => {
  const store = createCache();
  const failure = load({ cache: store, readSheetObjects_() { throw new Error("categories sheet spreadsheet id stack secret"); } });
  assert.throws(() => required(failure.context, "getCategories_")({}), /secret/);
  assert.equal(store.puts.length, 0);
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("CategoryService verification passed.\n");
