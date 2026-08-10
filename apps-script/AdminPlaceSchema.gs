var AdminPlaceSchema_PLACES_SHEET_NAME_ = "places";
var AdminPlaceSchema_DRAFTS_SHEET_NAME_ = "place_drafts";
var AdminPlaceSchema_ACTIVITY_SHEET_NAME_ = "activity_logs";
var AdminPlaceSchema_LOCK_TIMEOUT_MS_ = 10000;

var AdminPlaceSchema_PLACE_BASE_HEADERS_ = [
  "place_id", "name_th", "name_en", "slug", "district", "province", "route_group", "category", "sub_category",
  "short_description_th", "short_description_en", "description_th", "description_en", "activities_th", "activities_en",
  "highlight_th", "highlight_en", "phone", "line_url", "facebook_url", "website_url", "google_maps_url", "latitude",
  "longitude", "coordinate_status", "open_time_th", "open_time_en", "fee_th", "fee_en", "cover_image_url",
  "gallery_image_urls", "video_url", "tags", "recommended_duration", "best_time_th", "best_time_en", "nearby_place_ids",
  "is_featured", "is_main_route_point", "sort_order", "status", "created_at", "updated_at"
];

var AdminPlaceSchema_PLACES_APPEND_HEADERS_ = [
  "address_th", "address_en", "facilities_th", "facilities_en", "gallery_media_ids",
  "entity_version", "published_version", "created_by", "updated_by", "published_at", "published_by",
  "archived_at", "archived_by"
];

var AdminPlaceSchema_DRAFT_HEADERS_ = [
  "place_id", "name_th", "name_en", "slug", "district", "province", "route_group", "category", "sub_category",
  "short_description_th", "short_description_en", "description_th", "description_en", "activities_th", "activities_en",
  "highlight_th", "highlight_en", "address_th", "address_en", "facilities_th", "facilities_en", "phone", "line_url",
  "facebook_url", "website_url", "google_maps_url", "latitude", "longitude", "coordinate_status", "open_time_th",
  "open_time_en", "fee_th", "fee_en", "cover_image_url", "gallery_image_urls", "video_url", "tags",
  "recommended_duration", "best_time_th", "best_time_en", "nearby_place_ids", "is_featured", "is_main_route_point",
  "sort_order", "gallery_media_ids", "draft_version", "base_published_version", "created_at", "updated_at",
  "created_by", "updated_by"
];

var AdminPlaceSchema_ACTIVITY_BASE_HEADERS_ = [
  "log_id", "admin_id", "action", "entity_type", "entity_id", "description", "created_at"
];
var AdminPlaceSchema_ACTIVITY_APPEND_HEADERS_ = ["audit_id", "actor_admin_id", "occurred_at"];
var AdminPlaceSchema_BOOLEAN_CONTENT_HEADERS_ = ["is_featured", "is_main_route_point"];
var AdminPlaceSchema_MIGRATION_INITIALIZATION_HEADERS_ = [
  "entity_version", "published_version", "created_by", "updated_by", "published_at", "published_by", "archived_at", "archived_by"
];
var AdminPlaceSchema_MIGRATION_PROPERTIES_ = {
  enabled: "ADMIN_PLACE_MIGRATION_ENABLED",
  backup: "ADMIN_PLACE_MIGRATION_BACKUP_REFERENCE",
  count: "ADMIN_PLACE_MIGRATION_EXPECTED_ROW_COUNT",
  digest: "ADMIN_PLACE_MIGRATION_EXPECTED_IDS_SHA256",
  actor: "ADMIN_PLACE_MIGRATION_ACTOR_ADMIN_ID"
};

function setupAdminPlaceSchema() {
  return AdminPlaceSchema_withLock_(function () {
    var spreadsheet = AdminPlaceSchema_getSpreadsheet_();
    var placesSheet = spreadsheet.getSheetByName(AdminPlaceSchema_PLACES_SHEET_NAME_);
    var activitySheet = spreadsheet.getSheetByName(AdminPlaceSchema_ACTIVITY_SHEET_NAME_);
    var draftsSheet = spreadsheet.getSheetByName(AdminPlaceSchema_DRAFTS_SHEET_NAME_);
    if (!placesSheet || !activitySheet) throw new Error("ADMIN_PLACE_SCHEMA_REQUIRED_SHEET");

    AdminPlaceSchema_preflightExistingSheet_(placesSheet, AdminPlaceSchema_PLACE_BASE_HEADERS_, true);
    AdminPlaceSchema_preflightExistingSheet_(activitySheet, AdminPlaceSchema_ACTIVITY_BASE_HEADERS_, false);
    if (draftsSheet) {
      AdminPlaceSchema_preflightExistingDraftSheet_(draftsSheet);
    }

    var placeIdentity = AdminPlaceSchema_readIdentitiesFromSheet_(placesSheet, "place_id");
    AdminPlaceSchema_assertUniqueIdentities_(placeIdentity, "ADMIN_PLACE_SCHEMA_PLACE_ID");
    if (draftsSheet && AdminPlaceSchema_hasPopulatedRows_(draftsSheet)) {
      AdminPlaceSchema_assertDraftTable_(
        SheetService_readTable_(AdminPlaceSchema_DRAFTS_SHEET_NAME_, AdminPlaceSchema_DRAFT_HEADERS_),
        SheetService_readTable_(AdminPlaceSchema_PLACES_SHEET_NAME_, AdminPlaceSchema_PLACE_BASE_HEADERS_.concat(AdminPlaceSchema_PLACES_APPEND_HEADERS_))
      );
    }
    if (!draftsSheet) {
      draftsSheet = spreadsheet.insertSheet(AdminPlaceSchema_DRAFTS_SHEET_NAME_);
    }
    var placeHeaders = SheetService_ensureHeaders_(
      AdminPlaceSchema_PLACES_SHEET_NAME_,
      AdminPlaceSchema_PLACE_BASE_HEADERS_.concat(AdminPlaceSchema_PLACES_APPEND_HEADERS_)
    );
    var draftHeaders = SheetService_ensureHeaders_(AdminPlaceSchema_DRAFTS_SHEET_NAME_, AdminPlaceSchema_DRAFT_HEADERS_);
    var activityHeaders = SheetService_ensureHeaders_(
      AdminPlaceSchema_ACTIVITY_SHEET_NAME_,
      AdminPlaceSchema_ACTIVITY_BASE_HEADERS_.concat(AdminPlaceSchema_ACTIVITY_APPEND_HEADERS_)
    );

    SheetService_assertUniqueHeaders_(placeHeaders.headers, AdminPlaceSchema_PLACE_BASE_HEADERS_.concat(AdminPlaceSchema_PLACES_APPEND_HEADERS_));
    SheetService_assertUniqueHeaders_(draftHeaders.headers, AdminPlaceSchema_DRAFT_HEADERS_);
    SheetService_assertUniqueHeaders_(activityHeaders.headers, AdminPlaceSchema_ACTIVITY_BASE_HEADERS_.concat(AdminPlaceSchema_ACTIVITY_APPEND_HEADERS_));
    AdminPlaceSchema_assertDraftTable_(
      SheetService_readTable_(AdminPlaceSchema_DRAFTS_SHEET_NAME_, AdminPlaceSchema_DRAFT_HEADERS_),
      SheetService_readTable_(AdminPlaceSchema_PLACES_SHEET_NAME_, AdminPlaceSchema_PLACE_BASE_HEADERS_.concat(AdminPlaceSchema_PLACES_APPEND_HEADERS_))
    );

    return {
      places_headers: placeHeaders.headers,
      place_drafts_headers: draftHeaders.headers,
      activity_logs_headers: activityHeaders.headers
    };
  });
}

function inspectAdminPlaceStatusMigration() {
  var state = AdminPlaceSchema_readMigrationSource_();
  AdminPlaceSchema_assertUnmigratedState_(state);
  return AdminPlaceSchema_buildLegacyReport_(state.places);
}

function migrateAdminPlaceLegacyStatuses() {
  return AdminPlaceSchema_withLock_(function () {
    var properties = PropertiesService.getScriptProperties();
    var controls = AdminPlaceSchema_readMigrationControls_(properties);
    var state = AdminPlaceSchema_readMigrationSource_();
    var report = AdminPlaceSchema_buildLegacyReport_(state.places);
    if (report.row_count !== controls.expectedRowCount || report.ids_sha256 !== controls.expectedIdsSha256) {
      throw new Error("ADMIN_PLACE_MIGRATION_SOURCE_MISMATCH");
    }
    AdminPlaceSchema_assertUnmigratedState_(state);

    var migrationTime = new Date().toISOString();
    var expectedDrafts = Object.create(null);
    var expectedPlaces = Object.create(null);
    state.places.rows.forEach(function (placeRow) {
      var source = placeRow.values;
      var mappedStatus = AdminPlaceSchema_mapLegacyStatus_(source.status);
      var hasDraft = mappedStatus === "draft";
      var publishedVersion = hasDraft ? 0 : 1;
      if (hasDraft) {
        var draft = AdminPlaceSchema_copyDraft_(source, migrationTime, controls.actorAdminId);
        SheetService_appendObjectWithRow_(AdminPlaceSchema_DRAFTS_SHEET_NAME_, AdminPlaceSchema_DRAFT_HEADERS_, draft);
        expectedDrafts[source.place_id] = draft;
      }

      var replacement = AdminPlaceSchema_placeMigrationReplacement_(source, mappedStatus, publishedVersion, migrationTime, controls.actorAdminId);
      SheetService_replaceObjectAtRow_(AdminPlaceSchema_PLACES_SHEET_NAME_, placeRow.sourceRowNumber, replacement);
      expectedPlaces[source.place_id] = replacement;
    });

    var verified = AdminPlaceSchema_verifyMigratedState_(controls.expectedRowCount, controls.expectedIdsSha256, expectedPlaces, expectedDrafts);
    properties.setProperty(AdminPlaceSchema_MIGRATION_PROPERTIES_.enabled, "false");
    properties.deleteProperty(AdminPlaceSchema_MIGRATION_PROPERTIES_.backup);
    properties.deleteProperty(AdminPlaceSchema_MIGRATION_PROPERTIES_.count);
    properties.deleteProperty(AdminPlaceSchema_MIGRATION_PROPERTIES_.digest);
    properties.deleteProperty(AdminPlaceSchema_MIGRATION_PROPERTIES_.actor);
    return verified;
  });
}

function verifyAdminPlaceStatusMigration() {
  var state = AdminPlaceSchema_readCurrentState_();
  var ids = state.places.rows.map(function (row) { return row.values.place_id; });
  var draftsById = AdminPlaceSchema_assertDraftTable_(state.drafts, state.places);
  var statusCounts = { published: 0, draft: 0, archived: 0 };

  state.places.rows.forEach(function (row) {
    var place = row.values;
    if (!Object.prototype.hasOwnProperty.call(statusCounts, place.status)) throw new Error("ADMIN_PLACE_MIGRATION_STATUS");
    statusCounts[place.status] += 1;
    if (place.entity_version !== 1 && String(place.entity_version) !== "1") throw new Error("ADMIN_PLACE_MIGRATION_VERSION");
    var expectedPublishedVersion = place.status === "draft" ? 0 : 1;
    if (Number(place.published_version) !== expectedPublishedVersion) throw new Error("ADMIN_PLACE_MIGRATION_VERSION");
    var draft = draftsById[place.place_id];
    if (place.status === "draft") {
      if (!draft || Number(draft.draft_version) !== 1 || Number(draft.base_published_version) !== 0) {
        throw new Error("ADMIN_PLACE_MIGRATION_DRAFT");
      }
    } else if (draft) {
      throw new Error("ADMIN_PLACE_MIGRATION_DRAFT");
    }
  });

  return {
    verified: true,
    row_count: ids.length,
    ids_sha256: AdminPlaceSchema_idsDigest_(ids),
    status_counts: statusCounts,
    draft_count: state.drafts.rows.length
  };
}

function AdminPlaceSchema_withLock_(operation) {
  var lock = LockService.getScriptLock();
  var acquired = false;
  try {
    if (!lock || !lock.tryLock(AdminPlaceSchema_LOCK_TIMEOUT_MS_)) throw new Error("ADMIN_PLACE_SCHEMA_LOCK");
    acquired = true;
    return operation();
  } finally {
    if (acquired) lock.releaseLock();
  }
}

function AdminPlaceSchema_getSpreadsheet_() {
  var config = getAppConfig_();
  if (!config.spreadsheetId) throw new Error("ADMIN_PLACE_SCHEMA_CONFIGURATION");
  return SpreadsheetApp.openById(config.spreadsheetId);
}

function AdminPlaceSchema_preflightExistingSheet_(sheet, requiredHeaders, validatePlaces) {
  var values = sheet.getDataRange().getValues();
  if (!values || !values.length || sheet.getLastRow() < 1) throw new Error("ADMIN_PLACE_SCHEMA_HEADERS");
  var headers = SheetService_normalizeHeaders_(values[0]);
  SheetService_assertUniqueHeaders_(headers, requiredHeaders);
  if (validatePlaces) {
    AdminPlaceSchema_assertUniqueIdentities_(AdminPlaceSchema_readIdentitiesFromSheet_(sheet, "place_id"), "ADMIN_PLACE_SCHEMA_PLACE_ID");
  }
}

function AdminPlaceSchema_preflightExistingDraftSheet_(sheet) {
  if (sheet.getLastRow() < 1) return;
  var values = sheet.getDataRange().getValues();
  var headers = SheetService_normalizeHeaders_(values[0]);
  SheetService_assertUniqueHeaders_(headers, []);
  var hasDataRows = values.slice(1).some(function (row) {
    return row.some(function (cell) { return !AdminPlaceSchema_isBlank_(cell); });
  });
  if (hasDataRows) SheetService_assertUniqueHeaders_(headers, AdminPlaceSchema_DRAFT_HEADERS_);
  if (headers.indexOf("place_id") !== -1) {
    AdminPlaceSchema_assertUniqueIdentities_(AdminPlaceSchema_readIdentitiesFromSheet_(sheet, "place_id"), "ADMIN_PLACE_SCHEMA_DRAFT_ID");
  } else if (hasDataRows) {
    throw new Error("ADMIN_PLACE_SCHEMA_DRAFT_ID");
  }
}

function AdminPlaceSchema_hasPopulatedRows_(sheet) {
  var values = sheet.getDataRange().getValues();
  return Boolean(values && values.slice(1).some(function (row) {
    return row.some(function (cell) { return !AdminPlaceSchema_isBlank_(cell); });
  }));
}

function AdminPlaceSchema_readIdentitiesFromSheet_(sheet, idHeader) {
  var values = sheet.getDataRange().getValues();
  if (!values || !values.length || sheet.getLastRow() < 1) return [];
  var headers = SheetService_normalizeHeaders_(values[0]);
  var headerMap = SheetService_assertUniqueHeaders_(headers, [idHeader]);
  return values.slice(1).filter(function (row) {
    return row.some(function (cell) { return !AdminPlaceSchema_isBlank_(cell); });
  }).map(function (row) { return row[headerMap[idHeader]]; });
}

function AdminPlaceSchema_assertUniqueIdentities_(ids, errorCode) {
  var seen = Object.create(null);
  ids.forEach(function (id) {
    if (typeof id !== "string" || !id || id !== id.trim()) throw new Error(errorCode);
    if (Object.prototype.hasOwnProperty.call(seen, id)) throw new Error(errorCode);
    seen[id] = true;
  });
  return seen;
}

function AdminPlaceSchema_readMigrationSource_() {
  var state = AdminPlaceSchema_readCurrentState_();
  AdminPlaceSchema_assertDraftTable_(state.drafts, state.places);
  state.places.rows.forEach(function (row) { AdminPlaceSchema_mapLegacyStatus_(row.values.status); });
  return state;
}

function AdminPlaceSchema_assertUnmigratedState_(state) {
  if (state.drafts.rows.length) throw new Error("ADMIN_PLACE_MIGRATION_MIXED_STATE");
  state.places.rows.forEach(function (placeRow) {
    if (AdminPlaceSchema_MIGRATION_INITIALIZATION_HEADERS_.some(function (header) {
      return !AdminPlaceSchema_isBlank_(placeRow.values[header]);
    })) {
      throw new Error("ADMIN_PLACE_MIGRATION_MIXED_STATE");
    }
  });
}

function AdminPlaceSchema_readCurrentState_() {
  var places = SheetService_readTable_(
    AdminPlaceSchema_PLACES_SHEET_NAME_,
    AdminPlaceSchema_PLACE_BASE_HEADERS_.concat(AdminPlaceSchema_PLACES_APPEND_HEADERS_)
  );
  var drafts = SheetService_readTable_(AdminPlaceSchema_DRAFTS_SHEET_NAME_, AdminPlaceSchema_DRAFT_HEADERS_);
  AdminPlaceSchema_assertUniqueIdentities_(places.rows.map(function (row) { return row.values.place_id; }), "ADMIN_PLACE_SCHEMA_PLACE_ID");
  return { places: places, drafts: drafts };
}

function AdminPlaceSchema_assertDraftTable_(drafts, places) {
  var ids = drafts.rows.map(function (row) { return row.values.place_id; });
  var draftIds = AdminPlaceSchema_assertUniqueIdentities_(ids, "ADMIN_PLACE_SCHEMA_DRAFT_ID");
  if (places) {
    var placeIds = AdminPlaceSchema_assertUniqueIdentities_(places.rows.map(function (row) { return row.values.place_id; }), "ADMIN_PLACE_SCHEMA_PLACE_ID");
    var placesById = Object.create(null);
    places.rows.forEach(function (row) { placesById[row.values.place_id] = row.values; });
    Object.keys(draftIds).forEach(function (id) {
      if (!Object.prototype.hasOwnProperty.call(placeIds, id)) throw new Error("ADMIN_PLACE_SCHEMA_DRAFT_OWNER");
      var draftRow = drafts.rows.filter(function (row) { return row.values.place_id === id; })[0].values;
      var place = placesById[id];
      var draftVersion = AdminPlaceSchema_storedInteger_(draftRow.draft_version, true);
      var basePublishedVersion = AdminPlaceSchema_storedInteger_(draftRow.base_published_version, false);
      var entityVersion = AdminPlaceSchema_storedInteger_(place.entity_version, true);
      var publishedVersion = AdminPlaceSchema_storedInteger_(place.published_version, false);
      if (draftVersion !== entityVersion || basePublishedVersion !== publishedVersion) {
        throw new Error("ADMIN_PLACE_SCHEMA_DRAFT_VERSION");
      }
    });
  }
  var byId = Object.create(null);
  drafts.rows.forEach(function (row) { byId[row.values.place_id] = row.values; });
  return byId;
}

function AdminPlaceSchema_buildLegacyReport_(places) {
  var ids = [];
  var sourceStatusCounts = { published: 0, draft: 0, hidden: 0, archived: 0, deleted: 0 };
  var statusCounts = { published: 0, draft: 0, archived: 0 };
  var proposedDraftCount = 0;
  places.rows.forEach(function (row) {
    var place = row.values;
    var mapped = AdminPlaceSchema_mapLegacyStatus_(place.status);
    ids.push(place.place_id);
    sourceStatusCounts[place.status] += 1;
    statusCounts[mapped] += 1;
    if (mapped === "draft") proposedDraftCount += 1;
  });
  return {
    row_count: ids.length,
    ids_sha256: AdminPlaceSchema_idsDigest_(ids),
    source_status_counts: sourceStatusCounts,
    status_counts: statusCounts,
    proposed_draft_count: proposedDraftCount
  };
}

function AdminPlaceSchema_mapLegacyStatus_(status) {
  if (status === "published") return "published";
  if (status === "draft" || status === "hidden") return "draft";
  if (status === "archived" || status === "deleted") return "archived";
  throw new Error("ADMIN_PLACE_MIGRATION_STATUS");
}

function AdminPlaceSchema_readMigrationControls_(properties) {
  var enabled = properties.getProperty(AdminPlaceSchema_MIGRATION_PROPERTIES_.enabled);
  var backup = properties.getProperty(AdminPlaceSchema_MIGRATION_PROPERTIES_.backup);
  var countText = properties.getProperty(AdminPlaceSchema_MIGRATION_PROPERTIES_.count);
  var digest = properties.getProperty(AdminPlaceSchema_MIGRATION_PROPERTIES_.digest);
  var actor = properties.getProperty(AdminPlaceSchema_MIGRATION_PROPERTIES_.actor);
  if (enabled !== "true" || typeof backup !== "string" || !backup.trim()) throw new Error("ADMIN_PLACE_MIGRATION_DISABLED");
  if (!/^(?:0|[1-9]\d*)$/.test(countText || "") || !Number.isSafeInteger(Number(countText))) {
    throw new Error("ADMIN_PLACE_MIGRATION_COUNT");
  }
  if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) throw new Error("ADMIN_PLACE_MIGRATION_DIGEST");
  if (typeof actor !== "string" || !/^ADM-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actor)) {
    throw new Error("ADMIN_PLACE_MIGRATION_ACTOR");
  }
  return { expectedRowCount: Number(countText), expectedIdsSha256: digest, actorAdminId: actor };
}

function AdminPlaceSchema_copyDraft_(source, migrationTime, actorAdminId) {
  var draft = Object.create(null);
  AdminPlaceSchema_DRAFT_HEADERS_.forEach(function (header) {
    draft[header] = Object.prototype.hasOwnProperty.call(source, header) ? source[header] : "";
  });
  draft.place_id = source.place_id;
  draft.draft_version = 1;
  draft.base_published_version = 0;
  draft.created_by = actorAdminId;
  draft.updated_at = migrationTime;
  draft.updated_by = actorAdminId;
  return draft;
}

function AdminPlaceSchema_placeMigrationReplacement_(source, status, publishedVersion, migrationTime, actorAdminId) {
  var replacement = Object.create(null);
  if (status === "draft") {
    AdminPlaceSchema_contentHeaders_().forEach(function (header) {
      replacement[header] = AdminPlaceSchema_BOOLEAN_CONTENT_HEADERS_.indexOf(header) !== -1 ? false : "";
    });
  }
  replacement.status = status;
  replacement.entity_version = 1;
  replacement.published_version = publishedVersion;
  replacement.created_by = actorAdminId;
  replacement.updated_at = migrationTime;
  replacement.updated_by = actorAdminId;
  return replacement;
}

function AdminPlaceSchema_contentHeaders_() {
  return AdminPlaceSchema_DRAFT_HEADERS_.filter(function (header) {
    return [
      "place_id", "draft_version", "base_published_version", "created_at", "updated_at", "created_by", "updated_by"
    ].indexOf(header) === -1;
  });
}

function AdminPlaceSchema_verifyMigratedState_(expectedCount, expectedDigest, expectedPlaces, expectedDrafts) {
  var report = verifyAdminPlaceStatusMigration();
  if (report.row_count !== expectedCount || report.ids_sha256 !== expectedDigest) {
    throw new Error("ADMIN_PLACE_MIGRATION_VERIFY_SOURCE");
  }
  var state = AdminPlaceSchema_readCurrentState_();
  var actualPlaces = Object.create(null);
  state.places.rows.forEach(function (row) { actualPlaces[row.values.place_id] = row.values; });
  Object.keys(expectedPlaces).forEach(function (id) {
    var expected = expectedPlaces[id];
    var actual = actualPlaces[id];
    Object.keys(expected).forEach(function (field) {
      if (actual[field] !== expected[field]) throw new Error("ADMIN_PLACE_MIGRATION_VERIFY_PLACE");
    });
  });
  var actualDrafts = AdminPlaceSchema_assertDraftTable_(state.drafts, state.places);
  if (Object.keys(actualDrafts).length !== Object.keys(expectedDrafts).length) throw new Error("ADMIN_PLACE_MIGRATION_VERIFY_DRAFT");
  Object.keys(expectedDrafts).forEach(function (id) {
    var expected = expectedDrafts[id];
    var actual = actualDrafts[id];
    AdminPlaceSchema_DRAFT_HEADERS_.forEach(function (field) {
      if (!actual || actual[field] !== expected[field]) throw new Error("ADMIN_PLACE_MIGRATION_VERIFY_DRAFT");
    });
  });
  return report;
}

function AdminPlaceSchema_idsDigest_(ids) {
  AdminPlaceSchema_assertUniqueIdentities_(ids, "ADMIN_PLACE_SCHEMA_PLACE_ID");
  var sorted = ids.slice().sort();
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sorted.join("\n"), Utilities.Charset.UTF_8);
  return bytes.map(function (value) {
    var unsigned = value < 0 ? value + 256 : value;
    return ("0" + unsigned.toString(16)).slice(-2);
  }).join("");
}

function AdminPlaceSchema_isBlank_(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function AdminPlaceSchema_storedInteger_(value, positive) {
  var numberValue;
  if (typeof value === "number") {
    numberValue = value;
  } else if (typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value)) {
    numberValue = Number(value);
  } else {
    throw new Error("ADMIN_PLACE_SCHEMA_DRAFT_VERSION");
  }
  if (!Number.isSafeInteger(numberValue) || numberValue < (positive ? 1 : 0)) {
    throw new Error("ADMIN_PLACE_SCHEMA_DRAFT_VERSION");
  }
  return numberValue;
}
