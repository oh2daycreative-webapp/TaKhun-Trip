var AdminEventService_FIELDS_ = ["title_th", "title_en", "event_type", "event_date", "start_time", "end_time", "location_th", "location_en", "related_place_id", "description_th", "description_en", "image_url", "contact_name", "contact_phone", "register_url", "google_maps_url", "latitude", "longitude", "is_featured"];

function AdminEventService_domain_() {
  return { entity: "event", table: "events", id: "event_id", prefix: "EVT-", fields: AdminEventService_FIELDS_, title: "title_th", category: "event_type", categories: EventService_TYPES_, validate: AdminEventService_validate_ };
}

function AdminEventService_validate_(record) {
  var normalized = {};
  Object.keys(record).forEach(function (key) { normalized[key] = record[key]; });
  AdminEventService_FIELDS_.forEach(function (field) {
    var value = record[field];
    if (["register_url", "google_maps_url", "image_url"].indexOf(field) >= 0) normalized[field] = AdminContentService_url_(value);
    else if (field === "is_featured") { if (typeof value !== "boolean") throw new Error("VALIDATION_ERROR"); }
    else if (field !== "latitude" && field !== "longitude") normalized[field] = AdminContentService_text_(value);
  });
  if (!normalized.title_th || !normalized.description_th || !normalized.location_th || EventService_TYPES_.indexOf(normalized.event_type) < 0 || !EventService_dateParts_(normalized.event_date)) throw new Error("VALIDATION_ERROR");
  ["start_time", "end_time"].forEach(function (field) { if (normalized[field] && !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(normalized[field])) throw new Error("VALIDATION_ERROR"); });
  if (normalized.end_time && (!normalized.start_time || normalized.end_time <= normalized.start_time)) throw new Error("VALIDATION_ERROR");
  AdminContentService_coordinates_(normalized);
  return normalized;
}

function adminGetEvents_(token, payload) { return AdminContentService_execute_(token, false, function () { return AdminContentService_list_(AdminEventService_domain_(), payload); }); }
function adminGetEventDetail_(token, payload) { return AdminContentService_execute_(token, false, function () { return AdminContentService_detail_(AdminEventService_domain_(), payload); }); }
function createEvent_(token, payload) { return AdminContentService_execute_(token, true, function (admin) { return AdminContentService_create_(AdminEventService_domain_(), admin, payload); }); }
function updateEvent_(token, payload) { return AdminContentService_execute_(token, true, function (admin) { return AdminContentService_update_(AdminEventService_domain_(), admin, payload, false); }); }
function deleteEvent_(token, payload) { return AdminContentService_execute_(token, true, function (admin) { return AdminContentService_update_(AdminEventService_domain_(), admin, payload, true); }); }
