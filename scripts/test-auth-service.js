"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const servicePath = path.join(root, "apps-script/AuthService.gs");
assert.equal(
  fs.existsSync(servicePath),
  true,
  "apps-script/AuthService.gs must exist before auth contracts can run"
);

const configSource = fs.readFileSync(path.join(root, "apps-script/Config.gs"), "utf8");
const serviceSource = fs.readFileSync(servicePath, "utf8");

const ADMIN_HEADERS = [
  "admin_id", "username", "display_name", "email", "password_algorithm", "password_hash",
  "password_salt", "password_iterations", "role", "status", "last_login_at", "created_at", "updated_at"
];
const SESSION_HEADERS = [
  "session_id", "admin_id", "token_hash", "created_at", "expires_at", "revoked_at", "last_seen_at"
];
const NOW = Date.parse("2026-08-08T04:30:00.000Z");
const TOKEN_BYTES = Array.from({ length: 32 }, (_, index) => 255 - index);
const RAW_TOKEN = Buffer.from(TOKEN_BYTES).toString("base64url");
const TOKEN_HASH = crypto.createHash("sha256").update(RAW_TOKEN, "utf8").digest("base64url");
const OTHER_TOKEN = Buffer.from(Array.from({ length: 32 }, (_, index) => index)).toString("base64url");
const SYNTHETIC_RANDOM_KEY = Buffer.from(Array(32).fill(0x5a)).toString("base64url");
const BOOTSTRAP_PASSWORD = "SYNTHETIC bootstrap passphrase 2026";
const BENCHMARK_PASSWORD = "takhun-admin-fixed-benchmark-password";
const BENCHMARK_SALT = Array.from({ length: 16 }, (_, index) => index);
const BENCHMARK_HASH = crypto.pbkdf2Sync(
  BENCHMARK_PASSWORD,
  Buffer.from(BENCHMARK_SALT),
  120000,
  32,
  "sha256"
).toString("base64url");
const AUTH_ERROR = {
  ok: false,
  error: { code: "UNAUTHORIZED", message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }
};
const SESSION_ERROR = {
  ok: false,
  error: { code: "UNAUTHORIZED", message: "กรุณาเข้าสู่ระบบ" }
};

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function pbkdf2Fixture(password, saltBytes, iterations) {
  return Array.from(crypto.createHash("sha256")
    .update(String(iterations), "utf8")
    .update(Buffer.from(saltBytes))
    .update(password, "utf8")
    .digest());
}

function hashFor(password, salt, iterations) {
  return Buffer.from(pbkdf2Fixture(password, Buffer.from(salt, "base64url"), iterations)).toString("base64url");
}

function makeAdmin(overrides = {}) {
  const password = overrides.fixturePassword || "Correct Horse Battery Staple";
  const salt = overrides.password_salt || Buffer.from(Array.from({ length: 16 }, (_, index) => index + 1)).toString("base64url");
  const iterations = overrides.password_iterations ?? 120000;
  return {
    admin_id: "ADM-11111111-1111-4111-8111-111111111111",
    username: "operator",
    display_name: "ผู้ดูแลระบบ",
    email: "operator@example.test",
    password_algorithm: "pbkdf2_sha256",
    password_hash: overrides.password_hash || hashFor(password, salt, iterations),
    password_salt: salt,
    password_iterations: iterations,
    role: "super_admin",
    status: "active",
    last_login_at: "",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides
  };
}

function makeSession(overrides = {}) {
  const created = "2026-08-08T00:00:00.000Z";
  return {
    session_id: "SES-22222222-2222-4222-8222-222222222222",
    admin_id: "ADM-11111111-1111-4111-8111-111111111111",
    token_hash: TOKEN_HASH,
    created_at: created,
    expires_at: "2026-08-08T08:00:00.000Z",
    revoked_at: "",
    last_seen_at: created,
    ...overrides
  };
}

function createRuntime(options = {}) {
  const state = {
    now: options.now ?? NOW,
    tables: {
      admins: (options.admins || [makeAdmin()]).map((row) => ({ ...row })),
      admin_sessions: (options.sessions || []).map((row) => ({ ...row }))
    },
    events: [],
    writes: [],
    logs: [],
    pbkdf2Calls: [],
    utf8Inputs: [],
    constantTimeCalls: [],
    hashTokenCalls: [],
    sheetReads: [],
    cacheValues: new Map(),
    cacheCalls: [],
    readCounts: { admins: 0, admin_sessions: 0 },
    lockHeld: false,
    lockAttempts: 0,
    randomReleased: false,
    uuidValues: [...(options.uuidValues || ["33333333-3333-4333-8333-333333333333"])],
    tokenByteValues: (options.tokenByteValues || []).map((bytes) => Array.from(bytes))
  };

  for (const [key, entry] of Object.entries(options.cacheValues || {})) {
    state.cacheValues.set(key, { value: String(entry.value ?? entry), expiresAt: entry.expiresAt ?? Infinity });
  }

  function secretSafeLog(...values) {
    const rendered = values.map(String).join(" ");
    state.logs.push(rendered);
    for (const secret of [
      options.password || "Correct Horse Battery Staple", RAW_TOKEN, OTHER_TOKEN,
      TOKEN_HASH, "ADMIN_AUTH_RANDOM_KEY", "request body"
    ]) {
      assert.equal(rendered.includes(secret), false, "AuthService must never log secret or request material");
    }
  }

  function failRead(sheetName) {
    const requested = options.failRead;
    if (!requested) return false;
    if (typeof requested === "string") return requested === sheetName;
    return requested.sheet === sheetName && requested.at === state.readCounts[sheetName];
  }

  const lock = {
    tryLock(timeout) {
      state.lockAttempts += 1;
      state.events.push(`lock:try:${timeout}`);
      if (options.failLockAt === state.lockAttempts || options.failAllLocks) return false;
      state.lockHeld = true;
      state.events.push("lock:acquired");
      return true;
    },
    releaseLock() {
      state.events.push("lock:released");
      state.lockHeld = false;
    },
    hasLock() {
      return state.lockHeld;
    }
  };

  const cache = {
    get(key) {
      state.cacheCalls.push({ method: "get", key, lockHeld: state.lockHeld });
      state.events.push(`cache:get:${key}`);
      if (options.failCache) throw new Error("synthetic cache read failure");
      const entry = state.cacheValues.get(key);
      if (!entry || entry.expiresAt <= state.now) {
        state.cacheValues.delete(key);
        return null;
      }
      return entry.value;
    },
    put(key, value, ttlSeconds) {
      state.cacheCalls.push({ method: "put", key, value: String(value), ttlSeconds, lockHeld: state.lockHeld });
      state.events.push(`cache:put:${key}:${value}:${ttlSeconds}`);
      if (options.failCache) throw new Error("synthetic cache write failure");
      state.cacheValues.set(key, { value: String(value), expiresAt: state.now + ttlSeconds * 1000 });
    },
    remove(key) {
      state.cacheCalls.push({ method: "remove", key, lockHeld: state.lockHeld });
      state.events.push(`cache:remove:${key}`);
      if (options.failCacheRemove || options.failCache) throw new Error("synthetic cache remove failure");
      state.cacheValues.delete(key);
    }
  };

  class FakeDate extends Date {
    constructor(value) {
      super(arguments.length ? value : state.now);
    }
    static now() {
      const value = state.now;
      if (options.advanceNowEveryCall) state.now += options.advanceNowEveryCall;
      return value;
    }
  }

  const context = {
    Array,
    Date: FakeDate,
    Error,
    JSON,
    Math,
    Number,
    Object,
    RegExp,
    String,
    TypeError,
    RangeError,
    ADMIN_PBKDF2_ITERATIONS_: 120000,
    console: { log: secretSafeLog, debug: secretSafeLog, info: secretSafeLog, warn: secretSafeLog, error: secretSafeLog },
    Logger: { log: secretSafeLog },
    PropertiesService: {
      getScriptProperties() {
        return { getProperty: () => "configured" };
      }
    },
    CacheService: { getScriptCache: () => cache },
    LockService: { getScriptLock: () => lock },
    Utilities: {
      getUuid() {
        state.events.push("uuid:session");
        if (!state.uuidValues.length) throw new Error("synthetic UUID exhaustion");
        return state.uuidValues.shift();
      }
    },
    SheetService_readTable_(sheetName, requiredHeaders) {
      state.readCounts[sheetName] += 1;
      state.events.push(`sheet:read:${sheetName}:${state.readCounts[sheetName]}`);
      state.sheetReads.push({ sheetName, count: state.readCounts[sheetName], lockHeld: state.lockHeld });
      if (failRead(sheetName)) throw new Error("synthetic Sheet read failure");
      const expectedHeaders = sheetName === "admins" ? ADMIN_HEADERS : SESSION_HEADERS;
      assert.deepEqual(Array.from(requiredHeaders), expectedHeaders, `${sheetName} must use its configured required headers`);
      return {
        headers: expectedHeaders.slice(),
        headerMap: Object.fromEntries(expectedHeaders.map((header, index) => [header, index])),
        rows: state.tables[sheetName].map((row, index) => ({ sourceRowNumber: index + 2, values: { ...row } }))
      };
    },
    SheetService_updateObjectAtRow_(sheetName, sourceRowNumber, record) {
      state.events.push(`sheet:update:${sheetName}:${Object.keys(record).join(",")}`);
      if (options.failUpdate) throw new Error("synthetic Sheet update failure");
      const row = state.tables[sheetName][sourceRowNumber - 2];
      if (!row) throw new Error("synthetic missing source row");
      Object.assign(row, record);
      state.writes.push({ method: "update", sheetName, sourceRowNumber, record: { ...record } });
    },
    SheetService_writeValue_(policy, fieldName, value) {
      state.events.push(`sheet:validate:${fieldName}`);
      assert.equal(policy, "security");
      return value;
    },
    appendSheetObject_(sheetName, requiredHeaders, record) {
      state.events.push(`sheet:append:${sheetName}`);
      assert.equal(sheetName, "admin_sessions");
      assert.deepEqual(Array.from(requiredHeaders), SESSION_HEADERS);
      if (options.failAppend) throw new Error("synthetic session append failure");
      const keys = Object.keys(record);
      assert.deepEqual(keys, SESSION_HEADERS, "session append must be one complete header-ordered record");
      state.tables.admin_sessions.push({ ...record });
      state.writes.push({ method: "append", sheetName, record: { ...record } });
    },
    CryptoService_utf8Bytes_(value) {
      state.utf8Inputs.push(value);
      if (typeof value !== "string" || /[\uD800-\uDFFF]/.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""))) {
        throw new Error("UTF-8 input is malformed.");
      }
      return Array.from(Buffer.from(value, "utf8"));
    },
    CryptoService_sha256_(bytes) {
      return Array.from(crypto.createHash("sha256").update(Buffer.from(bytes)).digest());
    },
    CryptoService_pbkdf2Sha256_(password, saltBytes, iterations) {
      state.events.push(`crypto:pbkdf2:${iterations}`);
      state.pbkdf2Calls.push({ password, saltBytes: Array.from(saltBytes), iterations });
      return pbkdf2Fixture(password, saltBytes, iterations);
    },
    CryptoService_base64UrlEncode_(bytes) {
      return Buffer.from(bytes).toString("base64url");
    },
    CryptoService_base64UrlDecode_(value) {
      if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
        throw new Error("Invalid base64url value.");
      }
      const decoded = Buffer.from(value, "base64url");
      if (decoded.toString("base64url") !== value) throw new Error("Invalid base64url value.");
      return Array.from(decoded);
    },
    CryptoService_constantTimeEqual_(left, right) {
      state.constantTimeCalls.push({ left: Array.from(left || []), right: Array.from(right || []) });
      let difference = left.length ^ right.length;
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        difference |= (left[index] || 0) ^ (right[index] || 0);
      }
      return difference === 0;
    },
    CryptoService_hashToken_(rawToken) {
      state.events.push("crypto:hash-token");
      state.hashTokenCalls.push(rawToken);
      if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) throw new Error("Raw session token is invalid.");
      return crypto.createHash("sha256").update(rawToken, "utf8").digest("base64url");
    },
    CryptoService_randomBytesLocked_(purpose, length) {
      state.events.push("random:entered");
      assert.equal(state.lockHeld, true, "random derivation must run under caller-held script lock");
      assert.equal(purpose, "admin-session-token");
      assert.equal(length, 32);
      if (options.failRandomBeforeCounter) throw new Error("synthetic counter persistence failure");
      state.events.push("random:counter-persisted");
      if (options.failRandomAfterCounter) throw new Error("synthetic token derivation failure");
      state.events.push("random:derived");
      state.randomReleased = true;
      return state.tokenByteValues.length ? state.tokenByteValues.shift() : TOKEN_BYTES.slice();
    }
  };

  vm.createContext(context);
  vm.runInContext(configSource, context, { filename: "apps-script/Config.gs" });
  vm.runInContext(
    options.authServiceSourceOverride === undefined ? serviceSource : options.authServiceSourceOverride,
    context,
    { filename: "apps-script/AuthService.gs" }
  );
  return { context, state };
}

function createTask5Runtime(options = {}) {
  const initialProperties = {
    SPREADSHEET_ID: "configured",
    ADMIN_AUTH_RANDOM_KEY: SYNTHETIC_RANDOM_KEY,
    ADMIN_AUTH_RANDOM_COUNTER: "0",
    ADMIN_AUTH_STATE_VERSION: "1",
    ADMIN_BOOTSTRAP_ENABLED: "true",
    ADMIN_BOOTSTRAP_USERNAME: "first.operator",
    ADMIN_BOOTSTRAP_DISPLAY_NAME: "Synthetic Operator",
    ADMIN_BOOTSTRAP_EMAIL: "operator@example.test",
    ADMIN_BOOTSTRAP_PASSWORD: BOOTSTRAP_PASSWORD,
    ...(options.properties || {})
  };
  for (const name of options.absentProperties || []) delete initialProperties[name];

  const state = {
    now: options.now ?? NOW,
    nowValues: [...(options.nowValues || [])],
    properties: { ...initialProperties },
    propertyCalls: [],
    events: [],
    logs: [],
    lockHeld: false,
    lockAttempts: 0,
    headers: {
      admins: [...(Object.hasOwn(options, "adminHeaders") ? options.adminHeaders : ADMIN_HEADERS)],
      admin_sessions: options.sessionSheetMissing ? null : [
        ...(Object.hasOwn(options, "sessionHeaders") ? options.sessionHeaders : SESSION_HEADERS)
      ]
    },
    tables: {
      admins: (options.admins || []).map((row) => ({ ...row })),
      admin_sessions: (options.sessions || []).map((row) => ({ ...row }))
    },
    sheetReads: [],
    sheetWrites: [],
    readCounts: { admins: 0, admin_sessions: 0 },
    pbkdf2Calls: [],
    randomCalls: [],
    writePolicies: [],
    appendAttempts: 0,
    uuidValues: [...(options.uuidValues || ["55555555-5555-4555-8555-555555555555"])]
  };

  function safeLog(...values) {
    const rendered = values.map(String).join(" ");
    state.logs.push(rendered);
    for (const secret of [SYNTHETIC_RANDOM_KEY, BOOTSTRAP_PASSWORD]) {
      assert.equal(rendered.includes(secret), false, "Task 5 functions must not log secrets");
    }
  }

  const lock = {
    tryLock(timeout) {
      state.lockAttempts += 1;
      state.events.push(`lock:try:${timeout}`);
      if (options.throwTryLock) throw new Error("synthetic tryLock secret detail");
      if (options.failLock) return false;
      state.lockHeld = true;
      state.events.push("lock:acquired");
      return true;
    },
    releaseLock() {
      state.events.push("lock:release-attempted");
      state.lockHeld = false;
      if (options.throwReleaseLock) throw new Error("synthetic releaseLock secret detail");
      state.events.push("lock:released");
    },
    hasLock() {
      return state.lockHeld;
    }
  };

  const scriptProperties = {
    getProperty(name) {
      state.propertyCalls.push({ method: "get", name, lockHeld: state.lockHeld });
      state.events.push(`property:get:${name}`);
      if (options.forbidPersistentAccess) throw new Error("forbidden persistent property access");
      if (options.failPropertyRead === name) throw new Error("synthetic property read failure");
      if (options.cleanupVerificationFailure === name && state.events.includes("cleanup:verification")) {
        return "synthetic-leftover";
      }
      return Object.hasOwn(state.properties, name) ? state.properties[name] : null;
    },
    setProperty(name, value) {
      state.propertyCalls.push({ method: "set", name, value, lockHeld: state.lockHeld });
      state.events.push(`property:set:${name}:${value}`);
      if (options.forbidPersistentAccess) throw new Error("forbidden persistent property write");
      if (options.failPropertySet === name ||
          (options.failRandomCounterPersistence && name === "ADMIN_AUTH_RANDOM_COUNTER" && state.randomCalls.length)) {
        throw new Error("synthetic property write failure");
      }
      state.properties[name] = String(value);
      return scriptProperties;
    },
    deleteProperty(name) {
      state.propertyCalls.push({ method: "delete", name, lockHeld: state.lockHeld });
      state.events.push(`property:delete:${name}`);
      if (options.failPropertyDelete === name) throw new Error("synthetic property delete failure");
      if (options.stickyDeleteProperty !== name) delete state.properties[name];
      return scriptProperties;
    }
  };

  function assertUniqueHeaders(headers, requiredHeaders) {
    if (!Array.isArray(headers) || !Array.isArray(requiredHeaders || [])) throw new Error("synthetic invalid headers");
    const exact = Object.create(null);
    const folded = Object.create(null);
    headers.forEach((header, index) => {
      if (typeof header !== "string" || !header.trim()) throw new Error("synthetic malformed headers");
      const normalized = header.trim();
      if (Object.hasOwn(exact, normalized) || Object.hasOwn(folded, normalized.toLowerCase())) {
        throw new Error("synthetic duplicate headers");
      }
      exact[normalized] = index;
      folded[normalized.toLowerCase()] = true;
    });
    for (const required of requiredHeaders || []) {
      if (!Object.hasOwn(exact, required)) throw new Error("synthetic missing header");
    }
    return exact;
  }

  function sheetValues(name) {
    const headers = state.headers[name];
    if (headers === null) return [];
    if (!headers.length && !state.tables[name].length) return [];
    return [headers.slice()].concat(state.tables[name].map((record) => headers.map((header) =>
      Object.hasOwn(record, header) ? record[header] : ""
    )));
  }

  function fakeSheet(name) {
    return {
      getDataRange() {
        state.events.push(`spreadsheet:data:${name}`);
        return { getValues: () => sheetValues(name) };
      },
      getLastRow() {
        return state.headers[name] && state.headers[name].length ? state.tables[name].length + 1 : 0;
      }
    };
  }

  const spreadsheet = {
    getSheetByName(name) {
      state.events.push(`spreadsheet:get:${name}`);
      if (options.forbidPersistentAccess) throw new Error("forbidden Sheet access");
      if (!Object.hasOwn(state.headers, name) || state.headers[name] === null) return null;
      return fakeSheet(name);
    },
    insertSheet(name) {
      state.events.push(`spreadsheet:insert:${name}`);
      if (options.forbidPersistentAccess) throw new Error("forbidden Sheet creation");
      if (options.failSheetCreation) throw new Error("synthetic Sheet creation failure");
      if (state.headers[name] !== null && state.headers[name] !== undefined) throw new Error("synthetic duplicate Sheet");
      state.headers[name] = [];
      state.tables[name] = [];
      state.sheetWrites.push({ method: "insertSheet", sheetName: name });
      return fakeSheet(name);
    }
  };

  class FakeDate extends Date {
    constructor(value) {
      super(arguments.length ? value : state.now);
    }
    static now() {
      return state.nowValues.length ? state.nowValues.shift() : state.now;
    }
  }

  const context = {
    Array,
    Date: FakeDate,
    Error,
    JSON,
    Math,
    Number,
    Object,
    RegExp,
    String,
    TypeError,
    RangeError,
    ADMIN_PBKDF2_ITERATIONS_: 120000,
    console: { log: safeLog, debug: safeLog, info: safeLog, warn: safeLog, error: safeLog },
    Logger: { log: safeLog },
    PropertiesService: {
      getScriptProperties() {
        state.events.push("properties:get-script");
        if (options.forbidPersistentAccess) throw new Error("forbidden PropertiesService access");
        return scriptProperties;
      }
    },
    CacheService: {
      getScriptCache() {
        if (options.forbidPersistentAccess) throw new Error("forbidden CacheService access");
        return { get: () => null, put: () => {}, remove: () => {} };
      }
    },
    LockService: {
      getScriptLock() {
        if (options.throwGetLock) throw new Error("synthetic getScriptLock secret detail");
        return lock;
      }
    },
    SpreadsheetApp: {
      openById(id) {
        state.events.push(`spreadsheet:open:${id}`);
        if (options.forbidPersistentAccess) throw new Error("forbidden SpreadsheetApp access");
        assert.equal(id, "configured");
        return spreadsheet;
      }
    },
    Utilities: {
      getUuid() {
        state.events.push("uuid:admin");
        if (!state.uuidValues.length) throw new Error("synthetic UUID exhaustion");
        return state.uuidValues.shift();
      }
    },
    getAppConfig_() {
      if (options.forbidPersistentAccess) throw new Error("forbidden credential/config access");
      return { spreadsheetId: "configured" };
    },
    SheetService_assertUniqueHeaders_(headers, requiredHeaders) {
      return assertUniqueHeaders(Array.from(headers || []), Array.from(requiredHeaders || []));
    },
    SheetService_ensureHeaders_(sheetName, requiredHeaders) {
      state.events.push(`sheet:ensure:${sheetName}`);
      if (options.failEnsureHeaders === sheetName) throw new Error("synthetic ensure headers failure");
      const headers = state.headers[sheetName];
      if (headers === null || headers === undefined) throw new Error("synthetic missing Sheet");
      assertUniqueHeaders(headers, []);
      for (const required of requiredHeaders) {
        for (const header of headers) {
          if (header !== required && header.toLowerCase() === required.toLowerCase()) {
            throw new Error("synthetic conflicting headers");
          }
        }
      }
      const appendedHeaders = Array.from(requiredHeaders).filter((header) => !headers.includes(header));
      if (appendedHeaders.length) {
        state.headers[sheetName] = headers.concat(appendedHeaders);
        state.sheetWrites.push({ method: "ensureHeaders", sheetName, appendedHeaders: appendedHeaders.slice() });
      }
      return {
        headers: state.headers[sheetName].slice(),
        headerMap: assertUniqueHeaders(state.headers[sheetName], Array.from(requiredHeaders)),
        appendedHeaders
      };
    },
    SheetService_readTable_(sheetName, requiredHeaders) {
      state.readCounts[sheetName] += 1;
      const count = state.readCounts[sheetName];
      state.events.push(`sheet:read:${sheetName}:${count}`);
      state.sheetReads.push({ sheetName, count, lockHeld: state.lockHeld });
      if (options.forbidPersistentAccess) throw new Error("forbidden Sheet table access");
      if (options.failRead === sheetName ||
          (options.failRead && options.failRead.sheet === sheetName && options.failRead.at === count)) {
        throw new Error("synthetic Sheet read failure");
      }
      assertUniqueHeaders(state.headers[sheetName], Array.from(requiredHeaders));
      const rows = state.tables[sheetName].map((row, index) => ({ sourceRowNumber: index + 2, values: { ...row } }));
      if (options.rereadMismatch && sheetName === "admins" && count >= 2 && rows.length) {
        rows[rows.length - 1].values.password_hash = "A".repeat(43);
      }
      return {
        headers: state.headers[sheetName].slice(),
        headerMap: assertUniqueHeaders(state.headers[sheetName], Array.from(requiredHeaders)),
        rows
      };
    },
    SheetService_writeValue_(policy, fieldName, value) {
      state.events.push(`sheet:validate:${fieldName}`);
      state.writePolicies.push({ policy, fieldName, value });
      if (policy === "human_text") {
        assert.ok(fieldName === "display_name" || fieldName === "email");
        if (typeof value !== "string") throw new Error("synthetic human text failure");
        return /^[=+\-@]/.test(value) ? `'${value}` : value;
      }
      assert.equal(policy, "security");
      return value;
    },
    appendSheetObject_(sheetName, requiredHeaders, record) {
      state.appendAttempts += 1;
      state.events.push(`sheet:append:${sheetName}`);
      assert.deepEqual(Array.from(requiredHeaders), sheetName === "admins" ? ADMIN_HEADERS : SESSION_HEADERS);
      if (options.failAppend) throw new Error("synthetic append failure");
      state.tables[sheetName].push({ ...record });
      state.sheetWrites.push({ method: "append", sheetName, record: { ...record } });
    },
    CryptoService_utf8Bytes_(value) {
      if (typeof value !== "string" || /[\uD800-\uDFFF]/.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""))) {
        throw new Error("UTF-8 input is malformed.");
      }
      return Array.from(Buffer.from(value, "utf8"));
    },
    CryptoService_pbkdf2Sha256_(password, saltBytes, iterations) {
      const callNumber = state.pbkdf2Calls.length + 1;
      state.events.push(`crypto:pbkdf2:${iterations}`);
      state.pbkdf2Calls.push({ password, saltBytes: Array.from(saltBytes), iterations });
      if (options.failPbkdf2) throw new Error("synthetic PBKDF2 failure");
      if (password === BENCHMARK_PASSWORD &&
          Buffer.from(saltBytes).equals(Buffer.from(BENCHMARK_SALT)) && iterations === 120000) {
        if (options.incorrectPbkdf2Call === callNumber) return Array(32).fill(0);
        return Array.from(Buffer.from(BENCHMARK_HASH, "base64url"));
      }
      if (options.bootstrapDerivedBytes) return Array.from(options.bootstrapDerivedBytes);
      return pbkdf2Fixture(password, saltBytes, iterations);
    },
    CryptoService_base64UrlEncode_(bytes) {
      return Buffer.from(bytes).toString("base64url");
    },
    CryptoService_base64UrlDecode_(value) {
      if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
        throw new Error("Invalid base64url value.");
      }
      const decoded = Buffer.from(value, "base64url");
      if (decoded.toString("base64url") !== value) throw new Error("Invalid base64url value.");
      return Array.from(decoded);
    },
    CryptoService_constantTimeEqual_(left, right) {
      let difference = left.length ^ right.length;
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        difference |= (left[index] || 0) ^ (right[index] || 0);
      }
      return difference === 0;
    },
    CryptoService_randomBytesLocked_(purpose, length) {
      state.events.push(`random:entered:${purpose}:${length}`);
      state.randomCalls.push({ purpose, length, lockHeld: state.lockHeld });
      assert.equal(state.lockHeld, true, "Task 5 random generation must use the caller-held script lock");
      const counterText = state.properties.ADMIN_AUTH_RANDOM_COUNTER;
      const counter = Number(counterText);
      scriptProperties.setProperty("ADMIN_AUTH_RANDOM_COUNTER", String(counter + 1));
      state.events.push("random:counter-persisted");
      if (options.failRandomDerivation) throw new Error("synthetic random derivation failure");
      state.events.push("random:derived");
      return Array.from(options.saltBytes || Array.from({ length: length }, (_, index) => index + 1));
    }
  };

  vm.createContext(context);
  vm.runInContext(configSource, context, { filename: "apps-script/Config.gs" });
  vm.runInContext(
    options.authServiceSourceOverride === undefined ? serviceSource : options.authServiceSourceOverride,
    context,
    { filename: "apps-script/AuthService.gs" }
  );
  return { context, state };
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

function assertExactAuthFailure(response) {
  assert.deepEqual(plain(response), AUTH_ERROR);
}

function assertServerError(response) {
  assert.deepEqual(plain(response), {
    ok: false,
    error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดภายในระบบ" }
  });
}

function login(options = {}, payload = { username: "operator", password: "Correct Horse Battery Staple" }) {
  const runtime = createRuntime(options);
  return { ...runtime, response: runtime.context.adminLogin_(payload) };
}

function validate(options = {}, token = RAW_TOKEN) {
  const runtime = createRuntime({ sessions: [makeSession()], ...options });
  return { ...runtime, response: runtime.context.adminValidateSession_(token) };
}

function requireAdminMutation_(replacement) {
  const original = `function AuthService_requireAdmin_(token) {
  if (!AuthService_validRawToken_(token)) throw new Error("UNAUTHORIZED");
  var context = AuthService_validateSessionContext_(token);
  if (!context) throw new Error("UNAUTHORIZED");
  return context.admin;
}`;
  assert.equal(serviceSource.includes(original), true, "requireAdmin mutation target must match production source");
  return serviceSource.replace(original, replacement);
}

function assertRequireAdminAuthoritativeEvidence_(runtime) {
  assert.deepEqual(runtime.state.hashTokenCalls, [RAW_TOKEN], "requireAdmin must hash the raw token exactly once");
  assert.deepEqual(
    runtime.state.sheetReads.map((read) => read.sheetName),
    ["admin_sessions", "admins"],
    "requireAdmin must read authoritative session and Admin Sheets in order"
  );
  assert.deepEqual(runtime.state.readCounts, { admins: 1, admin_sessions: 1 });
  assert.equal(runtime.state.cacheCalls.length, 0, "requireAdmin must not read or write CacheService");
  assert.equal(runtime.state.writes.length, 0, "requireAdmin must remain read-only");
}

function assertRequireAdminRejectsRevokedSecondCall_(runtime) {
  const first = plain(runtime.context.AuthService_requireAdmin_(RAW_TOKEN));
  runtime.state.tables.admin_sessions[0].revoked_at = "2026-08-08T04:31:00.000Z";
  assert.throws(() => runtime.context.AuthService_requireAdmin_(RAW_TOKEN), /^Error: UNAUTHORIZED$/);
  assert.equal(first.admin_id, "ADM-11111111-1111-4111-8111-111111111111");
  assert.deepEqual(runtime.state.readCounts, { admins: 1, admin_sessions: 2 });
  assert.equal(runtime.state.cacheCalls.length, 0, "repeated requireAdmin calls must not use CacheService");
  assert.equal(runtime.state.writes.length, 0);
}

function assertRequireAdminRejectsInactiveAdminSecondCall_(runtime) {
  const first = plain(runtime.context.AuthService_requireAdmin_(RAW_TOKEN));
  runtime.state.tables.admins[0].status = "inactive";
  assert.throws(() => runtime.context.AuthService_requireAdmin_(RAW_TOKEN), /^Error: UNAUTHORIZED$/);
  assert.equal(first.admin_id, "ADM-11111111-1111-4111-8111-111111111111");
  assert.deepEqual(runtime.state.readCounts, { admins: 2, admin_sessions: 2 });
  assert.equal(runtime.state.cacheCalls.length, 0, "repeated requireAdmin calls must not use CacheService");
  assert.equal(runtime.state.writes.length, 0);
}

function benchmarkTicks(durations) {
  const ticks = [];
  let cursor = 1000;
  for (const duration of durations) {
    ticks.push(cursor, cursor + duration);
    cursor += duration + 17;
  }
  return ticks;
}

function assertSafeTask5Error(fn, secrets = [SYNTHETIC_RANDOM_KEY, BOOTSTRAP_PASSWORD]) {
  let thrown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, "expected a fail-closed Task 5 error");
  const rendered = `${thrown.name}: ${thrown.message}`;
  for (const secret of secrets.filter((value) => typeof value === "string" && value.length > 0)) {
    assert.equal(rendered.includes(secret), false, "Task 5 errors must not expose secrets");
  }
  assert.equal(/synthetic|Spreadsheet|property read|property write|stack/i.test(rendered), false, "Task 5 errors must use safe categories");
  return thrown;
}

function assertNoBootstrapCreation(state) {
  assert.equal(state.randomCalls.length, 0, "failed bootstrap validation must precede salt generation");
  assert.equal(state.pbkdf2Calls.length, 0, "failed bootstrap validation must precede PBKDF2");
  assert.equal(state.appendAttempts, 0, "failed bootstrap validation must precede append");
  assert.equal(state.tables.admins.length, 0, "failed bootstrap validation must create no Admin row");
}

test("setup initializes both random-state properties only for genuinely empty auth data", () => {
  const runtime = createTask5Runtime({
    absentProperties: ["ADMIN_AUTH_RANDOM_COUNTER", "ADMIN_AUTH_STATE_VERSION"],
    admins: [],
    sessions: []
  });
  const result = plain(runtime.context.setupAdminAuthSchema());
  assert.deepEqual(result, {
    random_key: "valid",
    random_state: "initialized",
    state_version: 1,
    admins_headers: "valid",
    admin_sessions_headers: "valid"
  });
  assert.equal(runtime.state.properties.ADMIN_AUTH_RANDOM_COUNTER, "0");
  assert.equal(runtime.state.properties.ADMIN_AUTH_STATE_VERSION, "1");
  assert.deepEqual(
    runtime.state.propertyCalls.filter((call) => call.method === "set").map(({ name, value, lockHeld }) => ({ name, value, lockHeld })),
    [
      { name: "ADMIN_AUTH_RANDOM_COUNTER", value: "0", lockHeld: true },
      { name: "ADMIN_AUTH_STATE_VERSION", value: "1", lockHeld: true }
    ]
  );
  assert.equal(runtime.state.lockHeld, false);
  assert.equal(runtime.state.tables.admins.length, 0);
  assert.equal(runtime.state.tables.admin_sessions.length, 0);
  assert.equal(runtime.state.appendAttempts, 0);
});

test("setup preserves a valid established counter/version pair without rewriting either property", () => {
  const runtime = createTask5Runtime({ properties: { ADMIN_AUTH_RANDOM_COUNTER: "9007199254740990" } });
  const result = plain(runtime.context.setupAdminAuthSchema());
  assert.equal(result.random_state, "valid");
  assert.equal(runtime.state.properties.ADMIN_AUTH_RANDOM_COUNTER, "9007199254740990");
  assert.equal(runtime.state.properties.ADMIN_AUTH_STATE_VERSION, "1");
  assert.equal(runtime.state.propertyCalls.some((call) => call.method === "set"), false);
});

test("setup fails closed for every partial malformed unsafe or wrong-version established state without reset", () => {
  const cases = [
    [{ ADMIN_AUTH_RANDOM_COUNTER: null, ADMIN_AUTH_STATE_VERSION: "1" }, ["ADMIN_AUTH_RANDOM_COUNTER"]],
    [{ ADMIN_AUTH_RANDOM_COUNTER: "0", ADMIN_AUTH_STATE_VERSION: null }, ["ADMIN_AUTH_STATE_VERSION"]],
    [{ ADMIN_AUTH_RANDOM_COUNTER: "01", ADMIN_AUTH_STATE_VERSION: "1" }, []],
    [{ ADMIN_AUTH_RANDOM_COUNTER: "-1", ADMIN_AUTH_STATE_VERSION: "1" }, []],
    [{ ADMIN_AUTH_RANDOM_COUNTER: "1.5", ADMIN_AUTH_STATE_VERSION: "1" }, []],
    [{ ADMIN_AUTH_RANDOM_COUNTER: String(Number.MAX_SAFE_INTEGER), ADMIN_AUTH_STATE_VERSION: "1" }, []],
    [{ ADMIN_AUTH_RANDOM_COUNTER: "0", ADMIN_AUTH_STATE_VERSION: "2" }, []]
  ];
  for (const [properties, absentProperties] of cases) {
    const runtime = createTask5Runtime({ properties, absentProperties });
    const before = { ...runtime.state.properties };
    assertSafeTask5Error(() => runtime.context.setupAdminAuthSchema());
    assert.deepEqual(runtime.state.properties, before, "setup must not repair/reset invalid established state");
    assert.equal(runtime.state.propertyCalls.some((call) => call.method === "set"), false);
    assert.equal(runtime.state.sheetWrites.length, 0);
    assert.equal(runtime.state.lockHeld, false);
  }
});

test("setup state assertions reject an explicit reset-invalid-state mutation", () => {
  const runtime = createTask5Runtime({ properties: { ADMIN_AUTH_RANDOM_COUNTER: "malformed" } });
  runtime.context.setupAdminAuthSchema = function () {
    runtime.state.properties.ADMIN_AUTH_RANDOM_COUNTER = "0";
    runtime.state.properties.ADMIN_AUTH_STATE_VERSION = "1";
    return { random_state: "initialized" };
  };
  assert.throws(() => {
    const before = { ...runtime.state.properties };
    runtime.context.setupAdminAuthSchema();
    assert.deepEqual(runtime.state.properties, before, "invalid established state must remain unchanged");
  }, /invalid established state must remain unchanged/);
});

test("setup refuses absent state when either authoritative auth dataset already has a row", () => {
  for (const options of [
    { admins: [makeAdmin()], sessions: [] },
    { admins: [], sessions: [makeSession()] },
    { admins: [makeAdmin()], sessions: [makeSession()] }
  ]) {
    const runtime = createTask5Runtime({
      ...options,
      absentProperties: ["ADMIN_AUTH_RANDOM_COUNTER", "ADMIN_AUTH_STATE_VERSION"]
    });
    assertSafeTask5Error(() => runtime.context.setupAdminAuthSchema());
    assert.equal(Object.hasOwn(runtime.state.properties, "ADMIN_AUTH_RANDOM_COUNTER"), false);
    assert.equal(Object.hasOwn(runtime.state.properties, "ADMIN_AUTH_STATE_VERSION"), false);
    assert.equal(runtime.state.propertyCalls.some((call) => call.method === "set"), false);
    assert.equal(runtime.state.sheetWrites.length, 0);
    assert.equal(runtime.state.lockHeld, false);
  }
});

test("setup key validation rejects every noncanonical key without returning logging or echoing it", () => {
  const invalidKeys = [null, "", "A".repeat(42), "A".repeat(44), `${"A".repeat(42)}=`, `${"A".repeat(42)}!`, "_".repeat(43)];
  for (const key of invalidKeys) {
    const runtime = createTask5Runtime({ properties: { ADMIN_AUTH_RANDOM_KEY: key }, absentProperties: key === null ? ["ADMIN_AUTH_RANDOM_KEY"] : [] });
    const error = assertSafeTask5Error(() => runtime.context.setupAdminAuthSchema(), [String(key)]);
    if (key) {
      assert.equal(error.message.includes(String(key)), false);
      assert.equal(JSON.stringify(runtime.state.logs).includes(String(key)), false);
    }
    assert.equal(runtime.state.propertyCalls.some((call) => call.method === "set"), false);
    assert.equal(runtime.state.lockHeld, false);
  }
  assert.equal(SYNTHETIC_RANDOM_KEY.length, 43);
  assert.equal(Buffer.from(SYNTHETIC_RANDOM_KEY, "base64url").length, 32);
  const valid = createTask5Runtime();
  const result = plain(valid.context.setupAdminAuthSchema());
  assert.equal(result.random_key, "valid");
  assert.equal(JSON.stringify(result).includes(SYNTHETIC_RANDOM_KEY), false);
});

test("setup uses one script lock and releases it on lock/schema/property failures", () => {
  const lockFailure = createTask5Runtime({ failLock: true });
  assertSafeTask5Error(() => lockFailure.context.setupAdminAuthSchema());
  assert.deepEqual(lockFailure.state.events.filter((event) => event.startsWith("lock:")), ["lock:try:10000"]);
  assert.equal(lockFailure.state.sheetReads.length, 0);

  for (const options of [
    { failEnsureHeaders: "admins" },
    { failSheetCreation: true, sessionSheetMissing: true },
    { failPropertySet: "ADMIN_AUTH_RANDOM_COUNTER", absentProperties: ["ADMIN_AUTH_RANDOM_COUNTER", "ADMIN_AUTH_STATE_VERSION"] },
    { failPropertySet: "ADMIN_AUTH_STATE_VERSION", absentProperties: ["ADMIN_AUTH_RANDOM_COUNTER", "ADMIN_AUTH_STATE_VERSION"] }
  ]) {
    const runtime = createTask5Runtime(options);
    assertSafeTask5Error(() => runtime.context.setupAdminAuthSchema());
    assert.equal(runtime.state.lockHeld, false);
    assert.equal(runtime.state.events[runtime.state.events.length - 1], "lock:released");
  }
});

test("setup sanitizes get try and release lock exceptions and always attempts held-lock release", () => {
  for (const options of [{ throwGetLock: true }, { throwTryLock: true }, { throwReleaseLock: true }]) {
    const runtime = createTask5Runtime(options);
    const error = assertSafeTask5Error(
      () => runtime.context.setupAdminAuthSchema(),
      ["synthetic getScriptLock secret detail", "synthetic tryLock secret detail", "synthetic releaseLock secret detail"]
    );
    assert.equal(error.message, "AUTH_SETUP_FAILED");
    assert.equal(runtime.state.lockHeld, false);
    if (options.throwReleaseLock) assert.equal(runtime.state.events.includes("lock:release-attempted"), true);
  }

  const bodyAndReleaseFailure = createTask5Runtime({ failEnsureHeaders: "admins", throwReleaseLock: true });
  const error = assertSafeTask5Error(() => bodyAndReleaseFailure.context.setupAdminAuthSchema());
  assert.equal(error.message, "AUTH_SETUP_FAILED");
  assert.equal(bodyAndReleaseFailure.state.events.includes("lock:release-attempted"), true);
  assert.equal(bodyAndReleaseFailure.state.lockHeld, false);
});

test("a first-time version persistence failure leaves partial state fail-closed and never auto-repairs it", () => {
  const runtime = createTask5Runtime({
    absentProperties: ["ADMIN_AUTH_RANDOM_COUNTER", "ADMIN_AUTH_STATE_VERSION"],
    failPropertySet: "ADMIN_AUTH_STATE_VERSION"
  });
  assertSafeTask5Error(() => runtime.context.setupAdminAuthSchema());
  assert.equal(runtime.state.properties.ADMIN_AUTH_RANDOM_COUNTER, "0");
  assert.equal(Object.hasOwn(runtime.state.properties, "ADMIN_AUTH_STATE_VERSION"), false);
  const writesAfterFirstFailure = runtime.state.propertyCalls.filter((call) => call.method === "set").length;
  assertSafeTask5Error(() => runtime.context.setupAdminAuthSchema());
  assert.equal(runtime.state.propertyCalls.filter((call) => call.method === "set").length, writesAfterFirstFailure);
  assert.equal(runtime.state.properties.ADMIN_AUTH_RANDOM_COUNTER, "0");
  assert.equal(Object.hasOwn(runtime.state.properties, "ADMIN_AUTH_STATE_VERSION"), false);
  assert.equal(runtime.state.lockHeld, false);
});

test("setup appends only missing Admin headers and preserves shuffled populated rows and columns", () => {
  const headers = ["status", "admin_id", "username", "display_name", "email"];
  const row = {
    status: "inactive",
    admin_id: "ADM-11111111-1111-4111-8111-111111111111",
    username: "legacy",
    display_name: "Legacy",
    email: "legacy@example.test"
  };
  const runtime = createTask5Runtime({ adminHeaders: headers, admins: [row] });
  const before = plain(runtime.state.tables.admins);
  runtime.context.setupAdminAuthSchema();
  assert.deepEqual(runtime.state.headers.admins.slice(0, headers.length), headers);
  assert.deepEqual(runtime.state.headers.admins.slice(headers.length), ADMIN_HEADERS.filter((header) => !headers.includes(header)));
  assert.deepEqual(runtime.state.tables.admins, before);
  assert.deepEqual(runtime.state.sheetWrites.filter((write) => write.sheetName === "admins"), [{
    method: "ensureHeaders",
    sheetName: "admins",
    appendedHeaders: ADMIN_HEADERS.filter((header) => !headers.includes(header))
  }]);
  assert.equal(runtime.state.appendAttempts, 0);
  assert.equal(JSON.stringify(runtime.state.tables.admins).includes(BOOTSTRAP_PASSWORD), false);
});

test("setup initializes a genuinely blank existing Admin Sheet without adding rows", () => {
  const runtime = createTask5Runtime({ adminHeaders: [], admins: [] });
  runtime.context.setupAdminAuthSchema();
  assert.deepEqual(runtime.state.headers.admins, ADMIN_HEADERS);
  assert.deepEqual(runtime.state.tables.admins, []);
  assert.deepEqual(runtime.state.sheetWrites.filter((write) => write.sheetName === "admins"), [{
    method: "ensureHeaders",
    sheetName: "admins",
    appendedHeaders: ADMIN_HEADERS
  }]);
  assert.equal(runtime.state.appendAttempts, 0);
});

test("setup creates only an absent admin_sessions Sheet and installs documented headers without rows", () => {
  const runtime = createTask5Runtime({ sessionSheetMissing: true });
  runtime.context.setupAdminAuthSchema();
  assert.deepEqual(runtime.state.headers.admin_sessions, SESSION_HEADERS);
  assert.deepEqual(runtime.state.tables.admin_sessions, []);
  assert.deepEqual(runtime.state.sheetWrites, [
    { method: "insertSheet", sheetName: "admin_sessions" },
    { method: "ensureHeaders", sheetName: "admin_sessions", appendedHeaders: SESSION_HEADERS }
  ]);
  assert.equal(runtime.state.appendAttempts, 0);
});

test("setup accepts shuffled session headers and only appends missing headers without purge/reorder", () => {
  const headers = ["revoked_at", "session_id", "admin_id", "token_hash"];
  const session = {
    revoked_at: "",
    session_id: "SES-22222222-2222-4222-8222-222222222222",
    admin_id: "ADM-11111111-1111-4111-8111-111111111111",
    token_hash: TOKEN_HASH
  };
  const runtime = createTask5Runtime({ sessionHeaders: headers, sessions: [session] });
  const before = plain(runtime.state.tables.admin_sessions);
  runtime.context.setupAdminAuthSchema();
  assert.deepEqual(runtime.state.headers.admin_sessions.slice(0, headers.length), headers);
  assert.deepEqual(runtime.state.headers.admin_sessions.slice(headers.length), SESSION_HEADERS.filter((header) => !headers.includes(header)));
  assert.deepEqual(runtime.state.tables.admin_sessions, before);
  assert.equal(serviceSource.match(/deleteRow|deleteRows|clearContent|purge/gi), null);
});

test("setup fails before mutation on absent Admin Sheet and duplicate conflicting or malformed headers", () => {
  const cases = [
    { adminHeaders: ["admin_id", "admin_id"] },
    { adminHeaders: ["admin_id", "Admin_id"] },
    { adminHeaders: ["admin_id", ""] },
    { sessionHeaders: ["session_id", "session_id"] },
    { sessionHeaders: ["session_id", "Session_id"] },
    { sessionHeaders: ["session_id", ""] }
  ];
  for (const options of cases) {
    const runtime = createTask5Runtime(options);
    const headersBefore = plain(runtime.state.headers);
    assertSafeTask5Error(() => runtime.context.setupAdminAuthSchema());
    assert.deepEqual(runtime.state.headers, headersBefore);
    assert.equal(runtime.state.sheetWrites.length, 0);
    assert.equal(runtime.state.propertyCalls.some((call) => call.method === "set"), false);
    assert.equal(runtime.state.lockHeld, false);
  }
  const missingAdmin = createTask5Runtime();
  missingAdmin.state.headers.admins = null;
  assertSafeTask5Error(() => missingAdmin.context.setupAdminAuthSchema());
  assert.equal(missingAdmin.state.sheetWrites.length, 0);
});

test("first-time setup preflights required-header case conflicts before initializing random state", () => {
  for (const options of [
    { adminHeaders: ["Admin_id"] },
    { sessionHeaders: ["Session_id"] }
  ]) {
    const runtime = createTask5Runtime({
      ...options,
      absentProperties: ["ADMIN_AUTH_RANDOM_COUNTER", "ADMIN_AUTH_STATE_VERSION"]
    });
    assertSafeTask5Error(() => runtime.context.setupAdminAuthSchema());
    assert.equal(Object.hasOwn(runtime.state.properties, "ADMIN_AUTH_RANDOM_COUNTER"), false);
    assert.equal(Object.hasOwn(runtime.state.properties, "ADMIN_AUTH_STATE_VERSION"), false);
    assert.equal(runtime.state.propertyCalls.some((call) => call.method === "set"), false);
    assert.equal(runtime.state.sheetWrites.length, 0);
    assert.equal(runtime.state.lockHeld, false);
  }
});

test("benchmark is isolated from properties Sheets cache credentials and bootstrap services", () => {
  const runtime = createTask5Runtime({
    forbidPersistentAccess: true,
    nowValues: benchmarkTicks([100, 200, 300, 400, 500])
  });
  const result = plain(runtime.context.benchmarkAdminPbkdf2());
  assert.equal(result.passed, true);
  assert.equal(runtime.state.propertyCalls.length, 0);
  assert.equal(runtime.state.sheetReads.length, 0);
  assert.equal(runtime.state.sheetWrites.length, 0);
  assert.equal(runtime.state.randomCalls.length, 0);
});

test("benchmark performs exactly one warm-up and five fixed 120000-round measured derivations", () => {
  const durations = [101, 202, 303, 404, 505];
  const runtime = createTask5Runtime({ nowValues: benchmarkTicks(durations) });
  const result = plain(runtime.context.benchmarkAdminPbkdf2(60000));
  assert.deepEqual(result, {
    iterations: 120000,
    durations_ms: durations,
    correctness: [true, true, true, true, true],
    median_ms: 303,
    max_ms: 505,
    passed: true
  });
  assert.equal(runtime.state.pbkdf2Calls.length, 6);
  for (const call of runtime.state.pbkdf2Calls) {
    assert.equal(call.password, BENCHMARK_PASSWORD);
    assert.deepEqual(call.saltBytes, BENCHMARK_SALT);
    assert.equal(call.iterations, 120000);
  }
  assert.equal(Buffer.from(BENCHMARK_HASH, "base64url").length, 32);
});

test("benchmark vector is independently derived by Node crypto and rejects a matching-wrong production constant", () => {
  assert.equal(BENCHMARK_HASH, crypto.pbkdf2Sync(
    BENCHMARK_PASSWORD,
    Buffer.from(BENCHMARK_SALT),
    120000,
    32,
    "sha256"
  ).toString("base64url"));

  const runtime = createTask5Runtime({ nowValues: benchmarkTicks([1, 1, 1, 1, 1]) });
  assert.equal(runtime.context.AuthService_BENCHMARK_PASSWORD_, BENCHMARK_PASSWORD);
  assert.deepEqual(Array.from(runtime.context.CryptoService_base64UrlDecode_(runtime.context.AuthService_BENCHMARK_SALT_)), BENCHMARK_SALT);
  assert.equal(runtime.context.AuthService_BENCHMARK_HASH_, BENCHMARK_HASH);

  const wrongHash = "A".repeat(43);
  const mutatedSource = serviceSource.replace(
    `var AuthService_BENCHMARK_HASH_ = "${BENCHMARK_HASH}";`,
    `var AuthService_BENCHMARK_HASH_ = "${wrongHash}";`
  );
  assert.notEqual(mutatedSource, serviceSource, "benchmark mutation fixture must replace the production vector");
  const mutated = createTask5Runtime({
    authServiceSourceOverride: mutatedSource,
    nowValues: benchmarkTicks([1, 1, 1, 1, 1])
  });
  const result = plain(mutated.context.benchmarkAdminPbkdf2());
  assert.equal(result.passed, false);
  assert.deepEqual(result.correctness, [false, false, false, false, false]);
});

test("benchmark threshold boundaries and correctness fail closed exactly", () => {
  const cases = [
    [[1000, 2000, 3000, 4000, 5000], null, true],
    [[1000, 2000, 3001, 4000, 5000], null, false],
    [[100, 200, 300, 400, 5001], null, false],
    [[100, 200, 300, 400, 500], 4, false]
  ];
  for (const [durations, incorrectPbkdf2Call, passedExpected] of cases) {
    const runtime = createTask5Runtime({ nowValues: benchmarkTicks(durations), incorrectPbkdf2Call });
    const result = plain(runtime.context.benchmarkAdminPbkdf2(100000));
    assert.equal(result.passed, passedExpected);
    assert.equal(result.median_ms, durations.slice().sort((a, b) => a - b)[2]);
    assert.equal(result.max_ms, Math.max(...durations));
    assert.equal(runtime.state.pbkdf2Calls.every((call) => call.iterations === 120000), true);
  }
});

test("benchmark isolation/workload assertions detect forbidden-property and lowered-iteration mutations", () => {
  const propertyMutation = createTask5Runtime({ forbidPersistentAccess: true, nowValues: benchmarkTicks([1, 1, 1, 1, 1]) });
  propertyMutation.context.benchmarkAdminPbkdf2 = function () {
    return propertyMutation.context.PropertiesService.getScriptProperties().getProperty("ADMIN_AUTH_RANDOM_KEY");
  };
  assert.throws(() => propertyMutation.context.benchmarkAdminPbkdf2(), /forbidden/);

  const iterationMutation = createTask5Runtime({ nowValues: benchmarkTicks([1, 1, 1, 1, 1]) });
  iterationMutation.context.benchmarkAdminPbkdf2 = function () {
    for (let index = 0; index < 6; index += 1) {
      iterationMutation.context.CryptoService_pbkdf2Sha256_(BENCHMARK_PASSWORD, BENCHMARK_SALT, 60000);
    }
  };
  iterationMutation.context.benchmarkAdminPbkdf2();
  assert.equal(iterationMutation.state.pbkdf2Calls.some((call) => call.iterations !== 120000), true, "mutation fixture must lower iterations");
  assert.throws(() => {
    assert.equal(iterationMutation.state.pbkdf2Calls.every((call) => call.iterations === 120000), true);
  });
});

test("bootstrap requires enabled to be the exact lowercase string true before lock or persistence", () => {
  for (const enabled of [null, "false", "TRUE", true, "1", " true", "true "]) {
    const runtime = createTask5Runtime({
      properties: { ADMIN_BOOTSTRAP_ENABLED: enabled },
      absentProperties: enabled === null ? ["ADMIN_BOOTSTRAP_ENABLED"] : []
    });
    assertSafeTask5Error(() => runtime.context.bootstrapFirstAdmin());
    assertNoBootstrapCreation(runtime.state);
    assert.equal(runtime.state.lockAttempts, 0);
    assert.equal(runtime.state.propertyCalls.some((call) => call.method !== "get"), false);
  }
});

test("bootstrap sanitizes get try and release lock exceptions and never returns unsafe success", () => {
  for (const options of [{ throwGetLock: true }, { throwTryLock: true }]) {
    const runtime = createTask5Runtime(options);
    const error = assertSafeTask5Error(
      () => runtime.context.bootstrapFirstAdmin(),
      ["synthetic getScriptLock secret detail", "synthetic tryLock secret detail"]
    );
    assert.equal(error.message, "AUTH_BOOTSTRAP_FAILED");
    assertNoBootstrapCreation(runtime.state);
    assert.equal(runtime.state.lockHeld, false);
  }

  const releaseFailure = createTask5Runtime({ throwReleaseLock: true });
  const releaseError = assertSafeTask5Error(
    () => releaseFailure.context.bootstrapFirstAdmin(),
    ["synthetic releaseLock secret detail"]
  );
  assert.equal(releaseError.message, "AUTH_BOOTSTRAP_FAILED");
  assert.equal(releaseFailure.state.appendAttempts, 1, "release failure must not roll back or duplicate the verified row");
  assert.equal(releaseFailure.state.tables.admins.length, 1);
  assert.equal(releaseFailure.state.events.includes("lock:release-attempted"), true);
  assert.equal(releaseFailure.state.lockHeld, false);

  const bodyAndReleaseFailure = createTask5Runtime({ failAppend: true, throwReleaseLock: true });
  const bodyError = assertSafeTask5Error(() => bodyAndReleaseFailure.context.bootstrapFirstAdmin());
  assert.equal(bodyError.message, "AUTH_BOOTSTRAP_FAILED");
  assert.equal(bodyAndReleaseFailure.state.events.includes("lock:release-attempted"), true);
  assert.equal(bodyAndReleaseFailure.state.lockHeld, false);
});

test("bootstrap requires already-valid random state and never initializes repairs or resets it", () => {
  const cases = [
    [{ ADMIN_AUTH_RANDOM_COUNTER: null, ADMIN_AUTH_STATE_VERSION: null }, ["ADMIN_AUTH_RANDOM_COUNTER", "ADMIN_AUTH_STATE_VERSION"]],
    [{ ADMIN_AUTH_RANDOM_COUNTER: null, ADMIN_AUTH_STATE_VERSION: "1" }, ["ADMIN_AUTH_RANDOM_COUNTER"]],
    [{ ADMIN_AUTH_RANDOM_COUNTER: "0", ADMIN_AUTH_STATE_VERSION: null }, ["ADMIN_AUTH_STATE_VERSION"]],
    [{ ADMIN_AUTH_RANDOM_COUNTER: "01", ADMIN_AUTH_STATE_VERSION: "1" }, []],
    [{ ADMIN_AUTH_RANDOM_COUNTER: String(Number.MAX_SAFE_INTEGER), ADMIN_AUTH_STATE_VERSION: "1" }, []],
    [{ ADMIN_AUTH_RANDOM_COUNTER: "0", ADMIN_AUTH_STATE_VERSION: "2" }, []]
  ];
  for (const [properties, absentProperties] of cases) {
    const runtime = createTask5Runtime({ properties, absentProperties });
    const before = { ...runtime.state.properties };
    assertSafeTask5Error(() => runtime.context.bootstrapFirstAdmin());
    assertNoBootstrapCreation(runtime.state);
    assert.deepEqual(runtime.state.properties, before);
    assert.equal(runtime.state.lockHeld, false);
  }
});

test("bootstrap lock and initial authoritative Sheet failures are safe and release any acquired lock", () => {
  const lockFailure = createTask5Runtime({ failLock: true });
  assertSafeTask5Error(() => lockFailure.context.bootstrapFirstAdmin());
  assertNoBootstrapCreation(lockFailure.state);
  assert.equal(lockFailure.state.lockHeld, false);

  for (const failRead of [
    { sheet: "admins", at: 1 },
    { sheet: "admin_sessions", at: 1 }
  ]) {
    const runtime = createTask5Runtime({ failRead });
    assertSafeTask5Error(() => runtime.context.bootstrapFirstAdmin());
    assertNoBootstrapCreation(runtime.state);
    assert.equal(runtime.state.lockHeld, false);
    assert.equal(runtime.state.events[runtime.state.events.length - 1], "lock:released");
  }
});

test("bootstrap blocks an existing active Admin requested-username reuse and malformed/duplicate username state before crypto", () => {
  const cases = [
    [makeAdmin()],
    [makeAdmin({ status: "inactive", username: "first.operator" })],
    [makeAdmin({ status: "deleted", username: "first.operator" })],
    [makeAdmin({ status: "inactive", username: "malformed username" })],
    [
      makeAdmin({ status: "inactive", username: "other" }),
      makeAdmin({ admin_id: "ADM-44444444-4444-4444-8444-444444444444", status: "deleted", username: " OTHER " })
    ]
  ];
  for (const admins of cases) {
    const runtime = createTask5Runtime({ admins });
    const before = plain(runtime.state.tables.admins);
    assertSafeTask5Error(() => runtime.context.bootstrapFirstAdmin());
    assert.equal(runtime.state.randomCalls.length, 0);
    assert.equal(runtime.state.pbkdf2Calls.length, 0);
    assert.equal(runtime.state.appendAttempts, 0);
    assert.deepEqual(runtime.state.tables.admins, before);
    assert.equal(runtime.state.lockHeld, false);
  }
});

test("bootstrap validates username display email and password bounds before salt PBKDF2 or append", () => {
  const overBytePassword = "\u{1F600}".repeat(65);
  assert.equal(Array.from(overBytePassword).length, 65);
  assert.equal(overBytePassword.length, 130);
  assert.equal(Buffer.byteLength(overBytePassword, "utf8"), 260);
  const cases = [
    { absentProperties: ["ADMIN_BOOTSTRAP_USERNAME"] },
    { absentProperties: ["ADMIN_BOOTSTRAP_DISPLAY_NAME"] },
    { absentProperties: ["ADMIN_BOOTSTRAP_PASSWORD"] },
    { properties: { ADMIN_BOOTSTRAP_USERNAME: "ab" } },
    { properties: { ADMIN_BOOTSTRAP_USERNAME: true } },
    { properties: { ADMIN_BOOTSTRAP_USERNAME: "bad@name" } },
    { properties: { ADMIN_BOOTSTRAP_USERNAME: `a${"b".repeat(64)}` } },
    { properties: { ADMIN_BOOTSTRAP_DISPLAY_NAME: "" } },
    { properties: { ADMIN_BOOTSTRAP_DISPLAY_NAME: true } },
    { properties: { ADMIN_BOOTSTRAP_DISPLAY_NAME: " ".repeat(4) } },
    { properties: { ADMIN_BOOTSTRAP_DISPLAY_NAME: "x".repeat(101) } },
    { properties: { ADMIN_BOOTSTRAP_DISPLAY_NAME: `Synthetic\uD800` } },
    { properties: { ADMIN_BOOTSTRAP_EMAIL: "x".repeat(255) } },
    { properties: { ADMIN_BOOTSTRAP_EMAIL: true } },
    { properties: { ADMIN_BOOTSTRAP_EMAIL: `operator\uD800@example.test` } },
    { properties: { ADMIN_BOOTSTRAP_PASSWORD: "too-short-123" } },
    { properties: { ADMIN_BOOTSTRAP_PASSWORD: true } },
    { properties: { ADMIN_BOOTSTRAP_PASSWORD: "x".repeat(129) } },
    { properties: { ADMIN_BOOTSTRAP_PASSWORD: overBytePassword } },
    { properties: { ADMIN_BOOTSTRAP_PASSWORD: `valid length xx\uD800` } }
  ];
  for (const options of cases) {
    const runtime = createTask5Runtime(options);
    const candidatePassword = options.properties && options.properties.ADMIN_BOOTSTRAP_PASSWORD;
    assertSafeTask5Error(() => runtime.context.bootstrapFirstAdmin(), [String(candidatePassword || "")]);
    assertNoBootstrapCreation(runtime.state);
    assert.equal(runtime.state.lockHeld, false);
  }
});

test("bootstrap success uses exact locked random/hash/write/reread/cleanup order and returns only safe fields", () => {
  const saltBytes = [248].concat(Array.from({ length: 15 }, (_, index) => index + 1));
  const hashBytes = [248].concat(Array.from({ length: 31 }, (_, index) => index + 32));
  const runtime = createTask5Runtime({
    properties: {
      ADMIN_AUTH_RANDOM_COUNTER: "7",
      ADMIN_BOOTSTRAP_USERNAME: "  FiRsT.Admin  ",
      ADMIN_BOOTSTRAP_DISPLAY_NAME: "=Synthetic Operator",
      ADMIN_BOOTSTRAP_EMAIL: "-operator@example.test"
    },
    saltBytes,
    bootstrapDerivedBytes: hashBytes
  });
  const result = plain(runtime.context.bootstrapFirstAdmin());
  assert.deepEqual(result, {
    admin_id: "ADM-55555555-5555-4555-8555-555555555555",
    username: "first.admin",
    cleanup: "complete"
  });
  assert.deepEqual(Object.keys(result), ["admin_id", "username", "cleanup"]);
  assert.equal(JSON.stringify(result).includes(BOOTSTRAP_PASSWORD), false);
  assert.equal(runtime.state.tables.admins.length, 1);
  assert.equal(runtime.state.tables.admin_sessions.length, 0);
  const row = runtime.state.tables.admins[0];
  assert.deepEqual(Object.keys(row), ADMIN_HEADERS);
  assert.equal(row.username, "first.admin");
  assert.equal(row.display_name, "'=Synthetic Operator");
  assert.equal(row.email, "'-operator@example.test");
  assert.equal(row.password_algorithm, "pbkdf2_sha256");
  assert.equal(row.password_salt, Buffer.from(saltBytes).toString("base64url"));
  assert.equal(row.password_hash, Buffer.from(hashBytes).toString("base64url"));
  assert.equal(row.password_salt.startsWith("-"), true);
  assert.equal(row.password_hash.startsWith("-"), true);
  assert.equal(row.password_salt.startsWith("'"), false);
  assert.equal(row.password_hash.startsWith("'"), false);
  assert.equal(row.password_iterations, 120000);
  assert.equal(row.role, "super_admin");
  assert.equal(row.status, "active");
  assert.equal(row.last_login_at, "");
  assert.equal(row.created_at, new Date(NOW).toISOString());
  assert.equal(row.updated_at, row.created_at);
  assert.equal(Object.values(row).includes(BOOTSTRAP_PASSWORD), false);
  assert.deepEqual(runtime.state.randomCalls, [{ purpose: "admin-password-salt", length: 16, lockHeld: true }]);
  assert.deepEqual(runtime.state.pbkdf2Calls, [{ password: BOOTSTRAP_PASSWORD, saltBytes, iterations: 120000 }]);
  const policyByField = Object.fromEntries(runtime.state.writePolicies.map(({ policy, fieldName }) => [fieldName, policy]));
  assert.equal(policyByField.display_name, "human_text");
  assert.equal(policyByField.email, "human_text");
  for (const field of ADMIN_HEADERS.filter((field) => field !== "display_name" && field !== "email")) {
    assert.equal(policyByField[field], "security", `${field} must use strict security writes`);
  }
  assert.equal(runtime.state.properties.ADMIN_AUTH_RANDOM_COUNTER, "8");
  for (const name of [
    "ADMIN_BOOTSTRAP_USERNAME", "ADMIN_BOOTSTRAP_DISPLAY_NAME", "ADMIN_BOOTSTRAP_EMAIL", "ADMIN_BOOTSTRAP_PASSWORD"
  ]) assert.equal(Object.hasOwn(runtime.state.properties, name), false);
  assert.equal(runtime.state.properties.ADMIN_BOOTSTRAP_ENABLED, "false");
  const appendIndex = runtime.state.events.indexOf("sheet:append:admins");
  const rereadIndex = runtime.state.events.indexOf("sheet:read:admins:2");
  const firstDelete = runtime.state.events.indexOf("property:delete:ADMIN_BOOTSTRAP_USERNAME");
  const disableIndex = runtime.state.events.indexOf("property:set:ADMIN_BOOTSTRAP_ENABLED:false");
  assert.ok(appendIndex < rereadIndex && rereadIndex < firstDelete && firstDelete < disableIndex);
  assert.equal(runtime.state.events[runtime.state.events.length - 1], "lock:released");
});

test("bootstrap accepts a password at the exact 256-byte UTF-8 boundary", () => {
  const boundaryPassword = "\u{1F600}".repeat(64);
  assert.equal(Buffer.byteLength(boundaryPassword, "utf8"), 256);
  const runtime = createTask5Runtime({ properties: { ADMIN_BOOTSTRAP_PASSWORD: boundaryPassword } });
  const result = plain(runtime.context.bootstrapFirstAdmin());
  assert.equal(result.cleanup, "complete");
  assert.equal(runtime.state.pbkdf2Calls.length, 1);
  assert.equal(runtime.state.pbkdf2Calls[0].password, boundaryPassword);
  assert.equal(runtime.state.tables.admins.length, 1);
  assert.equal(Object.values(runtime.state.tables.admins[0]).includes(boundaryPassword), false);
});

test("bootstrap succeeds without optional email and cleanup remains complete", () => {
  const runtime = createTask5Runtime({ absentProperties: ["ADMIN_BOOTSTRAP_EMAIL"] });
  const result = plain(runtime.context.bootstrapFirstAdmin());
  assert.equal(result.cleanup, "complete");
  assert.equal(runtime.state.tables.admins.length, 1);
  assert.equal(runtime.state.tables.admins[0].email, "");
  assert.equal(Object.hasOwn(runtime.state.properties, "ADMIN_BOOTSTRAP_EMAIL"), false);
  assert.equal(runtime.state.properties.ADMIN_BOOTSTRAP_ENABLED, "false");
  assert.equal(runtime.state.lockHeld, false);
});

test("bootstrap rejects formula-prefixed password equality with human fields before append or secret exposure", () => {
  const formulaPassword = "=SyntheticPassword123";
  for (const field of ["ADMIN_BOOTSTRAP_DISPLAY_NAME", "ADMIN_BOOTSTRAP_EMAIL"]) {
    const runtime = createTask5Runtime({
      properties: {
        ADMIN_BOOTSTRAP_PASSWORD: formulaPassword,
        [field]: formulaPassword
      }
    });
    assertSafeTask5Error(() => runtime.context.bootstrapFirstAdmin(), [formulaPassword]);
    assert.equal(runtime.state.appendAttempts, 0, `${field} equality must fail before append`);
    assert.equal(runtime.state.tables.admins.length, 0);
    assert.equal(JSON.stringify(runtime.state.logs).includes(formulaPassword), false);
    assert.equal(runtime.state.lockHeld, false);
  }
});

test("bootstrap accepts a formula-leading email at the exact 254-character unescaped boundary", () => {
  const boundaryEmail = `=${"e".repeat(253)}`;
  assert.equal(Array.from(boundaryEmail).length, 254);
  const runtime = createTask5Runtime({ properties: { ADMIN_BOOTSTRAP_EMAIL: boundaryEmail } });
  const result = plain(runtime.context.bootstrapFirstAdmin());
  assert.equal(result.cleanup, "complete");
  assert.equal(runtime.state.tables.admins.length, 1);
  assert.equal(runtime.state.tables.admins[0].email, `'${boundaryEmail}`);
  assert.equal(runtime.state.tables.admins[0].email.length, 255);
  assert.equal(runtime.context.AuthService_unescapeHumanText_(runtime.state.tables.admins[0].email), boundaryEmail);
});

test("bootstrap rejects a generated admin_id collision before append without UUID retry", () => {
  const collidingId = "ADM-55555555-5555-4555-8555-555555555555";
  const runtime = createTask5Runtime({
    admins: [makeAdmin({ admin_id: collidingId, username: "inactive.operator", status: "inactive" })]
  });
  assertSafeTask5Error(() => runtime.context.bootstrapFirstAdmin());
  assert.equal(runtime.state.appendAttempts, 0);
  assert.equal(runtime.state.tables.admins.length, 1);
  assert.equal(runtime.state.randomCalls.length, 1);
  assert.equal(runtime.state.pbkdf2Calls.length, 1);
  assert.equal(runtime.state.uuidValues.length, 0, "collision UUID must be consumed exactly once without retry");
  assert.equal(runtime.state.lockHeld, false);
});

test("bootstrap counter persistence precedes derivation and later failures never roll the counter back", () => {
  const persistence = createTask5Runtime({ properties: { ADMIN_AUTH_RANDOM_COUNTER: "7" }, failRandomCounterPersistence: true });
  assertSafeTask5Error(() => persistence.context.bootstrapFirstAdmin());
  assert.equal(persistence.state.properties.ADMIN_AUTH_RANDOM_COUNTER, "7");
  assert.equal(persistence.state.events.includes("random:derived"), false);
  assert.equal(persistence.state.pbkdf2Calls.length, 0);
  assert.equal(persistence.state.appendAttempts, 0);

  for (const options of [{ failRandomDerivation: true }, { failPbkdf2: true }, { failAppend: true }]) {
    const runtime = createTask5Runtime({ properties: { ADMIN_AUTH_RANDOM_COUNTER: "7" }, ...options });
    assertSafeTask5Error(() => runtime.context.bootstrapFirstAdmin());
    assert.equal(runtime.state.properties.ADMIN_AUTH_RANDOM_COUNTER, "8", "post-persistence failure may skip but cannot reuse counter 8");
    assert.equal(runtime.state.propertyCalls.some((call) => call.method === "set" && call.name === "ADMIN_AUTH_RANDOM_COUNTER" && call.value === "7"), false);
    assert.equal(runtime.state.lockHeld, false);
  }
});

test("bootstrap append and authoritative reread failures never claim success or begin cleanup", () => {
  for (const options of [
    { failAppend: true },
    { failRead: { sheet: "admins", at: 2 } },
    { rereadMismatch: true }
  ]) {
    const runtime = createTask5Runtime(options);
    assertSafeTask5Error(() => runtime.context.bootstrapFirstAdmin());
    assert.equal(runtime.state.propertyCalls.some((call) => call.method === "delete"), false);
    assert.equal(runtime.state.propertyCalls.some((call) => call.method === "set" && call.name === "ADMIN_BOOTSTRAP_ENABLED"), false);
    assert.equal(runtime.state.tables.admins.length, options.failAppend ? 0 : 1);
    assert.equal(runtime.state.lockHeld, false);
  }
});

test("bootstrap cleanup is best-effort ordered disables last verifies outcome and never auto-retries", () => {
  const cleanupProperties = [
    "ADMIN_BOOTSTRAP_USERNAME", "ADMIN_BOOTSTRAP_DISPLAY_NAME", "ADMIN_BOOTSTRAP_EMAIL", "ADMIN_BOOTSTRAP_PASSWORD"
  ];
  const cases = cleanupProperties.map((name) => ({ failPropertyDelete: name })).concat([
    { failPropertySet: "ADMIN_BOOTSTRAP_ENABLED" },
    { stickyDeleteProperty: "ADMIN_BOOTSTRAP_PASSWORD" }
  ]);
  for (const options of cases) {
    const runtime = createTask5Runtime(options);
    assertSafeTask5Error(() => runtime.context.bootstrapFirstAdmin());
    assert.equal(runtime.state.tables.admins.length, 1, "cleanup failure must leave the verified row inspectable");
    assert.equal(runtime.state.appendAttempts, 1);
    const deleteCalls = runtime.state.propertyCalls.filter((call) => call.method === "delete").map((call) => call.name);
    assert.deepEqual(deleteCalls, cleanupProperties, "best-effort cleanup must attempt every temporary property in order");
    const disableCalls = runtime.state.propertyCalls.filter((call) => call.method === "set" && call.name === "ADMIN_BOOTSTRAP_ENABLED");
    assert.equal(disableCalls.length, 1, "cleanup must attempt disable exactly once after deletions");
    assert.ok(
      runtime.state.propertyCalls.findIndex((call) => call.method === "delete" && call.name === "ADMIN_BOOTSTRAP_PASSWORD") <
      runtime.state.propertyCalls.findIndex((call) => call.method === "set" && call.name === "ADMIN_BOOTSTRAP_ENABLED")
    );
    assertSafeTask5Error(() => runtime.context.bootstrapFirstAdmin());
    assert.equal(runtime.state.appendAttempts, 1, "second invocation after partial cleanup must never append again");
    assert.equal(runtime.state.lockHeld, false);
  }
});

test("successful bootstrap is one-shot and a second invocation cannot create another Admin", () => {
  const runtime = createTask5Runtime();
  const first = plain(runtime.context.bootstrapFirstAdmin());
  assert.equal(first.cleanup, "complete");
  assertSafeTask5Error(() => runtime.context.bootstrapFirstAdmin());
  assert.equal(runtime.state.tables.admins.length, 1);
  assert.equal(runtime.state.appendAttempts, 1);
  assert.equal(runtime.state.randomCalls.length, 1);
});

test("Task 5 source has no secret defaults logging destructive recovery counter reset or remote route", () => {
  const routerSource = fs.readFileSync(path.join(root, "apps-script/Router.gs"), "utf8");
  assert.doesNotMatch(serviceSource, /(?:Logger\s*\.\s*log|console\s*\.\s*(?:log|debug|info|warn|error))\s*\(/);
  assert.doesNotMatch(serviceSource, /ADMIN_AUTH_RANDOM_KEY\s*[:=]\s*["'][A-Za-z0-9_-]{20,}["']/);
  assert.doesNotMatch(serviceSource, /DEFAULT_(?:ADMIN_)?(?:USERNAME|PASSWORD)|ADMIN_BOOTSTRAP_(?:USERNAME|PASSWORD)\s*=\s*["'][^"']+["']/);
  assert.doesNotMatch(serviceSource, /deleteRow|deleteRows|clearContent|clear\s*\(|purge/i);
  assert.doesNotMatch(serviceSource, /ADMIN_AUTH_RANDOM_COUNTER[^\n]*(?:=|setProperty\s*\()[^\n]*["']0["']/);
  for (const name of ["setupAdminAuthSchema", "benchmarkAdminPbkdf2", "bootstrapFirstAdmin"]) {
    assert.equal(new RegExp(name).test(routerSource), false, `${name} must remain unreachable from Router`);
  }
  assert.doesNotMatch(serviceSource, /doGet\s*\(|doPost\s*\(/);
  assert.equal(JSON.stringify({ SYNTHETIC_RANDOM_KEY, BOOTSTRAP_PASSWORD }).includes("production"), false);
});

test("exports the Task 4 services and exactly the three Task 5 editor entry points", () => {
  const { context } = createRuntime();
  for (const name of ["adminLogin_", "adminValidateSession_", "adminLogout_", "AuthService_requireAdmin_"]) {
    assert.equal(typeof context[name], "function", `${name} must be implemented`);
  }
  for (const name of ["setupAdminAuthSchema", "benchmarkAdminPbkdf2", "bootstrapFirstAdmin"]) {
    assert.equal(typeof context[name], "function", `${name} must be implemented as an editor-only function`);
  }
  assert.equal(context.ADMIN_PBKDF2_ITERATIONS_, 120000);
  assert.equal(context.ADMIN_SESSION_LIFETIME_MS_, 28800000);
});

test("canonicalizes username by trim/lowercase and preserves password bytes exactly", () => {
  const result = login({}, { username: "  OpErAtOr  ", password: "Correct Horse Battery Staple" });
  assert.equal(result.response.ok, true);
  assert.equal(result.state.pbkdf2Calls.length, 1);
  assert.equal(result.state.pbkdf2Calls[0].password, "Correct Horse Battery Staple");
  assert.equal(result.response.data.admin.username, "operator");
});

test("rejects invalid username types lengths grammar and email-like identifiers uniformly", () => {
  const invalid = [null, 7, {}, [], "", "ab", "a".repeat(65), "bad name", "bad@name", ".abc", "ผู้ดูแล"];
  for (const username of invalid) {
    const result = login({}, { username, password: "Correct Horse Battery Staple" });
    assertExactAuthFailure(result.response);
    assert.equal(result.state.pbkdf2Calls.length, 1, `invalid username ${String(username)} must use dummy PBKDF2`);
  }
});

test("rejects an oversized raw username before trim can turn it into a valid account identifier", () => {
  const oversized = `${" ".repeat(1000)}operator`;
  const result = login({}, { username: oversized, password: "Correct Horse Battery Staple" });
  assertExactAuthFailure(result.response);
  assert.equal(result.state.tables.admin_sessions.length, 0);
  assert.equal(result.state.pbkdf2Calls.length, 1, "bounded invalid username still uses the fixed dummy credential path");
});

test("rejects password types empty malformed code points code-point ceiling and byte ceiling uniformly", () => {
  const invalid = [null, 7, {}, [], "", "\uD800", "a".repeat(129), "😀".repeat(65)];
  for (const password of invalid) {
    const result = login({}, { username: "operator", password });
    assertExactAuthFailure(result.response);
    assert.equal(result.state.pbkdf2Calls.length, 0, "malformed or oversized password must not enter PBKDF2");
  }
  const maximum = login({ admins: [makeAdmin({ fixturePassword: "😀".repeat(64) })] }, { username: "operator", password: "😀".repeat(64) });
  assert.equal(maximum.response.ok, true, "128 code points and 256 UTF-8 bytes is accepted");
});

test("rejects a very large password before UTF-8 conversion or PBKDF2", () => {
  const hugePassword = "x".repeat(1000000);
  const result = login({}, { username: "operator", password: hugePassword });
  assertExactAuthFailure(result.response);
  assert.equal(result.state.utf8Inputs.includes(hugePassword), false);
  assert.equal(result.state.pbkdf2Calls.length, 0);
  assert.equal(result.state.tables.admin_sessions.length, 0);
});

test("does not normalize or case-fold passwords", () => {
  const composed = "Caf\u00e9 password phrase";
  const decomposed = "Cafe\u0301 password phrase";
  const exact = login({ admins: [makeAdmin({ fixturePassword: composed })] }, { username: "operator", password: composed });
  assert.equal(exact.response.ok, true);
  for (const different of [decomposed, composed.toUpperCase()]) {
    const result = login({ admins: [makeAdmin({ fixturePassword: composed })] }, { username: "operator", password: different });
    assertExactAuthFailure(result.response);
  }
});

test("converges unknown inactive deleted duplicate malformed and wrong-password accounts on one generic error", () => {
  const cases = [
    [{ admins: [] }, "operator", "Correct Horse Battery Staple"],
    [{ admins: [makeAdmin({ status: "inactive" })] }, "operator", "Correct Horse Battery Staple"],
    [{ admins: [makeAdmin({ status: "deleted" })] }, "operator", "Correct Horse Battery Staple"],
    [{ admins: [makeAdmin(), makeAdmin({ admin_id: "ADM-44444444-4444-4444-8444-444444444444", username: " Operator " })] }, "operator", "Correct Horse Battery Staple"],
    [{ admins: [makeAdmin({ password_algorithm: "sha1" })] }, "operator", "Correct Horse Battery Staple"],
    [{ admins: [makeAdmin({ password_salt: "bad" })] }, "operator", "Correct Horse Battery Staple"],
    [{ admins: [makeAdmin({ password_hash: "bad" })] }, "operator", "Correct Horse Battery Staple"],
    [{ admins: [makeAdmin({ password_iterations: 99999 })] }, "operator", "Correct Horse Battery Staple"],
    [{ admins: [makeAdmin()] }, "operator", "wrong password"],
    [{ admins: [makeAdmin({ role: "owner" })] }, "operator", "Correct Horse Battery Staple"],
    [{ admins: [makeAdmin({ admin_id: "broken" })] }, "operator", "Correct Horse Battery Staple"]
  ];
  for (const [options, username, password] of cases) {
    const result = login(options, { username, password });
    assertExactAuthFailure(result.response);
    assert.equal(result.state.pbkdf2Calls.length, 1);
  }
});

test("uses stored valid PBKDF2 metadata for an active account and constant-time 32-byte comparison", () => {
  const admin = makeAdmin({ password_iterations: 100001 });
  const result = login({ admins: [admin] });
  assert.equal(result.response.ok, true);
  assert.deepEqual(result.state.pbkdf2Calls.map((call) => ({ saltBytes: call.saltBytes, iterations: call.iterations })), [{
    saltBytes: Array.from(Buffer.from(admin.password_salt, "base64url")), iterations: 100001
  }]);
  assert.equal(result.state.constantTimeCalls.length >= 1, true);
  assert.equal(result.state.constantTimeCalls[0].left.length, 32);
  assert.equal(result.state.constantTimeCalls[0].right.length, 32);
});

test("uses exactly one valid fixed 120000-round dummy derivation for non-real credential paths", () => {
  for (const options of [
    { admins: [] },
    { admins: [makeAdmin({ status: "inactive" })] },
    { admins: [makeAdmin({ status: "deleted" })] },
    { admins: [makeAdmin({ password_salt: "invalid" })] },
    { admins: [makeAdmin(), makeAdmin()] }
  ]) {
    const result = login(options);
    assertExactAuthFailure(result.response);
    assert.equal(result.state.pbkdf2Calls.length, 1);
    assert.equal(result.state.pbkdf2Calls[0].iterations, 120000);
    assert.equal(result.state.pbkdf2Calls[0].saltBytes.length, 16);
    assert.equal(result.state.constantTimeCalls.length, 1);
    assert.equal(result.state.constantTimeCalls[0].left.length, 32);
    assert.equal(result.state.constantTimeCalls[0].right.length, 32);
  }
});

test("rate limits the sixth canonical-identifier failure in a fixed 15-minute bucket before PBKDF2", () => {
  const runtime = createRuntime({ admins: [] });
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    assertExactAuthFailure(runtime.context.adminLogin_({ username: "  OPERATOR ", password: "wrong" }));
  }
  const derivations = runtime.state.pbkdf2Calls.length;
  const limited = plain(runtime.context.adminLogin_({ username: "operator", password: "wrong" }));
  assert.deepEqual(limited, {
    ok: false,
    error: { code: "RATE_LIMITED", message: "มีคำขอมากเกินไป กรุณาลองใหม่ภายหลัง" }
  });
  assert.equal(runtime.state.pbkdf2Calls.length, derivations);
  const identifierPuts = runtime.state.cacheCalls.filter((call) => call.method === "put" && call.ttlSeconds === 900);
  assert.equal(identifierPuts.length, 5);
  assert.equal(identifierPuts.every((call) => !call.key.includes("operator") && /^[A-Za-z0-9:_-]+$/.test(call.key)), true);
});

test("uses fixed identifier bucket boundaries and permits work after cache expiry or eviction", () => {
  const runtime = createRuntime({ admins: [] });
  for (let attempt = 0; attempt < 5; attempt += 1) runtime.context.adminLogin_({ username: "operator", password: "wrong" });
  assert.equal(runtime.context.adminLogin_({ username: "operator", password: "wrong" }).error.code, "RATE_LIMITED");
  runtime.state.now += 15 * 60 * 1000;
  assertExactAuthFailure(runtime.context.adminLogin_({ username: "operator", password: "wrong" }));
  runtime.state.cacheValues.clear();
  assertExactAuthFailure(runtime.context.adminLogin_({ username: "operator", password: "wrong" }));
});

test("rate limits the 101st global failure in a fixed 10-minute bucket before PBKDF2", () => {
  const runtime = createRuntime({ admins: [] });
  for (let index = 0; index < 100; index += 1) {
    const username = `user${String(index).padStart(3, "0")}`;
    assertExactAuthFailure(runtime.context.adminLogin_({ username, password: "wrong" }));
  }
  const before = runtime.state.pbkdf2Calls.length;
  const limited = runtime.context.adminLogin_({ username: "another", password: "wrong" });
  assert.equal(limited.error.code, "RATE_LIMITED");
  assert.equal(runtime.state.pbkdf2Calls.length, before);
  assert.equal(runtime.state.cacheCalls.filter((call) => call.method === "put" && call.ttlSeconds === 600).length, 100);
});

test("counts wrong unknown inactive and deleted failures consistently under lock", () => {
  for (const options of [
    { admins: [makeAdmin()] }, { admins: [] }, { admins: [makeAdmin({ status: "inactive" })] }, { admins: [makeAdmin({ status: "deleted" })] }
  ]) {
    const runtime = createRuntime(options);
    const password = options.admins.length && options.admins[0].status === "active" ? "wrong" : "Correct Horse Battery Staple";
    assertExactAuthFailure(runtime.context.adminLogin_({ username: "operator", password }));
    assert.equal(runtime.state.cacheCalls.filter((call) => call.method === "put").length, 2);
    assert.equal(runtime.state.events.includes("lock:acquired"), true);
    assert.equal(runtime.state.events.includes("lock:released"), true);
  }
});

test("performs every failure-counter read-modify-write cache operation while the script lock is held", () => {
  const result = login({}, { username: "operator", password: "wrong" });
  assertExactAuthFailure(result.response);
  const calls = result.state.cacheCalls.filter((call) => call.method === "get" || call.method === "put");
  assert.deepEqual(calls.map((call) => call.method), ["get", "get", "get", "put", "get", "put"]);
  assert.deepEqual(calls.slice(0, 2).map((call) => call.lockHeld), [false, false], "initial limit-decision reads may be unlocked");
  assert.deepEqual(calls.slice(2).map((call) => call.lockHeld), [true, true, true, true], "counter rereads and writes must remain inside the lock");
});

test("successful login clears only the current identifier bucket after append", () => {
  const runtime = createRuntime();
  assertExactAuthFailure(runtime.context.adminLogin_({ username: "operator", password: "wrong" }));
  const globalBefore = [...runtime.state.cacheValues.entries()].find(([key]) => key.includes(":global:"));
  const response = runtime.context.adminLogin_({ username: "operator", password: "Correct Horse Battery Staple" });
  assert.equal(response.ok, true);
  const identifierEntries = [...runtime.state.cacheValues.keys()].filter((key) => key.includes(":identifier:"));
  assert.equal(identifierEntries.length, 0);
  assert.deepEqual(runtime.state.cacheValues.get(globalBefore[0]), globalBefore[1]);
  assert.ok(runtime.state.events.indexOf("sheet:append:admin_sessions") < runtime.state.events.findIndex((event) => event.startsWith("cache:remove:")));
});

test("cache read write and eviction failures never authenticate and permit normal credential verification", () => {
  const wrong = login({ failCache: true }, { username: "operator", password: "wrong" });
  assertExactAuthFailure(wrong.response);
  assert.equal(wrong.state.pbkdf2Calls.length, 1);
  const correct = login({ failCache: true });
  assert.equal(correct.response.ok, true);
  assert.equal(correct.state.pbkdf2Calls.length, 1);
  const removeFailure = login({ failCacheRemove: true });
  assert.equal(removeFailure.response.ok, true, "best-effort cache cleanup cannot undo committed authentication");
});

test("cache keys and values contain no username password token hash raw token or requester IP", () => {
  const result = login({ admins: [] }, { username: "operator", password: "SENTINEL_PASSWORD_DO_NOT_CACHE" });
  assertExactAuthFailure(result.response);
  const serialized = JSON.stringify(result.state.cacheCalls);
  for (const forbidden of ["operator", "SENTINEL_PASSWORD_DO_NOT_CACHE", RAW_TOKEN, TOKEN_HASH, "127.0.0.1", "requester"] ) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.equal(result.state.cacheCalls.filter((call) => call.method === "put").every((call) => /^\d+$/.test(call.value)), true);
});

test("fails closed when the candidate session ID already exists and checks uniqueness under the login lock", () => {
  const collisionId = "SES-33333333-3333-4333-8333-333333333333";
  const existing = makeSession({
    session_id: collisionId,
    token_hash: crypto.createHash("sha256").update(OTHER_TOKEN, "utf8").digest("base64url")
  });
  const result = login({ sessions: [existing] });
  assertServerError(result.response);
  assert.equal(JSON.stringify(result.response).includes(RAW_TOKEN), false);
  assert.deepEqual(result.state.tables.admin_sessions, [existing]);
  assert.equal(result.state.writes.filter((write) => write.method === "append").length, 0);
  const sessionReads = result.state.sheetReads.filter((read) => read.sheetName === "admin_sessions");
  assert.equal(sessionReads.length, 1, "login must consult authoritative session IDs before append");
  assert.equal(sessionReads[0].lockHeld, true, "session-ID uniqueness check must occur under the login script lock");
});

test("shared-state successful issuances never reuse a session ID after a rejected collision", () => {
  const firstUuid = "33333333-3333-4333-8333-333333333333";
  const secondUuid = "44444444-4444-4444-8444-444444444444";
  const runtime = createRuntime({
    uuidValues: [firstUuid],
    tokenByteValues: [
      TOKEN_BYTES,
      Array.from({ length: 32 }, (_, index) => index + 32),
      Array.from({ length: 32 }, (_, index) => index + 64)
    ]
  });

  const first = runtime.context.adminLogin_({ username: "operator", password: "Correct Horse Battery Staple" });
  assert.equal(first.ok, true);
  runtime.state.uuidValues.push(firstUuid);
  const collided = runtime.context.adminLogin_({ username: "operator", password: "Correct Horse Battery Staple" });
  assertServerError(collided);
  assert.equal(JSON.stringify(collided).includes(RAW_TOKEN), false);

  runtime.state.uuidValues.push(secondUuid);
  const second = runtime.context.adminLogin_({ username: "operator", password: "Correct Horse Battery Staple" });
  assert.equal(second.ok, true);
  assert.notEqual(first.data.token, second.data.token);
  const sessionIds = runtime.state.tables.admin_sessions.map((row) => row.session_id);
  assert.deepEqual(sessionIds, [`SES-${firstUuid}`, `SES-${secondUuid}`]);
  assert.equal(new Set(sessionIds).size, 2);
});

test("successful login follows the exact security-critical lock reread write random append order", () => {
  const result = login();
  assert.equal(result.response.ok, true);
  const relevant = result.state.events.filter((event) =>
    event.startsWith("sheet:read:") || event.startsWith("lock:") || event.startsWith("sheet:update:") ||
    event.startsWith("random:") || event.startsWith("sheet:append:")
  );
  assert.deepEqual(relevant, [
    "sheet:read:admins:1",
    "lock:try:10000",
    "lock:acquired",
    "sheet:read:admins:2",
    "sheet:update:admins:last_login_at,updated_at",
    "random:entered",
    "random:counter-persisted",
    "random:derived",
    "sheet:read:admin_sessions:1",
    "sheet:append:admin_sessions",
    "lock:released"
  ]);
  const appendIndex = result.state.writes.findIndex((write) => write.method === "append");
  assert.equal(appendIndex, result.state.writes.length - 1, "complete session append is the final Sheet security-state write");
});

test("successful session row and response expose exactly the approved safe contracts", () => {
  const result = login();
  const response = plain(result.response);
  assert.deepEqual(Object.keys(response), ["ok", "data", "message"]);
  assert.deepEqual(Object.keys(response.data), ["admin", "token", "expires_at"]);
  assert.deepEqual(Object.keys(response.data.admin), ["admin_id", "username", "display_name", "role"]);
  assert.equal(response.data.token, RAW_TOKEN);
  assert.equal(response.data.expires_at, new Date(NOW + 28800000).toISOString());
  assert.equal(response.message, "success");
  const row = result.state.tables.admin_sessions[0];
  assert.deepEqual(Object.keys(row), SESSION_HEADERS);
  assert.equal(row.session_id, "SES-33333333-3333-4333-8333-333333333333");
  assert.equal(row.admin_id, response.data.admin.admin_id);
  assert.equal(row.token_hash, TOKEN_HASH);
  assert.deepEqual(result.state.hashTokenCalls, [RAW_TOKEN], "only the issued raw token may be passed to CryptoService_hashToken_");
  assert.ok(result.state.events.indexOf("crypto:hash-token") < result.state.events.indexOf("sheet:validate:token_hash"));
  assert.notEqual(row.token_hash, RAW_TOKEN);
  assert.equal(row.created_at, new Date(NOW).toISOString());
  assert.equal(row.expires_at, new Date(NOW + 28800000).toISOString());
  assert.equal(row.revoked_at, "");
  assert.equal(row.last_seen_at, row.created_at);
  assert.equal(JSON.stringify(row).includes(RAW_TOKEN), false);
  for (const forbidden of ["email", "status", "password_algorithm", "password_hash", "password_salt", "password_iterations", "token_hash", "session_id"]) {
    assert.equal(Object.hasOwn(response.data, forbidden) || Object.hasOwn(response.data.admin, forbidden), false);
  }
});

test("derives absolute expiry from the captured creation instant even when the clock advances", () => {
  const result = login({ advanceNowEveryCall: 1 });
  assert.equal(result.response.ok, true);
  const row = result.state.tables.admin_sessions[0];
  assert.equal(Date.parse(row.expires_at) - Date.parse(row.created_at), 28800000);
  assert.equal(result.response.data.expires_at, row.expires_at);
});

test("lock acquisition failure returns a fixed server error without writes or token", () => {
  const result = login({ failLockAt: 1 });
  assertServerError(result.response);
  assert.equal(result.state.writes.length, 0);
  assert.equal(result.state.randomReleased, false);
  assert.equal(JSON.stringify(result.response).includes(RAW_TOKEN), false);
});

test("locked Admin reread failure releases lock and creates no session", () => {
  const result = login({ failRead: { sheet: "admins", at: 2 } });
  assertServerError(result.response);
  assert.deepEqual(result.state.events.slice(-1), ["lock:released"]);
  assert.equal(result.state.tables.admin_sessions.length, 0);
  assert.equal(result.state.randomReleased, false);
});

test("status or credential changes after PBKDF2 fail closed and release the lock", () => {
  for (const mutation of [
    (admin) => { admin.status = "inactive"; },
    (admin) => { admin.password_hash = "A".repeat(43); },
    (admin) => { admin.password_salt = Buffer.alloc(16, 9).toString("base64url"); },
    (admin) => { admin.password_iterations = 120001; }
  ]) {
    const runtime = createRuntime();
    const originalRead = runtime.context.SheetService_readTable_;
    runtime.context.SheetService_readTable_ = function (sheetName, headers) {
      if (sheetName === "admins" && runtime.state.readCounts.admins === 1) mutation(runtime.state.tables.admins[0]);
      return originalRead(sheetName, headers);
    };
    const response = runtime.context.adminLogin_({ username: "operator", password: "Correct Horse Battery Staple" });
    assertExactAuthFailure(response);
    assert.equal(runtime.state.randomReleased, false);
    assert.equal(runtime.state.tables.admin_sessions.length, 0);
    assert.equal(runtime.state.lockHeld, false);
  }
});

test("timestamp update failure precedes token generation and session append", () => {
  const result = login({ failUpdate: true });
  assertServerError(result.response);
  assert.equal(result.state.randomReleased, false);
  assert.equal(result.state.events.includes("random:entered"), false);
  assert.equal(result.state.events.includes("sheet:append:admin_sessions"), false);
  assert.equal(result.state.lockHeld, false);
});

test("counter persistence failure releases no random bytes and appends no session", () => {
  const result = login({ failRandomBeforeCounter: true });
  assertServerError(result.response);
  assert.equal(result.state.events.includes("random:counter-persisted"), false);
  assert.equal(result.state.randomReleased, false);
  assert.equal(result.state.tables.admin_sessions.length, 0);
  assert.equal(JSON.stringify(result.response).includes(RAW_TOKEN), false);
  assert.equal(result.state.lockHeld, false);
});

test("token derivation failure after counter persistence leaves a safe skipped counter and no session", () => {
  const result = login({ failRandomAfterCounter: true });
  assertServerError(result.response);
  assert.equal(result.state.events.includes("random:counter-persisted"), true);
  assert.equal(result.state.events.includes("random:derived"), false);
  assert.equal(result.state.tables.admin_sessions.length, 0);
  assert.equal(JSON.stringify(result.response).includes(RAW_TOKEN), false);
  assert.equal(result.state.lockHeld, false);
});

test("session append failure may retain timestamps and counter but returns no token and no partial row", () => {
  const result = login({ failAppend: true });
  assertServerError(result.response);
  assert.equal(result.state.events.includes("random:counter-persisted"), true);
  assert.equal(result.state.randomReleased, true);
  assert.equal(result.state.tables.admin_sessions.length, 0);
  assert.equal(result.state.tables.admins[0].last_login_at, new Date(NOW).toISOString());
  assert.equal(JSON.stringify(result.response).includes(RAW_TOKEN), false);
  assert.equal(result.state.lockHeld, false);
});

test("session-ID uniqueness read failure returns a fixed server error without append or raw token and releases the lock", () => {
  const result = login({ failRead: { sheet: "admin_sessions", at: 1 } });
  assertServerError(result.response);
  assert.equal(result.state.events.includes("sheet:append:admin_sessions"), false);
  assert.equal(result.state.tables.admin_sessions.length, 0);
  assert.equal(JSON.stringify(result.response).includes(RAW_TOKEN), false);
  assert.equal(result.state.lockHeld, false);
  assert.equal(result.state.events[result.state.events.length - 1], "lock:released");
});

test("validates a well-formed token from authoritative Sheets and returns original immutable expiry", () => {
  const result = validate();
  assert.deepEqual(plain(result.response), {
    ok: true,
    data: {
      admin: {
        admin_id: "ADM-11111111-1111-4111-8111-111111111111",
        username: "operator",
        display_name: "ผู้ดูแลระบบ",
        role: "super_admin"
      },
      expires_at: "2026-08-08T08:00:00.000Z"
    },
    message: "success"
  });
  assert.deepEqual(result.state.hashTokenCalls, [RAW_TOKEN]);
  assert.equal(result.state.readCounts.admin_sessions, 1);
  assert.equal(result.state.readCounts.admins, 1);
  assert.equal(result.state.writes.length, 0);
  assert.equal(result.state.cacheCalls.length, 0);
});

test("rejects malformed tokens before any Sheet or cache work", () => {
  for (const token of [null, "", "A".repeat(42), "A".repeat(44), "!".repeat(43)]) {
    const result = validate({}, token);
    assert.deepEqual(plain(result.response), SESSION_ERROR);
    assert.equal(result.state.readCounts.admin_sessions, 0);
    assert.equal(result.state.hashTokenCalls.length, 0);
    assert.equal(result.state.cacheCalls.length, 0);
  }
});

test("converges missing duplicate revoked expired and exact-expiry sessions on generic unauthorized", () => {
  const cases = [
    { sessions: [] },
    { sessions: [makeSession(), makeSession({ session_id: "SES-44444444-4444-4444-8444-444444444444" })] },
    { sessions: [makeSession({ revoked_at: "2026-08-08T01:00:00.000Z" })] },
    { sessions: [makeSession({ expires_at: "2026-08-08T03:59:59.999Z" })] },
    { sessions: [makeSession({ created_at: "2026-08-07T20:30:00.000Z", expires_at: "2026-08-08T04:30:00.000Z", last_seen_at: "2026-08-07T20:30:00.000Z" })] }
  ];
  for (const options of cases) {
    const result = createRuntime(options);
    assert.deepEqual(plain(result.context.adminValidateSession_(RAW_TOKEN)), SESSION_ERROR);
    assert.equal(result.state.writes.length, 0);
  }
});

test("rejects every malformed session field without deleting or mutating audit rows", () => {
  const mutations = [
    { session_id: "broken" },
    { admin_id: "broken" },
    { token_hash: "A".repeat(42) },
    { created_at: "2026-08-08 00:00:00" },
    { expires_at: "not-a-date" },
    { revoked_at: "not-a-date" },
    { last_seen_at: "2026-08-08T00:00:01.000Z" },
    { expires_at: "2026-08-08T07:59:59.999Z" }
  ];
  for (const mutation of mutations) {
    const row = makeSession(mutation);
    const result = createRuntime({ sessions: [row] });
    assert.deepEqual(plain(result.context.adminValidateSession_(RAW_TOKEN)), SESSION_ERROR);
    assert.deepEqual(result.state.tables.admin_sessions, [row]);
    assert.equal(result.state.writes.length, 0);
  }
});

test("rejects missing duplicate inactive deleted and malformed linked Admin accounts uniformly", () => {
  const cases = [
    [],
    [makeAdmin(), makeAdmin()],
    [makeAdmin({ status: "inactive" })],
    [makeAdmin({ status: "deleted" })],
    [makeAdmin({ role: "owner" })],
    [makeAdmin({ username: " Operator " })],
    [makeAdmin({ password_hash: "bad" })],
    [makeAdmin({ admin_id: "ADM-44444444-4444-4444-8444-444444444444" })]
  ];
  for (const admins of cases) {
    const result = createRuntime({ admins, sessions: [makeSession()] });
    assert.deepEqual(plain(result.context.adminValidateSession_(RAW_TOKEN)), SESSION_ERROR);
    assert.equal(result.state.writes.length, 0);
  }
});

test("repeated authoritative validation never slides expiry last_seen_at or any session field", () => {
  const runtime = createRuntime({ sessions: [makeSession()] });
  const before = plain(runtime.state.tables.admin_sessions[0]);
  const first = runtime.context.adminValidateSession_(RAW_TOKEN);
  runtime.state.now += 30 * 60 * 1000;
  const second = runtime.context.adminValidateSession_(RAW_TOKEN);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(runtime.state.readCounts.admin_sessions, 2);
  assert.deepEqual(runtime.state.tables.admin_sessions[0], before);
  assert.equal(first.data.expires_at, second.data.expires_at);
  assert.equal(runtime.state.writes.length, 0);
});

test("AuthService_requireAdmin_ returns only trusted safe fields and throws a category-only marker when unauthorized", () => {
  const valid = createRuntime({ sessions: [makeSession()] });
  assert.deepEqual(plain(valid.context.AuthService_requireAdmin_(RAW_TOKEN)), {
    admin_id: "ADM-11111111-1111-4111-8111-111111111111",
    username: "operator",
    display_name: "ผู้ดูแลระบบ",
    role: "super_admin"
  });
  const invalid = createRuntime({ sessions: [] });
  assert.throws(() => invalid.context.AuthService_requireAdmin_(RAW_TOKEN), /^Error: UNAUTHORIZED$/);
});

test("AuthService_requireAdmin_ hashes the token and reads both authoritative Sheets without cache or writes", () => {
  const runtime = createRuntime({ sessions: [makeSession()] });
  const sessionsBefore = plain(runtime.state.tables.admin_sessions);
  const adminsBefore = plain(runtime.state.tables.admins);
  runtime.context.AuthService_requireAdmin_(RAW_TOKEN);
  assertRequireAdminAuthoritativeEvidence_(runtime);
  assert.deepEqual(runtime.state.tables.admin_sessions, sessionsBefore);
  assert.deepEqual(runtime.state.tables.admins, adminsBefore);

  const malformed = createRuntime({ sessions: [makeSession()] });
  assert.throws(() => malformed.context.AuthService_requireAdmin_("bad"), /^Error: UNAUTHORIZED$/);
  assert.equal(malformed.state.hashTokenCalls.length, 0);
  assert.deepEqual(malformed.state.readCounts, { admins: 0, admin_sessions: 0 });
  assert.equal(malformed.state.cacheCalls.length, 0);
});

test("AuthService_requireAdmin_ revalidates authoritative revocation on every call", () => {
  assertRequireAdminRejectsRevokedSecondCall_(createRuntime({ sessions: [makeSession()] }));
});

test("AuthService_requireAdmin_ revalidates linked Admin status on every call", () => {
  assertRequireAdminRejectsInactiveAdminSecondCall_(createRuntime({ sessions: [makeSession()] }));
});

test("AuthService_requireAdmin_ rejects every required invalid session boundary without cache or writes", () => {
  const cases = [
    [],
    [makeSession(), makeSession({ session_id: "SES-44444444-4444-4444-8444-444444444444" })],
    [makeSession({ revoked_at: "2026-08-08T01:00:00.000Z" })],
    [makeSession({ created_at: "2026-08-07T18:00:00.000Z", expires_at: "2026-08-08T02:00:00.000Z", last_seen_at: "2026-08-07T18:00:00.000Z" })],
    [makeSession({ created_at: "2026-08-07T20:30:00.000Z", expires_at: "2026-08-08T04:30:00.000Z", last_seen_at: "2026-08-07T20:30:00.000Z" })]
  ];
  for (const sessions of cases) {
    const runtime = createRuntime({ sessions });
    const before = plain(runtime.state.tables.admin_sessions);
    assert.throws(() => runtime.context.AuthService_requireAdmin_(RAW_TOKEN), /^Error: UNAUTHORIZED$/);
    assert.equal(runtime.state.readCounts.admin_sessions, 1);
    assert.equal(runtime.state.readCounts.admins, 0);
    assert.equal(runtime.state.cacheCalls.length, 0);
    assert.equal(runtime.state.writes.length, 0);
    assert.deepEqual(runtime.state.tables.admin_sessions, before);
  }
});

test("AuthService_requireAdmin_ rejects every required invalid linked Admin boundary without cache or writes", () => {
  const cases = [
    [],
    [makeAdmin(), makeAdmin()],
    [makeAdmin({ status: "inactive" })],
    [makeAdmin({ status: "deleted" })]
  ];
  for (const admins of cases) {
    const runtime = createRuntime({ admins, sessions: [makeSession()] });
    const sessionBefore = plain(runtime.state.tables.admin_sessions[0]);
    assert.throws(() => runtime.context.AuthService_requireAdmin_(RAW_TOKEN), /^Error: UNAUTHORIZED$/);
    assert.deepEqual(runtime.state.readCounts, { admins: 1, admin_sessions: 1 });
    assert.equal(runtime.state.cacheCalls.length, 0);
    assert.equal(runtime.state.writes.length, 0);
    assert.deepEqual(runtime.state.tables.admin_sessions[0], sessionBefore);
  }
});

test("requireAdmin authoritative assertions reject cache-first and cache-after-first-call mutations", () => {
  const cacheFirstSource = requireAdminMutation_(`function AuthService_requireAdmin_(token) {
  if (!AuthService_validRawToken_(token)) throw new Error("UNAUTHORIZED");
  var cached = CacheService.getScriptCache().get("auth-context");
  if (cached) return JSON.parse(cached);
  var context = AuthService_validateSessionContext_(token);
  if (!context) throw new Error("UNAUTHORIZED");
  return context.admin;
}`);
  const cachedAdmin = JSON.stringify({
    admin_id: "ADM-11111111-1111-4111-8111-111111111111",
    username: "operator",
    display_name: "cached operator",
    role: "super_admin"
  });
  assert.throws(() => {
    const runtime = createRuntime({
      sessions: [],
      cacheValues: { "auth-context": cachedAdmin },
      authServiceSourceOverride: cacheFirstSource
    });
    assert.deepEqual(plain(runtime.context.AuthService_requireAdmin_(RAW_TOKEN)), JSON.parse(cachedAdmin));
    assertRequireAdminAuthoritativeEvidence_(runtime);
  }, /requireAdmin must hash the raw token exactly once/);

  const cacheAfterFirstSource = requireAdminMutation_(`function AuthService_requireAdmin_(token) {
  if (!AuthService_validRawToken_(token)) throw new Error("UNAUTHORIZED");
  var cache = CacheService.getScriptCache();
  var cached = cache.get("auth-context");
  if (cached) return JSON.parse(cached);
  var context = AuthService_validateSessionContext_(token);
  if (!context) throw new Error("UNAUTHORIZED");
  cache.put("auth-context", JSON.stringify(context.admin), 60);
  return context.admin;
}`);
  const mutated = createRuntime({ sessions: [makeSession()], authServiceSourceOverride: cacheAfterFirstSource });
  const first = plain(mutated.context.AuthService_requireAdmin_(RAW_TOKEN));
  mutated.state.tables.admin_sessions[0].revoked_at = "2026-08-08T04:31:00.000Z";
  assert.deepEqual(plain(mutated.context.AuthService_requireAdmin_(RAW_TOKEN)), first);
  assert.equal(mutated.state.readCounts.admin_sessions, 1, "mutation proof must actually skip the second Sheet read");
  assert.throws(
    () => assertRequireAdminRejectsRevokedSecondCall_(
      createRuntime({ sessions: [makeSession()], authServiceSourceOverride: cacheAfterFirstSource })
    ),
    /Missing expected exception/
  );
});

test("logout hashes and revokes exactly one active session while preserving every audit field", () => {
  const before = makeSession();
  const runtime = createRuntime({ sessions: [before] });
  const response = runtime.context.adminLogout_(RAW_TOKEN);
  assert.deepEqual(plain(response), { ok: true, data: {}, message: "success" });
  assert.deepEqual(runtime.state.hashTokenCalls, [RAW_TOKEN]);
  assert.equal(runtime.state.lockHeld, false);
  assert.equal(runtime.state.tables.admin_sessions[0].revoked_at, new Date(NOW).toISOString());
  for (const field of ["session_id", "admin_id", "token_hash", "created_at", "expires_at", "last_seen_at"]) {
    assert.equal(runtime.state.tables.admin_sessions[0][field], before[field]);
  }
  assert.deepEqual(runtime.state.writes, [{
    method: "update", sheetName: "admin_sessions", sourceRowNumber: 2,
    record: { revoked_at: new Date(NOW).toISOString() }
  }]);
});

test("logout is idempotent for already revoked expired and absent well-formed tokens", () => {
  for (const sessions of [
    [makeSession({ revoked_at: "2026-08-08T01:00:00.000Z" })],
    [makeSession({ created_at: "2026-08-07T18:00:00.000Z", expires_at: "2026-08-08T02:00:00.000Z", last_seen_at: "2026-08-07T18:00:00.000Z" })],
    []
  ]) {
    const runtime = createRuntime({ sessions });
    assert.deepEqual(plain(runtime.context.adminLogout_(RAW_TOKEN)), { ok: true, data: {}, message: "success" });
    assert.equal(runtime.state.writes.length, 0);
  }
});

test("logout returns validation error for malformed token without Sheet work", () => {
  for (const token of [null, "", "bad", "A".repeat(42)]) {
    const runtime = createRuntime({ sessions: [] });
    assert.deepEqual(plain(runtime.context.adminLogout_(token)), {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "ข้อมูล session ไม่ถูกต้อง" }
    });
    assert.equal(runtime.state.readCounts.admin_sessions, 0);
  }
});

test("logout duplicate matching rows fail closed without ambiguous revocation", () => {
  const rows = [makeSession(), makeSession({ session_id: "SES-44444444-4444-4444-8444-444444444444" })];
  const runtime = createRuntime({ sessions: rows });
  assertServerError(runtime.context.adminLogout_(RAW_TOKEN));
  assert.deepEqual(runtime.state.tables.admin_sessions, rows);
  assert.equal(runtime.state.writes.length, 0);
});

test("logout lock reread and write failures never falsely confirm revocation and always release acquired lock", () => {
  for (const options of [
    { failLockAt: 1 },
    { failRead: { sheet: "admin_sessions", at: 2 } },
    { failUpdate: true }
  ]) {
    const runtime = createRuntime({ sessions: [makeSession()], ...options });
    assertServerError(runtime.context.adminLogout_(RAW_TOKEN));
    assert.equal(runtime.state.tables.admin_sessions[0].revoked_at, "");
    assert.equal(runtime.state.lockHeld, false);
  }
});

test("never deletes expired or revoked rows clears token hashes writes validation state or adds cleanup behavior", () => {
  const rows = [
    makeSession({ revoked_at: "2026-08-08T01:00:00.000Z" }),
    makeSession({ session_id: "SES-44444444-4444-4444-8444-444444444444", token_hash: crypto.createHash("sha256").update(OTHER_TOKEN).digest("base64url"), created_at: "2026-08-07T18:00:00.000Z", expires_at: "2026-08-08T02:00:00.000Z", last_seen_at: "2026-08-07T18:00:00.000Z" })
  ];
  const runtime = createRuntime({ sessions: rows });
  const before = plain(rows);
  runtime.context.adminValidateSession_(RAW_TOKEN);
  runtime.context.adminValidateSession_(OTHER_TOKEN);
  assert.deepEqual(runtime.state.tables.admin_sessions, before);
  assert.equal(runtime.state.writes.length, 0);
  assert.doesNotMatch(serviceSource, /deleteRow|deleteRows|clearContent|purge/i);
});

test("public envelopes logs cache and Sheet writes never reveal credentials or security metadata", () => {
  const password = "SENTINEL_PASSWORD_DO_NOT_LOG";
  const wrong = login({ password }, { username: "operator", password });
  const success = login();
  const rendered = JSON.stringify({
    wrongResponse: plain(wrong.response),
    wrongLogs: wrong.state.logs,
    wrongCache: wrong.state.cacheCalls,
    successResponse: plain(success.response),
    successLogs: success.state.logs
  });
  for (const forbidden of [password, TOKEN_HASH, "password_hash", "password_salt", "token_hash", "ADMIN_AUTH_RANDOM_KEY", "operator@example.test"] ) {
    assert.equal(rendered.includes(forbidden), false);
  }
  assert.equal(JSON.stringify(success.state.tables.admin_sessions).includes(RAW_TOKEN), false);
  assert.doesNotMatch(serviceSource, /(?:Logger\s*\.\s*log|console\s*\.\s*(?:log|debug|info|warn|error))\s*\(/);
  assert.doesNotMatch(serviceSource, /https?:\/\/|UrlFetchApp|Authorization|requester.?ip/i);
});

test("fixed public errors never interpolate username password token hash salt Sheet values or stack traces", () => {
  const failures = [
    login({ failRead: { sheet: "admins", at: 1 } }, { username: "sensitive-user", password: "sensitive-password" }).response,
    login({ failAppend: true }).response,
    validate({ failRead: "admin_sessions" }).response,
    createRuntime({ sessions: [makeSession()], failUpdate: true }).context.adminLogout_(RAW_TOKEN)
  ];
  for (const response of failures) {
    const text = JSON.stringify(plain(response));
    assert.equal(text.includes("sensitive"), false);
    assert.equal(text.includes(RAW_TOKEN), false);
    assert.equal(text.includes(TOKEN_HASH), false);
    assert.equal(text.includes("synthetic"), false);
    assert.equal(text.includes("stack"), false);
  }
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write(`AuthService verification passed: ${passed} tests.\n`);
