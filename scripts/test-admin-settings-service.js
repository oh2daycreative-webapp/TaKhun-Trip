"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const plain = (value) => JSON.parse(JSON.stringify(value));
const KEYS = [
  "site_name", "site_slogan_th", "site_slogan_en", "default_language",
  "main_email", "main_phone", "facebook_url", "line_url", "logo_url",
  "hero_image_url", "reviews_enabled", "events_enabled"
];

function logical(overrides = {}) {
  return {
    site_name: "Takhun Trip",
    site_slogan_th: "เที่ยวบ้านตาขุน",
    site_slogan_en: "Discover Ban Ta Khun",
    default_language: "th",
    main_email: "hello@example.com",
    main_phone: "+66 77 123 456",
    facebook_url: "https://facebook.com/example",
    line_url: "https://line.me/ti/p/example",
    logo_url: "",
    hero_image_url: "",
    reviews_enabled: true,
    events_enabled: false,
    ...overrides
  };
}

function tableRows(settings = logical(), overrides = {}) {
  return KEYS.map((key, index) => ({
    sourceRowNumber: index + 2,
    values: {
      setting_key: key,
      setting_value: typeof settings[key] === "boolean" ? (settings[key] ? "TRUE" : "FALSE") : settings[key],
      description: `description-${key}`,
      updated_at: overrides.updated_at || "2026-10-13 10:00:00"
    },
    formulas: { setting_key: "", setting_value: "", description: "", updated_at: "" }
  }));
}

function load(options = {}) {
  const rows = options.rows || tableRows();
  const context = {
    JSON, Object, Math, Number, String, Array, RegExp, Date, Map, Set,
    encodeURIComponent, decodeURIComponent, isFinite,
    Utilities: {
      formatDate: (date) => date.toISOString().slice(0, 19).replace("T", " "),
      getUuid: () => "11111111-1111-4111-8111-111111111111"
    },
    Session: { getScriptTimeZone: () => "Asia/Bangkok" },
    AuthService_requireAdmin_: (token) => {
      if (token !== "token") throw new Error("UNAUTHORIZED");
      return { admin_id: "ADM-11111111-1111-4111-8111-111111111111", role: options.role || "viewer" };
    },
    SettingsService_readTable_: () => ({
      headers: ["setting_key", "setting_value", "description", "updated_at"],
      headerMap: { setting_key: 0, setting_value: 1, description: 2, updated_at: 3 },
      rows
    }),
    CryptoService_utf8Bytes_: (value) => Array.from(Buffer.from(value, "utf8")),
    CryptoService_sha256_: (bytes) => Array.from(require("node:crypto").createHash("sha256").update(Buffer.from(bytes)).digest()),
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) }
  };
  vm.createContext(context);
  for (const file of ["apps-script/SettingsService.gs", "apps-script/AdminSettingsService.gs"]) {
    const filename = path.join(root, file);
    vm.runInContext(fs.existsSync(filename) ? fs.readFileSync(filename, "utf8") : "", context, { filename: file });
  }
  context.SettingsService_readTable_ = () => ({
    headers: ["setting_key", "setting_value", "description", "updated_at"],
    headerMap: { setting_key: 0, setting_value: 1, description: 2, updated_at: 3 },
    rows
  });
  return context;
}

function required(context, name) {
  assert.equal(typeof context[name], "function", `${name} must be implemented`);
  return context[name];
}

function test(name, fn) {
  try { fn(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

test("all authenticated roles read one exact canonical projection and revision", () => {
  for (const role of ["super_admin", "editor", "reviewer", "viewer"]) {
    const context = load({ role });
    const response = plain(required(context, "adminGetSettings_")("token"));
    assert.equal(response.ok, true);
    assert.deepEqual(response.data.settings, logical());
    assert.match(response.data.revision, /^r1-[a-f0-9]{64}$/);
    assert.equal(response.message, "success");
  }
});

test("Admin reads fail closed for missing duplicate formula or invalid timestamp state", () => {
  const cases = [
    tableRows().slice(1),
    tableRows().concat([tableRows()[0]]),
    tableRows().map((row, index) => index === 0 ? { ...row, formulas: { ...row.formulas, setting_value: "=A1" } } : row),
    tableRows(logical(), { updated_at: "not-a-time" })
  ];
  for (const rows of cases) {
    const response = plain(required(load({ rows }), "adminGetSettings_")("token"));
    assert.equal(response.ok, false);
    assert.equal(response.error.code, "SETTINGS_SCHEMA");
  }
});

test("historical apostrophes and valid +66 phones round-trip as literal logical values", () => {
  const rows = tableRows(logical({ site_slogan_en: "'=historical", main_phone: "+66 81 234 5678" }));
  const response = plain(required(load({ rows }), "adminGetSettings_")("token"));
  assert.equal(response.ok, true);
  assert.equal(response.data.settings.site_slogan_en, "'=historical");
  assert.equal(response.data.settings.main_phone, "+66 81 234 5678");
});

test("request validation accepts the approved fields and rejects coercion unsafe forms", () => {
  const context = load();
  const validate = required(context, "AdminSettingsService_validateRequestSettings_");
  assert.deepEqual(plain(validate(logical())), logical());
  for (const candidate of [
    logical({ default_language: "TH" }),
    logical({ reviews_enabled: "true" }),
    logical({ main_phone: "+66077123456" }),
    logical({ main_phone: "077-call-now" }),
    logical({ main_email: "a@@example.com" }),
    logical({ facebook_url: "https://user@example.com/path" }),
    logical({ site_name: "=SUM(A1)" }),
    logical({ site_name: "'=historical" }),
    { ...logical(), maintenance_mode: false }
  ]) assert.throws(() => validate(candidate), /VALIDATION_ERROR/);
});

test("Date and equivalent timestamp strings produce the same revision", () => {
  const context = load();
  const revision = required(context, "AdminSettingsService_revision_");
  const stringRows = tableRows();
  const dateRows = tableRows().map((row) => ({ ...row, values: { ...row.values, updated_at: new Date("2026-10-13T10:00:00.000Z") } }));
  assert.equal(revision(required(context, "AdminSettingsService_canonical_")(stringRows)), revision(required(context, "AdminSettingsService_canonical_")(dateRows)));
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("Admin Settings service model verification passed.\n");
