"use strict";
// apps-script/MediaUploadSchema.gs: the media_uploads sheet contract (spec v5.2 T5), the upload settings
// (T9, D10) and setupMediaUploadsSheet(), which the owner runs once per environment from the Apps Script editor.
// Runs Config.gs + MediaUploadSchema.gs unmodified in a vm against a fake spreadsheet that records every write.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(ROOT, "apps-script", name), "utf8");
const SCHEMA = read("MediaUploadSchema.gs");
const CONFIG = read("Config.gs");
let passed = 0;
function test(name, body) {
  try { body(); passed += 1; process.stdout.write(`ok - ${name}\n`); }
  catch (error) { process.stderr.write(`not ok - ${name}\n${error.stack}\n`); process.exitCode = 1; }
}
const code = (fn) => { try { fn(); return "OK"; } catch (error) { return error.message; } };

const HEADERS = [
  "upload_id", "entity_type", "entity_id", "status", "object_state", "is_cover", "sort_order", "format", "sha256",
  "key_large", "key_small", "width_large", "height_large", "bytes_large", "width_small", "height_small", "bytes_small",
  "caption_th", "caption_en", "created_at", "created_by", "updated_at", "updated_by", "deleted_at", "deleted_by"
];

// Fake sheet: a grid of values and number formats (default "" = Automatic). Records writes.
function fakeSheet(name, rows, writes, options = {}) {
  const maxRows = options.maxRows || 1000, maxColumns = options.maxColumns || 26;
  const values = rows.map((row) => row.slice());
  const formats = Array.from({ length: maxRows }, (_, r) => Array.from({ length: maxColumns }, (_, c) => (options.formats ? options.formats(r + 1, c + 1) : "")));
  let frozen = 0;
  const cell = (r, c) => (values[r - 1] && values[r - 1][c - 1] !== undefined ? values[r - 1][c - 1] : "");
  const sheet = {
    getName: () => name,
    getLastRow: () => values.filter((row) => row.some((v) => v !== "")).length,
    getLastColumn: () => values.reduce((max, row) => Math.max(max, row.reduce((last, v, i) => (v !== "" ? i + 1 : last), 0)), 0),
    getMaxRows: () => maxRows,
    getMaxColumns: () => maxColumns,
    getFrozenRows: () => frozen,
    setFrozenRows: (n) => { writes.push(["setFrozenRows", name, n]); frozen = n; },
    getRange(row, column, numRows = 1, numColumns = 1) {
      assert.ok(row >= 1 && column >= 1 && row + numRows - 1 <= maxRows && column + numColumns - 1 <= maxColumns, "range in bounds");
      return {
        getValues: () => Array.from({ length: numRows }, (_, r) => Array.from({ length: numColumns }, (_, c) => (options.readBack ? options.readBack(row + r, column + c, cell(row + r, column + c)) : cell(row + r, column + c)))),
        getNumberFormats: () => Array.from({ length: numRows }, (_, r) => Array.from({ length: numColumns }, (_, c) => formats[row + r - 1][column + c - 1])),
        setValues(grid) {
          writes.push(["setValues", name, row, column, numRows, numColumns]);
          assert.equal(grid.length, numRows); grid.forEach((line) => assert.equal(line.length, numColumns));
          grid.forEach((line, r) => line.forEach((v, c) => { values[row + r - 1] = values[row + r - 1] || []; values[row + r - 1][column + c - 1] = v; }));
        },
        setNumberFormat(format) {
          writes.push(["setNumberFormat", name, row, column, numRows, numColumns, format]);
          for (let r = 0; r < numRows; r += 1) for (let c = 0; c < numColumns; c += 1) formats[row + r - 1][column + c - 1] = format;
        }
      };
    }
  };
  return sheet;
}

function load({ sheets = {}, props = { SPREADSHEET_ID: "staging-spreadsheet-id" }, lock = true, insertOptions = {} } = {}) {
  const writes = [], logs = [], requested = [], lockEvents = [];
  const spreadsheet = {
    getSheetByName: (name) => { requested.push(name); return sheets[name] || null; },
    insertSheet: (name) => {
      writes.push(["insertSheet", name]);
      sheets[name] = fakeSheet(name, [], writes, insertOptions);
      return sheets[name];
    }
  };
  const context = {
    console: { log: (line) => logs.push(String(line)) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (name) => (Object.prototype.hasOwnProperty.call(props, name) ? props[name] : null) }) },
    SpreadsheetApp: { openById: (id) => { assert.equal(id, props.SPREADSHEET_ID); return spreadsheet; }, flush: () => writes.push(["flush"]) },
    LockService: { getScriptLock: () => ({
      tryLock: (ms) => { lockEvents.push(["tryLock", ms]); return lock; },
      releaseLock: () => lockEvents.push(["release"])
    }) }
  };
  vm.createContext(context);
  vm.runInContext(CONFIG, context, { filename: "apps-script/Config.gs" });
  vm.runInContext(SCHEMA, context, { filename: "apps-script/MediaUploadSchema.gs" });
  return { context, writes, logs, requested, lockEvents, sheets };
}

test("sheet contract: name, 25 unique headers in order, limits and allowed values", () => {
  const { context } = load();
  assert.equal(context.MediaUploadSchema_SHEET_NAME_, "media_uploads");
  assert.deepEqual(Array.from(context.MediaUploadSchema_HEADERS_), HEADERS);
  assert.equal(new Set(HEADERS).size, 25);
  assert.equal(context.MediaUploadSchema_PER_PLACE_LIMIT_, 20);
  assert.equal(context.MediaUploadSchema_DAILY_LIMIT_DEFAULT_, 100);
  assert.equal(context.MediaUploadSchema_CAPTION_MAX_, 200);
  assert.deepEqual(Array.from(context.MediaUploadSchema_STATUSES_), ["active", "deleted"]);
  assert.deepEqual(Array.from(context.MediaUploadSchema_OBJECT_STATES_), ["stored", "delete_pending", "deleted"]);
  assert.deepEqual(Array.from(context.MediaUploadSchema_FORMATS_), ["webp", "jpeg"]);
});

test("settings: uploads enabled only when MEDIA_UPLOAD_ENABLED is exactly \"true\" (T9 default off)", () => {
  for (const [value, expected] of [[null, false], ["false", false], ["TRUE", false], [" true", false], ["1", false], ["yes", false], ["true", true]]) {
    const { context } = load({ props: { MEDIA_UPLOAD_ENABLED: value } });
    assert.equal(context.MediaUploadSchema_settings_().enabled, expected, String(value));
  }
});

test("settings: MEDIA_UPLOAD_DAILY_LIMIT 1-500, otherwise the default 100 (D10)", () => {
  for (const [value, expected] of [[null, 100], ["", 100], ["250", 250], ["1", 1], ["500", 500], ["0", 100], ["501", 100], ["-5", 100],
    ["1.5", 100], ["abc", 100], [" 100", 100], ["0100", 100], ["1e2", 100]]) {
    const { context } = load({ props: { MEDIA_UPLOAD_DAILY_LIMIT: value } });
    assert.equal(context.MediaUploadSchema_settings_().dailyLimit, expected, String(value));
  }
});

test("settings never return or log R2 values", () => {
  const env = load({ props: { MEDIA_UPLOAD_ENABLED: "true", R2_SECRET_ACCESS_KEY: "s3cr3t", R2_ACCESS_KEY_ID: "AKID" } });
  const settings = env.context.MediaUploadSchema_settings_();
  assert.deepEqual(Object.keys(settings).sort(), ["dailyLimit", "enabled"]);
  assert.equal(JSON.stringify(settings).includes("s3cr3t"), false);
});

test("setup on a spreadsheet without media_uploads: creates it, all 25 columns plain text (@) on every row, header row, frozen", () => {
  const env = load();
  const result = env.context.setupMediaUploadsSheet();
  assert.deepEqual({ ...result }, { status: "CREATED", sheet: "media_uploads", columns: 25 });
  const sheet = env.sheets.media_uploads;
  assert.deepEqual(sheet.getRange(1, 1, 1, 25).getValues()[0], HEADERS);
  assert.ok(sheet.getRange(1, 1, 1000, 25).getNumberFormats().every((row) => row.every((f) => f === "@")), "every row formatted @");
  assert.equal(sheet.getFrozenRows(), 1);
  assert.deepEqual(env.writes.map((w) => w[0]), ["insertSheet", "setNumberFormat", "setValues", "setFrozenRows", "flush"]);
  assert.deepEqual(env.writes[1], ["setNumberFormat", "media_uploads", 1, 1, 1000, 25, "@"], "format before values");
  assert.deepEqual(env.lockEvents, [["tryLock", 10000], ["release"]]);
  assert.deepEqual(env.logs, ["media_uploads setup: CREATED (25 columns)"]);
});

test("setup again on the correct sheet: ALREADY_OK, zero writes", () => {
  const env = load();
  env.context.setupMediaUploadsSheet();
  const writesAfterCreate = env.writes.length;
  const again = env.context.setupMediaUploadsSheet();
  assert.equal(again.status, "ALREADY_OK");
  assert.equal(env.writes.length, writesAfterCreate);
  assert.equal(env.logs.at(-1), "media_uploads setup: ALREADY_OK");
});

test("an existing sheet with other headers is refused with zero writes (missing, extra, reordered, renamed, empty)", () => {
  const variants = [
    [HEADERS.slice(0, 24)], [[...HEADERS, "extra"]], [[HEADERS[1], HEADERS[0], ...HEADERS.slice(2)]],
    [[...HEADERS.slice(0, 24), "Deleted_By"]], [], [[...HEADERS], ["UPL-x", "place"]].slice(0, 1).map((row) => row.map((h) => ` ${h}`))
  ];
  for (const rows of variants) {
    const writes = [];
    const env = load({ sheets: { media_uploads: fakeSheet("media_uploads", rows, writes) } });
    assert.equal(code(() => env.context.setupMediaUploadsSheet()), "MEDIA_UPLOADS_HEADERS", JSON.stringify(rows[0] || []).slice(0, 60));
    assert.deepEqual(env.writes.concat(writes), []);
    assert.deepEqual(env.lockEvents, [["tryLock", 10000], ["release"]]);
  }
});

test("an existing sheet with the right headers but a column not plain text is refused with zero writes", () => {
  const writes = [];
  const sheet = fakeSheet("media_uploads", [HEADERS], writes, { formats: (row, column) => (column === 7 && row === 500 ? "0" : "@") });
  const env = load({ sheets: { media_uploads: sheet } });
  assert.equal(code(() => env.context.setupMediaUploadsSheet()), "MEDIA_UPLOADS_FORMAT");
  assert.deepEqual(writes, []);
});

test("an existing correct sheet that already holds rows is left alone (ALREADY_OK)", () => {
  const writes = [];
  const sheet = fakeSheet("media_uploads", [HEADERS, ["UPL-1", "place", "BTK-001"]], writes, { formats: () => "@" });
  const env = load({ sheets: { media_uploads: sheet } });
  assert.equal(env.context.setupMediaUploadsSheet().status, "ALREADY_OK");
  assert.deepEqual(writes, []);
});

test("lock busy: MEDIA_UPLOADS_LOCK and no spreadsheet access", () => {
  const env = load({ lock: false });
  assert.equal(code(() => env.context.setupMediaUploadsSheet()), "MEDIA_UPLOADS_LOCK");
  assert.deepEqual(env.requested, []);
  assert.deepEqual(env.writes, []);
  assert.deepEqual(env.lockEvents, [["tryLock", 10000]]);
});

test("verification failure after creating: MEDIA_UPLOADS_VERIFY (the sheet is left for the owner to inspect)", () => {
  const env = load({ insertOptions: { readBack: (row, column, value) => (row === 1 && column === 3 ? "entity" : value) } });
  assert.equal(code(() => env.context.setupMediaUploadsSheet()), "MEDIA_UPLOADS_VERIFY");
  assert.deepEqual(env.lockEvents.at(-1), ["release"]);
});

test("no SPREADSHEET_ID: MEDIA_UPLOADS_CONFIG and no writes", () => {
  const env = load({ props: {} });
  assert.equal(code(() => env.context.setupMediaUploadsSheet()), "MEDIA_UPLOADS_CONFIG");
  assert.deepEqual(env.writes, []);
});

test("only the media_uploads sheet is ever requested or created", () => {
  const env = load();
  env.context.setupMediaUploadsSheet();
  env.context.setupMediaUploadsSheet();
  assert.deepEqual([...new Set(env.requested)], ["media_uploads"]);
  assert.deepEqual(env.writes.filter((w) => w[0] !== "flush").map((w) => w[1]).filter((n) => n !== "media_uploads"), []);
});

test("setup is owner-only: not reachable from Router or any other apps-script file", () => {
  for (const name of fs.readdirSync(path.join(ROOT, "apps-script")).filter((n) => n.endsWith(".gs") && n !== "MediaUploadSchema.gs")) {
    assert.equal(read(name).includes("setupMediaUploadsSheet"), false, `${name} must not reference setupMediaUploadsSheet`);
  }
});

test("no top-level calls to Apps Script services (safe in any file load order)", () => {
  assert.doesNotThrow(() => vm.runInContext(SCHEMA, vm.createContext({}), { filename: "apps-script/MediaUploadSchema.gs" }));
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write(`${passed} MediaUploadSchema tests passed\n`);
