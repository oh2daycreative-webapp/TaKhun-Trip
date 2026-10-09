// M8 PR2 Phase A1 - Admin Routes aggregate CMS backend.
//
// IMPORTANT: This service deliberately does not reuse AdminContentService_write_.
// A Route is an aggregate (routes + route_places), so its optimistic revision
// must cover the parent row and the ordered active child rows.
//
// This first Phase A1 slice defines the public Admin service contract,
// validation/canonicalization, aggregate revision, lifecycle and projections.
// The mutation writer is added in the next controlled slice after these
// contracts pass tests.

var AdminRouteService_STATUSES_ = ["draft", "published", "hidden", "archived", "deleted"];
var AdminRouteService_TRANSITIONS_ = {
  draft: ["published", "archived", "deleted"],
  published: ["hidden", "archived", "deleted"],
  hidden: ["draft", "published", "archived", "deleted"],
  archived: ["draft", "deleted"],
  deleted: ["draft"]
};

var AdminRouteService_ROUTE_FIELDS_ = [
  "name_th", "name_en", "slug", "short_description_th", "short_description_en",
  "description_th", "description_en", "duration", "travel_style",
  "cover_image_url", "map_focus_lat", "map_focus_lng", "is_featured", "sort_order"
];

var AdminRouteService_ROUTE_HEADERS_ = ["route_id"].concat(
  AdminRouteService_ROUTE_FIELDS_,
  ["status", "created_at", "updated_at"]
);

var AdminRouteService_STOP_FIELDS_ = [
  "route_place_id", "place_id", "day_number", "stop_order",
  "start_time", "end_time", "note_th", "note_en", "status"
];

var AdminRouteService_STOP_HEADERS_ = [
  "route_place_id", "route_id", "place_id", "day_number", "stop_order",
  "start_time", "end_time", "note_th", "note_en", "status"
];

function AdminRouteService_auth_(token, write) {
  var admin = AuthService_requireAdmin_(token);
  if (!admin || ["super_admin", "editor", "reviewer", "viewer"].indexOf(admin.role) < 0) {
    throw new Error("FORBIDDEN");
  }
  if (write && ["super_admin", "editor"].indexOf(admin.role) < 0) {
    throw new Error("FORBIDDEN");
  }
  return admin;
}

function AdminRouteService_object_(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.prototype.toString.call(value) !== "[object Object]") {
    throw new Error("VALIDATION_ERROR");
  }
  Object.keys(value).forEach(function (key) {
    if (allowed.indexOf(key) < 0) throw new Error("VALIDATION_ERROR");
  });
  return value;
}

function AdminRouteService_id_(value) {
  if (typeof value !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value)) {
    throw new Error("VALIDATION_ERROR");
  }
  return value;
}

function AdminRouteService_revisionInput_(value) {
  if (typeof value !== "string" || !/^r1-[a-f0-9]{64}$/.test(value)) {
    throw new Error("VALIDATION_ERROR");
  }
  return value;
}

function AdminRouteService_text_(value, limit) {
  if (
    typeof value !== "string" ||
    value.length > (limit || 20000) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  ) {
    throw new Error("VALIDATION_ERROR");
  }

  var text = value.trim();

  // Reject formula-like human text because public readers do not
  // perform a spreadsheet-unescape step.
  if (/^[=+@\-']/.test(text)) {
    throw new Error("VALIDATION_ERROR");
  }

  try {
    CryptoService_utf8Bytes_(text);
  } catch (_invalidUnicode) {
    throw new Error("VALIDATION_ERROR");
  }

  return text;
}

function AdminRouteService_url_(value) {
  var text = AdminRouteService_text_(value, 2048);
  if (!text) return "";

  if (
    /[\s\\<>"']/.test(text) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(text)
  ) {
    throw new Error("VALIDATION_ERROR");
  }

  var match = /^https?:\/\/([^/?#]+)(?:[/?#].*)?$/i.exec(text);

  if (
    !match ||
    match[1].indexOf("@") >= 0 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?::[0-9]{1,5})?$/i.test(match[1])
  ) {
    throw new Error("VALIDATION_ERROR");
  }

  var port = /:([0-9]+)$/.exec(match[1]);

  if (
    port &&
    (Number(port[1]) < 1 || Number(port[1]) > 65535)
  ) {
    throw new Error("VALIDATION_ERROR");
  }

  var host = match[1].replace(/:[0-9]+$/, "");
  var labels = host.split(".");

  if (/^[0-9.]+$/.test(host)) {
    if (
      labels.length !== 4 ||
      labels.some(function (label) {
        return (
          !/^(?:0|[1-9][0-9]{0,2})$/.test(label) ||
          Number(label) > 255
        );
      })
    ) {
      throw new Error("VALIDATION_ERROR");
    }
  } else if (!/^[a-z]/i.test(labels[labels.length - 1])) {
    throw new Error("VALIDATION_ERROR");
  }

  return text;
}

function AdminRouteService_optionalNumber_(value, min, max, integer) {
  if (value === "") return "";
  if (typeof value !== "number" || !isFinite(value) ||
      (integer && !Number.isSafeInteger(value)) ||
      (min !== null && value < min) || (max !== null && value > max)) {
    throw new Error("VALIDATION_ERROR");
  }
  return value;
}

function AdminRouteService_travelStyle_(value) {
  var text = AdminRouteService_text_(value, 500);
  if (!text) return "";

  var styles = text.split("|");
  var seen = {};

  for (var i = 0; i < styles.length; i += 1) {
    var style = styles[i];

    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(style) || seen[style]) {
      throw new Error("VALIDATION_ERROR");
    }

    seen[style] = true;
  }

  return styles.join("|");
}

function AdminRouteService_time_(value) {
  var text = AdminRouteService_text_(value, 5);
  if (text && !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
    throw new Error("VALIDATION_ERROR");
  }
  return text;
}

function AdminRouteService_routeContent_(source, complete) {
  source = AdminRouteService_object_(
    source,
    AdminRouteService_ROUTE_FIELDS_
  );

  var result = {};

  AdminRouteService_ROUTE_FIELDS_.forEach(function (field) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) {
      if (complete) {
        result[field] = field === "is_featured" ? false : "";
      }
      return;
    }

    var value = source[field];

    if (field === "is_featured") {
      if (typeof value !== "boolean") {
        throw new Error("VALIDATION_ERROR");
      }
      result[field] = value;

    } else if (field === "map_focus_lat") {
      result[field] = AdminRouteService_optionalNumber_(
        value,
        -90,
        90,
        false
      );

    } else if (field === "map_focus_lng") {
      result[field] = AdminRouteService_optionalNumber_(
        value,
        -180,
        180,
        false
      );

    } else if (field === "sort_order") {
      result[field] = AdminRouteService_optionalNumber_(
        value,
        0,
        null,
        true
      );

    } else if (field === "cover_image_url") {
      result[field] = AdminRouteService_url_(value);

    } else if (field === "travel_style") {
      result[field] = AdminRouteService_travelStyle_(value);

    } else {
      result[field] = AdminRouteService_text_(
        value,
        field === "slug" ? 200 : 20000
      );
    }
  });

  if (
    complete &&
    (
      !result.name_th ||
      !result.short_description_th ||
      !result.description_th
    )
  ) {
    throw new Error("VALIDATION_ERROR");
  }

  if (
    result.slug &&
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.slug)
  ) {
    throw new Error("VALIDATION_ERROR");
  }

  if (
    Object.prototype.hasOwnProperty.call(result, "map_focus_lat") &&
    Object.prototype.hasOwnProperty.call(result, "map_focus_lng") &&
    (
      (result.map_focus_lat === "") !==
      (result.map_focus_lng === "")
    )
  ) {
    throw new Error("VALIDATION_ERROR");
  }

  return result;
}

function AdminRouteService_stop_(source, index, status) {
  AdminRouteService_object_(source, AdminRouteService_STOP_FIELDS_);
  var result = {
    route_place_id: source.route_place_id ? AdminRouteService_id_(source.route_place_id) : "",
    place_id: AdminRouteService_id_(source.place_id),
    day_number: source.day_number === undefined ? "" :
      AdminRouteService_optionalNumber_(source.day_number, 1, null, true),
    stop_order: index + 1,
    start_time: source.start_time === undefined ? "" : AdminRouteService_time_(source.start_time),
    end_time: source.end_time === undefined ? "" : AdminRouteService_time_(source.end_time),
    note_th: source.note_th === undefined ? "" : AdminRouteService_text_(source.note_th, 20000),
    note_en: source.note_en === undefined ? "" : AdminRouteService_text_(source.note_en, 20000),
    status: status
  };
  if (source.stop_order !== undefined && source.stop_order !== index + 1) {
    throw new Error("VALIDATION_ERROR");
  }
  if (source.status !== undefined && source.status !== status) {
    throw new Error("VALIDATION_ERROR");
  }
  if (result.end_time && (!result.start_time || result.end_time <= result.start_time)) {
    throw new Error("VALIDATION_ERROR");
  }
  return result;
}

function AdminRouteService_stops_(value, status) {
  if (!Array.isArray(value) || value.length > 100) throw new Error("VALIDATION_ERROR");
  var placeIds = Object.create(null);
  var relationIds = Object.create(null);
  return value.map(function (source, index) {
    var stop = AdminRouteService_stop_(source, index, status);
    if (placeIds[stop.place_id]) throw new Error("VALIDATION_ERROR");
    placeIds[stop.place_id] = true;
    if (stop.route_place_id) {
      if (relationIds[stop.route_place_id]) throw new Error("VALIDATION_ERROR");
      relationIds[stop.route_place_id] = true;
    }
    return stop;
  });
}

function AdminRouteService_revisionValue_(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "boolean" ||
      (typeof value === "number" && isFinite(value))) return value;
  throw new Error("ROUTE_SCHEMA");
}

function AdminRouteService_revision_(route, stops) {
  var canonical = ["route", 1];
  ["route_id"].concat(AdminRouteService_ROUTE_FIELDS_, ["status"]).forEach(function (field) {
    canonical.push(["route", field, typeof route[field],
      AdminRouteService_revisionValue_(route[field])]);
  });
  stops.forEach(function (entry) {
    var row = entry.values || entry;
    AdminRouteService_STOP_HEADERS_.forEach(function (field) {
      canonical.push(["stop", field, typeof row[field],
        AdminRouteService_revisionValue_(row[field])]);
    });
  });
  return "r1-" + CryptoService_sha256_(
    CryptoService_utf8Bytes_(JSON.stringify(canonical))
  ).map(function (byte) {
    return ("0" + (byte & 255).toString(16)).slice(-2);
  }).join("");
}

function AdminRouteService_validatePlaces_(stops, routeStatus) {
  var table = SheetService_readTable_("places", ["place_id", "status"]);
  var byId = Object.create(null);
  table.rows.forEach(function (entry) {
    var id = entry.values.place_id;
    if (!id || byId[id] !== undefined) throw new Error("ROUTE_SCHEMA");
    byId[id] = entry.values.status;
  });
  stops.forEach(function (stop) {
    var status = byId[stop.place_id];
    if (!status || status === "archived" || status === "deleted") {
      throw new Error("VALIDATION_ERROR");
    }
    if (routeStatus === "published" && status !== "published") {
      throw new Error("VALIDATION_ERROR");
    }
  });
}

function AdminRouteService_timestamp_(value) {
  return value instanceof Date ? value.toISOString() :
    typeof value === "string" ? value : "";
}

function AdminRouteService_projection_(route, stops, detail) {
  var result = {
    route_id: route.route_id,
    status: route.status,
    revision: AdminRouteService_revision_(route, stops),
    created_at: AdminRouteService_timestamp_(route.created_at),
    updated_at: AdminRouteService_timestamp_(route.updated_at)
  };
  if (detail) {
    result.content = {};
    AdminRouteService_ROUTE_FIELDS_.forEach(function (field) {
      result.content[field] = route[field] instanceof Date ?
        route[field].toISOString() : route[field];
    });
    result.stops = stops.map(function (entry) {
      var row = entry.values || entry;
      var stop = {};
      AdminRouteService_STOP_FIELDS_.forEach(function (field) {
        stop[field] = row[field] instanceof Date ? row[field].toISOString() : row[field];
      });
      return stop;
    });
  } else {
    result.name_th = route.name_th;
    result.travel_style = route.travel_style;
  }
  return result;
}

function AdminRouteService_execute_(token, write, operation) {
  var lock = null;
  var acquired = false;

  try {
    var admin = AdminRouteService_auth_(token, write);

    if (write) {
      lock = LockService.getScriptLock();

      if (!lock.tryLock(10000)) {
        throw new Error("CONTENT_LOCK");
      }

      acquired = true;

      // Re-authenticate after acquiring the write lock.
      admin = AdminRouteService_auth_(token, true);
    }

    return {
      ok: true,
      data: operation(admin),
      message: "success"
    };

  } catch (error) {
    var messages = {
      UNAUTHORIZED: "Sign in to continue.",
      FORBIDDEN: "This role cannot perform this action.",
      VALIDATION_ERROR: "Invalid request data.",
      NOT_FOUND: "Record not found.",
      CONFLICT: "Content changed. Reload before editing.",
      DUPLICATE_ID: "Identifier already exists.",
      INVALID_TRANSITION: "This lifecycle change is not permitted.",
      CONTENT_LOCK: "Content is busy. Try again.",
      OUTCOME_UNKNOWN:
        "The result is uncertain. Reload and reconcile; do not retry automatically."
    };

    var code = error && error.message;

    if (!Object.prototype.hasOwnProperty.call(messages, code)) {
      code = "SERVER_ERROR";
    }

    var safe = {
      code: code,
      message: messages[code] || "The request could not be completed."
    };

    if (code === "OUTCOME_UNKNOWN") {
      safe.retryable = false;

      if (error.entity_type === "route") {
        safe.route_id = error.entity_id;
      }
    }

    return {
      ok: false,
      error: safe
    };

  } finally {
    if (acquired) {
      try {
        lock.releaseLock();
      } catch (_releaseError) {
        // Do not turn a known result into a retryable failure.
      }
    }
  }
}

function AdminRouteService_routeTable_() {
  return SheetService_readTable_(
    "routes",
    AdminRouteService_ROUTE_HEADERS_
  );
}

function AdminRouteService_stopTable_() {
  return SheetService_readTable_(
    "route_places",
    AdminRouteService_STOP_HEADERS_
  );
}

function AdminRouteService_routeEntry_(table, routeId) {
  var matches = table.rows.filter(function (entry) {
    return entry.values.route_id === routeId;
  });

  if (matches.length !== 1) {
    if (matches.length === 0) {
      throw new Error("NOT_FOUND");
    }
    throw new Error("CONTENT_SCHEMA");
  }

  return matches[0];
}

function AdminRouteService_activeStops_(stopTable, routeId) {
  return stopTable.rows
    .filter(function (entry) {
      return (
        entry.values.route_id === routeId &&
        entry.values.status !== "deleted"
      );
    })
    .sort(function (a, b) {
      var left = Number(a.values.stop_order);
      var right = Number(b.values.stop_order);

      if (left !== right) {
        return left - right;
      }

      return String(a.values.route_place_id).localeCompare(
        String(b.values.route_place_id)
      );
    });
}

function AdminRouteService_list_(payload) {
  var p = AdminRouteService_object_(
    payload || {},
    ["keyword", "status", "page", "page_size"]
  );

  var keyword = p.keyword === undefined ?
    "" :
    AdminRouteService_text_(p.keyword, 200).toLowerCase();

  var status = p.status === undefined ? "" : p.status;

  if (
    status !== "" &&
    AdminRouteService_STATUSES_.indexOf(status) < 0
  ) {
    throw new Error("VALIDATION_ERROR");
  }

  var page = p.page === undefined ? 1 : p.page;
  var size = p.page_size === undefined ? 20 : p.page_size;

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1000000 ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > 100
  ) {
    throw new Error("VALIDATION_ERROR");
  }

  var routeTable = AdminRouteService_routeTable_();
  var stopTable = AdminRouteService_stopTable_();

  var filtered = routeTable.rows.filter(function (entry) {
    var route = entry.values;

    if (status && route.status !== status) {
      return false;
    }

    if (keyword) {
      var haystack = [
        route.route_id,
        route.name_th,
        route.name_en,
        route.slug,
        route.short_description_th,
        route.short_description_en,
        route.travel_style
      ].map(function (value) {
        return value === undefined || value === null ?
          "" :
          String(value).toLowerCase();
      }).join("\n");

      if (haystack.indexOf(keyword) < 0) {
        return false;
      }
    }

    return true;
  });

  filtered.sort(function (a, b) {
    var left = AdminRouteService_timestamp_(
      a.values.updated_at
    );
    var right = AdminRouteService_timestamp_(
      b.values.updated_at
    );

    if (left !== right) {
      return left < right ? 1 : -1;
    }

    return String(a.values.route_id).localeCompare(
      String(b.values.route_id)
    );
  });

  var total = filtered.length;
  var start = (page - 1) * size;

  var items = filtered
    .slice(start, start + size)
    .map(function (entry) {
      var route = entry.values;
      var stops = AdminRouteService_activeStops_(
        stopTable,
        route.route_id
      );

      return AdminRouteService_projection_(
        route,
        stops,
        false
      );
    });

  return {
    items: items,
    page: page,
    page_size: size,
    total: total,
    total_pages: total === 0 ? 0 : Math.ceil(total / size)
  };
}

function AdminRouteService_detail_(payload) {
  var p = AdminRouteService_object_(
    payload,
    ["route_id"]
  );

  var routeId = AdminRouteService_id_(p.route_id);

  var routeTable = AdminRouteService_routeTable_();
  var stopTable = AdminRouteService_stopTable_();

  var routeEntry = AdminRouteService_routeEntry_(
    routeTable,
    routeId
  );

  var stops = AdminRouteService_activeStops_(
    stopTable,
    routeId
  );

  return AdminRouteService_projection_(
    routeEntry.values,
    stops,
    true
  );
}

function adminGetRoutes_(token, payload) {
  return AdminRouteService_execute_(
    token,
    false,
    function () {
      return AdminRouteService_list_(payload || {});
    }
  );
}

function adminGetRouteDetail_(token, payload) {
  return AdminRouteService_execute_(
    token,
    false,
    function () {
      return AdminRouteService_detail_(payload);
    }
  );
}

function AdminRouteService_now_() {
  return new Date();
}

function AdminRouteService_newId_(prefix) {
  return prefix + Utilities.getUuid().replace(/-/g, "");
}

function AdminRouteService_assertTransition_(fromStatus, toStatus) {
  if (
    AdminRouteService_STATUSES_.indexOf(fromStatus) < 0 ||
    AdminRouteService_STATUSES_.indexOf(toStatus) < 0
  ) {
    throw new Error("VALIDATION_ERROR");
  }

  if (fromStatus === toStatus) {
    return;
  }

  var allowed = AdminRouteService_TRANSITIONS_[fromStatus] || [];

  if (allowed.indexOf(toStatus) < 0) {
    throw new Error("INVALID_TRANSITION");
  }
}

function AdminRouteService_existingStopIndex_(stopTable, routeId) {
  var byId = Object.create(null);

  stopTable.rows.forEach(function (entry) {
    var row = entry.values;
    var relationId = row.route_place_id;

    if (!relationId) {
      throw new Error("ROUTE_SCHEMA");
    }

    if (byId[relationId]) {
      throw new Error("ROUTE_SCHEMA");
    }

    if (row.route_id === routeId) {
      byId[relationId] = entry;
    }
  });

  return byId;
}

function AdminRouteService_assertRelationOwnership_(
  stopTable,
  routeId,
  relationId
) {
  var matches = stopTable.rows.filter(function (entry) {
    return entry.values.route_place_id === relationId;
  });

  if (matches.length > 1) {
    throw new Error("ROUTE_SCHEMA");
  }

  if (
    matches.length === 1 &&
    matches[0].values.route_id !== routeId
  ) {
    throw new Error("VALIDATION_ERROR");
  }
}

function AdminRouteService_reconcileStops_(
  stopTable,
  routeId,
  submittedStops,
  routeStatus
) {
  var existing = AdminRouteService_existingStopIndex_(
    stopTable,
    routeId
  );

  var used = Object.create(null);
  var active = [];

  submittedStops.forEach(function (submitted) {
    var stop = {};

    AdminRouteService_STOP_FIELDS_.forEach(function (field) {
      stop[field] = submitted[field];
    });

    var relationId = stop.route_place_id;

    if (relationId) {
      AdminRouteService_assertRelationOwnership_(
        stopTable,
        routeId,
        relationId
      );

      if (!existing[relationId]) {
        throw new Error("VALIDATION_ERROR");
      }

      if (existing[relationId].values.status === "deleted") {
        throw new Error("VALIDATION_ERROR");
      }
    } else {
      relationId = AdminRouteService_newId_("RP-");

      while (
        stopTable.rows.some(function (entry) {
          return entry.values.route_place_id === relationId;
        })
      ) {
        relationId = AdminRouteService_newId_("RP-");
      }

      stop.route_place_id = relationId;
    }

    if (used[relationId]) {
      throw new Error("VALIDATION_ERROR");
    }

    used[relationId] = true;

    stop.route_id = routeId;
    stop.status = routeStatus;

    active.push(stop);
  });

  var removed = [];

  Object.keys(existing).forEach(function (relationId) {
    var entry = existing[relationId];

    if (
      entry.values.status !== "deleted" &&
      !used[relationId]
    ) {
      var deleted = {};

      AdminRouteService_STOP_HEADERS_.forEach(function (field) {
        deleted[field] = entry.values[field];
      });

      deleted.status = "deleted";

      removed.push({
        sourceRowNumber: entry.sourceRowNumber,
        values: deleted
      });
    }
  });

  return {
    active: active,
    removed: removed
  };
}

function AdminRouteService_createPlan_(payload) {
  var p = AdminRouteService_object_(
    payload,
    ["content", "stops", "status"]
  );

  var routeId = AdminRouteService_newId_("ROUTE-");

  var status = p.status === undefined ? "draft" : p.status;

  if (AdminRouteService_STATUSES_.indexOf(status) < 0) {
    throw new Error("VALIDATION_ERROR");
  }

  // New content must begin in a meaningful non-terminal lifecycle state.
  if (["draft", "published"].indexOf(status) < 0) {
    throw new Error("INVALID_TRANSITION");
  }

  var content = AdminRouteService_routeContent_(
    p.content,
    true
  );

  var routeTable = AdminRouteService_routeTable_();

  if (routeTable.rows.some(function (entry) {
    return entry.values.route_id === routeId;
  })) {
    throw new Error("DUPLICATE_ID");
  }

  var stopTable = AdminRouteService_stopTable_();

  var submittedStops = AdminRouteService_stops_(
    p.stops === undefined ? [] : p.stops,
    status
  );

  AdminRouteService_validatePlaces_(
    submittedStops,
    status
  );

  var reconciled = AdminRouteService_reconcileStops_(
    stopTable,
    routeId,
    submittedStops,
    status
  );

  var now = AdminRouteService_now_();

  var route = {
    route_id: routeId,
    status: status,
    created_at: now,
    updated_at: now
  };

  AdminRouteService_ROUTE_FIELDS_.forEach(function (field) {
    route[field] = content[field];
  });

  return {
    mode: "create",
    routeTable: routeTable,
    stopTable: stopTable,
    routeEntry: null,
    route: route,
    activeStops: reconciled.active,
    removedStops: reconciled.removed,
    previousRevision: "",
    revision: AdminRouteService_revision_(
      route,
      reconciled.active
    )
  };
}

function AdminRouteService_updatePlan_(payload) {
  var p = AdminRouteService_object_(
    payload,
    ["route_id", "expected_revision", "content", "stops", "status"]
  );

  var routeId = AdminRouteService_id_(p.route_id);

  var expectedRevision = AdminRouteService_revisionInput_(
    p.expected_revision
  );

  var routeTable = AdminRouteService_routeTable_();
  var stopTable = AdminRouteService_stopTable_();

  var routeEntry = AdminRouteService_routeEntry_(
    routeTable,
    routeId
  );

  var currentRoute = routeEntry.values;

  if (AdminRouteService_STATUSES_.indexOf(currentRoute.status) < 0) {
    throw new Error("ROUTE_SCHEMA");
  }

  var currentStops = AdminRouteService_activeStops_(
    stopTable,
    routeId
  );

  var currentRevision = AdminRouteService_revision_(
    currentRoute,
    currentStops
  );

  if (currentRevision !== expectedRevision) {
    throw new Error("CONFLICT");
  }

  var nextStatus = p.status === undefined ?
    currentRoute.status :
    p.status;

  if (AdminRouteService_STATUSES_.indexOf(nextStatus) < 0) {
    throw new Error("VALIDATION_ERROR");
  }

  AdminRouteService_assertTransition_(
    currentRoute.status,
    nextStatus
  );

  var content;

  if (p.content === undefined) {
    content = {};

    AdminRouteService_ROUTE_FIELDS_.forEach(function (field) {
      content[field] = currentRoute[field];
    });
  } else {
    content = AdminRouteService_routeContent_(
      p.content,
      true
    );
  }

  if (nextStatus === "published") {
    var publishContent = {};

    AdminRouteService_ROUTE_FIELDS_.forEach(function (field) {
      publishContent[field] = content[field];
    });

    if (publishContent.is_featured === "") {
      publishContent.is_featured = false;
    }

    content = AdminRouteService_routeContent_(
      publishContent,
      true
    );
  }

  var submittedStops;

  if (p.stops === undefined) {
    submittedStops = currentStops.map(function (entry, index) {
      var row = entry.values;
      var source = {};

      AdminRouteService_STOP_FIELDS_.forEach(function (field) {
        source[field] = row[field];
      });

      source.stop_order = index + 1;
      source.status = nextStatus;

      return source;
    });

    submittedStops = AdminRouteService_stops_(
      submittedStops,
      nextStatus
    );
  } else {
    submittedStops = AdminRouteService_stops_(
      p.stops,
      nextStatus
    );
  }

  AdminRouteService_validatePlaces_(
    submittedStops,
    nextStatus
  );

  if (nextStatus === "deleted") {
    // Deleted aggregates retain existing rows, but never add new inactive rows.
    submittedStops = submittedStops.filter(function (stop) {
      return !!stop.route_place_id;
    });
  }

  var reconciled = AdminRouteService_reconcileStops_(
    stopTable,
    routeId,
    submittedStops,
    nextStatus
  );

  var route = {};

  AdminRouteService_ROUTE_HEADERS_.forEach(function (field) {
    route[field] = currentRoute[field];
  });

  AdminRouteService_ROUTE_FIELDS_.forEach(function (field) {
    route[field] = content[field];
  });

  route.status = nextStatus;
  route.updated_at = AdminRouteService_now_();

  return {
    mode: "update",
    routeTable: routeTable,
    stopTable: stopTable,
    routeEntry: routeEntry,
    route: route,
    relationshipWrites: reconciled.active,
    activeStops: nextStatus === "deleted" ? [] : reconciled.active,
    removedStops: reconciled.removed,
    previousRevision: currentRevision,
    revision: AdminRouteService_revision_(
      route,
      nextStatus === "deleted" ? [] : reconciled.active
    )
  };
}

function AdminRouteService_assertFormats_(
  sheet,
  rowNumber,
  headers,
  record
) {
  var range = sheet.getRange(
    rowNumber,
    1,
    1,
    headers.length
  );

  var formats = range.getNumberFormats()[0];
  var formulas = range.getFormulas()[0];

  if (
    !formats ||
    formats.length !== headers.length ||
    !formulas ||
    formulas.length !== headers.length
  ) {
    throw new Error("ROUTE_FORMAT");
  }

  headers.forEach(function (field, index) {
    if (
      formulas[index] ||
      (
        typeof record[field] === "string" &&
        /^[\s]*[=+@\-']/.test(record[field])
      )
    ) {
      throw new Error("ROUTE_FORMULA");
    }

    if (
      typeof record[field] === "string" &&
      record[field] !== "" &&
      formats[index] !== "@"
    ) {
      throw new Error("ROUTE_FORMAT");
    }

    if (
      typeof record[field] === "boolean" &&
      ["0", "0.###############"].indexOf(
        formats[index]
      ) < 0
    ) {
      throw new Error("ROUTE_FORMAT");
    }
  });
}

function AdminRouteService_verifyRow_(
  sheetName,
  headers,
  idField,
  id,
  rowNumber,
  record
) {
  var matches = SheetService_readTable_(
    sheetName,
    headers
  ).rows.filter(function (entry) {
    return entry.values[idField] === id;
  });

  if (
    matches.length !== 1 ||
    matches[0].sourceRowNumber !== rowNumber
  ) {
    throw new Error("ROUTE_VERIFY");
  }

  headers.forEach(function (field) {
    var expected = record[field];
    var actual = matches[0].values[field];

    if (
      expected instanceof Date &&
      actual instanceof Date &&
      expected.getTime() === actual.getTime()
    ) {
      return;
    }

    if (actual !== expected) {
      throw new Error("ROUTE_VERIFY");
    }
  });
}

function AdminRouteService_verifyAggregate_(
  route,
  expectedStops
) {
  var routeTable = AdminRouteService_routeTable_();
  var stopTable = AdminRouteService_stopTable_();

  var routeEntry = AdminRouteService_routeEntry_(
    routeTable,
    route.route_id
  );

  var actualStops = AdminRouteService_activeStops_(
    stopTable,
    route.route_id
  );

  var expectedRevision = AdminRouteService_revision_(
    route,
    expectedStops
  );

  var actualRevision = AdminRouteService_revision_(
    routeEntry.values,
    actualStops
  );

  if (actualRevision !== expectedRevision) {
    throw new Error("ROUTE_VERIFY");
  }

  return {
    routeEntry: routeEntry,
    stops: actualStops,
    revision: actualRevision
  };
}

function AdminRouteService_outcomeUnknown_(routeId) {
  var error = new Error("OUTCOME_UNKNOWN");
  error.entity_type = "route";
  error.entity_id = routeId;
  return error;
}

var AdminRouteService_AUDIT_HEADERS_ = [
  "log_id",
  "admin_id",
  "action",
  "entity_type",
  "entity_id",
  "description",
  "created_at",
  "audit_id",
  "actor_admin_id",
  "occurred_at"
];

function AdminRouteService_fullRecord_(headers, source) {
  var result = {};

  headers.forEach(function (field) {
    result[field] = Object.prototype.hasOwnProperty.call(
      source,
      field
    ) ? source[field] : "";
  });

  return result;
}

function AdminRouteService_auditPlan_(
  admin,
  action,
  route,
  revision
) {
  var auditTable = SheetService_readTable_(
    "activity_logs",
    AdminRouteService_AUDIT_HEADERS_
  );

  var auditId = Utilities.getUuid();
  var occurredAt = route.updated_at;

  var audit = {
    log_id: auditId,
    admin_id: admin.admin_id,
    action: action,
    entity_type: "route",
    entity_id: route.route_id,
    description: JSON.stringify({
      status: route.status,
      revision: revision
    }),
    created_at: occurredAt,
    audit_id: auditId,
    actor_admin_id: admin.admin_id,
    occurred_at: occurredAt
  };

  if (
    auditTable.rows.some(function (entry) {
      return (
        entry.values.audit_id === auditId ||
        entry.values.log_id === auditId
      );
    })
  ) {
    throw new Error("ROUTE_AUDIT_COLLISION");
  }

  var auditSheet = SheetService_getSheet_(
    "activity_logs"
  );

  var prepared = SheetService_prepareAppendDestination_(
    auditSheet,
    auditTable.headers,
    auditTable.headers
  );

  AdminRouteService_assertFormats_(
    auditSheet,
    prepared.sourceRowNumber,
    auditTable.headers,
    audit
  );

  return {
    table: auditTable,
    record: audit,
    prepared: prepared,
    rowNumber: prepared.sourceRowNumber
  };
}

function AdminRouteService_preflightPlan_(plan, admin, action) {
  var routeSheet = SheetService_getSheet_("routes");
  var stopSheet = SheetService_getSheet_("route_places");

  var routeRecord = AdminRouteService_fullRecord_(
    AdminRouteService_ROUTE_HEADERS_,
    plan.route
  );

  var routePrepared = null;
  var routeRowNumber;

  if (plan.routeEntry) {
    routeRowNumber = plan.routeEntry.sourceRowNumber;

    AdminRouteService_assertFormats_(
      routeSheet,
      routeRowNumber,
      plan.routeTable.headers,
      routeRecord
    );
  } else {
    routePrepared = SheetService_prepareAppendDestination_(
      routeSheet,
      plan.routeTable.headers,
      plan.routeTable.headers
    );

    routeRowNumber = routePrepared.sourceRowNumber;

    AdminRouteService_assertFormats_(
      routeSheet,
      routeRowNumber,
      plan.routeTable.headers,
      routeRecord
    );
  }

  var existingStopWrites = [];
  var newStopWrites = [];

  (plan.relationshipWrites || plan.activeStops).forEach(function (stop) {
    var record = AdminRouteService_fullRecord_(
      AdminRouteService_STOP_HEADERS_,
      stop
    );

    var existing = plan.stopTable.rows.filter(function (entry) {
      return (
        entry.values.route_place_id ===
        stop.route_place_id
      );
    });

    if (existing.length > 1) {
      throw new Error("ROUTE_SCHEMA");
    }

    if (existing.length === 1) {
      AdminRouteService_assertFormats_(
        stopSheet,
        existing[0].sourceRowNumber,
        plan.stopTable.headers,
        record
      );

      existingStopWrites.push({
        rowNumber: existing[0].sourceRowNumber,
        record: record
      });
    } else {
      newStopWrites.push({
        record: record
      });
    }
  });

  var removedStopWrites = plan.removedStops.map(
    function (entry) {
      var record = AdminRouteService_fullRecord_(
        AdminRouteService_STOP_HEADERS_,
        entry.values
      );

      AdminRouteService_assertFormats_(
        stopSheet,
        entry.sourceRowNumber,
        plan.stopTable.headers,
        record
      );

      return {
        rowNumber: entry.sourceRowNumber,
        record: record
      };
    }
  );

  /*
   * A single prepared append destination cannot be reused for
   * multiple new stops because each append advances getLastRow().
   *
   * We still preflight the next append row's schema/format here.
   * The writer will prepare each actual new-stop destination
   * immediately before that append while the script lock is held.
   */
  if (newStopWrites.length) {
    var nextStopDestination =
      SheetService_prepareAppendDestination_(
        stopSheet,
        plan.stopTable.headers,
        plan.stopTable.headers
      );

    AdminRouteService_assertFormats_(
      stopSheet,
      nextStopDestination.sourceRowNumber,
      plan.stopTable.headers,
      newStopWrites[0].record
    );
  }

  var auditPlan = AdminRouteService_auditPlan_(
    admin,
    action,
    plan.route,
    plan.revision
  );

  return {
    routeRecord: routeRecord,
    routePrepared: routePrepared,
    routeRowNumber: routeRowNumber,
    existingStopWrites: existingStopWrites,
    newStopWrites: newStopWrites,
    removedStopWrites: removedStopWrites,
    audit: auditPlan
  };
}

function AdminRouteService_writePlan_(plan, admin, action) {
  var prepared = AdminRouteService_preflightPlan_(
    plan,
    admin,
    action
  );

  var routeId = plan.route.route_id;
  var mutationStarted = false;

  /*
   * Everything that can reasonably be validated before mutation
   * has already been checked by preflightPlan_().
   *
   * From the first entity write until aggregate verification,
   * a failure is uncertain: the spreadsheet may contain some or
   * all of the intended mutation.
   */
  try {
    ContentCacheService_invalidateUnderLock_();

    mutationStarted = true;

    if (plan.routeEntry) {
      SheetService_replaceObjectAtRow_(
        "routes",
        prepared.routeRowNumber,
        prepared.routeRecord
      );
    } else {
      SheetService_appendObjectWithRow_(
        "routes",
        plan.routeTable.headers,
        prepared.routeRecord,
        prepared.routePrepared
      );
    }

    prepared.existingStopWrites.forEach(function (write) {
      SheetService_replaceObjectAtRow_(
        "route_places",
        write.rowNumber,
        write.record
      );
    });

    prepared.removedStopWrites.forEach(function (write) {
      SheetService_replaceObjectAtRow_(
        "route_places",
        write.rowNumber,
        write.record
      );
    });

    prepared.newStopWrites.forEach(function (write) {
      var stopSheet = SheetService_getSheet_(
        "route_places"
      );

      var destination =
        SheetService_prepareAppendDestination_(
          stopSheet,
          plan.stopTable.headers,
          plan.stopTable.headers
        );

      AdminRouteService_assertFormats_(
        stopSheet,
        destination.sourceRowNumber,
        plan.stopTable.headers,
        write.record
      );

      SheetService_appendObjectWithRow_(
        "route_places",
        plan.stopTable.headers,
        write.record,
        destination
      );
    });

    SpreadsheetApp.flush();

    AdminRouteService_verifyRow_(
      "routes",
      AdminRouteService_ROUTE_HEADERS_,
      "route_id",
      routeId,
      prepared.routeRowNumber,
      prepared.routeRecord
    );

    prepared.existingStopWrites.forEach(function (write) {
      AdminRouteService_verifyRow_(
        "route_places",
        AdminRouteService_STOP_HEADERS_,
        "route_place_id",
        write.record.route_place_id,
        write.rowNumber,
        write.record
      );
    });

    prepared.removedStopWrites.forEach(function (write) {
      AdminRouteService_verifyRow_(
        "route_places",
        AdminRouteService_STOP_HEADERS_,
        "route_place_id",
        write.record.route_place_id,
        write.rowNumber,
        write.record
      );
    });

    /*
     * New stops do not rely on a predicted row number here.
     * Aggregate verification below confirms the final active
     * relationship set and its canonical revision.
     */
    var verified = AdminRouteService_verifyAggregate_(
      plan.route,
      plan.activeStops
    );

    if (verified.revision !== plan.revision) {
      throw new Error("ROUTE_VERIFY");
    }

  } catch (_writeError) {
    if (mutationStarted) {
      throw AdminRouteService_outcomeUnknown_(routeId);
    }

    throw _writeError;
  }

  /*
   * At this point the aggregate mutation has been verified.
   * Audit failure must not turn a known successful mutation into
   * a retryable entity failure.
   */
  var auditStatus = "recorded";

  try {
    SheetService_appendObjectWithRow_(
      "activity_logs",
      prepared.audit.table.headers,
      prepared.audit.record,
      prepared.audit.prepared
    );

    SpreadsheetApp.flush();

    AdminRouteService_verifyRow_(
      "activity_logs",
      AdminRouteService_AUDIT_HEADERS_,
      "audit_id",
      prepared.audit.record.audit_id,
      prepared.audit.rowNumber,
      prepared.audit.record
    );

  } catch (_auditError) {
    auditStatus = "unconfirmed";
  }

  var result = AdminRouteService_projection_(
    plan.route,
    plan.activeStops,
    false
  );

  result.audit_status = auditStatus;

  return result;
}

function AdminRouteService_create_(admin, payload) {
  var plan = AdminRouteService_createPlan_(payload);

  return AdminRouteService_writePlan_(
    plan,
    admin,
    "create_route"
  );
}

function AdminRouteService_update_(admin, payload) {
  var plan = AdminRouteService_updatePlan_(payload);

  return AdminRouteService_writePlan_(
    plan,
    admin,
    "update_route"
  );
}

function AdminRouteService_deletePlan_(payload) {
  var p = AdminRouteService_object_(
    payload,
    ["route_id", "expected_revision"]
  );

  var routeId = AdminRouteService_id_(p.route_id);

  var expectedRevision = AdminRouteService_revisionInput_(
    p.expected_revision
  );

  var routeTable = AdminRouteService_routeTable_();
  var stopTable = AdminRouteService_stopTable_();

  var routeEntry = AdminRouteService_routeEntry_(
    routeTable,
    routeId
  );

  var currentRoute = routeEntry.values;

  if (
    AdminRouteService_STATUSES_.indexOf(
      currentRoute.status
    ) < 0
  ) {
    throw new Error("ROUTE_SCHEMA");
  }

  var currentStops = AdminRouteService_activeStops_(
    stopTable,
    routeId
  );

  var currentRevision = AdminRouteService_revision_(
    currentRoute,
    currentStops
  );

  if (currentRevision !== expectedRevision) {
    throw new Error("CONFLICT");
  }

  AdminRouteService_assertTransition_(
    currentRoute.status,
    "deleted"
  );

  var route = {};

  AdminRouteService_ROUTE_HEADERS_.forEach(function (field) {
    route[field] = currentRoute[field];
  });

  route.status = "deleted";
  route.updated_at = AdminRouteService_now_();

  /*
   * deleteRoute is a soft delete of the aggregate.
   * Child relationship rows are also soft-deleted so they cannot
   * remain active independently of the deleted parent.
   */
  var removedStops = currentStops.map(function (entry) {
    var record = {};

    AdminRouteService_STOP_HEADERS_.forEach(function (field) {
      record[field] = entry.values[field];
    });

    record.status = "deleted";

    return {
      sourceRowNumber: entry.sourceRowNumber,
      values: record
    };
  });

  return {
    mode: "delete",
    routeTable: routeTable,
    stopTable: stopTable,
    routeEntry: routeEntry,
    route: route,
    activeStops: [],
    removedStops: removedStops,
    previousRevision: currentRevision,
    revision: AdminRouteService_revision_(
      route,
      []
    )
  };
}

function AdminRouteService_delete_(admin, payload) {
  var plan = AdminRouteService_deletePlan_(payload);

  return AdminRouteService_writePlan_(
    plan,
    admin,
    "delete_route"
  );
}

function createRoute_(token, payload) {
  return AdminRouteService_execute_(
    token,
    true,
    function (admin) {
      return AdminRouteService_create_(
        admin,
        payload
      );
    }
  );
}

function updateRoute_(token, payload) {
  return AdminRouteService_execute_(
    token,
    true,
    function (admin) {
      return AdminRouteService_update_(
        admin,
        payload
      );
    }
  );
}

function deleteRoute_(token, payload) {
  return AdminRouteService_execute_(
    token,
    true,
    function (admin) {
      return AdminRouteService_delete_(
        admin,
        payload
      );
    }
  );
}
