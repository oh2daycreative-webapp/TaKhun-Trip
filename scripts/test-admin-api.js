"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const modulePath = path.join(__dirname, "../public/admin/js/admin-api.js");
assert.ok(fs.existsSync(modulePath), "public/admin/js/admin-api.js must exist before Admin transport contracts can run");
const productionSource = fs.readFileSync(modulePath, "utf8").replace(/\r\n/g, "\n");

const ENDPOINT = "https://api.example/exec?deployment=approved";
const TOKEN = "-".padEnd(43, "A");
const SECOND_TOKEN = "_".padEnd(43, "A");
const EXPIRES_AT = "2026-08-08T12:30:00.000Z";
const ADMIN = Object.freeze({
  admin_id: "ADM-123e4567-e89b-12d3-a456-426614174000",
  username: "operator",
  display_name: "ผู้ดูแลระบบ",
  role: "super_admin"
});

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function success(data) {
  return { ok: true, data, message: "success" };
}

function textResponse(body, { ok = true, status = 200, textError } = {}) {
  return {
    ok,
    status,
    async text() {
      if (textError) throw textError;
      return typeof body === "string" ? body : JSON.stringify(body);
    }
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function loadAdminApi({
  source = productionSource,
  apiUrl = ENDPOINT,
  fetchImpl = async () => textResponse(success({})),
  abortController = "fake",
  lexicalConfig = false
} = {}) {
  const calls = [];
  const timers = [];
  const clearedTimerIds = [];
  const controllers = [];
  const logs = [];
  let nextTimerId = 1;

  class FakeAbortController {
    constructor() {
      const listeners = [];
      this.abortCount = 0;
      this.signal = {
        aborted: false,
        addEventListener(type, listener) {
          if (type === "abort") listeners.push(listener);
        }
      };
      this.abort = () => {
        this.abortCount += 1;
        if (this.signal.aborted) return;
        this.signal.aborted = true;
        for (const listener of listeners.slice()) listener({ type: "abort" });
      };
      controllers.push(this);
    }
  }

  const context = {
    URL,
    AbortController: abortController === "fake" ? FakeAbortController : abortController,
    location: { href: "https://site.example/admin/login.html" },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return fetchImpl(url, options, calls.length - 1);
    },
    setTimeout(callback, delay) {
      const timer = { id: nextTimerId++, callback, delay, cleared: false };
      timers.push(timer);
      return timer.id;
    },
    clearTimeout(id) {
      const timer = timers.find((candidate) => candidate.id === id);
      assert.ok(timer, `clearTimeout received unknown timer ${id}`);
      timer.cleared = true;
      clearedTimerIds.push(id);
    },
    console: {
      log: (...args) => logs.push(["log", ...args]),
      info: (...args) => logs.push(["info", ...args]),
      warn: (...args) => logs.push(["warn", ...args]),
      error: (...args) => logs.push(["error", ...args])
    },
    window: null
  };
  if (!lexicalConfig) context.APP_CONFIG = Object.freeze({ API_URL: apiUrl, DEFAULT_LANG: "th" });
  context.window = context;
  vm.createContext(context);
  if (lexicalConfig) {
    vm.runInContext(`const APP_CONFIG = Object.freeze({ API_URL: ${JSON.stringify(apiUrl)}, DEFAULT_LANG: "th" });`, context);
  }
  vm.runInContext(source, context, { filename: "admin-api.js" });
  return { api: context.TakhunAdminApi, calls, timers, clearedTimerIds, controllers, logs, context };
}

async function captureError(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("Expected Admin API request to reject");
}

function assertSafeError(error, expectedCode, secrets = []) {
  assert.ok(error && typeof error === "object");
  assert.equal(error.name, "AdminApiError");
  assert.equal(error.code, expectedCode);
  assert.equal(error.message, "Admin API request failed.");
  assert.equal(error.stack, undefined);
  const exposed = `${String(error)} ${JSON.stringify(error)}`;
  for (const secret of secrets.filter(Boolean)) assert.equal(exposed.includes(secret), false, `error exposed secret ${secret}`);
}

function assertNoSecretTransport(harness, secrets) {
  const serialized = JSON.stringify({
    urls: harness.calls.map((call) => call.url),
    headers: harness.calls.map((call) => call.options && call.options.headers),
    logs: harness.logs
  });
  for (const secret of secrets) assert.equal(serialized.includes(secret), false, `transport exposed secret ${secret}`);
  for (const call of harness.calls) {
    assert.equal(Object.keys(call.options.headers).some((name) => name.toLowerCase() === "authorization"), false);
  }
  assert.deepEqual(harness.logs, []);
}

function mutatedSource(find, replacement) {
  const mutated = productionSource.replace(find, replacement);
  assert.notEqual(mutated, productionSource, `mutation target must exist: ${find}`);
  return mutated;
}

async function proveContractRejects(check) {
  await assert.rejects(check, (error) => error instanceof assert.AssertionError);
}

function assertSingleRequestCleanup(harness) {
  assert.equal(harness.controllers.length, 1);
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.timers.length, 1);
  assert.equal(harness.timers[0].delay, 12000);
  assert.deepEqual(harness.clearedTimerIds, [harness.timers[0].id]);
  assert.equal(harness.timers[0].cleared, true);
  assert.equal(harness.timers.filter((timer) => !timer.cleared).length, 0);
  assert.equal(harness.controllers[0].signal.aborted, false);
}

async function assertBackendErrorCleanup(code, source = productionSource) {
  const harness = loadAdminApi({
    source,
    fetchImpl: async () => textResponse({ ok: false, error: { code, message: `untrusted ${TOKEN}` } })
  });
  const expectedCode = code === "INTERNAL_DATABASE_DETAIL" ? "SERVER_ERROR" : code;
  assertSafeError(await captureError(harness.api.validateSession(TOKEN)), expectedCode, [TOKEN, "untrusted"]);
  assertSingleRequestCleanup(harness);
}

async function assertTypeErrorSingleFetch(source = productionSource) {
  let fetchCount = 0;
  const harness = loadAdminApi({
    source,
    fetchImpl: async () => {
      fetchCount += 1;
      throw new TypeError(`network ${TOKEN}`);
    }
  });
  assertSafeError(await captureError(harness.api.login("operator", "TypeErrorPassword")), "NETWORK_ERROR", [TOKEN, "TypeErrorPassword"]);
  assert.equal(fetchCount, 1);
  assertSingleRequestCleanup(harness);
  assert.deepEqual(JSON.parse(harness.calls[0].options.body), {
    action: "adminLogin",
    payload: { username: "operator", password: "TypeErrorPassword" }
  });
}

async function assertAbortErrorSingleFetch(source = productionSource, observation = {}) {
  let fetchCount = 0;
  const harness = loadAdminApi({
    source,
    fetchImpl: async (_url, options) => {
      fetchCount += 1;
      return new Promise((_resolve, reject) => {
        const rejectAbort = () => {
          const error = new Error(`aborted ${TOKEN}`);
          error.name = "AbortError";
          reject(error);
        };
        if (options.signal.aborted) {
          rejectAbort();
          return;
        }
        options.signal.addEventListener("abort", rejectAbort);
      });
    }
  });
  const pending = harness.api.validateSession(TOKEN);
  assert.equal(harness.controllers.length, 1);
  assert.equal(harness.timers.length, 1);
  assert.equal(harness.timers[0].delay, 12000);
  harness.timers[0].callback();
  assertSafeError(await captureError(pending), "TIMEOUT", [TOKEN]);
  assert.equal(harness.controllers[0].signal.aborted, true);
  assert.equal(harness.controllers[0].abortCount, 1);
  assert.deepEqual(harness.clearedTimerIds, [harness.timers[0].id]);
  assert.equal(harness.timers[0].cleared, true);
  assert.equal(harness.timers.filter((timer) => !timer.cleared).length, 0);
  observation.fetchCount = fetchCount;
  observation.abortCount = harness.controllers[0].abortCount;
  observation.finalAssertionReached = true;
  assert.equal(fetchCount, 1);
}

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

test("exports exactly the frozen login validateSession and logout surface", async () => {
  const { api } = loadAdminApi();
  assert.deepEqual(Object.keys(api).sort(), ["login", "logout", "validateSession"]);
  assert.equal(Object.isFrozen(api), true);
  for (const name of Object.keys(api)) assert.equal(typeof api[name], "function");
});

test("login preserves credential strings and uses exact POST transport", async () => {
  const username = "  MiXeD.User  ";
  const password = "  =รหัส😀e\u0301  ";
  const harness = loadAdminApi({
    lexicalConfig: true,
    fetchImpl: async () => textResponse(success({ admin: ADMIN, token: TOKEN, expires_at: EXPIRES_AT }))
  });
  const data = await harness.api.login(username, password);
  assert.deepEqual(plain(data), { admin: ADMIN, token: TOKEN, expires_at: EXPIRES_AT });
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].url, ENDPOINT);
  assert.equal(harness.calls[0].options.method, "POST");
  assert.deepEqual(plain(harness.calls[0].options.headers), { "Content-Type": "text/plain;charset=utf-8" });
  assert.equal("credentials" in harness.calls[0].options, false);
  assert.deepEqual(JSON.parse(harness.calls[0].options.body), {
    action: "adminLogin",
    payload: { username, password }
  });
  assert.equal(harness.calls[0].options.signal, harness.controllers[0].signal);
  assert.deepEqual(harness.timers.map(({ delay, cleared }) => ({ delay, cleared })), [{ delay: 12000, cleared: true }]);
  assertNoSecretTransport(harness, [username, password]);
});

test("validateSession and logout preserve a dash-prefixed token in body only", async () => {
  const responses = [
    success({ admin: ADMIN, expires_at: EXPIRES_AT }),
    success({})
  ];
  const harness = loadAdminApi({ fetchImpl: async () => textResponse(responses.shift()) });
  assert.deepEqual(plain(await harness.api.validateSession(TOKEN)), { admin: ADMIN, expires_at: EXPIRES_AT });
  assert.deepEqual(plain(await harness.api.logout(TOKEN)), {});
  assert.deepEqual(harness.calls.map((call) => JSON.parse(call.options.body)), [
    { action: "adminValidateSession", token: TOKEN },
    { action: "adminLogout", token: TOKEN }
  ]);
  for (const call of harness.calls) {
    assert.equal(call.url, ENDPOINT);
    assert.equal(call.options.method, "POST");
    assert.equal(call.options.headers["Content-Type"], "text/plain;charset=utf-8");
  }
  assertNoSecretTransport(harness, [TOKEN]);
});

test("clears the exact timeout after HTTP JSON text and network failures", async () => {
  const cases = [
    { response: textResponse("server-secret", { ok: false, status: 503 }), code: "HTTP_ERROR" },
    { response: textResponse("not-json"), code: "MALFORMED_RESPONSE" },
    { response: textResponse("", { textError: new Error(`read failed ${TOKEN}`) }), code: "MALFORMED_RESPONSE" }
  ];
  for (const fixture of cases) {
    const harness = loadAdminApi({ fetchImpl: async () => fixture.response });
    const error = await captureError(harness.api.validateSession(TOKEN));
    assertSafeError(error, fixture.code, [TOKEN, "server-secret"]);
    assert.deepEqual(harness.timers.map(({ delay, cleared }) => ({ delay, cleared })), [{ delay: 12000, cleared: true }]);
  }
  const harness = loadAdminApi({ fetchImpl: async () => { throw new Error(`network ${TOKEN}`); } });
  assertSafeError(await captureError(harness.api.logout(TOKEN)), "NETWORK_ERROR", [TOKEN]);
  assert.equal(harness.timers[0].cleared, true);
});

test("aborts at 12000 ms maps AbortError safely and never retries", async () => {
  const observation = {};
  await assertAbortErrorSingleFetch(productionSource, observation);
  assert.equal(observation.fetchCount, 1);
  assert.equal(observation.abortCount, 1);
  assert.equal(observation.finalAssertionReached, true);
});

test("AbortError single-fetch assertions reject an executable second-POST mutation", async () => {
  const source = mutatedSource(
    '        if (error && error.name === "AbortError") throw safeError("TIMEOUT");',
    '        if (error && error.name === "AbortError") {\n          try { response = await global.fetch(endpoint, options); } catch (_secondError) { /* keep the first safe category */ }\n          throw safeError("TIMEOUT");\n        }'
  );
  const observation = {};
  await proveContractRejects(() => assertAbortErrorSingleFetch(source, observation));
  assert.equal(observation.fetchCount, 2);
  assert.equal(observation.abortCount, 1);
  assert.equal(observation.finalAssertionReached, true);
});

test("works without AbortController without inventing a retry or timer", async () => {
  const harness = loadAdminApi({
    abortController: null,
    fetchImpl: async (_url, options) => {
      assert.equal("signal" in options, false);
      return textResponse(success({}));
    }
  });
  await harness.api.logout(TOKEN);
  assert.equal(harness.timers.length, 0);
  assert.equal(harness.calls.length, 1);
});

test("rejects malformed top-level and backend error envelopes safely", async () => {
  const malformed = [
    "", "not-json", "null", "[]", "true", "1", '"text"',
    JSON.stringify({}),
    JSON.stringify({ ok: "true", data: {} }),
    JSON.stringify({ ok: true }),
    JSON.stringify({ ok: false }),
    JSON.stringify({ ok: false, error: null }),
    JSON.stringify({ ok: false, error: { code: "UNAUTHORIZED" } }),
    JSON.stringify({ ok: false, error: { code: "UNAUTHORIZED", message: "safe", internal: "secret" } }),
    JSON.stringify({ ok: false, error: { code: 1, message: "safe" } })
  ];
  for (const body of malformed) {
    const harness = loadAdminApi({ fetchImpl: async () => textResponse(body) });
    assertSafeError(await captureError(harness.api.logout(TOKEN)), "MALFORMED_RESPONSE", [TOKEN, body]);
  }
});

test("normalizes every documented backend code and clears its exact timer", async () => {
  for (const code of ["VALIDATION_ERROR", "UNAUTHORIZED", "RATE_LIMITED", "SERVER_ERROR", "FORBIDDEN"]) {
    await assertBackendErrorCleanup(code);
  }
  await assertBackendErrorCleanup("INTERNAL_DATABASE_DETAIL");
});

test("backend-error cleanup assertions reject a timer-leak mutation", async () => {
  const source = mutatedSource(
    '      return parseEnvelope(body.action, rawText);\n    } finally {\n      if (timer !== null) global.clearTimeout(timer);\n    }',
    '      try {\n        const parsed = parseEnvelope(body.action, rawText);\n        if (timer !== null) global.clearTimeout(timer);\n        return parsed;\n      } catch (error) {\n        if (!BACKEND_ERROR_CODES.includes(error.code) && timer !== null) global.clearTimeout(timer);\n        throw error;\n      }\n    } finally {\n      /* test-only mutation omits the authoritative cleanup */\n    }'
  );
  await proveContractRejects(() => assertBackendErrorCleanup("UNAUTHORIZED", source));
});

test("TypeError network failure sends exactly one authentication POST", async () => {
  await assertTypeErrorSingleFetch();
});

test("TypeError single-fetch assertions reject an executable second-POST mutation", async () => {
  const source = mutatedSource(
    '      } catch (error) {\n        if (error && error.name === "AbortError") throw safeError("TIMEOUT");\n        throw safeError("NETWORK_ERROR");\n      }',
    '      } catch (error) {\n        if (error && error.name === "TypeError") {\n          try { response = await global.fetch(endpoint, options); } catch (_secondError) { /* keep the first safe category */ }\n        }\n        if (error && error.name === "AbortError") throw safeError("TIMEOUT");\n        throw safeError("NETWORK_ERROR");\n      }'
  );
  await proveContractRejects(() => assertTypeErrorSingleFetch(source));
});

test("strictly validates login success and rejects security-bearing projections", async () => {
  const invalidData = [
    null,
    [],
    {},
    { admin: ADMIN, token: TOKEN },
    { admin: ADMIN, token: "short", expires_at: EXPIRES_AT },
    { admin: ADMIN, token: TOKEN.slice(0, -1) + "B", expires_at: EXPIRES_AT },
    { admin: ADMIN, token: TOKEN, expires_at: "2026-08-08T12:30:00Z" },
    { admin: ADMIN, token: TOKEN, expires_at: EXPIRES_AT, token_hash: TOKEN },
    { admin: { ...ADMIN, password_hash: TOKEN }, token: TOKEN, expires_at: EXPIRES_AT },
    { admin: { ...ADMIN, role: "owner" }, token: TOKEN, expires_at: EXPIRES_AT },
    { admin: { ...ADMIN, admin_id: "ADM-not-a-uuid" }, token: TOKEN, expires_at: EXPIRES_AT },
    { admin: { ...ADMIN, username: "Uppercase Operator" }, token: TOKEN, expires_at: EXPIRES_AT },
    { admin: { ...ADMIN, display_name: "😀".repeat(101) }, token: TOKEN, expires_at: EXPIRES_AT },
    { admin: { ...ADMIN, display_name: "\uD800" }, token: TOKEN, expires_at: EXPIRES_AT },
    { admin: { admin_id: ADMIN.admin_id, username: ADMIN.username, display_name: ADMIN.display_name }, token: TOKEN, expires_at: EXPIRES_AT }
  ];
  for (const data of invalidData) {
    const harness = loadAdminApi({ fetchImpl: async () => textResponse(success(data)) });
    assertSafeError(await captureError(harness.api.login("operator", "password")), "MALFORMED_RESPONSE", ["password", TOKEN]);
  }
});

test("strictly validates session and logout success without token or audit metadata", async () => {
  const invalidSessionData = [
    {},
    { admin: ADMIN },
    { admin: ADMIN, expires_at: EXPIRES_AT, token: TOKEN },
    { admin: { ...ADMIN, password_salt: "A".repeat(22) }, expires_at: EXPIRES_AT },
    { admin: ADMIN, expires_at: "invalid" }
  ];
  for (const data of invalidSessionData) {
    const harness = loadAdminApi({ fetchImpl: async () => textResponse(success(data)) });
    assertSafeError(await captureError(harness.api.validateSession(TOKEN)), "MALFORMED_RESPONSE", [TOKEN]);
  }
  for (const data of [null, [], { revoked: true }, { token_hash: TOKEN }]) {
    const harness = loadAdminApi({ fetchImpl: async () => textResponse(success(data)) });
    assertSafeError(await captureError(harness.api.logout(TOKEN)), "MALFORMED_RESPONSE", [TOKEN]);
  }
});

test("configuration failures are safe and perform no fetch", async () => {
  for (const apiUrl of ["", "not a url"]) {
    const harness = loadAdminApi({ apiUrl, fetchImpl: async () => assert.fail("fetch must not run") });
    assertSafeError(await captureError(harness.api.logout(TOKEN)), "CONFIG_ERROR", [TOKEN, apiUrl]);
    assert.equal(harness.calls.length, 0);
    assert.equal(harness.timers.length, 0);
  }
});

test("simultaneous requests isolate controllers timers bodies and failures", async () => {
  const pending = [createDeferred(), createDeferred()];
  const harness = loadAdminApi({ fetchImpl: async (_url, _options, index) => pending[index].promise });
  const first = harness.api.validateSession(TOKEN);
  const second = harness.api.login("SecondUser", "SecondPassword😀");
  assert.equal(harness.controllers.length, 2);
  assert.notEqual(harness.controllers[0], harness.controllers[1]);
  assert.notEqual(harness.controllers[0].signal, harness.controllers[1].signal);
  assert.deepEqual(harness.timers.map((timer) => timer.delay), [12000, 12000]);
  pending[0].reject(new Error(`first failed ${TOKEN}`));
  assertSafeError(await captureError(first), "NETWORK_ERROR", [TOKEN]);
  assert.equal(harness.calls.length, 2);
  assert.deepEqual(harness.timers.map((timer) => timer.cleared), [true, false]);
  pending[1].resolve(textResponse(success({ admin: ADMIN, token: SECOND_TOKEN, expires_at: EXPIRES_AT })));
  assert.deepEqual(plain(await second), { admin: ADMIN, token: SECOND_TOKEN, expires_at: EXPIRES_AT });
  assert.deepEqual(harness.timers.map((timer) => timer.cleared), [true, true]);
  assert.deepEqual(harness.calls.map((call) => JSON.parse(call.options.body)), [
    { action: "adminValidateSession", token: TOKEN },
    { action: "adminLogin", payload: { username: "SecondUser", password: "SecondPassword😀" } }
  ]);
});

test("source excludes storage UI redirects retries GET and secret logging", async () => {
  assert.doesNotMatch(productionSource, /sessionStorage|localStorage|indexedDB|document\s*\.|location\s*=|console\s*\.|\bLogger\b|\bretr(?:y|ies|ied)\b|method\s*:\s*["']GET["']/i);
  assert.doesNotMatch(productionSource, /Authorization/i);
});

test("secret-leak mutation A appending password to URL is rejected", async () => {
  const source = mutatedSource(
    "const endpoint = apiEndpoint();",
    'const endpoint = apiEndpoint() + "&password=" + encodeURIComponent(body.payload.password);'
  );
  const harness = loadAdminApi({ source, fetchImpl: async () => textResponse(success({ admin: ADMIN, token: TOKEN, expires_at: EXPIRES_AT })) });
  await proveContractRejects(async () => {
    await harness.api.login("operator", "PasswordMutationA");
    assertNoSecretTransport(harness, ["PasswordMutationA"]);
  });
});

test("secret-leak mutation B appending token to URL is rejected", async () => {
  const source = mutatedSource(
    "const endpoint = apiEndpoint();",
    'const endpoint = apiEndpoint() + "&token=" + encodeURIComponent(body.token);'
  );
  const harness = loadAdminApi({ source, fetchImpl: async () => textResponse(success({ admin: ADMIN, expires_at: EXPIRES_AT })) });
  await proveContractRejects(async () => {
    await harness.api.validateSession(TOKEN);
    assertNoSecretTransport(harness, [TOKEN]);
  });
});

test("secret-leak mutation C Authorization header is rejected", async () => {
  const source = mutatedSource(
    'headers: { "Content-Type": CONTENT_TYPE },',
    'headers: { "Content-Type": CONTENT_TYPE, "Authorization": "Bearer " + body.token },'
  );
  const harness = loadAdminApi({ source, fetchImpl: async () => textResponse(success({})) });
  await proveContractRejects(async () => {
    await harness.api.logout(TOKEN);
    assertNoSecretTransport(harness, [TOKEN]);
  });
});

test("secret-leak mutation D throwing the token is rejected", async () => {
  const source = mutatedSource(
    'throw safeError("NETWORK_ERROR");',
    'throw new Error("request failed for " + body.token);'
  );
  const harness = loadAdminApi({ source, fetchImpl: async () => { throw new Error("offline"); } });
  await proveContractRejects(async () => {
    assertSafeError(await captureError(harness.api.validateSession(TOKEN)), "NETWORK_ERROR", [TOKEN]);
  });
});

test("secret-leak mutation E logging the request body is rejected", async () => {
  const source = mutatedSource(
    "const endpoint = apiEndpoint();",
    "const endpoint = apiEndpoint();\n    global.console.log(JSON.stringify(body));"
  );
  const harness = loadAdminApi({ source, fetchImpl: async () => textResponse(success({})) });
  await proveContractRejects(async () => {
    await harness.api.logout(TOKEN);
    assertNoSecretTransport(harness, [TOKEN]);
  });
});

test("secret-leak mutation F including raw response text in an error is rejected", async () => {
  const source = mutatedSource(
    'catch (_parseError) {\n      throw safeError("MALFORMED_RESPONSE");\n    }',
    'catch (_parseError) {\n      throw new Error("invalid response: " + rawText);\n    }'
  );
  const rawSecret = `malformed-response-${TOKEN}`;
  const harness = loadAdminApi({ source, fetchImpl: async () => textResponse(rawSecret) });
  await proveContractRejects(async () => {
    assertSafeError(await captureError(harness.api.logout(TOKEN)), "MALFORMED_RESPONSE", [TOKEN, rawSecret]);
  });
});

(async () => {
  for (const { name, run } of tests) {
    await run();
    process.stdout.write(`PASS ${name}\n`);
  }
  process.stdout.write(`Admin API transport verification passed: ${tests.length} tests.\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
