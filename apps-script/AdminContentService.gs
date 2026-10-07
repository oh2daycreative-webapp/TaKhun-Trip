// Internal primitives for exactly two explicitly defined domain services.
// No request may select a table, headers, validator, or handler.
var AdminContentService_STATUSES_ = ["draft", "published", "hidden", "archived", "deleted"];
var AdminContentService_TRANSITIONS_ = {
  draft: ["published", "archived", "deleted"],
  published: ["hidden", "archived", "deleted"],
  hidden: ["draft", "published", "archived", "deleted"],
  archived: ["draft", "deleted"],
  deleted: ["draft"]
};
var AdminContentService_AUDIT_HEADERS_ = ["log_id", "admin_id", "action", "entity_type", "entity_id", "description", "created_at", "audit_id", "actor_admin_id", "occurred_at"];

function AdminContentService_execute_(token, write, operation) {
  var lock = null, acquired = false;
  try {
    var admin = AdminContentService_auth_(token, write);
    if (write) {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(10000)) throw new Error("CONTENT_LOCK");
      acquired = true;
      admin = AdminContentService_auth_(token, true);
    }
    return { ok: true, data: operation(admin), message: "success" };
  } catch (error) {
    var messages = {
      UNAUTHORIZED: "Sign in to continue.", FORBIDDEN: "This role cannot perform this action.",
      VALIDATION_ERROR: "Invalid request data.", NOT_FOUND: "Record not found.",
      CONFLICT: "Content changed. Reload before editing.", DUPLICATE_ID: "Identifier already exists.",
      INVALID_TRANSITION: "This lifecycle change is not permitted.",
      OUTCOME_UNKNOWN: "The result is uncertain. Reload and reconcile; do not retry automatically."
    };
    var code = error && error.message;
    if (!Object.prototype.hasOwnProperty.call(messages, code)) code = "SERVER_ERROR";
    var safe = { code: code, message: messages[code] || "The request could not be completed." };
    if (code === "OUTCOME_UNKNOWN") {
      safe.retryable = false;
      if (error.entity_type === "product") safe.product_id = error.entity_id;
      if (error.entity_type === "event") safe.event_id = error.entity_id;
    }
    return { ok: false, error: safe };
  } finally {
    if (acquired) {
      try { lock.releaseLock(); } catch (_releaseError) { /* Do not turn a known result into a retryable failure. */ }
    }
  }
}

function AdminContentService_auth_(token, write) {
  var admin = AuthService_requireAdmin_(token);
  if (!admin || ["super_admin", "editor", "reviewer", "viewer"].indexOf(admin.role) < 0) throw new Error("FORBIDDEN");
  if (write && ["super_admin", "editor"].indexOf(admin.role) < 0) throw new Error("FORBIDDEN");
  return admin;
}

function AdminContentService_object_(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.prototype.toString.call(value) !== "[object Object]") throw new Error("VALIDATION_ERROR");
  Object.keys(value).forEach(function (key) { if (keys.indexOf(key) < 0) throw new Error("VALIDATION_ERROR"); });
  return value;
}

function AdminContentService_id_(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value)) throw new Error("VALIDATION_ERROR");
  return value;
}

function AdminContentService_text_(value, limit) {
  if (typeof value !== "string" || value.length > (limit || 20000) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error("VALIDATION_ERROR");
  var text = value.trim();
  // Reject rather than escape: public readers have no spreadsheet-unescape step.
  if (/^[=+@\-']/.test(text)) throw new Error("VALIDATION_ERROR");
  try { CryptoService_utf8Bytes_(text); } catch (_invalidUnicode) { throw new Error("VALIDATION_ERROR"); }
  return text;
}

function AdminContentService_url_(value) {
  var text = AdminContentService_text_(value, 2048);
  if (!text) return "";
  // Apps Script has no browser URL API. Require an ASCII HTTP(S) authority,
  // no credentials/control escapes/backslashes. DNS terminal labels must start
  // with an ASCII letter; IPv4 is four canonical decimal octets, never a
  // runtime-dependent abbreviated, hexadecimal or octal numeric host.
  if (/[\s\\<>"']/.test(text) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(text)) throw new Error("VALIDATION_ERROR");
  var match = /^https?:\/\/([^/?#]+)(?:[/?#].*)?$/i.exec(text);
  if (!match || match[1].indexOf("@") >= 0 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?::[0-9]{1,5})?$/i.test(match[1])) throw new Error("VALIDATION_ERROR");
  var port = /:([0-9]+)$/.exec(match[1]);
  if (port && (Number(port[1]) < 1 || Number(port[1]) > 65535)) throw new Error("VALIDATION_ERROR");
  var host = match[1].replace(/:[0-9]+$/, "");
  var labels = host.split(".");
  if (/^[0-9.]+$/.test(host)) {
    if (labels.length !== 4 || labels.some(function (label) {
      return !/^(?:0|[1-9][0-9]{0,2})$/.test(label) || Number(label) > 255;
    })) throw new Error("VALIDATION_ERROR");
  } else if (!/^[a-z]/i.test(labels[labels.length - 1])) {
    throw new Error("VALIDATION_ERROR");
  }
  return text;
}

function AdminContentService_coordinates_(record) {
  ["latitude", "longitude"].forEach(function (field) {
    var value = record[field], max = field === "latitude" ? 90 : 180;
    if (value !== "" && (typeof value !== "number" || !isFinite(value) || Math.abs(value) > max)) throw new Error("VALIDATION_ERROR");
  });
  if ((record.latitude === "") !== (record.longitude === "")) throw new Error("VALIDATION_ERROR");
}

function AdminContentService_reference_(record) {
  if (!record.related_place_id) return;
  AdminContentService_id_(record.related_place_id);
  var matches = SheetService_readTable_("places", ["place_id", "status"]).rows.filter(function (row) { return row.values.place_id === record.related_place_id; });
  if (matches.length !== 1 || ["draft", "published"].indexOf(matches[0].values.status) < 0 ||
      (record.status === "published" && matches[0].values.status !== "published")) throw new Error("VALIDATION_ERROR");
}

function AdminContentService_headers_(domain) { return [domain.id].concat(domain.fields, ["status", "created_at", "updated_at"]); }

function AdminContentService_table_(domain) {
  var table = SheetService_readTable_(domain.table, AdminContentService_headers_(domain));
  var ids = Object.create(null);
  table.rows.forEach(function (entry) {
    // Canonicalize only the schema-valid legacy blank in this read snapshot.
    // Detail, revision and mutation callers share it; request validation stays
    // strict, and reading never writes the normalized value back to Sheets.
    if (entry.values.is_featured === "") entry.values.is_featured = false;
    var id = entry.values[domain.id];
    if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(id) || ids[id] || AdminContentService_STATUSES_.indexOf(entry.values.status) < 0) throw new Error("CONTENT_SCHEMA");
    ids[id] = true;
  });
  return table;
}

function AdminContentService_find_(domain, table, id) {
  var entry = table.rows.filter(function (row) { return row.values[domain.id] === id; })[0];
  if (!entry) throw new Error("NOT_FOUND");
  return entry;
}

function AdminContentService_revision_(domain, row) {
  var canonical = [domain.entity, 1];
  [domain.id].concat(domain.fields, ["status"]).forEach(function (field) {
    var value = row[field];
    if (value instanceof Date) value = value.toISOString();
    if (typeof value !== "string" && typeof value !== "boolean" && !(typeof value === "number" && isFinite(value))) throw new Error("CONTENT_SCHEMA");
    canonical.push([field, typeof value, value]);
  });
  return "r1-" + CryptoService_sha256_(CryptoService_utf8Bytes_(JSON.stringify(canonical))).map(function (byte) { return ("0" + (byte & 255).toString(16)).slice(-2); }).join("");
}

function AdminContentService_projection_(domain, row, detail) {
  var result = { status: row.status, revision: AdminContentService_revision_(domain, row), created_at: AdminContentService_timestamp_(row.created_at), updated_at: AdminContentService_timestamp_(row.updated_at) };
  result[domain.id] = row[domain.id];
  if (detail) {
    result.content = {};
    domain.fields.forEach(function (field) { result.content[field] = row[field] instanceof Date ? row[field].toISOString() : row[field]; });
  } else {
    result[domain.title] = row[domain.title];
    result[domain.category] = row[domain.category];
  }
  return result;
}

function AdminContentService_timestamp_(value) { return value instanceof Date ? value.toISOString() : typeof value === "string" ? value : ""; }

function AdminContentService_list_(domain, payload) {
  var p = AdminContentService_object_(payload, ["keyword", "status", "page", "page_size", domain.category]);
  var keyword = p.keyword === undefined ? "" : AdminContentService_text_(p.keyword, 200).toLowerCase();
  var status = p.status === undefined ? "" : p.status;
  if (status !== "" && AdminContentService_STATUSES_.indexOf(status) < 0) throw new Error("VALIDATION_ERROR");
  var category = p[domain.category] === undefined ? "" : p[domain.category];
  if (category !== "" && domain.categories.indexOf(category) < 0) throw new Error("VALIDATION_ERROR");
  var page = p.page === undefined ? 1 : p.page, size = p.page_size === undefined ? 20 : p.page_size;
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isSafeInteger(size) || size < 1 || size > 100) throw new Error("VALIDATION_ERROR");
  var rows = AdminContentService_table_(domain).rows.filter(function (entry) {
    var row = entry.values;
    return (!status || row.status === status) && (!category || row[domain.category] === category) &&
      (!keyword || [row[domain.id], row[domain.title], row[domain.title.replace(/_th$/, "_en")]].some(function (value) { return String(value).toLowerCase().indexOf(keyword) >= 0; }));
  });
  return { items: rows.slice((page - 1) * size, page * size).map(function (entry) { return AdminContentService_projection_(domain, entry.values, false); }), total: rows.length, page: page, page_size: size, total_pages: Math.ceil(rows.length / size) };
}

function AdminContentService_detail_(domain, payload) {
  var p = AdminContentService_object_(payload, [domain.id]);
  return AdminContentService_projection_(domain, AdminContentService_find_(domain, AdminContentService_table_(domain), AdminContentService_id_(p[domain.id])).values, true);
}

function AdminContentService_create_(domain, admin, payload) {
  var p = AdminContentService_object_(payload, domain.fields);
  var record = {};
  domain.fields.forEach(function (field) { record[field] = Object.prototype.hasOwnProperty.call(p, field) ? p[field] : field === "is_featured" ? false : ""; });
  record.status = "draft";
  record = domain.validate(record);
  AdminContentService_reference_(record);
  var table = AdminContentService_table_(domain);
  var id = domain.prefix + Utilities.getUuid();
  AdminContentService_id_(id);
  if (table.rows.some(function (entry) { return entry.values[domain.id] === id; })) throw new Error("DUPLICATE_ID");
  record[domain.id] = id;
  record.created_at = new Date().toISOString(); record.updated_at = record.created_at;
  return AdminContentService_write_(domain, admin, table, null, record, "CREATE");
}

function AdminContentService_update_(domain, admin, payload, deleting) {
  var p = AdminContentService_object_(payload, [domain.id, "expected_revision"].concat(deleting ? [] : domain.fields.concat(["status"])));
  var id = AdminContentService_id_(p[domain.id]);
  if (typeof p.expected_revision !== "string" || !/^r1-[a-f0-9]{64}$/.test(p.expected_revision)) throw new Error("VALIDATION_ERROR");
  var table = AdminContentService_table_(domain), entry = AdminContentService_find_(domain, table, id), current = entry.values;
  if (AdminContentService_revision_(domain, current) !== p.expected_revision) throw new Error("CONFLICT");
  var changedFields = domain.fields.filter(function (field) { return Object.prototype.hasOwnProperty.call(p, field); });
  var hasStatus = deleting || Object.prototype.hasOwnProperty.call(p, "status");
  if (!hasStatus && !changedFields.length) throw new Error("VALIDATION_ERROR");
  var nextStatus = deleting ? "deleted" : hasStatus ? p.status : current.status;
  if (AdminContentService_STATUSES_.indexOf(nextStatus) < 0) throw new Error("VALIDATION_ERROR");
  if (hasStatus && AdminContentService_TRANSITIONS_[current.status].indexOf(nextStatus) < 0) throw new Error("INVALID_TRANSITION");
  if (["archived", "deleted"].indexOf(current.status) >= 0 && changedFields.length) throw new Error("INVALID_TRANSITION");
  if (hasStatus && ["draft", "archived", "deleted"].indexOf(nextStatus) >= 0 && changedFields.length) throw new Error("INVALID_TRANSITION");
  var record = {};
  AdminContentService_headers_(domain).forEach(function (field) { record[field] = current[field]; });
  changedFields.forEach(function (field) { record[field] = p[field]; });
  record.status = nextStatus;
  // Retire/restore old rows without requiring now-unavailable references. Any
  // content edit or publishing validates the complete prospective content.
  if (changedFields.length || nextStatus === "published") {
    record = domain.validate(record);
    AdminContentService_reference_(record);
  }
  record.updated_at = new Date().toISOString();
  var actions = { draft: "RESTORE", published: "PUBLISH", hidden: "HIDE", archived: "ARCHIVE", deleted: "DELETE" };
  return AdminContentService_write_(domain, admin, table, entry, record, hasStatus ? actions[nextStatus] : "UPDATE");
}

function AdminContentService_assertFormats_(sheet, rowNumber, headers, record) {
  var range = sheet.getRange(rowNumber, 1, 1, headers.length);
  var formats = range.getNumberFormats()[0], formulas = range.getFormulas()[0];
  if (!formats || formats.length !== headers.length || !formulas || formulas.length !== headers.length) throw new Error("CONTENT_FORMAT");
  headers.forEach(function (field, index) {
    // A full-row write must not replace an unrelated formula with its value or
    // re-interpret a legacy formula-like text cell as an executable formula.
    if (formulas[index] || (typeof record[field] === "string" && /^[\s]*[=+@\-']/.test(record[field]))) throw new Error("CONTENT_FORMULA");
    if (typeof record[field] === "string" && record[field] !== "" && formats[index] !== "@") throw new Error("CONTENT_FORMAT");
    // M7's disposable Sheets probe established these formats preserve booleans.
    if (typeof record[field] === "boolean" && ["0", "0.###############"].indexOf(formats[index]) < 0) throw new Error("CONTENT_FORMAT");
  });
}

function AdminContentService_verify_(sheetName, headers, idField, id, rowNumber, record) {
  var matches = SheetService_readTable_(sheetName, headers).rows.filter(function (row) { return row.values[idField] === id; });
  if (matches.length !== 1 || matches[0].sourceRowNumber !== rowNumber) throw new Error("CONTENT_VERIFY");
  headers.forEach(function (field) {
    var expected = record[field], actual = matches[0].values[field];
    if (expected instanceof Date && actual instanceof Date && expected.getTime() === actual.getTime()) return;
    if (actual !== expected) throw new Error("CONTENT_VERIFY");
  });
}

function AdminContentService_write_(domain, admin, table, entry, record, action) {
  var sheet = SheetService_getSheet_(domain.table);
  var rowNumber = entry ? entry.sourceRowNumber : sheet.getLastRow() + 1;
  var intended = {};
  table.headers.forEach(function (field) {
    intended[field] = Object.prototype.hasOwnProperty.call(record, field) ? record[field] : entry ? entry.values[field] : "";
  });
  AdminContentService_assertFormats_(sheet, rowNumber, table.headers, intended);
  // Validate audit destination before the entity write; failures after it are
  // explicitly reported as unconfirmed audit, never as clean mutation failure.
  var auditTable = SheetService_readTable_("activity_logs", AdminContentService_AUDIT_HEADERS_);
  var auditId = Utilities.getUuid(), occurredAt = record.updated_at;
  var audit = { log_id: auditId, audit_id: auditId, admin_id: admin.admin_id, actor_admin_id: admin.admin_id, action: action, entity_type: domain.entity, entity_id: record[domain.id], description: JSON.stringify({ status: record.status, revision: AdminContentService_revision_(domain, record) }), created_at: occurredAt, occurred_at: occurredAt };
  if (auditTable.rows.some(function (row) { return row.values.audit_id === auditId || row.values.log_id === auditId; })) throw new Error("CONTENT_AUDIT_COLLISION");
  var auditSheet = SheetService_getSheet_("activity_logs"), auditRow = auditSheet.getLastRow() + 1;
  AdminContentService_assertFormats_(auditSheet, auditRow, auditTable.headers, audit);
  var prepared = entry ? null : SheetService_prepareAppendDestination_(sheet, table.headers, table.headers);
  var preparedAudit = SheetService_prepareAppendDestination_(auditSheet, auditTable.headers, auditTable.headers);
  ContentCacheService_invalidateUnderLock_();
  try {
    if (entry) SheetService_replaceObjectAtRow_(domain.table, rowNumber, intended);
    else SheetService_appendObjectWithRow_(domain.table, table.headers, intended, prepared);
    SpreadsheetApp.flush();
    AdminContentService_verify_(domain.table, table.headers, domain.id, record[domain.id], rowNumber, intended);
  } catch (_writeError) {
    var uncertain = new Error("OUTCOME_UNKNOWN");
    uncertain.entity_type = domain.entity; uncertain.entity_id = record[domain.id]; throw uncertain;
  }
  var auditStatus = "recorded";
  try {
    SheetService_appendObjectWithRow_("activity_logs", auditTable.headers, audit, preparedAudit);
    SpreadsheetApp.flush();
    AdminContentService_verify_("activity_logs", AdminContentService_AUDIT_HEADERS_, "audit_id", auditId, auditRow, audit);
  } catch (_auditError) { auditStatus = "unconfirmed"; }
  var result = AdminContentService_projection_(domain, record, false);
  result.audit_status = auditStatus;
  return result;
}
