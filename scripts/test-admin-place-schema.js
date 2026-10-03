const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const sheetServiceSource = fs.readFileSync(path.join(root, "apps-script/SheetService.gs"), "utf8");
const schemaPath = path.join(root, "apps-script/AdminPlaceSchema.gs");
const schemaSource = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, "utf8") : "";
const plain = (value) => JSON.parse(JSON.stringify(value));

const PLACE_BASE_HEADERS = [
  "place_id", "name_th", "name_en", "slug", "district", "province", "route_group", "category", "sub_category",
  "short_description_th", "short_description_en", "description_th", "description_en", "activities_th", "activities_en",
  "highlight_th", "highlight_en", "phone", "line_url", "facebook_url", "website_url", "google_maps_url", "latitude",
  "longitude", "coordinate_status", "open_time_th", "open_time_en", "fee_th", "fee_en", "cover_image_url",
  "gallery_image_urls", "video_url", "tags", "recommended_duration", "best_time_th", "best_time_en", "nearby_place_ids",
  "is_featured", "is_main_route_point", "sort_order", "status", "created_at", "updated_at"
];
const PLACE_APPEND_HEADERS = [
  "address_th", "address_en", "facilities_th", "facilities_en", "gallery_media_ids", "entity_version",
  "published_version", "created_by", "updated_by", "published_at", "published_by", "archived_at", "archived_by"
];
const DRAFT_HEADERS = [
  "place_id", "name_th", "name_en", "slug", "district", "province", "route_group", "category", "sub_category",
  "short_description_th", "short_description_en", "description_th", "description_en", "activities_th", "activities_en",
  "highlight_th", "highlight_en", "address_th", "address_en", "facilities_th", "facilities_en", "phone", "line_url",
  "facebook_url", "website_url", "google_maps_url", "latitude", "longitude", "coordinate_status", "open_time_th",
  "open_time_en", "fee_th", "fee_en", "cover_image_url", "gallery_image_urls", "video_url", "tags",
  "recommended_duration", "best_time_th", "best_time_en", "nearby_place_ids", "is_featured", "is_main_route_point",
  "sort_order", "gallery_media_ids", "draft_version", "base_published_version", "created_at", "updated_at", "created_by",
  "updated_by"
];
const ACTIVITY_HEADERS = ["log_id", "admin_id", "action", "entity_type", "entity_id", "description", "created_at"];
const ACTIVITY_APPEND_HEADERS = ["audit_id", "actor_admin_id", "occurred_at"];
const ACTOR = "ADM-123e4567-e89b-12d3-a456-426614174000";

function makeSheet(name, initialValues, writeLog) {
  const cells = initialValues.map((row) => row.slice());
  function ensureCell(row, column) {
    while (cells.length < row) cells.push([]);
    while (cells[row - 1].length < column) cells[row - 1].push("");
  }
  function valuesFor(row, column, height, width) {
    return Array.from({ length: height }, (_, rowOffset) =>
      Array.from({ length: width }, (_, columnOffset) =>
        cells[row + rowOffset - 1]?.[column + columnOffset - 1] ?? ""));
  }
  return {
    name,
    cells,
    getLastRow() {
      for (let index = cells.length - 1; index >= 0; index -= 1) {
        if (cells[index].some((value) => value !== "" && value !== null && value !== undefined)) return index + 1;
      }
      return 0;
    },
    getLastColumn() {
      return cells[0]?.length || 0;
    },
    getDataRange() {
      return { getValues: () => cells.map((row) => row.slice()) };
    },
    getRange(row, column, height = 1, width = 1) {
      return {
        getValues: () => valuesFor(row, column, height, width),
        setValue(value) {
          assert.equal(height, 1);
          assert.equal(width, 1);
          ensureCell(row, column);
          cells[row - 1][column - 1] = value;
          writeLog.push({ sheet: name, method: "setValue", row, column, height, width, value });
          return this;
        },
        setValues(values) {
          assert.equal(values.length, height);
          assert.equal(values.every((item) => item.length === width), true);
          values.forEach((item, rowOffset) => item.forEach((value, columnOffset) => {
            ensureCell(row + rowOffset, column + columnOffset);
            cells[row + rowOffset - 1][column + columnOffset - 1] = value;
          }));
          writeLog.push({ sheet: name, method: "setValues", row, column, height, width, values: plain(values) });
          return this;
        },
        clearContent() {
          for (let rowOffset = 0; rowOffset < height; rowOffset += 1) {
            for (let columnOffset = 0; columnOffset < width; columnOffset += 1) {
              ensureCell(row + rowOffset, column + columnOffset);
              cells[row + rowOffset - 1][column + columnOffset - 1] = "";
            }
          }
          writeLog.push({ sheet: name, method: "clearContent", row, column, height, width });
          return this;
        }
      };
    }
  };
}

function makeEnvironment(initialSheets, initialProperties = {}) {
  const writes = [];
  const propertyWrites = [];
  const sheets = Object.create(null);
  Object.entries(initialSheets).forEach(([name, values]) => { sheets[name] = makeSheet(name, values, writes); });
  const properties = { ...initialProperties };
  const lock = {
    acquired: 0,
    released: 0,
    tryLock(timeout) { assert.equal(timeout, 10000); this.acquired += 1; return true; },
    releaseLock() { this.released += 1; }
  };
  const spreadsheet = {
    getSheetByName: (name) => sheets[name] || null,
    insertSheet(name) {
      assert.equal(Boolean(sheets[name]), false);
      sheets[name] = makeSheet(name, [], writes);
      writes.push({ sheet: name, method: "insertSheet" });
      return sheets[name];
    }
  };
  const scriptProperties = {
    getProperty: (name) => Object.prototype.hasOwnProperty.call(properties, name) ? properties[name] : null,
    setProperty(name, value) { properties[name] = value; propertyWrites.push({ method: "setProperty", name, value }); return this; },
    deleteProperty(name) { delete properties[name]; propertyWrites.push({ method: "deleteProperty", name }); return this; }
  };
  const context = {
    Array, Date, JSON, Math, Number, Object, RegExp, String,
    getAppConfig_: () => ({ spreadsheetId: "configured" }),
    SpreadsheetApp: { openById(id) { assert.equal(id, "configured"); return spreadsheet; } },
    LockService: { getScriptLock: () => lock },
    PropertiesService: { getScriptProperties: () => scriptProperties },
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      computeDigest(algorithm, text, charset) {
        assert.equal(algorithm, "SHA_256");
        assert.equal(charset, "UTF_8");
        return Array.from(crypto.createHash("sha256").update(text, "utf8").digest(), (byte) => byte > 127 ? byte - 256 : byte);
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(sheetServiceSource, context, { filename: "apps-script/SheetService.gs" });
  vm.runInContext(schemaSource, context, { filename: "apps-script/AdminPlaceSchema.gs" });
  return { context, sheets, writes, propertyWrites, properties, lock };
}

function required(context, name) {
  assert.equal(typeof context[name], "function", `${name} must be implemented`);
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

// User-confirmed disposable Sheets probe: these two formats preserve true and false.
function formatFixture(sheetCode) {
  const versions = sheetCode === "PLACES" ? ["entity_version", "published_version"] : ["draft_version", "base_published_version"];
  const headers = ["is_featured", "is_main_route_point", ...versions, "latitude", "longitude", "sort_order", "name_th", "created_at", "updated_at"];
  const record = { is_featured: false, is_main_route_point: true, [versions[0]]: 1, [versions[1]]: 0,
    latitude: "", longitude: "", sort_order: "", name_th: "private content", created_at: "2026-10-03T13:40:46.986Z", updated_at: "2026-10-03T13:40:46.986Z" };
  return { headers, record, formats: [headers.map((_, index) => index < 2 ? "0.###############" : "@")] };
}
function formatValidator() {
  const context = vm.createContext({});
  // No Spreadsheet, Range, Properties or Lock services: policy must be pure.
  vm.runInContext(schemaSource, context);
  assert.equal(Array.isArray(context.AdminPlaceSchema_CREATE_BOOLEAN_FORMATS_), true, "verified Boolean format policy must exist");
  assert.deepEqual(plain(context.AdminPlaceSchema_CREATE_BOOLEAN_FORMATS_), ["0.###############", "0"]);
  assert.equal(Object.isFrozen(context.AdminPlaceSchema_CREATE_BOOLEAN_FORMATS_), true);
  return required(context, "AdminPlaceSchema_assertCreateDestinationFormats_");
}

test("Create format policy accepts only probe-verified Boolean formats without mutation", () => {
  const validate = formatValidator();
  for (const sheetCode of ["PLACES", "DRAFTS"]) {
    for (const value of [false, true]) {
      for (const format of ["0.###############", "0"]) {
        const { headers, record, formats } = formatFixture(sheetCode);
        record.is_featured = value; record.is_main_route_point = value;
        formats[0][0] = format; formats[0][1] = format;
        headers.reverse(); formats[0].reverse();
        const before = JSON.stringify({ headers, record, formats });
        Object.freeze(headers); Object.freeze(record); Object.freeze(formats[0]); Object.freeze(formats);
        assert.equal(validate(sheetCode, headers, record, formats), true);
        assert.equal(JSON.stringify({ headers, record, formats }), before);
      }
      for (const field of ["is_featured", "is_main_route_point"]) {
        for (const unsupported of ["@", "", "General", "yyyy-mm-dd", "private arbitrary format"]) {
          const f = formatFixture(sheetCode); f.record[field] = value;
          f.formats[0][f.headers.indexOf(field)] = unsupported;
          const before = JSON.stringify(f);
          assert.throws(() => validate(sheetCode, f.headers, f.record, f.formats), { message: "ADMIN_PLACE_FORMAT_UNSUPPORTED" });
          assert.equal(JSON.stringify(f), before);
        }
      }
    }
  }
});

test("Create format policy imposes no version or optional numeric format restrictions", () => {
  const validate = formatValidator();
  for (const sheetCode of ["PLACES", "DRAFTS"]) {
    for (const format of ["@", "", "0", "0.###############", "yyyy-mm-dd"]) {
      for (const value of [0, 1, 1.25, "", null, undefined, "12", false]) {
        const f = formatFixture(sheetCode);
        for (let index = 2; index < 7; index += 1) {
          f.formats[0][index] = format;
          if (index >= 4) f.record[f.headers[index]] = value;
        }
        assert.equal(validate(sheetCode, f.headers, f.record, f.formats), true);
      }
    }
  }
});

test("Create format policy leaves Strings and timestamps unchanged with unrestricted formats", () => {
  const validate = formatValidator();
  const f = formatFixture("DRAFTS");
  for (const field of ["place_id", "description_th", "tags", "nearby_place_ids"]) {
    f.headers.push(field); f.record[field] = "private String"; f.formats[0].push("");
  }
  f.formats[0][f.headers.indexOf("created_at")] = "yyyy-mm-dd";
  const before = JSON.stringify(f);
  assert.equal(validate("DRAFTS", f.headers, f.record, f.formats), true);
  assert.equal(JSON.stringify(f), before);
});

test("Create format policy rejects malformed relevant inputs with controlled errors", () => {
  const validate = formatValidator();
  for (const matrix of [undefined, null, [], [[]], [["0"]], [[], []], "private", [new Array(10)], [Array(10).fill(null)]]) {
    const { headers, record } = formatFixture("PLACES");
    assert.throws(() => validate("PLACES", headers, record, matrix), { message: "ADMIN_PLACE_FORMAT_INPUT" });
  }
  for (const code of ["places", "PLACE_DRAFTS", "private", null]) {
    const f = formatFixture("PLACES");
    assert.throws(() => validate(code, f.headers, f.record, f.formats), { message: "ADMIN_PLACE_FORMAT_INPUT" });
  }
  for (const mutate of [
    (f) => { f.headers[0] = "unknown"; }, (f) => { f.headers[1] = f.headers[0]; },
    (f) => { f.headers[1] = "IS_FEATURED"; }, (f) => { f.headers[0] = " is_featured "; },
    (f) => { delete f.record.is_featured; }, (f) => { f.record.is_featured = "false"; },
    (f) => { f.record = null; }, (f) => { f.headers = null; }
  ]) {
    const f = formatFixture("PLACES"); mutate(f);
    assert.throws(() => validate("PLACES", f.headers, f.record, f.formats), { message: "ADMIN_PLACE_FORMAT_INPUT" });
  }
});

function row(headers, values) {
  return headers.map((header) => Object.prototype.hasOwnProperty.call(values, header) ? values[header] : "");
}

function baseSheets(placeRows = []) {
  return {
    places: [PLACE_BASE_HEADERS.slice(), ...placeRows.map((values) => row(PLACE_BASE_HEADERS, values))],
    activity_logs: [ACTIVITY_HEADERS.slice(), row(ACTIVITY_HEADERS, {
      log_id: "LOG-1", admin_id: ACTOR, action: "login", entity_type: "admin", entity_id: ACTOR,
      description: "preserve", created_at: "2026-08-01 00:00:00"
    })]
  };
}

function sha256Ids(ids) {
  return crypto.createHash("sha256").update([...new Set(ids)].sort().join("\n"), "utf8").digest("hex");
}

function migrationProperties(ids, overrides = {}) {
  return {
    ADMIN_PLACE_MIGRATION_ENABLED: "true",
    ADMIN_PLACE_MIGRATION_BACKUP_REFERENCE: "backup-2026-08-10",
    ADMIN_PLACE_MIGRATION_EXPECTED_ROW_COUNT: String(ids.length),
    ADMIN_PLACE_MIGRATION_EXPECTED_IDS_SHA256: sha256Ids(ids),
    ADMIN_PLACE_MIGRATION_ACTOR_ADMIN_ID: ACTOR,
    ...overrides
  };
}

test("approved schema constants and non-routed editor functions exist", () => {
  const { context } = makeEnvironment(baseSheets());
  for (const name of [
    "setupAdminPlaceSchema", "inspectAdminPlaceStatusMigration", "migrateAdminPlaceLegacyStatuses",
    "verifyAdminPlaceStatusMigration"
  ]) required(context, name);
  assert.deepEqual(plain(context.AdminPlaceSchema_PLACES_APPEND_HEADERS_), PLACE_APPEND_HEADERS);
  assert.deepEqual(plain(context.AdminPlaceSchema_DRAFT_HEADERS_), DRAFT_HEADERS);
  assert.deepEqual(plain(context.AdminPlaceSchema_ACTIVITY_APPEND_HEADERS_), ACTIVITY_APPEND_HEADERS);
});

test("setup creates exact draft schema and appends only approved headers without rewriting data", () => {
  const originalPlace = { place_id: "P-1", name_th: "Original", status: "published", created_at: "legacy-created", updated_at: "legacy-updated" };
  const env = makeEnvironment(baseSheets([originalPlace]));
  const beforePlace = plain(env.sheets.places.cells[1]);
  const beforeActivity = plain(env.sheets.activity_logs.cells[1]);
  required(env.context, "setupAdminPlaceSchema")();
  assert.deepEqual(env.sheets.places.cells[0], [...PLACE_BASE_HEADERS, ...PLACE_APPEND_HEADERS]);
  assert.deepEqual(env.sheets.places.cells[1].slice(0, PLACE_BASE_HEADERS.length), beforePlace);
  assert.deepEqual(env.sheets.activity_logs.cells[0], [...ACTIVITY_HEADERS, ...ACTIVITY_APPEND_HEADERS]);
  assert.deepEqual(env.sheets.activity_logs.cells[1].slice(0, ACTIVITY_HEADERS.length), beforeActivity);
  assert.deepEqual(env.sheets.place_drafts.cells[0], DRAFT_HEADERS);
});

test("setup preserves unknown columns, appends missing headers, and a second setup performs zero writes", () => {
  const sheets = baseSheets([{ place_id: "P-1", status: "published" }]);
  sheets.places[0].splice(2, 0, "unknown_place_column");
  sheets.places[1].splice(2, 0, "keep-place");
  sheets.activity_logs[0].push("unknown_audit_column");
  sheets.activity_logs[1].push("keep-audit");
  sheets.place_drafts = [["unknown_draft_column"]];
  const env = makeEnvironment(sheets);
  required(env.context, "setupAdminPlaceSchema")();
  assert.equal(env.sheets.places.cells[1][2], "keep-place");
  assert.equal(env.sheets.activity_logs.cells[1].at(-1), "keep-audit");
  assert.equal(env.sheets.place_drafts.cells[0][0], "unknown_draft_column");
  env.writes.length = 0;
  required(env.context, "setupAdminPlaceSchema")();
  assert.deepEqual(env.writes, []);
});

test("setup fails before mutation for duplicate headers and malformed Place or draft identity", () => {
  const cases = [];
  const duplicateHeaders = baseSheets();
  duplicateHeaders.places[0].push(" place_id ");
  cases.push(duplicateHeaders);
  cases.push(baseSheets([{ place_id: "P-1", status: "published" }, { place_id: "P-1", status: "draft" }]));
  cases.push(baseSheets([{ place_id: "", name_th: "populated", status: "draft" }]));
  const duplicateDraft = baseSheets([{ place_id: "P-1", status: "published" }]);
  duplicateDraft.place_drafts = [DRAFT_HEADERS, row(DRAFT_HEADERS, { place_id: "P-1", draft_version: 1 }), row(DRAFT_HEADERS, { place_id: "P-1", draft_version: 1 })];
  cases.push(duplicateDraft);
  const blankDraftId = baseSheets([{ place_id: "P-1", status: "published" }]);
  blankDraftId.place_drafts = [DRAFT_HEADERS, row(DRAFT_HEADERS, { name_th: "invalid", draft_version: 1 })];
  cases.push(blankDraftId);
  for (const sheets of cases) {
    const env = makeEnvironment(sheets);
    assert.throws(() => required(env.context, "setupAdminPlaceSchema")());
    assert.deepEqual(env.writes, []);
  }
});

test("fully blank compensated draft rows are ignored by setup validation", () => {
  const sheets = baseSheets([{ place_id: "P-1", status: "published" }]);
  sheets.place_drafts = [DRAFT_HEADERS.slice(), DRAFT_HEADERS.map(() => "")];
  const env = makeEnvironment(sheets);
  assert.doesNotThrow(() => required(env.context, "setupAdminPlaceSchema")());
});

test("setup rejects an active draft whose versions do not match its owning Place", () => {
  const sheets = baseSheets([{ place_id: "P-1", status: "draft" }]);
  sheets.places[0].push(...PLACE_APPEND_HEADERS);
  sheets.places[1].push(...PLACE_APPEND_HEADERS.map((header) => ({ entity_version: 1, published_version: 0 }[header] ?? "")));
  sheets.place_drafts = [DRAFT_HEADERS.slice(), row(DRAFT_HEADERS, {
    place_id: "P-1", draft_version: 2, base_published_version: 0
  })];
  const env = makeEnvironment(sheets);
  assert.throws(() => required(env.context, "setupAdminPlaceSchema")(), /version/i);
  assert.deepEqual(env.writes, []);
});

test("dry-run is write-free and maps every legacy status deterministically", () => {
  const statuses = ["published", "draft", "hidden", "archived", "deleted"];
  const ids = statuses.map((_, index) => `P-${index + 1}`);
  const env = makeEnvironment(baseSheets(statuses.map((status, index) => ({ place_id: ids[index], name_th: `Name ${index}`, status }))));
  required(env.context, "setupAdminPlaceSchema")();
  env.writes.length = 0;
  env.propertyWrites.length = 0;
  const report = plain(required(env.context, "inspectAdminPlaceStatusMigration")());
  assert.deepEqual(report.source_status_counts, { published: 1, draft: 1, hidden: 1, archived: 1, deleted: 1 });
  assert.deepEqual(report.status_counts, { published: 1, draft: 2, archived: 2 });
  assert.equal(report.proposed_draft_count, 2);
  assert.equal(report.row_count, 5);
  assert.equal(report.ids_sha256, sha256Ids(ids));
  assert.deepEqual(env.writes, []);
  assert.deepEqual(env.propertyWrites, []);
});

test("dry-run fails closed without writes for a partly initialized source", () => {
  const sheets = baseSheets([{ place_id: "P-1", status: "published" }]);
  sheets.places[0].push(...PLACE_APPEND_HEADERS);
  sheets.places[1].push(...PLACE_APPEND_HEADERS.map((header) => header === "updated_by" ? ACTOR : ""));
  sheets.place_drafts = [DRAFT_HEADERS.slice()];
  const env = makeEnvironment(sheets);
  assert.throws(() => required(env.context, "inspectAdminPlaceStatusMigration")(), /mixed/i);
  assert.deepEqual(env.writes, []);
  assert.deepEqual(env.propertyWrites, []);
});

test("migration requires all controls and fails closed on count, hash, actor, unknown status, or initialized data", () => {
  const id = "P-1";
  const scenarios = [
    migrationProperties([id], { ADMIN_PLACE_MIGRATION_ENABLED: "false" }),
    migrationProperties([id], { ADMIN_PLACE_MIGRATION_BACKUP_REFERENCE: "" }),
    migrationProperties([id], { ADMIN_PLACE_MIGRATION_EXPECTED_ROW_COUNT: "2" }),
    migrationProperties([id], { ADMIN_PLACE_MIGRATION_EXPECTED_IDS_SHA256: "0".repeat(64) }),
    migrationProperties([id], { ADMIN_PLACE_MIGRATION_ACTOR_ADMIN_ID: "ADM-invalid" })
  ];
  for (const properties of scenarios) {
    const env = makeEnvironment({
      ...baseSheets([{ place_id: id, status: "hidden" }]),
      place_drafts: [DRAFT_HEADERS]
    }, properties);
    env.sheets.places.cells[0].push(...PLACE_APPEND_HEADERS);
    assert.throws(() => required(env.context, "migrateAdminPlaceLegacyStatuses")());
    assert.deepEqual(env.writes, []);
  }
  for (const place of [
    { place_id: id, status: "unknown" },
    { place_id: id, status: "published", entity_version: 1 },
    { place_id: id, status: "published", created_by: ACTOR }
  ]) {
    const sheets = baseSheets([place]);
    sheets.places[0].push(...PLACE_APPEND_HEADERS);
    sheets.places[1].push(...PLACE_APPEND_HEADERS.map((header) => place[header] ?? ""));
    sheets.place_drafts = [DRAFT_HEADERS];
    const env = makeEnvironment(sheets, migrationProperties([id]));
    assert.throws(() => required(env.context, "migrateAdminPlaceLegacyStatuses")());
    assert.deepEqual(env.writes, []);
  }
});

test("migration actor accepts the established case-insensitive Admin UUID grammar", () => {
  const id = "P-1";
  const uppercaseActor = "ADM-123E4567-E89B-12D3-A456-426614174000";
  const env = makeEnvironment(baseSheets([{ place_id: id, status: "published" }]), migrationProperties([id], {
    ADMIN_PLACE_MIGRATION_ACTOR_ADMIN_ID: uppercaseActor
  }));
  required(env.context, "setupAdminPlaceSchema")();
  const result = plain(required(env.context, "migrateAdminPlaceLegacyStatuses")());
  assert.equal(result.verified, true);
  const place = plain(required(env.context, "SheetService_readTable_")("places", ["place_id", "created_by"])).rows[0].values;
  assert.equal(place.created_by, uppercaseActor);
});

test("migration copies draft content before neutralizing identity rows and retains published and archived snapshots", () => {
  const source = [
    { place_id: "P-PUB", name_th: "Published", status: "published", created_at: "legacy-1", updated_at: "old" },
    { place_id: "P-DRAFT", name_th: "Draft", status: "draft", created_at: "legacy-2", updated_at: "old", is_featured: true },
    { place_id: "P-HIDDEN", name_th: "Hidden", status: "hidden", created_at: "legacy-3", updated_at: "old", is_main_route_point: true },
    { place_id: "P-ARCH", name_th: "Archived", status: "archived", created_at: "legacy-4", updated_at: "old" },
    { place_id: "P-DEL", name_th: "Deleted", status: "deleted", created_at: "legacy-5", updated_at: "old" }
  ];
  const ids = source.map((place) => place.place_id);
  const env = makeEnvironment(baseSheets(source), migrationProperties(ids));
  required(env.context, "setupAdminPlaceSchema")();
  env.writes.length = 0;
  env.propertyWrites.length = 0;
  const report = plain(required(env.context, "migrateAdminPlaceLegacyStatuses")());
  assert.equal(report.verified, true);
  const places = plain(required(env.context, "SheetService_readTable_")("places", ["place_id", "status", "entity_version", "published_version"])).rows.map((item) => item.values);
  const byId = Object.fromEntries(places.map((place) => [place.place_id, place]));
  assert.deepEqual([byId["P-PUB"].status, byId["P-PUB"].entity_version, byId["P-PUB"].published_version], ["published", 1, 1]);
  assert.deepEqual([byId["P-DRAFT"].status, byId["P-DRAFT"].entity_version, byId["P-DRAFT"].published_version], ["draft", 1, 0]);
  assert.deepEqual([byId["P-HIDDEN"].status, byId["P-HIDDEN"].entity_version, byId["P-HIDDEN"].published_version], ["draft", 1, 0]);
  assert.deepEqual([byId["P-ARCH"].status, byId["P-ARCH"].entity_version, byId["P-ARCH"].published_version], ["archived", 1, 1]);
  assert.deepEqual([byId["P-DEL"].status, byId["P-DEL"].entity_version, byId["P-DEL"].published_version], ["archived", 1, 1]);
  assert.equal(byId["P-DRAFT"].name_th, "");
  assert.equal(byId["P-DRAFT"].is_featured, false);
  assert.equal(byId["P-HIDDEN"].name_th, "");
  assert.equal(byId["P-PUB"].name_th, "Published");
  assert.equal(byId["P-DEL"].name_th, "Deleted");
  assert.equal(byId["P-DRAFT"].created_at, "legacy-2");
  assert.equal(byId["P-DRAFT"].updated_by, ACTOR);
  assert.match(byId["P-DRAFT"].updated_at, /^\d{4}-\d{2}-\d{2}T/);
  const drafts = plain(required(env.context, "SheetService_readTable_")("place_drafts", DRAFT_HEADERS)).rows.map((item) => item.values);
  assert.deepEqual(drafts.map((draft) => draft.place_id).sort(), ["P-DRAFT", "P-HIDDEN"]);
  for (const draft of drafts) {
    assert.equal(draft.name_th, draft.place_id === "P-DRAFT" ? "Draft" : "Hidden");
    assert.equal(draft.draft_version, 1);
    assert.equal(draft.base_published_version, 0);
    assert.equal(draft.created_by, ACTOR);
    assert.equal(draft.updated_by, ACTOR);
  }
  assert.equal(env.sheets.places.cells.length, 6);
  assert.equal(env.properties.ADMIN_PLACE_MIGRATION_ENABLED, "false");
  for (const name of [
    "ADMIN_PLACE_MIGRATION_BACKUP_REFERENCE", "ADMIN_PLACE_MIGRATION_EXPECTED_ROW_COUNT",
    "ADMIN_PLACE_MIGRATION_EXPECTED_IDS_SHA256", "ADMIN_PLACE_MIGRATION_ACTOR_ADMIN_ID"
  ]) assert.equal(Object.prototype.hasOwnProperty.call(env.properties, name), false);
  assert.equal(env.lock.acquired >= 2, true);
  assert.equal(env.lock.released, env.lock.acquired);
});

test("migration rejects duplicate Place or draft IDs before writes", () => {
  const placeCases = [
    [{ place_id: "P-1", status: "draft" }, { place_id: "P-1", status: "draft" }],
    [{ place_id: "", name_th: "invalid", status: "draft" }]
  ];
  for (const places of placeCases) {
    const sheets = baseSheets(places);
    sheets.places[0].push(...PLACE_APPEND_HEADERS);
    sheets.places.slice(1).forEach((item) => item.push(...PLACE_APPEND_HEADERS.map(() => "")));
    sheets.place_drafts = [DRAFT_HEADERS];
    const ids = places.map((place) => place.place_id).filter(Boolean);
    const env = makeEnvironment(sheets, migrationProperties(ids));
    assert.throws(() => required(env.context, "migrateAdminPlaceLegacyStatuses")());
    assert.deepEqual(env.writes, []);
  }
  const sheets = baseSheets([{ place_id: "P-1", status: "draft" }]);
  sheets.places[0].push(...PLACE_APPEND_HEADERS);
  sheets.places[1].push(...PLACE_APPEND_HEADERS.map(() => ""));
  sheets.place_drafts = [DRAFT_HEADERS, row(DRAFT_HEADERS, { place_id: "P-1" }), row(DRAFT_HEADERS, { place_id: "P-1" })];
  const env = makeEnvironment(sheets, migrationProperties(["P-1"]));
  assert.throws(() => required(env.context, "migrateAdminPlaceLegacyStatuses")());
  assert.deepEqual(env.writes, []);
});

test("verification is read-only and checks the migrated representation", () => {
  const id = "P-1";
  const sheets = baseSheets([{ place_id: id, status: "published" }]);
  const env = makeEnvironment(sheets, migrationProperties([id]));
  required(env.context, "setupAdminPlaceSchema")();
  required(env.context, "migrateAdminPlaceLegacyStatuses")();
  env.writes.length = 0;
  env.propertyWrites.length = 0;
  const report = plain(required(env.context, "verifyAdminPlaceStatusMigration")());
  assert.equal(report.verified, true);
  assert.equal(report.row_count, 1);
  assert.equal(report.ids_sha256, sha256Ids([id]));
  assert.deepEqual(env.writes, []);
  assert.deepEqual(env.propertyWrites, []);
});

test("migration functions are unreachable from Router and ordinary API modules", () => {
  const forbidden = [
    "setupAdminPlaceSchema", "inspectAdminPlaceStatusMigration", "migrateAdminPlaceLegacyStatuses",
    "verifyAdminPlaceStatusMigration"
  ];
  const appFiles = fs.readdirSync(path.join(root, "apps-script"))
    .filter((name) => name.endsWith(".gs") && name !== "AdminPlaceSchema.gs");
  for (const file of appFiles) {
    const source = fs.readFileSync(path.join(root, "apps-script", file), "utf8");
    for (const name of forbidden) assert.equal(source.includes(name), false, `${file} must not invoke ${name}`);
  }
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("Admin Place schema verification passed.\n");
