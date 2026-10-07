var SearchService_CACHE_SECONDS_ = 300;
var SearchService_PAGE_SIZE_ = 100;
var SearchService_MAX_PAGES_ = 10000;
var SearchService_LIMIT_ = 10;
var SearchService_SECTIONS_ = ["places", "products", "events", "routes"];
var SearchService_IDS_ = {
  places: "place_id",
  products: "product_id",
  events: "event_id",
  routes: "route_id"
};
var SearchService_SEARCH_FIELDS_ = {
  places: ["name", "name_th", "name_en", "short_description", "district", "category", "route_group"],
  products: ["name", "description", "producer_name", "category"],
  events: ["title", "location", "event_type"],
  routes: ["name", "short_description", "duration", "travel_style"]
};
var SearchService_RESULT_FIELDS_ = {
  places: ["place_id", "name", "short_description", "category", "district", "cover_image_url"],
  products: ["product_id", "name", "description", "category", "producer_name", "image_url"],
  events: ["event_id", "title", "event_type", "event_date", "start_time", "end_time", "location", "image_url"],
  routes: ["route_id", "name", "short_description", "duration", "travel_style", "cover_image_url"]
};
var SearchService_BUILDER_FIELDS_ = {
  places: ["place_id", "name", "name_th", "name_en", "district", "category", "route_group", "short_description", "phone", "google_maps_url", "latitude", "longitude", "cover_image_url", "is_featured", "is_main_route_point"],
  products: ["product_id", "name", "category", "producer_name", "related_place_id", "description", "price_range", "phone", "contact_url", "google_maps_url", "image_url", "is_featured"],
  events: ["event_id", "title", "event_type", "event_date", "start_time", "end_time", "location", "image_url", "contact_name", "contact_phone", "register_url"],
  routes: ["route_id", "name", "short_description", "duration", "travel_style", "cover_image_url", "is_featured"]
};

function searchAll_(parameters) {
  var normalized = SearchService_normalizeParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  if (!normalized.params.keyword) return SearchService_empty_();

  var cache = null;
  var cacheKey = null;
  try {
    cacheKey = SearchService_cacheKey_(normalized.params);
    cache = CacheService.getScriptCache();
    var cached = cache.get(cacheKey);
    if (cached) {
      var parsed = JSON.parse(cached);
      if (SearchService_validResponse_(parsed)) return SearchService_copy_(parsed);
    }
  } catch (_searchCacheReadError) {
    // Cache failures and malformed values must not prevent source reads.
  }

  var response;
  try {
    response = SearchService_buildResponse_(normalized.params);
  } catch (_searchBuildError) {
    return SearchService_serverError_();
  }
  if (!SearchService_validResponse_(response)) return SearchService_serverError_();

  try {
    if (cache && cacheKey) cache.put(cacheKey, JSON.stringify(response), SearchService_CACHE_SECONDS_);
  } catch (_searchCacheWriteError) {
    // Return the successful uncached response.
  }
  return response;
}

function SearchService_buildResponse_(parameters) {
  var placeRows = readSheetObjects_("places");
  var routeRows = readSheetObjects_("routes");
  var productRows = readSheetObjects_("products");
  var eventRows = readSheetObjects_("events");
  var lang = parameters.lang;

  var source = {
    places: SearchService_collectPaged_(buildPlacesResponse_, placeRows, { lang: lang }),
    routes: SearchService_builderItems_(RouteService_buildRoutesResponse_(routeRows, { lang: lang })),
    products: SearchService_collectPaged_(ProductService_buildProductsResponse_, productRows, { lang: lang }),
    events: SearchService_builderItems_(EventService_buildEventsResponse_(eventRows, { status: "all", lang: lang }))
  };
  var data = { places: [], products: [], events: [], routes: [], total: 0 };

  SearchService_SECTIONS_.forEach(function (section) {
    var seen = Object.create(null);
    var matches = [];
    source[section].forEach(function (item) {
      if (!SearchService_validBuilderItem_(section, item)) return;
      if (!SearchService_matches_(section, item, parameters.canonicalKeyword)) return;
      var id = item[SearchService_IDS_[section]];
      var key = "id:" + id;
      if (Object.prototype.hasOwnProperty.call(seen, key)) return;
      seen[key] = true;
      matches.push(SearchService_project_(section, item));
    });
    data.total += matches.length;
    data[section] = matches.slice(0, SearchService_LIMIT_);
  });

  return { ok: true, data: data, message: "success" };
}

function SearchService_collectPaged_(builder, sourceRows, parameters) {
  var items = [];
  var page = 1;
  var totalPages = 1;
  var expectedTotal = null;
  while (page <= totalPages) {
    if (page > SearchService_MAX_PAGES_) throw new Error("Search pagination exceeded safe limit.");
    var params = SearchService_shallowCopy_(parameters);
    params.page = page;
    params.page_size = SearchService_PAGE_SIZE_;
    var response = builder(sourceRows, params);
    var pageItems = SearchService_builderItems_(response);
    if (!SearchService_nonNegativeInteger_(response.data.total) || !SearchService_positiveInteger_(response.data.page) || !SearchService_positiveInteger_(response.data.page_size) || !SearchService_nonNegativeInteger_(response.data.total_pages)) {
      throw new Error("Search builder pagination is invalid.");
    }
    if (response.data.page !== page || response.data.page_size > SearchService_PAGE_SIZE_) throw new Error("Search builder page is invalid.");
    if (expectedTotal === null) {
      expectedTotal = response.data.total;
      totalPages = response.data.total_pages;
    } else if (response.data.total !== expectedTotal || response.data.total_pages !== totalPages) {
      throw new Error("Search builder pagination changed.");
    }
    if (page < totalPages && pageItems.length === 0) throw new Error("Search builder pagination made no progress.");
    items = items.concat(pageItems);
    page += 1;
  }
  if (items.length !== expectedTotal) throw new Error("Search builder pagination is incomplete.");
  return items;
}

function SearchService_builderItems_(response) {
  if (!response || Array.isArray(response) || typeof response !== "object" || response.ok !== true || response.message !== "success") throw new Error("Search builder failed.");
  if (!response.data || Array.isArray(response.data) || typeof response.data !== "object" || !Array.isArray(response.data.items)) throw new Error("Search builder shape is invalid.");
  if (!SearchService_nonNegativeInteger_(response.data.total)) throw new Error("Search builder total is invalid.");
  return response.data.items;
}

function SearchService_matches_(section, item, canonicalKeyword) {
  return SearchService_SEARCH_FIELDS_[section].some(function (field) {
    var value = item[field];
    if (field === "travel_style") {
      if (!Array.isArray(value) || !value.every(function (entry) { return typeof entry === "string"; })) return false;
      value = value.join(" ");
    }
    if (typeof value !== "string") return false;
    return SearchService_canonicalText_(value).indexOf(canonicalKeyword) !== -1;
  });
}

function SearchService_project_(section, item) {
  var projected = {};
  SearchService_RESULT_FIELDS_[section].forEach(function (field) {
    projected[field] = Array.isArray(item[field]) ? item[field].slice() : item[field];
  });
  return projected;
}

function SearchService_validBuilderItem_(section, item) {
  var expected = SearchService_BUILDER_FIELDS_[section];
  if (!expected || !item || Array.isArray(item) || typeof item !== "object" || !SearchService_exactKeys_(item, expected)) return false;
  var id = item[SearchService_IDS_[section]];
  if (typeof id !== "string" || !id.trim()) return false;
  for (var index = 0; index < SearchService_RESULT_FIELDS_[section].length; index += 1) {
    var field = SearchService_RESULT_FIELDS_[section][index];
    var value = item[field];
    if (field === "travel_style") {
      if (!Array.isArray(value) || !value.every(function (entry) { return typeof entry === "string"; })) return false;
    } else if (typeof value !== "string") return false;
  }
  var primary = section === "events" ? item.title : item.name;
  return typeof primary === "string" && !!primary.trim();
}

function SearchService_normalizeParameters_(parameters) {
  var source = parameters || {};
  var keyword = SearchService_normalizedText_(source.keyword);
  if (Array.from(keyword).length > 100) {
    return { ok: false, response: { ok: false, error: { code: "VALIDATION_ERROR", message: "พารามิเตอร์ keyword ไม่ถูกต้อง" } } };
  }
  return {
    ok: true,
    params: {
      keyword: keyword,
      canonicalKeyword: SearchService_canonicalText_(keyword),
      lang: SearchService_language_(source.lang)
    }
  };
}

function SearchService_normalizedText_(value) {
  if (value === null || value === undefined) return "";
  try { return String(value).normalize("NFC").trim().replace(/\s+/g, " "); }
  catch (_searchTextError) { return ""; }
}

function SearchService_canonicalText_(value) {
  return SearchService_normalizedText_(value).toLowerCase();
}

function SearchService_language_(value) {
  return SearchService_canonicalText_(value) === "en" ? "en" : "th";
}

function SearchService_cacheKey_(parameters) {
  return "public:searchAll:" + PlaceService_cacheEpochKey_() + ":" + ContentCacheService_key_() + ":keyword=" + encodeURIComponent(parameters.canonicalKeyword) + ":lang=" + parameters.lang;
}

function SearchService_validResponse_(response) {
  if (!response || Array.isArray(response) || typeof response !== "object" || !SearchService_exactKeys_(response, ["ok", "data", "message"])) return false;
  if (response.ok !== true || response.message !== "success" || !response.data || Array.isArray(response.data) || typeof response.data !== "object") return false;
  if (!SearchService_exactKeys_(response.data, ["places", "products", "events", "routes", "total"])) return false;
  if (!SearchService_nonNegativeInteger_(response.data.total)) return false;
  var returned = 0;
  for (var sectionIndex = 0; sectionIndex < SearchService_SECTIONS_.length; sectionIndex += 1) {
    var section = SearchService_SECTIONS_[sectionIndex];
    var items = response.data[section];
    if (!Array.isArray(items) || items.length > SearchService_LIMIT_) return false;
    var seen = Object.create(null);
    for (var itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      var item = items[itemIndex];
      if (!item || Array.isArray(item) || typeof item !== "object" || !SearchService_exactKeys_(item, SearchService_RESULT_FIELDS_[section])) return false;
      if (!SearchService_validResultItem_(section, item)) return false;
      var key = "id:" + item[SearchService_IDS_[section]];
      if (Object.prototype.hasOwnProperty.call(seen, key)) return false;
      seen[key] = true;
    }
    returned += items.length;
  }
  return response.data.total >= returned;
}

function SearchService_validResultItem_(section, item) {
  var fields = SearchService_RESULT_FIELDS_[section];
  for (var index = 0; index < fields.length; index += 1) {
    var field = fields[index];
    if (field === "travel_style") {
      if (!Array.isArray(item[field]) || !item[field].every(function (entry) { return typeof entry === "string"; })) return false;
    } else if (typeof item[field] !== "string") return false;
  }
  var id = item[SearchService_IDS_[section]];
  var primary = section === "events" ? item.title : item.name;
  return !!id.trim() && !!primary.trim();
}

function SearchService_empty_() {
  return { ok: true, data: { places: [], products: [], events: [], routes: [], total: 0 }, message: "success" };
}

function SearchService_serverError_() {
  return { ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดของระบบ" } };
}

function SearchService_exactKeys_(object, expected) {
  var keys = Object.keys(object);
  if (keys.length !== expected.length) return false;
  return expected.every(function (key) { return keys.indexOf(key) !== -1; });
}

function SearchService_nonNegativeInteger_(value) {
  return typeof value === "number" && isFinite(value) && Math.floor(value) === value && value >= 0;
}

function SearchService_positiveInteger_(value) {
  return SearchService_nonNegativeInteger_(value) && value > 0;
}

function SearchService_shallowCopy_(source) {
  var copy = {};
  Object.keys(source || {}).forEach(function (key) { copy[key] = source[key]; });
  return copy;
}

function SearchService_copy_(value) {
  return JSON.parse(JSON.stringify(value));
}
