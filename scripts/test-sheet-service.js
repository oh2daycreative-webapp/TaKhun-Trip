const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "apps-script/SheetService.gs"), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function makeSheet(initialValues) {
  const cells = initialValues.map((row) => row.slice());
  const writes = [];

  function ensureCell(row, column) {
    while (cells.length < row) cells.push([]);
    while (cells[row - 1].length < column) cells[row - 1].push("");
  }

  return {
    cells,
    writes,
    getDataRange() {
      return { getValues: () => cells.map((row) => row.slice()) };
    },
    getLastRow() {
      for (let row = cells.length - 1; row >= 0; row -= 1) {
        if (cells[row].some((value) => value !== "" && value !== null && value !== undefined)) return row + 1;
      }
      return 0;
    },
    getRange(row, column, height = 1, width = 1) {
      return {
        setValue(value) {
          assert.equal(height, 1);
          assert.equal(width, 1);
          ensureCell(row, column);
          cells[row - 1][column - 1] = value;
          writes.push({ method: "setValue", row, column, height, width, value });
        },
        setValues(values) {
          assert.equal(values.length, height);
          assert.equal(values.every((valuesRow) => valuesRow.length === width), true);
          for (let rowOffset = 0; rowOffset < height; rowOffset += 1) {
            for (let columnOffset = 0; columnOffset < width; columnOffset += 1) {
              ensureCell(row + rowOffset, column + columnOffset);
              cells[row + rowOffset - 1][column + columnOffset - 1] = values[rowOffset][columnOffset];
            }
          }
          writes.push({ method: "setValues", row, column, height, width, values: values.map((valuesRow) => valuesRow.slice()) });
        }
      };
    }
  };
}

function load(sheets) {
  const context = {
    Array,
    Date,
    JSON,
    Math,
    Number,
    Object,
    RegExp,
    String,
    getAppConfig_: () => ({ spreadsheetId: "configured" }),
    SpreadsheetApp: {
      openById(id) {
        assert.equal(id, "configured");
        return { getSheetByName: (name) => sheets[name] || null };
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "apps-script/SheetService.gs" });
  return context;
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

const HASH_STARTING_DASH = `-${"A".repeat(42)}`;
const HASH = `${"B".repeat(42)}E`;
const SALT = `${"C".repeat(21)}Q`;
const ADMIN_ID = "ADM-123e4567-e89b-12d3-a456-426614174000";
const SESSION_ID = "SES-123e4567-e89b-12d3-a456-426614174000";
const TIMESTAMP = "2026-08-08T04:30:00.000Z";

test("approved SheetService interfaces exist", () => {
  const context = load({ auth: makeSheet([["admin_id"]]) });
  for (const name of [
    "SheetService_readTable_",
    "SheetService_assertUniqueHeaders_",
    "SheetService_updateObjectAtRow_",
    "SheetService_ensureHeaders_",
    "SheetService_escapeHumanText_",
    "SheetService_writeValue_"
  ]) required(context, name);
});

test("unique headers are normalized only by trim, deterministic, exact, and case-sensitive", () => {
  const context = load({});
  const assertHeaders = required(context, "SheetService_assertUniqueHeaders_");
  const map = plain(assertHeaders([" token_hash ", "admin_id", "status"], ["admin_id", "token_hash"]));
  assert.deepEqual(map, { token_hash: 0, admin_id: 1, status: 2 });
  assert.deepEqual(
    plain(assertHeaders(["__proto__", "constructor"], [])),
    JSON.parse('{"__proto__":0,"constructor":1}')
  );
  assert.throws(() => assertHeaders(["admin_id", " admin_id "], ["admin_id"]), /header/i);
  assert.throws(() => assertHeaders(["admin_id", "Admin_id"], ["admin_id"]), /header/i);
  assert.throws(() => assertHeaders(["admin_id", ""], ["admin_id"]), /header/i);
  assert.throws(() => assertHeaders(["Admin_id", "token_hash"], ["admin_id"]), /header/i);
  assert.throws(() => assertHeaders(["admin_id"], ["admin_id", "admin_id"]), /header/i);
  assert.throws(() => assertHeaders(["admin_id"], [""]), /header/i);
});

test("readTable maps shuffled sparse rows and retains exact physical source rows", () => {
  const sheet = makeSheet([
    ["token_hash", "status", "admin_id"],
    [HASH_STARTING_DASH, "active", ADMIN_ID],
    ["", "inactive", "ADM-123e4567-e89b-12d3-a456-426614174001"],
    ["", "", ""],
    [HASH, "", "ADM-123e4567-e89b-12d3-a456-426614174002"],
    ["", "", ""]
  ]);
  const context = load({ auth: sheet });
  const table = plain(required(context, "SheetService_readTable_")("auth", ["admin_id", "token_hash", "status"]));
  assert.deepEqual(table.headers, ["token_hash", "status", "admin_id"]);
  assert.deepEqual(table.headerMap, { token_hash: 0, status: 1, admin_id: 2 });
  assert.deepEqual(table.rows, [
    { sourceRowNumber: 2, values: { token_hash: HASH_STARTING_DASH, status: "active", admin_id: ADMIN_ID } },
    { sourceRowNumber: 3, values: { token_hash: "", status: "inactive", admin_id: "ADM-123e4567-e89b-12d3-a456-426614174001" } },
    { sourceRowNumber: 5, values: { token_hash: HASH, status: "", admin_id: "ADM-123e4567-e89b-12d3-a456-426614174002" } }
  ]);
  assert.equal(table.rows.some((row) => row.sourceRowNumber === 1 || row.sourceRowNumber === 4 || row.sourceRowNumber === 6), false);
});

test("readTable fails closed for absent sheets, missing headers, and duplicate headers", () => {
  const context = load({
    missing: makeSheet([["admin_id", "status"]]),
    duplicate: makeSheet([["admin_id", "status", " admin_id "]])
  });
  const readTable = required(context, "SheetService_readTable_");
  assert.throws(() => readTable("absent", ["admin_id"]));
  assert.throws(() => readTable("missing", ["admin_id", "token_hash"]), /header/i);
  assert.throws(() => readTable("duplicate", ["admin_id"]), /header/i);
});

test("ensureHeaders appends only missing headers without reorder, overwrite, or data misalignment", () => {
  const sheet = makeSheet([
    ["status", "admin_id"],
    ["active", ADMIN_ID]
  ]);
  const before = plain(sheet.cells);
  const context = load({ admins: sheet });
  const result = plain(required(context, "SheetService_ensureHeaders_")("admins", ["admin_id", "password_hash", "status", "role"]));
  assert.deepEqual(result, {
    headers: ["status", "admin_id", "password_hash", "role"],
    headerMap: { status: 0, admin_id: 1, password_hash: 2, role: 3 },
    appendedHeaders: ["password_hash", "role"]
  });
  assert.deepEqual(sheet.cells[0], ["status", "admin_id", "password_hash", "role"]);
  assert.deepEqual(sheet.cells[1].slice(0, 2), before[1]);
  assert.deepEqual(plain(sheet.writes), [{
    method: "setValues", row: 1, column: 3, height: 1, width: 2,
    values: [["password_hash", "role"]]
  }]);
});

test("ensureHeaders refuses duplicate, conflicting, or malformed headers before writing", () => {
  for (const headers of [
    ["admin_id", "admin_id"],
    ["admin_id", " admin_id "],
    ["admin_id", ""],
    ["Admin_id"]
  ]) {
    const sheet = makeSheet([headers, ["preserve"]]);
    const context = load({ admins: sheet });
    const ensureHeaders = required(context, "SheetService_ensureHeaders_");
    assert.throws(() => ensureHeaders("admins", ["admin_id"]), /header/i);
    assert.equal(sheet.writes.length, 0);
    assert.deepEqual(sheet.cells, [headers, ["preserve"]]);
  }
});

test("ensureHeaders can initialize an empty header row without touching data rows", () => {
  const sheet = makeSheet([]);
  const context = load({ sessions: sheet });
  const result = plain(required(context, "SheetService_ensureHeaders_")("sessions", ["session_id", "token_hash"]));
  assert.deepEqual(result.headers, ["session_id", "token_hash"]);
  assert.deepEqual(result.appendedHeaders, ["session_id", "token_hash"]);
  assert.deepEqual(sheet.cells, [["session_id", "token_hash"]]);
});

test("updateObjectAtRow targets shuffled columns and leaves unspecified values untouched", () => {
  const sheet = makeSheet([
    ["status", "token_hash", "admin_id", "role"],
    ["active", HASH, ADMIN_ID, "viewer"],
    ["inactive", HASH_STARTING_DASH, "ADM-123e4567-e89b-12d3-a456-426614174001", "reviewer"]
  ]);
  const context = load({ admins: sheet });
  required(context, "SheetService_updateObjectAtRow_")("admins", 3, { role: "editor", status: "active" });
  assert.deepEqual(sheet.cells[1], ["active", HASH, ADMIN_ID, "viewer"]);
  assert.deepEqual(sheet.cells[2], ["active", HASH_STARTING_DASH, "ADM-123e4567-e89b-12d3-a456-426614174001", "editor"]);
  assert.deepEqual(plain(sheet.writes), [
    { method: "setValue", row: 3, column: 4, height: 1, width: 1, value: "editor" },
    { method: "setValue", row: 3, column: 1, height: 1, width: 1, value: "active" }
  ]);
});

test("updateObjectAtRow rejects invalid rows and fields before any write", () => {
  const sheet = makeSheet([["admin_id", "status"], [ADMIN_ID, "active"]]);
  const context = load({ admins: sheet });
  const update = required(context, "SheetService_updateObjectAtRow_");
  for (const row of [1, 0, -1, 2.5, "2", 3, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => update("admins", row, { status: "inactive" }));
  }
  assert.throws(() => update("admins", 2, { token_hash: HASH }), /header/i);
  assert.throws(() => update("admins", 2, {}));
  assert.equal(sheet.writes.length, 0);
});

test("human_text policy escapes every formula prefix and preserves ordinary strings", () => {
  const context = load({});
  const escape = required(context, "SheetService_escapeHumanText_");
  const write = required(context, "SheetService_writeValue_");
  for (const prefix of ["=", "+", "-", "@"]) {
    assert.equal(escape(`${prefix}payload`), `'${prefix}payload`);
    assert.equal(write("human_text", "display_name", `${prefix}payload`), `'${prefix}payload`);
  }
  assert.equal(write("human_text", "email", "operator@example.test"), "operator@example.test");
  assert.throws(() => write("human_text", "display_name", 123));
  assert.throws(() => write("human_text", "token_hash", HASH_STARTING_DASH));
  assert.throws(() => write("human_text", "unknown_field", "text"));
});

test("security policy validates fields and returns valid values byte-for-byte", () => {
  const context = load({});
  const write = required(context, "SheetService_writeValue_");
  const valid = {
    token_hash: HASH_STARTING_DASH,
    password_hash: HASH,
    password_salt: SALT,
    admin_id: ADMIN_ID,
    session_id: SESSION_ID,
    username: "operator.name-1",
    password_algorithm: "pbkdf2_sha256",
    role: "super_admin",
    status: "active",
    created_at: TIMESTAMP,
    password_iterations: 120000
  };
  for (const [field, value] of Object.entries(valid)) assert.strictEqual(write("security", field, value), value);
  assert.equal(write("security", "revoked_at", ""), "");
  assert.equal(write("security", "last_login_at", ""), "");
});

test("security policy rejects malformed, noncanonical, coerced, and unknown values", () => {
  const context = load({});
  const write = required(context, "SheetService_writeValue_");
  const invalid = [
    ["token_hash", `=${"A".repeat(42)}`],
    ["token_hash", `${"A".repeat(42)}B`],
    ["password_hash", `${"A".repeat(43)}=`],
    ["password_salt", `${"A".repeat(21)}E`],
    ["admin_id", "ADM-001"],
    ["session_id", "SES-not-a-uuid"],
    ["username", "Operator"],
    ["password_algorithm", "PBKDF2_SHA256"],
    ["role", "admin"],
    ["status", "pending"],
    ["created_at", "2026-08-08T04:30:00Z"],
    ["created_at", "2026-02-30T04:30:00.000Z"],
    ["password_iterations", "120000"],
    ["password_iterations", 99999],
    ["password_iterations", 1000001],
    ["unknown_field", "value"]
  ];
  for (const [field, value] of invalid) assert.throws(() => write("security", field, value), `${field} should reject malformed values`);
  assert.throws(() => write("trusted", "token_hash", HASH));
});

test("dash-prefixed base64url security value writes and reads back unchanged", () => {
  const sheet = makeSheet([["admin_id", "token_hash"], [ADMIN_ID, HASH]]);
  const context = load({ sessions: sheet });
  const write = required(context, "SheetService_writeValue_");
  const update = required(context, "SheetService_updateObjectAtRow_");
  const prepared = write("security", "token_hash", HASH_STARTING_DASH);
  update("sessions", 2, { token_hash: prepared });
  const table = plain(required(context, "SheetService_readTable_")("sessions", ["token_hash", "admin_id"]));
  assert.equal(sheet.cells[1][1], HASH_STARTING_DASH);
  assert.equal(table.rows[0].values.token_hash, HASH_STARTING_DASH);
  assert.equal(table.rows[0].values.token_hash.startsWith("'"), false);
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("SheetService verification passed.\n");
