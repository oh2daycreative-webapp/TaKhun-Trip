"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

const PLACE_HEADERS = [
  "place_id", "name_th", "name_en", "slug", "district", "province", "route_group", "category", "sub_category",
  "short_description_th", "short_description_en", "description_th", "description_en", "activities_th", "activities_en",
  "highlight_th", "highlight_en", "phone", "line_url", "facebook_url", "website_url", "google_maps_url", "latitude",
  "longitude", "coordinate_status", "open_time_th", "open_time_en", "fee_th", "fee_en", "cover_image_url",
  "gallery_image_urls", "video_url", "tags", "recommended_duration", "best_time_th", "best_time_en", "nearby_place_ids",
  "is_featured", "is_main_route_point", "sort_order", "status", "created_at", "updated_at", "address_th", "address_en",
  "facilities_th", "facilities_en", "gallery_media_ids", "entity_version", "published_version", "created_by", "updated_by",
  "published_at", "published_by", "archived_at", "archived_by"
];
const DRAFT_HEADERS = [
  "place_id", "name_th", "name_en", "slug", "district", "province", "route_group", "category", "sub_category",
  "short_description_th", "short_description_en", "description_th", "description_en", "activities_th", "activities_en",
  "highlight_th", "highlight_en", "address_th", "address_en", "facilities_th", "facilities_en", "phone", "line_url",
  "facebook_url", "website_url", "google_maps_url", "latitude", "longitude", "coordinate_status", "open_time_th",
  "open_time_en", "fee_th", "fee_en", "cover_image_url", "gallery_image_urls", "video_url", "tags",
  "recommended_duration", "best_time_th", "best_time_en", "nearby_place_ids", "is_featured", "is_main_route_point",
  "sort_order", "gallery_media_ids", "draft_version", "base_published_version", "created_at", "updated_at", "created_by", "updated_by"
];
const CONTENT_KEYS = DRAFT_HEADERS.filter((key) => ![
  "place_id", "cover_image_url", "gallery_image_urls", "video_url", "draft_version", "base_published_version",
  "created_at", "updated_at", "created_by", "updated_by"
].includes(key));
const LIST_KEYS = [
  "place_id", "name_th", "name_en", "category", "area_summary", "status", "has_active_draft", "display_state",
  "cover", "created_at", "updated_at"
];
const DETAIL_KEYS = [
  "place_id", "status", "has_active_draft", "display_state", "entity_version", "working_version", "published_version",
  "content", "media", "capabilities", "created_at", "updated_at"
];

function baseContent(overrides = {}) {
  const content = Object.fromEntries(CONTENT_KEYS.map((key) => [key, ""]));
  Object.assign(content, {
    name_th: "สถานที่",
    name_en: "Place",
    district: "ban_ta_khun",
    province: "สุราษฎร์ธานี",
    category: "nature",
    coordinate_status: "verified",
    latitude: 8.9,
    longitude: 98.7,
    tags: "nature|lake",
    nearby_place_ids: "PLC-OTHER",
    gallery_media_ids: "",
    is_featured: false,
    is_main_route_point: false,
    sort_order: 1
  }, overrides);
  return content;
}

function place(id, overrides = {}) {
  return {
    ...baseContent(),
    place_id: id,
    status: "published",
    entity_version: 1,
    published_version: 1,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    created_by: "ADM-secret",
    updated_by: "ADM-secret",
    published_at: "2026-08-01T00:00:00.000Z",
    published_by: "ADM-secret",
    archived_at: "",
    archived_by: "",
    cover_image_url: "https://forbidden.example/cover.jpg",
    gallery_image_urls: "https://forbidden.example/gallery.jpg",
    video_url: "https://forbidden.example/video.mp4",
    internal_note: "DO_NOT_LEAK",
    ...overrides
  };
}

function draft(id, version, basePublishedVersion, overrides = {}) {
  return {
    ...baseContent(),
    place_id: id,
    draft_version: version,
    base_published_version: basePublishedVersion,
    created_at: "2026-08-02T00:00:00.000Z",
    updated_at: "2026-08-02T00:00:00.000Z",
    created_by: "ADM-draft-secret",
    updated_by: "ADM-draft-secret",
    cover_image_url: "C:/media-source/private.jpg",
    gallery_image_urls: "data:image/png;base64,secret",
    video_url: "blob:secret",
    raw_secret: "DO_NOT_LEAK",
    ...overrides
  };
}

function fixtures() {
  return {
    places: [
      place("PLC-PUBLISHED", { name_th: "เผยแพร่", updated_at: "2026-08-04T00:00:00.000Z" }),
      place("PLC-WORKING", { name_th: "ฉบับเผยแพร่", entity_version: 3, published_version: 2, updated_at: "2026-08-03T00:00:00.000Z" }),
      place("PLC-DRAFT", {
        ...baseContent({ name_th: "", name_en: "", district: "", province: "", category: "", latitude: "", longitude: "", coordinate_status: "", tags: "", nearby_place_ids: "", sort_order: "" }),
        status: "draft", entity_version: 1, published_version: 0, updated_at: "2026-08-02T00:00:00.000Z"
      }),
      place("PLC-ARCHIVED", { name_th: "เก็บถาวร", status: "archived", entity_version: 4, published_version: 3, updated_at: "2026-08-01T00:00:00.000Z" })
    ],
    drafts: [
      draft("PLC-WORKING", 3, 2, { name_th: "แก้ไขล่าสุด", name_en: "Working Copy" }),
      draft("PLC-DRAFT", 1, 0, { name_th: "ร่างใหม่", name_en: "New Draft" })
    ]
  };
}

function table(headers, values) {
  return {
    headers: [...headers],
    headerMap: Object.fromEntries(headers.map((header, index) => [header, index])),
    rows: values.map((row, index) => ({ sourceRowNumber: index + 2, values: { ...row } }))
  };
}

function loadBackend(options = {}) {
  const data = options.data || fixtures();
  const calls = { auth: [], reads: [], writes: [] };
  const role = options.role || "editor";
  const forbiddenWrite = (name) => (...args) => {
    calls.writes.push({ name, args });
    throw new Error(`WRITE_SINK_USED:${name}`);
  };
  const context = {
    JSON, Object, Array, String, Number, Math, Date, RegExp, isFinite,
    AuthService_requireAdmin_(token) {
      calls.auth.push(token);
      if (options.authError) throw new Error(options.authError);
      return { admin_id: "ADM-authoritative", username: "operator", display_name: "Operator", role };
    },
    SheetService_readTable_(name, requiredHeaders) {
      calls.reads.push({ name, requiredHeaders: [...requiredHeaders] });
      if (options.readError) throw new Error(options.readError);
      if (name === "places") return table(PLACE_HEADERS, data.places);
      if (name === "place_drafts") return table(DRAFT_HEADERS, data.drafts);
      throw new Error("UNEXPECTED_READ");
    },
    SheetService_updateObjectAtRow_: forbiddenWrite("updateObjectAtRow"),
    SheetService_appendObjectWithRow_: forbiddenWrite("appendObjectWithRow"),
    SheetService_replaceObjectAtRow_: forbiddenWrite("replaceObjectAtRow"),
    SheetService_clearRow_: forbiddenWrite("clearRow"),
    appendSheetObject_: forbiddenWrite("appendSheetObject"),
    setupAdminPlaceSchema: forbiddenWrite("setupAdminPlaceSchema"),
    migrateAdminPlaceLegacyStatuses: forbiddenWrite("migrateAdminPlaceLegacyStatuses"),
    verifyAdminPlaceStatusMigration: forbiddenWrite("verifyAdminPlaceStatusMigration"),
    LockService: { getScriptLock: forbiddenWrite("getScriptLock") },
    CacheService: { getScriptCache: forbiddenWrite("getScriptCache") },
    PropertiesService: { getScriptProperties: forbiddenWrite("getScriptProperties") },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(text) { return { text, mime: "", setMimeType(mime) { this.mime = mime; return this; } }; }
    }
  };
  vm.createContext(context);
  for (const file of ["apps-script/AdminPlaceSchema.gs", "apps-script/AdminPlaceService.gs", "apps-script/ApiResponse.gs", "apps-script/Router.gs"]) {
    const source = file === "apps-script/AdminPlaceService.gs" && options.serviceSource ? options.serviceSource : read(file);
    vm.runInContext(source, context, { filename: file });
  }
  return { context, calls, data };
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

function response(output) {
  assert.equal(output.mime, "application/json");
  return JSON.parse(output.text);
}

function post(context, body) {
  return response(context.routeRequest_("POST", { postData: { contents: JSON.stringify(body) } }));
}

function assertError(result, code) {
  assert.deepEqual(Object.keys(result), ["ok", "error"]);
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.error), ["code", "message"]);
  assert.equal(result.error.code, code);
  assert.equal(typeof result.error.message, "string");
  assert.equal(result.error.message.length > 0 && result.error.message.length <= 120, true);
}

test("all four authoritative Admin roles may list and inspect Places", () => {
  for (const role of ["super_admin", "editor", "reviewer", "viewer"]) {
    const { context, calls } = loadBackend({ role });
    assert.equal(plain(context.adminGetPlaces_("TOKEN", {})).ok, true);
    assert.equal(plain(context.adminGetPlaceDetail_("TOKEN", { place_id: "PLC-WORKING", view: "working" })).ok, true);
    assert.deepEqual(calls.auth, ["TOKEN", "TOKEN"]);
  }
});

test("mutation proofs reject bypassed authoritative auth and raw-row responses", () => {
  const source = read("apps-script/AdminPlaceService.gs");
  const authBypass = source.replace(
    "var admin = AuthService_requireAdmin_(token);",
    'var admin = { role: "viewer" };'
  );
  assert.notEqual(authBypass, source, "auth mutation target must match production source");
  {
    const { context, calls } = loadBackend({ serviceSource: authBypass });
    context.adminGetPlaces_("TOKEN", {});
    assert.throws(() => assert.deepEqual(calls.auth, ["TOKEN"]));
  }

  const rawRows = source.replace(
    "return AdminPlaceService_success_(AdminPlaceService_buildList_(AdminPlaceService_requireContext_(true), parameters));",
    "return AdminPlaceService_success_(AdminPlaceService_requireContext_(true).placesById);"
  );
  assert.notEqual(rawRows, source, "raw-row mutation target must match production source");
  {
    const { context } = loadBackend({ serviceSource: rawRows });
    const result = plain(context.adminGetPlaces_("TOKEN", {}));
    assert.throws(() => assert.deepEqual(Object.keys(result.data), ["items", "page", "page_size", "total", "total_pages"]));
    assert.equal(JSON.stringify(result).includes("ADM-secret"), true, "mutation must demonstrate a real security-field leak");
  }
});

test("missing or invalid sessions use the safe UNAUTHORIZED envelope", () => {
  for (const token of [undefined, "", "INVALID"]) {
    const { context } = loadBackend({ authError: "UNAUTHORIZED" });
    assertError(plain(context.adminGetPlaces_(token, {})), "UNAUTHORIZED");
    assertError(plain(context.adminGetPlaceDetail_(token, { place_id: "PLC-PUBLISHED", view: "working" })), "UNAUTHORIZED");
  }
});

test("list defaults exclude archived and expose only the exact safe projection", () => {
  const { context, calls } = loadBackend();
  const result = plain(context.adminGetPlaces_("TOKEN", {}));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.items.map((item) => item.place_id), ["PLC-PUBLISHED", "PLC-WORKING", "PLC-DRAFT"]);
  assert.deepEqual(Object.keys(result.data), ["items", "page", "page_size", "total", "total_pages"]);
  assert.deepEqual({ page: result.data.page, page_size: result.data.page_size, total: result.data.total, total_pages: result.data.total_pages }, { page: 1, page_size: 20, total: 3, total_pages: 1 });
  for (const item of result.data.items) assert.deepEqual(Object.keys(item), LIST_KEYS);
  assert.deepEqual(result.data.items.find((item) => item.place_id === "PLC-DRAFT"), {
    place_id: "PLC-DRAFT", name_th: "ร่างใหม่", name_en: "New Draft", category: "nature",
    area_summary: { district: "ban_ta_khun", province: "สุราษฎร์ธานี" }, status: "draft", has_active_draft: true,
    display_state: "draft", cover: null, created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-02T00:00:00.000Z"
  });
  assert.equal(JSON.stringify(result).includes("DO_NOT_LEAK"), false);
  assert.equal(JSON.stringify(result).includes("sourceRowNumber"), false);
  assert.equal(calls.writes.length, 0);
});

test("list filters keyword category and lifecycle exactly and paginates deterministically", () => {
  const { context } = loadBackend();
  assert.deepEqual(plain(context.adminGetPlaces_("TOKEN", { status: "archived" })).data.items.map((item) => item.place_id), ["PLC-ARCHIVED"]);
  assert.deepEqual(plain(context.adminGetPlaces_("TOKEN", { status: "all" })).data.items.map((item) => item.place_id), ["PLC-PUBLISHED", "PLC-WORKING", "PLC-DRAFT", "PLC-ARCHIVED"]);
  assert.deepEqual(plain(context.adminGetPlaces_("TOKEN", { status: "published", category: "nature", keyword: "working copy" })).data.items.map((item) => item.place_id), ["PLC-WORKING"]);
  const page = plain(context.adminGetPlaces_("TOKEN", { status: "all", page: 2, page_size: 2 })).data;
  assert.deepEqual(page.items.map((item) => item.place_id), ["PLC-DRAFT", "PLC-ARCHIVED"]);
  assert.deepEqual({ page: page.page, page_size: page.page_size, total: page.total, total_pages: page.total_pages }, { page: 2, page_size: 2, total: 4, total_pages: 2 });
});

test("list rejects unknown keys invalid filters and unsafe pagination", () => {
  const { context, calls } = loadBackend();
  for (const payload of [
    { role: "super_admin" }, { status: "published_with_draft" }, { status: "hidden" }, { category: "unknown" },
    { status: " published" }, { category: "nature " }, { page: 0 }, { page: 1.5 }, { page: "1x" },
    { page_size: 0 }, { page_size: 101 }, { keyword: {} }
  ]) assertError(plain(context.adminGetPlaces_("TOKEN", payload)), "VALIDATION_ERROR");
  assert.equal(calls.writes.length, 0);
});

test("list derives published plus draft without persisting a fourth status", () => {
  const { context } = loadBackend();
  const item = plain(context.adminGetPlaces_("TOKEN", { status: "published" })).data.items.find((entry) => entry.place_id === "PLC-WORKING");
  assert.equal(item.status, "published");
  assert.equal(item.has_active_draft, true);
  assert.equal(item.display_state, "published_with_draft");
  assert.equal(item.name_th, "แก้ไขล่าสุด");
});

test("working detail selects draft or retained published content without creating a draft", () => {
  const { context, calls } = loadBackend();
  const working = plain(context.adminGetPlaceDetail_("TOKEN", { place_id: "PLC-WORKING", view: "working" })).data;
  const published = plain(context.adminGetPlaceDetail_("TOKEN", { place_id: "PLC-WORKING", view: "published" })).data;
  const noDraft = plain(context.adminGetPlaceDetail_("TOKEN", { place_id: "PLC-PUBLISHED", view: "working" })).data;
  assert.equal(working.content.name_th, "แก้ไขล่าสุด");
  assert.equal(published.content.name_th, "ฉบับเผยแพร่");
  assert.equal(noDraft.content.name_th, "เผยแพร่");
  assert.equal(working.working_version, 3);
  assert.equal(working.published_version, 2);
  assert.equal(noDraft.has_active_draft, false);
  assert.equal(calls.writes.length, 0);
});

test("published detail reads retained content without projecting malformed draft content", () => {
  const data = fixtures();
  data.drafts[0].tags = { malformed: true };
  const { context } = loadBackend({ data });
  const published = plain(context.adminGetPlaceDetail_("TOKEN", { place_id: "PLC-WORKING", view: "published" }));
  assert.equal(published.ok, true);
  assert.equal(published.data.content.name_th, "ฉบับเผยแพร่");
  assertError(plain(context.adminGetPlaceDetail_("TOKEN", { place_id: "PLC-WORKING", view: "working" })), "SERVER_ERROR");
});

test("detail returns exact safe content media and lifecycle projections", () => {
  const { context } = loadBackend();
  const detail = plain(context.adminGetPlaceDetail_("TOKEN", { place_id: "PLC-WORKING", view: "working" })).data;
  assert.deepEqual(Object.keys(detail), DETAIL_KEYS);
  assert.deepEqual(Object.keys(detail.content), CONTENT_KEYS);
  assert.deepEqual(detail.content.tags, ["nature", "lake"]);
  assert.deepEqual(detail.content.nearby_place_ids, ["PLC-OTHER"]);
  assert.deepEqual(detail.content.gallery_media_ids, []);
  assert.deepEqual(detail.media, { cover: null, gallery: [] });
  assert.deepEqual(Object.keys(detail.capabilities), ["can_write", "can_publish", "can_unpublish", "can_archive", "can_restore", "can_view_working", "can_view_published"]);
  assert.equal(JSON.stringify(detail).includes("DO_NOT_LEAK"), false);
  for (const forbidden of ["cover_image_url", "gallery_image_urls", "video_url", "draft_version", "base_published_version", "created_by", "updated_by", "sourceRowNumber"]) {
    assert.equal(JSON.stringify(detail).includes(`\"${forbidden}\"`), false, `${forbidden} must not leak`);
  }
});

test("detail capabilities derive only from authoritative role and lifecycle", () => {
  const editor = plain(loadBackend({ role: "editor" }).context.adminGetPlaceDetail_("TOKEN", { place_id: "PLC-WORKING", view: "working" })).data.capabilities;
  assert.deepEqual(editor, { can_write: true, can_publish: true, can_unpublish: true, can_archive: true, can_restore: false, can_view_working: true, can_view_published: true });
  const viewer = plain(loadBackend({ role: "viewer" }).context.adminGetPlaceDetail_("TOKEN", { place_id: "PLC-WORKING", view: "working", role: "super_admin" }));
  assertError(viewer, "VALIDATION_ERROR");
  const viewerSafe = plain(loadBackend({ role: "viewer" }).context.adminGetPlaceDetail_("TOKEN", { place_id: "PLC-WORKING", view: "working" })).data.capabilities;
  assert.deepEqual(viewerSafe, { can_write: false, can_publish: false, can_unpublish: false, can_archive: false, can_restore: false, can_view_working: true, can_view_published: true });
});

test("archived and draft-only detail remain safely readable", () => {
  const { context } = loadBackend();
  const archived = plain(context.adminGetPlaceDetail_("TOKEN", { place_id: "PLC-ARCHIVED", view: "working" })).data;
  const draftOnly = plain(context.adminGetPlaceDetail_("TOKEN", { place_id: "PLC-DRAFT", view: "working" })).data;
  assert.equal(archived.display_state, "archived");
  assert.equal(archived.capabilities.can_restore, true);
  assert.equal(draftOnly.content.name_th, "ร่างใหม่");
  assert.equal(draftOnly.published_version, null);
  assert.equal(draftOnly.capabilities.can_view_published, false);
  assertError(plain(context.adminGetPlaceDetail_("TOKEN", { place_id: "PLC-DRAFT", view: "published" })), "NOT_FOUND");
});

test("unknown Place returns NOT_FOUND while malformed requests return VALIDATION_ERROR", () => {
  const { context } = loadBackend();
  assertError(plain(context.adminGetPlaceDetail_("TOKEN", { place_id: "PLC-MISSING", view: "working" })), "NOT_FOUND");
  for (const payload of [
    {}, { place_id: "../PLC", view: "working" }, { place_id: 1, view: "working" },
    { place_id: " PLC-PUBLISHED", view: "working" }, { place_id: "PLC-PUBLISHED", view: " working" },
    { place_id: "PLC-PUBLISHED" }, { place_id: "PLC-PUBLISHED", view: "raw" },
    { place_id: "PLC-PUBLISHED", view: "working", token: "fake" }
  ]) {
    assertError(plain(context.adminGetPlaceDetail_("TOKEN", payload)), "VALIDATION_ERROR");
  }
});

test("duplicate identities drafts and version invariant corruption fail closed", () => {
  const cases = [
    (data) => data.places.push({ ...data.places[0] }),
    (data) => data.drafts.push({ ...data.drafts[0] }),
    (data) => { data.drafts[0].draft_version = 2; },
    (data) => { data.drafts[0].base_published_version = 1; },
    (data) => { data.places[0].status = "hidden"; },
    (data) => { data.places[0].entity_version = "bad"; },
    (data) => data.drafts.push(draft("PLC-ORPHAN", 1, 0)),
    (data) => { data.drafts[0].gallery_media_ids = "valid-id| padded-id"; },
    (data) => { data.drafts[0].gallery_media_ids = Array.from({ length: 51 }, (_value, index) => `media-${index}`).join("|"); }
  ];
  for (const mutate of cases) {
    const data = fixtures();
    mutate(data);
    const { context, calls } = loadBackend({ data });
    assertError(plain(context.adminGetPlaces_("TOKEN", {})), "SERVER_ERROR");
    assert.equal(calls.writes.length, 0);
  }
});

test("read failures and malformed authoritative role expose only SERVER_ERROR", () => {
  for (const options of [{ readError: "sheet id stack secret" }, { role: "owner" }]) {
    const { context } = loadBackend(options);
    const result = plain(context.adminGetPlaces_("TOKEN", {}));
    assertError(result, "SERVER_ERROR");
    assert.equal(JSON.stringify(result).includes("sheet id stack secret"), false);
  }
});

test("Router exposes exactly the two POST-only Admin read actions", () => {
  const { context, calls } = loadBackend();
  assert.equal(post(context, { action: "adminGetPlaces", token: "TOKEN", payload: {} }).ok, true);
  assert.equal(post(context, { action: "adminGetPlaceDetail", token: "TOKEN", payload: { place_id: "PLC-PUBLISHED", view: "working" } }).ok, true);
  assert.equal(response(context.routeRequest_("GET", { parameter: { action: "adminGetPlaces", token: "TOKEN" } })).error.code, "UNKNOWN_ACTION");
  assert.equal(calls.auth.length, 2);
  assert.equal(calls.writes.length, 0);
});

test("Admin reads leave Public draft isolation and source state unchanged", () => {
  const source = fixtures();
  const before = JSON.stringify(source);
  const { context, calls } = loadBackend({ data: source });
  const admin = plain(context.adminGetPlaceDetail_("TOKEN", { place_id: "PLC-WORKING", view: "working" })).data;
  assert.equal(admin.content.name_th, "แก้ไขล่าสุด");
  const publicContext = { JSON, Object, Array, String, Number, Math, Date, isFinite, CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) } };
  vm.createContext(publicContext);
  vm.runInContext(read("apps-script/PlaceService.gs"), publicContext, { filename: "apps-script/PlaceService.gs" });
  const publicDetail = plain(publicContext.buildPlaceDetailResponse_(source.places, { place_id: "PLC-WORKING", lang: "th" })).data;
  assert.equal(publicDetail.name_th, "ฉบับเผยแพร่");
  assert.equal(JSON.stringify(publicDetail).includes("แก้ไขล่าสุด"), false);
  assert.equal(plain(publicContext.buildPlaceDetailResponse_(source.places, { place_id: "PLC-DRAFT", lang: "th" })).error.code, "NOT_FOUND");
  assert.equal(plain(publicContext.buildPlaceDetailResponse_(source.places, { place_id: "PLC-ARCHIVED", lang: "th" })).error.code, "NOT_FOUND");
  assert.equal(JSON.stringify(source), before);
  assert.equal(calls.writes.length, 0);
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("Admin Place service verification passed.\n");
