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

function loadApiWithLexicalConfig({ apiUrl, fetchImpl }) {
  const context = vm.createContext({
    URL, AbortController, clearTimeout, setTimeout, fetch: fetchImpl,
    location: { href: "https://example.test/about.html" }, window: null
  });
  context.window = context;
  vm.runInContext(`const APP_CONFIG = Object.freeze({ API_URL: ${JSON.stringify(apiUrl)}, DEFAULT_LANG: "th" });`, context);
  vm.runInContext(source, context, { filename: "api.js" });
  return context.TakhunApi;
}

async function expectReject(promise, code) {
  await assert.rejects(promise, (error) => error && error.code === code && !String(error.message).includes("https://"));
}

async function run() {
  {
    let requestedUrl = "";
    const api = loadApiWithLexicalConfig({
      apiUrl: "https://api.example/exec?source=classic-script",
      fetchImpl: async (url) => {
        requestedUrl = url;
        return response({ body: { ok: true, data: { site_name: "Configured" } } });
      }
    });
    const data = await api.getSettings();
    assert.equal(data.site_name, "Configured");
    assert.equal(new URL(requestedUrl).searchParams.get("source"), "classic-script");
  }

  {
    const calls = [];
    const api = loadApi({
      apiUrl: "https://api.example/exec?token=kept",
      fetchImpl: async (url) => {
        calls.push(url);
        return response({ body: { ok: true, data: { site_name: "Takhun Trip" } } });
      }
    });
    assert.equal(typeof api.getSettings, "function");
    const options = { timeoutMs: 5000 };
    const snapshot = JSON.stringify(options);
    const data = await api.getSettings(options);
    const url = new URL(calls[0]);
    assert.equal(data.site_name, "Takhun Trip");
    assert.equal(url.searchParams.get("token"), "kept");
    assert.equal(url.searchParams.get("action"), "getSettings");
    assert.deepEqual([...url.searchParams.keys()].sort(), ["action", "token"]);
    assert.match(calls[0], /action=getSettings/);
    assert.equal(JSON.stringify(options), snapshot);
  }

  {
    const api = loadApi({ apiUrl: "" });
    const data = await api.getSettings({ mock: () => ({ site_name: "Mock Takhun Trip" }) });
    assert.equal(data.site_name, "Mock Takhun Trip");
  }

  {
    const calls = [];
    const api = loadApi({
      apiUrl: "https://api.example/exec?token=kept",
      fetchImpl: async (url) => {
        calls.push(url);
        return response({ body: { ok: true, data: { featured_routes: [], featured_places: [], featured_products: [], upcoming_events: [], gallery_preview: [] } } });
      }
    });
    assert.equal(typeof api.getHomeData, "function");
    const params = { lang: "en", ignored: "no" };
    const snapshot = JSON.stringify(params);
    const home = await api.getHomeData();
    await api.getHomeData(params);
    await api.getHomeData({ lang: "fr", extra: "ignored" });
    assert.equal(home.ok, true);
    assert.deepEqual(Object.keys(home.data).sort(), ["featured_places", "featured_products", "featured_routes", "gallery_preview", "upcoming_events"]);
    assert.equal(JSON.stringify(params), snapshot);
    assert.equal(new URL(calls[0]).searchParams.get("lang"), "th");
    assert.deepEqual([...new URL(calls[0]).searchParams.keys()].sort(), ["action", "lang", "token"]);
    assert.equal(new URL(calls[1]).searchParams.get("lang"), "en");
    assert.equal(new URL(calls[1]).searchParams.has("ignored"), false);
    assert.equal(new URL(calls[2]).searchParams.get("lang"), "th");
  }

  {
    const api = loadApi({ apiUrl: "" });
    const params = { lang: "en", ignored: "no" };
    const snapshot = JSON.stringify(params);
    const data = await api.getHomeData(params, { mock: (allowed) => ({ ok: true, data: { allowed }, message: "success" }) });
    assert.deepEqual(JSON.parse(JSON.stringify(data)), { ok: true, data: { allowed: { lang: "en" } }, message: "success" });
    assert.equal(JSON.stringify(params), snapshot);
  }

  {
    let mockCalls = 0;
    const api = loadApi({ apiUrl: "https://api.example/exec", fetchImpl: async () => { throw new Error("home network failure"); } });
    await expectReject(api.getHomeData({ lang: "th" }, { mock: () => { mockCalls += 1; return {}; } }), "NETWORK_ERROR");
    assert.equal(mockCalls, 0);
  }

  {
    const calls = [];
    const api = loadApi({
      apiUrl: "https://api.example/exec?token=kept",
      fetchImpl: async (url) => {
        calls.push(url);
        return response({ body: { ok: true, data: { items: [] } } });
      }
    });
    assert.equal(typeof api.getCategories, "function");
    await api.getCategories();
    await api.getCategories({ type: "route style & nature", lang: "en", status: "published", unknown: "ignored" });
    const first = new URL(calls[0]);
    const second = new URL(calls[1]);
    assert.equal(first.searchParams.get("action"), "getCategories");
    assert.deepEqual([...first.searchParams.keys()].sort(), ["action", "token"]);
    assert.equal(second.searchParams.get("action"), "getCategories");
    assert.equal(second.searchParams.get("type"), "route style & nature");
    assert.equal(second.searchParams.get("lang"), "en");
    assert.equal(second.searchParams.has("status"), false);
    assert.equal(second.searchParams.has("unknown"), false);
    assert.match(calls[1], /type=route(?:\+|%20)style(?:\+|%20)%26(?:\+|%20)nature/);
  }

  {
    const api = loadApi({ apiUrl: "" });
    const params = { type: "place", lang: "th", ignored: "x" };
    const snapshot = JSON.stringify(params);
    const result = await api.getCategories(params, { mock: (allowed) => ({ items: [allowed] }) });
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { items: [{ type: "place", lang: "th" }] });
    assert.equal(JSON.stringify(params), snapshot);
  }

  {
    let mockCalls = 0;
    const api = loadApi({
      apiUrl: "https://api.example/exec",
      fetchImpl: async () => { throw new Error("category network failure"); }
    });
    await expectReject(api.getCategories({ type: "place" }, { mock: () => { mockCalls += 1; return {}; } }), "NETWORK_ERROR");
    assert.equal(mockCalls, 0);
  }

  {
    let mockCalls = 0;
    const api = loadApi({
      apiUrl: "https://api.example/exec",
      fetchImpl: async () => { throw new Error("network contains https://internal.example/secret"); }
    });
    await expectReject(api.getSettings({ mock: () => { mockCalls += 1; return {}; } }), "NETWORK_ERROR");
    assert.equal(mockCalls, 0);
  }

  {
    const api = loadApi({ apiUrl: "https://api.example/exec", fetchImpl: async () => response({ ok: false, status: 500, body: {} }) });
    await expectReject(api.getSettings(), "HTTP_ERROR");
  }

  {
    const api = loadApi({ apiUrl: "https://api.example/exec", fetchImpl: async () => ({ ok: true, async json() { throw new SyntaxError("bad json"); } }) });
    await expectReject(api.getSettings(), "MALFORMED_RESPONSE");
  }

  {
    const api = loadApi({ apiUrl: "https://api.example/exec", fetchImpl: async () => response({ body: { ok: true } }) });
    await expectReject(api.getSettings(), "MALFORMED_RESPONSE");
  }

  {
    const api = loadApi({
      apiUrl: "https://api.example/exec",
      fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => { const error = new Error("aborted"); error.name = "AbortError"; reject(error); }, { once: true });
      })
    });
    await expectReject(api.getSettings({ timeoutMs: 5 }), "TIMEOUT");
  }

  {
    const api = loadApi({ apiUrl: "https://api.example/exec" });
    assert.equal(typeof api.getTripTemplates, "function");
    assert.equal(typeof api.getPlaceDetail, "function");
    assert.equal(typeof api.getProducts, "function");
    assert.equal(typeof api.getProductDetail, "function");
    assert.equal(typeof api.getEvents, "function");
    assert.equal(typeof api.getEventDetail, "function");
  }

  {
    const calls = [];
    const api = loadApi({
      apiUrl: "https://api.example/exec?token=kept",
      fetchImpl: async (url) => {
        calls.push(url);
        return response({ body: { ok: true, data: { items: [], total: 0 } } });
      }
    });
    const filters = { status: "all", type: "community market", month: "2026-08", lang: "en" };
    const snapshot = JSON.stringify(filters);
    await api.getEvents(filters);
    const url = new URL(calls[0]);
    assert.equal(url.searchParams.get("token"), "kept");
    assert.equal(url.searchParams.get("action"), "getEvents");
    assert.equal(url.searchParams.get("status"), "all");
    assert.equal(url.searchParams.get("type"), "community market");
    assert.equal(url.searchParams.get("month"), "2026-08");
    assert.equal(url.searchParams.get("lang"), "en");
    assert.match(calls[0], /type=community(?:\+|%20)market/);
    assert.equal(JSON.stringify(filters), snapshot);
  }

  {
    let requestedUrl = "";
    const api = loadApi({
      apiUrl: "https://api.example/exec",
      fetchImpl: async (url) => {
        requestedUrl = url;
        return response({ body: { ok: true, data: { event_id: "EVT A/B" } } });
      }
    });
    await api.getEventDetail("EVT A/B", { lang: "th" });
    const url = new URL(requestedUrl);
    assert.equal(url.searchParams.get("action"), "getEventDetail");
    assert.equal(url.searchParams.get("event_id"), "EVT A/B");
    assert.equal(url.searchParams.get("lang"), "th");
    assert.match(requestedUrl, /event_id=EVT(?:\+|%20)A%2FB/);
  }

  {
    const api = loadApi({ apiUrl: "" });
    const list = await api.getEvents({}, { mock: () => ({ items: [{ event_id: "MOCK-EVT-001" }], total: 1 }) });
    const detail = await api.getEventDetail("MOCK-EVT-001", {}, { mock: ({ event_id }) => ({ event_id }) });
    assert.equal(list.items[0].event_id, "MOCK-EVT-001");
    assert.equal(detail.event_id, "MOCK-EVT-001");
  }

  {
    let mockCalls = 0;
    const api = loadApi({
      apiUrl: "https://api.example/exec",
      fetchImpl: async () => { throw new Error("event network failure"); }
    });
    await expectReject(api.getEvents({}, { mock: () => { mockCalls += 1; return {}; } }), "NETWORK_ERROR");
    assert.equal(mockCalls, 0);
  }

  {
    const calls = [];
    const api = loadApi({
      apiUrl: "https://api.example/exec?token=kept",
      fetchImpl: async (url) => {
        calls.push(url);
        return response({ body: { ok: true, data: { items: [], total: 0 } } });
      }
    });
    const filters = { category: "food & honey", district: "ban_ta_khun", related_place_id: "BTK A/B", lang: "en" };
    const snapshot = JSON.stringify(filters);
    await api.getProducts(filters);
    const url = new URL(calls[0]);
    assert.equal(url.searchParams.get("token"), "kept");
    assert.equal(url.searchParams.get("action"), "getProducts");
    assert.equal(url.searchParams.get("category"), "food & honey");
    assert.equal(url.searchParams.get("related_place_id"), "BTK A/B");
    assert.equal(JSON.stringify(filters), snapshot);
  }

  {
    let requestedUrl = "";
    const api = loadApi({
      apiUrl: "https://api.example/exec",
      fetchImpl: async (url) => {
        requestedUrl = url;
        return response({ body: { ok: true, data: { product_id: "PROD A/B" } } });
      }
    });
    await api.getProductDetail("PROD A/B", { lang: "th" });
    const url = new URL(requestedUrl);
    assert.equal(url.searchParams.get("action"), "getProductDetail");
    assert.equal(url.searchParams.get("product_id"), "PROD A/B");
    assert.match(requestedUrl, /product_id=PROD(?:\+|%20)A%2FB/);
  }

  {
    const api = loadApi({ apiUrl: "" });
    const list = await api.getProducts({}, { mock: () => ({ items: [{ product_id: "MOCK-PROD-001" }], total: 1 }) });
    const detail = await api.getProductDetail("MOCK-PROD-001", {}, { mock: ({ product_id }) => ({ product_id }) });
    assert.equal(list.items[0].product_id, "MOCK-PROD-001");
    assert.equal(detail.product_id, "MOCK-PROD-001");
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
    const calls = [];
    const api = loadApi({
      apiUrl: "https://api.example/exec?token=kept",
      fetchImpl: async (url) => {
        calls.push(url);
        return response({ body: { ok: true, data: { items: [], total: 0 } } });
      }
    });
    assert.equal(typeof api.getGallery, "function");
    const filters = { category: "place", media_type: "video", related_place_id: "BTK A/B", lang: "en", ignored: "no" };
    const snapshot = JSON.stringify(filters);
    await api.getGallery(filters);
    const url = new URL(calls[0]);
    assert.equal(url.searchParams.get("token"), "kept");
    assert.equal(url.searchParams.get("action"), "getGallery");
    assert.equal(url.searchParams.get("category"), "place");
    assert.equal(url.searchParams.get("media_type"), "video");
    assert.equal(url.searchParams.get("related_place_id"), "BTK A/B");
    assert.equal(url.searchParams.get("lang"), "en");
    assert.equal(url.searchParams.get("ignored"), null);
    assert.match(calls[0], /related_place_id=BTK(?:\+|%20)A%2FB/);
    assert.equal(JSON.stringify(filters), snapshot);
  }

  {
    const api = loadApi({ apiUrl: "" });
    const data = await api.getGallery({}, { mock: () => ({ items: [{ media_id: "MOCK-GAL-001" }], total: 1 }) });
    assert.equal(data.items[0].media_id, "MOCK-GAL-001");
  }

  {
    let mockCalls = 0;
    const api = loadApi({ apiUrl: "https://api.example/exec", fetchImpl: async () => { throw new Error("network"); } });
    await expectReject(api.getGallery({}, { mock: () => { mockCalls += 1; return {}; } }), "NETWORK_ERROR");
    assert.equal(mockCalls, 0);
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

  {
    const calls = [];
    const api = loadApi({ apiUrl: "https://api.example/exec?kept=1", fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({ body: { ok: true, data: { items: [], summary: { average_rating: 0, review_count: 0 }, total: 0 } } });
    } });
    assert.equal(typeof api.getReviews, "function");
    const params = { page: 2, page_size: 10, lang: "en", ignored: "x" };
    const snapshot = JSON.stringify(params);
    await api.getReviews(" P-1 ", params);
    const url = new URL(calls[0].url);
    assert.equal(url.searchParams.get("action"), "getReviews");
    assert.equal(url.searchParams.get("place_id"), " P-1 ");
    assert.equal(url.searchParams.get("page"), "2");
    assert.equal(url.searchParams.get("page_size"), "10");
    assert.equal(url.searchParams.get("lang"), null);
    assert.equal(url.searchParams.get("ignored"), null);
    assert.equal(JSON.stringify(params), snapshot);
  }

  {
    const calls = [];
    const api = loadApi({ apiUrl: "https://api.example/exec", fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({ body: { ok: true, data: { review_id: "REV-1", status: "pending" } } });
    } });
    assert.equal(typeof api.submitReview, "function");
    const payload = { place_id: "P-1", reviewer_name: "A", is_anonymous: false, rating: 5, comment: "Good", status: "approved", approved_by: "ADM", created_at: "client" };
    const allowedPayload = { place_id: "P-1", reviewer_name: "A", is_anonymous: false, rating: 5, comment: "Good" };
    const snapshot = JSON.stringify(payload);
    const result = await api.submitReview(payload);
    assert.deepEqual(result, { review_id: "REV-1", status: "pending" });
    assert.equal(calls[0].url, "https://api.example/exec");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers["Content-Type"], "text/plain;charset=utf-8");
    assert.deepEqual(JSON.parse(calls[0].options.body), { action: "submitReview", payload: allowedPayload });
    assert.ok(calls[0].options.signal);
    assert.equal(JSON.stringify(payload), snapshot);
  }

  {
    const api = loadApi({ apiUrl: "" });
    assert.deepEqual(await api.getReviews("MOCK", {}, { mock: ({ place_id }) => ({ items: [{ place_id }], summary: { average_rating: 5, review_count: 1 }, total: 1 }) }), { items: [{ place_id: "MOCK" }], summary: { average_rating: 5, review_count: 1 }, total: 1 });
    assert.deepEqual(await api.submitReview({ place_id: "MOCK" }, { mock: (payload) => ({ review_id: payload.place_id, status: "pending" }) }), { review_id: "MOCK", status: "pending" });
  }

  {
    let mockCalls = 0;
    const api = loadApi({ apiUrl: "https://api.example/exec", fetchImpl: async () => { throw new Error("network"); } });
    await expectReject(api.getReviews("P-1", {}, { mock: () => { mockCalls += 1; } }), "NETWORK_ERROR");
    await expectReject(api.submitReview({ place_id: "P-1" }, { mock: () => { mockCalls += 1; } }), "NETWORK_ERROR");
    assert.equal(mockCalls, 0);
  }

  process.stdout.write("Public API client behavior verification passed.\n");
}

run().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
