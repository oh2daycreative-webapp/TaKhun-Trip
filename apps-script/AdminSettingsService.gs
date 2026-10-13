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
