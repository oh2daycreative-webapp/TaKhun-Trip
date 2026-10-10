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
const PLACE_ID = "PLC-12345678-1234-4234-8234-123456789abc";
const CONTENT_KEYS = [
  "name_th", "name_en", "slug", "district", "province", "route_group", "category", "sub_category",
  "short_description_th", "short_description_en", "description_th", "description_en", "activities_th", "activities_en",
  "highlight_th", "highlight_en", "address_th", "address_en", "facilities_th", "facilities_en", "phone", "line_url",
  "facebook_url", "website_url", "google_maps_url", "latitude", "longitude", "coordinate_status", "open_time_th",
  "open_time_en", "fee_th", "fee_en", "tags", "recommended_duration", "best_time_th", "best_time_en",
  "nearby_place_ids", "is_featured", "is_main_route_point", "sort_order", "gallery_media_ids"
];
const PLACE_METHODS = Object.freeze({
  getPlaces: "adminGetPlaces",
  getPlaceDetail: "adminGetPlaceDetail",
  getPlaceMediaOptions: "adminGetPlaceMediaOptions",
  inspectPlaceDependencies: "adminInspectPlaceDependencies",
  createPlace: "adminCreatePlace",
  savePlaceDraft: "adminSavePlaceDraft",
  publishPlace: "adminPublishPlace",
  unpublishPlace: "adminUnpublishPlace",
  archivePlace: "adminArchivePlace",
  restorePlace: "adminRestorePlace"
});
const WRITE_METHODS = ["createPlace", "savePlaceDraft", "publishPlace", "unpublishPlace", "archivePlace", "restorePlace"];

function editableContent(overrides = {}) {
  const content = Object.fromEntries(CONTENT_KEYS.map((key) => [key, ""]));
  return Object.assign(content, {
    name_th: "สถานที่", district: "ban_ta_khun", province: "สุราษฎร์ธานี", category: "nature",
    coordinate_status: "verified", latitude: 8.9, longitude: 98.7, tags: ["lake"], nearby_place_ids: [],
    is_featured: false, is_main_route_point: false, sort_order: 1, gallery_media_ids: ""
  }, overrides);
}

function writeResult(overrides = {}) {
  return Object.assign({
    place_id: PLACE_ID, status: "draft", entity_version: 2, working_version: 2, published_version: 1,
    has_active_draft: true, created_at: "2026-08-08T10:00:00.000Z", updated_at: "2026-08-08T11:00:00.000Z"
  }, overrides);
}

function safeMedia(overrides = {}) {
  return Object.assign({
    media_id: `place-${PLACE_ID.toLowerCase()}-cover`, entity_type: "place", entity_id: PLACE_ID, role: "cover",
    alt_th: "ภาพสถานที่", alt_en: "Place", fallback: "assets/media/placeholders/cover.svg",
    outputs: [{ width: 640, height: 360, path: "assets/media/generated/place-cover-test-640.webp" }]
  }, overrides);
}

function listResult() {
  return {
    items: [{
      place_id: PLACE_ID, name_th: "สถานที่", name_en: "Place", category: "nature",
      area_summary: { district: "ban_ta_khun", province: "สุราษฎร์ธานี" }, status: "published",
      has_active_draft: true, display_state: "published_with_draft", cover: null,
      created_at: "2026-08-08T10:00:00.000Z", updated_at: "2026-08-08T11:00:00.000Z"
    }], page: 1, page_size: 20, total: 1, total_pages: 1
  };
}

function detailResult() {
  return {
    place_id: PLACE_ID, status: "published", has_active_draft: true, display_state: "published_with_draft",
    entity_version: 2, working_version: 2, published_version: 1, content: editableContent({ gallery_media_ids: [] }),
    media: { cover: null, gallery: [] },
    capabilities: {
      can_write: true, can_publish: true, can_unpublish: true, can_archive: true, can_restore: false,
      can_view_working: true, can_view_published: true
    },
    created_at: "2026-08-08T10:00:00.000Z", updated_at: "2026-08-08T11:00:00.000Z"
  };
}

function dependencyResult() {
  return {
    place_id: PLACE_ID, checked_at: "2026-08-08T11:00:00.000Z",
    groups: Object.fromEntries(["routes", "nearby_places", "products", "events", "gallery", "trip_templates", "reviews"]
      .map((key) => [key, key === "routes" ? [{ entity_id: "ROUTE-1", label: "Route" }] : []]))
  };
}

function archiveDependencies(overrides = {}) {
  return Object.assign(Object.fromEntries(
    ["routes", "nearby_places", "products", "events", "gallery", "trip_templates", "reviews"].map((key) => [key, []])
  ), overrides);
}

function validInvocation(api, method) {
  const content = editableContent();
  const calls = {
    getPlaces: () => api.getPlaces(TOKEN, { keyword: "lake", category: "nature", status: "all", page: 1, page_size: 20 }),
    getPlaceDetail: () => api.getPlaceDetail(TOKEN, { place_id: PLACE_ID, view: "working" }),
    getPlaceMediaOptions: () => api.getPlaceMediaOptions(TOKEN, { place_id: PLACE_ID, keyword: "cover", role: "all", page: 1, page_size: 20 }),
    inspectPlaceDependencies: () => api.inspectPlaceDependencies(TOKEN, { place_id: PLACE_ID }),
    createPlace: () => api.createPlace(TOKEN, { content }),
    savePlaceDraft: () => api.savePlaceDraft(TOKEN, { place_id: PLACE_ID, expected_version: 2, content }),
    publishPlace: () => api.publishPlace(TOKEN, { place_id: PLACE_ID, expected_version: 2 }),
    unpublishPlace: () => api.unpublishPlace(TOKEN, { place_id: PLACE_ID, expected_version: 2 }),
    archivePlace: () => api.archivePlace(TOKEN, { place_id: PLACE_ID, expected_version: 2, confirmed: true }),
    restorePlace: () => api.restorePlace(TOKEN, { place_id: PLACE_ID, expected_version: 2 })
  };
  return calls[method]();
}

function successForMethod(method) {
  if (method === "getPlaces") return listResult();
  if (method === "getPlaceDetail") return detailResult();
  if (method === "getPlaceMediaOptions") return { items: [safeMedia()], page: 1, page_size: 20, total: 1, total_pages: 1 };
  if (method === "inspectPlaceDependencies") return dependencyResult();
  if (method === "createPlace") return writeResult({ entity_version: 1, working_version: 1, published_version: null });
  const result = writeResult({
    status: method === "publishPlace" ? "published" : method === "archivePlace" ? "archived" : "draft",
    has_active_draft: method !== "publishPlace",
    published_version: 1
  });
  if (method === "archivePlace") result.dependencies = archiveDependencies({
    routes: [{ entity_id: "ROUTE-1", label: "Route" }]
  });
  return result;
}

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

test("exports exactly the frozen auth and explicit Place facade surface", async () => {
  const { api } = loadAdminApi();
  assert.deepEqual(Object.keys(api).sort(), ["login", "logout", "validateSession", ...Object.keys(PLACE_METHODS), "getProducts", "getProductDetail", "createProduct", "updateProduct", "deleteProduct", "getEvents", "getEventDetail", "createEvent", "updateEvent", "deleteEvent", "getRoutes", "getRouteDetail", "createRoute", "updateRoute", "deleteRoute", "getGallery", "getGalleryDetail", "getGalleryMediaOptions", "createGalleryItem", "updateGalleryItem", "deleteGalleryItem"].sort());
  assert.equal(Object.isFrozen(api), true);
  for (const name of Object.keys(api)) assert.equal(typeof api[name], "function");
  for (const forbidden of ["request", "call", "rawFetch", "dispatch"]) assert.equal(forbidden in api, false);
});

test("every Place facade owns its exact action token and single POST transport", async () => {
  for (const [method, action] of Object.entries(PLACE_METHODS)) {
    const harness = loadAdminApi({ fetchImpl: async () => textResponse(success(successForMethod(method))) });
    try {
      await validInvocation(harness.api, method);
    } catch (error) {
      assert.fail(`${method} rejected its valid contract with ${error && error.code}`);
    }
    assert.equal(harness.calls.length, 1, method);
    assert.equal(harness.calls[0].url, ENDPOINT);
    assert.equal(harness.calls[0].options.method, "POST");
    assert.deepEqual(plain(harness.calls[0].options.headers), { "Content-Type": "text/plain;charset=utf-8" });
    const body = JSON.parse(harness.calls[0].options.body);
    assert.equal(body.action, action);
    assert.equal(body.token, TOKEN);
    assert.equal(JSON.stringify(body).split(TOKEN).length - 1, 1);
    assertNoSecretTransport(harness, [TOKEN]);
    assertSingleRequestCleanup(harness);
  }
});

test("Place requests reject unknown keys invalid IDs filters versions content and Archive preview authority before fetch", async () => {
  const cases = [
    ["getPlaces", (api) => api.getPlaces(TOKEN, { future: true })],
    ["getPlaces", (api) => api.getPlaces(TOKEN, { status: "hidden" })],
    ["getPlaces", (api) => api.getPlaces(TOKEN, { category: "future" })],
    ["getPlaces", (api) => api.getPlaces(TOKEN, { page_size: 101 })],
    ["getPlaces", (api) => api.getPlaces(` ${TOKEN}`, {})],
    ["getPlaceDetail", (api) => api.getPlaceDetail(TOKEN, { place_id: ` ${PLACE_ID}`, view: "working" })],
    ["getPlaceDetail", (api) => api.getPlaceDetail(TOKEN, { place_id: PLACE_ID })],
    ["getPlaceMediaOptions", (api) => api.getPlaceMediaOptions(TOKEN, { place_id: PLACE_ID, role: "hero" })],
    ["inspectPlaceDependencies", (api) => api.inspectPlaceDependencies(TOKEN, { place_id: PLACE_ID, confirmed: true })],
    ["createPlace", (api) => api.createPlace(TOKEN, { place_id: PLACE_ID, content: editableContent() })],
    ["createPlace", (api) => api.createPlace(TOKEN, { content: editableContent({ status: "published" }) })],
    ["createPlace", (api) => api.createPlace(TOKEN, { content: editableContent({ name_en: "unsafe\u0000text" }) })],
    ["createPlace", (api) => api.createPlace(TOKEN, { content: editableContent({ website_url: "https://bad_host.example/place" }) })],
    ["createPlace", (api) => api.createPlace(TOKEN, { content: editableContent({ tags: ["unsafe\u0001tag"] }) })],
    ["savePlaceDraft", (api) => api.savePlaceDraft(TOKEN, { place_id: PLACE_ID, expected_version: 0, content: editableContent() })],
    ["publishPlace", (api) => api.publishPlace(TOKEN, { place_id: PLACE_ID, expected_version: 2, force: true })],
    ["unpublishPlace", (api) => api.unpublishPlace(TOKEN, { place_id: PLACE_ID, expected_version: "2" })],
    ["archivePlace", (api) => api.archivePlace(TOKEN, { place_id: PLACE_ID, expected_version: 2, confirmed: false })],
    ["archivePlace", (api) => api.archivePlace(TOKEN, { place_id: PLACE_ID, expected_version: 2, confirmed: true, dependency_count: 0 })],
    ["restorePlace", (api) => api.restorePlace(TOKEN, { place_id: PLACE_ID, expected_version: 2, preview_token: "unsafe" })]
  ];
  for (const [label, invoke] of cases) {
    const harness = loadAdminApi({ fetchImpl: async () => assert.fail("invalid request fetched") });
    assertSafeError(await captureError(Promise.resolve().then(() => invoke(harness.api))), "VALIDATION_ERROR", [TOKEN]);
    assert.equal(harness.calls.length, 0, label);
  }
});

test("Create and Save Draft preserve strict ordered Gallery media requests at zero one many and fifty", async () => {
  const galleries = [
    "",
    ["place-plc-gallery-one"],
    ["place-plc-gallery-c", "place-plc-gallery-a", "place-plc-gallery-b"],
    Array.from({ length: 50 }, (_value, index) => `place-plc-gallery-${String(index + 1).padStart(2, "0")}`)
  ];
  for (const gallery_media_ids of galleries) {
    for (const method of ["createPlace", "savePlaceDraft"]) {
      const response = method === "createPlace"
        ? writeResult({ entity_version: 1, working_version: 1, published_version: null })
        : writeResult();
      const harness = loadAdminApi({ fetchImpl: async () => textResponse(success(response)) });
      const content = editableContent({ gallery_media_ids });
      const payload = method === "createPlace" ? { content } : { place_id: PLACE_ID, expected_version: 2, content };
      await harness.api[method](TOKEN, payload);
      assert.equal(harness.calls.length, 1, `${method} ${JSON.stringify(gallery_media_ids)}`);
      const body = JSON.parse(harness.calls[0].options.body);
      assert.equal(body.action, PLACE_METHODS[method]);
      assert.equal(body.token, TOKEN);
      assert.deepEqual(body.payload.content.gallery_media_ids, gallery_media_ids);
      assert.deepEqual(Object.keys(body.payload.content).sort(), [...CONTENT_KEYS].sort());
      assert.equal(JSON.stringify(body).includes("source_file"), false);
      assertNoSecretTransport(harness, [TOKEN]);
      assertSingleRequestCleanup(harness);
    }
  }
});

test("Create and Save Draft reject malformed Gallery media requests before transport", async () => {
  const invalid = [
    Array.from({ length: 51 }, (_value, index) => `gallery-${index + 1}`),
    ["gallery-a", "gallery-a"], ["gallery-a", ""], ["gallery-a", "bad_id"], ["Gallery-A"],
    ["https://example.test/gallery.webp"], ["media-source/private.webp"], ["C:/private/gallery.webp"],
    [{ media_id: "gallery-a" }], [["gallery-a"]], "gallery-a,gallery-b", "gallery-a|gallery-b"
  ];
  for (const gallery_media_ids of invalid) {
    for (const method of ["createPlace", "savePlaceDraft"]) {
      const harness = loadAdminApi({ fetchImpl: async () => assert.fail("invalid Gallery request fetched") });
      const content = editableContent({ gallery_media_ids });
      const payload = method === "createPlace" ? { content } : { place_id: PLACE_ID, expected_version: 2, content };
      assertSafeError(await captureError(Promise.resolve().then(() => harness.api[method](TOKEN, payload))), "VALIDATION_ERROR", [TOKEN]);
      assert.equal(harness.calls.length, 0, `${method} ${JSON.stringify(gallery_media_ids)}`);
    }
  }
});

test("Gallery request and response mutation proofs reject every Task 14 contract rollback", async () => {
  const ordered = ["gallery-c", "gallery-a", "gallery-b"];
  const validRequest = async (source, gallery_media_ids = ordered) => {
    const harness = loadAdminApi({ source, fetchImpl: async () => textResponse(success(writeResult())) });
    await assert.doesNotReject(() => harness.api.savePlaceDraft(TOKEN, {
      place_id: PLACE_ID, expected_version: 2, content: editableContent({ gallery_media_ids })
    }));
    assert.deepEqual(JSON.parse(harness.calls[0].options.body).payload.content.gallery_media_ids, gallery_media_ids);
  };
  const invalidRequest = async (source, gallery_media_ids) => {
    const harness = loadAdminApi({ source, fetchImpl: async () => assert.fail("mutated invalid Gallery request fetched") });
    assertSafeError(await captureError(Promise.resolve().then(() => harness.api.savePlaceDraft(TOKEN, {
      place_id: PLACE_ID, expected_version: 2, content: editableContent({ gallery_media_ids })
    }))), "VALIDATION_ERROR");
    assert.equal(harness.calls.length, 0);
  };
  const cases = [
    ["empty-only rollback", mutatedSource(
      '} else if (field !== "" && (!Array.isArray(field) || field.length < 1 || field.length > 50 ||\n          field.some((id) => typeof id !== "string" || !MEDIA_ID_PATTERN.test(id)) || new Set(field).size !== field.length)) return false;',
      '} else if (field !== "") return false;'
    ), (source) => validRequest(source)],
    ["arbitrary arrays", mutatedSource(
      'field.some((id) => typeof id !== "string" || !MEDIA_ID_PATTERN.test(id)) || new Set(field).size !== field.length)) return false;',
      'false) return false;'
    ), (source) => invalidRequest(source, [{ media_id: "gallery-a" }])],
    ["duplicates", mutatedSource(" || new Set(field).size !== field.length)) return false;", ")) return false;"),
      (source) => invalidRequest(source, ["gallery-a", "gallery-a"])],
    ["fifty-one", mutatedSource("field.length < 1 || field.length > 50 ||", "field.length < 1 ||"),
      (source) => invalidRequest(source, Array.from({ length: 51 }, (_value, index) => `gallery-${index + 1}`))],
    ["sorting", mutatedSource("if (!save) return { content: source.content };", "source.content.gallery_media_ids = Array.isArray(source.content.gallery_media_ids) ? source.content.gallery_media_ids.slice().sort() : source.content.gallery_media_ids;\n    if (!save) return { content: source.content };"),
      (source) => validRequest(source)],
    ["URL and path", mutatedSource(
      'field.length < 1 || field.length > 50 ||\n          field.some((id) => typeof id !== "string" || !MEDIA_ID_PATTERN.test(id))',
      'field.length < 1 || field.length > 50 ||\n          field.some((id) => typeof id !== "string" || false)'
    ),
      (source) => invalidRequest(source, ["https://example.test/gallery.webp"])],
    ["response weakening", mutatedSource("        !validContent(data.content, true) ||", "        false ||"), async (source) => {
      const malformed = detailResult(); malformed.content.gallery_media_ids = ["bad_id"];
      const harness = loadAdminApi({ source, fetchImpl: async () => textResponse(success(malformed)) });
      assertSafeError(await captureError(harness.api.getPlaceDetail(TOKEN, { place_id: PLACE_ID, view: "working" })), "MALFORMED_RESPONSE");
    }]
  ];
  for (const [label, source, contract] of cases) {
    await assert.rejects(() => contract(source), undefined, `${label} mutant must be caught`);
  }
});

test("strict Place success validators accept only exact list detail media dependency and write projections", async () => {
  for (const method of Object.keys(PLACE_METHODS)) {
    const valid = successForMethod(method);
    const accepted = loadAdminApi({ fetchImpl: async () => textResponse(success(valid)) });
    assert.deepEqual(plain(await validInvocation(accepted.api, method)), valid);
    const malformed = Array.isArray(valid) ? valid.slice() : { ...valid, internal_row: 7 };
    const rejected = loadAdminApi({ fetchImpl: async () => textResponse(success(malformed)) });
    assertSafeError(await captureError(validInvocation(rejected.api, method)), "MALFORMED_RESPONSE", [TOKEN, "internal_row"]);
  }
  const badDependency = dependencyResult();
  badDependency.groups.eighth = [];
  const dependencies = loadAdminApi({ fetchImpl: async () => textResponse(success(badDependency)) });
  assertSafeError(await captureError(dependencies.api.inspectPlaceDependencies(TOKEN, { place_id: PLACE_ID })), "MALFORMED_RESPONSE");
  const badDependencyItem = dependencyResult();
  badDependencyItem.groups.routes[0].source_row = 7;
  const dependencyItem = loadAdminApi({ fetchImpl: async () => textResponse(success(badDependencyItem)) });
  assertSafeError(await captureError(dependencyItem.api.inspectPlaceDependencies(TOKEN, { place_id: PLACE_ID })), "MALFORMED_RESPONSE");
  const badMedia = { items: [safeMedia({ entity_id: "PLC-OTHER" })], page: 1, page_size: 20, total: 1, total_pages: 1 };
  const media = loadAdminApi({ fetchImpl: async () => textResponse(success(badMedia)) });
  assertSafeError(await captureError(media.api.getPlaceMediaOptions(TOKEN, { place_id: PLACE_ID })), "MALFORMED_RESPONSE");
  const impossibleList = listResult();
  Object.assign(impossibleList.items[0], { status: "draft", has_active_draft: false, display_state: "draft" });
  const list = loadAdminApi({ fetchImpl: async () => textResponse(success(impossibleList)) });
  assertSafeError(await captureError(list.api.getPlaces(TOKEN, {})), "MALFORMED_RESPONSE");
  const impossibleSave = writeResult({ status: "archived", has_active_draft: true });
  const save = loadAdminApi({ fetchImpl: async () => textResponse(success(impossibleSave)) });
  assertSafeError(await captureError(save.api.savePlaceDraft(TOKEN, {
    place_id: PLACE_ID, expected_version: 2, content: editableContent()
  })), "MALFORMED_RESPONSE");
  const wrongListRole = listResult();
  wrongListRole.items[0].cover = safeMedia({ role: "gallery" });
  const listRole = loadAdminApi({ fetchImpl: async () => textResponse(success(wrongListRole)) });
  assertSafeError(await captureError(listRole.api.getPlaces(TOKEN, {})), "MALFORMED_RESPONSE");
  const wrongDetailRoles = detailResult();
  wrongDetailRoles.media = { cover: safeMedia({ role: "gallery" }), gallery: [safeMedia({ role: "cover" })] };
  const detailRoles = loadAdminApi({ fetchImpl: async () => textResponse(success(wrongDetailRoles)) });
  assertSafeError(await captureError(detailRoles.api.getPlaceDetail(TOKEN, { place_id: PLACE_ID, view: "working" })), "MALFORMED_RESPONSE");
  const wrongOptionRole = { items: [safeMedia({ role: "gallery" })], page: 1, page_size: 20, total: 1, total_pages: 1 };
  const optionRole = loadAdminApi({ fetchImpl: async () => textResponse(success(wrongOptionRole)) });
  assertSafeError(await captureError(optionRole.api.getPlaceMediaOptions(TOKEN, {
    place_id: PLACE_ID, role: "cover", page: 1, page_size: 20
  })), "MALFORMED_RESPONSE");
  const impossibleCapabilities = detailResult();
  Object.assign(impossibleCapabilities, { status: "archived", display_state: "archived" });
  Object.assign(impossibleCapabilities.capabilities, { can_publish: true, can_archive: true, can_restore: false });
  const capabilities = loadAdminApi({ fetchImpl: async () => textResponse(success(impossibleCapabilities)) });
  assertSafeError(await captureError(capabilities.api.getPlaceDetail(TOKEN, { place_id: PLACE_ID, view: "working" })), "MALFORMED_RESPONSE");
  const missingPublishVersion = writeResult({ status: "published", has_active_draft: false, published_version: null });
  const publishVersion = loadAdminApi({ fetchImpl: async () => textResponse(success(missingPublishVersion)) });
  assertSafeError(await captureError(publishVersion.api.publishPlace(TOKEN, {
    place_id: PLACE_ID, expected_version: 2
  })), "MALFORMED_RESPONSE");
  for (const unsafeMedia of [
    safeMedia({ media_id: "place-arbitrary-cover" }),
    safeMedia({ fallback: "media-source/private.jpg" }),
    safeMedia({ outputs: [{ width: 640, height: 360, path: "scripts/admin-auth.js" }] }),
    safeMedia({ outputs: [{ width: 640, height: 360, path: "assets/media/generated/%2e%2e/private.webp" }] })
  ]) {
    const unsafeList = listResult();
    unsafeList.items[0].cover = unsafeMedia;
    const unsafe = loadAdminApi({ fetchImpl: async () => textResponse(success(unsafeList)) });
    assertSafeError(await captureError(unsafe.api.getPlaces(TOKEN, {})), "MALFORMED_RESPONSE");
  }
});

test("Archive alone requires the exact ordered seven-group execution dependency projection", async () => {
  const exact = successForMethod("archivePlace");
  const accepted = loadAdminApi({ fetchImpl: async () => textResponse(success(exact)) });
  assert.deepEqual(plain(await accepted.api.archivePlace(TOKEN, {
    place_id: PLACE_ID, expected_version: 2, confirmed: true
  })), exact);
  assert.equal(accepted.calls.length, 1);
  assert.deepEqual(JSON.parse(accepted.calls[0].options.body), {
    action: "adminArchivePlace", token: TOKEN,
    payload: { place_id: PLACE_ID, expected_version: 2, confirmed: true }
  });
  assertNoSecretTransport(accepted, [TOKEN]);
  assertSingleRequestCleanup(accepted);

  const invalid = [
    writeResult({ status: "archived", dependencies: undefined }),
    { ...exact, dependencies: Object.fromEntries(Object.entries(exact.dependencies).filter(([key]) => key !== "reviews")) },
    { ...exact, dependencies: { ...exact.dependencies, extra_group: [] } },
    { ...exact, dependencies: { ...exact.dependencies, events: {} } },
    { ...exact, dependencies: { ...exact.dependencies, routes: [{ entity_id: "bad id", label: "Route" }] } },
    { ...exact, dependencies: { ...exact.dependencies, routes: [{ entity_id: "ROUTE-1", label: "" }] } },
    { ...exact, dependencies: { ...exact.dependencies, routes: [{ entity_id: "ROUTE-1", label: "   " }] } },
    { ...exact, dependencies: { ...exact.dependencies, routes: [{ entity_id: "ROUTE-1", label: " Route " }] } },
    { ...exact, dependencies: { ...exact.dependencies, routes: [{ entity_id: "ROUTE-1", label: "Route", source_row: 7 }] } },
    { ...exact, dependencies: { ...exact.dependencies, routes: [{ entity_id: "ROUTE-2", label: "Second" }, { entity_id: "ROUTE-1", label: "First" }] } },
    { ...exact, internal_lock: "private" }
  ];
  delete invalid[0].dependencies;
  for (const response of invalid) {
    const harness = loadAdminApi({ fetchImpl: async () => textResponse(success(response)) });
    assertSafeError(await captureError(harness.api.archivePlace(TOKEN, {
      place_id: PLACE_ID, expected_version: 2, confirmed: true
    })), "MALFORMED_RESPONSE", [TOKEN, "private"]);
    assert.equal(harness.calls.length, 1);
    assertSingleRequestCleanup(harness);
  }

  for (const method of ["createPlace", "savePlaceDraft", "publishPlace", "unpublishPlace", "restorePlace"]) {
    const response = successForMethod(method);
    response.dependencies = archiveDependencies();
    const harness = loadAdminApi({ fetchImpl: async () => textResponse(success(response)) });
    assertSafeError(await captureError(validInvocation(harness.api, method)), "MALFORMED_RESPONSE");
  }
});

test("Place projection assertions reject an executable arbitrary-object acceptance mutation", async () => {
  const source = mutatedSource(
    "    if (validated) return validated;\n    throw safeError(\"MALFORMED_RESPONSE\");",
    "    if (validated) return validated;\n    if (action === \"adminGetPlaces\") return data;\n    throw safeError(\"MALFORMED_RESPONSE\");"
  );
  await proveContractRejects(async () => {
    const harness = loadAdminApi({ source, fetchImpl: async () => textResponse(success({ arbitrary: true })) });
    assertSafeError(await captureError(harness.api.getPlaces(TOKEN, {})), "MALFORMED_RESPONSE");
  });
});

test("every Place write remains single-fetch across network timeout HTTP malformed conflict and rate-limit outcomes", async () => {
  for (const method of WRITE_METHODS) {
    const fixtures = [
      { code: "NETWORK_ERROR", fetchImpl: async () => { throw new TypeError(`offline ${TOKEN}`); } },
      { code: "HTTP_ERROR", fetchImpl: async () => textResponse("secret", { ok: false, status: 503 }) },
      { code: "MALFORMED_RESPONSE", fetchImpl: async () => textResponse("not-json") },
      { code: "CONFLICT", fetchImpl: async () => textResponse({ ok: false, error: { code: "CONFLICT", message: `raw ${TOKEN}` } }) },
      { code: "RATE_LIMITED", fetchImpl: async () => textResponse({ ok: false, error: { code: "RATE_LIMITED", message: `raw ${TOKEN}` } }) }
    ];
    for (const fixture of fixtures) {
      const harness = loadAdminApi({ fetchImpl: fixture.fetchImpl });
      assertSafeError(await captureError(validInvocation(harness.api, method)), fixture.code, [TOKEN, "raw", "secret"]);
      assertSingleRequestCleanup(harness);
    }
    let fetchCount = 0;
    const timeout = loadAdminApi({
      fetchImpl: async (_url, options) => {
        fetchCount += 1;
        return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => {
          const error = new Error(`aborted ${TOKEN}`);
          error.name = "AbortError";
          reject(error);
        }));
      }
    });
    const pending = validInvocation(timeout.api, method);
    timeout.timers[0].callback();
    assertSafeError(await captureError(pending), "TIMEOUT", [TOKEN]);
    assert.equal(fetchCount, 1, method);
    assert.equal(timeout.calls.length, 1, method);
    assert.equal(timeout.controllers[0].abortCount, 1, method);
    assert.deepEqual(timeout.clearedTimerIds, [timeout.timers[0].id], method);
  }
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
  for (const code of ["VALIDATION_ERROR", "UNAUTHORIZED", "RATE_LIMITED", "SERVER_ERROR", "FORBIDDEN", "NOT_FOUND", "CONFLICT"]) {
    await assertBackendErrorCleanup(code);
  }
  await assertBackendErrorCleanup("INTERNAL_DATABASE_DETAIL");
});

test("backend-code assertions reject an executable arbitrary-code acceptance mutation", async () => {
  const source = mutatedSource(
    "    const code = BACKEND_ERROR_CODES.includes(result.error.code) || domain && [\"INVALID_TRANSITION\", \"DUPLICATE_ID\"].includes(result.error.code) ? result.error.code : \"SERVER_ERROR\";",
    "    const code = typeof result.error.code === \"string\" ? result.error.code : \"SERVER_ERROR\";"
  );
  await proveContractRejects(() => assertBackendErrorCleanup("INTERNAL_DATABASE_DETAIL", source));
});

test("backend-error cleanup assertions reject a timer-leak mutation", async () => {
  const source = mutatedSource(
    '      return parseEnvelope(body, rawText);\n    } finally {\n      if (timer !== null) global.clearTimeout(timer);\n    }',
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

test("login and session projections retain the existing 100-code-point supplementary Unicode contract", async () => {
  const displayName = "\u{1F600}".repeat(100);
  const admin = { ...ADMIN, display_name: displayName };
  const harness = loadAdminApi({ fetchImpl: async () => textResponse(success({ admin, token: TOKEN, expires_at: EXPIRES_AT })) });
  assert.equal((await harness.api.login("operator", "Password")).admin.display_name, displayName);
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

test("Create non-OK HTTP response is indeterminate even with an application-shaped body", async () => {
  let bodyReads=0;
  const harness=loadAdminApi({fetchImpl:async()=>({ok:false,status:503,text:async()=>{bodyReads++;return JSON.stringify({ok:false,error:{code:"SERVER_ERROR",message:"private"}});}})});
  assertSafeError(await captureError(validInvocation(harness.api,"createPlace")),"HTTP_ERROR");
  assert.equal(bodyReads,0);
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
