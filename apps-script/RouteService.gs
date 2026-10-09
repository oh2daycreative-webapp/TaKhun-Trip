var ROUTE_SERVICE_ROUTE_CACHE_SECONDS_ = 600;
var ROUTE_SERVICE_TEMPLATE_CACHE_SECONDS_ = 300;

function getRoutes_(parameters) {
  var normalized = RouteService_normalizeRoutesParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  return RouteService_getCachedPublicResponse_(
    "getRoutes",
    normalized.params,
    ROUTE_SERVICE_ROUTE_CACHE_SECONDS_,
    function () {
      return RouteService_buildRoutesResponse_(readSheetObjects_("routes"), normalized.params);
    }
  );
}

function getRouteDetail_(parameters) {
  var normalized = RouteService_normalizeRouteDetailParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  return RouteService_getCachedPublicResponse_(
    "getRouteDetail",
    normalized.params,
    ROUTE_SERVICE_ROUTE_CACHE_SECONDS_,
    function () {
      return RouteService_buildRouteDetailResponse_(
        readSheetObjects_("routes"),
        readSheetObjects_("route_places"),
        readSheetObjects_("places"),
        normalized.params
      );
    }
  );
}

function getTripTemplates_(parameters) {
  var normalized = RouteService_normalizeTripTemplateParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  return RouteService_getCachedPublicResponse_(
    "getTripTemplates",
    normalized.params,
    ROUTE_SERVICE_TEMPLATE_CACHE_SECONDS_,
    function () {
      return RouteService_buildTripTemplatesResponse_(
        readSheetObjects_("trip_templates"),
        readSheetObjects_("places"),
        normalized.params
      );
    }
  );
}

function RouteService_buildRoutesResponse_(sourceRows, parameters) {
  var normalized = RouteService_normalizeRoutesParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  var params = normalized.params;
  var rows = RouteService_publishedCopies_(sourceRows).filter(function (row) {
    if (params.featured !== undefined && RouteService_storedBoolean_(row.is_featured) !== params.featured) return false;
    if (params.style && RouteService_splitList_(row.travel_style).indexOf(params.style) === -1) return false;
    return true;
  });
  rows = RouteService_sortByNumericOrder_(rows, "sort_order");
  var items = rows.map(function (row) {
    return {
      route_id: RouteService_trim_(row.route_id),
      name: RouteService_localized_(row, "name", params.lang),
      short_description: RouteService_localized_(row, "short_description", params.lang),
      duration: RouteService_trim_(row.duration),
      travel_style: RouteService_splitList_(row.travel_style),
      cover_image_url: RouteService_trim_(row.cover_image_url),
      is_featured: RouteService_storedBoolean_(row.is_featured)
    };
  });
  return RouteService_success_({ items: items, total: items.length });
}

function RouteService_buildRouteDetailResponse_(routeRows, routePlaceRows, placeRows, parameters) {
  var normalized = RouteService_normalizeRouteDetailParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  var params = normalized.params;
  var route = RouteService_publishedCopies_(routeRows).filter(function (row) {
    return RouteService_trim_(row.route_id) === params.route_id;
  })[0];
  if (!route) return RouteService_error_("NOT_FOUND", "ไม่พบเส้นทางนี้");

  var publishedPlaces = RouteService_publishedCopies_(placeRows);
  var placesById = {};
  publishedPlaces.forEach(function (row) {
    var placeId = RouteService_trim_(row.place_id);
    var placeKey = "id:" + placeId;
    if (placeId && !placesById[placeKey]) placesById[placeKey] = row;
  });

  var relations = RouteService_publishedCopies_(routePlaceRows).filter(function (row) {
    return RouteService_trim_(row.route_id) === params.route_id;
  }).map(function (row) {
    var copy = RouteService_copy_(row);
    copy.__numeric_stop_order__ = RouteService_positiveSortValue_(row.stop_order);
    return copy;
  }).sort(function (left, right) {
    if (left.__numeric_stop_order__ !== right.__numeric_stop_order__) {
      return left.__numeric_stop_order__ - right.__numeric_stop_order__;
    }
    return left.__source_index__ - right.__source_index__;
  });

  var places = relations.map(function (relation) {
    var place = placesById["id:" + RouteService_trim_(relation.place_id)];
    if (!place) return null;
    return {
      place_id: RouteService_trim_(place.place_id),
      stop_order: relation.__numeric_stop_order__ === Infinity ? "" : relation.__numeric_stop_order__,
      name: RouteService_localized_(place, "name", params.lang),
      short_description: RouteService_localized_(place, "short_description", params.lang),
      phone: RouteService_trim_(place.phone),
      google_maps_url: RouteService_trim_(place.google_maps_url),
      latitude: RouteService_emptyOrNumber_(place.latitude),
      longitude: RouteService_emptyOrNumber_(place.longitude),
      cover_image_url: RouteService_trim_(place.cover_image_url)
    };
  }).filter(Boolean);

  return RouteService_success_({
    route_id: RouteService_trim_(route.route_id),
    name: RouteService_localized_(route, "name", params.lang),
    description: RouteService_localized_(route, "description", params.lang),
    duration: RouteService_trim_(route.duration),
    travel_style: RouteService_splitList_(route.travel_style),
    cover_image_url: RouteService_trim_(route.cover_image_url),
    places: places
  });
}

function RouteService_buildTripTemplatesResponse_(templateRows, placeRows, parameters) {
  var normalized = RouteService_normalizeTripTemplateParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  var params = normalized.params;
  var placesById = {};
  RouteService_publishedCopies_(placeRows).forEach(function (row) {
    var placeId = RouteService_trim_(row.place_id);
    var placeKey = "id:" + placeId;
    if (placeId && !placesById[placeKey]) placesById[placeKey] = row;
  });

  var rows = RouteService_publishedCopies_(templateRows).filter(function (row) {
    if (params.duration_type && RouteService_trim_(row.duration_type) !== params.duration_type) return false;
    if (params.style && RouteService_splitList_(row.travel_style).indexOf(params.style) === -1) return false;
    return true;
  });
  rows = RouteService_sortByNumericOrder_(rows, "sort_order");

  var items = rows.map(function (row) {
    var resolvedPlaces = RouteService_splitList_(row.place_ids).map(function (placeId) {
      return placesById["id:" + placeId] || null;
    }).filter(Boolean);
    return {
      template_id: RouteService_trim_(row.template_id),
      name: RouteService_localized_(row, "name", params.lang),
      duration_type: RouteService_trim_(row.duration_type),
      travel_style: RouteService_splitList_(row.travel_style),
      place_ids: resolvedPlaces.map(function (place) { return RouteService_trim_(place.place_id); }),
      places: resolvedPlaces.map(function (place) {
        return {
          place_id: RouteService_trim_(place.place_id),
          name_th: RouteService_trim_(place.name_th),
          name_en: RouteService_trim_(place.name_en),
          short_description_th: RouteService_trim_(place.short_description_th),
          short_description_en: RouteService_trim_(place.short_description_en),
          cover_image_url: RouteService_trim_(place.cover_image_url)
        };
      }),
      description: RouteService_localized_(row, "description", params.lang),
      cover_image_url: RouteService_trim_(row.cover_image_url)
    };
  });
  return RouteService_success_({ items: items, total: items.length });
}

function RouteService_normalizeRoutesParameters_(parameters) {
  var source = parameters || {};
  var result = { lang: RouteService_language_(source.lang) };
  var featured = RouteService_optionalBoolean_(source.featured);
  if (!featured.ok) return { ok: false, response: RouteService_validationError_("พารามิเตอร์ featured ไม่ถูกต้อง") };
  if (featured.hasValue) result.featured = featured.value;
  var style = RouteService_trim_(source.style);
  if (style) result.style = style;
  return { ok: true, params: result };
}

function RouteService_normalizeRouteDetailParameters_(parameters) {
  var source = parameters || {};
  var routeId = RouteService_trim_(source.route_id);
  if (!RouteService_validId_(routeId)) {
    return { ok: false, response: RouteService_validationError_("กรุณาระบุ route_id ที่ถูกต้อง") };
  }
  return { ok: true, params: { route_id: routeId, lang: RouteService_language_(source.lang) } };
}

function RouteService_normalizeTripTemplateParameters_(parameters) {
  var source = parameters || {};
  var result = { lang: RouteService_language_(source.lang) };
  var durationType = RouteService_trim_(source.duration_type);
  var style = RouteService_trim_(source.style);
  if (durationType) result.duration_type = durationType;
  if (style) result.style = style;
  return { ok: true, params: result };
}

function RouteService_getCachedPublicResponse_(action, parameters, ttlSeconds, loader) {
  var cache = null;
  var key = null;
  try {
    key = RouteService_cacheKey_(action, parameters);
    cache = CacheService.getScriptCache();
    var cached = cache.get(key);
    if (cached) {
      var parsed = JSON.parse(cached);
      if (parsed && parsed.ok === true && parsed.data && typeof parsed.data === "object") return parsed;
    }
  } catch (_routeServiceCacheReadError) {
    // Public sheet reads must continue when cache data or Cache Service is unavailable.
  }
  var response = loader();
  if (response && response.ok === true) {
    try {
      if (cache && key) cache.put(key, JSON.stringify(response), ttlSeconds);
    } catch (_routeServiceCacheWriteError) {
      // A successful uncached response remains valid.
    }
  }
  return response;
}

function RouteService_cacheKey_(action, parameters) {
  var parts = [
    "public",
    action,
    ContentCacheService_key_()
  ];

  if (
    action === "getRouteDetail" ||
    action === "getTripTemplates"
  ) {
    parts.push(PlaceService_cacheEpochKey_());
  }
  Object.keys(parameters || {}).sort().forEach(function (key) {
    parts.push(key + "=" + encodeURIComponent(RouteService_trim_(parameters[key])));
  });
  return parts.join(":");
}

function RouteService_publishedCopies_(sourceRows) {
  return (Array.isArray(sourceRows) ? sourceRows : []).map(function (row, index) {
    return { row: row, index: index };
  }).filter(function (entry) {
    return entry.row && RouteService_trim_(entry.row.status) === "published";
  }).map(function (entry) {
    var copy = RouteService_copy_(entry.row);
    copy.__source_index__ = entry.index;
    return copy;
  });
}

function RouteService_sortByNumericOrder_(rows, field) {
  return rows.slice().sort(function (left, right) {
    var leftOrder = RouteService_numericSortValue_(left[field]);
    var rightOrder = RouteService_numericSortValue_(right[field]);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.__source_index__ - right.__source_index__;
  });
}

function RouteService_splitList_(value) {
  var values = Array.isArray(value) ? value : RouteService_trim_(value).split("|");
  var seen = {};
  return values.map(RouteService_trim_).filter(function (item) {
    var seenKey = "item:" + item;
    if (!item || seen[seenKey]) return false;
    seen[seenKey] = true;
    return true;
  });
}

function RouteService_optionalBoolean_(value) {
  if (value === undefined || value === null || RouteService_trim_(value) === "") {
    return { ok: true, hasValue: false, value: false };
  }
  if (value === true || value === 1) return { ok: true, hasValue: true, value: true };
  if (value === false || value === 0) return { ok: true, hasValue: true, value: false };
  var text = RouteService_trim_(value).toLowerCase();
  if (text === "true" || text === "1") return { ok: true, hasValue: true, value: true };
  if (text === "false" || text === "0") return { ok: true, hasValue: true, value: false };
  return { ok: false, hasValue: false, value: false };
}

function RouteService_storedBoolean_(value) {
  var parsed = RouteService_optionalBoolean_(value);
  return parsed.ok && parsed.hasValue ? parsed.value : false;
}

function RouteService_localized_(row, field, lang) {
  var requested = RouteService_trim_(row[field + "_" + lang]);
  return requested || RouteService_trim_(row[field + "_th"]);
}

function RouteService_language_(value) {
  return RouteService_trim_(value).toLowerCase() === "en" ? "en" : "th";
}

function RouteService_validId_(value) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value);
}

function RouteService_positiveSortValue_(value) {
  var number = RouteService_numericSortValue_(value);
  return number > 0 ? number : Infinity;
}

function RouteService_numericSortValue_(value) {
  if (value === null || value === undefined || RouteService_trim_(value) === "") return Infinity;
  var number = Number(value);
  return isFinite(number) ? number : Infinity;
}

function RouteService_emptyOrNumber_(value) {
  if (value === null || value === undefined || RouteService_trim_(value) === "") return "";
  var number = Number(value);
  return isFinite(number) ? number : "";
}

function RouteService_copy_(row) {
  var copy = {};
  Object.keys(row || {}).forEach(function (key) { copy[key] = row[key]; });
  return copy;
}

function RouteService_success_(data) {
  return { ok: true, data: data, message: "success" };
}

function RouteService_validationError_(message) {
  return RouteService_error_("VALIDATION_ERROR", message);
}

function RouteService_error_(code, message) {
  return { ok: false, error: { code: code, message: message } };
}

function RouteService_trim_(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}
