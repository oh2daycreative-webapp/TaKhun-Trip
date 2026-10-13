var AdminSettingsService_KEYS_ = SettingsService_PUBLIC_KEYS_.slice();
var AdminSettingsService_BOOLEAN_KEYS_ = ["reviews_enabled", "events_enabled"];
var AdminSettingsService_ROLES_ = ["super_admin", "editor", "reviewer", "viewer"];

function AdminSettingsService_errorResponse_(error) {
  var messages = {
    UNAUTHORIZED: "Sign in to continue.", FORBIDDEN: "This role cannot perform this action.",
    VALIDATION_ERROR: "Invalid request data.", SETTINGS_SCHEMA: "Settings data is invalid.",
    CONFLICT: "Settings changed. Reload and reconcile before saving.",
    CONTENT_LOCK: "Settings are busy. Try again.",
    OUTCOME_UNKNOWN: "The result is uncertain. Reload and reconcile; do not retry automatically."
  };
  var code = error && error.message;
  if (!Object.prototype.hasOwnProperty.call(messages, code)) code = "SERVER_ERROR";
  var safe = { code: code, message: messages[code] || "The request could not be completed." };
  if (code === "OUTCOME_UNKNOWN") safe.retryable = false;
  return { ok: false, error: safe };
}

function AdminSettingsService_authorize_(token, roles) {
  var admin = AuthService_requireAdmin_(token);
  if (!admin || AdminSettingsService_ROLES_.indexOf(admin.role) < 0 || roles.indexOf(admin.role) < 0) throw new Error("FORBIDDEN");
  return admin;
}

function AdminSettingsService_validUnicode_(value) {
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

function AdminSettingsService_codePoints_(value) {
  var count = 0;
  for (var index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) >= 0xD800 && value.charCodeAt(index) <= 0xDBFF) index += 1;
    count += 1;
  }
  return count;
}

function AdminSettingsService_text_(value, minimum, maximum, maximumBytes, request, allowFormulaPrefix) {
  if (typeof value !== "string" || value !== value.trim() || !AdminSettingsService_validUnicode_(value) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) throw new Error(request ? "VALIDATION_ERROR" : "SETTINGS_SCHEMA");
  var normalized = typeof value.normalize === "function" ? value.normalize("NFC") : value;
  if (normalized !== value && request) throw new Error("VALIDATION_ERROR");
  var points = AdminSettingsService_codePoints_(normalized);
  var bytes;
  try { bytes = CryptoService_utf8Bytes_(normalized).length; } catch (_error) { throw new Error(request ? "VALIDATION_ERROR" : "SETTINGS_SCHEMA"); }
  if (points < minimum || points > maximum || bytes > maximumBytes) throw new Error(request ? "VALIDATION_ERROR" : "SETTINGS_SCHEMA");
  if (request && !allowFormulaPrefix && (/^[=+\-@]/.test(normalized) || /^'[=+\-@]/.test(normalized))) throw new Error("VALIDATION_ERROR");
  return normalized;
}

function AdminSettingsService_email_(value, request) {
  value = AdminSettingsService_text_(value, 0, 254, 254, request);
  if (!value) return value;
  var parts = value.split("@");
  var labels = parts.length === 2 ? parts[1].split(".") : [];
  if (!/^[\x21-\x7E]+$/.test(value) || parts.length !== 2 || !parts[0] || parts[0].length > 64 || !labels.length || labels.some(function (label) { return !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label); })) throw new Error(request ? "VALIDATION_ERROR" : "SETTINGS_SCHEMA");
  return value;
}

function AdminSettingsService_phone_(value, request) {
  value = AdminSettingsService_text_(value, 0, 40, 80, request, true);
  if (!value) return value;
  if (!/^[+0-9 .()\-]+$/.test(value) || (value.match(/\(/g) || []).length !== (value.match(/\)/g) || []).length) throw new Error(request ? "VALIDATION_ERROR" : "SETTINGS_SCHEMA");
  var compact = value.replace(/[ .()\-]/g, "");
  if (!/^(?:0[2-7]\d{7}|0[689]\d{8}|\+66[2-7]\d{7}|\+66[689]\d{8})$/.test(compact)) throw new Error(request ? "VALIDATION_ERROR" : "SETTINGS_SCHEMA");
  return value;
}

function AdminSettingsService_url_(value, request) {
  value = AdminSettingsService_text_(value, 0, 2048, 8192, request);
  if (!value) return value;
  var match = /^(https?):\/\/([^/?#]+)([/?#].*)?$/i.exec(value);
  if (!match || /[@\\<>"']/.test(match[2])) throw new Error(request ? "VALIDATION_ERROR" : "SETTINGS_SCHEMA");
  var authority = /^([^:]+)(?::([0-9]{1,5}))?$/.exec(match[2]);
  var labels = authority ? authority[1].split(".") : [];
  if (!authority || !labels.length || labels.some(function (label) { return !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label); }) || authority[2] && (Number(authority[2]) < 1 || Number(authority[2]) > 65535)) throw new Error(request ? "VALIDATION_ERROR" : "SETTINGS_SCHEMA");
  return value;
}

function AdminSettingsService_exactObject_(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.prototype.toString.call(value) !== "[object Object]") throw new Error(code);
  var actual = Object.keys(value).sort();
  var expected = keys.slice().sort();
  if (actual.length !== expected.length || actual.some(function (key, index) { return key !== expected[index]; })) throw new Error(code);
  return value;
}

function AdminSettingsService_validateLogical_(source, request) {
  AdminSettingsService_exactObject_(source, AdminSettingsService_KEYS_, request ? "VALIDATION_ERROR" : "SETTINGS_SCHEMA");
  var result = {};
  result.site_name = AdminSettingsService_text_(source.site_name, 1, 120, 480, request);
  result.site_slogan_th = AdminSettingsService_text_(source.site_slogan_th, 1, 300, 1200, request);
  result.site_slogan_en = AdminSettingsService_text_(source.site_slogan_en, 0, 300, 1200, request);
  if (source.default_language !== "th" && source.default_language !== "en") throw new Error(request ? "VALIDATION_ERROR" : "SETTINGS_SCHEMA");
  result.default_language = source.default_language;
  result.main_email = AdminSettingsService_email_(source.main_email, request);
  result.main_phone = AdminSettingsService_phone_(source.main_phone, request);
  ["facebook_url", "line_url", "logo_url", "hero_image_url"].forEach(function (key) { result[key] = AdminSettingsService_url_(source[key], request); });
  AdminSettingsService_BOOLEAN_KEYS_.forEach(function (key) {
    if (typeof source[key] !== "boolean") throw new Error(request ? "VALIDATION_ERROR" : "SETTINGS_SCHEMA");
    result[key] = source[key];
  });
  return result;
}

function AdminSettingsService_validateRequestSettings_(source) { return AdminSettingsService_validateLogical_(source, true); }

function AdminSettingsService_timestamp_(value) {
  if (value instanceof Date && isFinite(value.getTime())) return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) throw new Error("SETTINGS_SCHEMA");
  var parts = value.match(/\d+/g).map(Number);
  var check = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]));
  if (check.getUTCFullYear() !== parts[0] || check.getUTCMonth() !== parts[1] - 1 || check.getUTCDate() !== parts[2] || check.getUTCHours() !== parts[3] || check.getUTCMinutes() !== parts[4] || check.getUTCSeconds() !== parts[5]) throw new Error("SETTINGS_SCHEMA");
  return value;
}

function AdminSettingsService_storedBoolean_(value) {
  var parsed = SettingsService_boolean_(value);
  if (!parsed.ok) throw new Error("SETTINGS_SCHEMA");
  return parsed.value;
}

function AdminSettingsService_canonical_(rows) {
  var matches = Object.create(null);
  AdminSettingsService_KEYS_.forEach(function (key) { matches[key] = []; });
  (rows || []).forEach(function (entry) {
    if (!entry || !entry.values) return;
    var key = SettingsService_trim_(entry.values.setting_key);
    if (Object.prototype.hasOwnProperty.call(matches, key)) matches[key].push(entry);
  });
  var settings = {};
  var timestamps = {};
  var entries = {};
  AdminSettingsService_KEYS_.forEach(function (key) {
    if (matches[key].length !== 1) throw new Error("SETTINGS_SCHEMA");
    var entry = matches[key][0];
    if (entry.formulas && SettingsService_trim_(entry.formulas.setting_value)) throw new Error("SETTINGS_SCHEMA");
    settings[key] = AdminSettingsService_BOOLEAN_KEYS_.indexOf(key) >= 0 ? AdminSettingsService_storedBoolean_(entry.values.setting_value) : SettingsService_trim_(entry.values.setting_value);
    timestamps[key] = AdminSettingsService_timestamp_(entry.values.updated_at);
    entries[key] = entry;
  });
  settings = AdminSettingsService_validateLogical_(settings, false);
  return { settings: settings, timestamps: timestamps, entries: entries };
}

function AdminSettingsService_revision_(canonical) {
  var input = ["settings", 1];
  AdminSettingsService_KEYS_.forEach(function (key) { input.push([key, typeof canonical.settings[key], canonical.settings[key], canonical.timestamps[key]]); });
  return "r1-" + CryptoService_sha256_(CryptoService_utf8Bytes_(JSON.stringify(input))).map(function (byte) { return ("0" + (byte & 255).toString(16)).slice(-2); }).join("");
}

function adminGetSettings_(token) {
  try {
    AdminSettingsService_authorize_(token, AdminSettingsService_ROLES_);
    var canonical = AdminSettingsService_canonical_(SettingsService_readTable_().rows);
    return { ok: true, data: { settings: canonical.settings, revision: AdminSettingsService_revision_(canonical) }, message: "success" };
  } catch (error) { return AdminSettingsService_errorResponse_(error); }
}

function AdminSettingsService_revisionInput_(value) {
  if (typeof value !== "string" || !/^r1-[a-f0-9]{64}$/.test(value)) throw new Error("VALIDATION_ERROR");
  return value;
}

function AdminSettingsService_mutationPayload_(payload) {
  AdminSettingsService_exactObject_(payload, ["expected_revision", "settings"], "VALIDATION_ERROR");
  return { expected_revision: AdminSettingsService_revisionInput_(payload.expected_revision), settings: AdminSettingsService_validateRequestSettings_(payload.settings) };
}

function AdminSettingsService_timestampMillis_(value) {
  var parts = AdminSettingsService_timestamp_(value).match(/\d+/g).map(Number);
  return Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
}

function AdminSettingsService_timestampFromMillis_(value) {
  var date = new Date(value);
  function two(number) { return ("0" + number).slice(-2); }
  return date.getUTCFullYear() + "-" + two(date.getUTCMonth() + 1) + "-" + two(date.getUTCDate()) + " " + two(date.getUTCHours()) + ":" + two(date.getUTCMinutes()) + ":" + two(date.getUTCSeconds());
}

function AdminSettingsService_nextTimestamp_(canonical) {
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  var maximum = AdminSettingsService_KEYS_.reduce(function (value, key) { return Math.max(value, AdminSettingsService_timestampMillis_(canonical.timestamps[key])); }, 0);
  return AdminSettingsService_timestampFromMillis_(Math.max(AdminSettingsService_timestampMillis_(now), maximum + 1000));
}

function AdminSettingsService_storageValue_(key, value) {
  if (AdminSettingsService_BOOLEAN_KEYS_.indexOf(key) >= 0) return value ? "TRUE" : "FALSE";
  return value;
}

function AdminSettingsService_setCell_(entry, field, value, table) {
  var sheet = SheetService_getSheet_("settings");
  if (!entry || !Number.isSafeInteger(entry.sourceRowNumber) || !table || !Object.prototype.hasOwnProperty.call(table.headerMap, field)) throw new Error("SETTINGS_SCHEMA");
  sheet.getRange(entry.sourceRowNumber, table.headerMap[field] + 1).setValue(value);
}

function AdminSettingsService_invalidateCache_() {
  var cache = CacheService.getScriptCache();
  cache.remove(SettingsService_CACHE_KEY_);
  if (cache.get(SettingsService_CACHE_KEY_) !== null) throw new Error("SETTINGS_CACHE_INVALIDATION");
}

function AdminSettingsService_audit_(admin, revision, changedKeys, timestamp) {
  try {
    var required = ["log_id", "admin_id", "action", "entity_type", "entity_id", "description", "created_at", "audit_id", "actor_admin_id", "occurred_at"];
    var table = SheetService_readTable_("activity_logs", required);
    var auditId = Utilities.getUuid();
    var record = {
      log_id: auditId, admin_id: admin.admin_id, action: "UPDATE_SETTINGS", entity_type: "settings", entity_id: "global",
      description: JSON.stringify({ revision: revision, changed_keys: changedKeys.slice() }), created_at: timestamp,
      audit_id: auditId, actor_admin_id: admin.admin_id, occurred_at: timestamp
    };
    var sheet = SheetService_getSheet_("activity_logs");
    var prepared = SheetService_prepareAppendDestination_(sheet, table.headers, table.headers);
    SheetService_appendObjectWithRow_("activity_logs", table.headers, record, prepared);
    SpreadsheetApp.flush();
    var matches = SheetService_readTable_("activity_logs", required).rows.filter(function (entry) { return entry.values.audit_id === auditId; });
    if (matches.length !== 1 || matches[0].sourceRowNumber !== prepared.sourceRowNumber) throw new Error("AUDIT_VERIFY");
    return "recorded";
  } catch (_auditError) { return "unconfirmed"; }
}

function AdminSettingsService_write_(admin, payload) {
  var table = SettingsService_readTable_();
  var current = AdminSettingsService_canonical_(table.rows);
  var currentRevision = AdminSettingsService_revision_(current);
  if (currentRevision !== payload.expected_revision) throw new Error("CONFLICT");
  var changedKeys = AdminSettingsService_KEYS_.filter(function (key) { return current.settings[key] !== payload.settings[key]; });
  if (!changedKeys.length) return { settings: current.settings, revision: currentRevision, changed: false, audit_status: "not_applicable" };

  var timestamp = AdminSettingsService_nextTimestamp_(current);
  // Validate the existing audit destination before invalidating cache or writing settings.
  var auditHeaders = ["log_id", "admin_id", "action", "entity_type", "entity_id", "description", "created_at", "audit_id", "actor_admin_id", "occurred_at"];
  var auditTable = SheetService_readTable_("activity_logs", auditHeaders);
  SheetService_prepareAppendDestination_(SheetService_getSheet_("activity_logs"), auditTable.headers, auditTable.headers);
  AdminSettingsService_invalidateCache_();

  var attempted = false;
  try {
    changedKeys.forEach(function (key) {
      attempted = true;
      AdminSettingsService_setCell_(current.entries[key], "setting_value", AdminSettingsService_storageValue_(key, payload.settings[key]), table);
      AdminSettingsService_setCell_(current.entries[key], "updated_at", timestamp, table);
    });
    SpreadsheetApp.flush();
    var verified = AdminSettingsService_canonical_(SettingsService_readTable_().rows);
    AdminSettingsService_KEYS_.forEach(function (key) {
      if (verified.settings[key] !== payload.settings[key] || verified.entries[key].sourceRowNumber !== current.entries[key].sourceRowNumber) throw new Error("SETTINGS_VERIFY");
      if (changedKeys.indexOf(key) >= 0 && verified.timestamps[key] !== timestamp) throw new Error("SETTINGS_VERIFY");
    });
    var revision = AdminSettingsService_revision_(verified);
    return { settings: verified.settings, revision: revision, changed: true, audit_status: AdminSettingsService_audit_(admin, revision, changedKeys, timestamp) };
  } catch (error) {
    if (attempted) throw new Error("OUTCOME_UNKNOWN");
    throw error;
  }
}

function updateSettings_(token, payload) {
  var lock = null;
  var acquired = false;
  try {
    AdminSettingsService_authorize_(token, ["super_admin"]);
    var parsed = AdminSettingsService_mutationPayload_(payload);
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) throw new Error("CONTENT_LOCK");
    acquired = true;
    var admin = AdminSettingsService_authorize_(token, ["super_admin"]);
    return { ok: true, data: AdminSettingsService_write_(admin, parsed), message: "success" };
  } catch (error) { return AdminSettingsService_errorResponse_(error); }
  finally { if (acquired) { try { lock.releaseLock(); } catch (_releaseError) { /* Preserve known result. */ } } }
}
