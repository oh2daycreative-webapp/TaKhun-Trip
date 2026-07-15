var SettingsService_CACHE_SECONDS_ = 600;
var SettingsService_CACHE_KEY_ = "public:getSettings";
var SettingsService_PUBLIC_KEYS_ = [
  "site_name", "site_slogan_th", "site_slogan_en", "default_language",
  "main_email", "main_phone", "facebook_url", "line_url", "logo_url",
  "hero_image_url", "reviews_enabled", "events_enabled"
];
var SettingsService_BOOLEAN_KEYS_ = ["reviews_enabled", "events_enabled"];

function getSettings_(_parameters) {
  var cache = null;
  try {
    cache = CacheService.getScriptCache();
    var cached = cache.get(SettingsService_CACHE_KEY_);
    if (cached) {
      var parsed = JSON.parse(cached);
      if (SettingsService_validCachedResponse_(parsed)) return parsed;
    }
  } catch (_settingsCacheReadError) {
    // Cache failures and malformed cache entries must not prevent a public sheet read.
  }

  var response = SettingsService_buildSettingsResponse_(readSheetObjects_("settings"));
  if (response && response.ok === true) {
    try {
      if (cache) cache.put(SettingsService_CACHE_KEY_, JSON.stringify(response), SettingsService_CACHE_SECONDS_);
    } catch (_settingsCacheWriteError) {
      // Return the successful uncached response.
    }
  }
  return response;
}

function SettingsService_buildSettingsResponse_(sourceRows) {
  var allowed = SettingsService_keyMap_(SettingsService_PUBLIC_KEYS_);
  var booleanKeys = SettingsService_keyMap_(SettingsService_BOOLEAN_KEYS_);
  var values = Object.create(null);

  (Array.isArray(sourceRows) ? sourceRows : []).forEach(function (row) {
    if (!row || typeof row !== "object") return;
    var key = SettingsService_trim_(row.setting_key);
    if (!Object.prototype.hasOwnProperty.call(allowed, key) || Object.prototype.hasOwnProperty.call(values, key)) return;

    if (Object.prototype.hasOwnProperty.call(booleanKeys, key)) {
      var parsedBoolean = SettingsService_boolean_(row.setting_value);
      if (!parsedBoolean.ok) return;
      values[key] = parsedBoolean.value;
      return;
    }
    values[key] = SettingsService_trim_(row.setting_value);
  });

  var data = {};
  SettingsService_PUBLIC_KEYS_.forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(values, key)) data[key] = values[key];
  });
  return { ok: true, data: data, message: "success" };
}

function SettingsService_validCachedResponse_(response) {
  if (!response || Array.isArray(response) || typeof response !== "object" || response.ok !== true || response.message !== "success") return false;
  var data = response.data;
  if (!data || Array.isArray(data) || typeof data !== "object") return false;
  var allowed = SettingsService_keyMap_(SettingsService_PUBLIC_KEYS_);
  var booleanKeys = SettingsService_keyMap_(SettingsService_BOOLEAN_KEYS_);
  return Object.keys(data).every(function (key) {
    if (!Object.prototype.hasOwnProperty.call(allowed, key)) return false;
    if (Object.prototype.hasOwnProperty.call(booleanKeys, key)) return typeof data[key] === "boolean";
    return typeof data[key] === "string";
  });
}

function SettingsService_boolean_(value) {
  if (value === true || value === 1) return { ok: true, value: true };
  if (value === false || value === 0) return { ok: true, value: false };
  var text = SettingsService_trim_(value).toLowerCase();
  if (text === "true" || text === "1") return { ok: true, value: true };
  if (text === "false" || text === "0") return { ok: true, value: false };
  return { ok: false, value: false };
}

function SettingsService_keyMap_(keys) {
  var map = Object.create(null);
  (keys || []).forEach(function (key) { map[key] = true; });
  return map;
}

function SettingsService_trim_(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}
