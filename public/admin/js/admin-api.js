"use strict";

(function createAdminApiClient(global) {
  const CONTENT_TYPE = "text/plain;charset=utf-8";
  const REQUEST_TIMEOUT_MS = 12000;
  const SAFE_MESSAGE = "Admin API request failed.";
  const BACKEND_ERROR_CODES = Object.freeze([
    "VALIDATION_ERROR",
    "UNAUTHORIZED",
    "RATE_LIMITED",
    "SERVER_ERROR",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT"
  ]);
  const ADMIN_ROLES = Object.freeze(["super_admin", "editor", "reviewer", "viewer"]);
  const ADMIN_ID_PATTERN = /^ADM-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;
  const TOKEN_PATTERN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
  const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const PLACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
  const MEDIA_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const PLACE_STATUSES = Object.freeze(["draft", "published", "archived"]);
  const DISPLAY_STATES = Object.freeze(["draft", "published", "published_with_draft", "archived"]);
  const PLACE_CATEGORIES = Object.freeze([
    "main_point", "community_tourism", "nature", "viewpoint", "lake", "activity", "food_cafe",
    "accommodation", "temple_culture", "product_shop", "waterfall", "cave", "service"
  ]);
  const CONTENT_KEYS = Object.freeze([
    "name_th", "name_en", "slug", "district", "province", "route_group", "category", "sub_category",
    "short_description_th", "short_description_en", "description_th", "description_en", "activities_th", "activities_en",
    "highlight_th", "highlight_en", "address_th", "address_en", "facilities_th", "facilities_en", "phone", "line_url",
    "facebook_url", "website_url", "google_maps_url", "latitude", "longitude", "coordinate_status", "open_time_th",
    "open_time_en", "fee_th", "fee_en", "tags", "recommended_duration", "best_time_th", "best_time_en",
    "nearby_place_ids", "is_featured", "is_main_route_point", "sort_order", "gallery_media_ids"
  ]);
  const TEXT_LIST_KEYS = Object.freeze(["tags", "nearby_place_ids"]);
  const URL_KEYS = Object.freeze(["line_url", "facebook_url", "website_url", "google_maps_url"]);
  const DEPENDENCY_GROUP_KEYS = Object.freeze([
    "routes", "nearby_places", "products", "events", "gallery", "trip_templates", "reviews"
  ]);

  class AdminApiError extends Error {
    constructor(code) {
      super(SAFE_MESSAGE);
      this.name = "AdminApiError";
      this.code = code;
      if (Object.prototype.hasOwnProperty.call(this, "stack")) delete this.stack;
    }
  }

  function safeError(code) {
    return new AdminApiError(code);
  }

  function exactKeys(value, expected) {
    if (!value || Array.isArray(value) || typeof value !== "object") return false;
    const actual = Object.keys(value).sort();
    const wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
  }

  function apiEndpoint() {
    let config = global.APP_CONFIG;
    try {
      if (typeof APP_CONFIG !== "undefined") config = APP_CONFIG;
    } catch (_configError) { /* Use the window property when no lexical binding exists. */ }
    const configured = String(config && config.API_URL || "").trim();
    if (!configured) throw safeError("CONFIG_ERROR");
    try {
      const endpoint = new URL(configured);
      if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") throw new Error("unsupported");
      if (endpoint.username || endpoint.password) throw new Error("credentials");
      return endpoint.toString();
    } catch (_urlError) {
      throw safeError("CONFIG_ERROR");
    }
  }

  function validTimestamp(value) {
    if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) return false;
    try {
      return new Date(value).toISOString() === value;
    } catch (_dateError) {
      return false;
    }
  }

  function validUnicodeLength(value, minimum, maximum) {
    if (typeof value !== "string" || value.length > maximum * 2 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) return false;
    let count = 0;
    for (let index = 0; index < value.length; index += 1) {
      const unit = value.charCodeAt(index);
      if (unit >= 0xD800 && unit <= 0xDBFF) {
        if (index + 1 >= value.length) return false;
        const next = value.charCodeAt(index + 1);
        if (next < 0xDC00 || next > 0xDFFF) return false;
        index += 1;
      } else if (unit >= 0xDC00 && unit <= 0xDFFF) {
        return false;
      }
      count += 1;
      if (count > maximum) return false;
    }
    return count >= minimum;
  }

  function validPlaceText(value, minimum, maximum) {
    return typeof value === "string" && value.length <= maximum && validUnicodeLength(value, minimum, maximum);
  }

  function safeAdmin(value) {
    if (!exactKeys(value, ["admin_id", "username", "display_name", "role"])) return null;
    if (typeof value.admin_id !== "string" || !ADMIN_ID_PATTERN.test(value.admin_id)) return null;
    if (typeof value.username !== "string" || !USERNAME_PATTERN.test(value.username)) return null;
    if (!validUnicodeLength(value.display_name, 1, 100)) return null;
    if (!ADMIN_ROLES.includes(value.role)) return null;
    return {
      admin_id: value.admin_id,
      username: value.username,
      display_name: value.display_name,
      role: value.role
    };
  }

  function validationError() {
    throw safeError("VALIDATION_ERROR");
  }

  function requireToken(token) {
    if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) validationError();
    return token;
  }

  function requestObject(value, allowed, required, allowMissing) {
    const source = (value === undefined || value === null) && allowMissing ? {} : value;
    if (!source || Array.isArray(source) || typeof source !== "object") validationError();
    const keys = Object.keys(source);
    if (keys.some((key) => !allowed.includes(key)) || required.some((key) => !keys.includes(key))) validationError();
    return source;
  }

  function validPlaceId(value) {
    return typeof value === "string" && value === value.trim() && PLACE_ID_PATTERN.test(value);
  }

  function requestInteger(value, maximum) {
    if ((typeof value !== "number" && typeof value !== "string") || !/^[1-9]\d*$/.test(String(value))) validationError();
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || (maximum !== null && parsed > maximum)) validationError();
    return value;
  }

  function safeRequestText(value, maximum) {
    if (!validPlaceText(value, 0, maximum) || value !== value.trim() && maximum <= 200) validationError();
    return value;
  }

  function validUrl(value) {
    if (value === "") return true;
    if (typeof value !== "string" || value !== value.trim() || value.length > 2048 ||
        /[\u0000-\u0020\u007F\\<>"']/.test(value)) return false;
    const parts = /^(https?):\/\/([^/?#]+)([/?#].*)?$/i.exec(value);
    if (!parts || parts[2].includes("@")) return false;
    const authority = /^([^:]+)(?::([0-9]{1,5}))?$/.exec(parts[2]);
    if (!authority) return false;
    const host = authority[1];
    const port = authority[2] || "";
    const label = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?";
    if (host.length > 253 || !(new RegExp(`^${label}(?:\\.${label})*$`)).test(host)) return false;
    return !port || Number(port) >= 1 && Number(port) <= 65535;
  }

  function validRequestList(value, identifiers) {
    if (!Array.isArray(value) || value.length > 100) return false;
    const seen = Object.create(null);
    return value.every((item) => {
      if (typeof item !== "string" || item !== item.trim() || !item || item.length > 200 || item.includes("|") ||
          /[\u0000-\u001F\u007F]/.test(item) ||
          (identifiers && !validPlaceId(item)) || Object.prototype.hasOwnProperty.call(seen, item)) return false;
      seen[item] = true;
      return true;
    });
  }

  function validContent(value, responseMode) {
    if (!exactKeys(value, CONTENT_KEYS)) return false;
    for (const key of CONTENT_KEYS) {
      const field = value[key];
      if (key === "tags") {
        if (!validRequestList(field, false)) return false;
      } else if (key === "nearby_place_ids") {
        if (!validRequestList(field, true)) return false;
      } else if (key === "gallery_media_ids") {
        if (responseMode) {
          if (!Array.isArray(field) || field.length > 50 || field.some((id) => typeof id !== "string" || !MEDIA_ID_PATTERN.test(id)) ||
              new Set(field).size !== field.length) return false;
        } else if (field !== "" && (!Array.isArray(field) || field.length < 1 || field.length > 50 ||
          field.some((id) => typeof id !== "string" || !MEDIA_ID_PATTERN.test(id)) || new Set(field).size !== field.length)) return false;
      } else if (key === "is_featured" || key === "is_main_route_point") {
        if (typeof field !== "boolean") return false;
      } else if (key === "latitude" || key === "longitude") {
        if (field !== "" && (typeof field !== "number" || !Number.isFinite(field))) return false;
      } else if (key === "sort_order") {
        if (field !== "" && (typeof field !== "number" || !Number.isSafeInteger(field) || field < 0)) return false;
      } else if (URL_KEYS.includes(key)) {
        if (!validUrl(field)) return false;
      } else if (!validPlaceText(field, 0, 20000)) return false;
    }
    if ((value.latitude === "") !== (value.longitude === "")) return false;
    if (value.latitude !== "" && (value.latitude < -90 || value.latitude > 90 || value.longitude < -180 || value.longitude > 180)) return false;
    if (value.category && !PLACE_CATEGORIES.includes(value.category)) return false;
    if (value.district && !["ban_ta_khun", "khiri_rat_nikhom", "phanom"].includes(value.district)) return false;
    if (value.route_group && !["main_point_1", "main_point_2", "main_point_3", "main_point_4", "nearby_khiri_rat_nikhom", "nearby_phanom"].includes(value.route_group)) return false;
    if (value.coordinate_status && !["verified", "pending_verify", "needs_survey", "no_coordinate", "approximate"].includes(value.coordinate_status)) return false;
    if (value.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)) return false;
    return true;
  }

  function listPayload(payload) {
    const source = requestObject(payload, ["keyword", "category", "status", "page", "page_size"], [], true);
    const result = {};
    if (Object.prototype.hasOwnProperty.call(source, "keyword")) result.keyword = safeRequestText(source.keyword, 200);
    if (Object.prototype.hasOwnProperty.call(source, "category")) {
      if (typeof source.category !== "string" || source.category && !PLACE_CATEGORIES.includes(source.category)) validationError();
      result.category = source.category;
    }
    if (Object.prototype.hasOwnProperty.call(source, "status")) {
      if (typeof source.status !== "string" || source.status && source.status !== "all" && !PLACE_STATUSES.includes(source.status)) validationError();
      result.status = source.status;
    }
    if (Object.prototype.hasOwnProperty.call(source, "page")) result.page = requestInteger(source.page, null);
    if (Object.prototype.hasOwnProperty.call(source, "page_size")) result.page_size = requestInteger(source.page_size, 100);
    return result;
  }

  function detailPayload(payload) {
    const source = requestObject(payload, ["place_id", "view"], ["place_id", "view"], false);
    if (!validPlaceId(source.place_id) || (source.view !== "working" && source.view !== "published")) validationError();
    return { place_id: source.place_id, view: source.view };
  }

  function mediaPayload(payload) {
    const source = requestObject(payload, ["place_id", "keyword", "role", "page", "page_size"], ["place_id"], false);
    if (!validPlaceId(source.place_id)) validationError();
    const result = { place_id: source.place_id };
    if (Object.prototype.hasOwnProperty.call(source, "keyword")) result.keyword = safeRequestText(source.keyword, 200);
    if (Object.prototype.hasOwnProperty.call(source, "role")) {
      if (!["all", "cover", "gallery"].includes(source.role)) validationError();
      result.role = source.role;
    }
    if (Object.prototype.hasOwnProperty.call(source, "page")) result.page = requestInteger(source.page, null);
    if (Object.prototype.hasOwnProperty.call(source, "page_size")) result.page_size = requestInteger(source.page_size, 100);
    return result;
  }

  function idPayload(payload) {
    const source = requestObject(payload, ["place_id"], ["place_id"], false);
    if (!validPlaceId(source.place_id)) validationError();
    return { place_id: source.place_id };
  }

  function contentPayload(payload, save) {
    const allowed = save ? ["place_id", "expected_version", "content"] : ["content"];
    const source = requestObject(payload, allowed, allowed, false);
    if (!validContent(source.content, false)) validationError();
    if (!save) return { content: source.content };
    if (!validPlaceId(source.place_id) || typeof source.expected_version !== "number" ||
        !Number.isSafeInteger(source.expected_version) || source.expected_version < 1) validationError();
    return { place_id: source.place_id, expected_version: source.expected_version, content: source.content };
  }

  function versionPayload(payload, archive) {
    const keys = archive ? ["place_id", "expected_version", "confirmed"] : ["place_id", "expected_version"];
    const source = requestObject(payload, keys, keys, false);
    if (!validPlaceId(source.place_id) || typeof source.expected_version !== "number" ||
        !Number.isSafeInteger(source.expected_version) || source.expected_version < 1 || (archive && source.confirmed !== true)) {
      validationError();
    }
    const result = { place_id: source.place_id, expected_version: source.expected_version };
    if (archive) result.confirmed = true;
    return result;
  }

  function placeholderMediaPath(value) {
    return typeof value === "string" && /^assets\/media\/placeholders\/(?:hero|cover|product|gallery)\.svg$/.test(value);
  }

  function generatedMediaPath(value) {
    return typeof value === "string" && /^assets\/media\/generated\/[a-z0-9/_-]+\.webp$/i.test(value);
  }

  function safeMediaItem(value, placeId, expectedRole) {
    if (!exactKeys(value, ["media_id", "entity_type", "entity_id", "role", "alt_th", "alt_en", "fallback", "outputs"]) ||
        typeof value.media_id !== "string" || !MEDIA_ID_PATTERN.test(value.media_id) || value.entity_type !== "place" ||
        !validPlaceId(value.entity_id) || (placeId && value.entity_id !== placeId) || !["cover", "gallery"].includes(value.role) ||
        (expectedRole && value.role !== expectedRole) ||
        value.role === "cover" && value.media_id !== `place-${value.entity_id.toLowerCase()}-cover` ||
        !validPlaceText(value.alt_th, 0, 500) || !validPlaceText(value.alt_en, 0, 500) || !placeholderMediaPath(value.fallback) ||
        !Array.isArray(value.outputs) || !value.outputs.length || value.outputs.length > 20) return null;
    const outputs = value.outputs.map((output) => {
      if (!exactKeys(output, ["width", "height", "path"]) || !Number.isSafeInteger(output.width) || output.width < 1 ||
          !Number.isSafeInteger(output.height) || output.height < 1 || !generatedMediaPath(output.path)) return null;
      return { width: output.width, height: output.height, path: output.path };
    });
    if (outputs.some((output) => !output)) return null;
    return {
      media_id: value.media_id, entity_type: value.entity_type, entity_id: value.entity_id, role: value.role,
      alt_th: value.alt_th, alt_en: value.alt_en, fallback: value.fallback, outputs
    };
  }

  function validPagination(data) {
    return Number.isSafeInteger(data.page) && data.page >= 1 && Number.isSafeInteger(data.page_size) && data.page_size >= 1 &&
      data.page_size <= 100 && Number.isSafeInteger(data.total) && data.total >= 0 && Number.isSafeInteger(data.total_pages) &&
      data.total_pages === (data.total ? Math.ceil(data.total / data.page_size) : 0) && data.items.length <= data.page_size;
  }

  function safeList(data) {
    if (!exactKeys(data, ["items", "page", "page_size", "total", "total_pages"]) || !Array.isArray(data.items) || !validPagination(data)) return null;
    const items = data.items.map((item) => {
      if (!exactKeys(item, ["place_id", "name_th", "name_en", "category", "area_summary", "status", "has_active_draft", "display_state", "cover", "created_at", "updated_at"]) ||
          !validPlaceId(item.place_id) || !validPlaceText(item.name_th, 0, 20000) || !validPlaceText(item.name_en, 0, 20000) ||
          typeof item.category !== "string" || item.category && !PLACE_CATEGORIES.includes(item.category) ||
          !exactKeys(item.area_summary, ["district", "province"]) || !validPlaceText(item.area_summary.district, 0, 20000) ||
          !validPlaceText(item.area_summary.province, 0, 20000) || !PLACE_STATUSES.includes(item.status) ||
          typeof item.has_active_draft !== "boolean" || item.status === "draft" && !item.has_active_draft ||
          !DISPLAY_STATES.includes(item.display_state) ||
          item.display_state !== (item.status === "published" && item.has_active_draft ? "published_with_draft" : item.status) ||
          !validTimestamp(item.created_at) || !validTimestamp(item.updated_at)) return null;
      const cover = item.cover === null ? null : safeMediaItem(item.cover, item.place_id, "cover");
      if (item.cover !== null && !cover) return null;
      return { ...item, area_summary: { ...item.area_summary }, cover };
    });
    return items.some((item) => !item) ? null : { items, page: data.page, page_size: data.page_size, total: data.total, total_pages: data.total_pages };
  }

  function safeDetail(data) {
    const keys = ["place_id", "status", "has_active_draft", "display_state", "entity_version", "working_version", "published_version", "content", "media", "capabilities", "created_at", "updated_at"];
    if (!exactKeys(data, keys) || !validPlaceId(data.place_id) || !PLACE_STATUSES.includes(data.status) ||
        typeof data.has_active_draft !== "boolean" || data.status === "draft" && !data.has_active_draft ||
        data.status === "published" && data.published_version === null ||
        data.display_state !== (data.status === "published" && data.has_active_draft ? "published_with_draft" : data.status) ||
        !Number.isSafeInteger(data.entity_version) || data.entity_version < 1 || !Number.isSafeInteger(data.working_version) || data.working_version < 1 ||
        data.working_version !== data.entity_version || (data.published_version !== null && (!Number.isSafeInteger(data.published_version) || data.published_version < 1 || data.published_version > data.entity_version)) ||
        !validContent(data.content, true) || !exactKeys(data.media, ["cover", "gallery"]) || !Array.isArray(data.media.gallery) || data.media.gallery.length > 50 ||
        !exactKeys(data.capabilities, ["can_write", "can_publish", "can_unpublish", "can_archive", "can_restore", "can_view_working", "can_view_published"]) ||
        Object.values(data.capabilities).some((value) => typeof value !== "boolean") || !validTimestamp(data.created_at) || !validTimestamp(data.updated_at)) return null;
    const canWrite = data.capabilities.can_write;
    if (data.capabilities.can_publish !== (canWrite && data.has_active_draft && data.status !== "archived") ||
        data.capabilities.can_unpublish !== (canWrite && data.status === "published") ||
        data.capabilities.can_archive !== (canWrite && data.status !== "archived") ||
        data.capabilities.can_restore !== (canWrite && data.status === "archived") ||
        data.capabilities.can_view_working !== true || data.capabilities.can_view_published !== (data.published_version !== null)) return null;
    const cover = data.media.cover === null ? null : safeMediaItem(data.media.cover, data.place_id, "cover");
    const gallery = data.media.gallery.map((item) => safeMediaItem(item, data.place_id, "gallery"));
    if ((data.media.cover !== null && !cover) || gallery.some((item) => !item)) return null;
    return { ...data, content: { ...data.content }, media: { cover, gallery }, capabilities: { ...data.capabilities } };
  }

  function safeMediaList(data, placeId, role) {
    if (!exactKeys(data, ["items", "page", "page_size", "total", "total_pages"]) || !Array.isArray(data.items) || !validPagination(data)) return null;
    const expectedRole = role === "cover" || role === "gallery" ? role : null;
    const items = data.items.map((item) => safeMediaItem(item, placeId, expectedRole));
    return items.some((item) => !item) ? null : { items, page: data.page, page_size: data.page_size, total: data.total, total_pages: data.total_pages };
  }

  function safeDependencyGroups(source) {
    if (!exactKeys(source, DEPENDENCY_GROUP_KEYS)) return null;
    const groups = {};
    for (const key of DEPENDENCY_GROUP_KEYS) {
      if (!Array.isArray(source[key]) || source[key].length > 10000) return null;
      let prior = "";
      groups[key] = source[key].map((item) => {
        if (!exactKeys(item, ["entity_id", "label"]) || !validPlaceId(item.entity_id) ||
            !validPlaceText(item.label, 1, 20000) || item.label !== item.label.trim() || item.entity_id <= prior) return null;
        prior = item.entity_id;
        return { entity_id: item.entity_id, label: item.label };
      });
      if (groups[key].some((item) => !item)) return null;
    }
    return groups;
  }

  function safeDependencies(data) {
    if (!exactKeys(data, ["place_id", "checked_at", "groups"]) || !validPlaceId(data.place_id) || !validTimestamp(data.checked_at)) return null;
    const groups = safeDependencyGroups(data.groups);
    if (!groups) return null;
    return { place_id: data.place_id, checked_at: data.checked_at, groups };
  }

  function safeWrite(data, action) {
    const keys = ["place_id", "status", "entity_version", "working_version", "published_version", "has_active_draft", "created_at", "updated_at"];
    if (!exactKeys(data, keys) || !validPlaceId(data.place_id) || !PLACE_STATUSES.includes(data.status) ||
        !Number.isSafeInteger(data.entity_version) || data.entity_version < 1 || data.working_version !== data.entity_version ||
        (data.published_version !== null && (!Number.isSafeInteger(data.published_version) || data.published_version < 1 || data.published_version > data.entity_version)) ||
        typeof data.has_active_draft !== "boolean" || !validTimestamp(data.created_at) || !validTimestamp(data.updated_at)) return null;
    const expected = {
      adminCreatePlace: ["draft", true], adminPublishPlace: ["published", false], adminUnpublishPlace: ["draft", true],
      adminArchivePlace: ["archived", null], adminRestorePlace: ["draft", true]
    }[action];
    if (expected && (data.status !== expected[0] || expected[1] !== null && data.has_active_draft !== expected[1])) return null;
    if (action === "adminCreatePlace" && (data.entity_version !== 1 || data.published_version !== null) ||
        action === "adminSavePlaceDraft" && ((!data.has_active_draft || data.status !== "draft" && data.status !== "published") ||
          data.status === "published" && (data.published_version === null || data.published_version >= data.entity_version)) ||
        action === "adminPublishPlace" && data.published_version === null ||
        action === "adminUnpublishPlace" && (data.published_version === null || data.published_version >= data.entity_version)) return null;
    return { ...data };
  }

  function safeArchiveWrite(data) {
    const writeKeys = ["place_id", "status", "entity_version", "working_version", "published_version", "has_active_draft", "created_at", "updated_at"];
    if (!exactKeys(data, [...writeKeys, "dependencies"])) return null;
    const write = safeWrite(Object.fromEntries(writeKeys.map((key) => [key, data[key]])), "adminArchivePlace");
    const dependencies = safeDependencyGroups(data.dependencies);
    return write && dependencies ? { ...write, dependencies } : null;
  }

  function validateSuccess(body, data) {
    const action = body.action;
    const domain = contentDomain(action);
    if (domain) {
      const validated = domain === ROUTE_DOMAIN ? safeRouteResponse(data, body) : safeContentResponse(data, body, domain);
      if (!validated) throw safeError("MALFORMED_RESPONSE");
      return validated;
    }
    if (action === "adminLogin") {
      if (!exactKeys(data, ["admin", "token", "expires_at"])) throw safeError("MALFORMED_RESPONSE");
      const admin = safeAdmin(data.admin);
      if (!admin || typeof data.token !== "string" || !TOKEN_PATTERN.test(data.token) || !validTimestamp(data.expires_at)) {
        throw safeError("MALFORMED_RESPONSE");
      }
      return { admin, token: data.token, expires_at: data.expires_at };
    }
    if (action === "adminValidateSession") {
      if (!exactKeys(data, ["admin", "expires_at"])) throw safeError("MALFORMED_RESPONSE");
      const admin = safeAdmin(data.admin);
      if (!admin || !validTimestamp(data.expires_at)) throw safeError("MALFORMED_RESPONSE");
      return { admin, expires_at: data.expires_at };
    }
    if (action === "adminLogout" && exactKeys(data, [])) return {};
    let validated = null;
    if (action === "adminGetPlaces") validated = safeList(data);
    else if (action === "adminGetPlaceDetail") validated = safeDetail(data);
    else if (action === "adminGetPlaceMediaOptions") validated = safeMediaList(data, body.payload.place_id, body.payload.role);
    else if (action === "adminInspectPlaceDependencies") validated = safeDependencies(data);
    else if (action === "adminArchivePlace") validated = safeArchiveWrite(data);
    else if (["adminCreatePlace", "adminSavePlaceDraft", "adminPublishPlace", "adminUnpublishPlace", "adminRestorePlace"].includes(action)) {
      validated = safeWrite(data, action);
    }
    if (validated) return validated;
    throw safeError("MALFORMED_RESPONSE");
  }

  function parseEnvelope(body, rawText) {
    let result;
    try {
      result = JSON.parse(rawText);
    } catch (_parseError) {
      throw safeError("MALFORMED_RESPONSE");
    }
    if (!result || Array.isArray(result) || typeof result !== "object" || typeof result.ok !== "boolean") {
      throw safeError("MALFORMED_RESPONSE");
    }
    if (result.ok) {
      if (!exactKeys(result, ["ok", "data", "message"]) || typeof result.message !== "string") {
        throw safeError("MALFORMED_RESPONSE");
      }
      return validateSuccess(body, result.data);
    }
    const domain = contentDomain(body.action);
    if (domain && result.error && result.error.code === "OUTCOME_UNKNOWN") {
      if (!exactKeys(result, ["ok", "error"]) || !exactKeys(result.error, ["code", "message", "retryable", domain.id]) ||
          typeof result.error.message !== "string" || result.error.retryable !== false || !validContentId(result.error[domain.id]) ||
          !/^(create|update|delete)/.test(body.action) || body.payload[domain.id] && body.payload[domain.id] !== result.error[domain.id]) throw safeError("MALFORMED_RESPONSE");
      const error = safeError("OUTCOME_UNKNOWN");
      error.retryable = false;
      error[domain.id] = result.error[domain.id];
      throw error;
    }
    if (!exactKeys(result, ["ok", "error"]) || !exactKeys(result.error, ["code", "message"]) ||
        typeof result.error.code !== "string" || !result.error.code || typeof result.error.message !== "string") {
      throw safeError("MALFORMED_RESPONSE");
    }
    const code = BACKEND_ERROR_CODES.includes(result.error.code) || domain && ["INVALID_TRANSITION", "DUPLICATE_ID"].includes(result.error.code) ? result.error.code : "SERVER_ERROR";
    throw safeError(code);
  }

  async function request(body) {
    const endpoint = apiEndpoint();
    const controller = typeof global.AbortController === "function" ? new global.AbortController() : null;
    const timer = controller ? global.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
    const options = {
      method: "POST",
      headers: { "Content-Type": CONTENT_TYPE },
      body: JSON.stringify(body)
    };
    if (controller) options.signal = controller.signal;
    try {
      let response;
      try {
        response = await global.fetch(endpoint, options);
      } catch (error) {
        if (error && error.name === "AbortError") throw safeError("TIMEOUT");
        throw safeError("NETWORK_ERROR");
      }
      if (!response || response.ok !== true) throw safeError("HTTP_ERROR");
      let rawText;
      try {
        rawText = await response.text();
      } catch (error) {
        if (error && error.name === "AbortError") throw safeError("TIMEOUT");
        throw safeError("MALFORMED_RESPONSE");
      }
      return parseEnvelope(body, rawText);
    } finally {
      if (timer !== null) global.clearTimeout(timer);
    }
  }

  function login(username, password) {
    return request({ action: "adminLogin", payload: { username, password } });
  }

  function validateSession(token) {
    return request({ action: "adminValidateSession", token });
  }

  function logout(token) {
    return request({ action: "adminLogout", token });
  }

  function placeRequest(action, token, payload) {
    return request({ action, token: requireToken(token), payload });
  }

  function getPlaces(token, payload) { return placeRequest("adminGetPlaces", token, listPayload(payload)); }
  function getPlaceDetail(token, payload) { return placeRequest("adminGetPlaceDetail", token, detailPayload(payload)); }
  function getPlaceMediaOptions(token, payload) { return placeRequest("adminGetPlaceMediaOptions", token, mediaPayload(payload)); }
  function inspectPlaceDependencies(token, payload) { return placeRequest("adminInspectPlaceDependencies", token, idPayload(payload)); }
  function createPlace(token, payload) { return placeRequest("adminCreatePlace", token, contentPayload(payload, false)); }
  function savePlaceDraft(token, payload) { return placeRequest("adminSavePlaceDraft", token, contentPayload(payload, true)); }
  function publishPlace(token, payload) { return placeRequest("adminPublishPlace", token, versionPayload(payload, false)); }
  function unpublishPlace(token, payload) { return placeRequest("adminUnpublishPlace", token, versionPayload(payload, false)); }
  function archivePlace(token, payload) { return placeRequest("adminArchivePlace", token, versionPayload(payload, true)); }
  function restorePlace(token, payload) { return placeRequest("adminRestorePlace", token, versionPayload(payload, false)); }

  const PRODUCT_DOMAIN = Object.freeze({ id: "product_id", title: "name_th", category: "category",
    fields: "name_th name_en category producer_name related_place_id district description_th description_en price_range phone contact_url google_maps_url latitude longitude image_url tags is_featured sort_order".split(" "),
    required: ["name_th", "description_th", "category"], categories: "food souvenir herbal honey handicraft fruit community_activity tourism_service accommodation transport".split(" ") });
  const EVENT_DOMAIN = Object.freeze({ id: "event_id", title: "title_th", category: "event_type",
    fields: "title_th title_en event_type event_date start_time end_time location_th location_en related_place_id description_th description_en image_url contact_name contact_phone register_url google_maps_url latitude longitude is_featured".split(" "),
    required: ["title_th", "description_th", "location_th", "event_type", "event_date"], categories: "launch festival community_market learning seasonal otop tourism other".split(" ") });
  const ROUTE_DOMAIN = Object.freeze({ id: "route_id" });
  const CONTENT_STATUSES = ["draft", "published", "hidden", "archived", "deleted"];
  function contentDomain(action) {
    if (["adminGetProducts", "adminGetProductDetail", "createProduct", "updateProduct", "deleteProduct"].includes(action)) return PRODUCT_DOMAIN;
    if (["adminGetEvents", "adminGetEventDetail", "createEvent", "updateEvent", "deleteEvent"].includes(action)) return EVENT_DOMAIN;
    if (["adminGetRoutes", "adminGetRouteDetail", "createRoute", "updateRoute", "deleteRoute"].includes(action)) return ROUTE_DOMAIN;
    return null;
  }
  function validContentTimestamp(value) {
    if (value === "" || validTimestamp(value)) return true;
    const match = /^(\d{4})-(\d{2})-(\d{2}) ([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.exec(value);
    if (!match || match[1] === "0000") return false;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
  }
  function validContentId(value) { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value); }
  function validRevision(value) { return typeof value === "string" && /^r1-[a-f0-9]{64}$/.test(value); }
  function contentText(value, maximum = 20000) {
    if (!validPlaceText(value, 0, maximum) || /^[=+@\-']/.test(value.trim())) validationError();
    return value.trim();
  }
  function contentUrl(value) {
    const text = contentText(value, 2048);
    if (!text) return text;
    if (!validUrl(text) || /\s|%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(text)) validationError();
    const host = /^https?:\/\/([^/?#]+)/i.exec(text)[1].replace(/:[0-9]+$/, "");
    const labels = host.split(".");
    if (labels.length < 2 || (/^[0-9.]+$/.test(host) ? labels.length !== 4 || labels.some(label => !/^(?:0|[1-9][0-9]{0,2})$/.test(label) || Number(label) > 255) : !/^[a-z]/i.test(labels[labels.length - 1]))) validationError();
    return text;
  }
  function contentFields(source, domain, complete) {
    const result = {};
    for (const key of domain.fields) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        if (complete) result[key] = key === "is_featured" ? false : "";
        continue;
      }
      const value = source[key];
      if (key === "is_featured") { if (typeof value !== "boolean") validationError(); result[key] = value; }
      else if (["latitude", "longitude", "sort_order"].includes(key)) {
        if (value !== "" && (typeof value !== "number" || !Number.isFinite(value) ||
          (key === "sort_order" ? !Number.isSafeInteger(value) || value < 0 : Math.abs(value) > (key === "latitude" ? 90 : 180)))) validationError();
        result[key] = value;
      } else result[key] = key.endsWith("_url") ? contentUrl(value) : contentText(value);
      if (domain.required.includes(key) && !result[key]) validationError();
      if (key === domain.category && !domain.categories.includes(result[key])) validationError();
      if (key === "district" && !["", "ban_ta_khun", "khiri_rat_nikhom", "phanom"].includes(result[key])) validationError();
      if (key === "related_place_id" && result[key] && !validContentId(result[key])) validationError();
      if (key === "event_date") {
        const date = result[key];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000") || !validTimestamp(date + "T00:00:00.000Z")) validationError();
      }
      if (["start_time", "end_time"].includes(key) && result[key] && !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(result[key])) validationError();
      if (key === "tags" && result[key]) {
        const tags = result[key].split("|").map(tag => contentText(tag, 200));
        if (tags.length > 100 || tags.some((tag, index) => !tag || tags.indexOf(tag) !== index)) validationError();
        result[key] = tags.join("|");
      }
    }
    if (complete && domain.required.some(key => !result[key])) validationError();
    if ("latitude" in result && "longitude" in result && (result.latitude === "") !== (result.longitude === "")) validationError();
    if ("start_time" in result && "end_time" in result && result.end_time && (!result.start_time || result.end_time <= result.start_time)) validationError();
    return result;
  }
  function contentRequestPayload(payload, domain, operation) {
    if (operation === "list") {
      const source = requestObject(payload === undefined ? {} : payload, ["keyword", "status", "page", "page_size", domain.category], [], false), result = {};
      for (const key of Object.keys(source)) {
        const value = source[key];
        if (["page", "page_size"].includes(key)) { if (!Number.isSafeInteger(value) || value < 1 || value > (key === "page" ? 1000000 : 100)) validationError(); result[key] = value; }
        else { result[key] = contentText(value, key === "keyword" ? 200 : 20000); if (key === "status" && result[key] && !CONTENT_STATUSES.includes(result[key]) || key === domain.category && result[key] && !domain.categories.includes(result[key])) validationError(); }
      }
      return result;
    }
    const keys = operation === "detail" ? [domain.id] : operation === "delete" ? [domain.id, "expected_revision"] : operation === "create" ? domain.fields : [domain.id, "expected_revision", "status", ...domain.fields];
    const required = operation === "create" ? domain.required : operation === "detail" ? [domain.id] : [domain.id, "expected_revision"];
    const source = requestObject(payload, keys, required, false), result = {};
    if (operation !== "create") { if (!validContentId(source[domain.id])) validationError(); result[domain.id] = source[domain.id]; }
    if (["update", "delete"].includes(operation)) { if (!validRevision(source.expected_revision)) validationError(); result.expected_revision = source.expected_revision; }
    if (operation === "update" && Object.keys(source).length < 3) validationError();
    if (Object.prototype.hasOwnProperty.call(source, "status")) { if (!CONTENT_STATUSES.includes(source.status)) validationError(); result.status = source.status; }
    if (["create", "update"].includes(operation)) {
      contentFields(source, domain, operation === "create");
      Object.assign(result, contentFields(source, domain, false));
    }
    return result;
  }
  function safeContentResponse(data, body, domain) {
    if (body.action === "adminGetProducts" || body.action === "adminGetEvents") {
      if (!exactKeys(data, ["items", "page", "page_size", "total", "total_pages"]) || !Array.isArray(data.items) || !validPagination(data) || data.page > 1000000) return null;
      const items = data.items.map(item => safeContentRecord(item, domain, false, false));
      if (items.some(item => !item) || new Set(items.map(item => item[domain.id])).size !== items.length) return null;
      return { items, total: data.total, page: data.page, page_size: data.page_size, total_pages: data.total_pages };
    }
    const detail = body.action.includes("Detail"), result = safeContentRecord(data, domain, detail, !detail);
    if (!result || body.payload[domain.id] && result[domain.id] !== body.payload[domain.id]) return null;
    if (body.action.startsWith("create") && result.status !== "draft" || body.action.startsWith("delete") && result.status !== "deleted" || body.payload.status && result.status !== body.payload.status) return null;
    return result;
  }
  function safeContentRecord(data, domain, detail, mutation) {
    const keys = [domain.id, "status", "revision", "created_at", "updated_at", ...(detail ? ["content"] : [domain.title, domain.category]), ...(mutation ? ["audit_status"] : [])];
    if (!exactKeys(data, keys) || !validContentId(data[domain.id]) || !CONTENT_STATUSES.includes(data.status) || !validRevision(data.revision) ||
        ![data.created_at, data.updated_at].every(validContentTimestamp) || mutation && !["recorded", "unconfirmed"].includes(data.audit_status)) return null;
    // Stored legacy content can be invalid for publishing. Preserve safely typed values for repair.
    if (detail) {
      if (!exactKeys(data.content, domain.fields)) return null;
      for (const key of domain.fields) {
        const value = data.content[key];
        if (key === "is_featured" ? typeof value !== "boolean" : ["latitude", "longitude", "sort_order"].includes(key) ? value !== "" && (typeof value !== "number" || !Number.isFinite(value)) : !validPlaceText(value, 0, 20000)) return null;
      }
      return { ...data, content: { ...data.content } };
    }
    if (!validPlaceText(data[domain.title], 0, 20000) || !validPlaceText(data[domain.category], 0, 20000)) return null;
    return { ...data };
  }
  const ROUTE_CONTENT_FIELDS = "name_th name_en slug short_description_th short_description_en description_th description_en duration travel_style cover_image_url map_focus_lat map_focus_lng is_featured sort_order".split(" ");
  const ROUTE_REQUIRED_FIELDS = ["name_th", "short_description_th", "description_th"];
  const ROUTE_STOP_FIELDS = "route_place_id place_id day_number stop_order start_time end_time note_th note_en status".split(" ");
  function routeContent(source, responseMode) {
    if (!exactKeys(source, ROUTE_CONTENT_FIELDS)) {
      if (responseMode) return null;
      validationError();
    }
    const result = {};
    for (const key of ROUTE_CONTENT_FIELDS) {
      const value = source[key];
      if (key === "is_featured") {
        if (responseMode && value === "") result[key] = false;
        else {
          if (typeof value !== "boolean") { if (responseMode) return null; validationError(); }
          result[key] = value;
        }
      } else if (["map_focus_lat", "map_focus_lng", "sort_order"].includes(key)) {
        if (value !== "" && (typeof value !== "number" || !Number.isFinite(value))) { if (responseMode) return null; validationError(); }
        if (!responseMode && value !== "" && (key === "sort_order" ? !Number.isSafeInteger(value) || value < 0 : Math.abs(value) > (key === "map_focus_lat" ? 90 : 180))) validationError();
        result[key] = value;
      } else if (responseMode) {
        if (!validPlaceText(value, 0, 20000)) return null;
        result[key] = value;
      } else {
        result[key] = key === "cover_image_url" ? contentUrl(value) : contentText(value, key === "slug" ? 200 : key === "travel_style" ? 500 : 20000);
      }
    }
    if (!responseMode) {
      if (ROUTE_REQUIRED_FIELDS.some(key => !result[key])) validationError();
      if ((result.map_focus_lat === "") !== (result.map_focus_lng === "")) validationError();
      if (result.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.slug)) validationError();
      if (result.travel_style) {
        const styles = result.travel_style.split("|");
        if (styles.some((style, index) => !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(style) || styles.indexOf(style) !== index)) validationError();
        result.travel_style = styles.join("|");
      }
    }
    return result;
  }
  function routeStops(source, routeStatus, responseMode) {
    if (!Array.isArray(source) || source.length > 100) { if (responseMode) return null; validationError(); }
    const placeIds = new Set(), relationIds = new Set(), result = [];
    for (let index = 0; index < source.length; index += 1) {
      const stop = source[index];
      if (!stop || Array.isArray(stop) || typeof stop !== "object" || Object.keys(stop).some(key => !ROUTE_STOP_FIELDS.includes(key)) ||
          !Object.prototype.hasOwnProperty.call(stop, "place_id")) { if (responseMode) return null; validationError(); }
      if (responseMode && !exactKeys(stop, ROUTE_STOP_FIELDS)) return null;
      const relationId = Object.prototype.hasOwnProperty.call(stop, "route_place_id") ? stop.route_place_id : "";
      if (relationId !== "" && !validContentId(relationId) || !validContentId(stop.place_id) || placeIds.has(stop.place_id) || relationId && relationIds.has(relationId)) {
        if (responseMode) return null; validationError();
      }
      const dayNumber = Object.prototype.hasOwnProperty.call(stop, "day_number") ? stop.day_number : "";
      const suppliedOrder = Object.prototype.hasOwnProperty.call(stop, "stop_order") ? stop.stop_order : index + 1;
      if (dayNumber !== "" && (!Number.isSafeInteger(dayNumber) || dayNumber < 1) || !Number.isSafeInteger(suppliedOrder) || suppliedOrder !== index + 1) {
        if (responseMode) return null; validationError();
      }
      const startTime = Object.prototype.hasOwnProperty.call(stop, "start_time") ? stop.start_time : "";
      const endTime = Object.prototype.hasOwnProperty.call(stop, "end_time") ? stop.end_time : "";
      if (typeof startTime !== "string" || startTime && !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(startTime) ||
          typeof endTime !== "string" || endTime && !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(endTime) || endTime && (!startTime || endTime <= startTime)) {
        if (responseMode) return null; validationError();
      }
      const status = Object.prototype.hasOwnProperty.call(stop, "status") ? stop.status : undefined;
      if (status !== undefined && (!CONTENT_STATUSES.includes(status) || routeStatus && status !== routeStatus)) { if (responseMode) return null; validationError(); }
      const normalized = { ...stop, route_place_id: relationId, day_number: dayNumber, stop_order: index + 1, start_time: startTime, end_time: endTime };
      for (const key of ["note_th", "note_en"]) {
        const value = Object.prototype.hasOwnProperty.call(stop, key) ? stop[key] : "";
        if (responseMode ? !validPlaceText(value, 0, 20000) : false) return null;
        normalized[key] = responseMode ? value : contentText(value);
      }
      if (responseMode) normalized.status = status;
      placeIds.add(stop.place_id);
      if (relationId) relationIds.add(relationId);
      result.push(normalized);
    }
    return result;
  }
  function routeRequestPayload(payload, operation) {
    if (operation === "list") {
      const source = requestObject(payload === undefined ? {} : payload, ["keyword", "status", "page", "page_size"], [], false), result = {};
      for (const key of Object.keys(source)) {
        const value = source[key];
        if (key === "page" || key === "page_size") {
          if (!Number.isSafeInteger(value) || value < 1 || value > (key === "page" ? 1000000 : 100)) validationError();
          result[key] = value;
        } else {
          result[key] = contentText(value, key === "keyword" ? 200 : 20000);
          if (key === "status" && result[key] && !CONTENT_STATUSES.includes(result[key])) validationError();
        }
      }
      return result;
    }
    const allowed = operation === "detail" ? ["route_id"] : operation === "delete" ? ["route_id", "expected_revision"] : operation === "create" ? ["content", "stops", "status"] : ["route_id", "expected_revision", "content", "stops", "status"];
    const required = operation === "detail" ? ["route_id"] : operation === "delete" ? ["route_id", "expected_revision"] : operation === "create" ? ["content"] : ["route_id", "expected_revision"];
    const source = requestObject(payload, allowed, required, false), result = {};
    if (operation !== "create") { if (!validContentId(source.route_id)) validationError(); result.route_id = source.route_id; }
    if (operation === "detail") return result;
    if (operation === "delete" || operation === "update") { if (!validRevision(source.expected_revision)) validationError(); result.expected_revision = source.expected_revision; }
    if (operation === "update" && !["content", "stops", "status"].some(key => Object.prototype.hasOwnProperty.call(source, key))) validationError();
    if (Object.prototype.hasOwnProperty.call(source, "status")) {
      if (!CONTENT_STATUSES.includes(source.status) || operation === "create" && !["draft", "published"].includes(source.status)) validationError();
      result.status = source.status;
    }
    if (Object.prototype.hasOwnProperty.call(source, "content")) result.content = routeContent(source.content, false);
    if (operation === "create" || Object.prototype.hasOwnProperty.call(source, "stops")) result.stops = routeStops(Object.prototype.hasOwnProperty.call(source, "stops") ? source.stops : [], operation === "create" ? source.status || "draft" : source.status || "", false);
    return result;
  }
  function safeRouteRecord(data, detail, mutation) {
    const keys = ["route_id", "status", "revision", "created_at", "updated_at", ...(detail ? ["content", "stops"] : ["name_th", "travel_style"]), ...(mutation ? ["audit_status"] : [])];
    if (!exactKeys(data, keys) || !validContentId(data.route_id) || !CONTENT_STATUSES.includes(data.status) || !validRevision(data.revision) ||
        ![data.created_at, data.updated_at].every(validContentTimestamp) || mutation && !["recorded", "unconfirmed"].includes(data.audit_status)) return null;
    if (!detail) return validPlaceText(data.name_th, 0, 20000) && validPlaceText(data.travel_style, 0, 20000) ? { ...data } : null;
    const content = routeContent(data.content, true), stops = routeStops(data.stops, data.status, true);
    return content && stops ? { ...data, content, stops } : null;
  }
  function safeRouteResponse(data, body) {
    if (body.action === "adminGetRoutes") {
      if (!exactKeys(data, ["items", "page", "page_size", "total", "total_pages"]) || !Array.isArray(data.items) || !validPagination(data) || data.page > 1000000) return null;
      const items = data.items.map(item => safeRouteRecord(item, false, false));
      if (items.some(item => !item) || new Set(items.map(item => item.route_id)).size !== items.length) return null;
      return { items, page: data.page, page_size: data.page_size, total: data.total, total_pages: data.total_pages };
    }
    const detail = body.action === "adminGetRouteDetail", result = safeRouteRecord(data, detail, !detail);
    if (!result || body.payload.route_id && result.route_id !== body.payload.route_id) return null;
    if (body.action === "createRoute" && result.status !== (body.payload.status || "draft") || body.action === "deleteRoute" && result.status !== "deleted" || body.action === "updateRoute" && body.payload.status && result.status !== body.payload.status) return null;
    return result;
  }
  function getProducts(token, payload) { return placeRequest("adminGetProducts", token, contentRequestPayload(payload, PRODUCT_DOMAIN, "list")); }
  function getProductDetail(token, payload) { return placeRequest("adminGetProductDetail", token, contentRequestPayload(payload, PRODUCT_DOMAIN, "detail")); }
  function createProduct(token, payload) { return placeRequest("createProduct", token, contentRequestPayload(payload, PRODUCT_DOMAIN, "create")); }
  function updateProduct(token, payload) { return placeRequest("updateProduct", token, contentRequestPayload(payload, PRODUCT_DOMAIN, "update")); }
  function deleteProduct(token, payload) { return placeRequest("deleteProduct", token, contentRequestPayload(payload, PRODUCT_DOMAIN, "delete")); }
  function getEvents(token, payload) { return placeRequest("adminGetEvents", token, contentRequestPayload(payload, EVENT_DOMAIN, "list")); }
  function getEventDetail(token, payload) { return placeRequest("adminGetEventDetail", token, contentRequestPayload(payload, EVENT_DOMAIN, "detail")); }
  function createEvent(token, payload) { return placeRequest("createEvent", token, contentRequestPayload(payload, EVENT_DOMAIN, "create")); }
  function updateEvent(token, payload) { return placeRequest("updateEvent", token, contentRequestPayload(payload, EVENT_DOMAIN, "update")); }
  function deleteEvent(token, payload) { return placeRequest("deleteEvent", token, contentRequestPayload(payload, EVENT_DOMAIN, "delete")); }
  function getRoutes(token, payload) { return placeRequest("adminGetRoutes", token, routeRequestPayload(payload, "list")); }
  function getRouteDetail(token, payload) { return placeRequest("adminGetRouteDetail", token, routeRequestPayload(payload, "detail")); }
  function createRoute(token, payload) { return placeRequest("createRoute", token, routeRequestPayload(payload, "create")); }
  function updateRoute(token, payload) { return placeRequest("updateRoute", token, routeRequestPayload(payload, "update")); }
  function deleteRoute(token, payload) { return placeRequest("deleteRoute", token, routeRequestPayload(payload, "delete")); }

  global.TakhunAdminApi = Object.freeze({
    login, validateSession, logout, getPlaces, getPlaceDetail, getPlaceMediaOptions, inspectPlaceDependencies,
    createPlace, savePlaceDraft, publishPlace, unpublishPlace, archivePlace, restorePlace,
    getProducts, getProductDetail, createProduct, updateProduct, deleteProduct,
    getEvents, getEventDetail, createEvent, updateEvent, deleteEvent,
    getRoutes, getRouteDetail, createRoute, updateRoute, deleteRoute
  });
})(window);
