"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/js/api.js"), "utf8");

function response({ ok = true, status = 200, body }) {
  return { ok, status, async json() { return body; } };
}

function loadApi({ apiUrl = "", fetchImpl, abortController } = {}) {
  const context = {
    APP_CONFIG: Object.freeze({ API_URL: apiUrl, DEFAULT_LANG: "th" }),
    URL,
    AbortController: abortController === undefined ? AbortController : abortController,
    clearTimeout,
    setTimeout,
    fetch: fetchImpl,
    location: { href: "https://example.test/routes.html" },
    window: null
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "api.js" });
  return context.TakhunApi;
}

async function expectReject(promise, code) {
  await assert.rejects(promise, (error) => error && error.code === code && !String(error.message).includes("https://"));
}

async function run() {
  {
    const api = loadApi({ apiUrl: "https://api.example/exec" });
    assert.equal(typeof api.getTripTemplates, "function");
    assert.equal(typeof api.getPlaceDetail, "function");
  }

  {
    let requestedUrl = "";
    const api = loadApi({
      apiUrl: "https://api.example/exec",
      fetchImpl: async (url) => {
        requestedUrl = url;
        return response({ body: { ok: true, data: { items: [], total: 0 } } });
      }
    });
    await api.getTripTemplates({ duration_type: "one_day", style: "food/cafe", lang: "en" });
    const url = new URL(requestedUrl);
    assert.equal(url.searchParams.get("action"), "getTripTemplates");
    assert.equal(url.searchParams.get("duration_type"), "one_day");
    assert.equal(url.searchParams.get("style"), "food/cafe");
    assert.equal(url.searchParams.get("lang"), "en");
  }

  {
    const api = loadApi({ apiUrl: "https://api.example/exec?token=kept" });
    const url = api.buildUrl("get Routes/A", { lang: "th", style: "nature & lake", unsafe: "A/B?C" });
    assert.equal(url.searchParams.get("token"), "kept");
    assert.equal(url.searchParams.get("action"), "get Routes/A");
    assert.equal(url.searchParams.get("style"), "nature & lake");
    assert.equal(url.searchParams.get("unsafe"), "A/B?C");
    assert.match(url.toString(), /style=nature(?:\+|%20)%26(?:\+|%20)lake/);
    assert.match(url.toString(), /unsafe=A%2FB%3FC/);
    assert.match(url.toString(), /action=get(?:\+|%20)Routes%2FA/);
  }

  {
    const calls = [];
    const api = loadApi({
      apiUrl: "https://api.example/exec?existing=1",
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return response({ body: { ok: true, data: { items: [{ route_id: "ROUTE-001" }], total: 1 }, message: "success" } });
      }
    });
    const data = await api.getRoutes({ lang: "en", style: "photo" }, { mock: () => assert.fail("must not use mock") });
    assert.equal(data.total, 1);
    assert.equal(new URL(calls[0].url).searchParams.get("action"), "getRoutes");
    assert.equal(new URL(calls[0].url).searchParams.get("existing"), "1");
    assert.ok(calls[0].options.signal);
  }

  {
    let requestedUrl = "";
    const api = loadApi({
      apiUrl: "https://api.example/exec",
      fetchImpl: async (url) => {
        requestedUrl = url;
        return response({ body: { ok: true, data: { route_id: "ROUTE A/B", places: [] } } });
      }
    });
    const data = await api.getRouteDetail("ROUTE A/B", { lang: "th" });
    assert.equal(data.route_id, "ROUTE A/B");
    assert.equal(new URL(requestedUrl).searchParams.get("action"), "getRouteDetail");
    assert.equal(new URL(requestedUrl).searchParams.get("route_id"), "ROUTE A/B");
    assert.match(requestedUrl, /route_id=ROUTE(?:\+|%20)A%2FB/);
  }

  {
    const api = loadApi({ apiUrl: "" });
    const data = await api.getRoutes({}, { mock: () => ({ items: [{ route_id: "MOCK-ROUTE-001" }], total: 1 }) });
    assert.equal(data.items[0].route_id, "MOCK-ROUTE-001");
  }

  {
    const api = loadApi({
      apiUrl: "https://api.example/exec",
      abortController: null,
      fetchImpl: async (_url, options) => {
        assert.equal(options.signal, undefined);
        return response({ body: { ok: true, data: { items: [], total: 0 } } });
      }
    });
    assert.equal((await api.getRoutes()).total, 0);
  }

  {
    let mockCalls = 0;
    const api = loadApi({
      apiUrl: "https://api.example/exec",
      fetchImpl: async () => { throw new Error("network contains https://internal.example/secret"); }
    });
    await expectReject(api.getRoutes({}, { mock: () => { mockCalls += 1; return {}; } }), "NETWORK_ERROR");
    assert.equal(mockCalls, 0);
  }

  {
    let mockCalls = 0;
    const api = loadApi({ apiUrl: "https://api.example/exec", fetchImpl: async () => response({ ok: false, status: 503, body: {} }) });
    await expectReject(api.getRoutes({}, { mock: () => { mockCalls += 1; return {}; } }), "HTTP_ERROR");
    assert.equal(mockCalls, 0);
  }

  {
    const malformed = [null, [], {}, { ok: true }, { ok: "yes", data: {} }];
    for (const body of malformed) {
      const api = loadApi({ apiUrl: "https://api.example/exec", fetchImpl: async () => response({ body }) });
      let mockCalls = 0;
      await expectReject(api.getRoutes({}, { mock: () => { mockCalls += 1; return {}; } }), "MALFORMED_RESPONSE");
      assert.equal(mockCalls, 0);
    }
  }

  {
    const api = loadApi({ apiUrl: "https://api.example/exec", fetchImpl: async () => ({ ok: true, async json() { throw new SyntaxError("bad json"); } }) });
    await expectReject(api.getRoutes(), "MALFORMED_RESPONSE");
  }

  {
    const api = loadApi({
      apiUrl: "https://api.example/exec",
      fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => { const error = new Error("aborted"); error.name = "AbortError"; reject(error); }, { once: true });
      })
    });
    await expectReject(api.getRoutes({}, { timeoutMs: 5 }), "TIMEOUT");
  }

  process.stdout.write("Public API client behavior verification passed.\n");
}

run().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
