"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const modulePath = path.join(__dirname, "../public/admin/js/admin-auth.js");
assert.ok(fs.existsSync(modulePath), "public/admin/js/admin-auth.js must exist before Admin browser auth contracts can run");
const productionSource = fs.readFileSync(modulePath, "utf8");

const STORAGE_KEY = "TAKHUN_ADMIN_SESSION";
const NOW = Date.parse("2026-08-08T04:00:00.000Z");
const EXPIRES_AT = "2026-08-08T12:00:00.000Z";
const TOKEN = "-".padEnd(43, "A");
const ADMIN_ID = "ADM-123e4567-e89b-42d3-a456-426614174000";
const OTHER_ADMIN_ID = "ADM-223e4567-e89b-42d3-a456-426614174000";
const ADMIN = Object.freeze({
  admin_id: ADMIN_ID,
  username: "operator",
  display_name: "ผู้ดูแลระบบ",
  role: "super_admin"
});
const SESSION = Object.freeze({
  admin_id: ADMIN_ID,
  display_name: ADMIN.display_name,
  role: ADMIN.role,
  token: TOKEN,
  expires_at: EXPIRES_AT
});

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function apiError(code, secret = "server-internal-secret") {
  const error = new Error(secret);
  error.name = "AdminApiError";
  error.code = code;
  return error;
}

function makeStorage({ initial, getError, setError, removeError, events = [] } = {}) {
  const values = new Map();
  if (initial !== undefined) values.set(STORAGE_KEY, initial);
  return {
    values,
    getItem(key) {
      events.push(`storage:get:${key}`);
      if (getError) throw getError;
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      events.push(`storage:set:${key}`);
      if (setError) throw setError;
      values.set(key, value);
    },
    removeItem(key) {
      events.push(`storage:remove:${key}`);
      if (removeError) throw removeError;
      values.delete(key);
    }
  };
}

function makeLocation(href = "https://site.example/admin/places.html?status=draft#top", events = []) {
  const parsed = new URL(href);
  return {
    href,
    origin: parsed.origin,
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
    replacements: [],
    assignments: [],
    replace(target) {
      events.push(`location:replace:${target}`);
      this.replacements.push(target);
    },
    assign(target) {
      events.push(`location:assign:${target}`);
      this.assignments.push(target);
    }
  };
}

function loadAuth({
  source = productionSource,
  now = NOW,
  storage = makeStorage(),
  storageGetterError,
  href,
  api = {},
  events = []
} = {}) {
  const logs = [];
  const location = makeLocation(href, events);
  const RealDate = Date;
  class FakeDate extends RealDate {
    static now() {
      return typeof now === "function" ? now() : now;
    }
  }
  const context = {
    URL,
    Date: FakeDate,
    location,
    TakhunAdminApi: {
      login: api.login || (async () => { throw new Error("unexpected login call"); }),
      validateSession: api.validateSession || (async () => { throw new Error("unexpected validation call"); }),
      logout: api.logout || (async () => { throw new Error("unexpected logout call"); })
    },
    console: {
      log: (...args) => logs.push(["log", ...args]),
      warn: (...args) => logs.push(["warn", ...args]),
      error: (...args) => logs.push(["error", ...args])
    },
    window: null
  };
  if (storageGetterError) {
    Object.defineProperty(context, "sessionStorage", {
      configurable: true,
      get() { throw storageGetterError; }
    });
  } else {
    context.sessionStorage = storage;
  }
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "admin-auth.js" });
  return { auth: context.TakhunAdminAuth, storage, location, logs, events, context };
}

function storedSession(storage) {
  return JSON.parse(storage.values.get(STORAGE_KEY));
}

function validServerSession(overrides = {}) {
  return {
    admin: { ...ADMIN, ...(overrides.admin || {}) },
    expires_at: overrides.expires_at || EXPIRES_AT
  };
}

function assertNoSecrets(value, secrets = [TOKEN, "PasswordSentinel", "server-internal-secret"]) {
  const serialized = `${String(value)} ${JSON.stringify(value)}`;
  for (const secret of secrets) assert.equal(serialized.includes(secret), false, `exposed secret ${secret}`);
}

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

test("exports exactly the frozen approved browser auth surface", async () => {
  const { auth } = loadAuth();
  assert.deepEqual(Object.keys(auth).sort(), [
    "clearSession",
    "guardProtectedPage",
    "login",
    "logout",
    "readSession",
    "redirectAuthenticatedLogin",
    "safeReturnPath",
    "validateCurrentSession",
    "writeSession"
  ]);
  assert.equal(Object.isFrozen(auth), true);
  for (const name of Object.keys(auth)) assert.equal(typeof auth[name], "function");
});

test("writes and reads only the exact sessionStorage projection", async () => {
  const storage = makeStorage();
  const { auth } = loadAuth({ storage });
  assert.deepEqual(plain(auth.writeSession({ ...SESSION, username: "must-not-persist" })), { ok: false, code: "STORAGE_ERROR" });
  assert.equal(storage.values.has(STORAGE_KEY), false);
  assert.deepEqual(plain(auth.writeSession(SESSION)), { ok: true });
  assert.deepEqual(Object.keys(storedSession(storage)), ["admin_id", "display_name", "role", "token", "expires_at"]);
  assert.equal("username" in storedSession(storage), false);
  assert.deepEqual(plain(auth.readSession()), SESSION);
});

test("removes every malformed expired and noncanonical stored session", async () => {
  const invalidObjects = [
    null,
    [],
    true,
    {},
    { ...SESSION, extra: true },
    { ...SESSION, admin_id: 1 },
    { ...SESSION, admin_id: "ADM-not-a-uuid" },
    { ...SESSION, display_name: "" },
    { ...SESSION, display_name: "x".repeat(101) },
    { ...SESSION, display_name: "\uD800" },
    { ...SESSION, role: "owner" },
    { ...SESSION, token: `${"A".repeat(42)}B` },
    { ...SESSION, token: `${TOKEN}=` },
    { ...SESSION, expires_at: "2026-08-08T12:00:00Z" },
    { ...SESSION, expires_at: "2026-02-30T12:00:00.000Z" },
    { ...SESSION, expires_at: "2026-08-08T03:59:59.999Z" },
    { ...SESSION, expires_at: "2026-08-08T04:00:00.000Z" }
  ];
  const rawValues = [null, "", "not-json", ...invalidObjects.map((value) => JSON.stringify(value))];
  for (const raw of rawValues) {
    const events = [];
    const storage = makeStorage({ events });
    if (raw !== null) storage.values.set(STORAGE_KEY, raw);
    const { auth } = loadAuth({ storage, events });
    assert.equal(auth.readSession(), null, `accepted invalid state ${raw}`);
    assert.equal(storage.values.has(STORAGE_KEY), false);
    assert.equal(events.includes(`storage:remove:${STORAGE_KEY}`), true);
  }
});

test("storage access failures fail closed without alternate persistence", async () => {
  const denied = new Error(`SecurityError ${TOKEN}`);
  const unavailable = loadAuth({ storage: null });
  assert.equal(unavailable.auth.readSession(), null);
  assert.deepEqual(plain(unavailable.auth.writeSession(SESSION)), { ok: false, code: "STORAGE_ERROR" });
  assert.deepEqual(plain(unavailable.auth.clearSession()), { ok: false, code: "STORAGE_ERROR" });

  const getter = loadAuth({ storageGetterError: denied });
  assert.equal(getter.auth.readSession(), null);
  assert.deepEqual(plain(getter.auth.writeSession(SESSION)), { ok: false, code: "STORAGE_ERROR" });
  assert.deepEqual(plain(getter.auth.clearSession()), { ok: false, code: "STORAGE_ERROR" });

  const throwing = makeStorage({ initial: JSON.stringify(SESSION), getError: denied, setError: denied, removeError: denied });
  const harness = loadAuth({ storage: throwing });
  assert.equal(harness.auth.readSession(), null);
  assert.deepEqual(plain(harness.auth.writeSession(SESSION)), { ok: false, code: "STORAGE_ERROR" });
  assert.deepEqual(plain(harness.auth.clearSession()), { ok: false, code: "STORAGE_ERROR" });
  assertNoSecrets(harness.logs);
});

test("safeReturnPath accepts only exact same-directory allowlisted destinations", async () => {
  const { auth } = loadAuth({ href: "https://site.example/admin/login.html" });
  const safe = [
    "dashboard.html",
    "places.html?status=draft",
    "reviews.html#pending",
    "/admin/routes.html?x=1#two",
    "products.html",
    "events.html",
    "gallery.html",
    "https://site.example/admin/settings.html?tab=profile",
    "404.html"
  ];
  for (const candidate of safe) {
    const expected = new URL(candidate, "https://site.example/admin/login.html");
    assert.equal(auth.safeReturnPath(candidate), `${path.posix.basename(expected.pathname)}${expected.search}${expected.hash}`);
  }
});

test("safeReturnPath rejects traversal schemes credentials loops and auth material", async () => {
  const { auth } = loadAuth({ href: "https://site.example/admin/login.html" });
  const unsafe = [
    "", " ", "login.html", "LOGIN.html", "dashboard.html.evil", "nested/dashboard.html",
    "../dashboard.html", "%2e%2e/dashboard.html", "%252e%252e/dashboard.html",
    "places%2f..%2fdashboard.html", "places%5c..%5cdashboard.html", "..\\dashboard.html", "C:\\admin\\dashboard.html",
    "https://evil.example/admin/dashboard.html", "https://site.example:444/admin/dashboard.html",
    "http://site.example/admin/dashboard.html", "https://user:pass@site.example/admin/dashboard.html",
    "//site.example/admin/dashboard.html", "javascript:alert(1)", "data:text/html,x", "file:///admin/dashboard.html", "blob:https://site.example/id",
    "/dashboard.html", "/other/dashboard.html", "/admin/nested/dashboard.html",
    "dashboard.html?token=secret", "dashboard.html?access_token=secret", "dashboard.html?password=secret",
    "dashboard.html?username=operator", "dashboard.html#session=secret", "dashboard.html#token",
    `dashboard.html?value=${TOKEN}`, `dashboard.html#${TOKEN}`,
    " dashboard.html", "dashboard.html ", "\u0000dashboard.html", "dashboard.html\r\nLocation:https://evil.example"
  ];
  for (const candidate of unsafe) assert.equal(auth.safeReturnPath(candidate), "dashboard.html", `accepted ${JSON.stringify(candidate)}`);
});

test("login forwards credentials exactly stores the reduced projection then safely redirects", async () => {
  const calls = [];
  const events = [];
  const storage = makeStorage({ events });
  const harness = loadAuth({
    storage,
    events,
    href: "https://site.example/admin/login.html",
    api: {
      login: async (username, password) => {
        calls.push({ username, password });
        return { admin: ADMIN, token: TOKEN, expires_at: EXPIRES_AT };
      }
    }
  });
  const result = await harness.auth.login("  Operator  ", " PasswordSentinel ", "places.html?status=draft");
  assert.deepEqual(calls, [{ username: "  Operator  ", password: " PasswordSentinel " }]);
  assert.deepEqual(storedSession(storage), SESSION);
  assert.equal("username" in storedSession(storage), false);
  assert.deepEqual(harness.location.replacements, ["places.html?status=draft"]);
  assert.equal(events.indexOf(`storage:set:${STORAGE_KEY}`) < events.indexOf("location:replace:places.html?status=draft"), true);
  assert.deepEqual(plain(result), {
    status: "authenticated",
    admin: { admin_id: ADMIN_ID, display_name: ADMIN.display_name, role: ADMIN.role },
    expires_at: EXPIRES_AT,
    redirect: "places.html?status=draft"
  });
  assertNoSecrets(result);
});

test("login fails safely on malformed projection API failure or storage failure", async () => {
  const cases = [
    { api: { login: async () => ({ admin: { ...ADMIN, admin_id: OTHER_ADMIN_ID }, token: "bad", expires_at: EXPIRES_AT }) }, code: "MALFORMED_RESPONSE" },
    { api: { login: async () => { throw apiError("UNAUTHORIZED"); } }, code: "UNAUTHORIZED" },
    { api: { login: async () => ({ admin: ADMIN, token: TOKEN, expires_at: EXPIRES_AT }) }, storage: makeStorage({ setError: new Error(TOKEN) }), code: "STORAGE_ERROR" }
  ];
  for (const fixture of cases) {
    const harness = loadAuth({ storage: fixture.storage || makeStorage(), api: fixture.api, href: "https://site.example/admin/login.html" });
    const result = await harness.auth.login("operator", "PasswordSentinel", "https://evil.example/");
    assert.deepEqual(plain(result), { status: "error", code: fixture.code });
    assert.deepEqual(harness.location.replacements, []);
    assertNoSecrets(result);
    assertNoSecrets(harness.logs);
  }
});

test("login transport failure is never retried automatically", async () => {
  let calls = 0;
  const harness = loadAuth({ api: { login: async () => { calls += 1; throw apiError("NETWORK_ERROR"); } } });
  assert.deepEqual(plain(await harness.auth.login("operator", "PasswordSentinel")), { status: "error", code: "NETWORK_ERROR" });
  assert.equal(calls, 1);
  assert.deepEqual(harness.location.replacements, []);
});

test("validateCurrentSession skips API without valid local state", async () => {
  for (const initial of [undefined, "not-json", JSON.stringify({ ...SESSION, expires_at: new Date(NOW).toISOString() })]) {
    let calls = 0;
    const storage = makeStorage({ initial });
    const harness = loadAuth({ storage, api: { validateSession: async () => { calls += 1; } } });
    assert.deepEqual(plain(await harness.auth.validateCurrentSession()), { status: "unauthenticated" });
    assert.equal(calls, 0);
  }
});

test("validateCurrentSession revalidates authority refreshes hints and preserves immutable expiry", async () => {
  let tokenSeen;
  const storage = makeStorage({ initial: JSON.stringify(SESSION) });
  const updatedAdmin = { ...ADMIN, display_name: "ผู้ตรวจสอบ", role: "reviewer" };
  const harness = loadAuth({
    storage,
    api: { validateSession: async (token) => { tokenSeen = token; return { admin: updatedAdmin, expires_at: EXPIRES_AT }; } }
  });
  const result = await harness.auth.validateCurrentSession();
  assert.equal(tokenSeen, TOKEN);
  assert.deepEqual(plain(result), { status: "authenticated", admin: updatedAdmin, expires_at: EXPIRES_AT });
  assert.deepEqual(storedSession(storage), { ...SESSION, display_name: updatedAdmin.display_name, role: updatedAdmin.role });
  assert.equal(storedSession(storage).expires_at, EXPIRES_AT);
  assert.equal("username" in storedSession(storage), false);
});

test("identity or expiry mismatch clears local state and never authenticates", async () => {
  const mismatches = [
    validServerSession({ admin: { admin_id: OTHER_ADMIN_ID } }),
    validServerSession({ expires_at: "2026-08-08T13:00:00.000Z" })
  ];
  for (const response of mismatches) {
    const storage = makeStorage({ initial: JSON.stringify(SESSION) });
    const harness = loadAuth({ storage, api: { validateSession: async () => response } });
    assert.deepEqual(plain(await harness.auth.validateCurrentSession()), { status: "unauthenticated" });
    assert.equal(storage.values.has(STORAGE_KEY), false);
  }
});

test("validation that reaches exact local expiry while pending clears instead of authenticating", async () => {
  let clock = NOW;
  const pending = deferred();
  const storage = makeStorage({ initial: JSON.stringify(SESSION) });
  const harness = loadAuth({ now: () => clock, storage, api: { validateSession: async () => pending.promise } });
  const validation = harness.auth.validateCurrentSession();
  clock = Date.parse(EXPIRES_AT);
  pending.resolve(validServerSession());
  assert.deepEqual(plain(await validation), { status: "unauthenticated" });
  assert.equal(storage.values.has(STORAGE_KEY), false);
});

test("validation distinguishes unauthorized from transient unconfirmed outcomes", async () => {
  for (const code of ["UNAUTHORIZED", "VALIDATION_ERROR", "FORBIDDEN"]) {
    const storage = makeStorage({ initial: JSON.stringify(SESSION) });
    let calls = 0;
    const harness = loadAuth({ storage, api: { validateSession: async () => { calls += 1; throw apiError(code); } } });
    assert.deepEqual(plain(await harness.auth.validateCurrentSession()), { status: "unauthenticated" });
    assert.equal(calls, 1);
    assert.equal(storage.values.has(STORAGE_KEY), false);
  }
  for (const code of ["TIMEOUT", "NETWORK_ERROR", "HTTP_ERROR", "MALFORMED_RESPONSE", "SERVER_ERROR"]) {
    const storage = makeStorage({ initial: JSON.stringify(SESSION) });
    let calls = 0;
    const harness = loadAuth({ storage, api: { validateSession: async () => { calls += 1; throw apiError(code); } } });
    assert.deepEqual(plain(await harness.auth.validateCurrentSession()), { status: "unconfirmed", code });
    assert.equal(calls, 1);
    assert.deepEqual(storedSession(storage), SESSION);
  }
});

test("protected guard reveals only after delayed authoritative success", async () => {
  const pending = deferred();
  const states = [];
  const storage = makeStorage({ initial: JSON.stringify(SESSION) });
  const harness = loadAuth({ storage, api: { validateSession: async () => pending.promise } });
  const guard = harness.auth.guardProtectedPage({
    onAuthenticated: (value) => states.push(["authenticated", plain(value)]),
    onRetry: (value) => states.push(["retry", plain(value)])
  });
  assert.deepEqual(states, []);
  assert.deepEqual(harness.location.replacements, []);
  pending.resolve(validServerSession());
  const result = await guard;
  assert.equal(result.status, "authenticated");
  assert.deepEqual(states, [["authenticated", plain(result)]]);
});

test("protected guard redirects missing invalid and rejected sessions without reveal", async () => {
  const fixtures = [
    { initial: undefined, api: {} },
    { initial: "not-json", api: {} },
    { initial: JSON.stringify(SESSION), api: { validateSession: async () => { throw apiError("UNAUTHORIZED"); } } }
  ];
  for (const fixture of fixtures) {
    let reveals = 0;
    const storage = makeStorage({ initial: fixture.initial });
    const harness = loadAuth({ storage, api: fixture.api, href: "https://site.example/admin/reviews.html?status=pending#queue" });
    const result = await harness.auth.guardProtectedPage({ onAuthenticated: () => { reveals += 1; } });
    assert.equal(result.status, "unauthenticated");
    assert.equal(reveals, 0);
    assert.deepEqual(harness.location.replacements, ["login.html?return=reviews.html%3Fstatus%3Dpending%23queue"]);
    assert.equal(harness.location.replacements[0].includes(TOKEN), false);
  }

  const unavailable = loadAuth({ storage: null, href: "https://site.example/admin/settings.html" });
  assert.deepEqual(plain(await unavailable.auth.guardProtectedPage()), { status: "unauthenticated" });
  assert.deepEqual(unavailable.location.replacements, ["login.html?return=settings.html"]);
});

test("protected guard keeps content hidden and reports retry on transient failure", async () => {
  const states = [];
  const storage = makeStorage({ initial: JSON.stringify(SESSION) });
  const harness = loadAuth({ storage, api: { validateSession: async () => { throw apiError("NETWORK_ERROR"); } } });
  const result = await harness.auth.guardProtectedPage({
    onAuthenticated: () => states.push("revealed"),
    onRetry: (value) => states.push(plain(value))
  });
  assert.deepEqual(plain(result), { status: "unconfirmed", code: "NETWORK_ERROR" });
  assert.deepEqual(states, [{ status: "unconfirmed", code: "NETWORK_ERROR" }]);
  assert.deepEqual(harness.location.replacements, []);
  assert.deepEqual(storedSession(storage), SESSION);
});

test("login-page guard validates before redirect and safely exposes login or retry states", async () => {
  const noLocalStates = [];
  const noLocal = loadAuth({ href: "https://site.example/admin/login.html" });
  assert.deepEqual(plain(await noLocal.auth.redirectAuthenticatedLogin({ onLoginAvailable: () => noLocalStates.push("available") })), { status: "unauthenticated" });
  assert.deepEqual(noLocalStates, ["available"]);

  const malformedStates = [];
  const malformedStorage = makeStorage({ initial: "not-json" });
  const malformed = loadAuth({ storage: malformedStorage, href: "https://site.example/admin/login.html" });
  assert.deepEqual(plain(await malformed.auth.redirectAuthenticatedLogin({ onLoginAvailable: () => malformedStates.push("available") })), { status: "unauthenticated" });
  assert.deepEqual(malformedStates, ["available"]);
  assert.equal(malformedStorage.values.has(STORAGE_KEY), false);

  const validStorage = makeStorage({ initial: JSON.stringify(SESSION) });
  const valid = loadAuth({ storage: validStorage, href: "https://site.example/admin/login.html", api: { validateSession: async () => validServerSession() } });
  const validResult = await valid.auth.redirectAuthenticatedLogin({ returnPath: "gallery.html#latest" });
  assert.equal(validResult.status, "authenticated");
  assert.deepEqual(valid.location.replacements, ["gallery.html#latest"]);

  for (const code of ["UNAUTHORIZED", "TIMEOUT"]) {
    const states = [];
    const storage = makeStorage({ initial: JSON.stringify(SESSION) });
    const harness = loadAuth({ storage, href: "https://site.example/admin/login.html", api: { validateSession: async () => { throw apiError(code); } } });
    const result = await harness.auth.redirectAuthenticatedLogin({
      onLoginAvailable: (value) => states.push(["available", plain(value)]),
      onRetry: (value) => states.push(["retry", plain(value)])
    });
    assert.deepEqual(harness.location.replacements, []);
    assert.equal(result.status, code === "UNAUTHORIZED" ? "unauthenticated" : "unconfirmed");
    assert.equal(states[0][0], code === "UNAUTHORIZED" ? "available" : "retry");
  }
});

test("logout success calls once then clears in finally and redirects without secrets", async () => {
  const events = [];
  const storage = makeStorage({ initial: JSON.stringify(SESSION), events });
  let calls = 0;
  const harness = loadAuth({
    storage,
    events,
    api: { logout: async (token) => { calls += 1; events.push(`api:logout:${token}`); return {}; } }
  });
  const result = await harness.auth.logout();
  assert.equal(calls, 1);
  assert.equal(events.indexOf(`api:logout:${TOKEN}`) < events.indexOf(`storage:remove:${STORAGE_KEY}`), true);
  assert.equal(storage.values.has(STORAGE_KEY), false);
  assert.deepEqual(harness.location.replacements, ["login.html"]);
  assert.deepEqual(plain(result), { status: "confirmed" });
  assertNoSecrets(result);
  assertNoSecrets(harness.location.replacements);
});

test("logout retries transient failure once and never retries confirmed or application outcomes", async () => {
  const cases = [
    { outcomes: [apiError("NETWORK_ERROR"), {}], calls: 2, status: "confirmed" },
    { outcomes: [apiError("TIMEOUT"), apiError("HTTP_ERROR")], calls: 2, status: "unconfirmed" },
    { outcomes: [apiError("MALFORMED_RESPONSE"), apiError("SERVER_ERROR")], calls: 2, status: "unconfirmed" },
    { outcomes: [apiError("UNAUTHORIZED")], calls: 1, status: "unconfirmed" },
    { outcomes: [apiError("VALIDATION_ERROR")], calls: 1, status: "unconfirmed" },
    { outcomes: [apiError("FORBIDDEN")], calls: 1, status: "unconfirmed" },
    { outcomes: [apiError("RATE_LIMITED")], calls: 1, status: "unconfirmed" },
    { outcomes: [{}], calls: 1, status: "confirmed" }
  ];
  for (const fixture of cases) {
    const outcomes = fixture.outcomes.slice();
    let calls = 0;
    const storage = makeStorage({ initial: JSON.stringify(SESSION) });
    const harness = loadAuth({ storage, api: { logout: async () => {
      calls += 1;
      const outcome = outcomes.shift();
      if (outcome instanceof Error) throw outcome;
      return outcome;
    } } });
    const result = await harness.auth.logout();
    assert.equal(calls, fixture.calls);
    assert.equal(result.status, fixture.status);
    assert.equal(storage.values.has(STORAGE_KEY), false);
    assert.deepEqual(harness.location.replacements, ["login.html"]);
    assertNoSecrets(result);
  }
});

test("logout skips transport without a well-formed local token and still clears locally", async () => {
  const fixtures = [
    { initial: undefined, status: "confirmed" },
    { initial: "not-json", status: "unconfirmed" },
    { initial: JSON.stringify({ ...SESSION, token: "invalid" }), status: "unconfirmed" }
  ];
  for (const fixture of fixtures) {
    let calls = 0;
    const storage = makeStorage({ initial: fixture.initial });
    const harness = loadAuth({ storage, api: { logout: async () => { calls += 1; } } });
    assert.deepEqual(plain(await harness.auth.logout()), { status: fixture.status });
    assert.equal(calls, 0);
    assert.equal(storage.values.has(STORAGE_KEY), false);
    assert.deepEqual(harness.location.replacements, ["login.html"]);
  }

  let calls = 0;
  const unreadable = makeStorage({ initial: JSON.stringify(SESSION), getError: new Error(TOKEN) });
  const denied = loadAuth({ storage: unreadable, api: { logout: async () => { calls += 1; } } });
  assert.deepEqual(plain(await denied.auth.logout()), { status: "unconfirmed" });
  assert.equal(calls, 0);
  assert.equal(unreadable.values.has(STORAGE_KEY), false);
});

test("logout still revokes a canonical token from an expired browser projection", async () => {
  let tokenSeen;
  const expired = { ...SESSION, expires_at: new Date(NOW).toISOString() };
  const storage = makeStorage({ initial: JSON.stringify(expired) });
  const harness = loadAuth({ storage, api: { logout: async (token) => { tokenSeen = token; return {}; } } });
  assert.deepEqual(plain(await harness.auth.logout()), { status: "confirmed" });
  assert.equal(tokenSeen, TOKEN);
  assert.equal(storage.values.has(STORAGE_KEY), false);
});

test("logout never restores state and safely reports a failed finally clear", async () => {
  const events = [];
  const storage = makeStorage({ initial: JSON.stringify(SESSION), removeError: new Error(`clear failed ${TOKEN}`), events });
  let calls = 0;
  const harness = loadAuth({ storage, events, api: { logout: async () => { calls += 1; throw apiError("NETWORK_ERROR"); } } });
  const result = await harness.auth.logout();
  assert.equal(calls, 2);
  assert.deepEqual(plain(result), { status: "local-clear-failed", code: "STORAGE_ERROR" });
  assert.equal(events.filter((event) => event === `storage:remove:${STORAGE_KEY}`).length, 1);
  assert.equal(events.some((event) => event === `storage:set:${STORAGE_KEY}`), false);
  assert.deepEqual(harness.location.replacements, ["login.html"]);
  assertNoSecrets(result);
  assertNoSecrets(harness.logs);
});

test("a stale failed validation cannot clear a newer authoritative success", async () => {
  const first = deferred();
  const second = deferred();
  const pending = [first, second];
  const storage = makeStorage({ initial: JSON.stringify(SESSION) });
  const harness = loadAuth({ storage, api: { validateSession: async () => pending.shift().promise } });
  const older = harness.auth.validateCurrentSession();
  const newer = harness.auth.validateCurrentSession();
  second.resolve(validServerSession({ admin: { display_name: "ผู้ตรวจสอบ", role: "reviewer" } }));
  assert.equal((await newer).status, "authenticated");
  first.reject(apiError("UNAUTHORIZED"));
  assert.deepEqual(plain(await older), { status: "stale" });
  assert.deepEqual(storedSession(storage), { ...SESSION, display_name: "ผู้ตรวจสอบ", role: "reviewer" });
});

test("production source excludes alternate auth persistence retries and secret sinks", async () => {
  assert.doesNotMatch(productionSource, /localStorage|document\s*\.\s*cookie|indexedDB|window\s*\.\s*name|\bAuthorization\b|\beval\s*\(|new\s+Function|console\s*\./i);
  assert.doesNotMatch(productionSource, /URLSearchParams\s*\([^)]*token|location\s*\.(?:search|hash)[\s\S]{0,120}token/i);
  assert.doesNotMatch(productionSource, /setInterval|setTimeout/i);
  assert.match(productionSource, /TAKHUN_ADMIN_SESSION/);
  assert.match(productionSource, /sessionStorage/);
});

test("runner invokes Admin Auth and propagates its failure immediately", async () => {
  const runner = fs.readFileSync(path.join(__dirname, "test.ps1"), "utf8");
  assert.match(runner, /node \(Join-Path \$PSScriptRoot "test-admin-auth\.js"\)\r?\nif \(\$LASTEXITCODE -ne 0\) \{ throw "Admin browser auth verification failed\." \}/);
});

(async () => {
  for (const { name, run } of tests) {
    await run();
    process.stdout.write(`PASS ${name}\n`);
  }
  process.stdout.write(`Admin browser auth verification passed: ${tests.length} tests.\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
