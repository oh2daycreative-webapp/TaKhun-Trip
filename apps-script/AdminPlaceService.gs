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
var AdminPlaceService_CREATE_KEYS_ = ["content"];
var AdminPlaceService_SAVE_KEYS_ = ["place_id", "expected_version", "content"];
var AdminPlaceService_PUBLISH_KEYS_ = ["place_id", "expected_version"];
var AdminPlaceService_UNPUBLISH_KEYS_ = ["place_id", "expected_version"];
var AdminPlaceService_ARCHIVE_KEYS_ = ["place_id", "expected_version", "confirmed"];
var AdminPlaceService_RESTORE_KEYS_ = ["place_id", "expected_version"];
var AdminPlaceService_DEPENDENCY_KEYS_ = ["place_id"];
var AdminPlaceService_MEDIA_KEYS_ = ["place_id", "keyword", "role", "page", "page_size"];
var AdminPlaceService_MEDIA_ID_PATTERN_ = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var AdminPlaceService_MEDIA_MAX_ITEMS_ = 50;
var AdminPlaceService_DEPENDENCY_COMMON_STATUSES_ = ["draft", "published", "hidden", "archived", "deleted"];
var AdminPlaceService_DEPENDENCY_REVIEW_STATUSES_ = ["pending", "approved", "hidden", "deleted"];
var AdminPlaceService_DEPENDENCY_GROUP_KEYS_ = [
  "routes", "nearby_places", "products", "events", "gallery", "trip_templates", "reviews"
];
var AdminPlaceService_DEPENDENCY_HEADERS_ = {
  places: ["place_id", "name_th", "name_en", "nearby_place_ids", "status"],
  routes: ["route_id", "name_th", "name_en", "status"],
  route_places: ["route_place_id", "route_id", "place_id", "status"],
  products: ["product_id", "name_th", "name_en", "related_place_id", "status"],
  events: ["event_id", "title_th", "title_en", "related_place_id", "status"],
  gallery: ["media_id", "title_th", "title_en", "related_place_id", "status"],
  trip_templates: ["template_id", "name_th", "name_en", "place_ids", "status"],
  reviews: ["review_id", "place_id", "reviewer_name", "is_anonymous", "status"]
};
var AdminPlaceService_PUBLISH_REQUIRED_HEADERS_ = [
  "name_th", "district", "province", "category", "short_description_th", "description_th", "coordinate_status"
];
var AdminPlaceService_DISTRICTS_ = ["ban_ta_khun", "khiri_rat_nikhom", "phanom"];
var AdminPlaceService_ROUTE_GROUPS_ = [
  "main_point_1", "main_point_2", "main_point_3", "main_point_4", "nearby_khiri_rat_nikhom", "nearby_phanom"
];
var AdminPlaceService_COORDINATE_STATUSES_ = [
  "verified", "pending_verify", "needs_survey", "no_coordinate", "approximate"
];
var AdminPlaceService_URL_HEADERS_ = ["line_url", "facebook_url", "website_url", "google_maps_url"];
var AdminPlaceService_BOOLEAN_HEADERS_ = ["is_featured", "is_main_route_point"];
var AdminPlaceService_NON_HUMAN_TEXT_HEADERS_ = ["slug", "district", "route_group", "category", "coordinate_status"];
var AdminPlaceService_MAX_TEXT_LENGTH_ = 20000;
var AdminPlaceService_MAX_URL_LENGTH_ = 2048;
var AdminPlaceService_MAX_LIST_ITEMS_ = 100;
var AdminPlaceService_MAX_LIST_ITEM_LENGTH_ = 200;

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

function adminGetPlaceMediaOptions_(token, payload) {
  return AdminPlaceService_execute_(token, function () {
    var parameters = AdminPlaceService_mediaParameters_(payload);
    var context = AdminPlaceService_requireContext_(false);
    if (!context.placesById[parameters.place_id]) throw new Error("NOT_FOUND");
    var manifest = AdminPlaceService_readApprovedMedia_();
    var items = manifest.items.filter(function (item) {
      if (item.entity_type !== "place" || item.entity_id !== parameters.place_id) return false;
      if (item.role !== "cover" && item.role !== "gallery") return false;
      if (item.role === "cover" && item.media_id !== "place-" + parameters.place_id.toLowerCase() + "-cover") return false;
      if (parameters.role !== "all" && item.role !== parameters.role) return false;
      if (!parameters.keyword) return true;
      return [item.media_id, item.alt_th, item.alt_en].some(function (value) {
        return AdminPlaceService_lowerText_(value).indexOf(parameters.keyword) !== -1;
      });
    }).sort(function (left, right) {
      return left.media_id < right.media_id ? -1 : left.media_id > right.media_id ? 1 : 0;
    });
    var total = items.length;
    var start = (parameters.page - 1) * parameters.page_size;
    return AdminPlaceService_success_({
      items: items.slice(start, start + parameters.page_size).map(AdminPlaceService_safeMediaProjection_),
      page: parameters.page,
      page_size: parameters.page_size,
      total: total,
      total_pages: total ? Math.ceil(total / parameters.page_size) : 0
    });
  });
}

function adminCreatePlace_(token, payload) {
  return AdminPlaceService_execute_(token, function (admin) {
    AdminPlaceService_requireWriteRole_(admin);
    var parameters = AdminPlaceService_createParameters_(payload);
    return AdminPlaceService_withWriteLock_(function () {
      var context = AdminPlaceService_requireContext_(true);
      var placeId = AdminPlaceService_generatePlaceId_();
      if (Object.prototype.hasOwnProperty.call(context.placesById, placeId) ||
          Object.prototype.hasOwnProperty.call(context.draftsById, placeId)) {
        throw new Error("ADMIN_PLACE_ID_COLLISION");
      }
      var state = AdminPlaceService_captureState_(placeId, false);
      try {
        var occurredAt = new Date().toISOString();
        var placeRecord = AdminPlaceService_neutralIdentity_(placeId, occurredAt, admin.admin_id);
        var draftRecord = AdminPlaceService_newDraft_(placeId, parameters.content, 1, 0, occurredAt, admin.admin_id, null);
        var appendedPlace = SheetService_appendObjectWithRow_(
          AdminPlaceSchema_PLACES_SHEET_NAME_, state.place_headers, placeRecord
        );
        state.allocated_rows.place = AdminPlaceService_appendedRowNumber_(appendedPlace);
        var appendedDraft = SheetService_appendObjectWithRow_(
          AdminPlaceSchema_DRAFTS_SHEET_NAME_, state.draft_headers, draftRecord
        );
        state.allocated_rows.draft = AdminPlaceService_appendedRowNumber_(appendedDraft);
        AdminPlaceService_verifyIntendedState_(state, {
          place: {
            sourceRowNumber: state.allocated_rows.place,
            values: AdminPlaceService_completeRow_(state.place_headers, placeRecord)
          },
          draft: {
            sourceRowNumber: state.allocated_rows.draft,
            values: AdminPlaceService_completeRow_(state.draft_headers, draftRecord)
          }
        });
        AdminPlaceService_appendVerifiedAudit_(admin, "CREATE", placeId);
        return AdminPlaceService_success_(AdminPlaceService_writeSuccess_(
          placeId, "draft", 1, 0, true, occurredAt, occurredAt
        ));
      } catch (error) {
        return AdminPlaceService_failClosed_(state);
      }
    });
  });
}

function adminSavePlaceDraft_(token, payload) {
  return AdminPlaceService_execute_(token, function (admin) {
    AdminPlaceService_requireWriteRole_(admin);
    var parameters = AdminPlaceService_saveParameters_(payload);
    return AdminPlaceService_withWriteLock_(function () {
      var context = AdminPlaceService_requireContext_(true);
      var place = context.placesById[parameters.place_id];
      if (!place) throw new Error("NOT_FOUND");
      if (place.row.status === "archived") throw new Error("VALIDATION_ERROR");
      var draft = context.draftsById[parameters.place_id] || null;
      if (draft) {
        AdminPlaceService_requireExpectedVersion_(
          parameters.expected_version, place.entityVersion, draft.basePublishedVersion, place.publishedVersion
        );
      } else {
        AdminPlaceService_requireExpectedVersion_(parameters.expected_version, place.entityVersion);
      }
      if (place.entityVersion >= Number.MAX_SAFE_INTEGER) throw new Error("ADMIN_PLACE_VERSION");
      parameters.content.gallery_media_ids = AdminPlaceService_validatePlaceMedia_(
        parameters.place_id, parameters.content.gallery_media_ids
      );

      var state = AdminPlaceService_captureState_(parameters.place_id, false);
      AdminPlaceService_setSelectiveRestore_(state, "place", []);
      AdminPlaceService_setSelectiveRestore_(state, "draft", []);
      var responseCreatedAt = AdminPlaceService_safeTimestamp_(state.rows.place.values.created_at);
      try {
        var occurredAt = new Date().toISOString();
        var nextVersion = place.entityVersion + 1;
        var placePatch = {
          entity_version: nextVersion,
          updated_at: occurredAt,
          updated_by: admin.admin_id
        };
        AdminPlaceService_applySelectivePatch_(
          state, "place", AdminPlaceSchema_PLACES_SHEET_NAME_, state.rows.place.sourceRowNumber,
          ["entity_version", "updated_at", "updated_by"], placePatch
        );
        var intendedPlace = {
          sourceRowNumber: state.rows.place.sourceRowNumber,
          values: AdminPlaceService_mergeRow_(state.rows.place.values, placePatch)
        };

        var intendedDraft;
        if (draft) {
          var draftPatch = AdminPlaceService_existingDraftPatch_(
            parameters.content, nextVersion, occurredAt, admin.admin_id
          );
          AdminPlaceService_applySelectivePatch_(
            state, "draft", AdminPlaceSchema_DRAFTS_SHEET_NAME_, state.rows.draft.sourceRowNumber,
            AdminPlaceService_CONTENT_HEADERS_.concat(["draft_version", "updated_at", "updated_by"]), draftPatch
          );
          intendedDraft = {
            sourceRowNumber: state.rows.draft.sourceRowNumber,
            values: AdminPlaceService_mergeRow_(state.rows.draft.values, draftPatch)
          };
        } else {
          var draftRecord = AdminPlaceService_newDraft_(
            parameters.place_id, parameters.content, nextVersion, place.publishedVersion,
            occurredAt, admin.admin_id, state.rows.place.values
          );
          var appendedDraft = SheetService_appendObjectWithRow_(
            AdminPlaceSchema_DRAFTS_SHEET_NAME_, state.draft_headers, draftRecord
          );
          state.allocated_rows.draft = AdminPlaceService_appendedRowNumber_(appendedDraft);
          intendedDraft = {
            sourceRowNumber: state.allocated_rows.draft,
            values: AdminPlaceService_completeRow_(state.draft_headers, draftRecord)
          };
        }
        AdminPlaceService_verifyIntendedState_(state, { place: intendedPlace, draft: intendedDraft });
        AdminPlaceService_appendVerifiedAudit_(admin, "UPDATE_DRAFT", parameters.place_id);
        return AdminPlaceService_success_(AdminPlaceService_writeSuccess_(
          parameters.place_id, place.row.status, nextVersion, place.publishedVersion, true,
          responseCreatedAt, occurredAt
        ));
      } catch (error) {
        return AdminPlaceService_failClosed_(state);
      }
    });
  });
}

function adminPublishPlace_(token, payload) {
  return AdminPlaceService_execute_(token, function (admin) {
    AdminPlaceService_requireWriteRole_(admin);
    var parameters = AdminPlaceService_publishParameters_(payload);
    return AdminPlaceService_withWriteLock_(function () {
      var context = AdminPlaceService_requireContext_(false, parameters.place_id);
      var place = context.placesById[parameters.place_id];
      if (!place) throw new Error("NOT_FOUND");
      var draft = context.draftsById[parameters.place_id] || null;
      if (!draft) throw new Error("NOT_FOUND");
      var state = AdminPlaceService_captureState_(parameters.place_id, true);
      if (!state.rows.place || !state.rows.draft) throw new Error("NOT_FOUND");
      var capturedPlace = state.rows.place.values;
      var capturedDraft = state.rows.draft.values;
      if (capturedPlace.status === "archived") throw new Error("VALIDATION_ERROR");
      var entityVersion = AdminPlaceService_storedInteger_(capturedPlace.entity_version, true);
      var publishedVersion = AdminPlaceService_storedInteger_(capturedPlace.published_version, false);
      var draftVersion = AdminPlaceService_storedInteger_(capturedDraft.draft_version, true);
      var basePublishedVersion = AdminPlaceService_storedInteger_(capturedDraft.base_published_version, false);
      AdminPlaceService_requireExpectedVersion_(
        parameters.expected_version, entityVersion, basePublishedVersion, publishedVersion
      );
      if (draftVersion !== entityVersion) throw new Error("ADMIN_PLACE_DRAFT_VERSION");
      if (entityVersion >= Number.MAX_SAFE_INTEGER || publishedVersion >= Number.MAX_SAFE_INTEGER) {
        throw new Error("ADMIN_PLACE_VERSION");
      }
      var promotedContent = AdminPlaceService_publishContent_(capturedDraft, parameters.place_id);
      var responseCreatedAt = AdminPlaceService_safeTimestamp_(state.rows.place.values.created_at);
      try {
        var occurredAt = new Date().toISOString();
        var nextEntityVersion = entityVersion + 1;
        var nextPublishedVersion = publishedVersion + 1;
        var promotedPlace = AdminPlaceService_mergeRow_(state.rows.place.values, promotedContent);
        promotedPlace.cover_image_url = state.rows.draft.values.cover_image_url;
        promotedPlace.gallery_image_urls = state.rows.draft.values.gallery_image_urls;
        promotedPlace.video_url = state.rows.draft.values.video_url;
        promotedPlace.status = "published";
        promotedPlace.entity_version = nextEntityVersion;
        promotedPlace.published_version = nextPublishedVersion;
        promotedPlace.updated_at = occurredAt;
        promotedPlace.updated_by = admin.admin_id;
        promotedPlace.published_at = occurredAt;
        promotedPlace.published_by = admin.admin_id;
        var intended = {
          place: { sourceRowNumber: state.rows.place.sourceRowNumber, values: promotedPlace },
          draft: { absent: true, sourceRowNumber: state.rows.draft.sourceRowNumber }
        };

        SheetService_replaceObjectAtRow_(
          AdminPlaceSchema_PLACES_SHEET_NAME_, state.rows.place.sourceRowNumber, promotedPlace
        );
        SheetService_clearRow_(AdminPlaceSchema_DRAFTS_SHEET_NAME_, state.rows.draft.sourceRowNumber);
        AdminPlaceService_verifyIntendedState_(state, intended);
        var nextEpoch = PlaceService_bumpCacheEpoch_();
        AdminPlaceService_verifyCacheEpoch_(nextEpoch);
        var audit = AdminPlaceService_appendVerifiedAudit_(admin, "PUBLISH", parameters.place_id);
        state.audit = audit;
        AdminPlaceService_verifyIntendedState_(state, intended);
        AdminPlaceService_verifyCacheEpoch_(nextEpoch);
        var response = AdminPlaceService_success_(AdminPlaceService_writeSuccess_(
          parameters.place_id, "published", nextEntityVersion, nextPublishedVersion, false,
          responseCreatedAt, occurredAt
        ));
        state.audit = null;
        return response;
      } catch (error) {
        return AdminPlaceService_failClosed_(state);
      }
    });
  });
}

function adminInspectPlaceDependencies_(token, payload) {
  return AdminPlaceService_execute_(token, function () {
    var parameters = AdminPlaceService_dependencyParameters_(payload);
    return AdminPlaceService_success_(AdminPlaceService_inspectDependencies_(parameters.place_id));
  });
}

function adminUnpublishPlace_(token, payload) {
  return AdminPlaceService_execute_(token, function (admin) {
    AdminPlaceService_requireWriteRole_(admin);
    var parameters = AdminPlaceService_lifecycleParameters_(payload, AdminPlaceService_UNPUBLISH_KEYS_, false);
    return AdminPlaceService_withWriteLock_(function () {
      AdminPlaceService_requireContext_(true);
      var state = AdminPlaceService_captureState_(parameters.place_id, true);
      var lifecycle = AdminPlaceService_requireLifecycleState_(state, parameters.expected_version, ["published"]);
      return AdminPlaceService_applyLifecycleWrite_(admin, state, lifecycle, "UNPUBLISH", "draft", true, true, false);
    });
  });
}

function adminArchivePlace_(token, payload) {
  return AdminPlaceService_execute_(token, function (admin) {
    AdminPlaceService_requireWriteRole_(admin);
    var parameters = AdminPlaceService_lifecycleParameters_(payload, AdminPlaceService_ARCHIVE_KEYS_, true);
    return AdminPlaceService_withWriteLock_(function () {
      var context = AdminPlaceService_requireContext_(true);
      var place = context.placesById[parameters.place_id];
      if (!place) throw new Error("NOT_FOUND");
      if (place.row.status !== "draft" && place.row.status !== "published") throw new Error("VALIDATION_ERROR");
      var includeEpoch = place.row.status === "published";
      var state = AdminPlaceService_captureState_(parameters.place_id, includeEpoch);
      var lifecycle = AdminPlaceService_requireLifecycleState_(state, parameters.expected_version, ["draft", "published"]);
      if ((lifecycle.status === "published") !== includeEpoch) throw new Error("ADMIN_PLACE_STATE_VERIFY");
      var dependencies = AdminPlaceService_inspectDependencies_(parameters.place_id).groups;
      var result = AdminPlaceService_applyLifecycleWrite_(
        admin, state, lifecycle, "ARCHIVE", "archived", false, includeEpoch, false
      );
      if (result && result.ok === true && result.data) result.data.dependencies = dependencies;
      return result;
    });
  });
}

function adminRestorePlace_(token, payload) {
  return AdminPlaceService_execute_(token, function (admin) {
    AdminPlaceService_requireWriteRole_(admin);
    var parameters = AdminPlaceService_lifecycleParameters_(payload, AdminPlaceService_RESTORE_KEYS_, false);
    return AdminPlaceService_withWriteLock_(function () {
      AdminPlaceService_requireContext_(true);
      var state = AdminPlaceService_captureState_(parameters.place_id, false);
      var lifecycle = AdminPlaceService_requireLifecycleState_(state, parameters.expected_version, ["archived"]);
      return AdminPlaceService_applyLifecycleWrite_(admin, state, lifecycle, "RESTORE", "draft", true, false, true);
    });
  });
}

function AdminPlaceService_lifecycleParameters_(payload, keys, requireConfirmation) {
  var source = AdminPlaceService_plainObject_(payload, false);
  AdminPlaceService_requireExactKeys_(source, keys);
  if (!AdminPlaceService_validId_(source.place_id) || typeof source.expected_version !== "number" ||
      !Number.isSafeInteger(source.expected_version) || source.expected_version < 1 ||
      (requireConfirmation && source.confirmed !== true)) {
    throw new Error("VALIDATION_ERROR");
  }
  return { place_id: source.place_id, expected_version: source.expected_version };
}

function AdminPlaceService_requireLifecycleState_(state, expectedVersion, allowedStatuses) {
  if (!state || !state.rows || !state.rows.place || !Array.isArray(allowedStatuses)) throw new Error("NOT_FOUND");
  var place = state.rows.place.values;
  if (allowedStatuses.indexOf(place.status) === -1) throw new Error("VALIDATION_ERROR");
  var entityVersion = AdminPlaceService_storedInteger_(place.entity_version, true);
  var publishedVersion = AdminPlaceService_storedInteger_(place.published_version, false);
  var draft = state.rows.draft ? state.rows.draft.values : null;
  if (draft) {
    var draftVersion = AdminPlaceService_storedInteger_(draft.draft_version, true);
    var basePublishedVersion = AdminPlaceService_storedInteger_(draft.base_published_version, false);
    AdminPlaceService_requireExpectedVersion_(expectedVersion, entityVersion, basePublishedVersion, publishedVersion);
    if (draftVersion !== entityVersion) throw new Error("ADMIN_PLACE_DRAFT_VERSION");
  } else {
    AdminPlaceService_requireExpectedVersion_(expectedVersion, entityVersion);
  }
  if (place.status === "draft" && !draft) throw new Error("ADMIN_PLACE_DRAFT_REQUIRED");
  if (entityVersion >= Number.MAX_SAFE_INTEGER) throw new Error("ADMIN_PLACE_VERSION");
  return { status: place.status, entityVersion: entityVersion, publishedVersion: publishedVersion, hasDraft: Boolean(draft) };
}

function AdminPlaceService_applyLifecycleWrite_(admin, state, lifecycle, action, targetStatus, ensureDraft, bumpEpoch, clearArchive) {
  var responseCreatedAt = AdminPlaceService_safeTimestamp_(state.rows.place.values.created_at);
  AdminPlaceService_setSelectiveRestore_(state, "place", []);
  AdminPlaceService_setSelectiveRestore_(state, "draft", []);
  try {
    var occurredAt = new Date().toISOString();
    var nextVersion = lifecycle.entityVersion + 1;
    var placePatch = {
      status: targetStatus,
      entity_version: nextVersion,
      updated_at: occurredAt,
      updated_by: admin.admin_id
    };
    var placeFields = ["status", "entity_version", "updated_at", "updated_by"];
    if (action === "ARCHIVE") {
      placePatch.archived_at = occurredAt;
      placePatch.archived_by = admin.admin_id;
      placeFields.push("archived_at", "archived_by");
    } else if (clearArchive) {
      placePatch.archived_at = "";
      placePatch.archived_by = "";
      placeFields.push("archived_at", "archived_by");
    }
    AdminPlaceService_applySelectivePatch_(
      state, "place", AdminPlaceSchema_PLACES_SHEET_NAME_, state.rows.place.sourceRowNumber, placeFields, placePatch
    );
    var intendedPlace = {
      sourceRowNumber: state.rows.place.sourceRowNumber,
      values: AdminPlaceService_mergeRow_(state.rows.place.values, placePatch)
    };

    var intendedDraft = { absent: true, sourceRowNumber: null };
    if (state.rows.draft) {
      var draftPatch = { draft_version: nextVersion, updated_at: occurredAt, updated_by: admin.admin_id };
      AdminPlaceService_applySelectivePatch_(
        state, "draft", AdminPlaceSchema_DRAFTS_SHEET_NAME_, state.rows.draft.sourceRowNumber,
        ["draft_version", "updated_at", "updated_by"], draftPatch
      );
      intendedDraft = {
        sourceRowNumber: state.rows.draft.sourceRowNumber,
        values: AdminPlaceService_mergeRow_(state.rows.draft.values, draftPatch)
      };
    } else if (ensureDraft) {
      var draftRecord = AdminPlaceService_newDraft_(
        state.place_id, AdminPlaceService_projectContent_(state.rows.place.values), nextVersion,
        lifecycle.publishedVersion, occurredAt, admin.admin_id, state.rows.place.values
      );
      var appendedDraft = SheetService_appendObjectWithRow_(
        AdminPlaceSchema_DRAFTS_SHEET_NAME_, state.draft_headers, draftRecord
      );
      state.allocated_rows.draft = AdminPlaceService_appendedRowNumber_(appendedDraft);
      intendedDraft = {
        sourceRowNumber: state.allocated_rows.draft,
        values: AdminPlaceService_completeRow_(state.draft_headers, draftRecord)
      };
    }

    var intended = { place: intendedPlace, draft: intendedDraft };
    AdminPlaceService_verifyIntendedState_(state, intended);
    var nextEpoch = null;
    if (bumpEpoch) {
      nextEpoch = PlaceService_bumpCacheEpoch_();
      AdminPlaceService_verifyCacheEpoch_(nextEpoch);
    }
    state.audit = AdminPlaceService_appendVerifiedAudit_(admin, action, state.place_id);
    AdminPlaceService_verifyIntendedState_(state, intended);
    if (bumpEpoch) AdminPlaceService_verifyCacheEpoch_(nextEpoch);
    var response = AdminPlaceService_success_(AdminPlaceService_writeSuccess_(
      state.place_id, targetStatus, nextVersion, lifecycle.publishedVersion, Boolean(state.rows.draft || ensureDraft),
      responseCreatedAt, occurredAt
    ));
    state.audit = null;
    return response;
  } catch (_error) {
    return AdminPlaceService_failClosed_(state);
  }
}

function AdminPlaceService_dependencyParameters_(payload) {
  var source = AdminPlaceService_plainObject_(payload, false);
  AdminPlaceService_requireExactKeys_(source, AdminPlaceService_DEPENDENCY_KEYS_);
  if (!AdminPlaceService_validId_(source.place_id)) throw new Error("VALIDATION_ERROR");
  return { place_id: source.place_id };
}

function AdminPlaceService_inspectDependencies_(placeId) {
  if (!AdminPlaceService_validId_(placeId)) throw new Error("VALIDATION_ERROR");
  var tables = {
    places: SheetService_readTable_(AdminPlaceSchema_PLACES_SHEET_NAME_, AdminPlaceService_DEPENDENCY_HEADERS_.places),
    routes: SheetService_readTable_("routes", AdminPlaceService_DEPENDENCY_HEADERS_.routes),
    route_places: SheetService_readTable_("route_places", AdminPlaceService_DEPENDENCY_HEADERS_.route_places),
    products: SheetService_readTable_("products", AdminPlaceService_DEPENDENCY_HEADERS_.products),
    events: SheetService_readTable_("events", AdminPlaceService_DEPENDENCY_HEADERS_.events),
    gallery: SheetService_readTable_("gallery", AdminPlaceService_DEPENDENCY_HEADERS_.gallery),
    trip_templates: SheetService_readTable_("trip_templates", AdminPlaceService_DEPENDENCY_HEADERS_.trip_templates),
    reviews: SheetService_readTable_("reviews", AdminPlaceService_DEPENDENCY_HEADERS_.reviews)
  };
  var groups = {};
  AdminPlaceService_DEPENDENCY_GROUP_KEYS_.forEach(function (key) { groups[key] = []; });

  var places = AdminPlaceService_dependencyIndex_(
    tables.places, "place_id", AdminPlaceService_STATUSES_, "ADMIN_PLACE_DEPENDENCY_PLACE"
  );
  if (!Object.prototype.hasOwnProperty.call(places, placeId)) throw new Error("NOT_FOUND");
  Object.keys(places).forEach(function (referrerId) {
    var referrer = places[referrerId];
    if (referrerId === placeId) return;
    var memberships = AdminPlaceService_dependencyList_(referrer.nearby_place_ids);
    if (memberships.indexOf(placeId) !== -1) {
      AdminPlaceService_dependencyAdd_(groups.nearby_places, referrerId,
        AdminPlaceService_dependencyLabel_(referrer.name_th, referrer.name_en, referrerId));
    }
  });

  var routes = AdminPlaceService_dependencyIndex_(
    tables.routes, "route_id", AdminPlaceService_DEPENDENCY_COMMON_STATUSES_, "ADMIN_PLACE_DEPENDENCY_ROUTE"
  );
  var routePlaces = AdminPlaceService_dependencyIndex_(
    tables.route_places, "route_place_id", AdminPlaceService_DEPENDENCY_COMMON_STATUSES_, "ADMIN_PLACE_DEPENDENCY_ROUTE_PLACE"
  );
  Object.keys(routePlaces).forEach(function (relationshipId) {
    var relationship = routePlaces[relationshipId];
    if (relationship.status === "deleted") return;
    var relationshipPlaceId = AdminPlaceService_dependencyReference_(relationship.place_id, false);
    var routeId = AdminPlaceService_dependencyReference_(relationship.route_id, false);
    if (relationshipPlaceId !== placeId) return;
    if (!Object.prototype.hasOwnProperty.call(routes, routeId)) throw new Error("ADMIN_PLACE_DEPENDENCY_ORPHAN_ROUTE");
    var route = routes[routeId];
    if (route.status === "deleted") return;
    AdminPlaceService_dependencyAdd_(groups.routes, routeId,
      AdminPlaceService_dependencyLabel_(route.name_th, route.name_en, routeId));
  });

  AdminPlaceService_dependencyScalarGroup_(
    tables.products, "product_id", "related_place_id", "name_th", "name_en", placeId, groups.products,
    AdminPlaceService_DEPENDENCY_COMMON_STATUSES_, "ADMIN_PLACE_DEPENDENCY_PRODUCT"
  );
  AdminPlaceService_dependencyScalarGroup_(
    tables.events, "event_id", "related_place_id", "title_th", "title_en", placeId, groups.events,
    AdminPlaceService_DEPENDENCY_COMMON_STATUSES_, "ADMIN_PLACE_DEPENDENCY_EVENT"
  );
  AdminPlaceService_dependencyScalarGroup_(
    tables.gallery, "media_id", "related_place_id", "title_th", "title_en", placeId, groups.gallery,
    AdminPlaceService_DEPENDENCY_COMMON_STATUSES_, "ADMIN_PLACE_DEPENDENCY_GALLERY"
  );

  var templates = AdminPlaceService_dependencyIndex_(
    tables.trip_templates, "template_id", AdminPlaceService_DEPENDENCY_COMMON_STATUSES_, "ADMIN_PLACE_DEPENDENCY_TEMPLATE"
  );
  Object.keys(templates).forEach(function (templateId) {
    var template = templates[templateId];
    var templatePlaceIds = AdminPlaceService_dependencyList_(template.place_ids);
    if (template.status === "deleted") return;
    if (templatePlaceIds.indexOf(placeId) !== -1) {
      AdminPlaceService_dependencyAdd_(groups.trip_templates, templateId,
        AdminPlaceService_dependencyLabel_(template.name_th, template.name_en, templateId));
    }
  });

  var reviews = AdminPlaceService_dependencyIndex_(
    tables.reviews, "review_id", AdminPlaceService_DEPENDENCY_REVIEW_STATUSES_, "ADMIN_PLACE_DEPENDENCY_REVIEW"
  );
  Object.keys(reviews).forEach(function (reviewId) {
    var review = reviews[reviewId];
    if (review.status === "deleted") return;
    if (AdminPlaceService_dependencyReference_(review.place_id, false) !== placeId) return;
    var reviewerName = AdminPlaceService_dependencyHumanText_(review.reviewer_name);
    var label = AdminPlaceService_dependencyStoredBoolean_(review.is_anonymous) ? "นักท่องเที่ยว" : (reviewerName || reviewId);
    AdminPlaceService_dependencyAdd_(groups.reviews, reviewId, label);
  });

  AdminPlaceService_DEPENDENCY_GROUP_KEYS_.forEach(function (key) {
    groups[key].sort(function (left, right) {
      return left.entity_id < right.entity_id ? -1 : left.entity_id > right.entity_id ? 1 : 0;
    });
  });
  return { place_id: placeId, checked_at: new Date().toISOString(), groups: groups };
}

function AdminPlaceService_dependencyRows_(table, errorCode) {
  if (!table || typeof table !== "object" || !Array.isArray(table.rows)) throw new Error(errorCode);
  return table.rows.map(function (entry) {
    if (!entry || typeof entry !== "object" || !entry.values || typeof entry.values !== "object" || Array.isArray(entry.values)) {
      throw new Error(errorCode);
    }
    return entry.values;
  });
}

function AdminPlaceService_dependencyIndex_(table, idKey, statuses, errorCode) {
  var index = Object.create(null);
  AdminPlaceService_dependencyRows_(table, errorCode).forEach(function (row) {
    var id = row[idKey];
    if (!AdminPlaceService_validId_(id) || Object.prototype.hasOwnProperty.call(index, id)) throw new Error(errorCode);
    if (typeof row.status !== "string" || statuses.indexOf(row.status) === -1) throw new Error(errorCode);
    index[id] = row;
  });
  return index;
}

function AdminPlaceService_dependencyReference_(value, optional) {
  if (typeof value !== "string") throw new Error("ADMIN_PLACE_DEPENDENCY_REFERENCE");
  var normalized = value.trim();
  if (!normalized && optional) return "";
  if (!AdminPlaceService_validId_(normalized)) throw new Error("ADMIN_PLACE_DEPENDENCY_REFERENCE");
  return normalized;
}

function AdminPlaceService_dependencyList_(value) {
  if (typeof value !== "string") throw new Error("ADMIN_PLACE_DEPENDENCY_LIST");
  if (!value) return [];
  var seen = Object.create(null);
  var result = [];
  value.split("|").forEach(function (part) {
    var id = part.trim();
    if (!id || Object.prototype.hasOwnProperty.call(seen, id)) return;
    if (!AdminPlaceService_validId_(id)) throw new Error("ADMIN_PLACE_DEPENDENCY_LIST");
    seen[id] = true;
    result.push(id);
  });
  return result;
}

function AdminPlaceService_dependencyHumanText_(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new Error("ADMIN_PLACE_DEPENDENCY_LABEL");
  try {
    return AdminPlaceService_unescapeHumanText_(value);
  } catch (_labelError) {
    throw new Error("ADMIN_PLACE_DEPENDENCY_LABEL");
  }
}

function AdminPlaceService_dependencyLabel_(primary, secondary, fallback) {
  var first = AdminPlaceService_dependencyHumanText_(primary);
  var second = AdminPlaceService_dependencyHumanText_(secondary);
  return first || second || fallback;
}

function AdminPlaceService_dependencyStoredBoolean_(value) {
  if (value === true || value === 1) return true;
  var text = value === null || value === undefined ? "" : String(value).trim().toLowerCase();
  return text === "true" || text === "1";
}

function AdminPlaceService_dependencyAdd_(items, entityId, label) {
  if (items.some(function (item) { return item.entity_id === entityId; })) return;
  items.push({ entity_id: entityId, label: label });
}

function AdminPlaceService_dependencyScalarGroup_(table, idKey, referenceKey, primaryLabelKey, secondaryLabelKey,
    placeId, items, statuses, errorCode) {
  var records = AdminPlaceService_dependencyIndex_(table, idKey, statuses, errorCode);
  Object.keys(records).forEach(function (entityId) {
    var record = records[entityId];
    if (record.status === "deleted") return;
    if (AdminPlaceService_dependencyReference_(record[referenceKey], true) !== placeId) return;
    AdminPlaceService_dependencyAdd_(items, entityId,
      AdminPlaceService_dependencyLabel_(record[primaryLabelKey], record[secondaryLabelKey], entityId));
  });
}

function AdminPlaceService_requireWriteRole_(admin) {
  if (!admin || AdminPlaceService_WRITE_ROLES_.indexOf(admin.role) === -1) throw new Error("FORBIDDEN");
}

function AdminPlaceService_createParameters_(payload) {
  var source = AdminPlaceService_plainObject_(payload, false);
  AdminPlaceService_requireExactKeys_(source, AdminPlaceService_CREATE_KEYS_);
  var content = AdminPlaceService_normalizeEditableContent_(source.content);
  if (content.gallery_media_ids.length) throw new Error("VALIDATION_ERROR");
  content.gallery_media_ids = "";
  return { content: content };
}

function AdminPlaceService_saveParameters_(payload) {
  var source = AdminPlaceService_plainObject_(payload, false);
  AdminPlaceService_requireExactKeys_(source, AdminPlaceService_SAVE_KEYS_);
  if (!AdminPlaceService_validId_(source.place_id)) throw new Error("VALIDATION_ERROR");
  if (typeof source.expected_version !== "number" || !Number.isSafeInteger(source.expected_version) || source.expected_version < 1) {
    throw new Error("VALIDATION_ERROR");
  }
  return {
    place_id: source.place_id,
    expected_version: source.expected_version,
    content: AdminPlaceService_normalizeEditableContent_(source.content)
  };
}

function AdminPlaceService_publishParameters_(payload) {
  var source = AdminPlaceService_plainObject_(payload, false);
  AdminPlaceService_requireExactKeys_(source, AdminPlaceService_PUBLISH_KEYS_);
  if (!AdminPlaceService_validId_(source.place_id) || typeof source.expected_version !== "number" ||
      !Number.isSafeInteger(source.expected_version) || source.expected_version < 1) {
    throw new Error("VALIDATION_ERROR");
  }
  return { place_id: source.place_id, expected_version: source.expected_version };
}

function AdminPlaceService_publishContent_(draftRow, placeId) {
  try {
    var projected = AdminPlaceService_projectContent_(draftRow);
    var candidate = {};
    AdminPlaceService_CONTENT_HEADERS_.forEach(function (header) {
      candidate[header] = header === "gallery_media_ids" && !projected[header].length ? "" : projected[header];
    });
    var normalized = AdminPlaceService_normalizeEditableContent_(candidate);
    normalized.gallery_media_ids = AdminPlaceService_validatePlaceMedia_(placeId, normalized.gallery_media_ids);
    AdminPlaceService_PUBLISH_REQUIRED_HEADERS_.forEach(function (header) {
      if (!normalized[header]) throw new Error("VALIDATION_ERROR");
    });
    return normalized;
  } catch (_validationError) {
    throw new Error("VALIDATION_ERROR");
  }
}

function AdminPlaceService_verifyCacheEpoch_(expectedEpoch) {
  if (!Number.isSafeInteger(expectedEpoch) || expectedEpoch < 1 || PlaceService_cacheEpoch_() !== expectedEpoch) {
    throw new Error("ADMIN_PLACE_EPOCH_VERIFY");
  }
  return true;
}

function AdminPlaceService_requireExactKeys_(source, required) {
  AdminPlaceService_assertExactKeys_(source, required);
  if (Object.keys(source).length !== required.length) throw new Error("VALIDATION_ERROR");
}

function AdminPlaceService_normalizeEditableContent_(content) {
  var source = AdminPlaceService_plainObject_(content, false);
  AdminPlaceService_requireExactKeys_(source, AdminPlaceService_CONTENT_HEADERS_);
  var normalized = {};
  AdminPlaceService_CONTENT_HEADERS_.forEach(function (header) {
    var value = source[header];
    if (header === "gallery_media_ids") {
      normalized[header] = AdminPlaceService_normalizeGalleryRequest_(value);
    } else if (header === "tags") {
      normalized[header] = AdminPlaceService_normalizeList_(value, false);
    } else if (header === "nearby_place_ids") {
      normalized[header] = AdminPlaceService_normalizeList_(value, true);
    } else if (AdminPlaceService_BOOLEAN_HEADERS_.indexOf(header) !== -1) {
      if (typeof value !== "boolean") throw new Error("VALIDATION_ERROR");
      normalized[header] = value;
    } else if (header === "latitude" || header === "longitude") {
      if (value === "") normalized[header] = "";
      else if (typeof value === "number" && isFinite(value)) normalized[header] = value;
      else throw new Error("VALIDATION_ERROR");
    } else if (header === "sort_order") {
      if (value === "") normalized[header] = "";
      else if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) normalized[header] = value;
      else throw new Error("VALIDATION_ERROR");
    } else if (AdminPlaceService_URL_HEADERS_.indexOf(header) !== -1) {
      normalized[header] = AdminPlaceService_normalizeUrl_(value);
    } else {
      normalized[header] = AdminPlaceService_normalizeText_(value);
    }
  });

  if (normalized.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized.slug)) throw new Error("VALIDATION_ERROR");
  if (normalized.district && AdminPlaceService_DISTRICTS_.indexOf(normalized.district) === -1) throw new Error("VALIDATION_ERROR");
  if (normalized.route_group && AdminPlaceService_ROUTE_GROUPS_.indexOf(normalized.route_group) === -1) throw new Error("VALIDATION_ERROR");
  if (normalized.category && AdminPlaceService_CATEGORIES_.indexOf(normalized.category) === -1) throw new Error("VALIDATION_ERROR");
  if (normalized.coordinate_status && AdminPlaceService_COORDINATE_STATUSES_.indexOf(normalized.coordinate_status) === -1) {
    throw new Error("VALIDATION_ERROR");
  }
  if ((normalized.latitude === "") !== (normalized.longitude === "")) throw new Error("VALIDATION_ERROR");
  if (normalized.latitude !== "" &&
      (normalized.latitude < -90 || normalized.latitude > 90 || normalized.longitude < -180 || normalized.longitude > 180)) {
    throw new Error("VALIDATION_ERROR");
  }
  return normalized;
}

function AdminPlaceService_normalizeGalleryRequest_(value) {
  if (value === "") return [];
  if (!Array.isArray(value) || value.length < 1 || value.length > AdminPlaceService_MEDIA_MAX_ITEMS_) {
    throw new Error("VALIDATION_ERROR");
  }
  var seen = Object.create(null);
  return value.map(function (mediaId) {
    if (typeof mediaId !== "string" || !AdminPlaceService_MEDIA_ID_PATTERN_.test(mediaId) ||
        Object.prototype.hasOwnProperty.call(seen, mediaId)) {
      throw new Error("VALIDATION_ERROR");
    }
    seen[mediaId] = true;
    return mediaId;
  });
}

function AdminPlaceService_galleryStorageValue_(value) {
  if (value === "") return "";
  if (Array.isArray(value)) return value.length ? AdminPlaceService_normalizeGalleryRequest_(value).join("|") : "";
  AdminPlaceService_listValue_(value, true);
  return value;
}

function AdminPlaceService_validatePlaceMedia_(placeId, mediaIds) {
  if (!AdminPlaceService_validId_(placeId) || !Array.isArray(mediaIds) || mediaIds.length > AdminPlaceService_MEDIA_MAX_ITEMS_) {
    throw new Error("VALIDATION_ERROR");
  }
  if (!mediaIds.length) return "";
  var manifest = AdminPlaceService_readApprovedMedia_();
  var byId = Object.create(null);
  manifest.items.forEach(function (item) { byId[item.media_id] = item; });
  mediaIds.forEach(function (mediaId) {
    var item = byId[mediaId];
    if (!item || item.entity_type !== "place" || item.entity_id !== placeId || item.role !== "gallery") {
      throw new Error("VALIDATION_ERROR");
    }
  });
  var serialized = mediaIds.join("|");
  if (AdminPlaceService_listValue_(serialized, true).join("|") !== serialized) throw new Error("VALIDATION_ERROR");
  return serialized;
}

function AdminPlaceService_readApprovedMedia_() {
  var properties = PropertiesService.getScriptProperties();
  var manifestUrl = properties && properties.getProperty("ADMIN_PLACE_MEDIA_MANIFEST_URL");
  var allowedOrigin = properties && properties.getProperty("ADMIN_PLACE_MEDIA_ALLOWED_ORIGIN");
  if (typeof manifestUrl !== "string" || typeof allowedOrigin !== "string" ||
      !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(allowedOrigin) ||
      manifestUrl.indexOf(allowedOrigin + "/") !== 0 || /[\\<>"'\u0000-\u0020\u007F]/.test(manifestUrl) ||
      manifestUrl.indexOf("@", 8) !== -1) {
    throw new Error("ADMIN_PLACE_MEDIA_CONFIG");
  }
  var response = UrlFetchApp.fetch(manifestUrl, {
    method: "get",
    followRedirects: false,
    muteHttpExceptions: true
  });
  if (!response || typeof response.getResponseCode !== "function" || response.getResponseCode() !== 200 ||
      typeof response.getContentText !== "function") {
    throw new Error("ADMIN_PLACE_MEDIA_FETCH");
  }
  var parsed;
  try {
    parsed = JSON.parse(response.getContentText());
  } catch (_parseError) {
    throw new Error("ADMIN_PLACE_MEDIA_MANIFEST");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.version !== 1 ||
      !Array.isArray(parsed.items) || parsed.items.length > 10000) {
    throw new Error("ADMIN_PLACE_MEDIA_MANIFEST");
  }
  var seen = Object.create(null);
  var items = parsed.items.map(function (item) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        typeof item.media_id !== "string" || !AdminPlaceService_MEDIA_ID_PATTERN_.test(item.media_id) ||
        Object.prototype.hasOwnProperty.call(seen, item.media_id) ||
        typeof item.entity_type !== "string" || !/^[a-z][a-z0-9_]{0,31}$/.test(item.entity_type) ||
        typeof item.entity_id !== "string" || !AdminPlaceService_validId_(item.entity_id) ||
        typeof item.role !== "string" || !/^[a-z][a-z0-9_]{0,31}$/.test(item.role) ||
        typeof item.alt_th !== "string" || item.alt_th.length > 500 ||
        typeof item.alt_en !== "string" || item.alt_en.length > 500 ||
        !/^assets\/media\/placeholders\/(?:hero|cover|product|gallery)\.svg$/.test(item.fallback) ||
        !Array.isArray(item.outputs) || !item.outputs.length || item.outputs.length > 20) {
      throw new Error("ADMIN_PLACE_MEDIA_MANIFEST");
    }
    seen[item.media_id] = true;
    var outputs = item.outputs.map(function (output) {
      if (!output || typeof output !== "object" || Array.isArray(output) ||
          !Number.isSafeInteger(output.width) || output.width < 1 ||
          !Number.isSafeInteger(output.height) || output.height < 1 ||
          typeof output.path !== "string" || !/^assets\/media\/generated\/[a-z0-9\/_-]+\.webp$/.test(output.path)) {
        throw new Error("ADMIN_PLACE_MEDIA_MANIFEST");
      }
      return { width: output.width, height: output.height, path: output.path };
    }).sort(function (left, right) { return left.width - right.width; });
    return {
      media_id: item.media_id,
      entity_type: item.entity_type,
      entity_id: item.entity_id,
      role: item.role,
      alt_th: item.alt_th,
      alt_en: item.alt_en,
      fallback: item.fallback,
      outputs: outputs
    };
  });
  return { version: 1, items: items };
}

function AdminPlaceService_safeMediaProjection_(item) {
  return {
    media_id: item.media_id,
    entity_type: item.entity_type,
    entity_id: item.entity_id,
    role: item.role,
    alt_th: item.alt_th,
    alt_en: item.alt_en,
    fallback: item.fallback,
    outputs: item.outputs.map(function (output) {
      return { width: output.width, height: output.height, path: output.path };
    })
  };
}

function AdminPlaceService_normalizeText_(value) {
  if (typeof value !== "string") throw new Error("VALIDATION_ERROR");
  var normalized = value.trim();
  if (normalized.length > AdminPlaceService_MAX_TEXT_LENGTH_ ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalized)) {
    throw new Error("VALIDATION_ERROR");
  }
  return SheetService_escapeHumanText_(normalized);
}

function AdminPlaceService_normalizeUrl_(value) {
  if (typeof value !== "string") throw new Error("VALIDATION_ERROR");
  var normalized = value.trim();
  if (!normalized) return "";
  if (normalized.length > AdminPlaceService_MAX_URL_LENGTH_ ||
      /[\u0000-\u0020\u007F\\<>"']/.test(normalized)) {
    throw new Error("VALIDATION_ERROR");
  }
  var parts = /^(https?):\/\/([^/?#]+)([/?#].*)?$/i.exec(normalized);
  if (!parts || parts[2].indexOf("@") !== -1) throw new Error("VALIDATION_ERROR");
  var authority = parts[2];
  var hostAndPort = /^([^:]+)(?::([0-9]{1,5}))?$/.exec(authority);
  if (!hostAndPort) throw new Error("VALIDATION_ERROR");
  var host = hostAndPort[1];
  var port = hostAndPort[2] || "";
  var label = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?";
  if (host.length > 253 || !(new RegExp("^" + label + "(?:\\." + label + ")*$")).test(host)) {
    throw new Error("VALIDATION_ERROR");
  }
  if (port && (Number(port) < 1 || Number(port) > 65535)) throw new Error("VALIDATION_ERROR");
  return normalized;
}

function AdminPlaceService_normalizeList_(value, identifiers) {
  if (!Array.isArray(value) || value.length > AdminPlaceService_MAX_LIST_ITEMS_) throw new Error("VALIDATION_ERROR");
  var seen = Object.create(null);
  var normalized = value.map(function (item) {
    if (typeof item !== "string") throw new Error("VALIDATION_ERROR");
    var entry = item.trim();
    if (!entry || entry.length > AdminPlaceService_MAX_LIST_ITEM_LENGTH_ || entry.indexOf("|") !== -1 ||
        /[\u0000-\u001F\u007F]/.test(entry)) {
      throw new Error("VALIDATION_ERROR");
    }
    if (identifiers && !AdminPlaceService_validId_(entry)) throw new Error("VALIDATION_ERROR");
    if (Object.prototype.hasOwnProperty.call(seen, entry)) throw new Error("VALIDATION_ERROR");
    seen[entry] = true;
    return entry;
  });
  var serialized = normalized.join("|");
  return identifiers || !serialized ? serialized : SheetService_escapeHumanText_(serialized);
}

function AdminPlaceService_generatePlaceId_() {
  var uuid = Utilities.getUuid();
  if (typeof uuid !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new Error("ADMIN_PLACE_ID_GENERATION");
  }
  var placeId = "PLC-" + uuid.toLowerCase();
  if (!AdminPlaceService_validId_(placeId)) throw new Error("ADMIN_PLACE_ID_GENERATION");
  return placeId;
}

function AdminPlaceService_neutralIdentity_(placeId, occurredAt, adminId) {
  var headers = AdminPlaceSchema_PLACE_BASE_HEADERS_.concat(AdminPlaceSchema_PLACES_APPEND_HEADERS_);
  var record = {};
  headers.forEach(function (header) { record[header] = ""; });
  AdminPlaceService_BOOLEAN_HEADERS_.forEach(function (header) { record[header] = false; });
  record.place_id = placeId;
  record.status = "draft";
  record.entity_version = 1;
  record.published_version = 0;
  record.created_at = occurredAt;
  record.updated_at = occurredAt;
  record.created_by = adminId;
  record.updated_by = adminId;
  return record;
}

function AdminPlaceService_newDraft_(placeId, content, draftVersion, basePublishedVersion, occurredAt, adminId, trustedMediaSource) {
  var record = {};
  AdminPlaceSchema_DRAFT_HEADERS_.forEach(function (header) { record[header] = ""; });
  AdminPlaceService_CONTENT_HEADERS_.forEach(function (header) {
    record[header] = header === "gallery_media_ids" ? AdminPlaceService_galleryStorageValue_(content[header]) : content[header];
  });
  record.place_id = placeId;
  record.cover_image_url = trustedMediaSource ? trustedMediaSource.cover_image_url : "";
  record.gallery_image_urls = trustedMediaSource ? trustedMediaSource.gallery_image_urls : "";
  record.video_url = trustedMediaSource ? trustedMediaSource.video_url : "";
  record.draft_version = draftVersion;
  record.base_published_version = basePublishedVersion;
  record.created_at = occurredAt;
  record.updated_at = occurredAt;
  record.created_by = adminId;
  record.updated_by = adminId;
  return record;
}

function AdminPlaceService_existingDraftPatch_(content, draftVersion, occurredAt, adminId) {
  var patch = {};
  AdminPlaceService_CONTENT_HEADERS_.forEach(function (header) { patch[header] = content[header]; });
  patch.draft_version = draftVersion;
  patch.updated_at = occurredAt;
  patch.updated_by = adminId;
  return patch;
}

function AdminPlaceService_appendedRowNumber_(result) {
  if (!result || !Number.isSafeInteger(result.sourceRowNumber) || result.sourceRowNumber < 2) {
    throw new Error("ADMIN_PLACE_APPEND");
  }
  return result.sourceRowNumber;
}

function AdminPlaceService_completeRow_(headers, record) {
  var values = {};
  headers.forEach(function (header) {
    values[header] = Object.prototype.hasOwnProperty.call(record, header) ? record[header] : "";
  });
  return values;
}

function AdminPlaceService_mergeRow_(before, patch) {
  var values = {};
  Object.keys(before).forEach(function (header) { values[header] = before[header]; });
  Object.keys(patch).forEach(function (header) { values[header] = patch[header]; });
  return values;
}

function AdminPlaceService_verifyIntendedState_(snapshot, intended) {
  var targets = [
    {
      sheetName: AdminPlaceSchema_PLACES_SHEET_NAME_, headers: snapshot.place_headers,
      expected: intended.place
    },
    {
      sheetName: AdminPlaceSchema_DRAFTS_SHEET_NAME_, headers: snapshot.draft_headers,
      expected: intended.draft
    }
  ];
  targets.forEach(function (target) {
    var table = SheetService_readTable_(target.sheetName, target.headers);
    if (!table || !Array.isArray(table.headers) || table.headers.length !== target.headers.length) {
      throw new Error("ADMIN_PLACE_WRITE_VERIFY");
    }
    target.headers.forEach(function (header, index) {
      if (table.headers[index] !== header) throw new Error("ADMIN_PLACE_WRITE_VERIFY");
    });
    var matches = table.rows.filter(function (entry) {
      return entry && entry.values && entry.values.place_id === snapshot.place_id;
    });
    if (target.expected && target.expected.absent) {
      var retainedAbsence = target.expected.sourceRowNumber === null;
      if ((!retainedAbsence && (!Number.isSafeInteger(target.expected.sourceRowNumber) || target.expected.sourceRowNumber < 2)) ||
          matches.length !== 0 || (!retainedAbsence && table.rows.some(function (entry) {
            return entry && entry.sourceRowNumber === target.expected.sourceRowNumber;
          }))) {
        throw new Error("ADMIN_PLACE_WRITE_VERIFY");
      }
      return;
    }
    if (!target.expected || matches.length !== 1 || matches[0].sourceRowNumber !== target.expected.sourceRowNumber) {
      throw new Error("ADMIN_PLACE_WRITE_VERIFY");
    }
    target.headers.forEach(function (header) {
      var actual = matches[0].values[header];
      var expected = target.expected.values[header];
      var same = actual === expected ||
        (actual instanceof Date && expected instanceof Date && actual.getTime() === expected.getTime());
      if (!same) throw new Error("ADMIN_PLACE_WRITE_VERIFY");
    });
  });
  return true;
}

function AdminPlaceService_writeSuccess_(placeId, status, entityVersion, publishedVersion, hasDraft, createdAt, updatedAt) {
  return {
    place_id: placeId,
    status: status,
    entity_version: entityVersion,
    working_version: entityVersion,
    published_version: publishedVersion || null,
    has_active_draft: hasDraft,
    created_at: AdminPlaceService_safeTimestamp_(createdAt),
    updated_at: AdminPlaceService_safeTimestamp_(updatedAt)
  };
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
    if (code === "FORBIDDEN") return AdminPlaceService_error_("FORBIDDEN", "คุณไม่มีสิทธิ์ดำเนินการนี้");
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
    return { audit_id: auditId, sourceRowNumber: appended.sourceRowNumber };
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

function AdminPlaceService_removeVerifiedAudit_(audit) {
  if (!audit || typeof audit !== "object" || Array.isArray(audit) ||
      typeof audit.audit_id !== "string" || !audit.audit_id || audit.audit_id.length > 128 ||
      !Number.isSafeInteger(audit.sourceRowNumber) || audit.sourceRowNumber < 2) {
    throw new Error("ADMIN_PLACE_AUDIT_CLEANUP_INPUT");
  }
  var auditHeaders = AdminPlaceSchema_ACTIVITY_BASE_HEADERS_.concat(AdminPlaceSchema_ACTIVITY_APPEND_HEADERS_);
  var table = SheetService_readTable_(AdminPlaceSchema_ACTIVITY_SHEET_NAME_, auditHeaders);
  var matches = table.rows.filter(function (entry) {
    return entry && entry.values && entry.values.audit_id === audit.audit_id;
  });
  if (matches.length !== 1 || matches[0].sourceRowNumber !== audit.sourceRowNumber) {
    throw new Error("ADMIN_PLACE_AUDIT_CLEANUP_CARDINALITY");
  }
  SheetService_clearRow_(AdminPlaceSchema_ACTIVITY_SHEET_NAME_, audit.sourceRowNumber);
  var verified = SheetService_readTable_(AdminPlaceSchema_ACTIVITY_SHEET_NAME_, auditHeaders);
  if (verified.rows.some(function (entry) {
    return entry && (entry.sourceRowNumber === audit.sourceRowNumber ||
      (entry.values && entry.values.audit_id === audit.audit_id));
  })) {
    throw new Error("ADMIN_PLACE_AUDIT_CLEANUP");
  }
  return true;
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
    restore_fields: {
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

function AdminPlaceService_setSelectiveRestore_(snapshot, key, fields) {
  if (!snapshot || !snapshot.restore_fields || (key !== "place" && key !== "draft") ||
      !snapshot.rows || !Array.isArray(fields)) {
    throw new Error("ADMIN_PLACE_RESTORE_FIELDS");
  }
  if (!fields.length) {
    snapshot.restore_fields[key] = [];
    return snapshot;
  }
  if (!snapshot.rows[key]) throw new Error("ADMIN_PLACE_RESTORE_FIELDS");
  var headers = key === "place" ? snapshot.place_headers : snapshot.draft_headers;
  var seen = Object.create(null);
  fields.forEach(function (field) {
    if (typeof field !== "string" || field === "place_id" || headers.indexOf(field) === -1 ||
        Object.prototype.hasOwnProperty.call(seen, field)) {
      throw new Error("ADMIN_PLACE_RESTORE_FIELDS");
    }
    seen[field] = true;
  });
  snapshot.restore_fields[key] = fields.slice();
  return snapshot;
}

function AdminPlaceService_applySelectivePatch_(snapshot, key, sheetName, sourceRowNumber, orderedFields, patch) {
  if (!snapshot || !snapshot.restore_fields || !Array.isArray(snapshot.restore_fields[key]) ||
      !Array.isArray(orderedFields) || !orderedFields.length || !patch || typeof patch !== "object" || Array.isArray(patch) ||
      Object.keys(patch).length !== orderedFields.length) {
    throw new Error("ADMIN_PLACE_SELECTIVE_PATCH");
  }
  orderedFields.forEach(function (field) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) throw new Error("ADMIN_PLACE_SELECTIVE_PATCH");
    AdminPlaceService_setSelectiveRestore_(snapshot, key, snapshot.restore_fields[key].concat([field]));
    var fieldPatch = {};
    fieldPatch[field] = patch[field];
    SheetService_updateObjectAtRow_(sheetName, sourceRowNumber, fieldPatch);
  });
  return true;
}

function AdminPlaceService_restoreState_(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || !AdminPlaceService_validId_(snapshot.place_id) ||
      !Array.isArray(snapshot.place_headers) || !Array.isArray(snapshot.draft_headers) || !snapshot.rows ||
      !snapshot.allocated_rows || !snapshot.restore_fields || !snapshot.epoch) {
    throw new Error("ADMIN_PLACE_RESTORE_INPUT");
  }
  var auditCleanupFailed = false;
  if (snapshot.audit) {
    try {
      AdminPlaceService_removeVerifiedAudit_(snapshot.audit);
    } catch (_auditCleanupError) {
      auditCleanupFailed = true;
    }
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
    var restoreFields = snapshot.restore_fields[target.key];
    if (allocatedRow !== null && (!Number.isSafeInteger(allocatedRow) || allocatedRow < 2)) {
      throw new Error("ADMIN_PLACE_RESTORE_ALLOCATION");
    }
    if (restoreFields !== null && !Array.isArray(restoreFields)) {
      throw new Error("ADMIN_PLACE_RESTORE_FIELDS");
    }
    var currentMatches = currentTables[target.tableKey].rows.filter(function (entry) {
      return entry && entry.values && entry.values.place_id === snapshot.place_id;
    });
    if (before) {
      if (allocatedRow !== null) throw new Error("ADMIN_PLACE_RESTORE_ALLOCATION");
      if (restoreFields === null) {
        SheetService_replaceObjectAtRow_(target.sheetName, before.sourceRowNumber, before.values);
      } else if (restoreFields.length) {
        var restoreSeen = Object.create(null);
        restoreFields.forEach(function (field) {
          if (typeof field !== "string" || field === "place_id" || target.headers.indexOf(field) === -1 ||
              Object.prototype.hasOwnProperty.call(restoreSeen, field)) {
            throw new Error("ADMIN_PLACE_RESTORE_FIELDS");
          }
          restoreSeen[field] = true;
          var restorePatch = {};
          restorePatch[field] = before.values[field];
          SheetService_updateObjectAtRow_(target.sheetName, before.sourceRowNumber, restorePatch);
        });
      }
    } else {
      if (restoreFields !== null && restoreFields.length) throw new Error("ADMIN_PLACE_RESTORE_FIELDS");
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
  if (auditCleanupFailed) throw new Error("ADMIN_PLACE_AUDIT_CLEANUP");
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

function AdminPlaceService_requireContext_(draftContentScope, publishTargetId) {
  if (publishTargetId !== undefined && !AdminPlaceService_validId_(publishTargetId)) {
    throw new Error("ADMIN_PLACE_CONTEXT_TARGET");
  }
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
    if (draftVersion !== owner.entityVersion ||
        (basePublishedVersion !== owner.publishedVersion && id !== publishTargetId)) {
      throw new Error("ADMIN_PLACE_DRAFT_VERSION");
    }
    if (draftContentScope === true || draftContentScope === id) AdminPlaceService_projectContent_(row);
    draftsById[id] = { row: row, draftVersion: draftVersion, basePublishedVersion: basePublishedVersion };
  });

  Object.keys(placesById).forEach(function (id) {
    var place = placesById[id];
    var hasDraft = Object.prototype.hasOwnProperty.call(draftsById, id);
    if (place.row.status === "draft" && !hasDraft && id !== publishTargetId) throw new Error("ADMIN_PLACE_DRAFT_REQUIRED");
    if (place.publishedVersion === 0 && !hasDraft && id !== publishTargetId) throw new Error("ADMIN_PLACE_CONTENT_REQUIRED");
  });

  return { placesById: placesById, draftsById: draftsById };
}

function AdminPlaceService_buildList_(context, parameters) {
  var mediaManifest = AdminPlaceService_readApprovedMedia_();
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
      cover: AdminPlaceService_mediaForPlace_(mediaManifest, id, []).cover,
      created_at: AdminPlaceService_safeTimestamp_(place.row.created_at),
      updated_at: AdminPlaceService_safeTimestamp_(place.row.updated_at)
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
  var content = AdminPlaceService_projectContent_(source);
  var media = AdminPlaceService_mediaForPlace_(AdminPlaceService_readApprovedMedia_(), parameters.place_id, content.gallery_media_ids);
  return {
    place_id: parameters.place_id,
    status: place.row.status,
    has_active_draft: hasDraft,
    display_state: AdminPlaceService_displayState_(place.row.status, hasDraft),
    entity_version: place.entityVersion,
    working_version: hasDraft ? draft.draftVersion : place.entityVersion,
    published_version: place.publishedVersion || null,
    content: content,
    media: media,
    capabilities: {
      can_write: canWrite,
      can_publish: canWrite && hasDraft && place.row.status !== "archived",
      can_unpublish: canWrite && place.row.status === "published",
      can_archive: canWrite && place.row.status !== "archived",
      can_restore: canWrite && place.row.status === "archived",
      can_view_working: true,
      can_view_published: place.publishedVersion > 0
    },
    created_at: AdminPlaceService_safeTimestamp_(place.row.created_at),
    updated_at: AdminPlaceService_safeTimestamp_(place.row.updated_at)
  };
}

function AdminPlaceService_mediaForPlace_(manifest, placeId, galleryIds) {
  var byId = Object.create(null);
  manifest.items.forEach(function (item) { byId[item.media_id] = item; });
  var coverId = "place-" + placeId.toLowerCase() + "-cover";
  var coverItem = byId[coverId];
  var cover = coverItem && coverItem.entity_type === "place" && coverItem.entity_id === placeId && coverItem.role === "cover" ?
    AdminPlaceService_safeMediaProjection_(coverItem) : null;
  var gallery = (Array.isArray(galleryIds) ? galleryIds : []).map(function (mediaId) {
    var item = byId[mediaId];
    return item && item.entity_type === "place" && item.entity_id === placeId && item.role === "gallery" ?
      AdminPlaceService_safeMediaProjection_(item) : null;
  }).filter(function (item) { return Boolean(item); });
  return { cover: cover, gallery: gallery };
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

function AdminPlaceService_mediaParameters_(payload) {
  var source = AdminPlaceService_plainObject_(payload, false);
  AdminPlaceService_assertExactKeys_(source, AdminPlaceService_MEDIA_KEYS_);
  if (!Object.prototype.hasOwnProperty.call(source, "place_id") || !AdminPlaceService_validId_(source.place_id)) {
    throw new Error("VALIDATION_ERROR");
  }
  if (source.keyword !== undefined && typeof source.keyword !== "string" ||
      source.role !== undefined && ["all", "cover", "gallery"].indexOf(source.role) === -1) {
    throw new Error("VALIDATION_ERROR");
  }
  var keyword = source.keyword === undefined ? "" : source.keyword;
  if (keyword !== keyword.trim() || keyword.length > 200) throw new Error("VALIDATION_ERROR");
  return {
    place_id: source.place_id,
    keyword: AdminPlaceService_lowerText_(keyword),
    role: source.role || "all",
    page: AdminPlaceService_requestInteger_(source.page, AdminPlaceService_DEFAULT_PAGE_, null),
    page_size: AdminPlaceService_requestInteger_(source.page_size, AdminPlaceService_DEFAULT_PAGE_SIZE_, AdminPlaceService_MAX_PAGE_SIZE_)
  };
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
      var listSource = header === "tags" ? AdminPlaceService_unescapeHumanText_(source[header]) : source[header];
      result[header] = AdminPlaceService_listValue_(listSource, header === "gallery_media_ids");
    } else if (header === "is_featured" || header === "is_main_route_point") {
      result[header] = AdminPlaceService_booleanValue_(source[header]);
    } else if (header === "latitude" || header === "longitude" || header === "sort_order") {
      result[header] = AdminPlaceService_numberValue_(source[header], header);
    } else {
      var textValue = AdminPlaceService_safeText_(source[header]);
      result[header] = AdminPlaceService_NON_HUMAN_TEXT_HEADERS_.indexOf(header) !== -1 ||
        AdminPlaceService_URL_HEADERS_.indexOf(header) !== -1 ? textValue : AdminPlaceService_unescapeHumanText_(textValue);
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

function AdminPlaceService_safeTimestamp_(value) {
  if (typeof value !== "string") throw new Error("ADMIN_PLACE_TIMESTAMP");
  var canonicalMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/.exec(value);
  var legacyMatch = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  var match = canonicalMatch || legacyMatch;
  if (!match) throw new Error("ADMIN_PLACE_TIMESTAMP");

  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var hour = Number(match[4]);
  var minute = Number(match[5]);
  var second = Number(match[6]);
  var millisecond = canonicalMatch ? Number(match[7]) : 0;
  var timestamp = new Date(0);
  timestamp.setUTCFullYear(year, month - 1, day);
  timestamp.setUTCHours(hour, minute, second, millisecond);
  if (timestamp.getUTCFullYear() !== year || timestamp.getUTCMonth() !== month - 1 ||
      timestamp.getUTCDate() !== day || timestamp.getUTCHours() !== hour ||
      timestamp.getUTCMinutes() !== minute || timestamp.getUTCSeconds() !== second ||
      timestamp.getUTCMilliseconds() !== millisecond) {
    throw new Error("ADMIN_PLACE_TIMESTAMP");
  }

  var normalized = timestamp.toISOString();
  if (canonicalMatch && normalized !== value) throw new Error("ADMIN_PLACE_TIMESTAMP");
  return canonicalMatch ? value : normalized;
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

function AdminPlaceService_unescapeHumanText_(value) {
  var text = AdminPlaceService_safeText_(value);
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
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
