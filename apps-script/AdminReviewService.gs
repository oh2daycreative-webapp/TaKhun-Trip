var AdminReviewService_SHEET_ = "reviews";
var AdminReviewService_ROLES_ = ["super_admin", "editor", "reviewer", "viewer"];
var AdminReviewService_MODERATE_ROLES_ = ["super_admin", "editor", "reviewer"];
var AdminReviewService_REPLY_ROLES_ = ["super_admin", "editor"];
var AdminReviewService_DELETE_ROLES_ = ["super_admin"];
var AdminReviewService_STATUSES_ = ["pending", "approved", "hidden", "deleted"];
var AdminReviewService_HEADERS_ = [
  "review_id", "place_id", "reviewer_name", "is_anonymous", "rating", "comment",
  "admin_reply", "status", "created_at", "updated_at", "approved_at", "approved_by"
];
var AdminReviewService_AUDIT_HEADERS_ = [
  "log_id", "admin_id", "action", "entity_type", "entity_id", "description",
  "created_at", "audit_id", "actor_admin_id", "occurred_at"
];
var AdminReviewService_MAX_REPLY_POINTS_ = 2000;
var AdminReviewService_MAX_REPLY_BYTES_ = 8000;

function AdminReviewService_errorResponse_(error) {
  var messages = {
    UNAUTHORIZED: "Sign in to continue.",
    FORBIDDEN: "This role cannot perform this action.",
    VALIDATION_ERROR: "Invalid request data.",
    NOT_FOUND: "Record not found.",
    CONFLICT: "Content changed. Reload before editing.",
    INVALID_TRANSITION: "This lifecycle change is not permitted.",
    CONTENT_LOCK: "Content is busy. Try again.",
    OUTCOME_UNKNOWN: "The result is uncertain. Reload and reconcile; do not retry automatically."
  };
  var code = error && error.message;
  if (!Object.prototype.hasOwnProperty.call(messages, code)) code = "SERVER_ERROR";
  var safe = { code: code, message: messages[code] || "The request could not be completed." };
  if (code === "OUTCOME_UNKNOWN") {
    safe.retryable = false;
    if (error.review_id) safe.review_id = error.review_id;
  }
  return { ok: false, error: safe };
}

function AdminReviewService_execute_(token, roles, write, operation) {
  var lock = null;
  var acquired = false;
  try {
    var admin = AdminReviewService_authorize_(token, roles);
    if (write) {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(10000)) throw new Error("CONTENT_LOCK");
      acquired = true;
      admin = AdminReviewService_authorize_(token, roles);
    }
    return { ok: true, data: operation(admin), message: "success" };
  } catch (error) {
    return AdminReviewService_errorResponse_(error);
  } finally {
    if (acquired) {
      try { lock.releaseLock(); } catch (_releaseError) { /* Preserve the known result. */ }
    }
  }
}

function AdminReviewService_authorize_(token, roles) {
  var admin = AuthService_requireAdmin_(token);
  if (!admin || AdminReviewService_ROLES_.indexOf(admin.role) < 0 || roles.indexOf(admin.role) < 0) throw new Error("FORBIDDEN");
  return admin;
}

function AdminReviewService_object_(value, allowed, allowMissing) {
  if (value === undefined && allowMissing) return {};
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.prototype.toString.call(value) !== "[object Object]") throw new Error("VALIDATION_ERROR");
  Object.keys(value).forEach(function (key) { if (allowed.indexOf(key) < 0) throw new Error("VALIDATION_ERROR"); });
  return value;
}

function AdminReviewService_id_(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value)) throw new Error("VALIDATION_ERROR");
  return value;
}

function AdminReviewService_revisionInput_(value) {
  if (typeof value !== "string" || !/^r1-[a-f0-9]{64}$/.test(value)) throw new Error("VALIDATION_ERROR");
  return value;
}

function AdminReviewService_timestamp_(value, optional) {
  if ((value === "" || value === null || value === undefined) && optional) return "";
  if (value instanceof Date && isFinite(value.getTime())) return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) throw new Error("REVIEW_SCHEMA");
  var parts = value.match(/\d+/g).map(Number);
  var check = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]));
  if (check.getUTCFullYear() !== parts[0] || check.getUTCMonth() !== parts[1] - 1 || check.getUTCDate() !== parts[2] || check.getUTCHours() !== parts[3] || check.getUTCMinutes() !== parts[4] || check.getUTCSeconds() !== parts[5]) throw new Error("REVIEW_SCHEMA");
  return value;
}

function AdminReviewService_boolean_(value) {
  if (value === true || value === 1 || value === "TRUE" || value === "true" || value === "1") return true;
  if (value === false || value === 0 || value === "FALSE" || value === "false" || value === "0" || value === "") return false;
  throw new Error("REVIEW_SCHEMA");
}

function AdminReviewService_text_(value, allowEmpty) {
  if (typeof value !== "string" || value.indexOf("\u0000") >= 0 || !AdminReviewService_validUnicode_(value) || !allowEmpty && value === "") throw new Error("REVIEW_SCHEMA");
  return value;
}

function AdminReviewService_validUnicode_(value) {
  for (var index = 0; index < value.length; index += 1) {
    var code = value.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) {
      if (index + 1 >= value.length) return false;
      var next = value.charCodeAt(index + 1);
      if (next < 0xDC00 || next > 0xDFFF) return false;
      index += 1;
    } else if (code >= 0xDC00 && code <= 0xDFFF) return false;
  }
  return true;
}

function AdminReviewService_codePoints_(value) {
  var count = 0;
  for (var index = 0; index < value.length; index += 1) {
    var code = value.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) index += 1;
    count += 1;
  }
  return count;
}

function AdminReviewService_reply_(value) {
  if (typeof value !== "string" || value === "" || value.indexOf("\u0000") >= 0 || !AdminReviewService_validUnicode_(value) || /^'[=+\-@]/.test(value)) throw new Error("VALIDATION_ERROR");
  var bytes;
  try { bytes = CryptoService_utf8Bytes_(value); } catch (_unicodeError) { throw new Error("VALIDATION_ERROR"); }
  if (AdminReviewService_codePoints_(value) > AdminReviewService_MAX_REPLY_POINTS_ || bytes.length > AdminReviewService_MAX_REPLY_BYTES_) throw new Error("VALIDATION_ERROR");
  return value;
}

function AdminReviewService_escapeText_(value) { return /^[=+\-@]/.test(value) ? "'" + value : value; }
function AdminReviewService_unescapeText_(value) { return /^'[=+\-@]/.test(value) ? value.slice(1) : value; }

function AdminReviewService_table_() {
  return SheetService_readTable_(AdminReviewService_SHEET_, AdminReviewService_HEADERS_);
}

function AdminReviewService_validStoredId_(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value);
}

function AdminReviewService_classify_(table) {
  var counts = Object.create(null);
  table.rows.forEach(function (entry) {
    var id = entry.values.review_id;
    if (AdminReviewService_validStoredId_(id)) counts[id] = (counts[id] || 0) + 1;
  });
  var rows = [];
  var skipped = 0;
  table.rows.forEach(function (entry) {
    var id = entry.values.review_id;
    if (!AdminReviewService_validStoredId_(id) || counts[id] !== 1) { skipped += 1; return; }
    try { AdminReviewService_validateStored_(entry.values); rows.push(entry); }
    catch (_schemaError) { skipped += 1; }
  });
  return { rows: rows, skipped_count: skipped };
}

function AdminReviewService_validateStored_(row) {
  AdminReviewService_id_(row.review_id);
  AdminReviewService_id_(row.place_id);
  AdminReviewService_text_(row.reviewer_name, true);
  AdminReviewService_boolean_(row.is_anonymous);
  if (typeof row.rating !== "number" || !isFinite(row.rating) || Math.floor(row.rating) !== row.rating || row.rating < 1 || row.rating > 5) throw new Error("REVIEW_SCHEMA");
  AdminReviewService_text_(row.comment, false);
  AdminReviewService_text_(row.admin_reply, true);
  if (AdminReviewService_STATUSES_.indexOf(row.status) < 0) throw new Error("REVIEW_SCHEMA");
  AdminReviewService_timestamp_(row.created_at, false);
  AdminReviewService_timestamp_(row.updated_at, false);
  AdminReviewService_timestamp_(row.approved_at, true);
  AdminReviewService_text_(row.approved_by, true);
}

function AdminReviewService_find_(table, reviewId) {
  var matches = table.rows.filter(function (entry) { return entry.values.review_id === reviewId; });
  if (matches.length !== 1) throw new Error(matches.length ? "REVIEW_SCHEMA" : "NOT_FOUND");
  try { AdminReviewService_validateStored_(matches[0].values); }
  catch (_schemaError) { throw new Error("REVIEW_SCHEMA"); }
  return matches[0];
}

function AdminReviewService_revision_(row) {
  var canonical = ["review", 1];
  AdminReviewService_HEADERS_.forEach(function (field) {
    var value = row[field] instanceof Date ? AdminReviewService_timestamp_(row[field], field === "approved_at") : row[field];
    canonical.push([field, typeof value, value]);
  });
  return "r1-" + CryptoService_sha256_(CryptoService_utf8Bytes_(JSON.stringify(canonical))).map(function (byte) { return ("0" + (byte & 255).toString(16)).slice(-2); }).join("");
}

function AdminReviewService_timestampMillis_(value) {
  var canonical = AdminReviewService_timestamp_(value, false);
  var parts = canonical.match(/\d+/g).map(Number);
  return Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
}

function AdminReviewService_timestampFromMillis_(value) {
  var date = new Date(value);
  function two(number) { return ("0" + number).slice(-2); }
  return date.getUTCFullYear() + "-" + two(date.getUTCMonth() + 1) + "-" + two(date.getUTCDate()) + " " +
    two(date.getUTCHours()) + ":" + two(date.getUTCMinutes()) + ":" + two(date.getUTCSeconds());
}

function AdminReviewService_nextTimestamp_(current) {
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  var next = Math.max(AdminReviewService_timestampMillis_(now), AdminReviewService_timestampMillis_(current) + 1000);
  return AdminReviewService_timestampFromMillis_(next);
}

function AdminReviewService_projection_(row) {
  var anonymous = AdminReviewService_boolean_(row.is_anonymous);
  return {
    review_id: row.review_id,
    place_id: row.place_id,
    reviewer_name: anonymous ? "นักท่องเที่ยว" : AdminReviewService_unescapeText_(row.reviewer_name),
    is_anonymous: anonymous,
    rating: row.rating,
    comment: AdminReviewService_unescapeText_(row.comment),
    admin_reply: AdminReviewService_unescapeText_(row.admin_reply),
    status: row.status,
    created_at: AdminReviewService_timestamp_(row.created_at, false),
    updated_at: AdminReviewService_timestamp_(row.updated_at, false),
    approved_at: AdminReviewService_timestamp_(row.approved_at, true),
    approved_by: row.approved_by,
    revision: AdminReviewService_revision_(row)
  };
}

function AdminReviewService_integer_(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !isFinite(value) || Math.floor(value) !== value || value < 1 || value > maximum) throw new Error("VALIDATION_ERROR");
  return value;
}

function AdminReviewService_list_(payload) {
  var p = AdminReviewService_object_(payload, ["keyword", "status", "place_id", "page", "page_size"], true);
  var keyword = p.keyword === undefined ? "" : p.keyword;
  if (typeof keyword !== "string" || keyword.length > 200 || keyword.indexOf("\u0000") >= 0 || !AdminReviewService_validUnicode_(keyword)) throw new Error("VALIDATION_ERROR");
  keyword = keyword.toLowerCase();
  var status = p.status === undefined ? "" : p.status;
  if (status !== "" && AdminReviewService_STATUSES_.indexOf(status) < 0) throw new Error("VALIDATION_ERROR");
  var placeId = p.place_id === undefined || p.place_id === "" ? "" : AdminReviewService_id_(p.place_id);
  var page = AdminReviewService_integer_(p.page, 1, 1000000);
  var pageSize = AdminReviewService_integer_(p.page_size, 20, 100);
  var classified = AdminReviewService_classify_(AdminReviewService_table_());
  var rows = classified.rows.filter(function (entry) {
    var row = entry.values;
    if (status && row.status !== status || placeId && row.place_id !== placeId) return false;
    if (!keyword) return true;
    return [row.review_id, row.place_id, row.reviewer_name, row.comment, row.admin_reply].some(function (value) { return String(value || "").toLowerCase().indexOf(keyword) >= 0; });
  });
  var start = (page - 1) * pageSize;
  return {
    items: rows.slice(start, start + pageSize).map(function (entry) { return AdminReviewService_projection_(entry.values); }),
    page: page,
    page_size: pageSize,
    total: rows.length,
    total_pages: rows.length ? Math.ceil(rows.length / pageSize) : 0,
    warning: classified.skipped_count ? { code: "SKIPPED_INVALID_REVIEWS", skipped_count: classified.skipped_count } : null
  };
}

function AdminReviewService_detail_(payload) {
  var p = AdminReviewService_object_(payload, ["review_id"], false);
  if (Object.keys(p).length !== 1) throw new Error("VALIDATION_ERROR");
  return AdminReviewService_projection_(AdminReviewService_find_(AdminReviewService_table_(), AdminReviewService_id_(p.review_id)).values);
}

function adminGetReviews_(token, payload) { return AdminReviewService_execute_(token, AdminReviewService_ROLES_, false, function () { return AdminReviewService_list_(payload); }); }
function adminGetReviewDetail_(token, payload) { return AdminReviewService_execute_(token, AdminReviewService_ROLES_, false, function () { return AdminReviewService_detail_(payload); }); }

function AdminReviewService_mutationPayload_(payload, reply) {
  var allowed = reply ? ["review_id", "expected_revision", "admin_reply"] : ["review_id", "expected_revision"];
  var p = AdminReviewService_object_(payload, allowed, false);
  if (Object.keys(p).length !== allowed.length) throw new Error("VALIDATION_ERROR");
  return { review_id: AdminReviewService_id_(p.review_id), expected_revision: AdminReviewService_revisionInput_(p.expected_revision), admin_reply: reply ? AdminReviewService_reply_(p.admin_reply) : null };
}

function AdminReviewService_placePublished_(placeId) {
  var matches = SheetService_readTable_("places", ["place_id", "status"]).rows.filter(function (entry) { return entry.values.place_id === placeId; });
  if (matches.length !== 1 || matches[0].values.status !== "published") throw new Error("INVALID_TRANSITION");
}

function AdminReviewService_verify_(reviewId, rowNumber, intended) {
  var entry = AdminReviewService_find_(AdminReviewService_table_(), reviewId);
  if (entry.sourceRowNumber !== rowNumber) throw new Error("REVIEW_VERIFY");
  AdminReviewService_HEADERS_.forEach(function (field) {
    if (entry.values[field] !== intended[field]) throw new Error("REVIEW_VERIFY");
  });
}

function AdminReviewService_audit_(admin, action, record, timestamp) {
  var table = SheetService_readTable_("activity_logs", AdminReviewService_AUDIT_HEADERS_);
  var auditId = Utilities.getUuid();
  var audit = {
    log_id: auditId, admin_id: admin.admin_id, action: action, entity_type: "review", entity_id: record.review_id,
    description: JSON.stringify({ status: record.status, revision: AdminReviewService_revision_(record) }), created_at: timestamp,
    audit_id: auditId, actor_admin_id: admin.admin_id, occurred_at: timestamp
  };
  var sheet = SheetService_getSheet_("activity_logs");
  var rowNumber = sheet.getLastRow() + 1;
  var prepared = SheetService_prepareAppendDestination_(sheet, table.headers, table.headers);
  try {
    SheetService_appendObjectWithRow_("activity_logs", table.headers, audit, prepared);
    SpreadsheetApp.flush();
    var matches = SheetService_readTable_("activity_logs", AdminReviewService_AUDIT_HEADERS_).rows.filter(function (entry) { return entry.values.audit_id === auditId; });
    if (matches.length !== 1 || matches[0].sourceRowNumber !== rowNumber) throw new Error("AUDIT_VERIFY");
    return "recorded";
  } catch (_auditError) { return "unconfirmed"; }
}

function AdminReviewService_write_(admin, action, payload, transform) {
  var table = AdminReviewService_table_();
  var entry = AdminReviewService_find_(table, payload.review_id);
  var current = entry.values;
  if (AdminReviewService_revision_(current) !== payload.expected_revision) throw new Error("CONFLICT");
  if (current.status === "deleted") throw new Error("INVALID_TRANSITION");
  var record = {};
  table.headers.forEach(function (field) { record[field] = current[field]; });
  transform(record, current);
  AdminReviewService_validateStored_(record);
  if (AdminReviewService_revision_(record) === AdminReviewService_revision_(current)) throw new Error("VALIDATION_ERROR");
  var auditTable = SheetService_readTable_("activity_logs", AdminReviewService_AUDIT_HEADERS_);
  SheetService_prepareAppendDestination_(SheetService_getSheet_("activity_logs"), auditTable.headers, auditTable.headers);
  var publicChanged = current.status === "approved" || record.status === "approved";
  if (publicChanged) PlaceService_bumpCacheEpoch_();
  try {
    SheetService_replaceObjectAtRow_(AdminReviewService_SHEET_, entry.sourceRowNumber, record);
    SpreadsheetApp.flush();
    AdminReviewService_verify_(record.review_id, entry.sourceRowNumber, record);
  } catch (_entityError) {
    var uncertain = new Error("OUTCOME_UNKNOWN");
    uncertain.review_id = record.review_id;
    throw uncertain;
  }
  var result = AdminReviewService_projection_(record);
  result.audit_status = AdminReviewService_audit_(admin, action, record, record.updated_at);
  return result;
}

function AdminReviewService_mutate_(token, roles, action, payload, reply, transform) {
  return AdminReviewService_execute_(token, roles, true, function (admin) {
    var p = AdminReviewService_mutationPayload_(payload, reply);
    return AdminReviewService_write_(admin, action, p, function (record, current) {
      transform(record, current, p, admin);
      record.updated_at = AdminReviewService_nextTimestamp_(current.updated_at);
    });
  });
}

function approveReview_(token, payload) {
  return AdminReviewService_mutate_(token, AdminReviewService_MODERATE_ROLES_, "APPROVE", payload, false, function (record, current, _p, admin) {
    if (["pending", "hidden"].indexOf(current.status) < 0) throw new Error("INVALID_TRANSITION");
    AdminReviewService_placePublished_(current.place_id);
    record.status = "approved";
    record.approved_at = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    record.approved_by = admin.admin_id;
  });
}

function hideReview_(token, payload) {
  return AdminReviewService_mutate_(token, AdminReviewService_MODERATE_ROLES_, "HIDE", payload, false, function (record, current) {
    if (["pending", "approved"].indexOf(current.status) < 0) throw new Error("INVALID_TRANSITION");
    record.status = "hidden";
  });
}

function replyReview_(token, payload) {
  return AdminReviewService_mutate_(token, AdminReviewService_REPLY_ROLES_, "REPLY", payload, true, function (record, current, p) {
    if (["pending", "approved", "hidden"].indexOf(current.status) < 0) throw new Error("INVALID_TRANSITION");
    record.admin_reply = AdminReviewService_escapeText_(p.admin_reply);
  });
}

function clearReviewReply_(token, payload) {
  return AdminReviewService_mutate_(token, AdminReviewService_REPLY_ROLES_, "CLEAR_REPLY", payload, false, function (record, current) {
    if (["pending", "approved", "hidden"].indexOf(current.status) < 0) throw new Error("INVALID_TRANSITION");
    if (current.admin_reply === "") throw new Error("VALIDATION_ERROR");
    record.admin_reply = "";
  });
}

function deleteReview_(token, payload) {
  return AdminReviewService_mutate_(token, AdminReviewService_DELETE_ROLES_, "DELETE", payload, false, function (record) { record.status = "deleted"; });
}
