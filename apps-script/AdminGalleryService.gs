var AdminGalleryService_SHEET_ = "gallery";
var AdminGalleryService_ALLOWED_ROLES_ = ["super_admin", "editor", "reviewer", "viewer"];
var AdminGalleryService_WRITE_ROLES_ = ["super_admin", "editor"];
var AdminGalleryService_STATUSES_ = ["draft", "published", "hidden", "archived", "deleted"];
var AdminGalleryService_CANONICAL_CATEGORIES_ = ["dam_lake", "mountain_nature", "community_life", "food_fruit", "activity_tradition"];
var AdminGalleryService_LEGACY_CATEGORIES_ = ["place", "route", "event", "product", "community", "hero", "other"];
var AdminGalleryService_CONTENT_FIELDS_ = [
  "title_th", "title_en", "media_type", "category", "related_place_id", "image_url", "video_url",
  "thumbnail_url", "caption_th", "caption_en", "credit", "sort_order"
];
var AdminGalleryService_HEADERS_ = ["media_id"].concat(AdminGalleryService_CONTENT_FIELDS_, ["status", "created_at", "updated_at"]);
var AdminGalleryService_EDITABLE_FIELDS_ = ["title_th", "title_en", "category", "related_place_id", "caption_th", "caption_en", "credit", "sort_order"];
var AdminGalleryService_TRANSITIONS_ = {
  draft: ["published", "archived", "deleted"],
  published: ["hidden", "archived", "deleted"],
  hidden: ["draft", "published", "archived", "deleted"],
  archived: ["draft", "deleted"],
  deleted: ["draft"]
};
var AdminGalleryService_AUDIT_HEADERS_ = ["log_id", "admin_id", "action", "entity_type", "entity_id", "description", "created_at", "audit_id", "actor_admin_id", "occurred_at"];
var AdminGalleryService_MANIFEST_ID_PATTERN_ = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function AdminGalleryService_execute_(token, write, operation) {
  var lock = null;
  var acquired = false;
  try {
    var admin = AdminGalleryService_auth_(token, write);
    if (write) {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(10000)) throw new Error("CONTENT_LOCK");
      acquired = true;
      admin = AdminGalleryService_auth_(token, true);
    }
    return { ok: true, data: operation(admin), message: "success" };
  } catch (error) {
    var messages = {
      UNAUTHORIZED: "Sign in to continue.", FORBIDDEN: "This role cannot perform this action.",
      VALIDATION_ERROR: "Invalid request data.", NOT_FOUND: "Record not found.",
      CONFLICT: "Content changed. Reload before editing.", DUPLICATE_ID: "Identifier already exists.",
      INVALID_TRANSITION: "This lifecycle change is not permitted.", CONTENT_LOCK: "Content is busy. Try again.",
      OUTCOME_UNKNOWN: "The result is uncertain. Reload and reconcile; do not retry automatically."
    };
    var code = error && error.message;
    if (!Object.prototype.hasOwnProperty.call(messages, code)) code = "SERVER_ERROR";
    var safe = { code: code, message: messages[code] || "The request could not be completed." };
    if (code === "OUTCOME_UNKNOWN") {
      safe.retryable = false;
      if (error.media_id) safe.media_id = error.media_id;
    }
    return { ok: false, error: safe };
  } finally {
    if (acquired) {
      try { lock.releaseLock(); } catch (_releaseError) { /* Preserve the known result. */ }
    }
  }
}

function AdminGalleryService_auth_(token, write) {
  var admin = AuthService_requireAdmin_(token);
  if (!admin || AdminGalleryService_ALLOWED_ROLES_.indexOf(admin.role) < 0) throw new Error("FORBIDDEN");
  if (write && AdminGalleryService_WRITE_ROLES_.indexOf(admin.role) < 0) throw new Error("FORBIDDEN");
  return admin;
}

function AdminGalleryService_object_(value, allowed, allowMissing) {
  if (value === undefined && allowMissing) return {};
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.prototype.toString.call(value) !== "[object Object]") throw new Error("VALIDATION_ERROR");
  Object.keys(value).forEach(function (key) { if (allowed.indexOf(key) < 0) throw new Error("VALIDATION_ERROR"); });
  return value;
}

function AdminGalleryService_id_(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value)) throw new Error("VALIDATION_ERROR");
  return value;
}

function AdminGalleryService_text_(value, limit) {
  if (typeof value !== "string" || value.length > (limit || 20000) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) throw new Error("VALIDATION_ERROR");
  var text = value.trim();
  if (/^[=+@\-']/.test(text) || /<[^>]*>/.test(text)) throw new Error("VALIDATION_ERROR");
  try { CryptoService_utf8Bytes_(text); } catch (_unicodeError) { throw new Error("VALIDATION_ERROR"); }
  return text;
}

function AdminGalleryService_timestamp_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
  if (typeof value !== "string") throw new Error("GALLERY_SCHEMA");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value) return value;
  var match = /^(\d{4})-(\d{2})-(\d{2}) ([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.exec(value);
  if (match) {
    var iso = match[1] + "-" + match[2] + "-" + match[3] + "T" + match[4] + ":" + match[5] + ":" + match[6] + ".000Z";
    if (new Date(iso).toISOString() === iso) return value;
  }
  throw new Error("GALLERY_SCHEMA");
}

function AdminGalleryService_table_() {
  var table = SheetService_readTable_(AdminGalleryService_SHEET_, AdminGalleryService_HEADERS_);
  if (!table || !Array.isArray(table.headers) || !table.headerMap || !Array.isArray(table.rows)) throw new Error("GALLERY_SCHEMA");
  var headerSeen = Object.create(null);
  table.headers.forEach(function (header) {
    if (typeof header !== "string" || !header || Object.prototype.hasOwnProperty.call(headerSeen, header.toLowerCase())) throw new Error("GALLERY_SCHEMA");
    headerSeen[header.toLowerCase()] = true;
  });
  AdminGalleryService_HEADERS_.forEach(function (header) {
    if (!Object.prototype.hasOwnProperty.call(headerSeen, header)) throw new Error("GALLERY_SCHEMA");
  });
  var seen = Object.create(null);
  table.rows.forEach(function (entry) {
    var row = entry.values;
    var id = row.media_id;
    if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(id) || Object.prototype.hasOwnProperty.call(seen, id) ||
        ["image", "video"].indexOf(row.media_type) < 0 || AdminGalleryService_CANONICAL_CATEGORIES_.concat(AdminGalleryService_LEGACY_CATEGORIES_).indexOf(row.category) < 0 ||
        AdminGalleryService_STATUSES_.indexOf(row.status) < 0) throw new Error("GALLERY_SCHEMA");
    AdminGalleryService_timestamp_(row.created_at);
    AdminGalleryService_timestamp_(row.updated_at);
    seen[id] = true;
  });
  return table;
}

function AdminGalleryService_find_(table, mediaId) {
  var matches = table.rows.filter(function (entry) { return entry.values.media_id === mediaId; });
  if (!matches.length) throw new Error("NOT_FOUND");
  if (matches.length !== 1) throw new Error("GALLERY_SCHEMA");
  return matches[0];
}

function AdminGalleryService_revisionValue_(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number" && isFinite(value)) return value;
  throw new Error("GALLERY_SCHEMA");
}

function AdminGalleryService_revision_(row) {
  var canonical = ["gallery", 1];
  ["media_id"].concat(AdminGalleryService_CONTENT_FIELDS_, ["status"]).forEach(function (field) {
    canonical.push([field, typeof row[field], AdminGalleryService_revisionValue_(row[field])]);
  });
  return "r1-" + CryptoService_sha256_(CryptoService_utf8Bytes_(JSON.stringify(canonical))).map(function (byte) {
    return ("0" + (byte & 255).toString(16)).slice(-2);
  }).join("");
}

function AdminGalleryService_mediaState_(row) {
  return row.media_type === "video" ? "legacy_video" : "approved_image";
}

function AdminGalleryService_projection_(row, detail) {
  var result = {
    media_id: row.media_id,
    title_th: typeof row.title_th === "string" ? row.title_th : "",
    media_type: row.media_type,
    category: row.category,
    status: row.status,
    revision: AdminGalleryService_revision_(row),
    created_at: AdminGalleryService_timestamp_(row.created_at),
    updated_at: AdminGalleryService_timestamp_(row.updated_at),
    media_state: AdminGalleryService_mediaState_(row)
  };
  if (detail) {
    result.content = {};
    AdminGalleryService_CONTENT_FIELDS_.forEach(function (field) {
      result.content[field] = row[field] instanceof Date ? row[field].toISOString() : row[field];
    });
  }
  return result;
}

function AdminGalleryService_requestInteger_(value, fallback) {
  var number = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(number) || number < 1 || number > (fallback === 20 ? 100 : 1000000)) throw new Error("VALIDATION_ERROR");
  return number;
}

function AdminGalleryService_list_(payload) {
  var p = AdminGalleryService_object_(payload, ["keyword", "status", "media_type", "category", "page", "page_size"], true);
  var keyword = p.keyword === undefined ? "" : AdminGalleryService_text_(p.keyword, 200).trim().toLowerCase();
  var status = p.status === undefined ? "" : p.status;
  var mediaType = p.media_type === undefined ? "" : p.media_type;
  var category = p.category === undefined ? "" : p.category;
  if (status && AdminGalleryService_STATUSES_.indexOf(status) < 0 || mediaType && ["image", "video"].indexOf(mediaType) < 0 || typeof category !== "string") throw new Error("VALIDATION_ERROR");
  var page = AdminGalleryService_requestInteger_(p.page, 1);
  var pageSize = AdminGalleryService_requestInteger_(p.page_size, 20);
  var entries = AdminGalleryService_table_().rows.filter(function (entry) {
    var row = entry.values;
    return (!status || row.status === status) && (!mediaType || row.media_type === mediaType) && (!category || row.category === category) &&
      (!keyword || [row.media_id, row.title_th, row.title_en, row.caption_th, row.caption_en, row.credit].some(function (value) { return String(value || "").toLowerCase().indexOf(keyword) >= 0; }));
  });
  var start = (page - 1) * pageSize;
  return { items: entries.slice(start, start + pageSize).map(function (entry) { return AdminGalleryService_projection_(entry.values, false); }), page: page, page_size: pageSize, total: entries.length, total_pages: entries.length ? Math.ceil(entries.length / pageSize) : 0 };
}

function AdminGalleryService_detail_(payload) {
  var p = AdminGalleryService_object_(payload, ["media_id"], false);
  if (Object.keys(p).length !== 1) throw new Error("VALIDATION_ERROR");
  return AdminGalleryService_projection_(AdminGalleryService_find_(AdminGalleryService_table_(), AdminGalleryService_id_(p.media_id)).values, true);
}

function AdminGalleryService_mediaOptions_(payload) {
  var p = AdminGalleryService_object_(payload, ["keyword", "page", "page_size"], true);
  var keyword = p.keyword === undefined ? "" : AdminGalleryService_text_(p.keyword, 200).trim().toLowerCase();
  var page = AdminGalleryService_requestInteger_(p.page, 1);
  var pageSize = AdminGalleryService_requestInteger_(p.page_size, 20);
  var items = ApprovedMediaService_read_().items.filter(function (item) {
    if (item.entity_type !== "gallery" || item.role !== "gallery") return false;
    return !keyword || [item.media_id, item.alt_th, item.alt_en].some(function (value) { return String(value || "").toLowerCase().indexOf(keyword) >= 0; });
  }).sort(function (left, right) { return left.media_id < right.media_id ? -1 : left.media_id > right.media_id ? 1 : 0; });
  var start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize).map(ApprovedMediaService_projection_), page: page, page_size: pageSize, total: items.length, total_pages: items.length ? Math.ceil(items.length / pageSize) : 0 };
}

function adminGetGallery_(token, payload) { return AdminGalleryService_execute_(token, false, function () { return AdminGalleryService_list_(payload); }); }
function adminGetGalleryDetail_(token, payload) { return AdminGalleryService_execute_(token, false, function () { return AdminGalleryService_detail_(payload); }); }
function adminGetGalleryMediaOptions_(token, payload) { return AdminGalleryService_execute_(token, false, function () { return AdminGalleryService_mediaOptions_(payload); }); }

function AdminGalleryService_revisionInput_(value) {
  if (typeof value !== "string" || !/^r1-[a-f0-9]{64}$/.test(value)) throw new Error("VALIDATION_ERROR");
  return value;
}

function AdminGalleryService_sortOrder_(value) {
  if (value === "") return "";
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("VALIDATION_ERROR");
  return value;
}

function AdminGalleryService_relatedPlace_(placeId, publishing) {
  if (!placeId) return;
  AdminGalleryService_id_(placeId);
  var matches = SheetService_readTable_("places", ["place_id", "status"]).rows.filter(function (entry) { return entry.values.place_id === placeId; });
  if (matches.length !== 1 || ["archived", "deleted"].indexOf(matches[0].values.status) >= 0 || publishing && matches[0].values.status !== "published") throw new Error("VALIDATION_ERROR");
}

function AdminGalleryService_manifestItem_(mediaId) {
  var matches = ApprovedMediaService_read_().items.filter(function (item) { return item.media_id === mediaId; });
  if (matches.length !== 1 || matches[0].entity_type !== "gallery" || matches[0].role !== "gallery") throw new Error("VALIDATION_ERROR");
  return matches[0];
}

function AdminGalleryService_imageContent_(source, current) {
  var normalized = {};
  AdminGalleryService_EDITABLE_FIELDS_.forEach(function (field) {
    var value = Object.prototype.hasOwnProperty.call(source, field) ? source[field] : current ? current[field] : field === "sort_order" ? "" : "";
    if (field === "sort_order") normalized[field] = AdminGalleryService_sortOrder_(value);
    else if (field === "related_place_id") normalized[field] = value === "" ? "" : AdminGalleryService_id_(value);
    else normalized[field] = AdminGalleryService_text_(value, field === "credit" ? 500 : 20000);
  });
  if (!normalized.title_th || AdminGalleryService_CANONICAL_CATEGORIES_.indexOf(normalized.category) < 0) throw new Error("VALIDATION_ERROR");
  return normalized;
}

function AdminGalleryService_validatePublish_(record) {
  if (record.media_type !== "image" || !record.title_th || AdminGalleryService_CANONICAL_CATEGORIES_.indexOf(record.category) < 0) throw new Error("VALIDATION_ERROR");
  AdminGalleryService_manifestItem_(record.media_id);
  AdminGalleryService_relatedPlace_(record.related_place_id, true);
}

function AdminGalleryService_assertFormats_(sheet, rowNumber, headers, record) {
  var range = sheet.getRange(rowNumber, 1, 1, headers.length);
  var formats = range.getNumberFormats()[0];
  var formulas = range.getFormulas()[0];
  if (!formats || formats.length !== headers.length || !formulas || formulas.length !== headers.length) throw new Error("GALLERY_FORMAT");
  headers.forEach(function (field, index) {
    if (formulas[index] || typeof record[field] === "string" && /^[\s]*[=+@\-']/.test(record[field])) throw new Error("GALLERY_FORMULA");
    if (typeof record[field] === "string" && record[field] !== "" && formats[index] !== "@") throw new Error("GALLERY_FORMAT");
  });
}

function AdminGalleryService_verify_(headers, mediaId, rowNumber, intended) {
  var matches = SheetService_readTable_(AdminGalleryService_SHEET_, AdminGalleryService_HEADERS_).rows.filter(function (entry) { return entry.values.media_id === mediaId; });
  if (matches.length !== 1 || matches[0].sourceRowNumber !== rowNumber) throw new Error("GALLERY_VERIFY");
  headers.forEach(function (field) {
    var actual = matches[0].values[field];
    var expected = intended[field];
    if (actual instanceof Date && expected instanceof Date && actual.getTime() === expected.getTime()) return;
    if (actual !== expected) throw new Error("GALLERY_VERIFY");
  });
}

function AdminGalleryService_write_(admin, table, entry, record, action) {
  var sheet = SheetService_getSheet_(AdminGalleryService_SHEET_);
  var rowNumber = entry ? entry.sourceRowNumber : sheet.getLastRow() + 1;
  var intended = {};
  table.headers.forEach(function (field) { intended[field] = Object.prototype.hasOwnProperty.call(record, field) ? record[field] : entry ? entry.values[field] : ""; });
  AdminGalleryService_assertFormats_(sheet, rowNumber, table.headers, intended);
  var auditTable = SheetService_readTable_("activity_logs", AdminGalleryService_AUDIT_HEADERS_);
  var auditId = Utilities.getUuid();
  var audit = {
    log_id: auditId, admin_id: admin.admin_id, action: action, entity_type: "gallery", entity_id: record.media_id,
    description: JSON.stringify({ status: record.status, revision: AdminGalleryService_revision_(record) }), created_at: record.updated_at,
    audit_id: auditId, actor_admin_id: admin.admin_id, occurred_at: record.updated_at
  };
  if (auditTable.rows.some(function (row) { return row.values.audit_id === auditId || row.values.log_id === auditId; })) throw new Error("GALLERY_AUDIT_COLLISION");
  var auditSheet = SheetService_getSheet_("activity_logs");
  var auditRow = auditSheet.getLastRow() + 1;
  AdminGalleryService_assertFormats_(auditSheet, auditRow, auditTable.headers, audit);
  var prepared = entry ? null : SheetService_prepareAppendDestination_(sheet, table.headers, table.headers);
  var preparedAudit = SheetService_prepareAppendDestination_(auditSheet, auditTable.headers, auditTable.headers);
  ContentCacheService_invalidateUnderLock_();
  try {
    if (entry) SheetService_replaceObjectAtRow_(AdminGalleryService_SHEET_, rowNumber, intended);
    else SheetService_appendObjectWithRow_(AdminGalleryService_SHEET_, table.headers, intended, prepared);
    SpreadsheetApp.flush();
    AdminGalleryService_verify_(table.headers, record.media_id, rowNumber, intended);
  } catch (_entityError) {
    var uncertain = new Error("OUTCOME_UNKNOWN");
    uncertain.media_id = record.media_id;
    throw uncertain;
  }
  var auditStatus = "recorded";
  try {
    SheetService_appendObjectWithRow_("activity_logs", auditTable.headers, audit, preparedAudit);
    SpreadsheetApp.flush();
    var audits = SheetService_readTable_("activity_logs", AdminGalleryService_AUDIT_HEADERS_).rows.filter(function (entry) { return entry.values.audit_id === auditId; });
    if (audits.length !== 1 || audits[0].sourceRowNumber !== auditRow) throw new Error("GALLERY_AUDIT_VERIFY");
    auditTable.headers.forEach(function (field) {
      var expected = Object.prototype.hasOwnProperty.call(audit, field) ? audit[field] : "";
      var actual = audits[0].values[field];
      if (actual instanceof Date && expected instanceof Date && actual.getTime() === expected.getTime()) return;
      if (actual !== expected) throw new Error("GALLERY_AUDIT_VERIFY");
    });
  } catch (_auditError) { auditStatus = "unconfirmed"; }
  var result = AdminGalleryService_projection_(record, false);
  result.audit_status = auditStatus;
  return result;
}

function AdminGalleryService_create_(admin, payload) {
  var allowed = ["media_id"].concat(AdminGalleryService_EDITABLE_FIELDS_);
  var p = AdminGalleryService_object_(payload, allowed, false);
  if (Object.keys(p).length !== allowed.length) throw new Error("VALIDATION_ERROR");
  var mediaId = AdminGalleryService_id_(p.media_id);
  if (!AdminGalleryService_MANIFEST_ID_PATTERN_.test(mediaId)) throw new Error("VALIDATION_ERROR");
  var table = AdminGalleryService_table_();
  if (table.rows.some(function (entry) { return entry.values.media_id === mediaId; })) throw new Error("DUPLICATE_ID");
  AdminGalleryService_manifestItem_(mediaId);
  var content = AdminGalleryService_imageContent_(p, null);
  AdminGalleryService_relatedPlace_(content.related_place_id, false);
  var timestamp = new Date().toISOString();
  var record = { media_id: mediaId };
  AdminGalleryService_CONTENT_FIELDS_.forEach(function (field) { record[field] = ""; });
  Object.keys(content).forEach(function (field) { record[field] = content[field]; });
  record.media_type = "image";
  record.status = "draft";
  record.created_at = timestamp;
  record.updated_at = timestamp;
  return AdminGalleryService_write_(admin, table, null, record, "CREATE");
}

function AdminGalleryService_update_(admin, payload, deleting) {
  var allowed = ["media_id", "expected_revision"].concat(deleting ? [] : AdminGalleryService_EDITABLE_FIELDS_.concat(["status"]));
  var p = AdminGalleryService_object_(payload, allowed, false);
  var mediaId = AdminGalleryService_id_(p.media_id);
  var expectedRevision = AdminGalleryService_revisionInput_(p.expected_revision);
  var table = AdminGalleryService_table_();
  var entry = AdminGalleryService_find_(table, mediaId);
  var current = entry.values;
  if (AdminGalleryService_revision_(current) !== expectedRevision) throw new Error("CONFLICT");
  var changedFields = AdminGalleryService_EDITABLE_FIELDS_.filter(function (field) { return Object.prototype.hasOwnProperty.call(p, field); });
  var hasStatus = deleting || Object.prototype.hasOwnProperty.call(p, "status");
  if (!hasStatus && !changedFields.length) throw new Error("VALIDATION_ERROR");
  if (current.media_type === "video" && changedFields.length) throw new Error("VALIDATION_ERROR");
  if (["archived", "deleted"].indexOf(current.status) >= 0 && changedFields.length) throw new Error("INVALID_TRANSITION");
  var nextStatus = deleting ? "deleted" : hasStatus ? p.status : current.status;
  if (AdminGalleryService_STATUSES_.indexOf(nextStatus) < 0) throw new Error("VALIDATION_ERROR");
  if (hasStatus && AdminGalleryService_TRANSITIONS_[current.status].indexOf(nextStatus) < 0) throw new Error("INVALID_TRANSITION");
  if (current.media_type === "video" && nextStatus === "published") throw new Error("INVALID_TRANSITION");
  if (hasStatus && ["draft", "archived", "deleted"].indexOf(nextStatus) >= 0 && changedFields.length) throw new Error("INVALID_TRANSITION");
  var record = {};
  table.headers.forEach(function (field) { record[field] = current[field]; });
  if (changedFields.length) {
    var content = AdminGalleryService_imageContent_(p, current);
    changedFields.forEach(function (field) { record[field] = content[field]; });
    AdminGalleryService_relatedPlace_(record.related_place_id, false);
  }
  record.status = nextStatus;
  if (nextStatus === "published") AdminGalleryService_validatePublish_(record);
  if (AdminGalleryService_revision_(record) === AdminGalleryService_revision_(current)) throw new Error("VALIDATION_ERROR");
  record.updated_at = new Date().toISOString();
  var actions = { draft: "RESTORE", published: "PUBLISH", hidden: "HIDE", archived: "ARCHIVE", deleted: "DELETE" };
  return AdminGalleryService_write_(admin, table, entry, record, hasStatus ? actions[nextStatus] : "UPDATE");
}

function createGalleryItem_(token, payload) { return AdminGalleryService_execute_(token, true, function (admin) { return AdminGalleryService_create_(admin, payload); }); }
function updateGalleryItem_(token, payload) { return AdminGalleryService_execute_(token, true, function (admin) { return AdminGalleryService_update_(admin, payload, false); }); }
function deleteGalleryItem_(token, payload) { return AdminGalleryService_execute_(token, true, function (admin) { return AdminGalleryService_update_(admin, payload, true); }); }
