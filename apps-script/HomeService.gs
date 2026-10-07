var HomeService_CACHE_SECONDS_ = 300;
var HomeService_PAGE_SIZE_ = 100;
var HomeService_SECTION_KEYS_ = [
  "featured_routes", "featured_places", "featured_products",
  "upcoming_events", "gallery_preview"
];
var HomeService_FIELDS_ = {
  featured_routes: ["route_id", "name", "short_description", "duration", "travel_style", "cover_image_url", "is_featured"],
  featured_places: ["place_id", "name", "name_th", "name_en", "district", "category", "route_group", "short_description", "phone", "google_maps_url", "latitude", "longitude", "cover_image_url", "is_featured", "is_main_route_point"],
  featured_products: ["product_id", "name", "category", "producer_name", "related_place_id", "description", "price_range", "phone", "contact_url", "google_maps_url", "image_url", "is_featured"],
  upcoming_events: ["event_id", "title", "event_type", "event_date", "start_time", "end_time", "location", "image_url", "contact_name", "contact_phone", "register_url"],
  gallery_preview: ["media_id", "title", "media_type", "category", "related_place_id", "image_url", "video_url", "thumbnail_url", "caption", "credit"]
};
var HomeService_CONFIG_ = {
  featured_routes: { id: "route_id", limit: 2 },
  featured_places: { id: "place_id", limit: 4 },
  featured_products: { id: "product_id", limit: 4 },
  upcoming_events: { id: "event_id", limit: 3 },
  gallery_preview: { id: "media_id", limit: 6 }
};

function getHomeData_(parameters) {
  var lang = HomeService_language_(parameters && parameters.lang);
  var cacheKey = null;
  var cache = null;

  try {
    cacheKey = "public:getHomeData:" + PlaceService_cacheEpochKey_() + ":" + ContentCacheService_key_() + ":lang=" + lang;
    cache = CacheService.getScriptCache();
    var cached = cache.get(cacheKey);
    if (cached) {
      var parsed = JSON.parse(cached);
      if (HomeService_validResponse_(parsed)) return HomeService_copy_(parsed);
    }
  } catch (_homeCacheReadError) {
    // Cache failures and malformed values must not prevent source reads.
  }

  var response;
  try {
    response = HomeService_buildResponse_(lang);
  } catch (_homeBuildError) {
    return HomeService_serverError_();
  }

  if (!HomeService_validResponse_(response)) return HomeService_serverError_();
  try {
    if (cache && cacheKey) cache.put(cacheKey, JSON.stringify(response), HomeService_CACHE_SECONDS_);
  } catch (_homeCacheWriteError) {
    // Return the successful uncached response.
  }
  return response;
}

function HomeService_buildResponse_(lang) {
  var routeRows = readSheetObjects_("routes");
  var placeRows = readSheetObjects_("places");
  var productRows = readSheetObjects_("products");
  var eventRows = readSheetObjects_("events");
  var galleryRows = readSheetObjects_("gallery");

  var routes = HomeService_items_(RouteService_buildRoutesResponse_(routeRows, { featured: true, lang: lang }));
  var places = HomeService_pagedItems_(buildPlacesResponse_, placeRows, { featured: true, lang: lang });
  var products = HomeService_pagedItems_(ProductService_buildProductsResponse_, productRows, { featured: true, lang: lang });
  var events = HomeService_items_(EventService_buildEventsResponse_(eventRows, { status: "upcoming", lang: lang }));
  var gallery = HomeService_items_(GalleryService_buildGalleryResponse_(galleryRows, { lang: lang }));

  return {
    ok: true,
    data: {
      featured_routes: HomeService_select_("featured_routes", routes),
      featured_places: HomeService_select_("featured_places", places),
      featured_products: HomeService_select_("featured_products", products),
      upcoming_events: HomeService_select_("upcoming_events", events),
      gallery_preview: HomeService_select_("gallery_preview", gallery)
    },
    message: "success"
  };
}

function HomeService_pagedItems_(builder, sourceRows, parameters) {
  var items = [];
  var page = 1;
  var total = 0;
  do {
    var params = HomeService_shallowCopy_(parameters);
    params.page = page;
    params.page_size = HomeService_PAGE_SIZE_;
    var response = builder(sourceRows, params);
    var pageItems = HomeService_items_(response);
    items = items.concat(pageItems);
    total = response.data && typeof response.data.total === "number" ? response.data.total : pageItems.length;
    page += 1;
  } while (items.length < total);
  return items;
}

function HomeService_items_(response) {
  if (!response || Array.isArray(response) || typeof response !== "object" || response.ok !== true) throw new Error("Home section build failed.");
  if (!response.data || Array.isArray(response.data) || typeof response.data !== "object" || !Array.isArray(response.data.items)) throw new Error("Home section shape is invalid.");
  return response.data.items;
}

function HomeService_select_(section, sourceItems) {
  var config = HomeService_CONFIG_[section];
  if (!config || !Array.isArray(sourceItems)) throw new Error("Home section is invalid.");
  var seen = Object.create(null);
  var selected = [];
  for (var index = 0; index < sourceItems.length && selected.length < config.limit; index += 1) {
    var item = sourceItems[index];
    if (!HomeService_validItem_(section, item)) continue;
    var key = "id:" + item[config.id];
    if (Object.prototype.hasOwnProperty.call(seen, key)) continue;
    seen[key] = true;
    selected.push(HomeService_project_(section, item));
  }
  return selected;
}

function HomeService_project_(section, item) {
  var projected = {};
  HomeService_FIELDS_[section].forEach(function (field) {
    projected[field] = HomeService_copyValue_(item[field]);
  });
  return projected;
}

function HomeService_validResponse_(response) {
  if (!response || Array.isArray(response) || typeof response !== "object") return false;
  if (!HomeService_exactKeys_(response, ["ok", "data", "message"]) || response.ok !== true || response.message !== "success") return false;
  if (!response.data || Array.isArray(response.data) || typeof response.data !== "object" || !HomeService_exactKeys_(response.data, HomeService_SECTION_KEYS_)) return false;
  return HomeService_SECTION_KEYS_.every(function (section) {
    var items = response.data[section];
    var config = HomeService_CONFIG_[section];
    if (!Array.isArray(items) || items.length > config.limit) return false;
    var seen = Object.create(null);
    return items.every(function (item) {
      if (!HomeService_validItem_(section, item)) return false;
      var key = "id:" + item[config.id];
      if (Object.prototype.hasOwnProperty.call(seen, key)) return false;
      seen[key] = true;
      return true;
    });
  });
}

function HomeService_validItem_(section, item) {
  var fields = HomeService_FIELDS_[section];
  if (!fields || !item || Array.isArray(item) || typeof item !== "object" || !HomeService_exactKeys_(item, fields)) return false;
  if (section === "featured_routes") {
    return HomeService_strings_(item, ["route_id", "name", "short_description", "duration", "cover_image_url"], ["route_id", "name", "short_description"])
      && HomeService_stringArray_(item.travel_style) && item.is_featured === true;
  }
  if (section === "featured_places") {
    return HomeService_strings_(item, ["place_id", "name", "name_th", "name_en", "district", "category", "route_group", "short_description", "phone", "google_maps_url", "cover_image_url"], ["place_id", "name", "name_th", "district", "category", "short_description"])
      && HomeService_coordinate_(item.latitude) && HomeService_coordinate_(item.longitude)
      && item.is_featured === true && typeof item.is_main_route_point === "boolean";
  }
  if (section === "featured_products") {
    return HomeService_strings_(item, ["product_id", "name", "category", "producer_name", "related_place_id", "description", "price_range", "phone", "contact_url", "google_maps_url", "image_url"], ["product_id", "name", "category", "description"])
      && item.is_featured === true;
  }
  if (section === "upcoming_events") {
    return HomeService_strings_(item, ["event_id", "title", "event_type", "event_date", "start_time", "end_time", "location", "image_url", "contact_name", "contact_phone", "register_url"], ["event_id", "title", "event_type", "event_date", "location"])
      && HomeService_upcomingDate_(item.event_date);
  }
  if (section === "gallery_preview") {
    return HomeService_strings_(item, ["media_id", "title", "media_type", "category", "related_place_id", "image_url", "video_url", "thumbnail_url", "caption", "credit"], ["media_id", "title", "media_type", "category"])
      && ["image", "video"].indexOf(item.media_type) !== -1;
  }
  return false;
}

function HomeService_upcomingDate_(value) {
  var date = EventService_dateParts_(value);
  var today = EventService_dateParts_(EventService_today_());
  return !!date && !!today && EventService_dateKey_(date) >= EventService_dateKey_(today);
}

function HomeService_strings_(item, fields, required) {
  for (var index = 0; index < fields.length; index += 1) {
    if (typeof item[fields[index]] !== "string") return false;
  }
  for (var requiredIndex = 0; requiredIndex < required.length; requiredIndex += 1) {
    if (!item[required[requiredIndex]].trim()) return false;
  }
  return true;
}

function HomeService_stringArray_(value) {
  return Array.isArray(value) && value.every(function (item) { return typeof item === "string"; });
}

function HomeService_coordinate_(value) {
  return value === "" || (typeof value === "number" && isFinite(value));
}

function HomeService_exactKeys_(object, expected) {
  var keys = Object.keys(object);
  if (keys.length !== expected.length) return false;
  return expected.every(function (key) { return keys.indexOf(key) !== -1; });
}

function HomeService_language_(value) {
  return HomeService_trim_(value).toLowerCase() === "en" ? "en" : "th";
}

function HomeService_shallowCopy_(source) {
  var copy = {};
  Object.keys(source || {}).forEach(function (key) { copy[key] = source[key]; });
  return copy;
}

function HomeService_copy_(value) {
  return JSON.parse(JSON.stringify(value));
}

function HomeService_copyValue_(value) {
  return Array.isArray(value) ? value.slice() : value;
}

function HomeService_serverError_() {
  return { ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดของระบบ" } };
}

function HomeService_trim_(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}
