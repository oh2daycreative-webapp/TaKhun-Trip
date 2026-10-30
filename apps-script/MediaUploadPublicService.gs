// Public read of uploaded place photos (spec v5.2 task 7, T6, T12, D6, D12, D20). GET ?action=getPlaceUploads
//   no place_id: { covers: { <place_id>: photo } }           covers of published places (cards, map, home)
//   place_id:    { place_id, cover: photo|null, gallery: [] } one published place (detail page)
// photo = { format, key_large, key_small, width, height, width_small, height_small, caption_th, caption_en }.
// Only file keys (the site builds URLs from its own MEDIA_ORIGIN) and only keys that pass the R2 allowlist for that
// place. A missing media_uploads sheet gives an empty result, so the site works exactly as before (C2).
// Cache: answers live under a random generation id; writers remove the id under their lock after a verified write
// (MediaUploadPublicService_invalidateUnderLock_), so a reader that loaded older data can only have cached it under
// a dead id. Cache errors never break the read. No top-level service calls: safe in any load order.

var MediaUploadPublicService_GENERATION_KEY_ = "media-uploads-public-generation-v1";
var MediaUploadPublicService_CACHE_PREFIX_ = "media-uploads-public";
var MediaUploadPublicService_TTL_SECONDS_ = 300;
var MediaUploadPublicService_PLACE_ID_PATTERN_ = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

function MediaUploadPublicService_cacheKey_(scope) {
  var cache = CacheService.getScriptCache();
  var generation = cache.get(MediaUploadPublicService_GENERATION_KEY_);
  if (typeof generation !== "string" || !/^[a-f0-9-]{36}$/.test(generation)) {
    generation = Utilities.getUuid();
    cache.put(MediaUploadPublicService_GENERATION_KEY_, generation, 21600);
  }
  return MediaUploadPublicService_CACHE_PREFIX_ + ":" + generation + ":" + scope;
}

// Writers call this under the script lock, after their write is verified. Never throws (worst case: data up to
// 300 s old).
function MediaUploadPublicService_invalidateUnderLock_() {
  try { CacheService.getScriptCache().remove(MediaUploadPublicService_GENERATION_KEY_); } catch (_cacheError) { /* stale <= TTL */ }
}

function MediaUploadPublicService_photo_(values) {
  var unescape = function (value) { return String(value === undefined || value === null ? "" : value).replace(/^'(?=[=+\-@])/, ""); };
  return {
    format: values.format, key_large: values.key_large, key_small: values.key_small,
    width: Number(values.width_large), height: Number(values.height_large),
    width_small: Number(values.width_small), height_small: Number(values.height_small),
    caption_th: unescape(values.caption_th), caption_en: unescape(values.caption_en)
  };
}

function MediaUploadPublicService_validRow_(values) {
  var prefix = "uploads/places/" + String(values.entity_id).toLowerCase() + "/";
  var ok = [values.key_large, values.key_small].every(function (key) {
    try { R2SigV4_assertKey_(key); } catch (_keyError) { return false; }
    return key.indexOf(prefix) === 0;
  });
  return ok && (values.format === "webp" || values.format === "jpeg") &&
    [values.width_large, values.height_large, values.width_small, values.height_small].every(function (value) { return /^[1-9][0-9]{0,4}$/.test(String(value)); });
}

// Active, valid photo rows of published places, grouped by place id and sorted by sort_order.
function MediaUploadPublicService_load_() {
  var published = Object.create(null);
  var uploads;
  try {
    SheetService_readTable_("places", ["place_id", "status"]).rows.forEach(function (entry) {
      if (entry.values.status === "published") published[entry.values.place_id] = true;
    });
    uploads = SheetService_readTable_(MediaUploadSchema_SHEET_NAME_, MediaUploadSchema_HEADERS_).rows;
  } catch (_readError) {
    return Object.create(null);
  }
  var byPlace = Object.create(null);
  uploads.forEach(function (entry) {
    var values = entry.values;
    if (values.entity_type !== "place" || values.status !== "active" || !published[values.entity_id] || !MediaUploadPublicService_validRow_(values)) return;
    (byPlace[values.entity_id] = byPlace[values.entity_id] || []).push(entry);
  });
  Object.keys(byPlace).forEach(function (placeId) {
    byPlace[placeId].sort(function (left, right) {
      return (Number(left.values.sort_order) || 0) - (Number(right.values.sort_order) || 0) || left.sourceRowNumber - right.sourceRowNumber;
    });
  });
  return byPlace;
}

function MediaUploadPublicService_build_(placeId) {
  var byPlace = MediaUploadPublicService_load_();
  if (placeId) {
    var rows = byPlace[placeId] || [];
    var cover = rows.filter(function (entry) { return entry.values.is_cover === "true"; })[0];
    return { place_id: placeId, cover: cover ? MediaUploadPublicService_photo_(cover.values) : null,
      gallery: rows.map(function (entry) { return MediaUploadPublicService_photo_(entry.values); }) };
  }
  var covers = {};
  Object.keys(byPlace).forEach(function (id) {
    var cover = byPlace[id].filter(function (entry) { return entry.values.is_cover === "true"; })[0];
    if (cover) covers[id] = MediaUploadPublicService_photo_(cover.values);
  });
  return { covers: covers };
}

function getPlaceUploads_(parameters) {
  var raw = parameters && parameters.place_id !== undefined && parameters.place_id !== null ? String(parameters.place_id).trim() : "";
  if (raw && !MediaUploadPublicService_PLACE_ID_PATTERN_.test(raw)) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "พารามิเตอร์ไม่ถูกต้อง" } };
  }
  var cache = null, key = null;
  try {
    cache = CacheService.getScriptCache();
    key = MediaUploadPublicService_cacheKey_(raw || "*");
    var cached = cache.get(key);
    if (cached) {
      var parsed = JSON.parse(cached);
      if (parsed && parsed.ok === true && parsed.data) return parsed;
    }
  } catch (_cacheReadError) {
    cache = null;
  }
  var response = { ok: true, data: MediaUploadPublicService_build_(raw), message: "success" };
  try { if (cache && key) cache.put(key, JSON.stringify(response), MediaUploadPublicService_TTL_SECONDS_); } catch (_cacheWriteError) { /* uncached is fine */ }
  return response;
}
