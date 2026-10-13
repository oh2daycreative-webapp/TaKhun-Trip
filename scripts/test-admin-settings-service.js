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
  const cacheValues = new Map([["public:getSettings", "stale"]]);
  const writes = [];
  let writeCount = 0;
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
    CacheService: { getScriptCache: () => ({
      get: (key) => cacheValues.has(key) ? cacheValues.get(key) : null,
      remove: (key) => { if (options.cacheRemoveFailure) throw new Error("cache remove"); cacheValues.delete(key); }
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => options.lockFailure ? false : true, releaseLock() {} }) },
    SpreadsheetApp: { flush: () => { if (options.flushFailure) throw new Error("flush"); } },
    SheetService_readTable_: () => ({ headers: ["log_id", "admin_id", "action", "entity_type", "entity_id", "description", "created_at", "audit_id", "actor_admin_id", "occurred_at"], rows: [] }),
    SheetService_getSheet_: (name) => name === "settings" ? { getRange(row, column) { return { setValue(value) { writeCount += 1; writes.push({ row, column, value }); if (options.failWriteAt === writeCount) throw new Error("write failure"); const key = column === 2 ? "setting_value" : "updated_at"; const entry = rows.find(item => item.sourceRowNumber === row); if (options.coerceFormula && key === "setting_value") { entry.values[key] = value; entry.formulas[key] = "=COERCED()"; } else entry.values[key] = options.readBackMismatch && key === "setting_value" ? "mismatch" : value; } }; }, getLastRow: () => rows.length + 1, getName: () => "settings" } : ({ getLastRow: () => 1, getName: () => "activity_logs" }),
    SheetService_prepareAppendDestination_: (_sheet, headers) => ({ sheet: { getName: () => "activity_logs", getLastRow: () => 1 }, headers, sourceRowNumber: 2 }),
    SheetService_appendObjectWithRow_: () => ({ sourceRowNumber: 2 }),
    console
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
  if (!options.productionWriter) context.AdminSettingsService_setCell_ = (entry, field, value) => {
    writeCount += 1;
    writes.push({ row: entry.sourceRowNumber, field, value });
    if (options.failWriteAt === writeCount) throw new Error("write failure");
    entry.values[field] = options.readBackMismatch && field === "setting_value" ? "mismatch" : value;
  };
  if (!options.productionAudit) context.AdminSettingsService_audit_ = () => options.auditStatus || "recorded";
  return { context, rows, writes, cacheValues };
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
    const { context } = load({ role });
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
    const response = plain(required(load({ rows }).context, "adminGetSettings_")("token"));
    assert.equal(response.ok, false);
    assert.equal(response.error.code, "SETTINGS_SCHEMA");
  }
});

test("historical apostrophes and valid +66 phones round-trip as literal logical values", () => {
  const rows = tableRows(logical({ site_slogan_en: "'=historical", main_phone: "+66 81 234 5678" }));
  const response = plain(required(load({ rows }).context, "adminGetSettings_")("token"));
  assert.equal(response.ok, true);
  assert.equal(response.data.settings.site_slogan_en, "'=historical");
  assert.equal(response.data.settings.main_phone, "+66 81 234 5678");
});

test("request validation accepts the approved fields and rejects coercion unsafe forms", () => {
  const { context } = load();
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
  const { context } = load();
  const revision = required(context, "AdminSettingsService_revision_");
  const stringRows = tableRows();
  const dateRows = tableRows().map((row) => ({ ...row, values: { ...row.values, updated_at: new Date("2026-10-13T10:00:00.000Z") } }));
  assert.equal(revision(required(context, "AdminSettingsService_canonical_")(stringRows)), revision(required(context, "AdminSettingsService_canonical_")(dateRows)));
});

test("super admin full replacement writes only changed value and timestamp cells after cache invalidation", () => {
  const harness = load({ role: "super_admin" });
  const current = plain(required(harness.context, "adminGetSettings_")("token"));
  const replacement = logical({ site_name: "Takhun Trip New", main_phone: "+66 81 234 5678" });
  const response = plain(required(harness.context, "updateSettings_")("token", { expected_revision: current.data.revision, settings: replacement }));
  assert.equal(response.ok, true);
  assert.equal(response.data.changed, true);
  assert.equal(response.data.audit_status, "recorded");
  assert.deepEqual(response.data.settings, replacement);
  assert.notEqual(response.data.revision, current.data.revision);
  assert.equal(harness.cacheValues.has("public:getSettings"), false);
  assert.deepEqual(harness.writes.map((write) => write.field), ["setting_value", "updated_at", "setting_value", "updated_at"]);
  assert.deepEqual(new Set(harness.writes.map((write) => write.row)), new Set([2, 7]));
});

test("no-op keeps revision cache timestamps and audit untouched", () => {
  const harness = load({ role: "super_admin" });
  const current = plain(required(harness.context, "adminGetSettings_")("token"));
  const response = plain(required(harness.context, "updateSettings_")("token", { expected_revision: current.data.revision, settings: logical() }));
  assert.deepEqual(response, { ok: true, data: { settings: logical(), revision: current.data.revision, changed: false, audit_status: "not_applicable" }, message: "success" });
  assert.deepEqual(harness.writes, []);
  assert.equal(harness.cacheValues.has("public:getSettings"), true);
});

test("writes reject non-super-admin stale and malformed full replacements before persistence", () => {
  for (const fixture of [
    { harness: load({ role: "editor" }), revision: /^r1-/ },
    { harness: load({ role: "super_admin" }), revision: "r1-" + "0".repeat(64) }
  ]) {
    const current = plain(required(fixture.harness.context, "adminGetSettings_")("token"));
    const expected = typeof fixture.revision === "string" ? fixture.revision : current.data.revision;
    const response = plain(required(fixture.harness.context, "updateSettings_")("token", { expected_revision: expected, settings: logical({ site_name: "Changed" }) }));
    assert.equal(response.ok, false);
    assert.equal(response.error.code, typeof fixture.revision === "string" ? "CONFLICT" : "FORBIDDEN");
    assert.deepEqual(fixture.harness.writes, []);
  }
  const malformed = load({ role: "super_admin" });
  const response = plain(required(malformed.context, "updateSettings_")("token", { expected_revision: "bad", settings: logical() }));
  assert.equal(response.error.code, "VALIDATION_ERROR");
  assert.deepEqual(malformed.writes, []);
});

test("partial value timestamp flush and read-back failures remain OUTCOME_UNKNOWN with cache absent", () => {
  for (const options of [{ failWriteAt: 2 }, { flushFailure: true }, { readBackMismatch: true }]) {
    const harness = load({ role: "super_admin", ...options });
    const current = plain(required(harness.context, "adminGetSettings_")("token"));
    const response = plain(required(harness.context, "updateSettings_")("token", { expected_revision: current.data.revision, settings: logical({ site_name: "Changed" }) }));
    assert.equal(response.ok, false);
    assert.deepEqual(response.error, { code: "OUTCOME_UNKNOWN", message: "The result is uncertain. Reload and reconcile; do not retry automatically.", retryable: false });
    assert.equal(harness.cacheValues.has("public:getSettings"), false);
  }
});

test("cache invalidation failure occurs before the first scattered write", () => {
  const harness = load({ role: "super_admin", cacheRemoveFailure: true });
  const current = plain(required(harness.context, "adminGetSettings_")("token"));
  const response = plain(required(harness.context, "updateSettings_")("token", { expected_revision: current.data.revision, settings: logical({ site_name: "Changed" }) }));
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "SERVER_ERROR");
  assert.deepEqual(harness.writes, []);
});

test("production cell writer reports value timestamp and formula coercion failures without touching unrelated cells", () => {
  for (const options of [{ failWriteAt: 1 }, { failWriteAt: 2 }, { coerceFormula: true }]) {
    const rows = tableRows();
    rows[0].values.description = "keep-me";
    rows[0].formulas.description = "=UNRELATED()";
    const harness = load({ role: "super_admin", rows, productionWriter: true, ...options });
    const current = plain(required(harness.context, "adminGetSettings_")("token"));
    const response = plain(required(harness.context, "updateSettings_")("token", { expected_revision: current.data.revision, settings: logical({ site_name: "Changed" }) }));
    assert.equal(response.error.code, "OUTCOME_UNKNOWN");
    assert.equal(rows[0].values.description, "keep-me");
    assert.equal(rows[0].formulas.description, "=UNRELATED()");
    assert.equal(harness.cacheValues.has("public:getSettings"), false);
  }
});

test("production audit helper classifies every post-persistence audit failure as unconfirmed", () => {
  for (const stage of ["uuid", "read", "prepare", "append", "flush", "verify"]) {
    const harness = load({ role: "super_admin", productionAudit: true });
    const context = harness.context;
    if (stage === "uuid") context.Utilities.getUuid = () => { throw new Error("uuid"); };
    if (stage === "read") context.SheetService_readTable_ = () => { throw new Error("read"); };
    if (stage === "prepare") context.SheetService_prepareAppendDestination_ = () => { throw new Error("prepare"); };
    if (stage === "append") context.SheetService_appendObjectWithRow_ = () => { throw new Error("append"); };
    if (stage === "flush") context.SpreadsheetApp.flush = () => { throw new Error("flush"); };
    if (stage === "verify") context.SheetService_readTable_ = (() => { let calls=0; return () => ++calls===1 ? { headers:["log_id","admin_id","action","entity_type","entity_id","description","created_at","audit_id","actor_admin_id","occurred_at"], rows:[] } : { headers:[], rows:[] }; })();
    const status = context.AdminSettingsService_audit_({ admin_id:"ADM-1" }, "r1-"+"a".repeat(64), ["site_name"], "2026-10-13 10:00:01");
    assert.equal(status, "unconfirmed", stage);
  }
});

test("verified settings persistence remains a known success when production audit fails", () => {
  const harness = load({ role: "super_admin", productionAudit: true });
  const current = plain(required(harness.context, "adminGetSettings_")("token"));
  harness.context.Utilities.getUuid = () => { throw new Error("uuid"); };
  const response = plain(required(harness.context, "updateSettings_")("token", { expected_revision: current.data.revision, settings: logical({ site_name: "Changed" }) }));
  assert.equal(response.ok, true);
  assert.equal(response.data.changed, true);
  assert.equal(response.data.audit_status, "unconfirmed");
  assert.equal(response.data.settings.site_name, "Changed");
});

test("audit destination preflight failure is mutation-free and remains distinct from audit warning", () => {
  const harness = load({ role: "super_admin", productionAudit: true });
  const current = plain(required(harness.context, "adminGetSettings_")("token"));
  harness.context.SheetService_prepareAppendDestination_ = () => { throw new Error("preflight"); };
  const response = plain(required(harness.context, "updateSettings_")("token", { expected_revision: current.data.revision, settings: logical({ site_name: "Changed" }) }));
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "SERVER_ERROR");
  assert.deepEqual(harness.writes, []);
  assert.equal(harness.cacheValues.has("public:getSettings"), true);
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("Admin Settings service model verification passed.\n");
