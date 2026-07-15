var ProductService_CACHE_SECONDS_ = 300;
var ProductService_DEFAULT_PAGE_ = 1;
var ProductService_DEFAULT_PAGE_SIZE_ = 20;
var ProductService_MAX_PAGE_SIZE_ = 100;
var ProductService_CATEGORIES_ = ["food", "souvenir", "herbal", "honey", "handicraft", "fruit", "community_activity", "tourism_service", "accommodation", "transport"];
var ProductService_DISTRICTS_ = ["ban_ta_khun", "khiri_rat_nikhom", "phanom"];

function getProducts_(parameters) {
  var normalized = ProductService_normalizeListParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  return ProductService_cached_("getProducts", normalized.params, function () {
    return ProductService_buildProductsResponse_(readSheetObjects_("products"), normalized.params);
  });
}

function getProductDetail_(parameters) {
  var normalized = ProductService_normalizeDetailParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  return ProductService_cached_("getProductDetail", normalized.params, function () {
    return ProductService_buildProductDetailResponse_(
      readSheetObjects_("products"),
      readSheetObjects_("places"),
      normalized.params
    );
  });
}

function ProductService_buildProductsResponse_(sourceRows, parameters) {
  var normalized = ProductService_normalizeListParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  var params = normalized.params;
  var keyword = ProductService_lower_(params.keyword);
  var rows = ProductService_publishedCopies_(sourceRows).filter(function (row) {
    if (params.category && ProductService_trim_(row.category) !== params.category) return false;
    if (params.district && ProductService_trim_(row.district) !== params.district) return false;
    if (params.related_place_id && ProductService_trim_(row.related_place_id) !== params.related_place_id) return false;
    if (params.featured !== undefined && ProductService_storedBoolean_(row.is_featured) !== params.featured) return false;
    if (!keyword) return true;
    return [
      ProductService_localized_(row, "name", params.lang),
      ProductService_trim_(row.name_th),
      ProductService_localized_(row, "description", params.lang),
      ProductService_trim_(row.description_th),
      ProductService_trim_(row.producer_name)
    ].some(function (value) { return ProductService_lower_(value).indexOf(keyword) !== -1; });
  });
  rows = ProductService_sort_(rows);
  var total = rows.length;
  var start = (params.page - 1) * params.page_size;
  var items = rows.slice(start, start + params.page_size).map(function (row) {
    return ProductService_listProjection_(row, params.lang);
  });
  return ProductService_success_({
    items: items,
    total: total,
    page: params.page,
    page_size: params.page_size,
    total_pages: total ? Math.ceil(total / params.page_size) : 0
  });
}

function ProductService_buildProductDetailResponse_(productRows, placeRows, parameters) {
  var normalized = ProductService_normalizeDetailParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  var params = normalized.params;
  var product = ProductService_publishedCopies_(productRows).filter(function (row) {
    return ProductService_trim_(row.product_id) === params.product_id;
  })[0];
  if (!product) return ProductService_error_("NOT_FOUND", "ไม่พบสินค้า/บริการนี้");

  var placeMap = ProductService_publishedPlaceMap_(placeRows);
  var relatedId = ProductService_trim_(product.related_place_id);
  var related = relatedId && Object.prototype.hasOwnProperty.call(placeMap, relatedId) ? placeMap[relatedId] : null;
  return ProductService_success_({
    product_id: ProductService_trim_(product.product_id),
    name: ProductService_localized_(product, "name", params.lang),
    category: ProductService_trim_(product.category),
    producer_name: ProductService_trim_(product.producer_name),
    related_place: related ? {
      place_id: ProductService_trim_(related.place_id),
      name: ProductService_localized_(related, "name", params.lang)
    } : null,
    description: ProductService_localized_(product, "description", params.lang),
    price_range: ProductService_trim_(product.price_range),
    phone: ProductService_trim_(product.phone),
    contact_url: ProductService_trim_(product.contact_url),
    google_maps_url: ProductService_trim_(product.google_maps_url),
    latitude: ProductService_emptyOrNumber_(product.latitude),
    longitude: ProductService_emptyOrNumber_(product.longitude),
    image_url: ProductService_trim_(product.image_url),
    tags: ProductService_splitList_(product.tags)
  });
}

function ProductService_listProjection_(row, lang) {
  return {
    product_id: ProductService_trim_(row.product_id),
    name: ProductService_localized_(row, "name", lang),
    category: ProductService_trim_(row.category),
    producer_name: ProductService_trim_(row.producer_name),
    related_place_id: ProductService_trim_(row.related_place_id),
    description: ProductService_localized_(row, "description", lang),
    price_range: ProductService_trim_(row.price_range),
    phone: ProductService_trim_(row.phone),
    contact_url: ProductService_trim_(row.contact_url),
    google_maps_url: ProductService_trim_(row.google_maps_url),
    image_url: ProductService_trim_(row.image_url),
    is_featured: ProductService_storedBoolean_(row.is_featured)
  };
}

function ProductService_normalizeListParameters_(parameters) {
  var source = parameters || {};
  var page = ProductService_positiveInteger_(source.page, ProductService_DEFAULT_PAGE_, null);
  var pageSize = ProductService_positiveInteger_(source.page_size, ProductService_DEFAULT_PAGE_SIZE_, ProductService_MAX_PAGE_SIZE_);
  var featured = ProductService_optionalBoolean_(source.featured);
  if (!page.ok || !pageSize.ok || !featured.ok) return { ok: false, response: ProductService_validationError_("พารามิเตอร์ไม่ถูกต้อง") };
  var params = {
    page: page.value,
    page_size: pageSize.value,
    lang: ProductService_language_(source.lang)
  };
  var category = ProductService_lower_(source.category);
  if (category && ProductService_CATEGORIES_.indexOf(category) === -1) return { ok: false, response: ProductService_validationError_("พารามิเตอร์ category ไม่ถูกต้อง") };
  var district = ProductService_lower_(source.district);
  if (district && ProductService_DISTRICTS_.indexOf(district) === -1) return { ok: false, response: ProductService_validationError_("พารามิเตอร์ district ไม่ถูกต้อง") };
  var keyword = ProductService_trim_(source.keyword);
  if (category) params.category = category;
  if (district) params.district = district;
  if (keyword) params.keyword = keyword;
  var relatedId = ProductService_trim_(source.related_place_id);
  if (relatedId) {
    if (!ProductService_validId_(relatedId)) return { ok: false, response: ProductService_validationError_("พารามิเตอร์ related_place_id ไม่ถูกต้อง") };
    params.related_place_id = relatedId;
  }
  if (featured.hasValue) params.featured = featured.value;
  return { ok: true, params: params };
}

function ProductService_normalizeDetailParameters_(parameters) {
  var source = parameters || {};
  var productId = ProductService_trim_(source.product_id);
  if (!ProductService_validId_(productId)) return { ok: false, response: ProductService_validationError_("กรุณาระบุ product_id ที่ถูกต้อง") };
  return { ok: true, params: { product_id: productId, lang: ProductService_language_(source.lang) } };
}

function ProductService_publishedCopies_(sourceRows) {
  return (Array.isArray(sourceRows) ? sourceRows : []).map(function (row, index) {
    return { row: row, index: index };
  }).filter(function (entry) {
    return entry.row && ProductService_trim_(entry.row.status) === "published";
  }).map(function (entry) {
    var copy = ProductService_copy_(entry.row);
    copy.__source_index__ = entry.index;
    return copy;
  });
}

function ProductService_publishedPlaceMap_(sourceRows) {
  var map = Object.create(null);
  (Array.isArray(sourceRows) ? sourceRows : []).forEach(function (row) {
    if (!row || ProductService_trim_(row.status) !== "published") return;
    var id = ProductService_trim_(row.place_id);
    if (id) map[id] = ProductService_copy_(row);
  });
  return map;
}

function ProductService_sort_(rows) {
  return rows.slice().sort(function (left, right) {
    var featured = Number(ProductService_storedBoolean_(right.is_featured)) - Number(ProductService_storedBoolean_(left.is_featured));
    if (featured) return featured;
    var order = ProductService_numericSort_(left.sort_order) - ProductService_numericSort_(right.sort_order);
    if (order) return order;
    return left.__source_index__ - right.__source_index__;
  });
}

function ProductService_cached_(action, parameters, loader) {
  var cache = null;
  var key = ProductService_cacheKey_(action, parameters);
  try {
    cache = CacheService.getScriptCache();
    var cached = cache.get(key);
    if (cached) {
      var parsed = JSON.parse(cached);
      if (parsed && parsed.ok === true && parsed.data && typeof parsed.data === "object") return parsed;
    }
  } catch (_productServiceCacheReadError) {
    // Cache failures must not prevent public reads.
  }
  var response = loader();
  if (response && response.ok === true) {
    try { if (cache) cache.put(key, JSON.stringify(response), ProductService_CACHE_SECONDS_); }
    catch (_productServiceCacheWriteError) { /* Return the successful uncached response. */ }
  }
  return response;
}

function ProductService_cacheKey_(action, parameters) {
  var parts = ["public", action];
  Object.keys(parameters || {}).sort().forEach(function (key) {
    parts.push(key + "=" + encodeURIComponent(ProductService_trim_(parameters[key])));
  });
  return parts.join(":");
}

function ProductService_positiveInteger_(value, fallback, maximum) {
  if (value === undefined || value === null || ProductService_trim_(value) === "") return { ok: true, value: fallback };
  var text = ProductService_trim_(value);
  if (!/^\d+$/.test(text)) return { ok: false };
  var number = Number(text);
  if (!isFinite(number) || number < 1 || Math.floor(number) !== number || (maximum !== null && number > maximum)) return { ok: false };
  return { ok: true, value: number };
}

function ProductService_optionalBoolean_(value) {
  if (value === undefined || value === null || ProductService_trim_(value) === "") return { ok: true, hasValue: false, value: false };
  if (value === true || value === 1) return { ok: true, hasValue: true, value: true };
  if (value === false || value === 0) return { ok: true, hasValue: true, value: false };
  var text = ProductService_lower_(value);
  if (text === "true" || text === "1") return { ok: true, hasValue: true, value: true };
  if (text === "false" || text === "0") return { ok: true, hasValue: true, value: false };
  return { ok: false, hasValue: false, value: false };
}

function ProductService_storedBoolean_(value) {
  var result = ProductService_optionalBoolean_(value);
  return result.ok && result.hasValue ? result.value : false;
}

function ProductService_localized_(row, field, lang) {
  return ProductService_trim_(row[field + "_" + lang]) || ProductService_trim_(row[field + "_th"]);
}

function ProductService_language_(value) { return ProductService_lower_(value) === "en" ? "en" : "th"; }
function ProductService_validId_(value) { return /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value); }
function ProductService_numericSort_(value) { var number = Number(value); return ProductService_trim_(value) !== "" && isFinite(number) ? number : Infinity; }
function ProductService_emptyOrNumber_(value) { if (ProductService_trim_(value) === "") return ""; var number = Number(value); return isFinite(number) ? number : ""; }
function ProductService_splitList_(value) { var seen = Object.create(null); var items = Array.isArray(value) ? value : ProductService_trim_(value).split("|"); return items.map(ProductService_trim_).filter(function (item) { var key = "item:" + item; if (!item || seen[key]) return false; seen[key] = true; return true; }); }
function ProductService_copy_(row) { var copy = {}; Object.keys(row || {}).forEach(function (key) { copy[key] = row[key]; }); return copy; }
function ProductService_success_(data) { return { ok: true, data: data, message: "success" }; }
function ProductService_validationError_(message) { return ProductService_error_("VALIDATION_ERROR", message); }
function ProductService_error_(code, message) { return { ok: false, error: { code: code, message: message } }; }
function ProductService_trim_(value) { return value === null || value === undefined ? "" : String(value).trim(); }
function ProductService_lower_(value) { return ProductService_trim_(value).toLocaleLowerCase(); }
