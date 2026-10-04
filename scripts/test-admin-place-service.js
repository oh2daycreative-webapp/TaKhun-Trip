"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const normalizeSource = (source) => source.replace(/\r\n?/g, "\n");
const adminPlaceServiceSource = normalizeSource(read("apps-script/AdminPlaceService.gs"));
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
const WRITE_SUCCESS_KEYS = [
  "place_id", "status", "entity_version", "working_version", "published_version",
  "has_active_draft", "created_at", "updated_at"
];
const AUDIT_HEADERS = [
  "log_id", "admin_id", "action", "entity_type", "entity_id", "description", "created_at",
  "audit_id", "actor_admin_id", "occurred_at"
];
const AUDIT_ACTIONS = ["CREATE", "UPDATE_DRAFT", "PUBLISH", "UNPUBLISH", "ARCHIVE", "RESTORE"];
const DEPENDENCY_HEADERS = {
  routes: ["route_id", "name_th", "name_en", "status"],
  route_places: ["route_place_id", "route_id", "place_id", "status"],
  products: ["product_id", "name_th", "name_en", "related_place_id", "status"],
  events: ["event_id", "title_th", "title_en", "related_place_id", "status"],
  gallery: ["media_id", "title_th", "title_en", "related_place_id", "status"],
  trip_templates: ["template_id", "name_th", "name_en", "place_ids", "status"],
  reviews: ["review_id", "place_id", "reviewer_name", "is_anonymous", "status"]
};
const DEPENDENCY_GROUPS = ["routes", "nearby_places", "products", "events", "gallery", "trip_templates", "reviews"];
const focusArgument = process.argv.find((argument) => argument.startsWith("--focus="));
const focus = focusArgument ? focusArgument.slice("--focus=".length).toLowerCase() : "";
const MEDIA_MANIFEST_URL = "https://www.takhuntrip.example/assets/media/manifest/media-manifest.json";
const MEDIA_ALLOWED_ORIGIN = "https://www.takhuntrip.example";

function approvedMedia(media_id, entity_id, role = "gallery", overrides = {}) {
  return {
    media_id, entity_type: "place", entity_id, role, ratio: "3:2", required: false,
    alt_th: "ภาพสถานที่", alt_en: "Place image", fallback: "assets/media/placeholders/gallery.svg",
    outputs: [{ width: 640, height: 427, path: `assets/media/generated/places/${media_id}-640.webp`, bytes: 1234, sha256: "a".repeat(64) }],
    source_file: "media-source/private.jpg", ...overrides
  };
}

function approvedManifest(items = [approvedMedia("place-plc-published-gallery-a", "PLC-PUBLISHED")]) {
  return { version: 1, items };
}

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

function writeContent(overrides = {}) {
  return {
    ...baseContent({ tags: "", nearby_place_ids: "", gallery_media_ids: "", ...overrides }),
    tags: Object.prototype.hasOwnProperty.call(overrides, "tags") ? overrides.tags : ["nature", "lake"],
    nearby_place_ids: Object.prototype.hasOwnProperty.call(overrides, "nearby_place_ids") ? overrides.nearby_place_ids : ["PLC-OTHER"],
    gallery_media_ids: Object.prototype.hasOwnProperty.call(overrides, "gallery_media_ids") ? overrides.gallery_media_ids : ""
  };
}

function emptyWriteContent(overrides = {}) {
  const content = Object.fromEntries(CONTENT_KEYS.map((key) => [key, ""]));
  content.tags = [];
  content.nearby_place_ids = [];
  content.gallery_media_ids = "";
  content.is_featured = false;
  content.is_main_route_point = false;
  return { ...content, ...overrides };
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

function dependencyFixtures() {
  const data = fixtures();
  data.places.push(
    place("PLC-NEAR-A", { name_th: "Nearby A", status: "draft", nearby_place_ids: "PLC-PUBLISHED|PLC-PUBLISHED" }),
    place("PLC-NEAR-B", { name_th: "", name_en: "Nearby B", status: "published", nearby_place_ids: "OTHER| PLC-PUBLISHED | |OTHER" }),
    place("PLC-NEAR-C", { name_th: "", name_en: "", status: "archived", nearby_place_ids: "PLC-PUBLISHED" })
  );
  data.routes = [
    { route_id: "ROUTE-D", name_th: "Route Draft", name_en: "", status: "draft", description_th: "PLC-PUBLISHED" },
    { route_id: "ROUTE-P", name_th: "", name_en: "Route Published", status: "published" },
    { route_id: "ROUTE-H", name_th: "", name_en: "", status: "hidden" },
    { route_id: "ROUTE-A", name_th: "Route Archived", name_en: "", status: "archived" },
    { route_id: "ROUTE-X", name_th: "Deleted", name_en: "", status: "deleted", place_ids: "PLC-PUBLISHED" },
    { route_id: "ROUTE-TEXT", name_th: "PLC-PUBLISHED", name_en: "", status: "published", description_th: "PLC-PUBLISHED" }
  ];
  data.route_places = [
    { route_place_id: "RP-1", route_id: "ROUTE-P", place_id: "PLC-PUBLISHED", status: "published" },
    { route_place_id: "RP-2", route_id: "ROUTE-P", place_id: "PLC-PUBLISHED", status: "hidden" },
    { route_place_id: "RP-3", route_id: "ROUTE-D", place_id: "PLC-PUBLISHED", status: "draft" },
    { route_place_id: "RP-4", route_id: "ROUTE-H", place_id: "PLC-PUBLISHED", status: "hidden" },
    { route_place_id: "RP-5", route_id: "ROUTE-A", place_id: "PLC-PUBLISHED", status: "archived" },
    { route_place_id: "RP-6", route_id: "ROUTE-X", place_id: "PLC-PUBLISHED", status: "published" },
    { route_place_id: "RP-7", route_id: "ROUTE-TEXT", place_id: "PLC-OTHER", status: "published" },
    { route_place_id: "RP-8", route_id: "ROUTE-D", place_id: "PLC-PUBLISHED", status: "deleted" }
  ];
  data.products = ["draft", "published", "hidden", "archived", "deleted"].map((status, index) => ({
    product_id: `PROD-${index}`, name_th: index === 0 ? "Product Draft" : "", name_en: index === 1 ? "Product Published" : "",
    related_place_id: "PLC-PUBLISHED", status, description_th: "PLC-PUBLISHED"
  })).concat([{ product_id: "PROD-TEXT", name_th: "PLC-PUBLISHED", name_en: "", related_place_id: "PLC-OTHER", status: "published" }]);
  data.events = ["draft", "published", "hidden", "archived", "deleted"].map((status, index) => ({
    event_id: `EVT-${index}`, title_th: index === 0 ? "Event Draft" : "", title_en: index === 1 ? "Event Published" : "",
    related_place_id: "PLC-PUBLISHED", status
  }));
  data.gallery = ["draft", "published", "hidden", "archived", "deleted"].map((status, index) => ({
    media_id: `MEDIA-${index}`, title_th: index === 0 ? "Gallery Draft" : "", title_en: index === 1 ? "Gallery Published" : "",
    related_place_id: "PLC-PUBLISHED", status
  })).concat([{ media_id: "MEDIA-MANIFEST", title_th: "Manifest only", title_en: "", related_place_id: "", status: "published", owner_place_id: "PLC-PUBLISHED" }]);
  data.trip_templates = ["draft", "published", "hidden", "archived", "deleted"].map((status, index) => ({
    template_id: `TRIP-${index}`, name_th: index === 0 ? "Trip Draft" : "", name_en: index === 1 ? "Trip Published" : "",
    place_ids: "OTHER| PLC-PUBLISHED | |PLC-PUBLISHED", status
  })).concat([{ template_id: "TRIP-OTHER", name_th: "PLC-PUBLISHED", name_en: "", place_ids: "PLC-PUBLISHED-X", status: "published" }]);
  data.reviews = [
    { review_id: "REV-A", place_id: "PLC-PUBLISHED", reviewer_name: "'=Unsafe", is_anonymous: false, status: "approved" },
    { review_id: "REV-H", place_id: "PLC-PUBLISHED", reviewer_name: "", is_anonymous: false, status: "hidden" },
    { review_id: "REV-P", place_id: "PLC-PUBLISHED", reviewer_name: "Named reviewer", is_anonymous: false, status: "pending" },
    { review_id: "REV-Z", place_id: "PLC-PUBLISHED", reviewer_name: "Secret", is_anonymous: true, status: "approved" },
    { review_id: "REV-X", place_id: "PLC-PUBLISHED", reviewer_name: "Deleted", is_anonymous: false, status: "deleted" }
  ];
  return data;
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
  const calls = { auth: [], reads: [], writes: [], fetches: [], propertyReads: [] };
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
      if (Object.prototype.hasOwnProperty.call(DEPENDENCY_HEADERS, name) && Array.isArray(data[name])) {
        return table(DEPENDENCY_HEADERS[name], data[name]);
      }
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
    PropertiesService: { getScriptProperties() { return {
      getProperty(key) {
        calls.propertyReads.push(key);
        if (options.propertyError) throw new Error("private property failure");
        if (key === "ADMIN_PLACE_MEDIA_MANIFEST_URL") return options.manifestUrl === undefined ? MEDIA_MANIFEST_URL : options.manifestUrl;
        if (key === "ADMIN_PLACE_MEDIA_ALLOWED_ORIGIN") return options.allowedOrigin === undefined ? MEDIA_ALLOWED_ORIGIN : options.allowedOrigin;
        return null;
      },
      setProperty: forbiddenWrite("setProperty"), deleteProperty: forbiddenWrite("deleteProperty")
    }; } },
    UrlFetchApp: { fetch(url, requestOptions) {
      calls.fetches.push({ url, requestOptions });
      if (options.fetchError) throw new Error("private manifest fetch failure");
      return {
        getResponseCode() { return options.responseCode === undefined ? 200 : options.responseCode; },
        getContentText() { return options.manifestText === undefined ? JSON.stringify(options.manifest || approvedManifest()) : options.manifestText; }
      };
    } },
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

function transactionFixture(action, options = {}) {
  if (action === "CREATE") return { places: [], drafts: [] };
  if (action === "UPDATE_DRAFT") {
    return {
      places: [place("TX-PLACE", { entity_version: 3, published_version: 2 })],
      drafts: options.updateDraftWithoutPrior ? [] : [draft("TX-PLACE", 3, 2, { name_th: "prior draft" })]
    };
  }
  if (action === "PUBLISH") {
    return {
      places: [place("TX-PLACE", { entity_version: 3, published_version: 2, name_th: "prior published", description_th: "prior public detail" })],
      drafts: [draft("TX-PLACE", 3, 2, {
        name_th: "publish candidate", short_description_th: "publish summary", description_th: "publish detail"
      })]
    };
  }
  if (action === "UNPUBLISH") {
    return {
      places: [place("TX-PLACE", { entity_version: 2, published_version: 2, name_th: "retained published" })],
      drafts: options.unpublishWithDraft ? [draft("TX-PLACE", 2, 2, { name_th: "preserved working draft" })] : []
    };
  }
  if (action === "ARCHIVE") {
    return {
      places: [place("TX-PLACE", options.archiveDraftSource ? { status: "draft", entity_version: 4, published_version: 0 } : { entity_version: 4, published_version: 3 })],
      drafts: options.archiveWithoutDraft ? [] : [draft("TX-PLACE", 4, options.archiveDraftSource ? 0 : 3, { name_th: "retained draft" })]
    };
  }
  if (action === "RESTORE") {
    return {
      places: [place("TX-PLACE", { status: "archived", entity_version: 4, published_version: 3 })],
      drafts: options.restoreWithDraft ? [draft("TX-PLACE", 4, 3, { name_th: "retained archived draft" })] : []
    };
  }
  throw new Error(`unknown synthetic action: ${action}`);
}

function loadTransactionBackend(action, options = {}) {
  const fixture = transactionFixture(action, options);
  if (options.createCollision) {
    fixture.places.push(place("PLC-12345678-1234-4234-8234-123456789abc"));
  }
  const makeSheet = (headers, rows) => ({
    headers: [...headers],
    rows: rows.map((record) => headers.map((header) => Object.prototype.hasOwnProperty.call(record, header) ? record[header] : "")),
    formulas: rows.map(() => new Set())
  });
  const sheets = {
    places: makeSheet(PLACE_HEADERS, fixture.places),
    place_drafts: makeSheet(DRAFT_HEADERS, fixture.drafts),
    activity_logs: makeSheet(AUDIT_HEADERS, []),
    routes: makeSheet(DEPENDENCY_HEADERS.routes, options.routes || []),
    route_places: makeSheet(DEPENDENCY_HEADERS.route_places, options.route_places || []),
    products: makeSheet(DEPENDENCY_HEADERS.products, options.products || []),
    events: makeSheet(DEPENDENCY_HEADERS.events, options.events || []),
    gallery: makeSheet(DEPENDENCY_HEADERS.gallery, options.gallery || []),
    trip_templates: makeSheet(DEPENDENCY_HEADERS.trip_templates, options.trip_templates || []),
    reviews: makeSheet(DEPENDENCY_HEADERS.reviews, options.reviews || [])
  };
  if (options.publishedFormulaField) sheets.places.formulas[0].add(options.publishedFormulaField);
  for (const [sheetName, cells] of Object.entries(options.formulaCells || {})) {
    const sheet = sheets[sheetName];
    assert.equal(Boolean(sheet && sheet.rows[0]), true, `formula fixture requires ${sheetName} row 0`);
    for (const [field, evaluatedValue] of Object.entries(cells)) {
      const column = sheet.headers.indexOf(field);
      assert.notEqual(column, -1, `formula fixture requires ${sheetName}.${field}`);
      sheet.rows[0][column] = evaluatedValue;
      sheet.formulas[0].add(field);
    }
  }
  if (options.dateCells) {
    sheets.places.rows.forEach((row) => { row[PLACE_HEADERS.indexOf("created_at")] = new Date("2026-08-01T00:00:00.000Z"); });
    sheets.place_drafts.rows.forEach((row) => { row[DRAFT_HEADERS.indexOf("created_at")] = new Date("2026-08-02T00:00:00.000Z"); });
  }
  if (options.unrelatedBusinessRows) {
    sheets.places.rows.push(PLACE_HEADERS.map((header) => place("OTHER-PLACE", { status: "draft", entity_version: 1, published_version: 0 })[header] ?? ""));
    sheets.places.formulas.push(new Set());
    sheets.place_drafts.rows.push(DRAFT_HEADERS.map((header) => draft("OTHER-PLACE", 1, 0)[header] ?? ""));
    sheets.place_drafts.formulas.push(new Set());
  }
  const properties = new Map([
    ["PLACE_PUBLIC_CACHE_EPOCH", "41"],
    ["ADMIN_PLACE_MEDIA_MANIFEST_URL", MEDIA_MANIFEST_URL],
    ["ADMIN_PLACE_MEDIA_ALLOWED_ORIGIN", MEDIA_ALLOWED_ORIGIN]
  ]);
  if (options.missingEpoch) properties.delete("PLACE_PUBLIC_CACHE_EPOCH");
  if (options.extraColumns) {
    sheets.places.headers.push("legacy_place_extra");
    sheets.places.rows.forEach((row) => row.push("preserve complete Place row"));
    sheets.place_drafts.headers.push("legacy_draft_extra");
    sheets.place_drafts.rows.forEach((row) => row.push("preserve complete draft row"));
  }
  if (options.preexistingAuditCollision) {
    const collision = {
      log_id: "AUDIT-0001", admin_id: "ADM-authoritative", action: action, entity_type: "place", entity_id: "TX-PLACE",
      description: "", created_at: "2026-08-01T00:00:00.000Z", audit_id: "AUDIT-0001",
      actor_admin_id: "ADM-authoritative", occurred_at: "2026-08-01T00:00:00.000Z"
    };
    sheets.activity_logs.rows.push(AUDIT_HEADERS.map((header) => collision[header]));
    sheets.activity_logs.formulas.push(new Set());
  }
  if (options.wrongAuditAppendRow) {
    const existing = {
      log_id: "AUDIT-EXISTING", admin_id: "ADM-existing", action: "CREATE", entity_type: "place", entity_id: "OTHER-PLACE",
      description: "preserve", created_at: "2026-07-01T00:00:00.000Z", audit_id: "AUDIT-EXISTING",
      actor_admin_id: "ADM-existing", occurred_at: "2026-07-01T00:00:00.000Z"
    };
    sheets.activity_logs.rows.push(AUDIT_HEADERS.map((header) => existing[header]));
    sheets.activity_logs.formulas.push(new Set());
  }
  const calls = { auth: [], reads: [], writes: [], events: [], sequence: [], propertyReads: [], propertyWrites: [], fetches: [] };
  const lock = {
    released: 0,
    tryLock(timeout) {
      calls.events.push(`tryLock:${timeout}`);
      calls.sequence.push(`tryLock:${timeout}`);
      if (options.throwTryLock) throw new Error("synthetic lock internals");
      this.held = !options.lockTimeout;
      return this.held;
    },
    releaseLock() {
      calls.events.push("releaseLock");
      this.released += 1;
      this.held = false;
      if (options.throwReleaseLock) throw new Error("synthetic release internals");
    }
  };
  let auditReadFailed = false;
  let auditSequence = 0;
  const defaultPlaceUuid = "12345678-1234-4234-8234-123456789ABC";
  const uuidSequence = [...(options.uuidSequence || (action === "CREATE" ? [defaultPlaceUuid] : []))];
  let epochWriteFailed = false;
  const runtime = { action, options, sheets, properties, calls, lock, phase: "action" };
  const readTable = (name, requiredHeaders) => {
    calls.reads.push({ name, requiredHeaders: [...requiredHeaders], phase: runtime.phase });
    calls.events.push(`read:${name}:${runtime.phase}`);
    if (name === "places" && options.changeLifecycleBeforeCapture &&
        calls.reads.filter((entry) => entry.name === "places").length === 2) {
      sheets.places.rows[0][PLACE_HEADERS.indexOf("status")] = "archived";
    }
    if (name === "activity_logs" && options.failAuditRead && !auditReadFailed && sheets.activity_logs.rows.length) {
      auditReadFailed = true;
      throw new Error("synthetic audit readback internals");
    }
    const sheet = sheets[name];
    if (!sheet) throw new Error("UNEXPECTED_READ");
    const headers = context.SheetService_normalizeHeaders_(sheet.headers);
    context.SheetService_assertUniqueHeaders_(headers, requiredHeaders);
    const result = {
      headers: [...headers],
      headerMap: Object.fromEntries(headers.map((header, index) => [header, index])),
      rows: sheet.rows.flatMap((row, index) => {
        if (!row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "")) return [];
        return [{
          sourceRowNumber: index + 2,
          values: Object.fromEntries(headers.map((header, column) => [
            header,
            options.cloneDateReads && row[column] instanceof Date ? new Date(row[column].getTime()) : row[column]
          ]))
        }];
      })
    };
    if (options.failFinalPublishVerification && runtime.auditAppended && runtime.phase === "action" && name === "places") {
      const target = result.rows.find((entry) => entry.values.place_id === "TX-PLACE");
      if (target) target.values.name_th = "synthetic final verification mismatch";
    }
    return result;
  };
  const sourceIndex = (sheet, sourceRowNumber) => {
    const index = sourceRowNumber - 2;
    if (!Number.isSafeInteger(index) || index < 0 || index >= sheet.rows.length) throw new Error("BAD_SOURCE_ROW");
    return index;
  };
  const context = {
    JSON, Object, Array, String, Number, Math, Date, RegExp, isFinite,
    AuthService_requireAdmin_(token) {
      calls.auth.push(token);
      calls.sequence.push("auth");
      if (options.authError) throw new Error(options.authError);
      return { admin_id: "ADM-authoritative", username: "operator", display_name: "Operator", role: options.role || "editor" };
    },
    LockService: { getScriptLock: () => lock },
    Utilities: {
      getUuid() {
        const value = uuidSequence.length ? uuidSequence.shift() : `AUDIT-${String(++auditSequence).padStart(4, "0")}`;
        calls.events.push(`uuid:${value}`);
        return value;
      }
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) {
            calls.propertyReads.push({ key, phase: runtime.phase });
            return properties.has(key) ? properties.get(key) : null;
          },
          setProperty(key, value) {
            calls.propertyWrites.push({ method: "setProperty", key, value, phase: runtime.phase });
            calls.events.push(`setProperty:${key}:${runtime.phase}`);
            if (options.failEpochWrite && value === "42" && !epochWriteFailed) {
              epochWriteFailed = true;
              throw new Error("synthetic epoch internals");
            }
            properties.set(key, String(value));
            if (options.failEpochWriteAfterWrite && value === "42" && !epochWriteFailed) {
              epochWriteFailed = true;
              throw new Error("synthetic post-write epoch internals");
            }
          },
          deleteProperty(key) {
            calls.propertyWrites.push({ method: "deleteProperty", key, phase: runtime.phase });
            calls.events.push(`deleteProperty:${key}:${runtime.phase}`);
            properties.delete(key);
          }
        };
      }
    },
    UrlFetchApp: { fetch(url, requestOptions) {
      calls.fetches.push({ url, requestOptions, phase: runtime.phase });
      if (options.fetchError) throw new Error("private manifest fetch failure");
      return {
        getResponseCode() { return options.responseCode === undefined ? 200 : options.responseCode; },
        getContentText() { return options.manifestText === undefined ? JSON.stringify(options.manifest || approvedManifest([
          approvedMedia("place-tx-place-gallery-a", "TX-PLACE"),
          approvedMedia("place-tx-place-gallery-b", "TX-PLACE")
        ])) : options.manifestText; }
      };
    } },
    SheetService_readTable_: readTable,
    SheetService_escapeHumanText_(value) {
      assert.equal(typeof value, "string");
      return /^[=+\-@]/.test(value) ? `'${value}` : value;
    },
    SheetService_appendObjectWithRow_(name, requiredHeaders, record) {
      calls.writes.push({ method: "append", name, record: plain(record), phase: runtime.phase });
      calls.events.push(`append:${name}:${runtime.phase}`);
      if (name === "activity_logs" && options.failAuditAppend) {
        runtime.phase = "restore";
        throw new Error("synthetic audit append internals");
      }
      const sheet = sheets[name];
      for (const header of requiredHeaders) assert.equal(sheet.headers.includes(header), true);
      const row = sheet.headers.map((header) => Object.prototype.hasOwnProperty.call(record, header) ? record[header] : "");
      sheet.rows.push(row);
      sheet.formulas.push(new Set());
      if (name === "places" && options.failPlaceAppendAfterWrite) throw new Error("synthetic Place append internals");
      if (name === "place_drafts" && options.failDraftAppendAfterWrite) throw new Error("synthetic draft append internals");
      if (name === "place_drafts" && options.corruptActionDraftBase && runtime.phase === "action") {
        row[sheet.headers.indexOf("base_published_version")] = 777;
      }
      if (name === "activity_logs" && options.failAuditAppendAfterWrite) {
        runtime.phase = "restore";
        throw new Error("synthetic post-write audit append internals");
      }
      if (name === "activity_logs" && options.corruptAuditIdReadback) {
        row[sheet.headers.indexOf("audit_id")] = "AUDIT-CORRUPTED";
      }
      if (name === "activity_logs" && options.corruptAuditDescriptionReadback) {
        row[sheet.headers.indexOf("description")] = "CORRUPTED DESCRIPTION";
      }
      if (name === "activity_logs" && options.corruptAuditReadback) {
        row[sheet.headers.indexOf("admin_id")] = "ADM-corrupted";
      }
      if (name === "activity_logs") runtime.auditAppended = true;
      return {
        sourceRowNumber: (name === "activity_logs" && options.wrongAuditAppendRow) || (name === "places" && options.wrongPlaceAppendRow) ?
          2 : sheet.rows.length + 1,
        values: Object.fromEntries(sheet.headers.map((header, index) => [header, row[index]]))
      };
    },
    SheetService_updateObjectAtRow_(name, sourceRowNumber, record) {
      calls.writes.push({ method: "update", name, sourceRowNumber, record: plain(record), phase: runtime.phase });
      calls.events.push(`update:${name}:${runtime.phase}`);
      if (options.failRestoreWrite && runtime.phase === "restore") throw new Error("synthetic restore internals");
      const sheet = sheets[name];
      const index = sourceIndex(sheet, sourceRowNumber);
      const row = sheet.rows[index];
      if (options.noOpActionUpdate && runtime.phase === "action") return;
      for (const [field, value] of Object.entries(record)) {
        row[sheet.headers.indexOf(field)] = value;
        sheet.formulas[index].delete(field);
        const boundary = options.failActionUpdateAfterField;
        if (runtime.phase === "action" && boundary && boundary.sheetName === name && boundary.field === field) {
          runtime.phase = "restore";
          throw new Error("synthetic per-field update boundary");
        }
      }
      if (name === "place_drafts" && options.corruptDraftAfterUpdate && runtime.phase === "action" &&
          Object.prototype.hasOwnProperty.call(record, "updated_by")) {
        row[sheet.headers.indexOf("description_th")] = "synthetic corrupted draft readback";
        runtime.phase = "restore";
      }
      if (name === "places" && options.failPlaceUpdateAfterWrite && runtime.phase === "action") {
        runtime.phase = "restore";
        throw new Error("synthetic post-Place update internals");
      }
    },
    SheetService_replaceObjectAtRow_(name, sourceRowNumber, record) {
      calls.writes.push({ method: "replace", name, sourceRowNumber, record: plain(record), phase: runtime.phase });
      calls.events.push(`replace:${name}:${runtime.phase}`);
      if (options.failRestoreWrite && runtime.phase === "restore") throw new Error("synthetic restore internals");
      const sheet = sheets[name];
      const index = sourceIndex(sheet, sourceRowNumber);
      const row = sheet.rows[index];
      if (options.noOpActionReplace && runtime.phase === "action") return { sourceRowNumber, values: plain(record) };
      sheet.formulas[index].clear();
      for (const [field, value] of Object.entries(record)) row[sheet.headers.indexOf(field)] = value;
      if (name === "places" && options.failPlaceReplaceAfterWrite && runtime.phase === "action") {
        runtime.phase = "restore";
        throw new Error("synthetic post-Place replace internals");
      }
      return { sourceRowNumber, values: plain(record) };
    },
    SheetService_clearRow_(name, sourceRowNumber) {
      calls.writes.push({ method: "clear", name, sourceRowNumber, phase: runtime.phase });
      calls.events.push(`clear:${name}:${runtime.phase}`);
      if (options.failRestoreWrite && runtime.phase === "restore") throw new Error("synthetic restore internals");
      const sheet = sheets[name];
      const index = sourceIndex(sheet, sourceRowNumber);
      const row = sheet.rows[index];
      row.fill("");
      sheet.formulas[index].clear();
      if (options.incompleteActionClear && runtime.phase === "action") row[row.length - 1] = "action clear residue";
      if (options.failDraftClearAfterWrite && runtime.phase === "action" && name === "place_drafts") {
        runtime.phase = "restore";
        throw new Error("synthetic post-draft-clear internals");
      }
      if (options.incompleteClear && runtime.phase === "restore") row[row.length - 1] = "rollback residue";
    }
  };
  vm.createContext(context);
  const businessMocks = Object.fromEntries(Object.entries(context).filter(([name]) => name.startsWith("SheetService_")));
  vm.runInContext(read("apps-script/SheetService.gs"), context, { filename: "apps-script/SheetService.gs" });
  const actualAppend = context.SheetService_appendObjectWithRow_;
  Object.assign(context, businessMocks);
  const handles = {};
  context.SheetService_getSheet_ = (name) => {
    if (!sheets[name]) throw new Error("missing sheet");
    if (!handles[name]) handles[name] = {
      getName: () => name,
      getLastRow: () => {
        const rows = sheets[name].rows;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].some((v) => v !== "" && v != null) || sheets[name].formulas[i]?.size) return i + 2;
        }
        return 1;
      },
      getLastColumn: () => sheets[name].headers.length,
      getRange(row, column, height, width) {
        return {
          getValues() {
            assert.equal(row, 1);
            return [sheets[name].headers.slice(column - 1, column - 1 + width)];
          },
          getNumberFormats() {
            assert.equal(lock.held, true);
            assert.equal(calls.events.includes("tryLock:10000"), true);
            calls.events.push(`formats:${name}`);
            calls.formatReads = calls.formatReads || [];
            calls.formatReads.push({ name, row, column, height, width });
            if (options.formatRead) return options.formatRead(name, row, width, runtime);
            return [Array(width).fill("0.###############")];
          },
          setValues(values) {
            assert.equal(row, handles[name].getLastRow() + 1);
            runtime.appendResult = businessMocks.SheetService_appendObjectWithRow_(name, [],
              Object.fromEntries(sheets[name].headers.map((header, i) => [header, values[0][i]])));
          }
        };
      }
    };
    return handles[name];
  };
  context.SheetService_appendObjectWithRow_ = (name, headers, record, prepared) => {
    if (!prepared) return businessMocks.SheetService_appendObjectWithRow_(name, headers, record);
    actualAppend(name, headers, record, prepared);
    return runtime.appendResult;
  };
  vm.runInContext(read("apps-script/AdminPlaceSchema.gs"), context, { filename: "apps-script/AdminPlaceSchema.gs" });
  vm.runInContext(read("apps-script/Config.gs"), context, { filename: "apps-script/Config.gs" });
  vm.runInContext(read("apps-script/PlaceService.gs"), context, { filename: "apps-script/PlaceService.gs" });
  vm.runInContext(options.serviceSource || read("apps-script/AdminPlaceService.gs"), context, { filename: "apps-script/AdminPlaceService.gs" });
  runtime.context = context;
  return runtime;
}

function transactionBefore(runtime) {
  return {
    places: runtime.sheets.places.rows.map((row) => [...row]),
    drafts: runtime.sheets.place_drafts.rows.map((row) => [...row]),
    activity: runtime.sheets.activity_logs.rows.map((row) => [...row]),
    formulas: {
      places: runtime.sheets.places.formulas.map((fields) => [...fields].sort()),
      place_drafts: runtime.sheets.place_drafts.formulas.map((fields) => [...fields].sort()),
      activity_logs: runtime.sheets.activity_logs.formulas.map((fields) => [...fields].sort())
    },
    epoch: runtime.properties.get("PLACE_PUBLIC_CACHE_EPOCH")
  };
}

function assertRestored(runtime, before) {
  for (const [name, expected] of [["places", before.places], ["place_drafts", before.drafts]]) {
    const rows = runtime.sheets[name].rows;
    assert.deepEqual(rows.slice(0, expected.length), expected, `${name} full pre-state must be restored`);
    for (const row of rows.slice(expected.length)) {
      assert.equal(row.every((cell) => cell === ""), true, `${name} allocated compensation row must be fully blank`);
    }
  }
  assert.equal(runtime.properties.get("PLACE_PUBLIC_CACHE_EPOCH"), before.epoch);
  assert.deepEqual(runtime.sheets.activity_logs.rows.slice(0, before.activity.length), before.activity);
  for (const row of runtime.sheets.activity_logs.rows.slice(before.activity.length)) {
    assert.equal(row.every((cell) => cell === ""), true, "failed audit append must leave its allocated row blank");
  }
  for (const name of ["places", "place_drafts", "activity_logs"]) {
    const actual = runtime.sheets[name].formulas.map((fields) => [...fields].sort());
    const expected = before.formulas[name];
    assert.deepEqual(actual.slice(0, expected.length), expected, `${name} physical formulas must be restored`);
    for (const fields of actual.slice(expected.length)) assert.deepEqual(fields, [], `${name} compensated rows must contain no formulas`);
  }
}

function callCreate(runtime, content = writeContent(), payloadOverrides = {}) {
  return plain(runtime.context.adminCreatePlace_("TOKEN", { content, ...payloadOverrides }));
}

function callSave(runtime, content = writeContent(), payloadOverrides = {}) {
  return plain(runtime.context.adminSavePlaceDraft_("TOKEN", {
    place_id: "TX-PLACE", expected_version: 3, content, ...payloadOverrides
  }));
}

function callPublish(runtime, payloadOverrides = {}) {
  return plain(runtime.context.adminPublishPlace_("TOKEN", {
    place_id: "TX-PLACE", expected_version: 3, ...payloadOverrides
  }));
}

function callLifecycle(runtime, action, payloadOverrides = {}) {
  const payload = { place_id: "TX-PLACE", expected_version: action === "UNPUBLISH" ? 2 : 4, ...payloadOverrides };
  if (action === "ARCHIVE" && !Object.prototype.hasOwnProperty.call(payload, "confirmed")) payload.confirmed = true;
  return plain(runtime.context[`admin${action[0]}${action.slice(1).toLowerCase()}Place_`]("TOKEN", payload));
}

function populatedRows(runtime, sheetName) {
  const sheet = runtime.sheets[sheetName];
  return sheet.rows.filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""));
}

function sheetRecord(runtime, sheetName, index = 0) {
  const sheet = runtime.sheets[sheetName];
  return Object.fromEntries(sheet.headers.map((header, column) => [header, sheet.rows[index][column]]));
}

function publicPlaceDetail(runtime, placeId = "TX-PLACE") {
  const rows = populatedRows(runtime, "places").map((_row, index) => sheetRecord(runtime, "places", index));
  const publicContext = { JSON, Object, Array, String, Number, Math, Date, isFinite, CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) } };
  vm.createContext(publicContext);
  vm.runInContext(read("apps-script/PlaceService.gs"), publicContext, { filename: "apps-script/PlaceService.gs" });
  return plain(publicContext.buildPlaceDetailResponse_(rows, { place_id: placeId, lang: "th" }));
}

function completeSyntheticRow(headers, record) {
  return Object.fromEntries(headers.map((header) => [
    header, Object.prototype.hasOwnProperty.call(record, header) ? record[header] : ""
  ]));
}

function assertSyntheticIntendedRow(table, expected, label) {
  const matches = table.rows.filter((entry) => entry.values.place_id === "TX-PLACE");
  if (expected && expected.absent) {
    assert.equal(matches.length, 0, `${label} must have zero target-ID matches`);
    assert.equal(
      table.rows.some((entry) => entry.sourceRowNumber === expected.sourceRowNumber),
      false,
      `${label} prior physical source row must be fully blank`
    );
    return;
  }
  if (expected === null) {
    assert.equal(matches.length, 0, `${label} must be absent`);
    return;
  }
  assert.equal(matches.length, 1, `${label} must have exact cardinality`);
  assert.equal(matches[0].sourceRowNumber, expected.sourceRowNumber, `${label} must retain intended source-row provenance`);
  assert.deepEqual(Object.keys(expected.values), table.headers, `${label} expected row must cover every physical header`);
  for (const header of table.headers) {
    const actualCell = matches[0].values[header];
    const expectedCell = expected.values[header];
    const sameCell = actualCell === expectedCell ||
      (actualCell instanceof Date && expectedCell instanceof Date && actualCell.getTime() === expectedCell.getTime());
    assert.equal(sameCell, true, `${label}.${header} must exactly match intended state`);
  }
}

function syntheticWrite(runtime, action, placeEntry, draftEntry, state) {
  const { context } = runtime;
  if (action === "CREATE") {
    const placeRecord = place("TX-PLACE", { status: "draft", entity_version: 1, published_version: 0 });
    const createdPlace = context.SheetService_appendObjectWithRow_("places", PLACE_HEADERS, placeRecord);
    state.allocated_rows.place = createdPlace.sourceRowNumber;
    if (runtime.options.failurePoint === "afterPlace") throw new Error("synthetic partial Place write");
    const draftRecord = draft("TX-PLACE", 1, 0);
    const createdDraft = context.SheetService_appendObjectWithRow_("place_drafts", DRAFT_HEADERS, draftRecord);
    state.allocated_rows.draft = createdDraft.sourceRowNumber;
    return {
      place: { sourceRowNumber: createdPlace.sourceRowNumber, values: completeSyntheticRow(runtime.sheets.places.headers, placeRecord) },
      draft: { sourceRowNumber: createdDraft.sourceRowNumber, values: completeSyntheticRow(runtime.sheets.place_drafts.headers, draftRecord) }
    };
  }
  const placePatch = {
    entity_version: 99, status: action === "RESTORE" || action === "UNPUBLISH" ? "draft" : action === "ARCHIVE" ? "archived" : "published",
    name_th: `mutated ${action}`, updated_at: "2099-01-01T00:00:00.000Z", updated_by: "ADM-mutated"
  };
  context.SheetService_replaceObjectAtRow_("places", placeEntry.sourceRowNumber, placePatch);
  const intendedPlace = { sourceRowNumber: placeEntry.sourceRowNumber, values: { ...placeEntry.values, ...placePatch } };
  if (runtime.options.failurePoint === "afterPlace") throw new Error("synthetic partial Place write");
  let intendedDraft = null;
  if (action === "PUBLISH") {
    context.SheetService_clearRow_("place_drafts", draftEntry.sourceRowNumber);
    intendedDraft = { absent: true, sourceRowNumber: draftEntry.sourceRowNumber };
  } else if (draftEntry) {
    const draftPatch = {
      draft_version: 99, name_th: `mutated ${action}`, updated_by: "ADM-mutated"
    };
    context.SheetService_replaceObjectAtRow_("place_drafts", draftEntry.sourceRowNumber, draftPatch);
    intendedDraft = { sourceRowNumber: draftEntry.sourceRowNumber, values: { ...draftEntry.values, ...draftPatch } };
  } else if (action === "UPDATE_DRAFT" || action === "UNPUBLISH" || action === "RESTORE") {
    const draftRecord = draft("TX-PLACE", 99, action === "RESTORE" ? 3 : 2);
    const createdDraft = context.SheetService_appendObjectWithRow_("place_drafts", DRAFT_HEADERS, draftRecord);
    state.allocated_rows.draft = createdDraft.sourceRowNumber;
    intendedDraft = {
      sourceRowNumber: createdDraft.sourceRowNumber,
      values: completeSyntheticRow(runtime.sheets.place_drafts.headers, draftRecord)
    };
  }
  return { place: intendedPlace, draft: intendedDraft };
}

function runSyntheticTransaction(runtime, options = {}) {
  const { context, action } = runtime;
  return plain(context.AdminPlaceService_execute_("TOKEN", function (admin) {
    return context.AdminPlaceService_withWriteLock_(function () {
      const placeTable = context.SheetService_readTable_("places", PLACE_HEADERS);
      const draftTable = context.SheetService_readTable_("place_drafts", DRAFT_HEADERS);
      const placeEntry = placeTable.rows.find((entry) => entry.values.place_id === "TX-PLACE") || null;
      const draftEntry = draftTable.rows.find((entry) => entry.values.place_id === "TX-PLACE") || null;
      if (action !== "CREATE") {
        const actual = Number(placeEntry.values.entity_version);
        const expected = Object.prototype.hasOwnProperty.call(options, "expectedVersion") ? options.expectedVersion : actual;
        if (draftEntry) {
          context.AdminPlaceService_requireExpectedVersion_(expected, actual, Number(draftEntry.values.base_published_version), Number(placeEntry.values.published_version));
        } else {
          context.AdminPlaceService_requireExpectedVersion_(expected, actual);
        }
      }
      const state = context.AdminPlaceService_captureState_("TX-PLACE", Boolean(options.includeEpoch));
      try {
        const intended = syntheticWrite(runtime, action, placeEntry, draftEntry, state);
        const intendedPlaceTable = context.SheetService_readTable_("places", PLACE_HEADERS);
        const intendedDraftTable = context.SheetService_readTable_("place_drafts", DRAFT_HEADERS);
        assertSyntheticIntendedRow(intendedPlaceTable, intended.place, `${action} Place row`);
        assertSyntheticIntendedRow(intendedDraftTable, intended.draft, `${action} draft row`);
        if (options.includeEpoch) {
          context.PropertiesService.getScriptProperties().setProperty("PLACE_PUBLIC_CACHE_EPOCH", "42");
        }
        if (runtime.options.failurePoint === "afterMutation") throw new Error("synthetic action failure");
        context.AdminPlaceService_appendVerifiedAudit_(admin, action, "TX-PLACE");
        return context.AdminPlaceService_success_({ place_id: "TX-PLACE", status: "draft" });
      } catch (error) {
        runtime.phase = "restore";
        return context.AdminPlaceService_failClosed_(state);
      }
    });
  }));
}

function test(name, fn) {
  if (focus && !name.toLowerCase().includes(focus)) return;
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

function inspect(runtime, payload = { place_id: "PLC-PUBLISHED" }) {
  return plain(runtime.context.adminInspectPlaceDependencies_("TOKEN", payload));
}

test("Task 14 exports dependency lifecycle and read-only media actions but no later action", () => {
  const create = loadTransactionBackend("CREATE");
  assert.equal(typeof create.context.adminCreatePlace_, "function");
  assert.equal(typeof create.context.adminSavePlaceDraft_, "function");
  assert.equal(typeof create.context.adminPublishPlace_, "function");
  assert.equal(typeof create.context.adminInspectPlaceDependencies_, "function");
  for (const action of ["adminUnpublishPlace_", "adminArchivePlace_", "adminRestorePlace_"]) {
    assert.equal(typeof create.context[action], "function", action);
  }
  assert.equal(typeof create.context.adminGetPlaceMediaOptions_, "function");
});

test("media options authorize every Admin role and return only exact same-Place Gallery safe projections", () => {
  const items = [
    approvedMedia("place-plc-published-gallery-b", "PLC-PUBLISHED", "gallery", { alt_th: "B" }),
    approvedMedia("place-plc-published-cover", "PLC-PUBLISHED", "cover", { fallback: "assets/media/placeholders/cover.svg" }),
    approvedMedia("place-plc-other-gallery-a", "PLC-OTHER"),
    approvedMedia("place-plc-published-gallery-a", "PLC-PUBLISHED", "gallery", { alt_th: "A" })
  ];
  for (const role of ["super_admin", "editor", "reviewer", "viewer"]) {
    const runtime = loadBackend({ role, manifest: approvedManifest(items) });
    const result = plain(runtime.context.adminGetPlaceMediaOptions_("TOKEN", { place_id: "PLC-PUBLISHED", role: "gallery", page: 1, page_size: 20 }));
    assert.equal(result.ok, true, role);
    assert.deepEqual(result.data.items.map((item) => item.media_id), ["place-plc-published-gallery-a", "place-plc-published-gallery-b"]);
    assert.deepEqual(Object.keys(result.data), ["items", "page", "page_size", "total", "total_pages"]);
    for (const item of result.data.items) {
      assert.deepEqual(Object.keys(item), ["media_id", "entity_type", "entity_id", "role", "alt_th", "alt_en", "fallback", "outputs"]);
      assert.deepEqual(Object.keys(item.outputs[0]), ["width", "height", "path"]);
    }
    assert.equal(/source_file|bytes|sha256|media-source/.test(JSON.stringify(result)), false);
    assert.deepEqual(runtime.calls.writes, []);
    assert.equal(runtime.calls.fetches.length, 1);
    assert.deepEqual(runtime.calls.propertyReads, ["ADMIN_PLACE_MEDIA_MANIFEST_URL", "ADMIN_PLACE_MEDIA_ALLOWED_ORIGIN"]);
  }
});

test("media options reject unknown Place noncanonical requests and manifest authority failures safely and without retry", () => {
  for (const payload of [
    {}, { place_id: "../PLC" }, { place_id: "PLC-PUBLISHED", manifest_url: MEDIA_MANIFEST_URL },
    { place_id: "PLC-PUBLISHED", role: "hero" }, { place_id: "PLC-PUBLISHED", page_size: 101 }
  ]) {
    const runtime = loadBackend();
    assertError(plain(runtime.context.adminGetPlaceMediaOptions_("TOKEN", payload)), "VALIDATION_ERROR");
    assert.equal(runtime.calls.fetches.length, 0);
  }
  const missing = loadBackend();
  assertError(plain(missing.context.adminGetPlaceMediaOptions_("TOKEN", { place_id: "PLC-MISSING" })), "NOT_FOUND");
  assert.equal(missing.calls.fetches.length, 0);
  for (const options of [
    { manifestUrl: "http://www.takhuntrip.example/manifest.json" },
    { manifestUrl: "https://evil.example/manifest.json" },
    { allowedOrigin: "https://evil.example" }, { fetchError: true }, { responseCode: 503 },
    { manifestText: "not-json" }, { manifest: { version: 2, items: [] } },
    { manifest: { version: 1, items: [approvedMedia("bad_id", "PLC-PUBLISHED")] } }
  ]) {
    const runtime = loadBackend(options);
    assertError(plain(runtime.context.adminGetPlaceMediaOptions_("TOKEN", { place_id: "PLC-PUBLISHED" })), "SERVER_ERROR");
    assert.equal(runtime.calls.fetches.length <= 1, true);
    assert.deepEqual(runtime.calls.writes, []);
  }
});

test("Save Draft persists exact authoritative Gallery order and rejects invalid Gallery before mutation", () => {
  const valid = loadTransactionBackend("UPDATE_DRAFT");
  const result = callSave(valid, writeContent({ gallery_media_ids: ["place-tx-place-gallery-b", "place-tx-place-gallery-a"] }));
  assert.equal(result.ok, true);
  assert.equal(sheetRecord(valid, "place_drafts").gallery_media_ids, "place-tx-place-gallery-b|place-tx-place-gallery-a");
  assert.equal(valid.calls.propertyWrites.some((entry) => entry.key === "PLACE_PUBLIC_CACHE_EPOCH"), false);
  assert.equal(valid.calls.fetches.length, 1);

  const invalidValues = [
    ["place-tx-place-gallery-a", "place-tx-place-gallery-a"],
    Array.from({ length: 51 }, (_value, index) => `place-tx-place-gallery-${index + 1}`),
    ["place-tx-place-cover"], ["place-other-gallery-a"], ["unknown-gallery"], ["Gallery-A"],
    ["https://example.test/a.webp"], "place-tx-place-gallery-a|place-tx-place-gallery-b"
  ];
  for (const gallery_media_ids of invalidValues) {
    const runtime = loadTransactionBackend("UPDATE_DRAFT");
    const before = transactionBefore(runtime);
    assertError(callSave(runtime, writeContent({ gallery_media_ids })), "VALIDATION_ERROR");
    assertRestored(runtime, before);
    assert.equal(runtime.calls.writes.length, 0, JSON.stringify(gallery_media_ids));
  }
});

test("Create forbids nonempty Gallery before identity and Publish revalidates Gallery before mutation", () => {
  const create = loadTransactionBackend("CREATE");
  assertError(callCreate(create, writeContent({ gallery_media_ids: ["place-temp-gallery-a"] })), "VALIDATION_ERROR");
  assert.deepEqual(create.calls.writes, []);
  assert.deepEqual(create.calls.fetches, []);

  const valid = loadTransactionBackend("PUBLISH");
  valid.sheets.place_drafts.rows[0][DRAFT_HEADERS.indexOf("gallery_media_ids")] = "place-tx-place-gallery-b|place-tx-place-gallery-a";
  assert.equal(callPublish(valid).ok, true);
  assert.equal(sheetRecord(valid, "places").gallery_media_ids, "place-tx-place-gallery-b|place-tx-place-gallery-a");
  assert.equal(valid.calls.fetches.length, 1);
  assert.equal(valid.calls.propertyWrites.filter((entry) => entry.key === "PLACE_PUBLIC_CACHE_EPOCH").length, 1);

  const rejected = loadTransactionBackend("PUBLISH", { manifest: approvedManifest([approvedMedia("place-tx-place-gallery-a", "TX-PLACE")]) });
  rejected.sheets.place_drafts.rows[0][DRAFT_HEADERS.indexOf("gallery_media_ids")] = "place-tx-place-gallery-b";
  const before = transactionBefore(rejected);
  assertError(callPublish(rejected), "VALIDATION_ERROR");
  assertRestored(rejected, before);
  assert.equal(populatedRows(rejected, "activity_logs").length, 0);
});

test("Gallery authority mutation proofs reject same-Place role and serialization bypasses", () => {
  const source = adminPlaceServiceSource;
  const authorityCases = [
    {
      label: "same Place",
      source: source.replace(
        'if (!item || item.entity_type !== "place" || item.entity_id !== placeId || item.role !== "gallery") {',
        'if (!item || item.entity_type !== "place" || false || item.role !== "gallery") {'
      ),
      manifest: approvedManifest([approvedMedia("place-other-gallery-a", "PLC-OTHER")]),
      ids: ["place-other-gallery-a"]
    },
    {
      label: "Gallery role",
      source: source.replace(
        'if (!item || item.entity_type !== "place" || item.entity_id !== placeId || item.role !== "gallery") {',
        'if (!item || item.entity_type !== "place" || item.entity_id !== placeId || false) {'
      ),
      manifest: approvedManifest([approvedMedia("place-tx-place-cover", "TX-PLACE", "cover", { fallback: "assets/media/placeholders/cover.svg" })]),
      ids: ["place-tx-place-cover"]
    }
  ];
  for (const item of authorityCases) {
    assert.notEqual(item.source, source, `${item.label} mutation target must match`);
    const runtime = loadTransactionBackend("UPDATE_DRAFT", { serviceSource: item.source, manifest: item.manifest });
    assert.throws(() => {
      assertError(callSave(runtime, writeContent({ gallery_media_ids: item.ids })), "VALIDATION_ERROR");
      assert.equal(runtime.calls.writes.length, 0);
    }, undefined, `${item.label} mutant must be rejected by executable behavior`);
  }

  const serializationBypass = source.replace(
    'if (mediaIds && (parts.length > 50 || parts.join("|") !== value)) throw new Error("ADMIN_PLACE_LIST");',
    'if (mediaIds && parts.length > 50) throw new Error("ADMIN_PLACE_LIST");'
  );
  assert.notEqual(serializationBypass, source, "serialization mutation target must match");
  const runtime = loadTransactionBackend("PUBLISH", { serviceSource: serializationBypass });
  runtime.sheets.place_drafts.rows[0][DRAFT_HEADERS.indexOf("gallery_media_ids")] = " place-tx-place-gallery-a";
  assert.throws(() => {
    assertError(callPublish(runtime), "VALIDATION_ERROR");
    assert.equal(runtime.calls.writes.length, 0);
  }, undefined, "noncanonical serialization mutant must be rejected by executable behavior");
});

test("dependencies authorize all Admin roles and reject fake role invalid session and noncanonical payloads", () => {
  for (const role of ["super_admin", "editor", "reviewer", "viewer"]) {
    const runtime = loadBackend({ role, data: dependencyFixtures() });
    assert.equal(inspect(runtime, { place_id: "PLC-PUBLISHED", role: "super_admin" }).error.code, "VALIDATION_ERROR");
    assert.equal(inspect(runtime).ok, true, role);
    assert.deepEqual(runtime.calls.auth, ["TOKEN", "TOKEN"]);
  }
  assertError(inspect(loadBackend({ authError: "UNAUTHORIZED", data: dependencyFixtures() })), "UNAUTHORIZED");
  for (const payload of [{}, { place_id: 1 }, { place_id: " PLC-PUBLISHED" }, { place_id: "../PLC" }, { place_id: "PLC-PUBLISHED", confirmed: true }]) {
    assertError(inspect(loadBackend({ data: dependencyFixtures() }), payload), "VALIDATION_ERROR");
  }
});

test("dependencies return exactly seven safe deduplicated sorted authoritative groups", () => {
  const data = dependencyFixtures();
  const before = JSON.stringify(data);
  const runtime = loadBackend({ data });
  const first = inspect(runtime);
  const second = inspect(runtime);
  assert.equal(first.ok, true);
  assert.deepEqual(Object.keys(first.data), ["place_id", "checked_at", "groups"]);
  assert.equal(first.data.place_id, "PLC-PUBLISHED");
  assert.match(first.data.checked_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(first.data.checked_at.length, 24);
  assert.deepEqual(Object.keys(first.data.groups), DEPENDENCY_GROUPS);
  assert.deepEqual(first.data.groups.routes, [
    { entity_id: "ROUTE-A", label: "Route Archived" },
    { entity_id: "ROUTE-D", label: "Route Draft" },
    { entity_id: "ROUTE-H", label: "ROUTE-H" },
    { entity_id: "ROUTE-P", label: "Route Published" }
  ]);
  assert.deepEqual(first.data.groups.nearby_places, [
    { entity_id: "PLC-NEAR-A", label: "Nearby A" },
    { entity_id: "PLC-NEAR-B", label: "Nearby B" },
    { entity_id: "PLC-NEAR-C", label: "PLC-NEAR-C" }
  ]);
  assert.deepEqual(first.data.groups.products, [
    { entity_id: "PROD-0", label: "Product Draft" }, { entity_id: "PROD-1", label: "Product Published" },
    { entity_id: "PROD-2", label: "PROD-2" }, { entity_id: "PROD-3", label: "PROD-3" }
  ]);
  assert.deepEqual(first.data.groups.events, [
    { entity_id: "EVT-0", label: "Event Draft" }, { entity_id: "EVT-1", label: "Event Published" },
    { entity_id: "EVT-2", label: "EVT-2" }, { entity_id: "EVT-3", label: "EVT-3" }
  ]);
  assert.deepEqual(first.data.groups.gallery, [
    { entity_id: "MEDIA-0", label: "Gallery Draft" }, { entity_id: "MEDIA-1", label: "Gallery Published" },
    { entity_id: "MEDIA-2", label: "MEDIA-2" }, { entity_id: "MEDIA-3", label: "MEDIA-3" }
  ]);
  assert.deepEqual(first.data.groups.trip_templates, [
    { entity_id: "TRIP-0", label: "Trip Draft" }, { entity_id: "TRIP-1", label: "Trip Published" },
    { entity_id: "TRIP-2", label: "TRIP-2" }, { entity_id: "TRIP-3", label: "TRIP-3" }
  ]);
  assert.deepEqual(first.data.groups.reviews, [
    { entity_id: "REV-A", label: "=Unsafe" },
    { entity_id: "REV-H", label: "REV-H" },
    { entity_id: "REV-P", label: "Named reviewer" },
    { entity_id: "REV-Z", label: "\u0e19\u0e31\u0e01\u0e17\u0e48\u0e2d\u0e07\u0e40\u0e17\u0e35\u0e48\u0e22\u0e27" }
  ]);
  for (const key of DEPENDENCY_GROUPS) {
    for (const item of first.data.groups[key]) assert.deepEqual(Object.keys(item), ["entity_id", "label"]);
    assert.deepEqual(first.data.groups[key].map((item) => item.entity_id), [...first.data.groups[key].map((item) => item.entity_id)].sort());
  }
  assert.equal(/sourceRowNumber|route_place_id|status|sheet|count|total|owner_place_id/i.test(JSON.stringify(first.data)), false);
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(second.data.groups, first.data.groups);
  assert.equal(runtime.calls.writes.length, 0);
  const readsByName = runtime.calls.reads.reduce((counts, entry) => ({ ...counts, [entry.name]: (counts[entry.name] || 0) + 1 }), {});
  for (const name of ["places", ...Object.keys(DEPENDENCY_HEADERS)]) assert.equal(readsByName[name], 2, `${name} once per inspection`);
});

test("dependencies enforce exact status boundaries and ignore every non-source", () => {
  const data = dependencyFixtures();
  const result = inspect(loadBackend({ data }));
  assert.equal(result.ok, true);
  const serialized = JSON.stringify(result.data.groups);
  for (const excluded of ["ROUTE-X", "ROUTE-TEXT", "PROD-4", "PROD-TEXT", "EVT-4", "MEDIA-4", "MEDIA-MANIFEST", "TRIP-4", "TRIP-OTHER", "REV-X"]) {
    assert.equal(serialized.includes(excluded), false, excluded);
  }
  assert.equal(serialized.includes("PLC-PUBLISHED-X"), false);
});

test("dependencies fail closed for unknown duplicate malformed unsupported and orphan authoritative state", () => {
  const cases = [
    ["unknown Place", (data) => data, { place_id: "PLC-MISSING" }, "NOT_FOUND"],
    ["duplicate Place", (data) => data.places.push({ ...data.places[0] }), null, "SERVER_ERROR"],
    ["malformed Place", (data) => { data.places[1].place_id = "bad id"; }, null, "SERVER_ERROR"],
    ["legacy Place", (data) => { data.places[1].status = "hidden"; }, null, "SERVER_ERROR"],
    ["deleted legacy Place", (data) => { data.places[1].status = "deleted"; }, null, "SERVER_ERROR"],
    ["duplicate Route", (data) => data.routes.push({ ...data.routes[0] }), null, "SERVER_ERROR"],
    ["duplicate Product", (data) => data.products.push({ ...data.products[0] }), null, "SERVER_ERROR"],
    ["malformed relationship identity", (data) => { data.route_places[0].route_place_id = "bad id"; }, null, "SERVER_ERROR"],
    ["orphan Route edge", (data) => data.route_places.push({ route_place_id: "RP-X", route_id: "ROUTE-MISSING", place_id: "PLC-PUBLISHED", status: "published" }), null, "SERVER_ERROR"],
    ["malformed scalar", (data) => { data.products[0].related_place_id = "bad id"; }, null, "SERVER_ERROR"],
    ["malformed list", (data) => { data.trip_templates[0].place_ids = "PLC-PUBLISHED|bad id"; }, null, "SERVER_ERROR"],
    ["non-string list", (data) => { data.trip_templates[0].place_ids = ["PLC-PUBLISHED"]; }, null, "SERVER_ERROR"],
    ["deleted non-string list", (data) => { data.trip_templates[4].place_ids = ["PLC-PUBLISHED"]; }, null, "SERVER_ERROR"],
    ["unsupported status", (data) => { data.events[0].status = "future"; }, null, "SERVER_ERROR"],
    ["invalid label", (data) => { data.gallery[0].title_th = { raw: true }; }, null, "SERVER_ERROR"],
    ["missing sheet", (data) => { delete data.gallery; }, null, "SERVER_ERROR"]
  ];
  for (const [label, mutate, payload, code] of cases) {
    const data = dependencyFixtures();
    mutate(data);
    const runtime = loadBackend({ data });
    assertError(inspect(runtime, payload || undefined), code);
    assert.deepEqual(runtime.calls.writes, [], label);
  }
});

test("dependency inspection remains advisory and cannot persist lifecycle confirmation", () => {
  const runtime = loadBackend({ data: dependencyFixtures() });
  assert.equal(post(runtime.context, { action: "adminInspectPlaceDependencies", token: "TOKEN", payload: { place_id: "PLC-PUBLISHED" } }).ok, true);
  assert.equal(response(runtime.context.routeRequest_("GET", { parameter: { action: "adminInspectPlaceDependencies", token: "TOKEN" } })).error.code, "UNKNOWN_ACTION");
  for (const action of ["adminUnpublishPlace", "adminArchivePlace", "adminRestorePlace"]) {
    assert.equal(post(runtime.context, { action, token: "TOKEN", payload: { place_id: "PLC-PUBLISHED", confirmed: true } }).error.code, "VALIDATION_ERROR");
  }
  assert.equal(runtime.data.places.find((row) => row.place_id === "PLC-PUBLISHED").status, "published");
  assert.equal(runtime.calls.writes.length, 0);
});

test("Create and Save authorize authoritative roles before payload reads locks or writes", () => {
  for (const role of ["reviewer", "viewer"]) {
    for (const [action, invoke] of [["CREATE", callCreate], ["UPDATE_DRAFT", callSave]]) {
      const runtime = loadTransactionBackend(action, { role });
      assertError(invoke(runtime, writeContent(), { role: "super_admin", force: true }), "FORBIDDEN");
      assert.deepEqual(runtime.calls.auth, ["TOKEN"]);
      assert.deepEqual(runtime.calls.reads, []);
      assert.deepEqual(runtime.calls.writes, []);
      assert.deepEqual(runtime.calls.sequence, ["auth"]);
    }
  }
  for (const action of ["CREATE", "UPDATE_DRAFT"]) {
    const runtime = loadTransactionBackend(action, { authError: "UNAUTHORIZED" });
    assertError(action === "CREATE" ? callCreate(runtime) : callSave(runtime), "UNAUTHORIZED");
    assert.deepEqual(runtime.calls.sequence, ["auth"]);
    assert.deepEqual(runtime.calls.writes, []);
  }
  const superAdmin = loadTransactionBackend("CREATE", { role: "super_admin" });
  assert.equal(callCreate(superAdmin).ok, true);
});

test("Create and Save require exact outer and complete editable content keys", () => {
  const createOuterSystem = [
    "place_id", "expected_version", "status", "entity_version", "working_version", "published_version",
    "draft_version", "base_published_version", "created_at", "updated_at", "created_by", "updated_by",
    "published_at", "published_by", "archived_at", "archived_by", "audit_id", "actor_admin_id",
    "cache_epoch", "force", "role"
  ];
  for (const key of createOuterSystem) {
    const runtime = loadTransactionBackend("CREATE");
    assertError(callCreate(runtime, writeContent(), { [key]: key === "force" ? true : "browser" }), "VALIDATION_ERROR");
    assert.equal(runtime.calls.events.includes("tryLock:10000"), false, key);
    assert.equal(runtime.calls.writes.length, 0, key);
  }
  const saveOuterSystem = createOuterSystem.filter((key) => key !== "place_id" && key !== "expected_version");
  for (const key of saveOuterSystem) {
    const runtime = loadTransactionBackend("UPDATE_DRAFT");
    assertError(callSave(runtime, writeContent(), { [key]: key === "force" ? true : "browser" }), "VALIDATION_ERROR");
    assert.equal(runtime.calls.events.includes("tryLock:10000"), false, key);
    assert.equal(runtime.calls.writes.length, 0, key);
  }

  const contentSystem = [
    "place_id", "status", "entity_version", "working_version", "published_version", "draft_version",
    "base_published_version", "created_at", "updated_at", "created_by", "updated_by", "published_at",
    "published_by", "archived_at", "archived_by", "audit_id", "actor_admin_id", "cache_epoch", "force", "role",
    "cover_image_url", "gallery_image_urls", "video_url", "sourceRowNumber"
  ];
  for (const key of contentSystem) {
    const content = writeContent({ [key]: "browser" });
    const runtime = loadTransactionBackend("CREATE");
    assertError(callCreate(runtime, content), "VALIDATION_ERROR");
    assert.equal(runtime.calls.events.includes("tryLock:10000"), false, key);
  }
  for (const [action, invoke] of [["CREATE", callCreate], ["UPDATE_DRAFT", callSave]]) {
    const missing = writeContent();
    delete missing.name_th;
    const missingRuntime = loadTransactionBackend(action);
    assertError(invoke(missingRuntime, missing), "VALIDATION_ERROR");
    const extraRuntime = loadTransactionBackend(action);
    assertError(invoke(extraRuntime, writeContent({ unknown: "x" })), "VALIDATION_ERROR");
    assert.equal(missingRuntime.calls.writes.length + extraRuntime.calls.writes.length, 0);
  }
});

test("Draft content validation enforces bounded types enums URLs coordinates IDs and deterministic lists", () => {
  const invalidContents = [
    writeContent({ name_th: 7 }),
    writeContent({ name_th: "x".repeat(20001) }),
    writeContent({ name_th: "bad\u0000text" }),
    writeContent({ district: "surat" }),
    writeContent({ route_group: "future_route" }),
    writeContent({ category: "future_category" }),
    writeContent({ coordinate_status: "trusted" }),
    writeContent({ is_featured: "true" }),
    writeContent({ is_main_route_point: 1 }),
    writeContent({ sort_order: -1 }),
    writeContent({ sort_order: 1.5 }),
    writeContent({ latitude: 8, longitude: "" }),
    writeContent({ latitude: "8", longitude: 98 }),
    writeContent({ latitude: -90.0001, longitude: 98 }),
    writeContent({ latitude: 8, longitude: 180.0001 }),
    writeContent({ website_url: "javascript:alert(1)" }),
    writeContent({ website_url: "https:///missing-host" }),
    writeContent({ website_url: "http://?query" }),
    writeContent({ website_url: "https://#fragment" }),
    writeContent({ website_url: "https://user:pass@example.com/path" }),
    writeContent({ website_url: "https://example.com:99999/path" }),
    writeContent({ website_url: "https://[::1]/path" }),
    writeContent({ website_url: "https://[::::]/path" }),
    writeContent({ website_url: "https://[1::2::3]/path" }),
    writeContent({ website_url: "https://[127.0.0.1:]/path" }),
    writeContent({ website_url: "https://example.com/<script>" }),
    writeContent({ website_url: "https://example.com/\"quoted" }),
    writeContent({ website_url: "https://example.com/'quoted" }),
    writeContent({ line_url: "data:text/plain,secret" }),
    writeContent({ facebook_url: "blob:secret" }),
    writeContent({ google_maps_url: "ftp://maps.example/path" }),
    writeContent({ tags: "nature|lake" }),
    writeContent({ tags: ["nature", "nature"] }),
    writeContent({ tags: ["nature|lake"] }),
    writeContent({ nearby_place_ids: "PLC-OTHER" }),
    writeContent({ nearby_place_ids: ["../PLC"] }),
    writeContent({ nearby_place_ids: ["PLC-OTHER", "PLC-OTHER"] }),
    writeContent({ gallery_media_ids: [] }),
    writeContent({ gallery_media_ids: "place-gallery-01" })
  ];
  for (const content of invalidContents) {
    const runtime = loadTransactionBackend("CREATE");
    assertError(callCreate(runtime, content), "VALIDATION_ERROR");
    assert.equal(runtime.calls.events.includes("tryLock:10000"), false);
    assert.equal(runtime.calls.writes.length, 0);
  }

  const valid = loadTransactionBackend("CREATE");
  const result = callCreate(valid, writeContent({
    district: "phanom", route_group: "nearby_phanom", coordinate_status: "approximate",
    latitude: -90, longitude: 180, website_url: "https://example.com/path?x=1#ok", line_url: "http://line.example/path",
    sort_order: 0, tags: [], nearby_place_ids: [], gallery_media_ids: ""
  }));
  assert.equal(result.ok, true);
});

test("Create writes one lowercase generated identity one complete draft and one CREATE audit", () => {
  const runtime = loadTransactionBackend("CREATE");
  const content = writeContent({ name_th: "=formula", description_th: "+detail", activities_en: "-activity", highlight_th: "@highlight" });
  const result = callCreate(runtime, content);
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.data), WRITE_SUCCESS_KEYS);
  assert.deepEqual(result.data, {
    place_id: "PLC-12345678-1234-4234-8234-123456789abc", status: "draft", entity_version: 1,
    working_version: 1, published_version: null, has_active_draft: true,
    created_at: result.data.created_at, updated_at: result.data.updated_at
  });
  assert.equal(result.data.created_at, result.data.updated_at);
  assert.equal(new Date(result.data.created_at).toISOString(), result.data.created_at);
  assert.equal(populatedRows(runtime, "places").length, 1);
  assert.equal(populatedRows(runtime, "place_drafts").length, 1);

  const identity = sheetRecord(runtime, "places");
  const draftRow = sheetRecord(runtime, "place_drafts");
  const identityContent = DRAFT_HEADERS.filter((header) => ![
    "place_id", "draft_version", "base_published_version", "created_at", "updated_at", "created_by", "updated_by"
  ].includes(header));
  for (const header of identityContent) {
    assert.equal(identity[header], ["is_featured", "is_main_route_point"].includes(header) ? false : "", `neutral identity ${header}`);
  }
  assert.deepEqual({
    place_id: identity.place_id, status: identity.status, entity_version: identity.entity_version,
    published_version: identity.published_version, created_by: identity.created_by, updated_by: identity.updated_by,
    published_at: identity.published_at, published_by: identity.published_by, archived_at: identity.archived_at, archived_by: identity.archived_by
  }, {
    place_id: result.data.place_id, status: "draft", entity_version: 1, published_version: 0,
    created_by: "ADM-authoritative", updated_by: "ADM-authoritative", published_at: "", published_by: "", archived_at: "", archived_by: ""
  });
  assert.equal(draftRow.place_id, result.data.place_id);
  assert.equal(draftRow.draft_version, 1);
  assert.equal(draftRow.base_published_version, 0);
  assert.equal(draftRow.created_by, "ADM-authoritative");
  assert.equal(draftRow.updated_by, "ADM-authoritative");
  assert.equal(draftRow.tags, "nature|lake");
  assert.equal(draftRow.nearby_place_ids, "PLC-OTHER");
  assert.equal(draftRow.gallery_media_ids, "");
  assert.equal(draftRow.name_th, "'=formula");
  assert.equal(draftRow.description_th, "'+detail");
  assert.equal(draftRow.activities_en, "'-activity");
  assert.equal(draftRow.highlight_th, "'@highlight");
  const detail = plain(runtime.context.adminGetPlaceDetail_("TOKEN", { place_id: result.data.place_id, view: "working" }));
  assert.equal(detail.data.content.name_th, "=formula");
  assert.equal(detail.data.content.description_th, "+detail");
  assert.equal(detail.data.content.activities_en, "-activity");
  assert.equal(detail.data.content.highlight_th, "@highlight");
  assertError(publicPlaceDetail(runtime, result.data.place_id), "NOT_FOUND");

  const audits = populatedRows(runtime, "activity_logs");
  assert.equal(audits.length, 1);
  const audit = sheetRecord(runtime, "activity_logs");
  assert.equal(audit.action, "CREATE");
  assert.equal(audit.entity_id, result.data.place_id);
  assert.equal(audit.actor_admin_id, "ADM-authoritative");
  assert.deepEqual(runtime.calls.propertyReads.slice(-2).map((entry) => entry.key), ["ADMIN_PLACE_MEDIA_MANIFEST_URL", "ADMIN_PLACE_MEDIA_ALLOWED_ORIGIN"]);
  assert.equal(runtime.calls.propertyWrites.length, 0);
  assert.equal(runtime.lock.released, 1);
  assert.equal(runtime.calls.sequence[0], "auth");
  assert.equal(runtime.calls.sequence[1], "tryLock:10000");
  assert.equal(runtime.calls.events.includes("releaseLock"), true);
});

test("Create permits a structurally complete empty draft and rejects generated ID failures without retry", () => {
  const empty = loadTransactionBackend("CREATE");
  const emptyResult = callCreate(empty, emptyWriteContent());
  assert.equal(emptyResult.ok, true, "useful Thai name remains a client-only Create enablement rule");
  assert.equal(sheetRecord(empty, "place_drafts").name_th, "");

  const collision = loadTransactionBackend("CREATE", { createCollision: true });
  const collisionBefore = transactionBefore(collision);
  assertError(callCreate(collision), "SERVER_ERROR");
  assert.deepEqual(collision.calls.writes, []);
  assert.deepEqual(transactionBefore(collision), collisionBefore);
  assert.equal(collision.calls.events.filter((event) => event.startsWith("uuid:")).length, 1);
  assert.deepEqual(collision.calls.sequence, ["auth", "tryLock:10000"]);
  assert.deepEqual(collision.calls.events, [
    "tryLock:10000",
    "read:places:action",
    "read:place_drafts:action",
    "uuid:12345678-1234-4234-8234-123456789ABC",
    "releaseLock"
  ]);
  assert.equal(populatedRows(collision, "activity_logs").length, 0);

  const malformed = loadTransactionBackend("CREATE", { uuidSequence: ["../NOT-A-UUID"] });
  assertError(callCreate(malformed), "SERVER_ERROR");
  assert.deepEqual(malformed.calls.writes, []);
  assert.equal(malformed.calls.events.filter((event) => event.startsWith("uuid:")).length, 1);

  for (const uuid of [
    "12345678-1234-1234-8234-123456789abc",
    "12345678-1234-3234-8234-123456789abc",
    "12345678-1234-5234-8234-123456789abc"
  ]) {
    const wrongVersion = loadTransactionBackend("CREATE", { uuidSequence: [uuid] });
    assertError(callCreate(wrongVersion), "SERVER_ERROR");
    assert.deepEqual(wrongVersion.calls.writes, []);
    assert.equal(wrongVersion.calls.events.filter((event) => event.startsWith("uuid:")).length, 1);
  }

  const source = adminPlaceServiceSource;
  const lockedCollisionBlock =
    "    function createUnderLock() {\n" +
    "      var context = AdminPlaceService_requireContext_(true);\n" +
    "      var placeId = AdminPlaceService_generatePlaceId_();\n" +
    "      if (Object.prototype.hasOwnProperty.call(context.placesById, placeId) ||\n" +
    "          Object.prototype.hasOwnProperty.call(context.draftsById, placeId)) {\n" +
    "        throw new Error(\"ADMIN_PLACE_ID_COLLISION\");\n" +
    "      }\n";
  assert.ok(source.includes(lockedCollisionBlock), "collision-hoist mutation target must match");
  const hoistedCollision = source.replace(lockedCollisionBlock, "    function createUnderLock() {\n").replace(
    "    return AdminPlaceService_withWriteLock_(createUnderLock);\n",
    "    var context = AdminPlaceService_requireContext_(true);\n" +
    "    var placeId = AdminPlaceService_generatePlaceId_();\n" +
    "    if (Object.prototype.hasOwnProperty.call(context.placesById, placeId) ||\n" +
    "        Object.prototype.hasOwnProperty.call(context.draftsById, placeId)) {\n" +
    "      throw new Error(\"ADMIN_PLACE_ID_COLLISION\");\n" +
    "    }\n" +
    "    return AdminPlaceService_withWriteLock_(createUnderLock);\n"
  );
  assert.notEqual(hoistedCollision, source, "collision-hoist mutation target must match");
  const hoisted = loadTransactionBackend("CREATE", { createCollision: true, serviceSource: hoistedCollision });
  assertError(callCreate(hoisted), "SERVER_ERROR");
  assert.deepEqual(hoisted.calls.writes, []);
  assert.equal(hoisted.calls.events.filter((event) => event.startsWith("uuid:")).length, 1);
  assert.throws(
    () => assert.deepEqual(hoisted.calls.events, collision.calls.events),
    /Expected values to be strictly deep-equal/
  );
  assert.equal(hoisted.calls.events.includes("tryLock:10000"), false, "hoisted collision mutant must demonstrate the unlocked bug");
});

test("Save Draft synchronizes versions while preserving Published identity content and Public output", () => {
  const runtime = loadTransactionBackend("UPDATE_DRAFT", {
    publishedFormulaField: "name_th",
    formulaCells: { place_drafts: { cover_image_url: "" } }
  });
  const beforePlace = sheetRecord(runtime, "places");
  const beforeDraft = sheetRecord(runtime, "place_drafts");
  const beforePublic = publicPlaceDetail(runtime);
  const result = callSave(runtime, writeContent({ name_th: "new private draft", name_en: "Private Draft", tags: ["one", "two"] }));
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.data), WRITE_SUCCESS_KEYS);
  assert.deepEqual({
    place_id: result.data.place_id, status: result.data.status, entity_version: result.data.entity_version,
    working_version: result.data.working_version, published_version: result.data.published_version,
    has_active_draft: result.data.has_active_draft
  }, { place_id: "TX-PLACE", status: "published", entity_version: 4, working_version: 4, published_version: 2, has_active_draft: true });

  const afterPlace = sheetRecord(runtime, "places");
  for (const header of PLACE_HEADERS) {
    if (["entity_version", "updated_at", "updated_by"].includes(header)) continue;
    assert.equal(afterPlace[header], beforePlace[header], `Published identity ${header} remains unchanged`);
  }
  assert.equal(afterPlace.entity_version, 4);
  assert.equal(afterPlace.updated_by, "ADM-authoritative");
  assert.equal(afterPlace.updated_at, result.data.updated_at);
  assert.equal(runtime.sheets.places.formulas[0].has("name_th"), true, "targeted metadata update must preserve Published formulas");
  assert.deepEqual(publicPlaceDetail(runtime), beforePublic);

  const afterDraft = sheetRecord(runtime, "place_drafts");
  assert.equal(afterDraft.name_th, "new private draft");
  assert.equal(afterDraft.tags, "one|two");
  assert.equal(afterDraft.draft_version, 4);
  assert.equal(afterDraft.base_published_version, beforeDraft.base_published_version);
  assert.equal(afterDraft.created_at, beforeDraft.created_at);
  assert.equal(afterDraft.created_by, beforeDraft.created_by);
  assert.equal(afterDraft.cover_image_url, beforeDraft.cover_image_url);
  assert.equal(runtime.sheets.place_drafts.formulas[0].has("cover_image_url"), true, "server-preserved draft formulas remain physical");
  assert.equal(afterDraft.updated_by, "ADM-authoritative");
  assert.equal(populatedRows(runtime, "activity_logs").length, 1);
  assert.equal(sheetRecord(runtime, "activity_logs").action, "UPDATE_DRAFT");
  assert.equal(runtime.calls.propertyReads.length, 0);
  assert.equal(runtime.calls.propertyWrites.length, 0);
  assert.equal(runtime.lock.released, 1);
});

test("Save failure selectively compensates touched fields without destroying untouched physical formulas", () => {
  const runtime = loadTransactionBackend("UPDATE_DRAFT", {
    formulaCells: {
      places: { description_th: "" },
      place_drafts: { cover_image_url: "", created_at: "" }
    },
    failAuditAppendAfterWrite: true
  });
  const before = transactionBefore(runtime);
  const beforePublic = publicPlaceDetail(runtime);
  const result = callSave(runtime, writeContent({ description_th: "private replacement" }));
  assertError(result, "SERVER_ERROR");
  assertRestored(runtime, before);
  assert.deepEqual(publicPlaceDetail(runtime), beforePublic);
  assert.equal(runtime.sheets.places.formulas[0].has("description_th"), true);
  assert.equal(runtime.sheets.places.rows[0][PLACE_HEADERS.indexOf("description_th")], "");
  assert.equal(runtime.sheets.place_drafts.formulas[0].has("cover_image_url"), true);
  assert.equal(runtime.sheets.place_drafts.formulas[0].has("created_at"), true);
  assert.equal(runtime.sheets.place_drafts.rows[0][DRAFT_HEADERS.indexOf("cover_image_url")], "");
  assert.equal(runtime.sheets.place_drafts.rows[0][DRAFT_HEADERS.indexOf("created_at")], "");
  const actionWrites = runtime.calls.writes.filter((write) => write.phase === "action" && write.name !== "activity_logs");
  assert.equal(actionWrites.every((write) => write.method === "update"), true, "Save must use selective existing-row mutation");
  assert.equal(actionWrites.every((write) => Object.keys(write.record).length === 1), true, "each selective action helper call writes one field");
  const placeActionFields = actionWrites.filter((write) => write.name === "places").flatMap((write) => Object.keys(write.record));
  const draftActionFields = actionWrites.filter((write) => write.name === "place_drafts").flatMap((write) => Object.keys(write.record));
  assert.deepEqual(placeActionFields, ["entity_version", "updated_at", "updated_by"]);
  assert.deepEqual(draftActionFields, [...CONTENT_KEYS, "draft_version", "updated_at", "updated_by"]);
  for (const preserved of ["place_id", "base_published_version", "cover_image_url", "gallery_image_urls", "video_url", "created_at", "created_by"]) {
    assert.equal(draftActionFields.includes(preserved), false, `Save must not physically touch draft ${preserved}`);
  }
  const restoreWrites = runtime.calls.writes.filter((write) => write.phase === "restore" && write.name !== "activity_logs");
  assert.equal(restoreWrites.every((write) => write.method === "update"), true, "Save compensation must remain selective");
  assert.equal(restoreWrites.every((write) => Object.keys(write.record).length === 1), true, "each selective restore helper call writes one field");
  assert.deepEqual(
    restoreWrites.map((write) => [write.name, Object.keys(write.record)[0]]),
    draftActionFields.map((field) => ["place_drafts", field]).concat(placeActionFields.map((field) => ["places", field]))
  );

  const verificationFailure = loadTransactionBackend("UPDATE_DRAFT", {
    formulaCells: { places: { description_th: "" }, place_drafts: { cover_image_url: "" } },
    corruptDraftAfterUpdate: true
  });
  const verificationBefore = transactionBefore(verificationFailure);
  assertError(callSave(verificationFailure), "SERVER_ERROR");
  assertRestored(verificationFailure, verificationBefore);
  assert.equal(verificationFailure.calls.writes.some((write) => write.name === "activity_logs"), false);

  const earlyFailure = loadTransactionBackend("UPDATE_DRAFT", {
    formulaCells: { place_drafts: { description_th: "" } },
    failPlaceUpdateAfterWrite: true
  });
  const earlyBefore = transactionBefore(earlyFailure);
  assertError(callSave(earlyFailure), "SERVER_ERROR");
  assertRestored(earlyFailure, earlyBefore);
  assert.equal(earlyFailure.sheets.place_drafts.formulas[0].has("description_th"), true);
  assert.equal(
    earlyFailure.calls.writes.some((write) => write.name === "place_drafts"),
    false,
    "compensation must not touch a draft mutation that was never attempted"
  );

  const formulaSafe = loadTransactionBackend("UPDATE_DRAFT");
  const formulaSafeResult = callSave(formulaSafe, writeContent({ description_th: "=client formula text" }));
  assert.equal(formulaSafeResult.ok, true);
  assert.equal(sheetRecord(formulaSafe, "place_drafts").description_th, "'=client formula text");
  assert.equal(formulaSafe.sheets.place_drafts.formulas[0].has("description_th"), false);
  const working = plain(formulaSafe.context.adminGetPlaceDetail_("TOKEN", { place_id: "TX-PLACE", view: "working" }));
  assert.equal(working.data.content.description_th, "=client formula text");
});

test("Save field-boundary failure compensates only attempted fields and preserves every later formula cell", () => {
  const draftBoundary = loadTransactionBackend("UPDATE_DRAFT", {
    formulaCells: { place_drafts: { name_en: "", cover_image_url: "" } },
    failActionUpdateAfterField: { sheetName: "place_drafts", field: "name_th" }
  });
  const draftBefore = transactionBefore(draftBoundary);
  const draftResult = callSave(draftBoundary, writeContent({ name_th: "attempted", name_en: "must stay physical" }));
  assertError(draftResult, "SERVER_ERROR");
  assertRestored(draftBoundary, draftBefore);
  assert.equal(draftBoundary.sheets.place_drafts.formulas[0].has("name_en"), true);
  assert.equal(draftBoundary.sheets.place_drafts.rows[0][DRAFT_HEADERS.indexOf("name_en")], "");
  assert.equal(draftBoundary.sheets.place_drafts.formulas[0].has("cover_image_url"), true);
  assert.equal(populatedRows(draftBoundary, "activity_logs").length, 0);
  const draftActionFields = draftBoundary.calls.writes
    .filter((write) => write.phase === "action" && write.name === "place_drafts")
    .flatMap((write) => Object.keys(write.record));
  const draftRestoreFields = draftBoundary.calls.writes
    .filter((write) => write.phase === "restore" && write.name === "place_drafts")
    .flatMap((write) => Object.keys(write.record));
  assert.deepEqual(draftActionFields, ["name_th"], "only the attempted draft field may enter the action call");
  assert.deepEqual(draftRestoreFields, ["name_th"], "only the attempted draft field may enter compensation");
  assert.equal(draftBoundary.calls.events.at(-1), "releaseLock");
  const draftFinalRestoreRead = Math.max(
    draftBoundary.calls.events.lastIndexOf("read:places:restore"),
    draftBoundary.calls.events.lastIndexOf("read:place_drafts:restore")
  );
  assert.equal(draftBoundary.calls.events.lastIndexOf("releaseLock") > draftFinalRestoreRead, true);

  const placeBoundary = loadTransactionBackend("UPDATE_DRAFT", {
    formulaCells: { places: { updated_at: "" }, place_drafts: { cover_image_url: "" } },
    failActionUpdateAfterField: { sheetName: "places", field: "entity_version" }
  });
  const placeBefore = transactionBefore(placeBoundary);
  assertError(callSave(placeBoundary), "SERVER_ERROR");
  assertRestored(placeBoundary, placeBefore);
  assert.equal(placeBoundary.sheets.places.formulas[0].has("updated_at"), true);
  assert.equal(placeBoundary.sheets.places.rows[0][PLACE_HEADERS.indexOf("updated_at")], "");
  assert.equal(placeBoundary.sheets.place_drafts.formulas[0].has("cover_image_url"), true);
  assert.equal(placeBoundary.calls.writes.some((write) => write.name === "place_drafts"), false);
  const placeActionFields = placeBoundary.calls.writes
    .filter((write) => write.phase === "action" && write.name === "places")
    .flatMap((write) => Object.keys(write.record));
  const placeRestoreFields = placeBoundary.calls.writes
    .filter((write) => write.phase === "restore" && write.name === "places")
    .flatMap((write) => Object.keys(write.record));
  assert.deepEqual(placeActionFields, ["entity_version"], "only the attempted Place field may enter the action call");
  assert.deepEqual(placeRestoreFields, ["entity_version"], "only the attempted Place field may enter compensation");
  assert.equal(populatedRows(placeBoundary, "activity_logs").length, 0);
  assert.equal(placeBoundary.calls.events.at(-1), "releaseLock");
});

test("First Save Draft copies only server-owned URL-era media into a new active draft", () => {
  const runtime = loadTransactionBackend("UPDATE_DRAFT", { updateDraftWithoutPrior: true });
  const beforePlace = sheetRecord(runtime, "places");
  const beforePublic = publicPlaceDetail(runtime);
  const result = callSave(runtime, writeContent({ name_th: "first private edit" }));
  assert.equal(result.ok, true);
  assert.equal(populatedRows(runtime, "place_drafts").length, 1);
  const createdDraft = sheetRecord(runtime, "place_drafts");
  assert.equal(createdDraft.name_th, "first private edit");
  assert.equal(createdDraft.cover_image_url, beforePlace.cover_image_url);
  assert.equal(createdDraft.gallery_image_urls, beforePlace.gallery_image_urls);
  assert.equal(createdDraft.video_url, beforePlace.video_url);
  assert.equal(createdDraft.draft_version, 4);
  assert.equal(createdDraft.base_published_version, 2);
  assert.equal(createdDraft.created_by, "ADM-authoritative");
  assert.equal(createdDraft.updated_by, "ADM-authoritative");
  assert.deepEqual(publicPlaceDetail(runtime), beforePublic);
});

test("Save Draft stale requests and authoritative invariant corruption write nothing", () => {
  const stale = loadTransactionBackend("UPDATE_DRAFT");
  assertError(callSave(stale, writeContent(), { expected_version: 2 }), "CONFLICT");
  assert.equal(stale.calls.writes.length, 0);
  assert.equal(populatedRows(stale, "activity_logs").length, 0);

  for (const expected_version of [0, -1, 1.5, "3", Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = loadTransactionBackend("UPDATE_DRAFT");
    assertError(callSave(invalid, writeContent(), { expected_version }), "VALIDATION_ERROR");
    assert.equal(invalid.calls.writes.length, 0);
  }

  for (const mutate of [
    (runtime) => { runtime.sheets.place_drafts.rows[0][DRAFT_HEADERS.indexOf("draft_version")] = 2; },
    (runtime) => { runtime.sheets.place_drafts.rows[0][DRAFT_HEADERS.indexOf("base_published_version")] = 1; },
    (runtime) => { runtime.sheets.place_drafts.rows.push([...runtime.sheets.place_drafts.rows[0]]); },
    (runtime) => { runtime.sheets.place_drafts.rows.push(DRAFT_HEADERS.map((header) => draft("OTHER", 1, 0)[header] ?? "")); runtime.sheets.place_drafts.rows.push(DRAFT_HEADERS.map((header) => draft("OTHER", 1, 0)[header] ?? "")); }
  ]) {
    const corrupt = loadTransactionBackend("UPDATE_DRAFT");
    mutate(corrupt);
    assertError(callSave(corrupt), "SERVER_ERROR");
    assert.equal(corrupt.calls.writes.length, 0);
    assert.equal(populatedRows(corrupt, "activity_logs").length, 0);
  }

  const corruptCreate = loadTransactionBackend("CREATE", { unrelatedBusinessRows: true });
  corruptCreate.sheets.place_drafts.rows.push([...corruptCreate.sheets.place_drafts.rows[0]]);
  assertError(callCreate(corruptCreate), "SERVER_ERROR");
  assert.equal(corruptCreate.calls.writes.length, 0);

  for (const place_id of ["", " ../TX-PLACE", 7, "X".repeat(65)]) {
    const malformed = loadTransactionBackend("UPDATE_DRAFT");
    assertError(callSave(malformed, writeContent(), { place_id }), "VALIDATION_ERROR");
    assert.equal(malformed.calls.writes.length, 0);
  }

  const missing = loadTransactionBackend("UPDATE_DRAFT");
  missing.sheets.places.rows = [];
  missing.sheets.place_drafts.rows = [];
  assertError(callSave(missing), "NOT_FOUND");
  assert.equal(missing.calls.writes.length, 0);

  const archived = loadTransactionBackend("UPDATE_DRAFT");
  archived.sheets.places.rows[0][PLACE_HEADERS.indexOf("status")] = "archived";
  assertError(callSave(archived), "VALIDATION_ERROR");
  assert.equal(archived.calls.writes.length, 0);
});

test("Create verification failure preserves the exact response and rollback", () => {
  const runtime = loadTransactionBackend("CREATE", { wrongPlaceAppendRow: true, unrelatedBusinessRows: true });
  const before = transactionBefore(runtime);

  assert.deepEqual(callCreate(runtime), {
    ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดของระบบ" }
  });
  assertRestored(runtime, before);
  assert.equal(runtime.lock.released, 1);
});

test("Create unsafe thrown values preserve the exact response rollback and lock release", () => {
  for (const expression of [
    'new Error("token=TOKEN payload=private credentials=secret")',
    'new Error("ADMIN_PLACE_SECRET_TOKEN")',
    'new Error("ADMIN_PLACE_AUDIT_CLEANUP")',
    'new Error("Human text value is invalid.")',
    'new Error("Human text field is invalid.")',
    'new Error("ADMIN_PLACE_WRITE_VERIFY\\nprivate")',
    'new TypeError("ADMIN_PLACE_APPEND")',
    'new Error("")',
    'Object.assign(new Error(), { message: 123 })',
    'Object.defineProperty(new Error(), "message", { get() { throw new Error("private"); } })',
    '({ message: "ADMIN_PLACE_WRITE_VERIFY", toString() { throw new Error("must not serialize"); } })',
    '"ADMIN_PLACE_WRITE_VERIFY"', 'null', 'undefined'
  ]) {
    const runtime = loadTransactionBackend("CREATE");
    const before = transactionBefore(runtime);
    const thrown = vm.runInContext(expression, runtime.context);
    const append = runtime.context.SheetService_appendObjectWithRow_;
    runtime.context.SheetService_appendObjectWithRow_ = (...args) => {
      const result = append(...args);
      if (args[0] === "place_drafts") throw thrown;
      return result;
    };

    assert.deepEqual(callCreate(runtime), {
      ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดของระบบ" }
    }, expression);
    assertRestored(runtime, before);
    assert.equal(runtime.lock.released, 1);
  }
});


test("Create audit verification failure restores state and releases the lock", () => {
  const runtime = loadTransactionBackend("CREATE", { corruptAuditDescriptionReadback: true });
  const before = transactionBefore(runtime);
  assert.deepEqual(callCreate(runtime), {
    ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดของระบบ" }
  });
  assertRestored(runtime, before);
  assert.equal(runtime.lock.released, 1);
});

test("Create rejects invalid Gallery before transaction writes", () => {
  for (const gallery_media_ids of ["invalid|list", ["invalid id"], ["place-temp-gallery-a"]]) {
    const runtime = loadTransactionBackend("CREATE");
    assertError(callCreate(runtime, writeContent({ gallery_media_ids })), "VALIDATION_ERROR");
    assert.deepEqual(runtime.calls.writes, []);
  }
});

test("Create pre-write authorization lock context ID and capture failures preserve safe responses", () => {
  for (const [options, setup, scenario, responseCode] of [
    [{}, (runtime) => {
      runtime.context.AuthService_requireAdmin_ = vm.runInContext('() => { throw new Error("UNAUTHORIZED"); }', runtime.context);
    }, "authorization", "UNAUTHORIZED"],
    [{ role: "viewer" }, null, "role", "FORBIDDEN"],
    [{ lockTimeout: true }, null, "timeout", "SERVER_ERROR"],
    [{}, (runtime) => { runtime.context.LockService.getScriptLock = () => { throw new Error("private"); }; },
      "get-lock", "SERVER_ERROR"],
    [{}, (runtime) => { runtime.sheets.places.rows.push(PLACE_HEADERS.map(() => "invalid")); },
      "context", "SERVER_ERROR"],
    [{ uuidSequence: ["invalid"] }, null, "id", "SERVER_ERROR"],
    [{ createCollision: true }, null, "collision", "SERVER_ERROR"],
    [{}, (runtime) => {
      const read = runtime.context.SheetService_readTable_;
      let reads = 0;
      runtime.context.SheetService_readTable_ = (...args) => {
        const table = read(...args);
        if (args[0] === "places" && ++reads === 3) table.headers.reverse();
        return table;
      };
    }, "capture", "SERVER_ERROR"]
  ]) {
    const runtime = loadTransactionBackend("CREATE", options);
    if (setup) setup(runtime);
    const result = callCreate(runtime);
    assertError(result, responseCode);
    if (responseCode === "SERVER_ERROR") assert.deepEqual(result, {
      ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดของระบบ" }
    });
    assert.deepEqual(runtime.calls.writes, []);
    assert.equal(runtime.lock.released, options.lockTimeout || responseCode === "UNAUTHORIZED" || responseCode === "FORBIDDEN" || scenario === "get-lock" ? 0 : 1);
  }
});

test("Create verification failure compensates before releasing the lock", () => {
  const runtime = loadTransactionBackend("CREATE", { wrongPlaceAppendRow: true, unrelatedBusinessRows: true });
  const before = transactionBefore(runtime);
  assertError(callCreate(runtime, writeContent({ name_th: "private payload" })), "SERVER_ERROR");
  assertRestored(runtime, before);
  const events = runtime.calls.events;
  const clear = events.findIndex((event) => event.startsWith("clear:"));
  assert.ok(clear >= 0);
  assert.ok(clear < events.indexOf("releaseLock"));
  assert.equal(runtime.lock.released, 1);
});

test("Create compensation and lock-release failures preserve the safe response and attempt cleanup", () => {
  const runtime = loadTransactionBackend("CREATE", {
    wrongPlaceAppendRow: true, unrelatedBusinessRows: true, incompleteClear: true, throwReleaseLock: true
  });
  const clear = runtime.context.SheetService_clearRow_;
  runtime.context.SheetService_clearRow_ = (...args) => {
    runtime.phase = "restore";
    return clear(...args);
  };
  assert.deepEqual(callCreate(runtime), {
    ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดของระบบ" }
  });
  assert.ok(runtime.calls.events.some((event) => event.startsWith("clear:")), "compensation was attempted");
  assert.equal(runtime.lock.released, 1);
  assert.ok(runtime.calls.events.findIndex((event) => event.startsWith("clear:")) < runtime.calls.events.indexOf("releaseLock"));
});

test("Create lock-release exception takes precedence over the pre-write failure", () => {
  const runtime = loadTransactionBackend("CREATE", { createCollision: true });
  runtime.lock.releaseLock = () => {
    runtime.calls.events.push("releaseLock");
    throw new Error("FORBIDDEN");
  };
  assert.deepEqual(callCreate(runtime), {
    ok: false, error: { code: "FORBIDDEN", message: "คุณไม่มีสิทธิ์ดำเนินการนี้" }
  });
  assert.deepEqual(runtime.calls.writes, []);
});

test("Create release-only failure preserves committed rows and audit", () => {
  const runtime = loadTransactionBackend("CREATE", { throwReleaseLock: true });
  assert.deepEqual(callCreate(runtime), {
    ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดของระบบ" }
  });
  assert.equal(populatedRows(runtime, "places").length, 1, "release failure never introduced compensation in the original flow");
  assert.equal(populatedRows(runtime, "place_drafts").length, 1);
  assert.equal(populatedRows(runtime, "activity_logs").length, 1);
});

test("shared lock helper preserves acquisition release return identity and exception precedence", () => {
  for (const scenario of ["success", "operation", "release", "both", "timeout", "acquire", "getLock"]) {
    const runtime = loadTransactionBackend("CREATE");
    const events = [];
    const operationError = new Error("operation");
    const releaseError = new Error("release");
    const acquireError = new Error("acquire");
    const value = { original: true };
    runtime.context.LockService.getScriptLock = () => {
      events.push("getLock");
      if (scenario === "getLock") throw acquireError;
      return {
        tryLock(timeout) {
          events.push(`tryLock:${timeout}`);
          if (scenario === "acquire") throw acquireError;
          return scenario !== "timeout";
        },
        releaseLock() {
          events.push("releaseLock");
          if (scenario === "release" || scenario === "both") throw releaseError;
        }
      };
    };
    const invoke = () => runtime.context.AdminPlaceService_withWriteLock_(() => {
      events.push("operation");
      if (scenario === "operation" || scenario === "both") throw operationError;
      return value;
    });
    if (scenario === "success") assert.equal(invoke(), value);
    else if (scenario === "timeout") assert.throws(invoke, { message: "ADMIN_PLACE_WRITE_LOCK" });
    else assert.throws(invoke, (error) => error === (
      scenario === "release" || scenario === "both" ? releaseError :
      scenario === "operation" ? operationError : acquireError
    ));
    assert.deepEqual(events, scenario === "getLock" ? ["getLock"] :
      scenario === "timeout" || scenario === "acquire" ? ["getLock", "tryLock:10000"] :
      ["getLock", "tryLock:10000", "operation", "releaseLock"]);
  }
});

test("shared execute preserves exact error mapping and success return identity", () => {
  const expectedErrors = {
    UNAUTHORIZED: "กรุณาเข้าสู่ระบบ",
    FORBIDDEN: "คุณไม่มีสิทธิ์ดำเนินการนี้",
    VALIDATION_ERROR: "ข้อมูลคำขอไม่ถูกต้อง",
    NOT_FOUND: "ไม่พบสถานที่",
    CONFLICT: "ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุด",
    SERVER_ERROR: "เกิดข้อผิดพลาดของระบบ"
  };
  for (const code of [...Object.keys(expectedErrors), "private", null]) {
    const runtime = loadTransactionBackend("CREATE");
    const thrown = code === null ? null : new Error(code);
    const result = plain(runtime.context.AdminPlaceService_execute_("TOKEN", () => { throw thrown; }));
    const expectedCode = Object.hasOwn(expectedErrors, code) ? code : "SERVER_ERROR";
    assert.deepEqual(result, { ok: false, error: { code: expectedCode, message: expectedErrors[expectedCode] } });
  }
  const runtime = loadTransactionBackend("CREATE");
  const value = { original: true };
  assert.equal(runtime.context.AdminPlaceService_execute_("TOKEN", () => value), value);
});

test("Create authorization error mapping preserves message getter access behavior", () => {
  const runtime = loadTransactionBackend("CREATE");
  vm.runInContext(`
    var messageReads = 0;
    var authError = Object.defineProperty(new Error(), "message", {
      get: function () { return ++messageReads <= 2 ? "UNAUTHORIZED" : "private"; }
    });
    AuthService_requireAdmin_ = function () { throw authError; };
  `, runtime.context);
  assert.deepEqual(callCreate(runtime), {
    ok: false, error: { code: "UNAUTHORIZED", message: "กรุณาเข้าสู่ระบบ" }
  });
  assert.equal(runtime.context.messageReads, 2, "only the existing error mapper reads the accessor");
});

test("Save compensation failure preserves the safe response and releases the lock", () => {
  const runtime = loadTransactionBackend("UPDATE_DRAFT", { failAuditAppendAfterWrite: true, failRestoreWrite: true });
  assert.deepEqual(callSave(runtime), {
    ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดของระบบ" }
  });
  assert.equal(runtime.lock.released, 1);
});


test("Create strict verification rejects every corrupt readback and compensates under lock", () => {
  const cases = [
    ["places", "timestamp becomes Date", (table) => { table.rows[0].values.created_at = new Date(); table.rows[0].values.updated_at = "private second mismatch"; }],
    ["place_drafts", "version becomes string", (table) => { table.rows[0].values.draft_version = "private value"; }],
    ["place_drafts", "changed value", (table) => { table.rows[0].values.name_th = "private changed payload"; }],
    ["places", "missing table", () => null],
    ["places", "missing headers", (table) => { delete table.headers; }],
    ["places", "invalid headers", (table) => { table.headers = "private invalid headers"; }],
    ["places", "header count", (table) => { table.headers.push("private header"); }],
    ["places", "header order", (table) => { table.headers.reverse(); }],
    ["places", "missing row", (table) => { table.rows = []; }],
    ["places", "wrong row location", (table) => { table.rows[0].sourceRowNumber += 1; }],
    ["places", "extra column value", (table) => { table.rows[0].values["private header"] = "private value"; }, true],
    ...["places", "place_drafts"].flatMap((sheet) => ["is_featured", "is_main_route_point"].map((field) =>
      [sheet, `${field} becomes string`, (table) => { table.rows[0].values[field] = String(table.rows[0].values[field]); }]))
  ];
  for (const [sheet, scenario, mutate, extra] of cases) {
    const runtime = loadTransactionBackend("CREATE");
    if (extra) runtime.sheets.places.headers.push("private header");
    const before = transactionBefore(runtime);
    const verify = runtime.context.AdminPlaceService_verifyIntendedState_;
    let verificationError;
    runtime.context.AdminPlaceService_verifyIntendedState_ = (...args) => {
      const read = runtime.context.SheetService_readTable_;
      runtime.context.SheetService_readTable_ = (...readArgs) => {
        const table = read(...readArgs);
        if (readArgs[0] !== sheet) return table;
        const copy = { ...table, headers: table.headers.slice(), rows: table.rows.map((row) => ({ ...row, values: { ...row.values } })) };
        return mutate(copy) === null ? null : copy;
      };
      try {
        return verify(...args);
      } catch (error) {
        verificationError = error;
        throw error;
      } finally { runtime.context.SheetService_readTable_ = read; }
    };
    assert.deepEqual(callCreate(runtime), { ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดของระบบ" } });
    assert.equal(verificationError && verificationError.message, "ADMIN_PLACE_WRITE_VERIFY", scenario);
    assertRestored(runtime, before);
    assert.equal(runtime.lock.released, 1);
    assert.ok(runtime.calls.events.some((event) => event.startsWith("clear:")));
    assert.ok(runtime.calls.events.findIndex((event) => event.startsWith("clear:")) < runtime.calls.events.indexOf("releaseLock"));
  }
});


test("intended-state verification rejects a changed cell value with its controlled error", () => {
  const runtime = loadTransactionBackend("CREATE");
  const snapshot = { place_id: "private ID", place_headers: ["place_id", "name_th"], draft_headers: [] };
  const intended = { place: { sourceRowNumber: 2, values: { place_id: "private ID", name_th: "expected secret" } } };
  runtime.context.SheetService_readTable_ = () => ({ headers: snapshot.place_headers, rows: [{ sourceRowNumber: 2, values: { place_id: "private ID", name_th: "actual secret" } }] });
  assert.throws(() => runtime.context.AdminPlaceService_verifyIntendedState_(snapshot, intended), { message: "ADMIN_PLACE_WRITE_VERIFY" });
});

test("intended-state verification preserves strict Boolean and Date equality", () => {
  const runtime = loadTransactionBackend("CREATE");
  const timestamp = "2026-10-03T00:00:00.000Z";
  const headers = ["place_id", "value"];
  const snapshot = { place_id: "TEST-PLACE", place_headers: headers, draft_headers: headers };
  for (const [expected, actual, valid] of [
    [false, false, true], [true, true, true], [false, "false", false], [true, "true", false],
    [false, 0, false], [true, 1, false],
    [new Date(timestamp), new Date(timestamp), true],
    [new Date(timestamp), new Date("2026-10-04T00:00:00.000Z"), false],
    [timestamp, new Date(timestamp), false], [new Date(timestamp), timestamp, false],
    [new Date(NaN), new Date(NaN), false]
  ]) {
    const intended = { place: { sourceRowNumber: 2, values: { place_id: "TEST-PLACE", value: expected } },
      draft: { absent: true, sourceRowNumber: null } };
    runtime.context.SheetService_readTable_ = (name) => ({ headers, rows: name === "places" ? [
      { sourceRowNumber: 2, values: { place_id: "TEST-PLACE", value: actual } }
    ] : [] });
    const verify = () => runtime.context.AdminPlaceService_verifyIntendedState_(snapshot, intended);
    if (valid) assert.equal(verify(), true);
    else assert.throws(verify, { message: "ADMIN_PLACE_WRITE_VERIFY" });
  }
});

test("Create timestamp Date coercion preserves the safe failure response and cleanup", () => {
  const runtime = loadTransactionBackend("CREATE");
  const before = transactionBefore(runtime);
  const append = runtime.context.SheetService_appendObjectWithRow_;
  runtime.context.SheetService_appendObjectWithRow_ = (...args) => {
    const result = append(...args);
    if (args[0] === "places") {
      const sheet = runtime.sheets.places;
      sheet.rows[0][sheet.headers.indexOf("created_at")] = new Date();
    }
    return result;
  };
  const expected = plain(runtime.context.AdminPlaceService_error_("SERVER_ERROR", "\u0e40\u0e01\u0e34\u0e14\u0e02\u0e49\u0e2d\u0e1c\u0e34\u0e14\u0e1e\u0e25\u0e32\u0e14\u0e02\u0e2d\u0e07\u0e23\u0e30\u0e1a\u0e1a"));
  assert.deepEqual(callCreate(runtime), expected);
  assertRestored(runtime, before);
});


test("Create and Save success and failure access only business sheets and do not log failures", () => {
  for (const [action, invoke] of [["CREATE", callCreate], ["UPDATE_DRAFT", callSave]]) {
    for (const fail of [false, true]) {
      const runtime = loadTransactionBackend(action, fail ? { failAuditAppendAfterWrite: true } : {});
      const before = transactionBefore(runtime);
      const opened = [];
      const logs = [];
      for (const helper of ["SheetService_getSheet_", "SheetService_readTable_", "SheetService_appendObjectWithRow_",
        "SheetService_updateObjectAtRow_", "SheetService_replaceObjectAtRow_", "SheetService_clearRow_"]) {
        const original = runtime.context[helper];
        runtime.context[helper] = (name, ...args) => {
          opened.push(name); // Record before throwing: swallowed failures must still fail this test.
          assert.ok(["places", "place_drafts", "activity_logs"].includes(name));
          return original(name, ...args);
        };
      }
      runtime.context.console = { error(...args) { logs.push(args); } };
      const result = invoke(runtime);
      if (fail) {
        assertError(result, "SERVER_ERROR");
        assertRestored(runtime, before);
      } else {
        assert.equal(result.ok, true);
        assert.equal(populatedRows(runtime, "activity_logs").length, before.activity.length + 1);
      }
      assert.ok(opened.length > 0);
      assert.deepEqual(opened.filter((name) => !["places", "place_drafts", "activity_logs"].includes(name)), []);
      assert.deepEqual(logs, []);
      assert.equal(runtime.lock.released, 1);
    }
  }
});


test("Create and Save verification or audit failure compensates under lock without epoch or internal leakage", () => {
  for (const [action, invoke, options] of [
    ["CREATE", callCreate, { failPlaceAppendAfterWrite: true }],
    ["CREATE", callCreate, { failDraftAppendAfterWrite: true }],
    ["CREATE", callCreate, { failAuditAppendAfterWrite: true }],
    ["CREATE", callCreate, { wrongPlaceAppendRow: true, unrelatedBusinessRows: true }],
    ["UPDATE_DRAFT", callSave, { noOpActionUpdate: true }],
    ["UPDATE_DRAFT", callSave, { failAuditAppendAfterWrite: true }]
  ]) {
    const runtime = loadTransactionBackend(action, options);
    const before = transactionBefore(runtime);
    const result = invoke(runtime);
    assertError(result, "SERVER_ERROR");
    assertRestored(runtime, before);
    if (action === "CREATE") {
      for (const name of ["places", "place_drafts"]) {
        assert.equal(populatedRows(runtime, name).filter((row) => row.includes("PLC-12345678-1234-4234-8234-123456789abc")).length, 0);
      }
    }
    assert.equal(runtime.calls.propertyReads.length, 0);
    assert.equal(runtime.calls.propertyWrites.length, 0);
    assert.equal(runtime.lock.released, 1);
    assert.equal(JSON.stringify(result).includes("synthetic"), false);
  }

  const rollbackFailure = loadTransactionBackend("UPDATE_DRAFT", { failAuditAppend: true, failRestoreWrite: true });
  const rollbackResult = callSave(rollbackFailure);
  assertError(rollbackResult, "SERVER_ERROR");
  assert.equal(rollbackFailure.lock.released, 1);
  assert.equal(JSON.stringify(rollbackResult).includes("restore"), false);
});

test("Task 5 mutation proofs catch role bypass Published overwrite missing version advance and missing audit", () => {
  const source = adminPlaceServiceSource;

  const fullRowSaveRestore = source.replace(
    "        SheetService_updateObjectAtRow_(target.sheetName, before.sourceRowNumber, restorePatch);",
    "        SheetService_replaceObjectAtRow_(target.sheetName, before.sourceRowNumber, before.values);"
  );
  assert.notEqual(fullRowSaveRestore, source, "full-row Save restore mutation target must match");
  {
    const runtime = loadTransactionBackend("UPDATE_DRAFT", {
      serviceSource: fullRowSaveRestore,
      formulaCells: { places: { description_th: "" } },
      failAuditAppendAfterWrite: true
    });
    const before = transactionBefore(runtime);
    assertError(callSave(runtime), "SERVER_ERROR");
    assert.throws(() => assertRestored(runtime, before), /physical formulas must be restored/);
  }

  const roleBypass = source.replace(
    '  if (!admin || AdminPlaceService_WRITE_ROLES_.indexOf(admin.role) === -1) throw new Error("FORBIDDEN");',
    '  if (!admin) throw new Error("FORBIDDEN");'
  );
  assert.notEqual(roleBypass, source, "role mutation target must match");
  {
    const runtime = loadTransactionBackend("CREATE", { role: "viewer", serviceSource: roleBypass });
    const result = callCreate(runtime);
    assert.throws(() => assertError(result, "FORBIDDEN"));
  }

  const publishedOverwritePatch = source.replace(
    "        var placePatch = {\n          entity_version: nextVersion,",
    "        var placePatch = {\n          name_th: parameters.content.name_th,\n          entity_version: nextVersion,"
  );
  assert.notEqual(publishedOverwritePatch, source, "Published overwrite placePatch mutation target must match");
  const publishedOverwrite = publishedOverwritePatch.replace(
    '["entity_version", "updated_at", "updated_by"], placePatch',
    '["name_th", "entity_version", "updated_at", "updated_by"], placePatch'
  );
  assert.notEqual(
    publishedOverwrite,
    publishedOverwritePatch,
    "Published overwrite selective-update allowlist mutation target must match"
  );
  {
    const runtime = loadTransactionBackend("UPDATE_DRAFT", { serviceSource: publishedOverwrite });
    const before = publicPlaceDetail(runtime);
    callSave(runtime, writeContent({ name_th: "leaked draft" }));
    assert.throws(() => assert.deepEqual(publicPlaceDetail(runtime), before));
  }

  const noVersionAdvance = source.replace(
    "        var nextVersion = place.entityVersion + 1;",
    "        var nextVersion = place.entityVersion;"
  );
  assert.notEqual(noVersionAdvance, source, "version mutation target must match");
  {
    const runtime = loadTransactionBackend("UPDATE_DRAFT", { serviceSource: noVersionAdvance });
    const result = callSave(runtime);
    assert.throws(() => assert.equal(result.data.entity_version, 4));
  }

  const noAudit = source.replace(
    '        AdminPlaceService_appendVerifiedAudit_(admin, "UPDATE_DRAFT", parameters.place_id);',
    "        void admin;"
  );
  assert.notEqual(noAudit, source, "audit mutation target must match");
  {
    const runtime = loadTransactionBackend("UPDATE_DRAFT", { serviceSource: noAudit });
    const result = callSave(runtime);
    assert.equal(result.ok, true, "mutation must demonstrate missing-audit false success");
    assert.throws(() => assert.equal(populatedRows(runtime, "activity_logs").length, 1));
  }
});

test("Publish authorizes only authoritative super_admin and editor roles before mutation", () => {
  for (const role of ["super_admin", "editor"]) {
    const runtime = loadTransactionBackend("PUBLISH", { role });
    assert.equal(callPublish(runtime).ok, true, role);
    assert.deepEqual(runtime.calls.auth, ["TOKEN"]);
  }
  for (const role of ["reviewer", "viewer"]) {
    const runtime = loadTransactionBackend("PUBLISH", { role });
    assertError(callPublish(runtime, { role: "super_admin" }), "FORBIDDEN");
    assert.deepEqual(runtime.calls.sequence, ["auth"]);
    assert.deepEqual(runtime.calls.writes, []);
    assert.deepEqual(runtime.calls.propertyWrites, []);
  }
  const unauthorized = loadTransactionBackend("PUBLISH", { authError: "UNAUTHORIZED" });
  assertError(callPublish(unauthorized), "UNAUTHORIZED");
  assert.deepEqual(unauthorized.calls.sequence, ["auth"]);
  assert.deepEqual(unauthorized.calls.writes, []);
});

test("Publish accepts only canonical place_id and expected_version with no force or system fields", () => {
  for (const payload of [
    {},
    { place_id: "TX-PLACE" },
    { place_id: "TX-PLACE", expected_version: 3, force: true },
    { place_id: "TX-PLACE", expected_version: 3, status: "published" },
    { place_id: " TX-PLACE", expected_version: 3 },
    { place_id: 7, expected_version: 3 },
    { place_id: "TX-PLACE", expected_version: "3" },
    { place_id: "TX-PLACE", expected_version: 0 }
  ]) {
    const runtime = loadTransactionBackend("PUBLISH");
    const result = plain(runtime.context.adminPublishPlace_("TOKEN", payload));
    assertError(result, "VALIDATION_ERROR");
    assert.equal(runtime.calls.events.includes("tryLock:10000"), false);
    assert.deepEqual(runtime.calls.writes, []);
    assert.deepEqual(runtime.calls.propertyWrites, []);
  }
});

test("Publish repeats full draft validation and rejects incomplete invalid archived or missing revisions", () => {
  for (const field of [
    "name_th", "district", "province", "category", "short_description_th", "description_th", "coordinate_status"
  ]) {
    const runtime = loadTransactionBackend("PUBLISH");
    runtime.sheets.place_drafts.rows[0][DRAFT_HEADERS.indexOf(field)] = "";
    assertError(callPublish(runtime), "VALIDATION_ERROR");
    assert.deepEqual(runtime.calls.writes, []);
    assert.deepEqual(runtime.calls.propertyWrites, []);
  }
  for (const [field, value] of [
    ["category", "future_category"],
    ["latitude", 91],
    ["longitude", ""],
    ["tags", { nested: true }],
    ["gallery_media_ids", "unapproved-gallery-id"]
  ]) {
    const runtime = loadTransactionBackend("PUBLISH");
    runtime.sheets.place_drafts.rows[0][DRAFT_HEADERS.indexOf(field)] = value;
    assertError(callPublish(runtime), "VALIDATION_ERROR");
    assert.deepEqual(runtime.calls.writes, []);
    assert.deepEqual(runtime.calls.propertyWrites, []);
  }
  const archived = loadTransactionBackend("PUBLISH");
  archived.sheets.places.rows[0][PLACE_HEADERS.indexOf("status")] = "archived";
  assertError(callPublish(archived), "VALIDATION_ERROR");
  assert.deepEqual(archived.calls.writes, []);

  const missing = loadTransactionBackend("PUBLISH");
  missing.sheets.place_drafts.rows = [];
  missing.sheets.place_drafts.formulas = [];
  assertError(callPublish(missing), "NOT_FOUND");
  assert.deepEqual(missing.calls.writes, []);

  const duplicate = loadTransactionBackend("PUBLISH");
  duplicate.sheets.place_drafts.rows.push([...duplicate.sheets.place_drafts.rows[0]]);
  duplicate.sheets.place_drafts.formulas.push(new Set());
  assertError(callPublish(duplicate), "SERVER_ERROR");
  assert.deepEqual(duplicate.calls.writes, []);

  const optionalEnglish = loadTransactionBackend("PUBLISH");
  for (const field of CONTENT_KEYS.filter((key) => key.endsWith("_en"))) {
    optionalEnglish.sheets.place_drafts.rows[0][DRAFT_HEADERS.indexOf(field)] = "";
  }
  assert.equal(callPublish(optionalEnglish).ok, true);
});

test("Publish rejects stale clients before mutation and distinguishes corrupt draft versions", () => {
  const stale = loadTransactionBackend("PUBLISH");
  assertError(callPublish(stale, { expected_version: 2 }), "CONFLICT");
  assert.deepEqual(stale.calls.writes, []);
  assert.deepEqual(stale.calls.propertyWrites, []);

  const entityDraftMismatch = loadTransactionBackend("PUBLISH");
  entityDraftMismatch.sheets.place_drafts.rows[0][DRAFT_HEADERS.indexOf("draft_version")] = 2;
  assertError(callPublish(entityDraftMismatch), "SERVER_ERROR");
  assert.deepEqual(entityDraftMismatch.calls.writes, []);

  const staleBase = loadTransactionBackend("PUBLISH");
  staleBase.sheets.place_drafts.rows[0][DRAFT_HEADERS.indexOf("base_published_version")] = 1;
  assertError(callPublish(staleBase), "CONFLICT");
  assert.deepEqual(staleBase.calls.writes, []);
  assert.deepEqual(staleBase.calls.propertyWrites, []);
  assert.equal(populatedRows(staleBase, "activity_logs").length, 0);

  const changedLifecycle = loadTransactionBackend("PUBLISH", { changeLifecycleBeforeCapture: true });
  assertError(callPublish(changedLifecycle), "VALIDATION_ERROR");
  assert.deepEqual(changedLifecycle.calls.writes, []);
  assert.deepEqual(changedLifecycle.calls.propertyWrites, []);
});

test("Publish promotes the complete active draft increments versions closes it bumps epoch and audits once", () => {
  for (const role of ["super_admin", "editor"]) {
    const runtime = loadTransactionBackend("PUBLISH", { role });
    const beforePlace = sheetRecord(runtime, "places");
    const beforeDraft = sheetRecord(runtime, "place_drafts");
    const beforePublic = publicPlaceDetail(runtime);
    assert.equal(beforePublic.data.name_th, "prior published");
    const result = callPublish(runtime);
    assert.equal(result.ok, true);
    assert.deepEqual(Object.keys(result.data), WRITE_SUCCESS_KEYS);
    assert.deepEqual({
      place_id: result.data.place_id, status: result.data.status, entity_version: result.data.entity_version,
      working_version: result.data.working_version, published_version: result.data.published_version,
      has_active_draft: result.data.has_active_draft
    }, { place_id: "TX-PLACE", status: "published", entity_version: 4, working_version: 4, published_version: 3, has_active_draft: false });
    const published = sheetRecord(runtime, "places");
    for (const field of CONTENT_KEYS) assert.equal(published[field], beforeDraft[field], `Published ${field} comes from the active draft`);
    for (const field of ["cover_image_url", "gallery_image_urls", "video_url"]) {
      assert.equal(published[field], beforeDraft[field], `server-owned ${field} follows the promoted snapshot`);
    }
    assert.equal(published.place_id, beforePlace.place_id);
    assert.equal(published.created_at, beforePlace.created_at);
    assert.equal(published.created_by, beforePlace.created_by);
    assert.equal(published.status, "published");
    assert.equal(published.entity_version, 4);
    assert.equal(published.published_version, 3);
    assert.equal(published.updated_by, "ADM-authoritative");
    assert.equal(published.published_by, "ADM-authoritative");
    assert.equal(published.updated_at, result.data.updated_at);
    assert.equal(published.published_at, result.data.updated_at);
    assert.equal(populatedRows(runtime, "place_drafts").length, 0);
    assert.equal(runtime.properties.get("PLACE_PUBLIC_CACHE_EPOCH"), "42");
    assert.equal(runtime.calls.propertyWrites.filter((entry) => entry.phase === "action" && entry.method === "setProperty").length, 1);
    assert.equal(populatedRows(runtime, "activity_logs").length, 1);
    const audit = sheetRecord(runtime, "activity_logs");
    assert.equal(audit.action, "PUBLISH");
    assert.equal(audit.actor_admin_id, "ADM-authoritative");
    assert.equal(audit.entity_id, "TX-PLACE");
    const afterPublic = publicPlaceDetail(runtime);
    assert.equal(afterPublic.data.name_th, "publish candidate");
    assert.equal(afterPublic.data.description, "publish detail");
    assert.equal(JSON.stringify(afterPublic).includes("draft_version"), false);
    assert.equal(JSON.stringify(afterPublic).includes("ADM-authoritative"), false);
    assert.equal(runtime.lock.released, 1);
    assert.equal(runtime.calls.events.at(-1), "releaseLock");
  }
});

test("Publish makes a draft-only Place public with the first Published Version", () => {
  const runtime = loadTransactionBackend("PUBLISH");
  runtime.sheets.places.rows[0][PLACE_HEADERS.indexOf("status")] = "draft";
  runtime.sheets.places.rows[0][PLACE_HEADERS.indexOf("entity_version")] = 1;
  runtime.sheets.places.rows[0][PLACE_HEADERS.indexOf("published_version")] = 0;
  runtime.sheets.place_drafts.rows[0][DRAFT_HEADERS.indexOf("draft_version")] = 1;
  runtime.sheets.place_drafts.rows[0][DRAFT_HEADERS.indexOf("base_published_version")] = 0;
  assertError(publicPlaceDetail(runtime), "NOT_FOUND");
  const result = callPublish(runtime, { expected_version: 1 });
  assert.equal(result.ok, true);
  assert.deepEqual({
    status: result.data.status, entity_version: result.data.entity_version,
    published_version: result.data.published_version, has_active_draft: result.data.has_active_draft
  }, { status: "published", entity_version: 2, published_version: 1, has_active_draft: false });
  assert.equal(publicPlaceDetail(runtime).data.name_th, "publish candidate");
});

test("Every post-mutation Publish failure restores Place draft epoch and removes the audit before unlock", () => {
  for (const options of [
    { failPlaceReplaceAfterWrite: true },
    { failDraftClearAfterWrite: true },
    { incompleteActionClear: true },
    { failEpochWrite: true },
    { failEpochWriteAfterWrite: true },
    { failAuditAppendAfterWrite: true },
    { failFinalPublishVerification: true }
  ]) {
    const runtime = loadTransactionBackend("PUBLISH", options);
    const before = transactionBefore(runtime);
    const beforePublic = publicPlaceDetail(runtime);
    const result = callPublish(runtime);
    assertError(result, "SERVER_ERROR");
    assertRestored(runtime, before);
    assert.deepEqual(publicPlaceDetail(runtime), beforePublic);
    assert.equal(populatedRows(runtime, "activity_logs").length, 0);
    assert.equal(runtime.lock.released, 1);
    assert.equal(runtime.calls.events.at(-1), "releaseLock");
  }

  const rollbackMismatch = loadTransactionBackend("PUBLISH", { failAuditAppend: true, failRestoreWrite: true });
  const result = callPublish(rollbackMismatch);
  assertError(result, "SERVER_ERROR");
  assert.equal(rollbackMismatch.lock.released, 1);
  assert.equal(JSON.stringify(result).includes("synthetic"), false);

  const responseFailure = loadTransactionBackend("PUBLISH");
  responseFailure.sheets.places.rows[0][PLACE_HEADERS.indexOf("created_at")] = { malformed: true };
  const responseBefore = transactionBefore(responseFailure);
  assertError(callPublish(responseFailure), "SERVER_ERROR");
  assertRestored(responseFailure, responseBefore);
  assert.equal(populatedRows(responseFailure, "activity_logs").length, 0, "response failure must remove the verified audit");
});

test("Publish mutation proofs catch skipped validation epoch audit and draft consumption", () => {
  const source = adminPlaceServiceSource;
  const mutations = [
    {
      label: "validation",
      source: source.replace(
        "      var promotedContent = AdminPlaceService_publishContent_(capturedDraft, parameters.place_id);",
        "      var promotedContent = AdminPlaceService_contentForPromotionWithoutValidation_(capturedDraft);"
      ),
      prepare(runtime) { runtime.context.AdminPlaceService_contentForPromotionWithoutValidation_ = () => writeContent({ name_th: "" }); },
      verify(runtime) { assertError(callPublish(runtime), "VALIDATION_ERROR"); }
    },
    {
      label: "epoch",
      source: source.replace("        var nextEpoch = PlaceService_bumpCacheEpoch_();", "        var nextEpoch = PlaceService_cacheEpoch_();"),
      verify(runtime) { assert.equal(callPublish(runtime).ok, true); assert.equal(runtime.properties.get("PLACE_PUBLIC_CACHE_EPOCH"), "42"); }
    },
    {
      label: "audit",
      source: source.replace(
        '        var audit = AdminPlaceService_appendVerifiedAudit_(admin, "PUBLISH", parameters.place_id);',
        "        var audit = null;"
      ),
      verify(runtime) { assert.equal(callPublish(runtime).ok, true); assert.equal(populatedRows(runtime, "activity_logs").length, 1); }
    },
    {
      label: "draft consumption",
      source: source.replace(
        "        SheetService_clearRow_(AdminPlaceSchema_DRAFTS_SHEET_NAME_, state.rows.draft.sourceRowNumber);",
        "        void state.rows.draft.sourceRowNumber;"
      ),
      verify(runtime) { assert.equal(callPublish(runtime).ok, true); assert.equal(populatedRows(runtime, "place_drafts").length, 0); }
    }
  ];
  for (const mutation of mutations) {
    assert.notEqual(mutation.source, source, `${mutation.label} mutation target must match`);
    const runtime = loadTransactionBackend("PUBLISH", { serviceSource: mutation.source });
    if (mutation.prepare) mutation.prepare(runtime);
    assert.throws(() => mutation.verify(runtime), undefined, `${mutation.label} mutant must be rejected`);
  }
});

test("Task 9 lifecycle actions authorize only super_admin and editor and require exact payloads", () => {
  for (const action of ["UNPUBLISH", "ARCHIVE", "RESTORE"]) {
    for (const role of ["super_admin", "editor"]) {
      assert.equal(callLifecycle(loadTransactionBackend(action, { role }), action).ok, true, `${action} ${role}`);
    }
    for (const role of ["reviewer", "viewer"]) {
      const runtime = loadTransactionBackend(action, { role });
      assertError(callLifecycle(runtime, action), "FORBIDDEN");
      assert.deepEqual(runtime.calls.sequence, ["auth"]);
      assert.deepEqual(runtime.calls.writes, []);
    }
    const unauthorized = loadTransactionBackend(action, { authError: "UNAUTHORIZED" });
    assertError(callLifecycle(unauthorized, action), "UNAUTHORIZED");
  }
  for (const [action, payload] of [
    ["UNPUBLISH", { place_id: " TX-PLACE", expected_version: 2 }],
    ["UNPUBLISH", { place_id: "TX-PLACE", expected_version: 2, force: true }],
    ["ARCHIVE", { place_id: "TX-PLACE", expected_version: 4 }],
    ["ARCHIVE", { place_id: "TX-PLACE", expected_version: 4, confirmed: "true" }],
    ["ARCHIVE", { place_id: "TX-PLACE", expected_version: 4, confirmed: true, dependency_count: 0 }],
    ["RESTORE", { place_id: "TX-PLACE", expected_version: "4" }]
  ]) {
    const runtime = loadTransactionBackend(action);
    const method = runtime.context[`admin${action[0]}${action.slice(1).toLowerCase()}Place_`];
    assertError(plain(method("TOKEN", payload)), "VALIDATION_ERROR");
    assert.equal(runtime.calls.events.includes("tryLock:10000"), false);
    assert.deepEqual(runtime.calls.writes, []);
  }
});

test("Unpublish preserves or reconstructs one draft synchronizes versions hides Public bumps epoch and audits", () => {
  for (const withDraft of [false, true]) {
    const runtime = loadTransactionBackend("UNPUBLISH", { unpublishWithDraft: withDraft });
    const priorPlace = sheetRecord(runtime, "places");
    const priorDraft = withDraft ? sheetRecord(runtime, "place_drafts") : null;
    assert.equal(publicPlaceDetail(runtime).ok, true);
    const result = callLifecycle(runtime, "UNPUBLISH");
    assert.equal(result.ok, true);
    assert.deepEqual(Object.keys(result.data), WRITE_SUCCESS_KEYS);
    assert.deepEqual({ status: result.data.status, entity: result.data.entity_version, working: result.data.working_version,
      published: result.data.published_version, draft: result.data.has_active_draft },
    { status: "draft", entity: 3, working: 3, published: 2, draft: true });
    const afterPlace = sheetRecord(runtime, "places");
    const afterDraft = sheetRecord(runtime, "place_drafts");
    assert.equal(afterPlace.status, "draft");
    assert.equal(afterPlace.entity_version, 3);
    assert.equal(afterPlace.published_version, 2);
    assert.equal(afterDraft.draft_version, 3);
    assert.equal(afterDraft.base_published_version, 2);
    assert.equal(afterDraft.name_th, withDraft ? priorDraft.name_th : priorPlace.name_th);
    assert.equal(runtime.properties.get("PLACE_PUBLIC_CACHE_EPOCH"), "42");
    assert.equal(runtime.calls.propertyWrites.filter((entry) => entry.phase === "action").length, 1);
    assert.equal(sheetRecord(runtime, "activity_logs").action, "UNPUBLISH");
    assertError(publicPlaceDetail(runtime), "NOT_FOUND");
  }
});

test("Archive re-inspects dependencies under lock and applies exact published and draft epoch rules", () => {
  for (const draftSource of [false, true]) {
    const runtime = loadTransactionBackend("ARCHIVE", { archiveDraftSource: draftSource });
    const result = callLifecycle(runtime, "ARCHIVE");
    assert.equal(result.ok, true);
    assert.deepEqual(Object.keys(result.data), [...WRITE_SUCCESS_KEYS, "dependencies"]);
    assert.deepEqual(Object.keys(result.data.dependencies), DEPENDENCY_GROUPS);
    for (const group of DEPENDENCY_GROUPS) assert.deepEqual(result.data.dependencies[group], []);
    assert.equal(result.data.status, "archived");
    assert.equal(result.data.entity_version, 5);
    assert.equal(result.data.published_version, draftSource ? null : 3);
    assert.equal(sheetRecord(runtime, "place_drafts").draft_version, 5);
    assert.equal(sheetRecord(runtime, "activity_logs").action, "ARCHIVE");
    for (const name of Object.keys(DEPENDENCY_HEADERS)) {
      assert.equal(runtime.calls.reads.some((entry) => entry.name === name), true, `${name} must be freshly inspected`);
    }
    if (draftSource) {
      assert.deepEqual(runtime.calls.propertyReads, []);
      assert.deepEqual(runtime.calls.propertyWrites, []);
    } else {
      assert.equal(runtime.properties.get("PLACE_PUBLIC_CACHE_EPOCH"), "42");
      assertError(publicPlaceDetail(runtime), "NOT_FOUND");
    }
  }

  const noDraft = loadTransactionBackend("ARCHIVE", { archiveWithoutDraft: true });
  const noDraftResult = callLifecycle(noDraft, "ARCHIVE");
  assert.equal(noDraftResult.ok, true);
  assert.equal(noDraftResult.data.has_active_draft, false);
  assert.equal(populatedRows(noDraft, "place_drafts").length, 0, "published Archive retains verified draft absence");

  const appeared = loadTransactionBackend("ARCHIVE", {
    routes: [{ route_id: "ROUTE-NEW", name_th: "New dependency", name_en: "", status: "published" }],
    route_places: [{ route_place_id: "RP-NEW", route_id: "ROUTE-NEW", place_id: "TX-PLACE", status: "published" }]
  });
  assert.equal(callLifecycle(appeared, "ARCHIVE").ok, true, "fresh valid dependency is detected and confirmed server-side");
  assert.equal(appeared.calls.reads.some((entry) => entry.name === "route_places"), true);

  const changed = loadTransactionBackend("ARCHIVE");
  const previewA = plain(changed.context.adminInspectPlaceDependencies_("TOKEN", { place_id: "TX-PLACE" })).data.groups;
  assert.deepEqual(previewA.routes, []);
  changed.sheets.routes.rows.push(DEPENDENCY_HEADERS.routes.map((header) => ({
    route_id: "ROUTE-B", name_th: "Execution dependency B", name_en: "", status: "published"
  })[header]));
  changed.sheets.routes.formulas.push(new Set());
  changed.sheets.route_places.rows.push(DEPENDENCY_HEADERS.route_places.map((header) => ({
    route_place_id: "RP-B", route_id: "ROUTE-B", place_id: "TX-PLACE", status: "published"
  })[header]));
  changed.sheets.route_places.formulas.push(new Set());
  const execution = callLifecycle(changed, "ARCHIVE");
  assert.equal(execution.ok, true);
  assert.deepEqual(execution.data.dependencies, {
    routes: [{ entity_id: "ROUTE-B", label: "Execution dependency B" }],
    nearby_places: [], products: [], events: [], gallery: [], trip_templates: [], reviews: []
  });
  assert.equal("checked_at" in execution.data.dependencies, false);
  assert.equal(JSON.stringify(execution.data).includes("sourceRowNumber"), false);

  const removed = loadTransactionBackend("ARCHIVE", {
    products: [{ product_id: "PRODUCT-A", name_th: "Preview dependency A", name_en: "", related_place_id: "TX-PLACE", status: "published" }]
  });
  const nonzeroPreview = plain(removed.context.adminInspectPlaceDependencies_("TOKEN", { place_id: "TX-PLACE" })).data.groups;
  assert.deepEqual(nonzeroPreview.products, [{ entity_id: "PRODUCT-A", label: "Preview dependency A" }]);
  removed.sheets.products.rows = [];
  removed.sheets.products.formulas = [];
  const emptyExecution = callLifecycle(removed, "ARCHIVE");
  assert.equal(emptyExecution.ok, true);
  for (const group of DEPENDENCY_GROUPS) assert.deepEqual(emptyExecution.data.dependencies[group], []);

  const stalePreview = loadTransactionBackend("ARCHIVE", {
    route_places: [{ route_place_id: "RP-NEW", route_id: "ROUTE-MISSING", place_id: "TX-PLACE", status: "published" }]
  });
  const before = transactionBefore(stalePreview);
  assertError(callLifecycle(stalePreview, "ARCHIVE"), "SERVER_ERROR");
  assertRestored(stalePreview, before);
});

test("Restore returns archived content to draft only while preserving retained drafts and never touching epoch", () => {
  for (const withDraft of [false, true]) {
    const runtime = loadTransactionBackend("RESTORE", { restoreWithDraft: withDraft });
    const retained = withDraft ? sheetRecord(runtime, "place_drafts") : sheetRecord(runtime, "places");
    const result = callLifecycle(runtime, "RESTORE");
    assert.equal(result.ok, true);
    assert.deepEqual({ status: result.data.status, entity: result.data.entity_version, published: result.data.published_version,
      draft: result.data.has_active_draft }, { status: "draft", entity: 5, published: 3, draft: true });
    assert.equal(sheetRecord(runtime, "place_drafts").name_th, retained.name_th);
    assert.equal(sheetRecord(runtime, "place_drafts").draft_version, 5);
    assert.equal(sheetRecord(runtime, "place_drafts").base_published_version, 3);
    assert.equal(sheetRecord(runtime, "places").status, "draft");
    assert.deepEqual(runtime.calls.propertyReads, []);
    assert.deepEqual(runtime.calls.propertyWrites, []);
    assert.equal(sheetRecord(runtime, "activity_logs").action, "RESTORE");
    assertError(publicPlaceDetail(runtime), "NOT_FOUND");
  }
});

test("Unpublish and Restore reconstruct exact canonical Gallery storage at the Sheet boundary", () => {
  for (const action of ["UNPUBLISH", "RESTORE"]) {
    for (const gallery of ["", "place-tx-place-gallery-b|place-tx-place-gallery-a"]) {
      const runtime = loadTransactionBackend(action);
      runtime.sheets.places.rows[0][PLACE_HEADERS.indexOf("gallery_media_ids")] = gallery;
      const result = callLifecycle(runtime, action);
      assert.equal(result.ok, true, `${action} ${gallery || "empty"}`);
      const stored = sheetRecord(runtime, "place_drafts").gallery_media_ids;
      assert.equal(typeof stored, "string", `${action} must store a scalar Gallery value`);
      assert.equal(stored, gallery, `${action} must preserve exact canonical Gallery order`);
    }
  }
});

test("Lifecycle conflicts invalid transitions and post-mutation failures never return false success", () => {
  for (const action of ["UNPUBLISH", "ARCHIVE", "RESTORE"]) {
    const stale = loadTransactionBackend(action);
    assertError(callLifecycle(stale, action, { expected_version: 1 }), "CONFLICT");
    assert.deepEqual(stale.calls.writes, []);
    assert.deepEqual(stale.calls.propertyWrites, []);
  }
  for (const [action, status] of [["UNPUBLISH", "draft"], ["UNPUBLISH", "archived"], ["ARCHIVE", "archived"], ["RESTORE", "published"], ["RESTORE", "draft"]]) {
    const runtime = loadTransactionBackend(action, action === "UNPUBLISH" && status === "draft" ? { unpublishWithDraft: true } : {});
    runtime.sheets.places.rows[0][PLACE_HEADERS.indexOf("status")] = status;
    if (status === "draft" && runtime.sheets.place_drafts.rows.length === 0) {
      runtime.sheets.place_drafts.rows.push(DRAFT_HEADERS.map((header) => draft("TX-PLACE", 4, 3)[header] ?? ""));
      runtime.sheets.place_drafts.formulas.push(new Set());
    }
    assertError(callLifecycle(runtime, action), "VALIDATION_ERROR");
    assert.deepEqual(runtime.calls.writes, []);
  }
  const archivedPublish = loadTransactionBackend("PUBLISH");
  archivedPublish.sheets.places.rows[0][PLACE_HEADERS.indexOf("status")] = "archived";
  assertError(callPublish(archivedPublish), "VALIDATION_ERROR");

  for (const action of ["UNPUBLISH", "ARCHIVE", "RESTORE"]) {
    const failures = [
      { failPlaceUpdateAfterWrite: true },
      { failAuditAppendAfterWrite: true },
      { failFinalPublishVerification: true }
    ];
    if (action !== "ARCHIVE") failures.push({ failDraftAppendAfterWrite: true });
    if (action !== "RESTORE") failures.push({ failEpochWriteAfterWrite: true });
    for (const options of failures) {
      const runtime = loadTransactionBackend(action, options);
      const before = transactionBefore(runtime);
      assertError(callLifecycle(runtime, action), "SERVER_ERROR");
      assertRestored(runtime, before);
      assert.equal(runtime.lock.released, 1);
      assert.equal(runtime.calls.events.at(-1), "releaseLock");
    }
  }
  const compensationFailure = loadTransactionBackend("UNPUBLISH", { failAuditAppendAfterWrite: true, failRestoreWrite: true });
  const safe = callLifecycle(compensationFailure, "UNPUBLISH");
  assertError(safe, "SERVER_ERROR");
  assert.equal(JSON.stringify(safe).includes("synthetic"), false);
});

test("Task 9 mutation proofs reject skipped confirmation reinspection draft synchronization and conditional epoch", () => {
  const source = adminPlaceServiceSource;
  const mutations = [
    {
      label: "confirmation",
      source: source.replace("      (requireConfirmation && source.confirmed !== true))", "      false)"),
      run(runtime) {
        const result = plain(runtime.context.adminArchivePlace_("TOKEN", { place_id: "TX-PLACE", expected_version: 4, confirmed: false }));
        assertError(result, "VALIDATION_ERROR");
      },
      runtime: (serviceSource) => loadTransactionBackend("ARCHIVE", { serviceSource })
    },
    {
      label: "locked dependency reinspection",
      source: source.replace(
        "      var dependencies = AdminPlaceService_inspectDependencies_(parameters.place_id).groups;",
        "      var dependencies = { routes: [], nearby_places: [], products: [], events: [], gallery: [], trip_templates: [], reviews: [] };"
      ),
      run(runtime) { assertError(callLifecycle(runtime, "ARCHIVE"), "SERVER_ERROR"); },
      runtime: (serviceSource) => loadTransactionBackend("ARCHIVE", {
        serviceSource,
        route_places: [{ route_place_id: "RP-NEW", route_id: "ROUTE-MISSING", place_id: "TX-PLACE", status: "published" }]
      })
    },
    {
      label: "draft version synchronization",
      source: source.replace(
        "var draftPatch = { draft_version: nextVersion, updated_at: occurredAt, updated_by: admin.admin_id };",
        "var draftPatch = { draft_version: lifecycle.entityVersion, updated_at: occurredAt, updated_by: admin.admin_id };"
      ),
      run(runtime) {
        assert.equal(callLifecycle(runtime, "RESTORE").ok, true);
        assert.equal(sheetRecord(runtime, "place_drafts").draft_version, 5);
      },
      runtime: (serviceSource) => loadTransactionBackend("RESTORE", { restoreWithDraft: true, serviceSource })
    },
    {
      label: "published lifecycle epoch",
      source: source.replace("    if (bumpEpoch) {\n      nextEpoch = PlaceService_bumpCacheEpoch_();", "    if (false) {\n      nextEpoch = PlaceService_bumpCacheEpoch_();"),
      run(runtime) { assert.equal(callLifecycle(runtime, "UNPUBLISH").ok, true); assert.equal(runtime.properties.get("PLACE_PUBLIC_CACHE_EPOCH"), "42"); },
      runtime: (serviceSource) => loadTransactionBackend("UNPUBLISH", { serviceSource })
    }
  ];
  for (const mutation of mutations) {
    assert.notEqual(mutation.source, source, `${mutation.label} mutation target must match`);
    const runtime = mutation.runtime(mutation.source);
    assert.throws(() => mutation.run(runtime), undefined, `${mutation.label} mutant must be rejected`);
  }
});

test("transaction lock timeout fails closed and release occurs only from finally", () => {
  const timeout = loadTransactionBackend("UPDATE_DRAFT", { lockTimeout: true });
  assertError(runSyntheticTransaction(timeout), "SERVER_ERROR");
  assert.deepEqual(timeout.calls.events, ["tryLock:10000"]);
  assert.equal(timeout.lock.released, 0);
  assert.equal(timeout.calls.writes.length, 0);

  const failed = loadTransactionBackend("CREATE", { failurePoint: "afterPlace" });
  const before = transactionBefore(failed);
  assertError(runSyntheticTransaction(failed), "SERVER_ERROR");
  assertRestored(failed, before);
  assert.equal(failed.lock.released, 1);
  assert.equal(failed.calls.events.at(-1), "releaseLock");
  assert.equal(failed.calls.events.some((event) => event === "read:places:restore"), true);
});

test("transaction stale version conflicts before every write and never appends success audit", () => {
  const stale = loadTransactionBackend("UPDATE_DRAFT");
  const result = runSyntheticTransaction(stale, { expectedVersion: 2 });
  assertError(result, "CONFLICT");
  assert.equal(stale.calls.writes.length, 0);
  assert.equal(stale.sheets.activity_logs.rows.length, 0);
  assert.equal(stale.lock.released, 1);

  const invalid = loadTransactionBackend("UPDATE_DRAFT");
  assertError(runSyntheticTransaction(invalid, { expectedVersion: "3" }), "VALIDATION_ERROR");
  assert.equal(invalid.calls.writes.length, 0);

  const staleDraftBase = loadTransactionBackend("PUBLISH");
  staleDraftBase.sheets.place_drafts.rows[0][DRAFT_HEADERS.indexOf("base_published_version")] = 1;
  assertError(runSyntheticTransaction(staleDraftBase, { expectedVersion: 3 }), "CONFLICT");
  assert.equal(staleDraftBase.calls.writes.length, 0);
});

test("transaction success appends exactly one verified uppercase authoritative audit with exact aliases", () => {
  for (const action of AUDIT_ACTIONS) {
    const runtime = loadTransactionBackend(action, { dateCells: action === "PUBLISH", cloneDateReads: action === "PUBLISH" });
    const result = runSyntheticTransaction(runtime, { includeEpoch: ["PUBLISH", "UNPUBLISH", "ARCHIVE"].includes(action) });
    assert.equal(result.ok, true, action);
    const appends = runtime.calls.writes.filter((write) => write.method === "append" && write.name === "activity_logs");
    assert.equal(appends.length, 1, action);
    assert.deepEqual(Object.keys(appends[0].record).sort(), [
      "action", "actor_admin_id", "admin_id", "audit_id", "created_at", "description", "entity_id", "entity_type", "log_id", "occurred_at"
    ]);
    const audit = appends[0].record;
    assert.equal(audit.action, action);
    assert.equal(audit.action, audit.action.toUpperCase());
    assert.equal(audit.actor_admin_id, "ADM-authoritative");
    assert.equal(audit.entity_type, "place");
    assert.equal(audit.entity_id, "TX-PLACE");
    assert.equal(audit.description, action);
    assert.equal(audit.log_id, audit.audit_id);
    assert.equal(audit.admin_id, audit.actor_admin_id);
    assert.equal(audit.created_at, audit.occurred_at);
    assert.equal(runtime.sheets.activity_logs.rows.filter((row) => row.some((cell) => cell !== "")).length, 1);
    assert.deepEqual(Object.keys(result.data), ["place_id", "status"]);
    assert.equal(/audit_id|actor_admin_id|sourceRowNumber|rollback|sheet/i.test(JSON.stringify(result)), false);
    assert.equal(runtime.lock.released, 1);
    assert.equal(runtime.calls.events.at(-1), "releaseLock");
  }
});

test("transaction audit append and readback failures remove audit and restore full business state", () => {
  for (const options of [
    { failAuditAppend: true },
    { failAuditAppendAfterWrite: true },
    { failAuditRead: true },
    { corruptAuditReadback: true },
    { corruptAuditIdReadback: true },
    { corruptAuditDescriptionReadback: true },
    { preexistingAuditCollision: true }
  ]) {
    const runtime = loadTransactionBackend("PUBLISH", options);
    const before = transactionBefore(runtime);
    const result = runSyntheticTransaction(runtime, { includeEpoch: true });
    assertError(result, "SERVER_ERROR");
    assertRestored(runtime, before);
    assert.equal(runtime.lock.released, 1);
    assert.equal(JSON.stringify(result).includes("synthetic"), false);
  }
  const wrongRow = loadTransactionBackend("PUBLISH", { wrongAuditAppendRow: true });
  const wrongRowBefore = transactionBefore(wrongRow);
  const wrongRowResult = runSyntheticTransaction(wrongRow, { includeEpoch: true });
  assertError(wrongRowResult, "SERVER_ERROR");
  assert.deepEqual(wrongRow.sheets.activity_logs.rows[0], wrongRowBefore.activity[0], "pre-existing audit must never be cleared");
  assert.equal(wrongRow.sheets.activity_logs.rows[1].every((cell) => cell === ""), true, "generated-ID audit row must be fully blank");
  assert.equal(wrongRow.lock.released, 1);
});

test("transaction compensation table restores every action and fully clears only new rows", () => {
  for (const action of AUDIT_ACTIONS) {
    const runtime = loadTransactionBackend(action, {
      failurePoint: "afterMutation", extraColumns: action === "PUBLISH", dateCells: action === "PUBLISH", cloneDateReads: action === "PUBLISH"
    });
    const before = transactionBefore(runtime);
    const includeEpoch = ["PUBLISH", "UNPUBLISH", "ARCHIVE"].includes(action);
    const result = runSyntheticTransaction(runtime, { includeEpoch });
    assertError(result, "SERVER_ERROR");
    assertRestored(runtime, before);
    const restoreWrites = runtime.calls.writes.filter((write) => write.phase === "restore").map((write) => write.name);
    assert.deepEqual(restoreWrites, ["place_drafts", "places"], `${action} compensates draft then Place`);
    if (includeEpoch) {
      assert.equal(runtime.calls.propertyWrites.some((write) => write.phase === "restore" && write.key === "PLACE_PUBLIC_CACHE_EPOCH"), true);
    }
    if (action === "RESTORE") {
      assert.equal(runtime.calls.propertyReads.length, 0, "RESTORE must not read the Public epoch");
      assert.equal(runtime.calls.propertyWrites.length, 0, "RESTORE must not write the Public epoch");
    }
    assert.equal(runtime.lock.released, 1);
    assert.equal(runtime.calls.events.at(-1), "releaseLock");
  }
  const newlyCreatedDraft = loadTransactionBackend("UPDATE_DRAFT", { failurePoint: "afterMutation", updateDraftWithoutPrior: true });
  const newlyCreatedDraftBefore = transactionBefore(newlyCreatedDraft);
  assertError(runSyntheticTransaction(newlyCreatedDraft), "SERVER_ERROR");
  assertRestored(newlyCreatedDraft, newlyCreatedDraftBefore);

  const draftArchive = loadTransactionBackend("ARCHIVE", { failurePoint: "afterMutation", archiveDraftSource: true });
  const draftArchiveBefore = transactionBefore(draftArchive);
  assertError(runSyntheticTransaction(draftArchive, { includeEpoch: false }), "SERVER_ERROR");
  assertRestored(draftArchive, draftArchiveBefore);
  assert.equal(draftArchive.calls.propertyReads.length, 0, "draft ARCHIVE must not read the Public epoch");
  assert.equal(draftArchive.calls.propertyWrites.length, 0, "draft ARCHIVE must not write the Public epoch");
});

test("transaction Router exposes Task 9 lifecycle paths but no force or later route", () => {
  const { context, calls } = loadBackend();
  for (const action of ["adminCreatePlace", "adminSavePlaceDraft", "adminPublishPlace"]) {
    const result = post(context, { action, token: "TOKEN", payload: { force: true } });
    assertError(result, "VALIDATION_ERROR");
  }
  assertError(post(context, { action: "adminInspectPlaceDependencies", token: "TOKEN", payload: { force: true } }), "VALIDATION_ERROR");
  for (const action of ["adminUnpublishPlace", "adminArchivePlace", "adminRestorePlace"]) {
    const result = post(context, { action, token: "TOKEN", payload: { force: true } });
    assertError(result, "VALIDATION_ERROR");
  }
  assert.equal(calls.auth.length, 7);
  assert.equal(calls.writes.length, 0);
});

test("transaction partial Place draft and conditional epoch failures compensate before unlock", () => {
  const partial = loadTransactionBackend("CREATE", { failurePoint: "afterPlace" });
  const partialBefore = transactionBefore(partial);
  assertError(runSyntheticTransaction(partial), "SERVER_ERROR");
  assertRestored(partial, partialBefore);

  const epoch = loadTransactionBackend("PUBLISH", { failEpochWrite: true });
  const epochBefore = transactionBefore(epoch);
  assertError(runSyntheticTransaction(epoch, { includeEpoch: true }), "SERVER_ERROR");
  assertRestored(epoch, epochBefore);
  const releaseIndex = epoch.calls.events.lastIndexOf("releaseLock");
  const finalRestoreRead = Math.max(epoch.calls.events.lastIndexOf("read:places:restore"), epoch.calls.events.lastIndexOf("read:place_drafts:restore"));
  assert.equal(releaseIndex > finalRestoreRead, true);

  const missingEpoch = loadTransactionBackend("PUBLISH", { failurePoint: "afterMutation", missingEpoch: true });
  const missingEpochBefore = transactionBefore(missingEpoch);
  assertError(runSyntheticTransaction(missingEpoch, { includeEpoch: true }), "SERVER_ERROR");
  assertRestored(missingEpoch, missingEpochBefore);
  assert.equal(missingEpoch.properties.has("PLACE_PUBLIC_CACHE_EPOCH"), false);
});

test("transaction rollback and rollback-verification failures never expose success or internals", () => {
  for (const options of [
    { failurePoint: "afterMutation", incompleteClear: true },
    { failurePoint: "afterMutation", failRestoreWrite: true }
  ]) {
    const runtime = loadTransactionBackend("CREATE", options);
    const result = runSyntheticTransaction(runtime);
    assertError(result, "SERVER_ERROR");
    assert.equal(JSON.stringify(result).includes("rollback residue"), false);
    assert.equal(JSON.stringify(result).includes("synthetic restore internals"), false);
    assert.equal(runtime.lock.released, 1);
    assert.equal(runtime.calls.events.at(-1), "releaseLock");
  }
  const verificationFailure = loadTransactionBackend("CREATE", { failurePoint: "afterMutation", incompleteClear: true });
  runSyntheticTransaction(verificationFailure);
  assert.equal(verificationFailure.calls.reads.filter((entry) => entry.phase === "restore").length >= 4, true);

  const wrongAllocation = loadTransactionBackend("CREATE", {
    failurePoint: "afterMutation", unrelatedBusinessRows: true, wrongPlaceAppendRow: true
  });
  const wrongAllocationBefore = transactionBefore(wrongAllocation);
  const wrongAllocationResult = runSyntheticTransaction(wrongAllocation);
  assertError(wrongAllocationResult, "SERVER_ERROR");
  assert.deepEqual(wrongAllocation.sheets.places.rows[0], wrongAllocationBefore.places[0], "unrelated Place row must remain intact");
  assert.deepEqual(wrongAllocation.sheets.place_drafts.rows[0], wrongAllocationBefore.drafts[0], "unrelated draft row must remain intact");
  assertRestored(wrongAllocation, wrongAllocationBefore);
  assert.equal(wrongAllocation.lock.released, 1);
});

test("transaction intended-state reread rejects no-op existing-row writes before audit", () => {
  const runtime = loadTransactionBackend("UPDATE_DRAFT", { noOpActionReplace: true });
  const before = transactionBefore(runtime);
  const result = runSyntheticTransaction(runtime);
  assertError(result, "SERVER_ERROR");
  assertRestored(runtime, before);
  assert.equal(runtime.calls.writes.some((write) => write.name === "activity_logs"), false);

  const corruptDraft = loadTransactionBackend("UNPUBLISH", { corruptActionDraftBase: true });
  const corruptDraftBefore = transactionBefore(corruptDraft);
  const corruptDraftResult = runSyntheticTransaction(corruptDraft, { includeEpoch: true });
  assertError(corruptDraftResult, "SERVER_ERROR");
  assertRestored(corruptDraft, corruptDraftBefore);
  assert.equal(corruptDraft.calls.writes.some((write) => write.name === "activity_logs"), false);
  assert.equal(corruptDraft.lock.released, 1);
  const corruptDraftFinalRestoreRead = Math.max(
    corruptDraft.calls.events.lastIndexOf("read:places:restore"),
    corruptDraft.calls.events.lastIndexOf("read:place_drafts:restore")
  );
  assert.equal(corruptDraft.calls.events.lastIndexOf("releaseLock") > corruptDraftFinalRestoreRead, true);

  const partialPublishClear = loadTransactionBackend("PUBLISH", { incompleteActionClear: true });
  const partialPublishBefore = transactionBefore(partialPublishClear);
  const partialPublishResult = runSyntheticTransaction(partialPublishClear, { includeEpoch: true });
  assertError(partialPublishResult, "SERVER_ERROR");
  assertRestored(partialPublishClear, partialPublishBefore);
  assert.equal(partialPublishClear.calls.writes.some((write) => write.name === "activity_logs"), false);
  assert.equal(partialPublishClear.lock.released, 1);
  const partialPublishFinalRestoreRead = Math.max(
    partialPublishClear.calls.events.lastIndexOf("read:places:restore"),
    partialPublishClear.calls.events.lastIndexOf("read:place_drafts:restore")
  );
  assert.equal(partialPublishClear.calls.events.lastIndexOf("releaseLock") > partialPublishFinalRestoreRead, true);
});

test("transaction mutation proofs catch removed state version audit reverse clear and verification invariants", () => {
  const source = adminPlaceServiceSource;

  const noPreState = source.replace("      place: placeRow,", "      place: null,");
  assert.notEqual(noPreState, source, "pre-state capture mutation target must match");
  {
    const runtime = loadTransactionBackend("UPDATE_DRAFT", { serviceSource: noPreState, failurePoint: "afterMutation" });
    const before = transactionBefore(runtime);
    runSyntheticTransaction(runtime);
    assert.throws(() => assertRestored(runtime, before));
  }

  const noVersionComparison = source.replace(
    '  if (expectedVersion !== authoritativeVersion) throw new Error("CONFLICT");',
    '  if (false) throw new Error("CONFLICT");'
  );
  assert.notEqual(noVersionComparison, source, "version comparison mutation target must match");
  {
    const runtime = loadTransactionBackend("UPDATE_DRAFT", { serviceSource: noVersionComparison });
    const result = runSyntheticTransaction(runtime, { expectedVersion: 2 });
    assert.throws(() => assertError(result, "CONFLICT"));
  }

  const noAuditVerification = source.replace(
    "    var auditTable = SheetService_readTable_(AdminPlaceSchema_ACTIVITY_SHEET_NAME_, auditHeaders);",
    "    return true;\n    var auditTable = SheetService_readTable_(AdminPlaceSchema_ACTIVITY_SHEET_NAME_, auditHeaders);"
  );
  assert.notEqual(noAuditVerification, source, "audit verification mutation target must match");
  {
    const runtime = loadTransactionBackend("UPDATE_DRAFT", { serviceSource: noAuditVerification, corruptAuditReadback: true });
    const result = runSyntheticTransaction(runtime);
    assert.throws(() => assertError(result, "SERVER_ERROR"));
  }

  const noReverseCompensation = source.replace("  ].reverse();", "  ];");
  assert.notEqual(noReverseCompensation, source, "reverse compensation mutation target must match");
  {
    const runtime = loadTransactionBackend("PUBLISH", { serviceSource: noReverseCompensation, failurePoint: "afterMutation" });
    runSyntheticTransaction(runtime, { includeEpoch: true });
    const restored = runtime.calls.writes.filter((write) => write.phase === "restore").map((write) => write.name);
    assert.throws(() => assert.deepEqual(restored, ["place_drafts", "places"]));
  }

  const noFullClear = source.replace(
    "        SheetService_clearRow_(target.sheetName, currentMatches[0].sourceRowNumber);",
    "        void currentMatches;"
  );
  assert.notEqual(noFullClear, source, "full-row clear mutation target must match");
  {
    const runtime = loadTransactionBackend("CREATE", { serviceSource: noFullClear, failurePoint: "afterMutation" });
    const before = transactionBefore(runtime);
    runSyntheticTransaction(runtime);
    assert.throws(() => assertRestored(runtime, before));
  }

  const noCompensationVerification = source.replace(
    "  // Verify each table independently, including after another recovery attempt failed.",
    "  return true;\n  // Verify each table independently, including after another recovery attempt failed."
  );
  assert.notEqual(noCompensationVerification, source, "compensation verification mutation target must match");
  {
    const runtime = loadTransactionBackend("CREATE", { serviceSource: noCompensationVerification, failurePoint: "afterMutation" });
    runSyntheticTransaction(runtime);
    const verificationReads = runtime.calls.reads.filter((entry) => entry.phase === "restore").length;
    assert.throws(() => assert.equal(verificationReads >= 4, true));
  }
});

test("all four authoritative Admin roles may list and inspect Places", () => {
  for (const role of ["super_admin", "editor", "reviewer", "viewer"]) {
    const { context, calls } = loadBackend({ role });
    assert.equal(plain(context.adminGetPlaces_("TOKEN", {})).ok, true);
    assert.equal(plain(context.adminGetPlaceDetail_("TOKEN", { place_id: "PLC-WORKING", view: "working" })).ok, true);
    assert.deepEqual(calls.auth, ["TOKEN", "TOKEN"]);
  }
});

test("mutation proofs reject bypassed authoritative auth and raw-row responses", () => {
  const source = adminPlaceServiceSource;
  const authBypass = source.replace(
    "function AdminPlaceService_execute_(token, operation) {\n  try {\n    var admin = AuthService_requireAdmin_(token);",
    'function AdminPlaceService_execute_(token, operation) {\n  try {\n    var admin = { role: "viewer" };'
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

test("legacy timestamps normalize across Admin Place list detail and write safe projections without source mutation", () => {
  const data = {
    places: [place("BTK-001", {
      created_at: "2026-07-14 21:30:00",
      updated_at: "2026-08-14T19:57:57.370Z"
    })],
    drafts: []
  };
  const before = JSON.stringify(data);
  const { context, calls } = loadBackend({ data });

  const listItem = plain(context.adminGetPlaces_("TOKEN", {})).data.items[0];
  const detail = plain(context.adminGetPlaceDetail_("TOKEN", { place_id: "BTK-001", view: "working" })).data;
  const write = plain(context.AdminPlaceService_writeSuccess_(
    "BTK-001", "published", 1, 1, false, "2026-07-14 21:30:00", "2026-08-14T19:57:57.370Z"
  ));

  for (const projection of [listItem, detail, write]) {
    assert.equal(projection.created_at, "2026-07-14T21:30:00.000Z");
    assert.equal(projection.updated_at, "2026-08-14T19:57:57.370Z");
  }
  assert.equal(JSON.stringify(data), before);
  assert.equal(calls.writes.length, 0);
});

test("canonical Admin Place timestamps remain byte-for-byte unchanged in every safe projection", () => {
  const createdAt = "2024-02-29T23:59:59.007Z";
  const updatedAt = "2026-08-14T19:57:57.370Z";
  const data = { places: [place("BTK-001", { created_at: createdAt, updated_at: updatedAt })], drafts: [] };
  const { context } = loadBackend({ data });
  const listItem = plain(context.adminGetPlaces_("TOKEN", {})).data.items[0];
  const detail = plain(context.adminGetPlaceDetail_("TOKEN", { place_id: "BTK-001", view: "working" })).data;
  const write = plain(context.AdminPlaceService_writeSuccess_("BTK-001", "published", 1, 1, false, createdAt, updatedAt));

  for (const projection of [listItem, detail, write]) {
    assert.equal(projection.created_at, createdAt);
    assert.equal(projection.updated_at, updatedAt);
  }
});

test("malformed impossible ambiguous and unsupported Admin Place timestamps fail closed", () => {
  const invalidValues = [
    "2026-02-30 10:00:00",
    "2026/07/14 21:30:00",
    "14/07/2026 21:30:00",
    " 2026-07-14 21:30:00",
    "2026-07-14 21:30:00 ",
    "2026-07-14 21:30",
    "Tue Jul 14 2026 21:30:00 GMT+0000 (Coordinated Universal Time)",
    "2026-07-14T21:30:00+07:00",
    "2026-02-30T10:00:00.000Z",
    46217,
    new Date("2026-07-14T21:30:00.000Z")
  ];

  for (const invalid of invalidValues) {
    const data = { places: [place("BTK-001", { created_at: invalid })], drafts: [] };
    const { context, calls } = loadBackend({ data });
    assertError(plain(context.adminGetPlaces_("TOKEN", {})), "SERVER_ERROR");
    assertError(plain(context.adminGetPlaceDetail_("TOKEN", { place_id: "BTK-001", view: "working" })), "SERVER_ERROR");
    assert.throws(() => context.AdminPlaceService_writeSuccess_(
      "BTK-001", "published", 1, 1, false, invalid, "2026-08-14T19:57:57.370Z"
    ));
    assert.equal(calls.writes.length, 0);
  }
});

test("write endpoints normalize exact legacy stored timestamps without rewriting the stored value", () => {
  const legacy = "2026-07-14 21:30:00";
  for (const action of ["SAVE", "PUBLISH", "UNPUBLISH", "ARCHIVE", "RESTORE"]) {
    const runtime = loadTransactionBackend(action === "SAVE" ? "UPDATE_DRAFT" : action);
    const createdAtColumn = runtime.sheets.places.headers.indexOf("created_at");
    runtime.sheets.places.rows[0][createdAtColumn] = legacy;
    const result = action === "SAVE" ? callSave(runtime) :
      action === "PUBLISH" ? callPublish(runtime) : callLifecycle(runtime, action);

    assert.equal(result.ok, true, action);
    assert.equal(result.data.created_at, "2026-07-14T21:30:00.000Z", action);
    assert.equal(runtime.sheets.places.rows[0][createdAtColumn], legacy, action);
  }
});

test("write endpoints reject padded stored timestamps and restore their complete state", () => {
  for (const action of ["SAVE", "PUBLISH", "UNPUBLISH", "ARCHIVE", "RESTORE"]) {
    const runtime = loadTransactionBackend(action === "SAVE" ? "UPDATE_DRAFT" : action);
    const createdAtColumn = runtime.sheets.places.headers.indexOf("created_at");
    runtime.sheets.places.rows[0][createdAtColumn] = " 2026-07-14 21:30:00";
    const before = transactionBefore(runtime);
    const result = action === "SAVE" ? callSave(runtime) :
      action === "PUBLISH" ? callPublish(runtime) : callLifecycle(runtime, action);

    assertError(result, "SERVER_ERROR");
    assertRestored(runtime, before);
    assert.equal(runtime.calls.writes.length, 0, action);
  }
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

test("Router preserves the two POST-only Admin read actions", () => {
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

test("Create destination preflight rejects unsupported formats on either sheet before any write", () => {
  for (const target of ["places", "place_drafts"]) for (const field of ["is_featured", "is_main_route_point"]) {
    for (const format of ["@", "", "private-unverified-format"]) {
      const runtime = loadTransactionBackend("CREATE", { formatRead(name, row, width, rt) {
        const formats = Array(width).fill("0.###############");
        if (name === target) formats[rt.sheets[name].headers.indexOf(field)] = format;
        return [formats];
      } });
      assertError(callCreate(runtime), "SERVER_ERROR");
      assert.equal(runtime.calls.writes.length, 0);
      assert.equal(runtime.lock.released, 1);
    }
  }
});

test("Create destination preflight reads both exact rows before writes and keeps invocations isolated", () => {
  const runtime = loadTransactionBackend("CREATE", { extraColumns: true, uuidSequence: [
    "12345678-1234-4234-8234-123456789abc", "12345678-1234-4234-8234-123456789abd",
    "12345678-1234-4234-8234-123456789abe", "12345678-1234-4234-8234-123456789abf"
  ] });
  assert.equal(callCreate(runtime).ok, true);
  assert.deepEqual(runtime.calls.formatReads, [
    { name: "places", row: 2, column: 1, height: 1, width: PLACE_HEADERS.length + 1 },
    { name: "place_drafts", row: 2, column: 1, height: 1, width: DRAFT_HEADERS.length + 1 }
  ]);
  assert(runtime.calls.events.indexOf("formats:place_drafts") < runtime.calls.events.indexOf("append:places:action"));
  assert.equal(callCreate(runtime).ok, true);
  assert.deepEqual(runtime.calls.formatReads.slice(2).map((r) => r.row), [3, 3]);
  for (const name of ["places", "place_drafts", "activity_logs"]) assert.equal(populatedRows(runtime, name).length, 2);
});

test("Create destination preflight malformed reads and stale destinations fail closed", () => {
  for (const mutation of ["read-throw", "matrix", "header", "row"]) {
    const runtime = loadTransactionBackend("CREATE", { formatRead(name, row, width, rt) {
      if (name === "place_drafts") {
        if (mutation === "read-throw") throw new Error("private format failure");
        if (mutation === "matrix") return [[]];
        if (mutation === "header") rt.sheets.places.headers.reverse();
        if (mutation === "row") {
          rt.sheets.places.rows.push(Array(rt.sheets.places.headers.length).fill(""));
          rt.sheets.places.rows[0][0] = "OTHER-PLACE";
          rt.sheets.places.formulas.push(new Set());
        }
      }
      return [Array(width).fill("0")];
    } });
    assertError(callCreate(runtime), "SERVER_ERROR");
    assert.equal(runtime.calls.writes.length, 0);
  }
});

test("Create destination preflight rejects every malformed matrix without business writes", () => {
  for (const matrix of [null, [], [[]], [null], ["private"], [[0]], [["0"], ["0"]]]) {
    const runtime = loadTransactionBackend("CREATE", { formatRead() { return matrix; } });
    assertError(callCreate(runtime), "SERVER_ERROR");
    assert.equal(runtime.calls.writes.length, 0);
  }
});

test("Create destination preflight enforces captured layout before writes", () => {
  for (const target of ["places", "place_drafts"]) {
    const runtime = loadTransactionBackend("CREATE");
    const getSheet = runtime.context.SheetService_getSheet_;
    runtime.context.SheetService_getSheet_ = (name) => {
      if (name === target) runtime.sheets[name].headers.reverse();
      return getSheet(name);
    };
    assertError(callCreate(runtime), "SERVER_ERROR");
    assert.equal(runtime.calls.writes.length, 0);
  }
});

test("Create prepared draft changes after place append still compensate before lock release", () => {
  for (const change of ["headers", "row"]) {
    const runtime = loadTransactionBackend("CREATE");
    const append = runtime.context.SheetService_appendObjectWithRow_;
    runtime.context.SheetService_appendObjectWithRow_ = (...args) => {
      const result = append(...args);
      if (args[0] === "places") {
        const sheet = runtime.sheets.place_drafts;
        if (change === "headers") sheet.headers.reverse();
        else {
          sheet.rows.push(sheet.headers.map((header) => header === "place_id" ? "OTHER-PLACE" : ""));
          sheet.formulas.push(new Set());
        }
      }
      return result;
    };
    assertError(callCreate(runtime), "SERVER_ERROR");
    assert.equal(populatedRows(runtime, "places").length, 0);
    assert.equal(populatedRows(runtime, "activity_logs").length, 0);
    assert.equal(runtime.calls.writes.filter((w) => w.method === "append" && w.name === "place_drafts").length, 0);
    if (change === "row") assert.equal(sheetRecord(runtime, "place_drafts").place_id, "OTHER-PLACE");
    const events = runtime.calls.events;
    assert(events.indexOf("clear:places:action") < events.indexOf("releaseLock"));
    assert.equal(runtime.lock.released, 1);
  }
});

test("independent recovery clears place despite unreadable draft schema and retains rollback failure", () => {
  for (const corruption of ["missing", "duplicate", "malformed", "read"]) {
    const runtime = loadTransactionBackend("CREATE");
    const append = runtime.context.SheetService_appendObjectWithRow_;
    runtime.context.SheetService_appendObjectWithRow_ = (...args) => {
      const result = append(...args);
      if (args[0] === "places") {
        const headers = runtime.sheets.place_drafts.headers;
        if (corruption === "missing") headers.pop();
        if (corruption === "duplicate") headers[1] = "place_id";
        if (corruption === "malformed") headers[1] = 42;
        if (corruption === "read") {
          const readTable = runtime.context.SheetService_readTable_;
          runtime.context.SheetService_readTable_ = (name, required) => {
            if (name === "place_drafts") throw new Error("private read failure");
            return readTable(name, required);
          };
          throw new Error("private original failure");
        }
      }
      return result;
    };
    let rollbackFailed = false;
    const restore = runtime.context.AdminPlaceService_restoreState_;
    runtime.context.AdminPlaceService_restoreState_ = (state) => {
      try { return restore(state); } catch (error) { rollbackFailed = true; throw error; }
    };
    assertError(callCreate(runtime), "SERVER_ERROR");
    assert.equal(populatedRows(runtime, "places").length, 0, corruption);
    assert.equal(populatedRows(runtime, "place_drafts").length, 0);
    assert.equal(populatedRows(runtime, "activity_logs").length, 0);
    assert.equal(rollbackFailed, true);
    const clear = runtime.calls.events.indexOf("clear:places:action");
    assert(clear >= 0);
    assert(runtime.calls.events.slice(clear + 1).includes("read:places:action"));
  }
});

test("independent recovery attempts both tables without unsafe identity or cardinality clearing", () => {
  for (const target of ["places", "place_drafts"]) for (const failure of ["schema", "clear", "duplicate", "identity", "verify"]) {
    const runtime = loadTransactionBackend("CREATE");
    const snapshot = runtime.context.AdminPlaceService_captureState_("RECOVERY-PLACE", false);
    for (const name of ["places", "place_drafts"]) {
      const sheet = runtime.sheets[name];
      sheet.rows.push(sheet.headers.map((header) => header === "place_id" ? "RECOVERY-PLACE" : ""));
      sheet.formulas.push(new Set());
      snapshot.allocated_rows[name === "places" ? "place" : "draft"] = 2;
    }
    const sheet = runtime.sheets[target];
    if (failure === "schema") sheet.headers.pop();
    if (failure === "duplicate") { sheet.rows.push([...sheet.rows[0]]); sheet.formulas.push(new Set()); }
    if (failure === "identity") sheet.rows[0][0] = "OTHER-PLACE";
    const clear = runtime.context.SheetService_clearRow_;
    runtime.context.SheetService_clearRow_ = (name, row) => {
      if (name === target && failure === "clear") throw new Error("private clear failure");
      if (name === target && failure === "verify") return; // A no-op must fail verification.
      return clear(name, row);
    };
    assert.throws(() => runtime.context.AdminPlaceService_restoreState_(snapshot), undefined, `${target}/${failure}`);
    const other = target === "places" ? "place_drafts" : "places";
    assert.equal(populatedRows(runtime, other).length, 0, `${target}/${failure}`);
    if (["schema", "duplicate", "identity"].includes(failure)) {
      assert.equal(runtime.calls.writes.some((w) => w.name === target), false);
    }
    const clearIndex = runtime.calls.events.indexOf(`clear:${other}:action`);
    assert(runtime.calls.events.slice(clearIndex + 1).includes(`read:${other}:action`));
  }
});

test("independent recovery clears draft when places become unreadable after both Create writes", () => {
  const runtime = loadTransactionBackend("CREATE");
  const append = runtime.context.SheetService_appendObjectWithRow_;
  runtime.context.SheetService_appendObjectWithRow_ = (...args) => {
    const result = append(...args);
    if (args[0] === "place_drafts") runtime.sheets.places.headers.pop();
    return result;
  };
  assertError(callCreate(runtime), "SERVER_ERROR");
  assert.equal(populatedRows(runtime, "place_drafts").length, 0);
  assert.equal(populatedRows(runtime, "places").length, 1); // Unsafe to clear the unreadable table.
  assert.equal(populatedRows(runtime, "activity_logs").length, 0);
  assert.equal(runtime.calls.writes.some((w) => w.name === "places" && w.method === "clear"), false);
});

test("independent recovery retains first error while attempting both cleanup and verification reads", () => {
  const runtime = loadTransactionBackend("CREATE");
  const snapshot = runtime.context.AdminPlaceService_captureState_("RECOVERY-PLACE", false);
  const first = new Error("first private recovery failure");
  const calls = [];
  runtime.context.SheetService_readTable_ = (name) => {
    calls.push(name);
    throw calls.length === 1 ? first : new Error("later private recovery failure");
  };
  assert.throws(() => runtime.context.AdminPlaceService_restoreState_(snapshot), (error) => error === first);
  assert.deepEqual(calls, ["place_drafts", "places", "place_drafts", "places"]);
  assert.equal(runtime.calls.writes.length, 0);
});

// Inspection has its own read-only Range facade: mutation traps record before throwing,
// so generic error handling cannot conceal an attempted write.
function inspectionRuntime(options = {}) {
  const rt = loadTransactionBackend("CREATE", options);
  const mutations = [];
  const forbidden = (name) => () => { mutations.push(name); throw new Error("forbidden inspection mutation"); };
  const reads = [];
  rt.context.SheetService_getSheet_ = (name) => {
    const sheet = rt.sheets[name];
    assert(sheet, "inspection may open only business sheets");
    return {
      getName: () => name, getLastRow: () => sheet.rows.length + 1, getLastColumn: () => sheet.headers.length,
      appendRow: forbidden("appendRow"), insertRows: forbidden("insertRows"),
      getRange(row, column, height, width) {
        return {
          getValues() { assert.equal(row, 1); return [sheet.headers.slice(column - 1, column - 1 + width)]; },
          getNumberFormats() {
            reads.push({ name, row, column, height, width });
            if (options.formatRead) return options.formatRead(name, row, width, rt);
            return [Array(width).fill("0.###############")];
          },
          ...Object.fromEntries(["setValues", "setValue", "clearContent", "appendRow", "setNumberFormat", "setNumberFormats",
            "setDataValidation", "setDataValidations"].map((method) => [method, forbidden(method)]))
        };
      }
    };
  };
  for (const name of ["SheetService_appendObjectWithRow_", "SheetService_updateObjectAtRow_", "SheetService_replaceObjectAtRow_",
    "SheetService_clearRow_", "AdminPlaceService_appendVerifiedAudit_"]) rt.context[name] = forbidden(name);
  rt.context.LockService = { getScriptLock: forbidden("lock") };
  rt.context.CacheService = { getScriptCache: forbidden("cache") };
  rt.context.PropertiesService = { getScriptProperties: () => ({
    getProperty: (key) => rt.properties.get(key) ?? null,
    setProperty: forbidden("setProperty"), setProperties: forbidden("setProperties"), deleteProperty: forbidden("deleteProperty")
  }) };
  const before = JSON.stringify({ sheets: rt.sheets, properties: [...rt.properties] });
  return { rt, reads, inspect(...args) {
    const token = args.length ? args[0] : "TOKEN";
    const payload = args.length > 1 ? args[1] : {};
    assert.equal(typeof rt.context.adminInspectPlaceCreateDestinations_, "function");
    return plain(rt.context.adminInspectPlaceCreateDestinations_(token, payload));
  }, assertUnchanged() {
    assert.deepEqual(mutations, []);
    assert.deepEqual(rt.calls.writes, []);
    assert.equal(JSON.stringify({ sheets: rt.sheets, properties: [...rt.properties] }), before);
  } };
}
function inspectionSupported() {
  return { compatible: true, guarded_fields: { is_featured: "SUPPORTED", is_main_route_point: "SUPPORTED" } };
}

test("destination inspection authorizes editor and super_admin with exact read-only results", () => {
  for (const role of ["editor", "super_admin"]) {
    const h = inspectionRuntime({ role, extraColumns: true });
    for (let n = 0; n < 2; n++) assert.deepEqual(h.inspect(), {
      ok: true, data: { places: inspectionSupported(), drafts: inspectionSupported() }, message: "success"
    });
    assert.deepEqual(h.reads.slice(0, 2), [
      { name: "places", row: 2, column: 1, height: 1, width: PLACE_HEADERS.length + 1 },
      { name: "place_drafts", row: 2, column: 1, height: 1, width: DRAFT_HEADERS.length + 1 }
    ]);
    h.assertUnchanged();
  }
});

test("destination inspection rejects unauthorized roles sessions and payloads before destination reads", () => {
  for (const role of ["viewer", "reviewer"]) {
    const h = inspectionRuntime({ role }); assertError(h.inspect(), "FORBIDDEN");
    assert.deepEqual(h.reads, []); h.assertUnchanged();
  }
  for (const token of [undefined, "", "INVALID"]) {
    const h = inspectionRuntime();
    h.rt.context.AuthService_requireAdmin_ = (received) => {
      assert.equal(received, token);
      throw vm.runInContext('new Error("UNAUTHORIZED")', h.rt.context);
    };
    assertError(h.inspect(token), "UNAUTHORIZED"); assert.deepEqual(h.reads, []); h.assertUnchanged();
  }
  for (const payload of [null, [], "private", { format: "0" }, { sheet: "places" }]) {
    const h = inspectionRuntime(); assertError(h.inspect("TOKEN", payload), "VALIDATION_ERROR"); h.assertUnchanged();
  }
});

test("destination inspection maps only controlled statuses for all Boolean fields and formats", () => {
  for (const target of ["places", "place_drafts"]) for (const field of ["is_featured", "is_main_route_point"]) {
    for (const format of ["@", "", "private arbitrary format", "0", "0.###############"]) {
      const h = inspectionRuntime({ formatRead(name, row, width, rt) {
        const formats = Array(width).fill("0");
        if (name === target) formats[rt.sheets[name].headers.indexOf(field)] = format;
        return [formats];
      } });
      // Physical reordering must not change field-to-format mapping.
      h.rt.sheets.places.headers.reverse(); h.rt.sheets.place_drafts.headers.reverse();
      const before = JSON.stringify(h.rt.sheets);
      const expected = { places: inspectionSupported(), drafts: inspectionSupported() };
      if (!["0", "0.###############"].includes(format)) {
        const result = expected[target === "places" ? "places" : "drafts"];
        result.compatible = false; result.guarded_fields[field] = "UNSUPPORTED";
      }
      assert.deepEqual(h.inspect(), { ok: true, data: expected, message: "success" });
      assert.equal(JSON.stringify(h.rt.sheets), before);
      // Restore fixture-only rearrangement before the mutation assertion.
      h.rt.sheets.places.headers.reverse(); h.rt.sheets.place_drafts.headers.reverse(); h.assertUnchanged();
    }
  }
});

test("destination inspection malformed structures and native failures remain generic and read-only", () => {
  for (const target of ["places", "place_drafts"]) for (const mode of ["missing", "duplicate", "blank", "matrix", "throw"]) {
    const h = inspectionRuntime({ formatRead(name, row, width) {
      if (name === target && mode === "matrix") return [[]];
      if (name === target && mode === "throw") throw new Error("private format code secret");
      return [Array(width).fill("0")];
    } });
    const headers = [...h.rt.sheets[target].headers];
    if (mode === "missing") h.rt.sheets[target].headers.pop();
    if (mode === "duplicate") h.rt.sheets[target].headers[1] = "place_id";
    if (mode === "blank") h.rt.sheets[target].headers[1] = "";
    const result = h.inspect(); assertError(result, "SERVER_ERROR");
    assert.equal(JSON.stringify(result).includes("private"), false);
    h.rt.sheets[target].headers = headers; h.assertUnchanged();
  }
});

test("destination inspection Router is POST-body-only and runs real service authorization", () => {
  for (const role of ["editor", "viewer"]) {
    const h = inspectionRuntime({ role });
    h.rt.context.createJsonResponse_ = (value) => value;
    vm.runInContext(read("apps-script/Router.gs"), h.rt.context);
    const route = (method, event) => plain(h.rt.context.routeRequest_(method, event));
    const action = "adminInspectPlaceCreateDestinations";
    assertError(route("GET", { parameter: { action, token: "TOKEN" } }), "UNKNOWN_ACTION");
    assertError(route("POST", { parameter: { action, token: "TOKEN" } }), "UNKNOWN_ACTION");
    const result = route("POST", { parameter: { token: "IGNORED" }, postData: { contents: JSON.stringify({ action, token: "TOKEN", payload: {} }) } });
    if (role === "editor") assert.deepEqual(result.data, { places: inspectionSupported(), drafts: inspectionSupported() });
    else assertError(result, "FORBIDDEN");
    assert.deepEqual(h.rt.calls.auth, ["TOKEN"]); h.assertUnchanged();
  }
});



// Temporary diagnostic: every assertion uses fixed metadata, never production data.
function diagnose(runtime, payload = { place_id: "PLC-PUBLISHED" }, token = "TOKEN") {
  return plain(runtime.context.adminDiagnosePlaceDependencies_(token, payload));
}
function diagnosticExpected(stage, table, reason, ok = false) {
  return { ok, stage, table, reason, internal_code: reason };
}
test("diagnostic independently requires super_admin and denies invalid sessions before reads", () => {
  for (const role of ["editor", "reviewer", "viewer", "unknown"]) {
    const runtime = loadBackend({ role, data: dependencyFixtures() });
    assert.deepEqual(diagnose(runtime), diagnosticExpected("AUTHORIZATION", "NONE", "FORBIDDEN"));
    assert.deepEqual(runtime.calls.reads, []);
  }
  for (const token of [undefined, "", "invalid"]) {
    const runtime = loadBackend({ authError: "UNAUTHORIZED", role: "super_admin" });
    assert.deepEqual(diagnose(runtime, undefined, token), diagnosticExpected("UNKNOWN", "UNKNOWN", "UNKNOWN_ERROR"));
    assert.deepEqual(runtime.calls.reads, []);
  }
});
test("diagnostic success is fixed and read-only through POST, with no GET action", () => {
  const runtime = loadBackend({ role: "super_admin", data: dependencyFixtures() });
  const before = JSON.stringify(runtime.data);
  assert.deepEqual(post(runtime.context, { action: "adminDiagnosePlaceDependencies", token: "TOKEN", payload: { place_id: "PLC-PUBLISHED" } }),
    diagnosticExpected("COMPLETE", "NONE", "NONE", true));
  assert.equal(JSON.stringify(runtime.data), before);
  assert.deepEqual(runtime.calls.writes, []);
  assert.deepEqual(runtime.calls.propertyReads, []);
  assert.deepEqual(runtime.calls.fetches, []);
  assert.equal(runtime.calls.reads.length, 8);
  assertError(response(runtime.context.routeRequest_("GET", { parameter: { action: "adminDiagnosePlaceDependencies" } })), "UNKNOWN_ACTION");
});
test("diagnostic distinguishes every read stage for known schema failure without retry", () => {
  for (const name of ["places", ...Object.keys(DEPENDENCY_HEADERS)]) {
    const runtime = loadBackend({ role: "super_admin", data: dependencyFixtures() });
    installDiagnosticReadFixture(runtime, name);
    assert.deepEqual(diagnose(runtime), diagnosticExpected("READ_" + name.toUpperCase(), name.toUpperCase(), "READ_FAILED"));
    assert.equal(runtime.calls.reads.filter(call => call.name === name).length, 1);
    assert.deepEqual(runtime.calls.writes, []);
  }
});
test("diagnostic distinguishes invalid ID duplicate ID and status for every index", () => {
  const ids = { places: "place_id", routes: "route_id", route_places: "route_place_id", products: "product_id", events: "event_id", gallery: "media_id", trip_templates: "template_id", reviews: "review_id" };
  for (const [name, idKey] of Object.entries(ids)) {
    for (const reason of ["INVALID_ID", "DUPLICATE_ID", "INVALID_STATUS"]) {
      const data = dependencyFixtures();
      if (reason === "INVALID_ID") data[name][0][idKey] = "PRIVATE / ID";
      if (reason === "DUPLICATE_ID") data[name].push({ ...data[name][0] });
      if (reason === "INVALID_STATUS") data[name][0].status = "PRIVATE_STATUS";
      const runtime = loadBackend({ role: "super_admin", data });
      assert.deepEqual(diagnose(runtime), diagnosticExpected("INDEX_" + name.toUpperCase(), name.toUpperCase(), reason));
      assertError(inspect(runtime), "SERVER_ERROR");
      assert.deepEqual(runtime.calls.writes, []);
    }
  }
});
test("diagnostic distinguishes reference list label orphan and target failures", () => {
  for (const [name, mutate, reason] of [
    ["products", row => { row.related_place_id = {}; }, "INVALID_REFERENCE"],
    ["trip_templates", row => { row.place_ids = {}; }, "INVALID_LIST"],
    ["products", row => { row.name_th = {}; }, "INVALID_LABEL"],
    ["routes", row => { row.name_th = {}; }, "INVALID_LABEL"],
    ["route_places", row => { row.route_id = "MISSING-ROUTE"; row.place_id = "PLC-PUBLISHED"; }, "ORPHAN_ROUTE"]
  ]) {
    const data = dependencyFixtures(); mutate(data[name][0]);
    const runtime = loadBackend({ role: "super_admin", data });
    assert.deepEqual(diagnose(runtime), diagnosticExpected("INDEX_" + name.toUpperCase(), name.toUpperCase(), reason));
    assertError(inspect(runtime), "SERVER_ERROR");
    assert.deepEqual(runtime.calls.writes, []);
  }
  const runtime = loadBackend({ role: "super_admin", data: dependencyFixtures() });
  assert.deepEqual(diagnose(runtime, { place_id: "MISSING-PLACE" }), diagnosticExpected("INDEX_PLACES", "PLACES", "TARGET_NOT_FOUND"));
  assertError(inspect(runtime, { place_id: "MISSING-PLACE" }), "NOT_FOUND");
});
test("diagnostic unknown exceptions never expose message stack or stale observer state", () => {
  const runtime = loadBackend({ role: "super_admin", data: dependencyFixtures(), readError: "PRIVATE_TOKEN_AND_ID" });
  assert.deepEqual(diagnose(runtime), diagnosticExpected("UNKNOWN", "UNKNOWN", "UNKNOWN_ERROR"));
  const indexed = loadBackend({ role: "super_admin", data: dependencyFixtures() });
  indexed.context.AdminPlaceService_dependencyStoredBoolean_ = () => { throw new Error("PRIVATE_NAME_STACK"); };
  assert.deepEqual(diagnose(indexed), diagnosticExpected("UNKNOWN", "UNKNOWN", "UNKNOWN_ERROR"));
  const clean = loadBackend({ role: "super_admin", data: dependencyFixtures() });
  assert.deepEqual(diagnose(clean), diagnosticExpected("COMPLETE", "NONE", "NONE", true));
  assert.deepEqual(runtime.calls.writes, []);
  assert.deepEqual(indexed.calls.writes, []);
});

test("diagnostic native label exception stays unknown", () => {
  const runtime = loadBackend({ role: "super_admin", data: dependencyFixtures() });
  runtime.context.AdminPlaceService_unescapeHumanText_ = () => { throw new TypeError("SECRET_NATIVE_LABEL"); };
  assert.deepEqual(diagnose(runtime), diagnosticExpected("UNKNOWN", "UNKNOWN", "UNKNOWN_ERROR"));
  assertError(inspect(runtime), "SERVER_ERROR");
});
test("diagnostic uses real authentication validation for absent malformed and unmatched sessions", () => {
  const runtime = loadBackend({ role: "super_admin", data: dependencyFixtures() });
  vm.runInContext(read("apps-script/Config.gs"), runtime.context);
  vm.runInContext(read("apps-script/AuthService.gs"), runtime.context);
  runtime.context.CryptoService_base64UrlDecode_ = value => [...Buffer.from(value, "base64url")];
  runtime.context.CryptoService_base64UrlEncode_ = bytes => Buffer.from(bytes).toString("base64url");
  runtime.context.CryptoService_hashToken_ = () => Buffer.alloc(32).toString("base64url");
  let sessionReads = 0;
  runtime.context.SheetService_readTable_ = name => {
    assert.equal(name, runtime.context.ADMIN_SESSION_SHEET_NAME_);
    sessionReads++;
    return { rows: [] };
  };
  for (const token of [undefined, "", "invalid", Buffer.alloc(32, 1).toString("base64url")]) {
    assert.deepEqual(plain(runtime.context.adminDiagnosePlaceDependencies_(token, { place_id: "PLC-PUBLISHED" })),
      diagnosticExpected("UNKNOWN", "UNKNOWN", "UNKNOWN_ERROR"));
  }
  assert.equal(sessionReads, 1);
  assert.deepEqual(runtime.calls.writes, []);
});

// Run the real SheetService schema validation, rather than imitating its error text.
function installDiagnosticReadFixture(runtime, failingTable, mode = "missing_header") {
  vm.runInContext(read("apps-script/SheetService.gs"), runtime.context);
  runtime.context.getAppConfig_ = () => ({ spreadsheetId: mode === "missing_config" ? "" : "FIXTURE" });
  runtime.context.SpreadsheetApp = { openById() { return { getSheetByName(name) {
    runtime.calls.reads.push({ name });
    if (name === failingTable && mode === "missing_sheet") return null;
    const headers = [...runtime.context.AdminPlaceService_DEPENDENCY_HEADERS_[name]];
    let values = [headers, ...runtime.data[name].map(row => headers.map(key => row[key]))];
    if (name === failingTable) {
      if (mode === "empty") values = [];
      if (mode === "missing_header") values = [["PRIVATE_HEADER"]];
      if (mode === "duplicate_header") values = [[...headers, headers[0]]];
      if (mode === "invalid_header") values = [[...headers, 42]];
      if (mode === "conflicting_header") values = [[...headers, headers[0].toUpperCase()]];
    }
    return { getDataRange() { return { getValues() { return values; } }; }, getLastRow() { return values.length; } };
  } }; } };
}

test("diagnostic no-observer label catch never inspects exceptional message getters", () => {
  const runtime = loadBackend({ data: dependencyFixtures() });
  let messageReads = 0;
  const exception = Object.defineProperty({}, "message", { get() { messageReads++; throw new Error("NOT_FOUND"); } });
  runtime.context.AdminPlaceService_unescapeHumanText_ = () => { throw exception; };
  assertError(inspect(runtime), "SERVER_ERROR");
  assert.throws(() => runtime.context.AdminPlaceService_dependencyHumanText_("label"),
    error => error.message === "ADMIN_PLACE_DEPENDENCY_LABEL");
  assert.equal(messageReads, 0);
});

test("diagnostic no-observer read and validation sites preserve original thrown codes", () => {
  const runtime = loadBackend({ data: dependencyFixtures() });
  let messageReads = 0;
  const exception = Object.defineProperty({}, "message", { get() { messageReads++; throw new Error("NOT_FOUND"); } });
  runtime.context.SheetService_readTable_ = () => { throw exception; };
  assert.throws(() => runtime.context.AdminPlaceService_inspectDependencies_("PLC-PUBLISHED"), error => error === exception);
  assert.equal(messageReads, 0);
  for (const [run, code] of [
    [() => runtime.context.AdminPlaceService_dependencyRows_(null, "ROW_ERROR"), "ROW_ERROR"],
    [() => runtime.context.AdminPlaceService_dependencyIndex_(table([], [{ id: "bad/id" }]), "id", [], "INDEX_ERROR"), "INDEX_ERROR"],
    [() => runtime.context.AdminPlaceService_dependencyReference_({}, true), "ADMIN_PLACE_DEPENDENCY_REFERENCE"],
    [() => runtime.context.AdminPlaceService_dependencyList_({}), "ADMIN_PLACE_DEPENDENCY_LIST"],
    [() => runtime.context.AdminPlaceService_dependencyHumanText_({}), "ADMIN_PLACE_DEPENDENCY_LABEL"]
  ]) assert.throws(run, error => error.message === code);
});

test("diagnostic callbacks receive only fixed primitive metadata at controlled and native failures", () => {
  for (const kind of ["read", "validation", "native"]) {
    const runtime = loadBackend({ role: "super_admin", data: dependencyFixtures() });
    const observed = [];
    const observer = { enter(...args) { observed.push(args); }, fail(...args) { observed.push(args); } };
    if (kind === "read") installDiagnosticReadFixture(runtime, "places");
    if (kind === "validation") runtime.data.places[0].place_id = "PRIVATE / ID";
    if (kind === "native") runtime.context.SheetService_readTable_ = () => {
      const error = new TypeError("Required data headers are not available.");
      error.privateData = "PRIVATE_SENTINEL";
      throw error;
    };
    assert.throws(() => runtime.context.AdminPlaceService_inspectDependencies_("PLC-PUBLISHED", observer));
    const allowed = new Set(["READ_PLACES", "READ_ROUTES", "READ_ROUTE_PLACES", "READ_PRODUCTS", "READ_EVENTS", "READ_GALLERY", "READ_TRIP_TEMPLATES", "READ_REVIEWS",
      "INDEX_PLACES", "PLACES", "ROUTES", "ROUTE_PLACES", "PRODUCTS", "EVENTS", "GALLERY", "TRIP_TEMPLATES", "REVIEWS", "READ_FAILED", "INVALID_ID"]);
    for (const args of observed) for (const value of args) {
      assert.equal(typeof value, "string", "no Error, stack-bearing object or runtime data may cross the observer boundary");
      assert.equal(allowed.has(value), true);
    }
    assert.equal(observed.some(args => args[0] === "READ_FAILED"), kind === "read");
    assert.equal(observed.some(args => args[0] === "INVALID_ID"), kind === "validation");
  }
});

test("diagnostic native message spoofing always returns UNKNOWN", () => {
  for (const kind of ["read", "label"]) for (const makeError of [
    message => new TypeError(message), message => new Error(message), message => ({ message, privateData: "PRIVATE" })
  ]) {
    const runtime = loadBackend({ role: "super_admin", data: dependencyFixtures() });
    if (kind === "read") runtime.context.SheetService_readTable_ = () => { throw makeError("Required data headers are not available."); };
    else runtime.context.AdminPlaceService_unescapeHumanText_ = () => { throw makeError("ADMIN_PLACE_TEXT"); };
    assert.deepEqual(diagnose(runtime), diagnosticExpected("UNKNOWN", "UNKNOWN", "UNKNOWN_ERROR"));
    assert.deepEqual(runtime.calls.writes, []);
  }
});

test("diagnostic real controlled read and text validation still classifies fixed metadata", () => {
  for (const mode of ["missing_config", "missing_sheet", "empty", "missing_header", "duplicate_header", "invalid_header", "conflicting_header"]) {
    const runtime = loadBackend({ role: "super_admin", data: dependencyFixtures() });
    installDiagnosticReadFixture(runtime, "places", mode);
    assert.deepEqual(diagnose(runtime), diagnosticExpected("READ_PLACES", "PLACES", "READ_FAILED"), mode);
    assertError(inspect(runtime), "SERVER_ERROR");
    assert.deepEqual(runtime.calls.writes, []);
  }
  for (const name of ["x".repeat(20001), "private\u0001text"]) {
    const runtime = loadBackend({ role: "super_admin", data: dependencyFixtures() });
    runtime.data.products[0].name_th = name;
    assert.deepEqual(diagnose(runtime), diagnosticExpected("INDEX_PRODUCTS", "PRODUCTS", "INVALID_LABEL"));
    assertError(inspect(runtime), "SERVER_ERROR");
  }
});

test("diagnostic same-runtime sequential requests cannot reuse failure state", () => {
  const runtime = loadBackend({ role: "super_admin", data: dependencyFixtures() });
  const id = runtime.data.products[0].product_id;
  runtime.data.products[0].product_id = "PRIVATE / ID";
  assert.deepEqual(diagnose(runtime), diagnosticExpected("INDEX_PRODUCTS", "PRODUCTS", "INVALID_ID"));
  runtime.data.products[0].product_id = id;
  const readTable = runtime.context.SheetService_readTable_;
  runtime.context.SheetService_readTable_ = () => { throw new TypeError("Required data headers are not available."); };
  assert.deepEqual(diagnose(runtime), diagnosticExpected("UNKNOWN", "UNKNOWN", "UNKNOWN_ERROR"));
  runtime.context.SheetService_readTable_ = readTable;
  assert.deepEqual(diagnose(runtime), diagnosticExpected("COMPLETE", "NONE", "NONE", true));
  assert.deepEqual(runtime.calls.writes, []);
});
if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("Admin Place service verification passed.\n");
