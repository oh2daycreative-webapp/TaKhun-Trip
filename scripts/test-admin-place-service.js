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
const WRITE_SUCCESS_KEYS = [
  "place_id", "status", "entity_version", "working_version", "published_version",
  "has_active_draft", "created_at", "updated_at"
];
const AUDIT_HEADERS = [
  "log_id", "admin_id", "action", "entity_type", "entity_id", "description", "created_at",
  "audit_id", "actor_admin_id", "occurred_at"
];
const AUDIT_ACTIONS = ["CREATE", "UPDATE_DRAFT", "PUBLISH", "UNPUBLISH", "ARCHIVE", "RESTORE"];
const focusArgument = process.argv.find((argument) => argument.startsWith("--focus="));
const focus = focusArgument ? focusArgument.slice("--focus=".length).toLowerCase() : "";

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
      places: [place("TX-PLACE", { entity_version: 3, published_version: 2, name_th: "prior published" })],
      drafts: [draft("TX-PLACE", 3, 2, { name_th: "publish candidate" })]
    };
  }
  if (action === "UNPUBLISH") {
    return { places: [place("TX-PLACE", { entity_version: 2, published_version: 2 })], drafts: [] };
  }
  if (action === "ARCHIVE") {
    return {
      places: [place("TX-PLACE", options.archiveDraftSource ? { status: "draft", entity_version: 4, published_version: 0 } : { entity_version: 4, published_version: 3 })],
      drafts: [draft("TX-PLACE", 4, options.archiveDraftSource ? 0 : 3, { name_th: "retained draft" })]
    };
  }
  if (action === "RESTORE") {
    return {
      places: [place("TX-PLACE", { status: "archived", entity_version: 4, published_version: 3 })],
      drafts: []
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
    activity_logs: makeSheet(AUDIT_HEADERS, [])
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
  const properties = new Map([["PLACE_PUBLIC_CACHE_EPOCH", "41"]]);
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
  const calls = { auth: [], reads: [], writes: [], events: [], sequence: [], propertyReads: [], propertyWrites: [] };
  const lock = {
    released: 0,
    tryLock(timeout) {
      calls.events.push(`tryLock:${timeout}`);
      calls.sequence.push(`tryLock:${timeout}`);
      if (options.throwTryLock) throw new Error("synthetic lock internals");
      return !options.lockTimeout;
    },
    releaseLock() {
      calls.events.push("releaseLock");
      this.released += 1;
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
    if (name === "activity_logs" && options.failAuditRead && !auditReadFailed && sheets.activity_logs.rows.length) {
      auditReadFailed = true;
      throw new Error("synthetic audit readback internals");
    }
    const sheet = sheets[name];
    if (!sheet) throw new Error("UNEXPECTED_READ");
    for (const header of requiredHeaders) assert.equal(sheet.headers.includes(header), true, `required ${name}.${header}`);
    return {
      headers: [...sheet.headers],
      headerMap: Object.fromEntries(sheet.headers.map((header, index) => [header, index])),
      rows: sheet.rows.flatMap((row, index) => {
        if (!row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "")) return [];
        return [{
          sourceRowNumber: index + 2,
          values: Object.fromEntries(sheet.headers.map((header, column) => [
            header,
            options.cloneDateReads && row[column] instanceof Date ? new Date(row[column].getTime()) : row[column]
          ]))
        }];
      })
    };
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
          },
          deleteProperty(key) {
            calls.propertyWrites.push({ method: "deleteProperty", key, phase: runtime.phase });
            calls.events.push(`deleteProperty:${key}:${runtime.phase}`);
            properties.delete(key);
          }
        };
      }
    },
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
      if (options.incompleteClear && runtime.phase === "restore") row[row.length - 1] = "rollback residue";
    }
  };
  vm.createContext(context);
  vm.runInContext(read("apps-script/AdminPlaceSchema.gs"), context, { filename: "apps-script/AdminPlaceSchema.gs" });
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

test("Task 5 exports only the Create and Save Draft write actions", () => {
  const create = loadTransactionBackend("CREATE");
  assert.equal(typeof create.context.adminCreatePlace_, "function");
  assert.equal(typeof create.context.adminSavePlaceDraft_, "function");
  for (const forbidden of [
    "adminPublishPlace_", "adminUnpublishPlace_", "adminArchivePlace_", "adminRestorePlace_",
    "adminInspectPlaceDependencies_", "adminGetPlaceMediaOptions_"
  ]) assert.equal(typeof create.context[forbidden], "undefined", forbidden);
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
  assert.equal(runtime.calls.propertyReads.length, 0);
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

  const source = read("apps-script/AdminPlaceService.gs");
  const lockedCollisionBlock =
    "    return AdminPlaceService_withWriteLock_(function () {\n" +
    "      var context = AdminPlaceService_requireContext_(true);\n" +
    "      var placeId = AdminPlaceService_generatePlaceId_();\n" +
    "      if (Object.prototype.hasOwnProperty.call(context.placesById, placeId) ||\n" +
    "          Object.prototype.hasOwnProperty.call(context.draftsById, placeId)) {\n" +
    "        throw new Error(\"ADMIN_PLACE_ID_COLLISION\");\n" +
    "      }\n";
  const hoistedCollision = source.replace(
    lockedCollisionBlock,
    "    var context = AdminPlaceService_requireContext_(true);\n" +
    "    var placeId = AdminPlaceService_generatePlaceId_();\n" +
    "    if (Object.prototype.hasOwnProperty.call(context.placesById, placeId) ||\n" +
    "        Object.prototype.hasOwnProperty.call(context.draftsById, placeId)) {\n" +
    "      throw new Error(\"ADMIN_PLACE_ID_COLLISION\");\n" +
    "    }\n" +
    "    return AdminPlaceService_withWriteLock_(function () {\n"
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
  const source = read("apps-script/AdminPlaceService.gs");

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

  const publishedOverwrite = source.replace(
    "        var placePatch = {\n          entity_version: nextVersion,",
    "        var placePatch = {\n          name_th: parameters.content.name_th,\n          entity_version: nextVersion,"
  ).replace(
    '["entity_version", "updated_at", "updated_by"], placePatch',
    '["name_th", "entity_version", "updated_at", "updated_by"], placePatch'
  );
  assert.notEqual(publishedOverwrite, source, "Published overwrite mutation target must match");
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

test("transaction Router exposes only Task 5 draft writes and no force or later lifecycle path", () => {
  const { context, calls } = loadBackend();
  for (const action of ["adminCreatePlace", "adminSavePlaceDraft"]) {
    const result = post(context, { action, token: "TOKEN", payload: { force: true } });
    assertError(result, "VALIDATION_ERROR");
  }
  for (const action of ["adminPublishPlace", "adminUnpublishPlace", "adminArchivePlace", "adminRestorePlace"]) {
    const result = post(context, { action, token: "TOKEN", payload: { force: true } });
    assertError(result, "UNKNOWN_ACTION");
  }
  assert.equal(calls.auth.length, 2);
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
  const source = read("apps-script/AdminPlaceService.gs");

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
    "  var verificationTables = {",
    "  return true;\n  var verificationTables = {"
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

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("Admin Place service verification passed.\n");
