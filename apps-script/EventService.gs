var EventService_CACHE_SECONDS_ = 300;
var EventService_TYPES_ = ["launch", "festival", "community_market", "learning", "seasonal", "otop", "tourism", "other"];

function getEvents_(parameters) {
  var normalized = EventService_normalizeListParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  var today = EventService_today_();
  var cacheParameters = EventService_copy_(normalized.params);
  cacheParameters.today = today;
  return EventService_cached_("getEvents", cacheParameters, function () {
    return EventService_buildEventsResponse_(readSheetObjects_("events"), normalized.params, today);
  });
}

function getEventDetail_(parameters) {
  var normalized = EventService_normalizeDetailParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  return EventService_cached_("getEventDetail", normalized.params, function () {
    return EventService_buildEventDetailResponse_(readSheetObjects_("events"), readSheetObjects_("places"), normalized.params);
  });
}

function EventService_buildEventsResponse_(sourceRows, parameters, todayText) {
  var normalized = EventService_normalizeListParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  var params = normalized.params;
  var today = EventService_dateParts_(todayText || EventService_today_());
  if (!today) return EventService_error_("SERVER_ERROR", "เกิดข้อผิดพลาดของระบบ");
  var todayKey = EventService_dateKey_(today);
  var rows = EventService_publishedCopies_(sourceRows).filter(function (row) {
    var date = EventService_dateParts_(row.event_date);
    if (!date) return false;
    var dateKey = EventService_dateKey_(date);
    if (params.status === "upcoming" && dateKey < todayKey) return false;
    if (params.status === "past" && dateKey >= todayKey) return false;
    if (params.type && EventService_trim_(row.event_type) !== params.type) return false;
    if (params.month && EventService_trim_(row.event_date).slice(0, 7) !== params.month) return false;
    if (params.featured !== undefined && EventService_storedBoolean_(row.is_featured) !== params.featured) return false;
    return true;
  });
  rows = EventService_sort_(rows);
  return EventService_success_({
    items: rows.map(function (row) { return EventService_listProjection_(row, params.lang); }),
    total: rows.length
  });
}

function EventService_buildEventDetailResponse_(eventRows, placeRows, parameters) {
  var normalized = EventService_normalizeDetailParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  var params = normalized.params;
  var event = EventService_publishedCopies_(eventRows).filter(function (row) {
    return EventService_trim_(row.event_id) === params.event_id && EventService_dateParts_(row.event_date);
  })[0];
  if (!event) return EventService_error_("NOT_FOUND", "ไม่พบกิจกรรมนี้");
  var placeMap = EventService_publishedPlaceMap_(placeRows);
  var relatedId = EventService_trim_(event.related_place_id);
  var related = relatedId && Object.prototype.hasOwnProperty.call(placeMap, relatedId) ? placeMap[relatedId] : null;
  return EventService_success_({
    event_id: EventService_trim_(event.event_id),
    title: EventService_localized_(event, "title", params.lang),
    event_type: EventService_trim_(event.event_type),
    event_date: EventService_trim_(event.event_date),
    start_time: EventService_trim_(event.start_time),
    end_time: EventService_trim_(event.end_time),
    location: EventService_localized_(event, "location", params.lang),
    related_place_id: related ? relatedId : "",
    related_place: related ? { place_id: relatedId, name: EventService_localized_(related, "name", params.lang) } : null,
    description: EventService_localized_(event, "description", params.lang),
    image_url: EventService_trim_(event.image_url),
    contact_name: EventService_trim_(event.contact_name),
    contact_phone: EventService_trim_(event.contact_phone),
    register_url: EventService_trim_(event.register_url),
    google_maps_url: EventService_trim_(event.google_maps_url),
    latitude: EventService_emptyOrNumber_(event.latitude),
    longitude: EventService_emptyOrNumber_(event.longitude)
  });
}

function EventService_listProjection_(row, lang) {
  return {
    event_id: EventService_trim_(row.event_id),
    title: EventService_localized_(row, "title", lang),
    event_type: EventService_trim_(row.event_type),
    event_date: EventService_trim_(row.event_date),
    start_time: EventService_trim_(row.start_time),
    end_time: EventService_trim_(row.end_time),
    location: EventService_localized_(row, "location", lang),
    image_url: EventService_trim_(row.image_url),
    contact_name: EventService_trim_(row.contact_name),
    contact_phone: EventService_trim_(row.contact_phone),
    register_url: EventService_trim_(row.register_url)
  };
}

function EventService_normalizeListParameters_(parameters) {
  var source = parameters || {};
  var status = EventService_lower_(source.status) || "all";
  if (["all", "upcoming", "past"].indexOf(status) === -1) return { ok: false, response: EventService_validationError_("พารามิเตอร์ status ไม่ถูกต้อง") };
  var type = EventService_lower_(source.type);
  if (type && EventService_TYPES_.indexOf(type) === -1) return { ok: false, response: EventService_validationError_("พารามิเตอร์ type ไม่ถูกต้อง") };
  var month = EventService_trim_(source.month);
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, response: EventService_validationError_("พารามิเตอร์ month ไม่ถูกต้อง") };
  var featured = EventService_optionalBoolean_(source.featured);
  if (!featured.ok) return { ok: false, response: EventService_validationError_("พารามิเตอร์ featured ไม่ถูกต้อง") };
  var params = { status: status, lang: EventService_language_(source.lang) };
  if (type) params.type = type;
  if (month) params.month = month;
  if (featured.hasValue) params.featured = featured.value;
  return { ok: true, params: params };
}

function EventService_normalizeDetailParameters_(parameters) {
  var source = parameters || {};
  var eventId = EventService_trim_(source.event_id);
  if (!EventService_validId_(eventId)) return { ok: false, response: EventService_validationError_("กรุณาระบุ event_id ที่ถูกต้อง") };
  return { ok: true, params: { event_id: eventId, lang: EventService_language_(source.lang) } };
}

function EventService_dateParts_(value) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(EventService_trim_(value));
  if (!match) return null;
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var days = [31, EventService_leapYear_(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return null;
  return { year: year, month: month, day: day };
}

function EventService_today_() {
  var now = new Date();
  return [now.getFullYear(), EventService_pad2_(now.getMonth() + 1), EventService_pad2_(now.getDate())].join("-");
}

function EventService_sort_(rows) {
  return rows.slice().sort(function (left, right) {
    var dateOrder = EventService_dateKey_(EventService_dateParts_(left.event_date)) - EventService_dateKey_(EventService_dateParts_(right.event_date));
    return dateOrder || left.__source_index__ - right.__source_index__;
  });
}

function EventService_publishedCopies_(sourceRows) {
  return (Array.isArray(sourceRows) ? sourceRows : []).map(function (row, index) { return { row: row, index: index }; }).filter(function (entry) {
    return entry.row && EventService_trim_(entry.row.status) === "published";
  }).map(function (entry) { var copy = EventService_copy_(entry.row); copy.__source_index__ = entry.index; return copy; });
}

function EventService_publishedPlaceMap_(sourceRows) {
  var map = Object.create(null);
  (Array.isArray(sourceRows) ? sourceRows : []).forEach(function (row) {
    if (!row || EventService_trim_(row.status) !== "published") return;
    var id = EventService_trim_(row.place_id);
    if (id) map[id] = EventService_copy_(row);
  });
  return map;
}

function EventService_cached_(action, parameters, loader) {
  var cache = null; var key = null;
  try { key = EventService_cacheKey_(action, parameters); cache = CacheService.getScriptCache(); var cached = cache.get(key); if (cached) { var parsed = JSON.parse(cached); if (parsed && parsed.ok === true && parsed.data && typeof parsed.data === "object") return parsed; } }
  catch (_eventServiceCacheReadError) { /* Cache failures must not prevent public reads. */ }
  var response = loader();
  if (response && response.ok === true) {
    try { if (cache && key) cache.put(key, JSON.stringify(response), EventService_CACHE_SECONDS_); }
    catch (_eventServiceCacheWriteError) { /* Return the successful uncached response. */ }
  }
  return response;
}

function EventService_cacheKey_(action, parameters) { var parts = ["public", action]; if (action === "getEventDetail") parts.push(PlaceService_cacheEpochKey_()); parts.push(ContentCacheService_key_()); Object.keys(parameters || {}).sort().forEach(function (key) { parts.push(key + "=" + encodeURIComponent(EventService_trim_(parameters[key]))); }); return parts.join(":"); }
function EventService_optionalBoolean_(value) { if (value === undefined || value === null || EventService_trim_(value) === "") return { ok: true, hasValue: false, value: false }; if (value === true || value === 1) return { ok: true, hasValue: true, value: true }; if (value === false || value === 0) return { ok: true, hasValue: true, value: false }; var text = EventService_lower_(value); if (text === "true" || text === "1") return { ok: true, hasValue: true, value: true }; if (text === "false" || text === "0") return { ok: true, hasValue: true, value: false }; return { ok: false, hasValue: false, value: false }; }
function EventService_storedBoolean_(value) { var result = EventService_optionalBoolean_(value); return result.ok && result.hasValue ? result.value : false; }
function EventService_localized_(row, field, lang) { return EventService_trim_(row[field + "_" + lang]) || EventService_trim_(row[field + "_th"]); }
function EventService_language_(value) { return EventService_lower_(value) === "en" ? "en" : "th"; }
function EventService_validId_(value) { return /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value); }
function EventService_leapYear_(year) { return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0); }
function EventService_dateKey_(parts) { return parts.year * 10000 + parts.month * 100 + parts.day; }
function EventService_pad2_(value) { return value < 10 ? "0" + value : String(value); }
function EventService_emptyOrNumber_(value) { if (EventService_trim_(value) === "") return ""; var number = Number(value); return isFinite(number) ? number : ""; }
function EventService_copy_(row) { var copy = {}; Object.keys(row || {}).forEach(function (key) { copy[key] = row[key]; }); return copy; }
function EventService_success_(data) { return { ok: true, data: data, message: "success" }; }
function EventService_validationError_(message) { return EventService_error_("VALIDATION_ERROR", message); }
function EventService_error_(code, message) { return { ok: false, error: { code: code, message: message } }; }
function EventService_trim_(value) { return value === null || value === undefined ? "" : String(value).trim(); }
function EventService_lower_(value) { return EventService_trim_(value).toLowerCase(); }
