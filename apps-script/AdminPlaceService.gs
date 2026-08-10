var AdminPlaceService_DEFAULT_PAGE_ = 1;
var AdminPlaceService_DEFAULT_PAGE_SIZE_ = 20;
var AdminPlaceService_MAX_PAGE_SIZE_ = 100;

var AdminPlaceService_ALLOWED_ROLES_ = ["super_admin", "editor", "reviewer", "viewer"];
var AdminPlaceService_WRITE_ROLES_ = ["super_admin", "editor"];
var AdminPlaceService_STATUSES_ = ["draft", "published", "archived"];
var AdminPlaceService_CATEGORIES_ = [
  "main_point", "community_tourism", "nature", "viewpoint", "lake", "activity", "food_cafe",
  "accommodation", "temple_culture", "product_shop", "waterfall", "cave", "service"
];
var AdminPlaceService_CONTENT_HEADERS_ = [
  "name_th", "name_en", "slug", "district", "province", "route_group", "category", "sub_category",
  "short_description_th", "short_description_en", "description_th", "description_en", "activities_th", "activities_en",
  "highlight_th", "highlight_en", "address_th", "address_en", "facilities_th", "facilities_en", "phone", "line_url",
  "facebook_url", "website_url", "google_maps_url", "latitude", "longitude", "coordinate_status", "open_time_th",
  "open_time_en", "fee_th", "fee_en", "tags", "recommended_duration", "best_time_th", "best_time_en",
  "nearby_place_ids", "is_featured", "is_main_route_point", "sort_order", "gallery_media_ids"
];
var AdminPlaceService_LIST_KEYS_ = ["keyword", "category", "status", "page", "page_size"];
var AdminPlaceService_DETAIL_KEYS_ = ["place_id", "view"];

function adminGetPlaces_(token, payload) {
  return AdminPlaceService_execute_(token, function () {
    var parameters = AdminPlaceService_listParameters_(payload);
    return AdminPlaceService_success_(AdminPlaceService_buildList_(AdminPlaceService_requireContext_(true), parameters));
  });
}

function adminGetPlaceDetail_(token, payload) {
  return AdminPlaceService_execute_(token, function (admin) {
    var parameters = AdminPlaceService_detailParameters_(payload);
    var draftContentScope = parameters.view === "working" ? parameters.place_id : null;
    return AdminPlaceService_success_(AdminPlaceService_buildDetail_(AdminPlaceService_requireContext_(draftContentScope), parameters, admin));
  });
}

function AdminPlaceService_execute_(token, operation) {
  try {
    var admin = AuthService_requireAdmin_(token);
    if (!admin || AdminPlaceService_ALLOWED_ROLES_.indexOf(admin.role) === -1) {
      throw new Error("ADMIN_PLACE_CONTEXT");
    }
    return operation(admin);
  } catch (error) {
    var code = error && typeof error.message === "string" ? error.message : "";
    if (code === "UNAUTHORIZED") return AdminPlaceService_error_("UNAUTHORIZED", "กรุณาเข้าสู่ระบบ");
    if (code === "VALIDATION_ERROR") return AdminPlaceService_error_("VALIDATION_ERROR", "ข้อมูลคำขอไม่ถูกต้อง");
    if (code === "NOT_FOUND") return AdminPlaceService_error_("NOT_FOUND", "ไม่พบสถานที่");
    return AdminPlaceService_error_("SERVER_ERROR", "เกิดข้อผิดพลาดของระบบ");
  }
}

function AdminPlaceService_requireContext_(draftContentScope) {
  var placeHeaders = AdminPlaceSchema_PLACE_BASE_HEADERS_.concat(AdminPlaceSchema_PLACES_APPEND_HEADERS_);
  var placeTable = SheetService_readTable_(AdminPlaceSchema_PLACES_SHEET_NAME_, placeHeaders);
  var draftTable = SheetService_readTable_(AdminPlaceSchema_DRAFTS_SHEET_NAME_, AdminPlaceSchema_DRAFT_HEADERS_);
  if (!placeTable || !Array.isArray(placeTable.rows) || !draftTable || !Array.isArray(draftTable.rows)) {
    throw new Error("ADMIN_PLACE_DATA");
  }

  var placesById = Object.create(null);
  var draftsById = Object.create(null);
  placeTable.rows.forEach(function (entry) {
    var row = entry && entry.values;
    var id = row && row.place_id;
    if (!AdminPlaceService_validId_(id) || Object.prototype.hasOwnProperty.call(placesById, id)) {
      throw new Error("ADMIN_PLACE_IDENTITY");
    }
    if (AdminPlaceService_STATUSES_.indexOf(row.status) === -1) throw new Error("ADMIN_PLACE_STATUS");
    var entityVersion = AdminPlaceService_storedInteger_(row.entity_version, true);
    var publishedVersion = AdminPlaceService_storedInteger_(row.published_version, false);
    if (publishedVersion > entityVersion || (row.status === "published" && publishedVersion < 1)) {
      throw new Error("ADMIN_PLACE_VERSION");
    }
    if (publishedVersion > 0) AdminPlaceService_projectContent_(row);
    placesById[id] = {
      row: row,
      entityVersion: entityVersion,
      publishedVersion: publishedVersion
    };
  });

  draftTable.rows.forEach(function (entry) {
    var row = entry && entry.values;
    var id = row && row.place_id;
    if (!AdminPlaceService_validId_(id) || Object.prototype.hasOwnProperty.call(draftsById, id)) {
      throw new Error("ADMIN_PLACE_DRAFT_IDENTITY");
    }
    var owner = placesById[id];
    if (!owner) throw new Error("ADMIN_PLACE_DRAFT_OWNER");
    var draftVersion = AdminPlaceService_storedInteger_(row.draft_version, true);
    var basePublishedVersion = AdminPlaceService_storedInteger_(row.base_published_version, false);
    if (draftVersion !== owner.entityVersion || basePublishedVersion !== owner.publishedVersion) {
      throw new Error("ADMIN_PLACE_DRAFT_VERSION");
    }
    if (draftContentScope === true || draftContentScope === id) AdminPlaceService_projectContent_(row);
    draftsById[id] = { row: row, draftVersion: draftVersion, basePublishedVersion: basePublishedVersion };
  });

  Object.keys(placesById).forEach(function (id) {
    var place = placesById[id];
    var hasDraft = Object.prototype.hasOwnProperty.call(draftsById, id);
    if (place.row.status === "draft" && !hasDraft) throw new Error("ADMIN_PLACE_DRAFT_REQUIRED");
    if (place.publishedVersion === 0 && !hasDraft) throw new Error("ADMIN_PLACE_CONTENT_REQUIRED");
  });

  return { placesById: placesById, draftsById: draftsById };
}

function AdminPlaceService_buildList_(context, parameters) {
  var items = Object.keys(context.placesById).map(function (id) {
    var place = context.placesById[id];
    var draft = context.draftsById[id] || null;
    var content = AdminPlaceService_projectContent_(draft ? draft.row : place.row);
    return {
      place_id: id,
      name_th: content.name_th,
      name_en: content.name_en,
      category: content.category,
      area_summary: { district: content.district, province: content.province },
      status: place.row.status,
      has_active_draft: Boolean(draft),
      display_state: AdminPlaceService_displayState_(place.row.status, Boolean(draft)),
      cover: null,
      created_at: AdminPlaceService_safeText_(place.row.created_at),
      updated_at: AdminPlaceService_safeText_(place.row.updated_at)
    };
  }).filter(function (item) {
    if (!parameters.status && item.status === "archived") return false;
    if (parameters.status && parameters.status !== "all" && item.status !== parameters.status) return false;
    if (parameters.category && item.category !== parameters.category) return false;
    if (!parameters.keyword) return true;
    return [
      item.name_th, item.name_en, item.category, item.area_summary.district, item.area_summary.province
    ].some(function (value) {
      return AdminPlaceService_lowerText_(value).indexOf(parameters.keyword) !== -1;
    });
  });

  items.sort(function (left, right) {
    if (left.updated_at !== right.updated_at) return left.updated_at < right.updated_at ? 1 : -1;
    if (left.name_th !== right.name_th) return left.name_th < right.name_th ? -1 : 1;
    return left.place_id < right.place_id ? -1 : left.place_id > right.place_id ? 1 : 0;
  });

  var total = items.length;
  var start = (parameters.page - 1) * parameters.page_size;
  return {
    items: items.slice(start, start + parameters.page_size),
    page: parameters.page,
    page_size: parameters.page_size,
    total: total,
    total_pages: total ? Math.ceil(total / parameters.page_size) : 0
  };
}

function AdminPlaceService_buildDetail_(context, parameters, admin) {
  var place = context.placesById[parameters.place_id];
  if (!place) throw new Error("NOT_FOUND");
  var draft = context.draftsById[parameters.place_id] || null;
  var source;
  if (parameters.view === "published") {
    if (place.publishedVersion < 1) throw new Error("NOT_FOUND");
    source = place.row;
  } else {
    source = draft ? draft.row : place.row;
  }

  var hasDraft = Boolean(draft);
  var canWrite = AdminPlaceService_WRITE_ROLES_.indexOf(admin.role) !== -1;
  return {
    place_id: parameters.place_id,
    status: place.row.status,
    has_active_draft: hasDraft,
    display_state: AdminPlaceService_displayState_(place.row.status, hasDraft),
    entity_version: place.entityVersion,
    working_version: hasDraft ? draft.draftVersion : place.entityVersion,
    published_version: place.publishedVersion || null,
    content: AdminPlaceService_projectContent_(source),
    media: { cover: null, gallery: [] },
    capabilities: {
      can_write: canWrite,
      can_publish: canWrite && hasDraft && place.row.status !== "archived",
      can_unpublish: canWrite && place.row.status === "published",
      can_archive: canWrite && place.row.status !== "archived",
      can_restore: canWrite && place.row.status === "archived",
      can_view_working: true,
      can_view_published: place.publishedVersion > 0
    },
    created_at: AdminPlaceService_safeText_(place.row.created_at),
    updated_at: AdminPlaceService_safeText_(place.row.updated_at)
  };
}

function AdminPlaceService_listParameters_(payload) {
  var source = AdminPlaceService_plainObject_(payload, true);
  AdminPlaceService_assertExactKeys_(source, AdminPlaceService_LIST_KEYS_);
  ["keyword", "category", "status"].forEach(function (key) {
    if (source[key] !== undefined && source[key] !== null && typeof source[key] !== "string") {
      throw new Error("VALIDATION_ERROR");
    }
  });
  var keyword = source.keyword === undefined || source.keyword === null ? "" : source.keyword.trim();
  if (keyword.length > 200) throw new Error("VALIDATION_ERROR");
  var category = source.category === undefined || source.category === null ? "" : source.category;
  if (category && AdminPlaceService_CATEGORIES_.indexOf(category) === -1) throw new Error("VALIDATION_ERROR");
  var status = source.status === undefined || source.status === null ? "" : source.status;
  if (status && status !== "all" && AdminPlaceService_STATUSES_.indexOf(status) === -1) throw new Error("VALIDATION_ERROR");
  return {
    keyword: AdminPlaceService_lowerText_(keyword),
    category: category,
    status: status,
    page: AdminPlaceService_requestInteger_(source.page, AdminPlaceService_DEFAULT_PAGE_, null),
    page_size: AdminPlaceService_requestInteger_(source.page_size, AdminPlaceService_DEFAULT_PAGE_SIZE_, AdminPlaceService_MAX_PAGE_SIZE_)
  };
}

function AdminPlaceService_detailParameters_(payload) {
  var source = AdminPlaceService_plainObject_(payload, false);
  AdminPlaceService_assertExactKeys_(source, AdminPlaceService_DETAIL_KEYS_);
  if (Object.keys(source).length !== AdminPlaceService_DETAIL_KEYS_.length) throw new Error("VALIDATION_ERROR");
  if (typeof source.place_id !== "string" || typeof source.view !== "string") throw new Error("VALIDATION_ERROR");
  var placeId = source.place_id;
  var view = source.view;
  if (!AdminPlaceService_validId_(placeId) || (view !== "working" && view !== "published")) {
    throw new Error("VALIDATION_ERROR");
  }
  return { place_id: placeId, view: view };
}

function AdminPlaceService_plainObject_(value, allowMissing) {
  if ((value === undefined || value === null) && allowMissing) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("VALIDATION_ERROR");
  return value;
}

function AdminPlaceService_assertExactKeys_(source, allowed) {
  Object.keys(source).forEach(function (key) {
    if (allowed.indexOf(key) === -1) throw new Error("VALIDATION_ERROR");
  });
}

function AdminPlaceService_requestInteger_(value, defaultValue, maximum) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if ((typeof value !== "number" && typeof value !== "string") || !/^\d+$/.test(String(value))) {
    throw new Error("VALIDATION_ERROR");
  }
  var parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || (maximum !== null && parsed > maximum)) {
    throw new Error("VALIDATION_ERROR");
  }
  return parsed;
}

function AdminPlaceService_projectContent_(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("ADMIN_PLACE_CONTENT");
  var result = {};
  AdminPlaceService_CONTENT_HEADERS_.forEach(function (header) {
    if (header === "tags" || header === "nearby_place_ids" || header === "gallery_media_ids") {
      result[header] = AdminPlaceService_listValue_(source[header], header === "gallery_media_ids");
    } else if (header === "is_featured" || header === "is_main_route_point") {
      result[header] = AdminPlaceService_booleanValue_(source[header]);
    } else if (header === "latitude" || header === "longitude" || header === "sort_order") {
      result[header] = AdminPlaceService_numberValue_(source[header], header);
    } else {
      result[header] = AdminPlaceService_safeText_(source[header]);
    }
  });
  if ((result.latitude === "") !== (result.longitude === "")) throw new Error("ADMIN_PLACE_COORDINATES");
  if (result.latitude !== "" && (result.latitude < -90 || result.latitude > 90 || result.longitude < -180 || result.longitude > 180)) {
    throw new Error("ADMIN_PLACE_COORDINATES");
  }
  if (result.category && AdminPlaceService_CATEGORIES_.indexOf(result.category) === -1) throw new Error("ADMIN_PLACE_CATEGORY");
  return result;
}

function AdminPlaceService_listValue_(value, mediaIds) {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value !== "string") throw new Error("ADMIN_PLACE_LIST");
  var parts = value.split("|").map(function (part) { return part.trim(); });
  if (parts.some(function (part) { return !part; })) throw new Error("ADMIN_PLACE_LIST");
  if (mediaIds && (parts.length > 50 || parts.join("|") !== value)) throw new Error("ADMIN_PLACE_LIST");
  var seen = Object.create(null);
  parts.forEach(function (part) {
    if (Object.prototype.hasOwnProperty.call(seen, part)) throw new Error("ADMIN_PLACE_LIST");
    if (mediaIds && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(part)) throw new Error("ADMIN_PLACE_LIST");
    if (!mediaIds && part.length > 200) throw new Error("ADMIN_PLACE_LIST");
    seen[part] = true;
  });
  return parts;
}

function AdminPlaceService_booleanValue_(value) {
  if (value === true || value === 1 || value === "1" || value === "TRUE" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "FALSE" || value === "false" || value === "") return false;
  throw new Error("ADMIN_PLACE_BOOLEAN");
}

function AdminPlaceService_numberValue_(value, header) {
  if (value === undefined || value === null || value === "") return "";
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") {
    throw new Error("ADMIN_PLACE_NUMBER");
  }
  var parsed = Number(value);
  if (!isFinite(parsed)) throw new Error("ADMIN_PLACE_NUMBER");
  if (header === "sort_order" && (!Number.isSafeInteger(parsed) || parsed < 0)) throw new Error("ADMIN_PLACE_NUMBER");
  return parsed;
}

function AdminPlaceService_displayState_(status, hasDraft) {
  if (status === "published" && hasDraft) return "published_with_draft";
  return status;
}

function AdminPlaceService_storedInteger_(value, positive) {
  var parsed;
  if (typeof value === "number") parsed = value;
  else if (typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value)) parsed = Number(value);
  else throw new Error("ADMIN_PLACE_VERSION");
  if (!Number.isSafeInteger(parsed) || parsed < (positive ? 1 : 0)) throw new Error("ADMIN_PLACE_VERSION");
  return parsed;
}

function AdminPlaceService_validId_(value) {
  return typeof value === "string" && value === value.trim() && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
}

function AdminPlaceService_safeText_(value) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" && typeof value !== "number") throw new Error("ADMIN_PLACE_TEXT");
  var text = String(value).trim();
  if (text.length > 20000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) {
    throw new Error("ADMIN_PLACE_TEXT");
  }
  return text;
}

function AdminPlaceService_lowerText_(value) {
  return AdminPlaceService_safeText_(value).toLocaleLowerCase();
}

function AdminPlaceService_success_(data) {
  return { ok: true, data: data, message: "success" };
}

function AdminPlaceService_error_(code, message) {
  return { ok: false, error: { code: code, message: message } };
}
