var GalleryService_CACHE_SECONDS_ = 600;
var GalleryService_MEDIA_TYPES_ = ["image", "video"];
var GalleryService_CATEGORIES_ = ["place", "route", "event", "product", "community", "hero", "other"];

function getGallery_(parameters) {
  var normalized = GalleryService_normalizeParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  return GalleryService_cached_("getGallery", normalized.params, function () {
    return GalleryService_buildGalleryResponse_(readSheetObjects_("gallery"), normalized.params);
  });
}

function GalleryService_buildGalleryResponse_(sourceRows, parameters) {
  var normalized = GalleryService_normalizeParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  var params = normalized.params;
  var rows = GalleryService_publishedCopies_(sourceRows).filter(function (row) {
    var mediaType = GalleryService_lower_(row.media_type);
    var category = GalleryService_lower_(row.category);
    if (GalleryService_MEDIA_TYPES_.indexOf(mediaType) === -1 || GalleryService_CATEGORIES_.indexOf(category) === -1) return false;
    if (params.media_type && mediaType !== params.media_type) return false;
    if (params.category && category !== params.category) return false;
    if (params.related_place_id && GalleryService_trim_(row.related_place_id) !== params.related_place_id) return false;
    return true;
  });
  rows = GalleryService_sort_(rows);
  return GalleryService_success_({
    items: rows.map(function (row) { return GalleryService_projection_(row, params.lang); }),
    total: rows.length
  });
}

function GalleryService_projection_(row, lang) {
  return {
    media_id: GalleryService_trim_(row.media_id),
    title: GalleryService_localized_(row, "title", lang),
    media_type: GalleryService_lower_(row.media_type),
    category: GalleryService_lower_(row.category),
    related_place_id: GalleryService_trim_(row.related_place_id),
    image_url: GalleryService_trim_(row.image_url),
    video_url: GalleryService_trim_(row.video_url),
    thumbnail_url: GalleryService_trim_(row.thumbnail_url),
    caption: GalleryService_localized_(row, "caption", lang),
    credit: GalleryService_trim_(row.credit)
  };
}

function GalleryService_normalizeParameters_(parameters) {
  var source = parameters || {};
  var params = { lang: GalleryService_language_(source.lang) };
  var mediaType = GalleryService_lower_(source.media_type);
  if (mediaType && GalleryService_MEDIA_TYPES_.indexOf(mediaType) === -1) return { ok: false, response: GalleryService_validationError_("พารามิเตอร์ media_type ไม่ถูกต้อง") };
  var category = GalleryService_lower_(source.category);
  if (category && GalleryService_CATEGORIES_.indexOf(category) === -1) return { ok: false, response: GalleryService_validationError_("พารามิเตอร์ category ไม่ถูกต้อง") };
  var relatedId = GalleryService_trim_(source.related_place_id);
  if (relatedId && !GalleryService_validId_(relatedId)) return { ok: false, response: GalleryService_validationError_("พารามิเตอร์ related_place_id ไม่ถูกต้อง") };
  if (mediaType) params.media_type = mediaType;
  if (category) params.category = category;
  if (relatedId) params.related_place_id = relatedId;
  return { ok: true, params: params };
}

function GalleryService_publishedCopies_(sourceRows) {
  return (Array.isArray(sourceRows) ? sourceRows : []).map(function (row, index) { return { row: row, index: index }; }).filter(function (entry) {
    return entry.row && GalleryService_trim_(entry.row.status) === "published";
  }).map(function (entry) { var copy = GalleryService_copy_(entry.row); copy.__source_index__ = entry.index; return copy; });
}

function GalleryService_sort_(rows) {
  return rows.slice().sort(function (left, right) {
    var order = GalleryService_numericSort_(left.sort_order) - GalleryService_numericSort_(right.sort_order);
    return order || left.__source_index__ - right.__source_index__;
  });
}

function GalleryService_cached_(action, parameters, loader) {
  var cache = null; var key = GalleryService_cacheKey_(action, parameters);
  try { cache = CacheService.getScriptCache(); var cached = cache.get(key); if (cached) { var parsed = JSON.parse(cached); if (parsed && parsed.ok === true && parsed.data && typeof parsed.data === "object") return parsed; } }
  catch (_galleryServiceCacheReadError) { /* Cache failures must not prevent public reads. */ }
  var response = loader();
  if (response && response.ok === true) {
    try { if (cache) cache.put(key, JSON.stringify(response), GalleryService_CACHE_SECONDS_); }
    catch (_galleryServiceCacheWriteError) { /* Return the successful uncached response. */ }
  }
  return response;
}

function GalleryService_cacheKey_(action, parameters) { var parts = ["public", action]; Object.keys(parameters || {}).sort().forEach(function (key) { parts.push(key + "=" + encodeURIComponent(GalleryService_trim_(parameters[key]))); }); return parts.join(":"); }
function GalleryService_localized_(row, field, lang) { return GalleryService_trim_(row[field + "_" + lang]) || GalleryService_trim_(row[field + "_th"]); }
function GalleryService_language_(value) { return GalleryService_lower_(value) === "en" ? "en" : "th"; }
function GalleryService_validId_(value) { return /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value); }
function GalleryService_numericSort_(value) { var number = Number(value); return GalleryService_trim_(value) !== "" && isFinite(number) ? number : Infinity; }
function GalleryService_copy_(row) { var copy = {}; Object.keys(row || {}).forEach(function (key) { copy[key] = row[key]; }); return copy; }
function GalleryService_success_(data) { return { ok: true, data: data, message: "success" }; }
function GalleryService_validationError_(message) { return { ok: false, error: { code: "VALIDATION_ERROR", message: message } }; }
function GalleryService_trim_(value) { return value === null || value === undefined ? "" : String(value).trim(); }
function GalleryService_lower_(value) { return GalleryService_trim_(value).toLowerCase(); }
