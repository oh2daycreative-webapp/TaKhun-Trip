"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const modulePath = path.join(__dirname, "../public/admin/js/admin-auth.js");
assert.ok(fs.existsSync(modulePath), "public/admin/js/admin-auth.js must exist before Admin browser auth contracts can run");
const productionSource = fs.readFileSync(modulePath, "utf8").replace(/\r\n/g, "\n");
const loginPagePath = path.join(__dirname, "../public/admin/login.html");
const loginCssPath = path.join(__dirname, "../public/css/admin.css");
const loginHtml = fs.readFileSync(loginPagePath, "utf8").replace(/\r\n/g, "\n");
const loginCss = fs.readFileSync(loginCssPath, "utf8");

const STORAGE_KEY = "TAKHUN_ADMIN_SESSION";
const NOW = Date.parse("2026-08-08T04:00:00.000Z");
const EXPIRES_AT = "2026-08-08T12:00:00.000Z";
const TOKEN = "-".padEnd(43, "A");
const ADMIN_ID = "ADM-123e4567-e89b-42d3-a456-426614174000";
const OTHER_ADMIN_ID = "ADM-223e4567-e89b-42d3-a456-426614174000";
const UNSAFE_RETURN_CANDIDATES = Object.freeze([
  "https://evil.example/x",
  "../dashboard.html",
  "%2e%2e/dashboard.html",
  "login.html",
  "dashboard.html?token=SECRET",
  "dashboard.html?password=SECRET",
  "//evil.example/x"
]);
const EXISTING_RETURN_PAGES = Object.freeze([
  "dashboard.html", "places.html", "routes.html", "products.html", "events.html",
  "reviews.html", "gallery.html", "settings.html", "404.html"
]);
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

function loginPageScript(html = loginHtml) {
  const match = html.match(/<script\s+data-admin-login-script[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(match, "login page must contain its executable page-local integration script");
  return match[1];
}

function makeLoginElement(initial = {}, attributeWrites = [], focusEvents = []) {
  const listeners = new Map();
  const attributes = new Map();
  return Object.assign({
    value: "",
    textContent: "",
    hidden: false,
    disabled: false,
    focused: false,
    addEventListener(type, listener) { listeners.set(type, listener); },
    setAttribute(name, value) {
      const serialized = String(value);
      attributes.set(name, serialized);
      attributeWrites.push({ element: initial.testId || "unknown", name, value: serialized });
    },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
    removeAttribute(name) { attributes.delete(name); },
    focus() {
      focusEvents.push({ element: initial.testId || "unknown", disabled: this.disabled });
      this.focused = true;
    },
    async dispatch(type) {
      const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      const result = listeners.has(type) ? listeners.get(type)(event) : undefined;
      await Promise.resolve(result);
      return event;
    }
  }, initial);
}

function loadLoginPage({
  rawReturn = null,
  returnValue = null,
  redirectOutcome = "unauthenticated",
  loginImpl,
  pageSource = loginPageScript()
} = {}) {
  const calls = {
    safe: [],
    redirects: [],
    logins: [],
    timers: [],
    clears: [],
    console: [],
    location: [],
    locationWrites: [],
    storage: [],
    persistenceWrites: [],
    attributeWrites: [],
    focusEvents: []
  };
  const ids = {
    "admin-login-form": makeLoginElement({ hidden: true, testId: "admin-login-form" }, calls.attributeWrites, calls.focusEvents),
    "admin-login-username": makeLoginElement({ testId: "admin-login-username" }, calls.attributeWrites, calls.focusEvents),
    "admin-login-password": makeLoginElement({ testId: "admin-login-password" }, calls.attributeWrites, calls.focusEvents),
    "admin-login-submit": makeLoginElement({ disabled: true, testId: "admin-login-submit" }, calls.attributeWrites, calls.focusEvents),
    "admin-login-status": makeLoginElement({ testId: "admin-login-status" }, calls.attributeWrites, calls.focusEvents),
    "admin-login-retry": makeLoginElement({ hidden: true, disabled: true, testId: "admin-login-retry" }, calls.attributeWrites, calls.focusEvents)
  };
  ids["admin-login-form"].setAttribute("aria-busy", "false");
  ids["admin-login-form"].setAttribute("aria-hidden", "true");
  const windowListeners = new Map();
  const timers = new Map();
  let timerId = 0;
  let timerNow = 0;
  const auth = {
    safeReturnPath(candidate) {
      calls.safe.push(candidate);
      return returnValue || (candidate === "reviews.html" ? candidate : "dashboard.html");
    },
    async redirectAuthenticatedLogin(options) {
      calls.redirects.push(options.returnPath);
      if (redirectOutcome === "authenticated") return { status: "authenticated" };
      if (redirectOutcome === "unconfirmed") {
        if (options.onRetry) options.onRetry();
        return { status: "unconfirmed" };
      }
      if (options.onLoginAvailable) options.onLoginAvailable();
      return { status: "unauthenticated" };
    },
    async login(username, password, returnPath) {
      calls.logins.push([username, password, returnPath]);
      if (loginImpl) return loginImpl(username, password, returnPath);
      return { status: "error", code: "UNAUTHORIZED" };
    }
  };
  const document = { getElementById(id) { return ids[id] || null; } };
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get() { return ""; },
    set(value) { calls.persistenceWrites.push({ surface: "cookie", value: String(value) }); }
  });
  const initialHref = `https://site.example/admin/login.html${rawReturn === null && returnValue === "reviews.html" ? "?return=reviews.html" : rawReturn === null ? "" : `?return=${encodeURIComponent(rawReturn)}`}`;
  let currentHref = initialHref;
  const location = {
    replace(value) {
      calls.location.push(String(value));
      calls.locationWrites.push({ surface: "replace", value: String(value) });
    },
    assign(value) {
      calls.location.push(String(value));
      calls.locationWrites.push({ surface: "assign", value: String(value) });
    }
  };
  for (const field of ["href", "pathname", "search", "hash"]) {
    Object.defineProperty(location, field, {
      configurable: true,
      get() {
        const parsed = new URL(currentHref);
        return field === "href" ? currentHref : parsed[field];
      },
      set(value) {
        calls.locationWrites.push({ surface: field, value: String(value) });
        if (field === "href") currentHref = String(value);
      }
    });
  }
  const context = {
    window: null,
    document,
    URL,
    URLSearchParams,
    location,
    TakhunAdminAuth: auth,
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, due: timerNow + delay });
      calls.timers.push(delay);
      return id;
    },
    clearTimeout(id) { calls.clears.push(id); timers.delete(id); },
    console: new Proxy({}, { get() { return (...args) => calls.console.push(args); } })
  };
  for (const storageName of ["sessionStorage", "localStorage"]) {
    const storage = {
      getItem(key) {
        calls.storage.push({ surface: storageName, operation: "getItem", key: String(key) });
        return null;
      },
      setItem(key, value) {
        calls.persistenceWrites.push({ surface: storageName, operation: "setItem", key: String(key), value: String(value) });
      },
      removeItem(key) {
        calls.persistenceWrites.push({ surface: storageName, operation: "removeItem", key: String(key) });
      }
    };
    Object.defineProperty(context, storageName, {
      configurable: true,
      get() {
        calls.storage.push({ surface: storageName, operation: "access" });
        return storage;
      }
    });
  }
  context.window = context;
  context.addEventListener = (type, listener) => windowListeners.set(type, listener);
  vm.createContext(context);
  vm.runInContext(pageSource, context, { filename: "public/admin/login.html" });
  return {
    ids,
    calls,
    timers,
    auth,
    async start() {
      await Promise.resolve(windowListeners.get("DOMContentLoaded")());
      await Promise.resolve();
      await Promise.resolve();
    },
    activeTimerCount() { return timers.size; },
    async advanceTimersBy(milliseconds) {
      const target = timerNow + milliseconds;
      while (true) {
        const ready = [...timers.entries()]
          .filter((entry) => entry[1].due <= target)
          .sort((left, right) => left[1].due - right[1].due || left[0] - right[0]);
        if (!ready.length) break;
        const [id, timer] = ready[0];
        timers.delete(id);
        timerNow = timer.due;
        await Promise.resolve(timer.callback());
      }
      timerNow = target;
    },
    async runTimers() {
      if (!timers.size) return;
      const latest = Math.max(...[...timers.values()].map((timer) => timer.due));
      await this.advanceTimersBy(latest - timerNow);
    }
  };
}

function mutatedLoginPageSource(find, replacement, source = loginPageScript()) {
  const mutated = source.replace(find, replacement);
  assert.notEqual(mutated, source, `login-page mutation target must exist: ${find}`);
  return mutated;
}

async function enterValidLogin(harness, passwordValue = "PasswordSentinel") {
  harness.ids["admin-login-username"].value = "operator";
  harness.ids["admin-login-password"].value = passwordValue;
  await harness.ids["admin-login-username"].dispatch("input");
  await harness.ids["admin-login-password"].dispatch("input");
}

async function assertRecoverableFocus(pageSource = loginPageScript()) {
  const outcomes = [
    { name: "UNAUTHORIZED", result: { status: "error", code: "UNAUTHORIZED" }, focus: "admin-login-username" },
    ...["RATE_LIMITED", "NETWORK_ERROR", "TIMEOUT", "HTTP_ERROR", "SERVER_ERROR", "MALFORMED_RESPONSE"].map((code) => ({
      name: code,
      result: { status: "error", code },
      focus: "admin-login-password"
    })),
    { name: "unexpected", error: new Error("internal PasswordSentinel detail"), focus: "admin-login-password" }
  ];
  for (const outcome of outcomes) {
    const harness = loadLoginPage({
      pageSource,
      loginImpl: async () => {
        if (outcome.error) throw outcome.error;
        return outcome.result;
      }
    });
    await harness.start();
    await enterValidLogin(harness);
    await harness.ids["admin-login-form"].dispatch("submit");
    const focused = harness.ids[outcome.focus];
    assert.equal(harness.ids["admin-login-password"].value, "", `${outcome.name} retained the password`);
    assert.equal(harness.ids["admin-login-form"].getAttribute("aria-busy"), "false", `${outcome.name} left the form busy`);
    assert.equal(focused.focused, true, `${outcome.name} did not restore actionable focus`);
    assert.equal(focused.disabled, false, `${outcome.name} focused a disabled control`);
    assert.deepEqual(harness.calls.focusEvents.at(-1), { element: outcome.focus, disabled: false });
    assertNoSecrets(harness.calls.attributeWrites, ["PasswordSentinel"]);
  }
}

async function assertPasswordBoundaryContract(pageSource = loginPageScript()) {
  const harness = loadLoginPage({ pageSource });
  await harness.start();
  const username = harness.ids["admin-login-username"];
  const password = harness.ids["admin-login-password"];
  const submit = harness.ids["admin-login-submit"];
  username.value = "operator";
  await username.dispatch("input");
  password.value = "A".repeat(128);
  await password.dispatch("input");
  assert.equal(submit.disabled, false, "128 ASCII code points and bytes must be accepted");
  password.value = "A".repeat(129);
  await password.dispatch("input");
  assert.equal(submit.disabled, true, "129 ASCII code points must be rejected independently of byte count");
  for (const malformed of ["\uD800", "\uDC00", "\uD800A", "\uDC00\uD800"]) {
    password.value = malformed;
    await password.dispatch("input");
    assert.equal(submit.disabled, true, "malformed surrogate input must be rejected");
  }
}

async function assertPasswordClearedFor(code, pageSource = loginPageScript()) {
  const harness = loadLoginPage({ pageSource, loginImpl: async () => ({ status: "error", code }) });
  await harness.start();
  await enterValidLogin(harness);
  await harness.ids["admin-login-form"].dispatch("submit");
  assert.equal(harness.ids["admin-login-password"].value, "", `${code} retained the password`);
  assert.equal(harness.ids["admin-login-form"].getAttribute("aria-busy"), "false");
  assert.equal(harness.ids["admin-login-password"].disabled, false);
  assert.doesNotMatch(harness.ids["admin-login-status"].textContent, /PasswordSentinel|internal|raw response/i);
}

async function assertCooldownContract(pageSource = loginPageScript()) {
  const harness = loadLoginPage({ pageSource, loginImpl: async () => ({ status: "error", code: "RATE_LIMITED" }) });
  await harness.start();
  await enterValidLogin(harness, "FirstPassword");
  await harness.ids["admin-login-form"].dispatch("submit");
  assert.equal(harness.calls.logins.length, 1);
  assert.deepEqual(harness.calls.timers, [60000]);
  assert.equal(harness.activeTimerCount(), 1);
  assert.equal(harness.ids["admin-login-submit"].disabled, true);
  assert.equal(harness.calls.persistenceWrites.length, 0);
  assert.equal(harness.calls.storage.length, 0);

  harness.ids["admin-login-password"].value = "SecondPassword";
  await harness.ids["admin-login-password"].dispatch("input");
  await harness.advanceTimersBy(59999);
  assert.equal(harness.ids["admin-login-submit"].disabled, true);
  await harness.ids["admin-login-form"].dispatch("submit");
  assert.equal(harness.calls.logins.length, 1, "cooldown handler allowed a blocked resubmit");
  assert.equal(harness.activeTimerCount(), 1);

  await harness.advanceTimersBy(1);
  assert.equal(harness.activeTimerCount(), 0);
  assert.equal(harness.ids["admin-login-submit"].disabled, false);
  assert.equal(harness.calls.logins.length, 1, "cooldown expiry retried automatically");

  await harness.ids["admin-login-form"].dispatch("submit");
  assert.equal(harness.calls.logins.length, 2);
  assert.deepEqual(harness.calls.timers, [60000, 60000]);
  assert.equal(harness.activeTimerCount(), 1, "repeated rate limits must leave one active timer");
  assert.equal(harness.calls.persistenceWrites.length, 0);
  assert.equal(harness.calls.storage.length, 0);
  harness.ids["admin-login-password"].value = "ThirdPassword";
  await harness.ids["admin-login-password"].dispatch("input");
  await harness.advanceTimersBy(60000);
  assert.equal(harness.activeTimerCount(), 0);
  assert.equal(harness.calls.logins.length, 2, "repeated cooldown expiry retried automatically");
  assert.equal(harness.ids["admin-login-submit"].disabled, false);
  assert.equal(harness.calls.persistenceWrites.length, 0);
  assert.equal(harness.calls.storage.length, 0);
}

async function assertPageSecretSinks(pageSource = loginPageScript()) {
  const sessionMarker = '{"session":"SESSION_JSON_SENTINEL"}';
  const harness = loadLoginPage({
    pageSource,
    loginImpl: async () => ({ status: "error", code: "SERVER_ERROR", token: TOKEN, session: sessionMarker })
  });
  await harness.start();
  await enterValidLogin(harness);
  await harness.ids["admin-login-form"].dispatch("submit");
  const secrets = ["PasswordSentinel", TOKEN, "SESSION_JSON_SENTINEL", sessionMarker];
  assertNoSecrets(harness.calls.attributeWrites, secrets);
  assertNoSecrets(harness.calls.locationWrites, secrets);
  assertNoSecrets(harness.calls.location, secrets);
  assertNoSecrets(harness.calls.console, secrets);
  assertNoSecrets(harness.calls.persistenceWrites, secrets);
  assertNoSecrets(harness.ids["admin-login-status"].textContent, secrets);
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

function mutatedSource(find, replacement) {
  const mutated = productionSource.replace(find, replacement);
  assert.notEqual(mutated, productionSource, `mutation target must exist: ${find}`);
  return mutated;
}

async function proveContractRejects(check) {
  await assert.rejects(check, (error) => error instanceof assert.AssertionError);
}

async function assertPlaceEditReturnGrammar(source = productionSource, observation = {}) {
  const { auth } = loadAuth({ source, href: "https://site.example/admin/login.html" });
  const sixtyFour = `A${"b".repeat(63)}`;
  const accepted = [
    ["place-edit.html", "place-edit.html"],
    ["place-edit.html?place_id=A", "place-edit.html?place_id=A"],
    [`place-edit.html?place_id=${sixtyFour}`, `place-edit.html?place_id=${sixtyFour}`],
    ["place-edit.html?place_id=BTK-001_alpha", "place-edit.html?place_id=BTK-001_alpha"],
    ["place-edit.html?place_id=BTK%2D001", "place-edit.html?place_id=BTK-001"],
    ["https://site.example/admin/place-edit.html?place_id=BTK-001", "place-edit.html?place_id=BTK-001"]
  ];
  observation.accepted = [];
  for (const [candidate, expected] of accepted) {
    const actual = auth.safeReturnPath(candidate);
    observation.accepted.push({ candidate, actual });
    assert.equal(actual, expected, `rejected or failed to canonicalize ${JSON.stringify(candidate)}`);
  }

  const tokenLikeId = "-".padEnd(43, "A");
  const rejected = [
    " place-edit.html",
    "place-edit.html ",
    "place-edit.html?",
    "place-edit.html?place_id=",
    `place-edit.html?place_id=${"A".repeat(65)}`,
    "place-edit.html?place_id=_ABC",
    "place-edit.html?place_id=-ABC",
    "place-edit.html?place_id=A.B",
    "place-edit.html?place_id=A/B",
    "place-edit.html?place_id=A%2FB",
    "place-edit.html?place_id=à¸",
    "place-edit.html?place_id=%E0%B8%81",
    "place-edit.html?place_id=A&place_id=B",
    "place-edit.html?place_id=A&extra=B",
    "place-edit.html?extra=A",
    "place-edit.html#fragment",
    "place-edit.html#",
    "place-edit.html?place_id=A#fragment",
    "place-edit.html?place_id=..",
    "place-edit.html?place_id=%2e%2e",
    "place-edit.html?place_id=%252e%252e",
    "place-edit.html?place_id=..%2FA",
    "place-edit.html?place_id=%00A",
    "place-edit.html?place_id=A%5cB",
    "place-edit.html\\..\\dashboard.html",
    "place-edit.html%5c..%5cdashboard.html",
    "place-edit.html\u0000",
    "place-edit.html?token=SECRET",
    "place-edit.html?password=SECRET",
    "place-edit.html?session=SECRET",
    `place-edit.html?place_id=${tokenLikeId}`,
    "place-edit.html?return=login.html",
    "place-edit.html/login.html",
    "../place-edit.html?place_id=A",
    "%2e%2e/place-edit.html?place_id=A",
    "%252e%252e/place-edit.html?place_id=A",
    "https://evil.example/admin/place-edit.html?place_id=A",
    "//evil.example/admin/place-edit.html?place_id=A",
    "https://user:pass@site.example/admin/place-edit.html?place_id=A"
  ];
  observation.rejected = [];
  for (const candidate of rejected) {
    const actual = auth.safeReturnPath(candidate);
    observation.rejected.push({ candidate, actual });
    assert.equal(actual, "places.html", `unsafe Place Edit return did not use safe fallback: ${JSON.stringify(candidate)}`);
  }
  observation.completed = true;
}

async function assertStaleSuccessIgnored(source = productionSource, observation = {}) {
  const pending = deferred();
  const storage = makeStorage({ initial: JSON.stringify(SESSION) });
  let reveals = 0;
  const harness = loadAuth({
    source,
    storage,
    api: {
      validateSession: async () => pending.promise,
      logout: async () => ({})
    }
  });
  const olderGuard = harness.auth.guardProtectedPage({ onAuthenticated: () => { reveals += 1; } });
  assert.deepEqual(plain(await harness.auth.logout()), { status: "confirmed" });
  pending.resolve(validServerSession());
  const olderResult = await olderGuard;
  observation.completed = true;
  observation.result = plain(olderResult);
  observation.reveals = reveals;
  observation.storageRestored = storage.values.has(STORAGE_KEY);
  observation.replacements = harness.location.replacements.slice();
  assert.deepEqual(plain(olderResult), { status: "stale" });
  assert.equal(reveals, 0);
  assert.equal(storage.values.has(STORAGE_KEY), false);
  assert.deepEqual(harness.location.replacements, ["login.html"]);
}

async function assertEveryProtectedGuardRevalidates(source = productionSource, observation = {}) {
  let validationCalls = 0;
  let firstReveals = 0;
  let secondReveals = 0;
  const storage = makeStorage({ initial: JSON.stringify(SESSION) });
  const harness = loadAuth({
    source,
    storage,
    href: "https://site.example/admin/places.html",
    api: {
      validateSession: async () => {
        validationCalls += 1;
        if (validationCalls === 1) return validServerSession();
        throw apiError("UNAUTHORIZED");
      }
    }
  });
  const first = await harness.auth.guardProtectedPage({ onAuthenticated: () => { firstReveals += 1; } });
  const second = await harness.auth.guardProtectedPage({ onAuthenticated: () => { secondReveals += 1; } });
  observation.completed = true;
  observation.validationCalls = validationCalls;
  observation.first = plain(first);
  observation.second = plain(second);
  observation.firstReveals = firstReveals;
  observation.secondReveals = secondReveals;
  observation.storagePresent = storage.values.has(STORAGE_KEY);
  assert.equal(first.status, "authenticated");
  assert.equal(second.status, "unauthenticated");
  assert.equal(validationCalls, 2);
  assert.equal(firstReveals, 1);
  assert.equal(secondReveals, 0);
  assert.equal(storage.values.has(STORAGE_KEY), false);
  assert.deepEqual(harness.location.replacements, ["login.html?return=places.html"]);
}

async function assertLoginSanitizesUnsafeReturns(source = productionSource, observation = {}) {
  observation.navigations = [];
  for (const candidate of UNSAFE_RETURN_CANDIDATES) {
    const storage = makeStorage();
    const harness = loadAuth({
      source,
      storage,
      href: "https://site.example/admin/login.html",
      api: { login: async () => ({ admin: ADMIN, token: TOKEN, expires_at: EXPIRES_AT }) }
    });
    const result = await harness.auth.login("operator", "PasswordSentinel", candidate);
    observation.navigations.push({ candidate, target: harness.location.replacements[0], redirect: result.redirect });
    observation.navigationAssertionReached = true;
    assert.deepEqual(harness.location.replacements, ["dashboard.html"]);
    assert.equal(result.redirect, "dashboard.html");
    assert.equal(harness.location.replacements.some((target) => target.includes("SECRET") || target === candidate), false);
  }
  observation.completed = true;
}

async function assertProtectedRedirectSanitizesCurrentLocation(source = productionSource, observation = {}) {
  const unsafeLocations = [
    "https://evil.example/x",
    "https://site.example/admin/%252e%252e/dashboard.html",
    "https://site.example/admin/reviews.html?token=SECRET",
    "https://site.example/admin/reviews.html?password=SECRET"
  ];
  observation.navigations = [];
  for (const href of unsafeLocations) {
    const harness = loadAuth({ source, href });
    const result = await harness.auth.guardProtectedPage();
    observation.navigations.push({ href, target: harness.location.replacements[0] });
    observation.navigationAssertionReached = true;
    assert.deepEqual(plain(result), { status: "unauthenticated" });
    assert.deepEqual(harness.location.replacements, ["login.html?return=dashboard.html"]);
    assert.equal(harness.location.replacements[0].includes("SECRET"), false);
  }
  observation.completed = true;
}

async function assertAuthenticatedLoginSanitizesUnsafeReturns(source = productionSource, observation = {}) {
  observation.navigations = [];
  for (const candidate of UNSAFE_RETURN_CANDIDATES) {
    const storage = makeStorage({ initial: JSON.stringify(SESSION) });
    const harness = loadAuth({
      source,
      storage,
      href: "https://site.example/admin/login.html",
      api: { validateSession: async () => validServerSession() }
    });
    const result = await harness.auth.redirectAuthenticatedLogin({ returnPath: candidate });
    observation.navigations.push({ candidate, target: harness.location.replacements[0] });
    observation.navigationAssertionReached = true;
    assert.equal(result.status, "authenticated");
    assert.deepEqual(harness.location.replacements, ["dashboard.html"]);
    assert.equal(harness.location.replacements.some((target) => target.includes("SECRET") || target === candidate), false);
  }
  observation.completed = true;
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

test("safeReturnPath admits only the bounded canonical Place Edit grammar", async () => {
  await assertPlaceEditReturnGrammar();
});

test("Place Edit return assertions reject preserving raw query text", async () => {
  const source = mutatedSource(
    "    return `${PLACE_EDIT_PAGE}?place_id=${encodeURIComponent(placeId)}`;",
    "    return `${PLACE_EDIT_PAGE}${target.search}`;"
  );
  const observation = {};
  await proveContractRejects(() => assertPlaceEditReturnGrammar(source, observation));
  assert.equal(observation.accepted.some((item) => item.candidate.includes("%2D") && item.actual.includes("%2D")), true);
});

test("all existing allowlisted pages retain query and fragment behavior without becoming Place Edit aliases", async () => {
  const { auth } = loadAuth({ href: "https://site.example/admin/login.html" });
  for (const page of EXISTING_RETURN_PAGES) {
    const candidate = `${page}?view=approved#section`;
    assert.equal(auth.safeReturnPath(candidate), candidate);
  }
  assert.equal(auth.safeReturnPath("places.html?edit=BTK-001"), "places.html?edit=BTK-001");
  assert.equal(auth.safeReturnPath("login.html?return=place-edit.html%3Fplace_id%3DBTK-001"), "dashboard.html");
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

test("a stale successful guard cannot restore state after logout invalidates it", async () => {
  await assertStaleSuccessIgnored();
});

test("stale-success assertions reject removal of the success-path generation check", async () => {
  const source = mutatedSource(
    '    if (generation !== validationGeneration) return { status: "stale" };\n    if (!exactKeys(response, ["admin", "expires_at"]))',
    '    /* test-only mutation accepts stale successful validation */\n    if (!exactKeys(response, ["admin", "expires_at"]))'
  );
  const observation = {};
  await proveContractRejects(() => assertStaleSuccessIgnored(source, observation));
  assert.equal(observation.completed, true);
  assert.equal(observation.result.status, "authenticated");
  assert.equal(observation.reveals, 1);
  assert.equal(observation.storageRestored, true);
});

test("every protected guard revalidates authority on the same loaded module", async () => {
  await assertEveryProtectedGuardRevalidates();
});

test("protected-guard assertions reject caching a previous successful authority result", async () => {
  const source = mutatedSource(
    '  async function guardProtectedPage(options) {\n    const callbacks = options && typeof options === "object" ? options : {};\n    const result = await validateCurrentSession();',
    '  let cachedSuccessfulGuard = null;\n  async function guardProtectedPage(options) {\n    const callbacks = options && typeof options === "object" ? options : {};\n    const result = cachedSuccessfulGuard || await validateCurrentSession();\n    if (result.status === "authenticated") cachedSuccessfulGuard = result;'
  );
  const observation = {};
  await proveContractRejects(() => assertEveryProtectedGuardRevalidates(source, observation));
  assert.equal(observation.completed, true);
  assert.equal(observation.validationCalls, 1);
  assert.equal(observation.second.status, "authenticated");
  assert.equal(observation.secondReveals, 1);
  assert.equal(observation.storagePresent, true);
});

test("successful login sanitizes every unsafe return before navigation", async () => {
  await assertLoginSanitizesUnsafeReturns();
});

test("login consumer assertions reject navigating to the raw return candidate", async () => {
  const source = mutatedSource(
    "    const redirect = safeReturnPath(returnCandidate);",
    "    const redirect = returnCandidate;"
  );
  const observation = {};
  await proveContractRejects(() => assertLoginSanitizesUnsafeReturns(source, observation));
  assert.equal(observation.navigationAssertionReached, true);
  assert.deepEqual(observation.navigations[0], {
    candidate: "https://evil.example/x",
    target: "https://evil.example/x",
    redirect: "https://evil.example/x"
  });
});

test("protected-page redirects sanitize unsafe current locations before building login return", async () => {
  await assertProtectedRedirectSanitizesCurrentLocation();
});

test("protected-page redirect assertions reject using the raw current location", async () => {
  const source = mutatedSource(
    "      return safeReturnPath(global.location.href);",
    "      return global.location.href;"
  );
  const observation = {};
  await proveContractRejects(() => assertProtectedRedirectSanitizesCurrentLocation(source, observation));
  assert.equal(observation.navigationAssertionReached, true);
  assert.deepEqual(observation.navigations[0], {
    href: "https://evil.example/x",
    target: "login.html?return=https%3A%2F%2Fevil.example%2Fx"
  });
});

test("authenticated login redirects sanitize every unsafe requested return", async () => {
  await assertAuthenticatedLoginSanitizesUnsafeReturns();
});

test("authenticated-login assertions reject redirecting to the raw requested return", async () => {
  const source = mutatedSource(
    "      replaceLocation(safeReturnPath(callbacks.returnPath));",
    "      replaceLocation(callbacks.returnPath);"
  );
  const observation = {};
  await proveContractRejects(() => assertAuthenticatedLoginSanitizesUnsafeReturns(source, observation));
  assert.equal(observation.navigationAssertionReached, true);
  assert.deepEqual(observation.navigations[0], {
    candidate: "https://evil.example/x",
    target: "https://evil.example/x"
  });
});

test("login page exposes the approved accessible form and dependency order", async () => {
  assert.match(loginHtml, /<html\s+lang=["']th["']/i);
  assert.equal((loginHtml.match(/<main\b/gi) || []).length, 1);
  assert.equal((loginHtml.match(/<h1\b/gi) || []).length, 1);
  assert.match(loginHtml, /<form[^>]+id=["']admin-login-form["'][^>]+hidden[^>]+aria-hidden=["']true["'][^>]+aria-busy=["']false["']/i);
  assert.match(loginHtml, /<label[^>]+for=["']admin-login-username["']/i);
  assert.match(loginHtml, /id=["']admin-login-username["'][^>]+name=["']username["'][^>]+autocomplete=["']username["'][^>]+required[^>]+maxlength=["']64["']/i);
  assert.match(loginHtml, /<label[^>]+for=["']admin-login-password["']/i);
  assert.match(loginHtml, /id=["']admin-login-password["'][^>]+type=["']password["'][^>]+name=["']password["'][^>]+autocomplete=["']current-password["'][^>]+required[^>]+maxlength=["']256["']/i);
  assert.match(loginHtml, /id=["']admin-login-status["'][^>]+role=["']status["'][^>]+aria-live=["']polite["'][^>]+aria-atomic=["']true["']/i);
  assert.match(loginHtml, /id=["']admin-login-submit["'][^>]+disabled/i);
  assert.match(loginHtml, /href=["']\.\.\/index\.html["']/i);
  const scripts = [...loginHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((match) => match[1]);
  assert.deepEqual(scripts, ["../js/config.js", "js/admin-api.js", "js/admin-auth.js"]);
  assert.doesNotMatch(loginHtml, /สมัคร|register|default password|ตัวอย่างรหัส|name=["']email["']|language/i);
  loginPageScript();
});

test("login startup stays hidden until authoritative validation permits login", async () => {
  const pending = deferred();
  const harness = loadLoginPage({ redirectOutcome: "authenticated" });
  harness.auth.redirectAuthenticatedLogin = async (options) => {
    harness.calls.redirects.push(options.returnPath);
    return pending.promise;
  };
  const starting = harness.start();
  await Promise.resolve();
  assert.equal(harness.ids["admin-login-form"].hidden, true);
  assert.equal(harness.ids["admin-login-submit"].disabled, true);
  assert.match(harness.ids["admin-login-status"].textContent, /กำลัง|ตรวจสอบ/);
  pending.resolve({ status: "authenticated" });
  await starting;
  assert.equal(harness.ids["admin-login-form"].hidden, true);

  const available = loadLoginPage();
  await available.start();
  assert.equal(available.ids["admin-login-form"].hidden, false);
  assert.equal(available.ids["admin-login-form"].getAttribute("aria-hidden"), "false");
});

test("login eligibility enforces raw and UTF-8 bounds without transforming credentials", async () => {
  const harness = loadLoginPage({ returnValue: "reviews.html" });
  await harness.start();
  const username = harness.ids["admin-login-username"];
  const password = harness.ids["admin-login-password"];
  const submit = harness.ids["admin-login-submit"];
  username.value = " operator ";
  password.value = " Exact Password ";
  await username.dispatch("input");
  await password.dispatch("input");
  assert.equal(submit.disabled, false);
  username.value = "x".repeat(65);
  await username.dispatch("input");
  assert.equal(submit.disabled, true);
  username.value = "operator";
  password.value = "😀".repeat(64);
  await password.dispatch("input");
  assert.equal(submit.disabled, false, "64 emoji are 64 code points and exactly 256 UTF-8 bytes");
  password.value = "😀".repeat(65);
  await password.dispatch("input");
  assert.equal(submit.disabled, true, "260 UTF-8 bytes must be rejected");
  password.value = "ก".repeat(86);
  await password.dispatch("input");
  assert.equal(submit.disabled, true, "258 UTF-8 bytes must be rejected");
  password.value = "\uD800";
  await password.dispatch("input");
  assert.equal(submit.disabled, true, "malformed surrogates must be rejected");
});

test("password validation independently enforces 128 code points and every malformed surrogate edge", async () => {
  await assertPasswordBoundaryContract();
});

test("password code-point assertions reject removing the independent 128-point ceiling", async () => {
  const source = mutatedLoginPageSource(
    "if (points > PASSWORD_CODE_POINT_MAX || bytes > PASSWORD_BYTE_MAX) return null;",
    "if (bytes > PASSWORD_BYTE_MAX) return null;"
  );
  await proveContractRejects(() => assertPasswordBoundaryContract(source));
});

test("login submit is single-flight, delegates exact credentials, and always clears password", async () => {
  const gate = deferred();
  const harness = loadLoginPage({ returnValue: "reviews.html", loginImpl: () => gate.promise });
  await harness.start();
  const form = harness.ids["admin-login-form"];
  const username = harness.ids["admin-login-username"];
  const password = harness.ids["admin-login-password"];
  username.value = " operator ";
  password.value = " Password Sentinel ";
  await username.dispatch("input");
  await password.dispatch("input");
  const first = form.dispatch("submit");
  const second = form.dispatch("submit");
  await Promise.resolve();
  assert.equal(harness.calls.logins.length, 1);
  assert.deepEqual(harness.calls.logins[0], [" operator ", " Password Sentinel ", "reviews.html"]);
  assert.equal(form.getAttribute("aria-busy"), "true");
  assert.equal(username.disabled, true);
  assert.equal(password.disabled, true);
  gate.resolve({ status: "error", code: "SERVER_ERROR" });
  await Promise.all([first, second]);
  assert.equal(password.value, "");
  assert.equal(form.getAttribute("aria-busy"), "false");
  assert.equal(username.disabled, false);
  assert.doesNotMatch(harness.ids["admin-login-status"].textContent, /Sentinel/);
});

test("every recoverable login completion restores focus to an enabled credential field", async () => {
  await assertRecoverableFocus();
});

test("recoverable-focus assertions reject omitting post-busy focus restoration", async () => {
  const source = mutatedLoginPageSource("if (focusTarget) focusTarget.focus();", "");
  await proveContractRejects(() => assertRecoverableFocus(source));
});

test("login failures use safe copy, focus unauthorized username, and rate-limit for exactly 60 seconds", async () => {
  for (const code of ["UNAUTHORIZED", "NETWORK_ERROR", "TIMEOUT", "SERVER_ERROR"]) {
    const harness = loadLoginPage({ loginImpl: async () => ({ status: "error", code }) });
    await harness.start();
    harness.ids["admin-login-username"].value = "operator";
    harness.ids["admin-login-password"].value = "SecretValue";
    await harness.ids["admin-login-password"].dispatch("input");
    await harness.ids["admin-login-form"].dispatch("submit");
    assert.equal(harness.ids["admin-login-password"].value, "");
    assert.doesNotMatch(harness.ids["admin-login-status"].textContent, /SecretValue|server-internal/i);
    if (code === "UNAUTHORIZED") {
      assert.equal(harness.ids["admin-login-status"].textContent, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      assert.equal(harness.ids["admin-login-username"].focused, true);
    }
  }
  const rate = loadLoginPage({ loginImpl: async () => ({ status: "error", code: "RATE_LIMITED" }) });
  await rate.start();
  rate.ids["admin-login-username"].value = "operator";
  rate.ids["admin-login-password"].value = "Password";
  await rate.ids["admin-login-password"].dispatch("input");
  await rate.ids["admin-login-form"].dispatch("submit");
  assert.deepEqual(rate.calls.timers, [60000]);
  assert.equal(rate.ids["admin-login-submit"].disabled, true);
  rate.ids["admin-login-password"].value = "NewPassword";
  await rate.ids["admin-login-password"].dispatch("input");
  assert.equal(rate.ids["admin-login-submit"].disabled, true);
  await rate.runTimers();
  assert.equal(rate.ids["admin-login-submit"].disabled, false);
  assert.equal(rate.calls.logins.length, 1);
});

test("password clearing and secret-safe recovery cover every completed outcome", async () => {
  const outcomes = [
    { name: "success", result: { status: "authenticated" } },
    ...["UNAUTHORIZED", "RATE_LIMITED", "NETWORK_ERROR", "TIMEOUT", "HTTP_ERROR", "SERVER_ERROR", "MALFORMED_RESPONSE"].map((code) => ({ name: code, result: { status: "error", code } })),
    { name: "unexpected", error: new Error("internal PasswordSentinel detail") }
  ];
  for (const outcome of outcomes) {
    const harness = loadLoginPage({
      loginImpl: async () => {
        if (outcome.error) throw outcome.error;
        return outcome.result;
      }
    });
    await harness.start();
    harness.ids["admin-login-username"].value = "operator";
    harness.ids["admin-login-password"].value = "PasswordSentinel";
    await harness.ids["admin-login-password"].dispatch("input");
    await harness.ids["admin-login-form"].dispatch("submit");
    assert.equal(harness.ids["admin-login-password"].value, "", `${outcome.name} retained the password`);
    assert.equal(harness.calls.logins.length, 1);
    assert.equal(harness.calls.console.length, 0);
    assert.equal(harness.calls.location.length, 0);
    assert.equal(harness.calls.storage.length, 0);
    assert.doesNotMatch(harness.ids["admin-login-status"].textContent, /PasswordSentinel|internal/i);
  }
  const invalid = loadLoginPage();
  await invalid.start();
  invalid.ids["admin-login-username"].value = "operator";
  invalid.ids["admin-login-password"].value = "\uD800PasswordSentinel";
  await invalid.ids["admin-login-form"].dispatch("submit");
  assert.equal(invalid.ids["admin-login-password"].value, "");
  assert.equal(invalid.calls.logins.length, 0);
  assert.doesNotMatch(invalid.ids["admin-login-status"].textContent, /PasswordSentinel/);
});

test("HTTP and malformed-response clearing assertions reject outcome-specific password retention", async () => {
  for (const code of ["HTTP_ERROR", "MALFORMED_RESPONSE"]) {
    await assertPasswordClearedFor(code);
    const source = mutatedLoginPageSource(
      'enteredPassword = "";\n          password.value = "";',
      `password.value = result && result.code === "${code}" ? enteredPassword : "";\n          enteredPassword = "";`
    );
    await proveContractRejects(() => assertPasswordClearedFor(code, source));
  }
});

test("rate cooldown blocks handler resubmit at 59999 and bounds repeated timers at 60000", async () => {
  await assertCooldownContract();
});

test("rate cooldown assertions reject guard duration retry and overlapping-timer mutations", async () => {
  const mutations = [
    mutatedLoginPageSource(
      "if (loginBusy || startupBusy || cooldownActive || !loginAvailable) return;",
      "if (loginBusy || startupBusy || !loginAvailable) return;"
    ),
    ...[30000, 59000, 61000].map((duration) => mutatedLoginPageSource("var RATE_LIMIT_MS = 60000;", `var RATE_LIMIT_MS = ${duration};`)),
    mutatedLoginPageSource(
      'setStatus("ลองเข้าสู่ระบบได้อีกครั้ง", "ready");\n          updateSubmit();',
      'setStatus("ลองเข้าสู่ระบบได้อีกครั้ง", "ready");\n          updateSubmit();\n          submitLogin({ preventDefault: function () {} });'
    ),
    mutatedLoginPageSource(
      "cooldownTimer = global.setTimeout(function () {",
      "global.setTimeout(function () {}, RATE_LIMIT_MS);\n        cooldownTimer = global.setTimeout(function () {"
    )
  ];
  for (const source of mutations) {
    await proveContractRejects(() => assertCooldownContract(source));
  }
});

test("login startup transient failures require one explicit busy-safe retry", async () => {
  const harness = loadLoginPage({ redirectOutcome: "unconfirmed" });
  await harness.start();
  assert.equal(harness.ids["admin-login-form"].hidden, true);
  assert.equal(harness.ids["admin-login-retry"].hidden, false);
  assert.equal(harness.ids["admin-login-retry"].disabled, false);
  await harness.ids["admin-login-retry"].dispatch("click");
  assert.equal(harness.calls.redirects.length, 2);
});

test("login startup retry permits only one authoritative validation while pending", async () => {
  const harness = loadLoginPage({ redirectOutcome: "unconfirmed" });
  await harness.start();
  const gate = deferred();
  harness.auth.redirectAuthenticatedLogin = async (options) => {
    harness.calls.redirects.push(options.returnPath);
    await gate.promise;
    options.onRetry();
    return { status: "unconfirmed" };
  };
  const first = harness.ids["admin-login-retry"].dispatch("click");
  const second = harness.ids["admin-login-retry"].dispatch("click");
  await Promise.resolve();
  assert.equal(harness.calls.redirects.length, 2, "startup plus exactly one explicit retry expected");
  assert.equal(harness.ids["admin-login-retry"].disabled, true);
  gate.resolve();
  await Promise.all([first, second]);
  assert.equal(harness.ids["admin-login-retry"].disabled, false);
});

test("login page passes only the facade-sanitized return to startup and credential login", async () => {
  for (const candidate of UNSAFE_RETURN_CANDIDATES) {
    const harness = loadLoginPage({ rawReturn: candidate, returnValue: "dashboard.html" });
    await harness.start();
    harness.ids["admin-login-username"].value = "operator";
    harness.ids["admin-login-password"].value = "Password";
    await harness.ids["admin-login-password"].dispatch("input");
    await harness.ids["admin-login-form"].dispatch("submit");
    assert.deepEqual(harness.calls.safe, [candidate]);
    assert.deepEqual(harness.calls.redirects, ["dashboard.html"]);
    assert.equal(harness.calls.logins[0][2], "dashboard.html");
    assert.equal(harness.calls.location.length, 0);
  }
});

test("login secret scans cover every DOM attribute persistence API and location field", async () => {
  await assertPageSecretSinks();
});

test("secret-sink assertions reject password leaks through attributes and location fields", async () => {
  const attributeLeak = mutatedLoginPageSource(
    "var result = await auth.login(enteredUsername, enteredPassword, returnPath);",
    'var result = await auth.login(enteredUsername, enteredPassword, returnPath); form.setAttribute("data-secret", enteredPassword);'
  );
  const locationLeak = mutatedLoginPageSource(
    "var result = await auth.login(enteredUsername, enteredPassword, returnPath);",
    "var result = await auth.login(enteredUsername, enteredPassword, returnPath); global.location.hash = enteredPassword;"
  );
  await proveContractRejects(() => assertPageSecretSinks(attributeLeak));
  await proveContractRejects(() => assertPageSecretSinks(locationLeak));
});

test("login page delegates return sanitization and has no alternate secret or navigation sink", async () => {
  const source = loginPageScript();
  assert.doesNotMatch(source, /sessionStorage|localStorage|document\s*\.\s*cookie|TakhunAdminApi|\bfetch\s*\(|console\s*\.|setInterval|location\s*\.\s*(?:replace|assign)\s*\(|location\s*\.\s*href\s*=/i);
  assert.match(source, /safeReturnPath/);
  assert.match(source, /redirectAuthenticatedLogin/);
  assert.match(source, /(?:TakhunAdminAuth|auth)\.login/);
  assert.match(loginCss, /\.login-form[\s\S]*?gap/i);
  assert.match(loginCss, /\.login-(?:form|card)[\s\S]*?:focus-visible/i);
  assert.match(loginCss, /\.login-(?:submit|retry)[\s\S]*?min-height:\s*(?:44px|2\.75rem)/i);
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
