var CategoryService_CACHE_SECONDS_ = 1800;
var CategoryService_TYPES_ = ["place", "product", "event", "gallery", "route_style"];
var CategoryService_PUBLIC_FIELDS_ = ["category_id", "category_type", "name", "icon", "color"];

function getCategories_(parameters) {
  var normalized = CategoryService_normalizeParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  var params = normalized.params;
  var key = CategoryService_cacheKey_(params);
  var cache = null;

  try {
    cache = CacheService.getScriptCache();
    var cached = cache.get(key);
    if (cached) {
      var parsed = JSON.parse(cached);
      if (CategoryService_validCachedResponse_(parsed)) return parsed;
    }
  } catch (_categoryCacheReadError) {
    // Cache failures and malformed cache entries must not prevent a public sheet read.
  }

  var response = CategoryService_buildCategoriesResponse_(readSheetObjects_("categories"), params);
  if (response && response.ok === true) {
    try {
      if (cache) cache.put(key, JSON.stringify(response), CategoryService_CACHE_SECONDS_);
    } catch (_categoryCacheWriteError) {
      // Return the successful uncached response.
    }
  }
  return response;
}

function CategoryService_buildCategoriesResponse_(sourceRows, parameters) {
  var normalized = CategoryService_normalizeParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  var params = normalized.params;
  var supported = CategoryService_keyMap_(CategoryService_TYPES_);
  var seen = Object.create(null);
  var rows = [];

  (Array.isArray(sourceRows) ? sourceRows : []).forEach(function (row, index) {
    if (!row || typeof row !== "object" || CategoryService_trim_(row.status) !== "published") return;
    var id = CategoryService_trim_(row.category_id);
    var type = CategoryService_trim_(row.category_type);
    var thaiName = CategoryService_trim_(row.name_th);
    if (!id || !thaiName || !Object.prototype.hasOwnProperty.call(supported, type)) return;
    var seenKey = "id:" + id;
    if (Object.prototype.hasOwnProperty.call(seen, seenKey)) return;
    seen[seenKey] = true;
    if (params.type && type !== params.type) return;
    rows.push({
      category_id: id,
      category_type: type,
      name_th: thaiName,
      name_en: CategoryService_trim_(row.name_en),
      icon: CategoryService_trim_(row.icon),
      color: CategoryService_trim_(row.color),
      sort_order: CategoryService_numericSort_(row.sort_order),
      source_index: index
    });
  });

  rows.sort(function (left, right) {
    if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
    return left.source_index - right.source_index;
  });

  return {
    ok: true,
    data: {
      items: rows.map(function (row) {
        return {
          category_id: row.category_id,
          category_type: row.category_type,
          name: params.lang === "en" ? row.name_en || row.name_th : row.name_th,
          icon: row.icon,
          color: row.color
        };
      })
    },
    message: "success"
  };
}

function CategoryService_normalizeParameters_(parameters) {
  var source = parameters || {};
  var type = CategoryService_lower_(source.type);
  if (type && CategoryService_TYPES_.indexOf(type) === -1) {
    return {
      ok: false,
      response: { ok: false, error: { code: "VALIDATION_ERROR", message: "พารามิเตอร์ type ไม่ถูกต้อง" } }
    };
  }
  return {
    ok: true,
    params: {
      type: type,
      lang: CategoryService_lower_(source.lang) === "en" ? "en" : "th"
    }
  };
}

function CategoryService_cacheKey_(parameters) {
  return [
    "public", "getCategories",
    "lang=" + parameters.lang,
    "type=" + (parameters.type || "all")
  ].join(":");
}

function CategoryService_validCachedResponse_(response) {
  if (!response || Array.isArray(response) || typeof response !== "object" || response.ok !== true || response.message !== "success") return false;
  if (!response.data || Array.isArray(response.data) || typeof response.data !== "object") return false;
  var dataKeys = Object.keys(response.data);
  if (dataKeys.length !== 1 || dataKeys[0] !== "items" || !Array.isArray(response.data.items)) return false;
  var seen = Object.create(null);
  return response.data.items.every(function (item) {
    if (!item || Array.isArray(item) || typeof item !== "object") return false;
    var keys = Object.keys(item);
    if (keys.length !== CategoryService_PUBLIC_FIELDS_.length) return false;
    for (var index = 0; index < CategoryService_PUBLIC_FIELDS_.length; index += 1) {
      if (keys.indexOf(CategoryService_PUBLIC_FIELDS_[index]) === -1) return false;
    }
    if (typeof item.category_id !== "string" || !item.category_id) return false;
    if (CategoryService_TYPES_.indexOf(item.category_type) === -1) return false;
    if (typeof item.name !== "string" || typeof item.icon !== "string" || typeof item.color !== "string") return false;
    var seenKey = "id:" + item.category_id;
    if (Object.prototype.hasOwnProperty.call(seen, seenKey)) return false;
    seen[seenKey] = true;
    return true;
  });
}

function CategoryService_numericSort_(value) {
  if (CategoryService_trim_(value) === "") return Infinity;
  var number = Number(value);
  return isFinite(number) ? number : Infinity;
}

function CategoryService_keyMap_(keys) {
  var map = Object.create(null);
  (keys || []).forEach(function (key) { map[key] = true; });
  return map;
}

function CategoryService_trim_(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function CategoryService_lower_(value) {
  return CategoryService_trim_(value).toLowerCase();
}
