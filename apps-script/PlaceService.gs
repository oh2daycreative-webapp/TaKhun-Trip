var PLACE_CACHE_SECONDS_ = 300;
var PLACE_DEFAULT_PAGE_ = 1;
var PLACE_DEFAULT_PAGE_SIZE_ = 20;
var PLACE_MAX_PAGE_SIZE_ = 100;
var PLACE_MAIN_ROUTE_ID_ = "ROUTE-001";

function getPlaces_(parameters) {
  var params = pickParameters_(parameters, [
    "district", "category", "route_group", "keyword", "featured",
    "main_route", "page", "page_size", "lang"
  ]);
  return getCachedPublicResponse_("getPlaces", params, function () {
    return buildPlacesResponse_(readSheetObjects_("places"), params);
  });
}

function getPlaceDetail_(parameters) {
  var params = pickParameters_(parameters, ["place_id", "lang"]);
  params.place_id = trimText_(params.place_id);
  return getCachedPublicResponse_("getPlaceDetail", params, function () {
    return buildPlaceDetailResponse_(readSheetObjects_("places"), params);
  });
}

function getMapPlaces_(parameters) {
  var params = pickParameters_(parameters, ["category", "route", "district", "lang"]);
  return getCachedPublicResponse_("getMapPlaces", params, function () {
    return buildMapPlacesResponse_(readSheetObjects_("places"), params);
  });
}

function buildPlacesResponse_(sourceRows, parameters) {
  var params = parameters || {};
  var pageResult = parsePositiveInteger_(params.page, PLACE_DEFAULT_PAGE_, null);
  var pageSizeResult = parsePositiveInteger_(params.page_size, PLACE_DEFAULT_PAGE_SIZE_, PLACE_MAX_PAGE_SIZE_);
  var featuredResult = parseOptionalBoolean_(params.featured);
  var mainRouteResult = parseOptionalBoolean_(params.main_route);

  if (!pageResult.ok || !pageSizeResult.ok || !featuredResult.ok || !mainRouteResult.ok) {
    return validationError_("พารามิเตอร์ไม่ถูกต้อง");
  }

  var district = trimText_(params.district);
  var category = trimText_(params.category);
  var routeGroup = trimText_(params.route_group);
  var keyword = lowerText_(params.keyword);
  var lang = normalizeLanguage_(params.lang);
  var rows = publishedPlaces_(sourceRows).filter(function (row) {
    if (district && trimText_(row.district) !== district) return false;
    if (category && trimText_(row.category) !== category) return false;
    if (routeGroup && trimText_(row.route_group) !== routeGroup) return false;
    if (featuredResult.hasValue && normalizeStoredBoolean_(row.is_featured) !== featuredResult.value) return false;
    if (mainRouteResult.hasValue && normalizeStoredBoolean_(row.is_main_route_point) !== mainRouteResult.value) return false;
    if (!keyword) return true;
    return [
      localizedText_(row, "name", lang), row.name_th,
      localizedText_(row, "short_description", lang), row.short_description_th
    ].some(function (value) { return lowerText_(value).indexOf(keyword) !== -1; });
  });

  rows = sortPublicPlaces_(rows);
  var total = rows.length;
  var start = (pageResult.value - 1) * pageSizeResult.value;
  var items = rows.slice(start, start + pageSizeResult.value).map(function (row) {
    return toPlaceListItem_(row, lang);
  });

  return successResponse_({
    items: items,
    total: total,
    page: pageResult.value,
    page_size: pageSizeResult.value,
    total_pages: total ? Math.ceil(total / pageSizeResult.value) : 0
  });
}

function buildPlaceDetailResponse_(sourceRows, parameters) {
  var params = parameters || {};
  var placeId = trimText_(params.place_id);
  if (!isValidPublicId_(placeId)) return validationError_("กรุณาระบุ place_id ที่ถูกต้อง");

  var row = publishedPlaces_(sourceRows).filter(function (item) {
    return trimText_(item.place_id) === placeId;
  })[0];
  if (!row) return errorResponse_("NOT_FOUND", "ไม่พบสถานที่นี้");

  return successResponse_(toPlaceDetail_(row, normalizeLanguage_(params.lang)));
}

function buildMapPlacesResponse_(sourceRows, parameters) {
  var params = parameters || {};
  var route = trimText_(params.route);
  if (route && route !== "main") return validationError_("พารามิเตอร์ route ไม่ถูกต้อง");

  var category = trimText_(params.category);
  if (category === "all") category = "";
  var district = trimText_(params.district);
  var lang = normalizeLanguage_(params.lang);
  var rows = sortPublicPlaces_(publishedPlaces_(sourceRows).filter(function (row) {
    if (category && trimText_(row.category) !== category) return false;
    if (district && trimText_(row.district) !== district) return false;
    if (route === "main" && !normalizeStoredBoolean_(row.is_main_route_point)) return false;
    return validCoordinatePair_(row.latitude, row.longitude);
  }));

  var mainRouteIds = sortPublicPlaces_(publishedPlaces_(sourceRows).filter(function (row) {
    return normalizeStoredBoolean_(row.is_main_route_point);
  })).map(function (row) { return trimText_(row.place_id); }).filter(Boolean);

  return successResponse_({
    places: rows.map(function (row) { return toMapPlace_(row, lang); }),
    main_route: {
      route_id: PLACE_MAIN_ROUTE_ID_,
      place_ids: mainRouteIds
    }
  });
}

function toPlaceListItem_(row, lang) {
  return {
    place_id: trimText_(row.place_id),
    name: localizedText_(row, "name", lang),
    name_th: trimText_(row.name_th),
    name_en: trimText_(row.name_en),
    district: trimText_(row.district),
    category: trimText_(row.category),
    route_group: trimText_(row.route_group),
    short_description: localizedText_(row, "short_description", lang),
    phone: trimText_(row.phone),
    google_maps_url: trimText_(row.google_maps_url),
    latitude: emptyOrNumber_(row.latitude),
    longitude: emptyOrNumber_(row.longitude),
    cover_image_url: trimText_(row.cover_image_url),
    is_featured: normalizeStoredBoolean_(row.is_featured),
    is_main_route_point: normalizeStoredBoolean_(row.is_main_route_point)
  };
}

function toPlaceDetail_(row, lang) {
  return {
    place_id: trimText_(row.place_id),
    name: localizedText_(row, "name", lang),
    name_th: trimText_(row.name_th),
    name_en: trimText_(row.name_en),
    district: trimText_(row.district),
    province: trimText_(row.province),
    route_group: trimText_(row.route_group),
    category: trimText_(row.category),
    short_description: localizedText_(row, "short_description", lang),
    description: localizedText_(row, "description", lang),
    activities: localizedText_(row, "activities", lang),
    highlight: localizedText_(row, "highlight", lang),
    phone: trimText_(row.phone),
    line_url: trimText_(row.line_url),
    facebook_url: trimText_(row.facebook_url),
    website_url: trimText_(row.website_url),
    google_maps_url: trimText_(row.google_maps_url),
    latitude: emptyOrNumber_(row.latitude),
    longitude: emptyOrNumber_(row.longitude),
    coordinate_status: trimText_(row.coordinate_status),
    open_time: localizedText_(row, "open_time", lang),
    fee: localizedText_(row, "fee", lang),
    cover_image_url: trimText_(row.cover_image_url),
    gallery_image_urls: splitList_(row.gallery_image_urls),
    gallery_media_ids: PlaceService_galleryMediaIds_(row.gallery_media_ids),
    video_url: trimText_(row.video_url),
    tags: splitList_(row.tags),
    recommended_duration: trimText_(row.recommended_duration),
    best_time: localizedText_(row, "best_time", lang),
    nearby_places: [],
    reviews_summary: {
      average_rating: 0,
      review_count: 0
    }
  };
}

function PlaceService_galleryMediaIds_(value) {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value !== "string") return [];
  var parts = value.split("|");
  if (!parts.length || parts.length > 50 || parts.join("|") !== value) return [];
  var seen = Object.create(null);
  for (var index = 0; index < parts.length; index += 1) {
    var mediaId = parts[index];
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(mediaId) || Object.prototype.hasOwnProperty.call(seen, mediaId)) return [];
    seen[mediaId] = true;
  }
  return parts;
}

function toMapPlace_(row, lang) {
  return {
    place_id: trimText_(row.place_id),
    name: localizedText_(row, "name", lang),
    category: trimText_(row.category),
    district: trimText_(row.district),
    route_group: trimText_(row.route_group),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    google_maps_url: trimText_(row.google_maps_url),
    phone: trimText_(row.phone),
    cover_image_url: trimText_(row.cover_image_url),
    is_main_route_point: normalizeStoredBoolean_(row.is_main_route_point),
    sort_order: numericSortValue_(row.sort_order) === Infinity ? "" : Number(row.sort_order)
  };
}

function publishedPlaces_(sourceRows) {
  return (Array.isArray(sourceRows) ? sourceRows : []).filter(function (row) {
    return row && trimText_(row.status) === "published";
  }).map(function (row, index) {
    return { row: row, index: index };
  }).map(function (entry) {
    var copy = {};
    Object.keys(entry.row).forEach(function (key) { copy[key] = entry.row[key]; });
    copy.__source_index__ = entry.index;
    return copy;
  });
}

function sortPublicPlaces_(rows) {
  return rows.slice().sort(function (left, right) {
    var featuredDifference = Number(normalizeStoredBoolean_(right.is_featured)) - Number(normalizeStoredBoolean_(left.is_featured));
    if (featuredDifference) return featuredDifference;
    var leftSort = numericSortValue_(left.sort_order);
    var rightSort = numericSortValue_(right.sort_order);
    if (leftSort !== rightSort) return leftSort - rightSort;
    var leftName = trimText_(left.name_th);
    var rightName = trimText_(right.name_th);
    if (leftName < rightName) return -1;
    if (leftName > rightName) return 1;
    return Number(left.__source_index__ || 0) - Number(right.__source_index__ || 0);
  });
}

function parsePositiveInteger_(value, defaultValue, maximum) {
  if (value === undefined || value === null || trimText_(value) === "") {
    return { ok: true, value: defaultValue };
  }
  var text = trimText_(value);
  if (!/^\d+$/.test(text)) return { ok: false };
  var number = Number(text);
  if (!isFinite(number) || number < 1 || Math.floor(number) !== number) return { ok: false };
  if (maximum !== null && maximum !== undefined && number > maximum) return { ok: false };
  return { ok: true, value: number };
}

function parseOptionalBoolean_(value) {
  if (value === undefined || value === null || trimText_(value) === "") {
    return { ok: true, hasValue: false, value: false };
  }
  if (value === true || value === 1) return { ok: true, hasValue: true, value: true };
  if (value === false || value === 0) return { ok: true, hasValue: true, value: false };
  var text = lowerText_(value);
  if (text === "true" || text === "1") return { ok: true, hasValue: true, value: true };
  if (text === "false" || text === "0") return { ok: true, hasValue: true, value: false };
  return { ok: false, hasValue: false, value: false };
}

function normalizeStoredBoolean_(value) {
  var parsed = parseOptionalBoolean_(value);
  return parsed.ok && parsed.hasValue ? parsed.value : false;
}

function normalizeLanguage_(value) {
  return lowerText_(value) === "en" ? "en" : "th";
}

function localizedText_(row, field, lang) {
  var requested = trimText_(row[field + "_" + lang]);
  return requested || trimText_(row[field + "_th"]);
}

function splitList_(value) {
  if (Array.isArray(value)) return value.map(trimText_).filter(Boolean);
  return trimText_(value).split("|").map(trimText_).filter(Boolean);
}

function validCoordinatePair_(latitude, longitude) {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return false;
  if (trimText_(latitude) === "" || trimText_(longitude) === "") return false;
  var lat = Number(latitude);
  var lng = Number(longitude);
  return isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function emptyOrNumber_(value) {
  if (value === null || value === undefined || trimText_(value) === "") return "";
  var number = Number(value);
  return isFinite(number) ? number : "";
}

function numericSortValue_(value) {
  if (value === null || value === undefined || trimText_(value) === "") return Infinity;
  var number = Number(value);
  return isFinite(number) ? number : Infinity;
}

function isValidPublicId_(value) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value);
}

function pickParameters_(parameters, allowedKeys) {
  var source = parameters || {};
  var picked = {};
  allowedKeys.forEach(function (key) {
    if (source[key] !== undefined && source[key] !== null && trimText_(source[key]) !== "") picked[key] = source[key];
  });
  return picked;
}

function publicCacheKey_(action, parameters) {
  var parts = ["public", action, PlaceService_cacheEpochKey_()];
  Object.keys(parameters || {}).sort().forEach(function (key) {
    parts.push(key + "=" + encodeURIComponent(trimText_(parameters[key])));
  });
  return parts.join(":");
}

function getCachedPublicResponse_(action, parameters, loader) {
  var cache = null;
  var key = null;
  try {
    key = publicCacheKey_(action, parameters);
    cache = CacheService.getScriptCache();
    var cached = cache.get(key);
    if (cached) {
      var parsed = JSON.parse(cached);
      if (parsed && parsed.ok === true && parsed.data && typeof parsed.data === "object") return parsed;
    }
  } catch (_cacheReadError) {
    // A cache failure must not prevent a public sheet read.
  }

  var response = loader();
  if (response && response.ok === true) {
    try {
      if (cache && key) cache.put(key, JSON.stringify(response), PLACE_CACHE_SECONDS_);
    } catch (_cacheWriteError) {
      // The uncached response remains valid.
    }
  }
  return response;
}

function PlaceService_cacheEpoch_() {
  var properties;
  var value;
  try {
    properties = PropertiesService.getScriptProperties();
    if (!properties || typeof properties.getProperty !== "function") throw new Error("unavailable");
    value = properties.getProperty(PLACE_PUBLIC_CACHE_EPOCH_PROPERTY_);
  } catch (_placeCacheEpochReadError) {
    throw new Error("PLACE_CACHE_EPOCH_READ");
  }
  if (value === null) return 1;
  return PlaceService_validateCacheEpochValue_(value);
}

function PlaceService_cacheEpochKey_() {
  return "place-epoch:" + PlaceService_cacheEpoch_();
}

function PlaceService_bumpCacheEpoch_() {
  var current = PlaceService_cacheEpoch_();
  if (current >= Number.MAX_SAFE_INTEGER) throw new Error("PLACE_CACHE_EPOCH_OVERFLOW");
  var next = current + 1;
  var properties;
  try {
    properties = PropertiesService.getScriptProperties();
    if (!properties || typeof properties.setProperty !== "function" || typeof properties.getProperty !== "function") throw new Error("unavailable");
    properties.setProperty(PLACE_PUBLIC_CACHE_EPOCH_PROPERTY_, String(next));
    if (properties.getProperty(PLACE_PUBLIC_CACHE_EPOCH_PROPERTY_) !== String(next)) throw new Error("mismatch");
  } catch (_placeCacheEpochBumpError) {
    throw new Error("PLACE_CACHE_EPOCH_BUMP");
  }
  return next;
}

function PlaceService_validateCacheEpochValue_(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) throw new Error("PLACE_CACHE_EPOCH_INVALID");
  var epoch = Number(value);
  if (!Number.isSafeInteger(epoch) || epoch < 1 || String(epoch) !== value) throw new Error("PLACE_CACHE_EPOCH_INVALID");
  return epoch;
}

function successResponse_(data) {
  return { ok: true, data: data, message: "success" };
}

function validationError_(message) {
  return errorResponse_("VALIDATION_ERROR", message);
}

function errorResponse_(code, message) {
  return { ok: false, error: { code: code, message: message } };
}

function trimText_(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function lowerText_(value) {
  return trimText_(value).toLocaleLowerCase();
}
