"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const servicePath = path.join(root, "apps-script/SettingsService.gs");
const plain = (value) => JSON.parse(JSON.stringify(value));

const ALLOWLIST = [
  "site_name", "site_slogan_th", "site_slogan_en", "default_language",
  "main_email", "main_phone", "facebook_url", "line_url", "logo_url",
  "hero_image_url", "reviews_enabled", "events_enabled"
];

function settingsRows() {
  return [
    { setting_key: "site_name", setting_value: " Takhun Trip ", description: "private", updated_at: "secret" },
    { setting_key: "site_name", setting_value: "Duplicate must lose" },
    { setting_key: "site_slogan_th", setting_value: " เที่ยวตาขุน " },
    { setting_key: "site_slogan_en", setting_value: " Discover Ta Khun " },
    { setting_key: "default_language", setting_value: " th " },
    { setting_key: "main_email", setting_value: " hello@example.com " },
    { setting_key: "main_phone", setting_value: " 077 123 456 " },
    { setting_key: "facebook_url", setting_value: " https://facebook.example/takhun " },
    { setting_key: "line_url", setting_value: " https://line.example/takhun " },
    { setting_key: "logo_url", setting_value: " https://cdn.example/logo.png " },
    { setting_key: "hero_image_url", setting_value: " https://cdn.example/hero.jpg " },
    { setting_key: "reviews_enabled", setting_value: "TRUE" },
    { setting_key: "events_enabled", setting_value: 0 },
    { setting_key: "maintenance_mode", setting_value: "TRUE" },
    { setting_key: "password_hash", setting_value: "secret" },
    { setting_key: "__proto__", setting_value: "pollute" },
    { setting_key: "constructor", setting_value: "pollute" },
    { setting_key: "toString", setting_value: "pollute" },
    { setting_key: "", setting_value: "missing key" },
    { setting_value: "missing key" },
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
  const source = options.rows || settingsRows();
  const store = options.cache || createCache();
  const reads = [];
  const context = {
    JSON, Object, Math, Number, String, Array, RegExp, encodeURIComponent, isFinite,
    CacheService: options.cacheService || { getScriptCache: () => store },
    readSheetObjects_: options.readSheetObjects_ || ((name) => {
      reads.push(name);
      assert.equal(name, "settings");
      return source;
    })
  };
  vm.createContext(context);
  vm.runInContext(fs.existsSync(servicePath) ? fs.readFileSync(servicePath, "utf8") : "", context, { filename: "apps-script/SettingsService.gs" });
  return { context, source, store, reads };
}

function required(context, name) {
  assert.equal(typeof context[name], "function", `${name} must be implemented by SettingsService.gs`);
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

test("settings expose the exact deterministic 12-key allowlist without mutation", () => {
  const { context, source } = load();
  const build = required(context, "SettingsService_buildSettingsResponse_");
  const before = JSON.stringify(source);
  const response = plain(build(source));
  assert.equal(response.ok, true);
  assert.deepEqual(Object.keys(response.data), ALLOWLIST);
  assert.deepEqual(response.data, {
    site_name: "Takhun Trip",
    site_slogan_th: "เที่ยวตาขุน",
    site_slogan_en: "Discover Ta Khun",
    default_language: "th",
    main_email: "hello@example.com",
    main_phone: "077 123 456",
    facebook_url: "https://facebook.example/takhun",
    line_url: "https://line.example/takhun",
    logo_url: "https://cdn.example/logo.png",
    hero_image_url: "https://cdn.example/hero.jpg",
    reviews_enabled: true,
    events_enabled: false
  });
  assert.equal("maintenance_mode" in response.data, false);
  assert.equal("description" in response.data || "updated_at" in response.data || "password_hash" in response.data, false);
  assert.equal(Object.prototype.pollute, undefined);
  assert.equal(JSON.stringify(source), before);
});

test("settings parse every approved boolean representation and omit malformed values", () => {
  const { context } = load({ rows: [] });
  const build = required(context, "SettingsService_buildSettingsResponse_");
  for (const value of [true, "TRUE", "true", 1, "1"]) {
    assert.deepEqual(plain(build([{ setting_key: "reviews_enabled", setting_value: value }])).data, { reviews_enabled: true });
  }
  for (const value of [false, "FALSE", "false", 0, "0"]) {
    assert.deepEqual(plain(build([{ setting_key: "events_enabled", setting_value: value }])).data, { events_enabled: false });
  }
  const rows = [
    { setting_key: "reviews_enabled", setting_value: "not-a-boolean" },
    { setting_key: "reviews_enabled", setting_value: " true " },
    { setting_key: "events_enabled", setting_value: 2 }
  ];
  assert.deepEqual(plain(build(rows)).data, { reviews_enabled: true });
});

test("settings return an empty successful object for empty headers-only or malformed rows", () => {
  const { context } = load({ rows: [] });
  const build = required(context, "SettingsService_buildSettingsResponse_");
  for (const rows of [[], [null], [{ setting_key: "" }], [{ setting_key: "unknown", setting_value: "x" }]]) {
    assert.deepEqual(plain(build(rows)), { ok: true, data: {}, message: "success" });
  }
});

test("settings cache uses one normalized key and 600 seconds", () => {
  const store = createCache();
  const { context, reads } = load({ cache: store });
  const getSettings = required(context, "getSettings_");
  const first = plain(getSettings({ lang: "en", ignored: "x" }));
  const second = plain(getSettings({}));
  assert.deepEqual(second, first);
  assert.deepEqual(reads, ["settings"]);
  assert.equal(store.puts.length, 1);
  assert.equal(store.puts[0].key, "public:getSettings");
  assert.equal(store.puts[0].ttl, 600);
});

test("settings reject malformed or unsafe cached success shapes and reload", () => {
  const unsafeValues = [
    "not-json",
    JSON.stringify({ ok: true, data: { site_name: "Cached", maintenance_mode: true }, message: "success" }),
    JSON.stringify({ ok: true, data: { reviews_enabled: "true" }, message: "success" }),
    JSON.stringify({ ok: true, data: [], message: "success" }),
    JSON.stringify({ ok: false, error: { code: "SERVER_ERROR", message: "bad" } })
  ];
  for (const cached of unsafeValues) {
    const store = createCache();
    store.values.set("public:getSettings", cached);
    const { context, reads } = load({ cache: store });
    plain(required(context, "getSettings_")({}));
    assert.deepEqual(reads, ["settings"]);
    assert.equal(store.puts.length, 1);
  }
});

test("settings accept only an exact valid cached projection", () => {
  const store = createCache();
  const cached = { ok: true, data: { site_name: "Cached", reviews_enabled: true }, message: "success" };
  store.values.set("public:getSettings", JSON.stringify(cached));
  const { context, reads } = load({ cache: store });
  assert.deepEqual(plain(required(context, "getSettings_")({})), cached);
  assert.deepEqual(reads, []);
  assert.equal(store.puts.length, 0);
});

test("settings tolerate CacheService failures and never cache read errors", () => {
  const cacheFailure = load({ cacheService: { getScriptCache() { throw new Error("cache unavailable"); } } });
  assert.equal(plain(required(cacheFailure.context, "getSettings_")({})).ok, true);
  assert.deepEqual(cacheFailure.reads, ["settings"]);

  const store = createCache();
  const readFailure = load({ cache: store, readSheetObjects_() { throw new Error("sheet settings spreadsheet id secret"); } });
  assert.throws(() => required(readFailure.context, "getSettings_")({}), /secret/);
  assert.equal(store.puts.length, 0);
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("SettingsService verification passed.\n");
