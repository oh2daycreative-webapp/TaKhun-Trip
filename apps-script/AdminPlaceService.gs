var AdminPlaceService_DEFAULT_PAGE_ = 1;
var AdminPlaceService_DEFAULT_PAGE_SIZE_ = 20;
var AdminPlaceService_MAX_PAGE_SIZE_ = 100;
var AdminPlaceService_AUDIT_ACTIONS_ = ["CREATE", "UPDATE_DRAFT", "PUBLISH", "UNPUBLISH", "ARCHIVE", "RESTORE"];
var AdminPlaceService_PUBLIC_CACHE_EPOCH_KEY_ = "PLACE_PUBLIC_CACHE_EPOCH";

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
    if (code === "CONFLICT") return AdminPlaceService_error_("CONFLICT", "ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุด");
    return AdminPlaceService_error_("SERVER_ERROR", "เกิดข้อผิดพลาดของระบบ");
  }
}

function AdminPlaceService_withWriteLock_(operation) {
  if (typeof operation !== "function") throw new Error("ADMIN_PLACE_WRITE_OPERATION");
  var lock = LockService.getScriptLock();
  var acquired = false;
  try {
    if (!lock || typeof lock.tryLock !== "function" || !lock.tryLock(AdminPlaceSchema_LOCK_TIMEOUT_MS_)) {
      throw new Error("ADMIN_PLACE_WRITE_LOCK");
    }
    acquired = true;
    return operation();
  } finally {
    if (acquired) lock.releaseLock();
  }
}

function AdminPlaceService_requireExpectedVersion_(expectedVersion, currentVersion, draftBasePublishedVersion, currentPublishedVersion) {
  if (arguments.length !== 2 && arguments.length !== 4) throw new Error("VALIDATION_ERROR");
  if (typeof expectedVersion !== "number" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error("VALIDATION_ERROR");
  }
  var authoritativeVersion = AdminPlaceService_storedInteger_(currentVersion, true);
  if (expectedVersion !== authoritativeVersion) throw new Error("CONFLICT");
  if (arguments.length === 4) {
    var authoritativeDraftBase = AdminPlaceService_storedInteger_(draftBasePublishedVersion, false);
    var authoritativePublishedVersion = AdminPlaceService_storedInteger_(currentPublishedVersion, false);
    if (authoritativeDraftBase !== authoritativePublishedVersion) throw new Error("CONFLICT");
  }
  return authoritativeVersion;
}

function AdminPlaceService_appendVerifiedAudit_(admin, action, placeId) {
  if (!admin || typeof admin !== "object" || Array.isArray(admin) || !AdminPlaceService_validId_(admin.admin_id)) {
    throw new Error("ADMIN_PLACE_AUDIT_ACTOR");
  }
  if (AdminPlaceService_AUDIT_ACTIONS_.indexOf(action) === -1 || !AdminPlaceService_validId_(placeId)) {
    throw new Error("ADMIN_PLACE_AUDIT_INPUT");
  }
  var auditId = AdminPlaceService_safeText_(Utilities.getUuid());
  if (!auditId || auditId.length > 128) throw new Error("ADMIN_PLACE_AUDIT_ID");
  var occurredAt = new Date().toISOString();
  var record = {
    audit_id: auditId,
    actor_admin_id: admin.admin_id,
    action: action,
    entity_type: "place",
    entity_id: placeId,
    description: action,
    occurred_at: occurredAt,
    log_id: auditId,
    admin_id: admin.admin_id,
    created_at: occurredAt
  };
  var auditHeaders = AdminPlaceSchema_ACTIVITY_BASE_HEADERS_.concat(AdminPlaceSchema_ACTIVITY_APPEND_HEADERS_);
  var initialAuditTable = SheetService_readTable_(AdminPlaceSchema_ACTIVITY_SHEET_NAME_, auditHeaders);
  if (initialAuditTable.rows.some(function (entry) { return entry && entry.values && entry.values.audit_id === auditId; })) {
    throw new Error("ADMIN_PLACE_AUDIT_ID_COLLISION");
  }
  var appended = null;
  var appendAttempted = false;
  try {
    appendAttempted = true;
    appended = SheetService_appendObjectWithRow_(AdminPlaceSchema_ACTIVITY_SHEET_NAME_, auditHeaders, record);
    if (!appended || !Number.isSafeInteger(appended.sourceRowNumber) || appended.sourceRowNumber < 2) {
      throw new Error("ADMIN_PLACE_AUDIT_APPEND");
    }
    var auditTable = SheetService_readTable_(AdminPlaceSchema_ACTIVITY_SHEET_NAME_, auditHeaders);
    var auditMatches = auditTable.rows.filter(function (entry) {
      return entry && entry.values && entry.values.audit_id === auditId;
    });
    if (auditMatches.length !== 1 || auditMatches[0].sourceRowNumber !== appended.sourceRowNumber) {
      throw new Error("ADMIN_PLACE_AUDIT_CARDINALITY");
    }
    var verified = auditMatches[0].values;
    Object.keys(record).forEach(function (field) {
      if (verified[field] !== record[field]) throw new Error("ADMIN_PLACE_AUDIT_VERIFY");
    });
    return true;
  } catch (error) {
    if (appendAttempted) {
      try {
        var returnedSourceRow = appended && Number.isSafeInteger(appended.sourceRowNumber) && appended.sourceRowNumber >= 2 ?
          appended.sourceRowNumber : null;
        var failedAppendTable = SheetService_readTable_(AdminPlaceSchema_ACTIVITY_SHEET_NAME_, auditHeaders);
        var failedAppendMatches = failedAppendTable.rows.filter(function (entry) {
          return entry && entry.values && entry.values.audit_id === auditId;
        });
        if (failedAppendMatches.length > 1) throw new Error("ADMIN_PLACE_AUDIT_CLEANUP_CARDINALITY");
        var cleanupSourceRow = failedAppendMatches.length === 1 ? failedAppendMatches[0].sourceRowNumber : null;
        if (cleanupSourceRow === null && returnedSourceRow !== null) {
          var returnedRowExistedBefore = initialAuditTable.rows.some(function (entry) {
            return entry.sourceRowNumber === returnedSourceRow;
          });
          var returnedRowExistsAfter = failedAppendTable.rows.some(function (entry) {
            return entry.sourceRowNumber === returnedSourceRow;
          });
          if (!returnedRowExistedBefore && returnedRowExistsAfter) cleanupSourceRow = returnedSourceRow;
        }
        if (cleanupSourceRow !== null) {
          SheetService_clearRow_(AdminPlaceSchema_ACTIVITY_SHEET_NAME_, cleanupSourceRow);
        }
        var cleanupTable = SheetService_readTable_(AdminPlaceSchema_ACTIVITY_SHEET_NAME_, auditHeaders);
        var cleanupFailed = cleanupTable.rows.some(function (entry) {
          return (cleanupSourceRow !== null && entry.sourceRowNumber === cleanupSourceRow) ||
            (entry.values && entry.values.audit_id === auditId);
        });
        if (cleanupFailed) throw new Error("ADMIN_PLACE_AUDIT_CLEANUP");
      } catch (cleanupError) {
        // The owning action remains fail-closed and compensates its Place state.
      }
    }
    throw error;
  }
}

function AdminPlaceService_captureState_(placeId, includeEpoch) {
  if (!AdminPlaceService_validId_(placeId) || (includeEpoch !== undefined && typeof includeEpoch !== "boolean")) {
    throw new Error("ADMIN_PLACE_STATE_INPUT");
  }
  var placeHeaders = AdminPlaceSchema_PLACE_BASE_HEADERS_.concat(AdminPlaceSchema_PLACES_APPEND_HEADERS_);
  var draftHeaders = AdminPlaceSchema_DRAFT_HEADERS_;
  var placeTable = SheetService_readTable_(AdminPlaceSchema_PLACES_SHEET_NAME_, placeHeaders);
  var draftTable = SheetService_readTable_(AdminPlaceSchema_DRAFTS_SHEET_NAME_, draftHeaders);
  if (!placeTable || !Array.isArray(placeTable.headers) || !Array.isArray(placeTable.rows) ||
      !draftTable || !Array.isArray(draftTable.headers) || !Array.isArray(draftTable.rows)) {
    throw new Error("ADMIN_PLACE_STATE_READ");
  }
  var placeMatches = placeTable.rows.filter(function (entry) {
    return entry && entry.values && entry.values.place_id === placeId;
  });
  var draftMatches = draftTable.rows.filter(function (entry) {
    return entry && entry.values && entry.values.place_id === placeId;
  });
  if (placeMatches.length > 1 || draftMatches.length > 1 || (!placeMatches.length && draftMatches.length)) {
    throw new Error("ADMIN_PLACE_STATE_CARDINALITY");
  }

  var placeRow = null;
  if (placeMatches.length === 1) {
    var placeValues = {};
    placeTable.headers.forEach(function (header) { placeValues[header] = placeMatches[0].values[header]; });
    placeRow = { sourceRowNumber: placeMatches[0].sourceRowNumber, values: placeValues };
  }
  var draftRow = null;
  if (draftMatches.length === 1) {
    var draftValues = {};
    draftTable.headers.forEach(function (header) { draftValues[header] = draftMatches[0].values[header]; });
    draftRow = { sourceRowNumber: draftMatches[0].sourceRowNumber, values: draftValues };
  }
  var epoch = { captured: false, present: false, value: null };
  if (includeEpoch) {
    var properties = PropertiesService.getScriptProperties();
    if (!properties || typeof properties.getProperty !== "function") throw new Error("ADMIN_PLACE_EPOCH_READ");
    var epochValue = properties.getProperty(AdminPlaceService_PUBLIC_CACHE_EPOCH_KEY_);
    epoch = { captured: true, present: epochValue !== null, value: epochValue };
  }
  var snapshot = {
    place_id: placeId,
    place_headers: placeTable.headers.slice(),
    draft_headers: draftTable.headers.slice(),
    rows: {
      place: placeRow,
      draft: draftRow
    },
    allocated_rows: {
      place: null,
      draft: null
    },
    epoch: epoch
  };

  var verificationPlaceTable = SheetService_readTable_(AdminPlaceSchema_PLACES_SHEET_NAME_, placeHeaders);
  var verificationDraftTable = SheetService_readTable_(AdminPlaceSchema_DRAFTS_SHEET_NAME_, draftHeaders);
  var verificationPairs = [
    { initial: placeTable, current: verificationPlaceTable, captured: placeRow },
    { initial: draftTable, current: verificationDraftTable, captured: draftRow }
  ];
  verificationPairs.forEach(function (pair) {
    if (!pair.current || !Array.isArray(pair.current.headers) || !Array.isArray(pair.current.rows) ||
        pair.initial.headers.length !== pair.current.headers.length) {
      throw new Error("ADMIN_PLACE_STATE_VERIFY");
    }
    pair.initial.headers.forEach(function (header, index) {
      if (pair.current.headers[index] !== header) throw new Error("ADMIN_PLACE_STATE_VERIFY");
    });
    var matches = pair.current.rows.filter(function (entry) {
      return entry && entry.values && entry.values.place_id === placeId;
    });
    if (matches.length !== (pair.captured ? 1 : 0)) throw new Error("ADMIN_PLACE_STATE_VERIFY");
    if (pair.captured) {
      if (matches[0].sourceRowNumber !== pair.captured.sourceRowNumber) throw new Error("ADMIN_PLACE_STATE_VERIFY");
      pair.current.headers.forEach(function (header) {
        var capturedCell = pair.captured.values[header];
        var currentCell = matches[0].values[header];
        var sameCell = currentCell === capturedCell ||
          (currentCell instanceof Date && capturedCell instanceof Date && currentCell.getTime() === capturedCell.getTime());
        if (!sameCell) throw new Error("ADMIN_PLACE_STATE_VERIFY");
      });
    }
  });
  if (epoch.captured) {
    var verifiedEpoch = PropertiesService.getScriptProperties().getProperty(AdminPlaceService_PUBLIC_CACHE_EPOCH_KEY_);
    if ((verifiedEpoch !== null) !== epoch.present || verifiedEpoch !== epoch.value) throw new Error("ADMIN_PLACE_EPOCH_VERIFY");
  }
  return snapshot;
}

function AdminPlaceService_restoreState_(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || !AdminPlaceService_validId_(snapshot.place_id) ||
      !Array.isArray(snapshot.place_headers) || !Array.isArray(snapshot.draft_headers) || !snapshot.rows ||
      !snapshot.allocated_rows || !snapshot.epoch) {
    throw new Error("ADMIN_PLACE_RESTORE_INPUT");
  }
  if (snapshot.epoch.captured) {
    var properties = PropertiesService.getScriptProperties();
    if (!properties) throw new Error("ADMIN_PLACE_EPOCH_RESTORE");
    if (snapshot.epoch.present) {
      properties.setProperty(AdminPlaceService_PUBLIC_CACHE_EPOCH_KEY_, snapshot.epoch.value);
    } else {
      properties.deleteProperty(AdminPlaceService_PUBLIC_CACHE_EPOCH_KEY_);
    }
  }

  var currentTables = {
    places: SheetService_readTable_(AdminPlaceSchema_PLACES_SHEET_NAME_, snapshot.place_headers),
    place_drafts: SheetService_readTable_(AdminPlaceSchema_DRAFTS_SHEET_NAME_, snapshot.draft_headers)
  };
  var clearedRows = { places: [], place_drafts: [] };
  var restoreTargets = [
    { key: "place", tableKey: "places", sheetName: AdminPlaceSchema_PLACES_SHEET_NAME_, headers: snapshot.place_headers },
    { key: "draft", tableKey: "place_drafts", sheetName: AdminPlaceSchema_DRAFTS_SHEET_NAME_, headers: snapshot.draft_headers }
  ].reverse();
  restoreTargets.forEach(function (target) {
    var before = snapshot.rows[target.key];
    var allocatedRow = snapshot.allocated_rows[target.key];
    if (allocatedRow !== null && (!Number.isSafeInteger(allocatedRow) || allocatedRow < 2)) {
      throw new Error("ADMIN_PLACE_RESTORE_ALLOCATION");
    }
    var currentMatches = currentTables[target.tableKey].rows.filter(function (entry) {
      return entry && entry.values && entry.values.place_id === snapshot.place_id;
    });
    if (before) {
      if (allocatedRow !== null) throw new Error("ADMIN_PLACE_RESTORE_ALLOCATION");
      SheetService_replaceObjectAtRow_(target.sheetName, before.sourceRowNumber, before.values);
    } else {
      if (currentMatches.length > 1) throw new Error("ADMIN_PLACE_RESTORE_ALLOCATION");
      if (currentMatches.length === 1) {
        // Verified pre-absence makes the unique target-ID row authoritative; never clear a conflicting unrelated allocation.
        SheetService_clearRow_(target.sheetName, currentMatches[0].sourceRowNumber);
        clearedRows[target.tableKey].push(currentMatches[0].sourceRowNumber);
      } else if (allocatedRow !== null) {
        if (currentTables[target.tableKey].rows.some(function (entry) { return entry.sourceRowNumber === allocatedRow; })) {
          throw new Error("ADMIN_PLACE_RESTORE_ALLOCATION");
        }
        clearedRows[target.tableKey].push(allocatedRow);
      }
    }
  });

  var verificationTables = {
    places: SheetService_readTable_(AdminPlaceSchema_PLACES_SHEET_NAME_, snapshot.place_headers),
    place_drafts: SheetService_readTable_(AdminPlaceSchema_DRAFTS_SHEET_NAME_, snapshot.draft_headers)
  };
  restoreTargets.forEach(function (target) {
    var before = snapshot.rows[target.key];
    var table = verificationTables[target.tableKey];
    if (!table || !Array.isArray(table.headers) || table.headers.length !== target.headers.length) {
      throw new Error("ADMIN_PLACE_RESTORE_VERIFY");
    }
    target.headers.forEach(function (header, index) {
      if (table.headers[index] !== header) throw new Error("ADMIN_PLACE_RESTORE_VERIFY");
    });
    var matches = table.rows.filter(function (entry) {
      return entry && entry.values && entry.values.place_id === snapshot.place_id;
    });
    if (matches.length !== (before ? 1 : 0)) throw new Error("ADMIN_PLACE_RESTORE_VERIFY");
    if (before) {
      if (matches[0].sourceRowNumber !== before.sourceRowNumber) throw new Error("ADMIN_PLACE_RESTORE_VERIFY");
      target.headers.forEach(function (header) {
        var restoredCell = matches[0].values[header];
        var capturedCell = before.values[header];
        var sameCell = restoredCell === capturedCell ||
          (restoredCell instanceof Date && capturedCell instanceof Date && restoredCell.getTime() === capturedCell.getTime());
        if (!sameCell) throw new Error("ADMIN_PLACE_RESTORE_VERIFY");
      });
    } else {
      clearedRows[target.tableKey].forEach(function (sourceRowNumber) {
        if (table.rows.some(function (entry) { return entry.sourceRowNumber === sourceRowNumber; })) {
          throw new Error("ADMIN_PLACE_RESTORE_CLEAR_VERIFY");
        }
      });
    }
  });
  if (snapshot.epoch.captured) {
    var restoredEpoch = PropertiesService.getScriptProperties().getProperty(AdminPlaceService_PUBLIC_CACHE_EPOCH_KEY_);
    if ((restoredEpoch !== null) !== snapshot.epoch.present || restoredEpoch !== snapshot.epoch.value) {
      throw new Error("ADMIN_PLACE_EPOCH_RESTORE_VERIFY");
    }
  }
  return true;
}

function AdminPlaceService_failClosed_(snapshot) {
  try {
    if (snapshot) AdminPlaceService_restoreState_(snapshot);
  } catch (rollbackError) {
    // A rollback failure never changes the client-safe outcome.
  }
  return AdminPlaceService_error_("SERVER_ERROR", "เกิดข้อผิดพลาดของระบบ");
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
