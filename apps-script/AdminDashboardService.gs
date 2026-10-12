var AdminDashboardService_WARNING_CODE_ = "SKIPPED_INVALID_OR_DUPLICATE_ROWS";
var AdminDashboardService_COMMON_STATUSES_ = ["draft", "published", "hidden", "archived", "deleted"];
var AdminDashboardService_DOMAINS_ = [
  { domain:"places", key:"total_places", sheet:"places", id:"place_id", headers:["place_id","status"], statuses:["draft","published","archived"], idLimit:64 },
  { domain:"routes", key:"total_routes", sheet:"routes", id:"route_id", headers:["route_id","status"], statuses:AdminDashboardService_COMMON_STATUSES_, idLimit:100 },
  { domain:"products", key:"total_products", sheet:"products", id:"product_id", headers:["product_id","status"], statuses:AdminDashboardService_COMMON_STATUSES_, idLimit:100 },
  { domain:"events", key:"total_events", sheet:"events", id:"event_id", headers:["event_id","status"], statuses:AdminDashboardService_COMMON_STATUSES_, idLimit:100 },
  { domain:"reviews", key:"pending_reviews", sheet:"reviews", id:"review_id", headers:AdminReviewService_HEADERS_, statuses:AdminReviewService_STATUSES_, idLimit:100, review:true },
  { domain:"gallery", key:"total_gallery", sheet:"gallery", id:"media_id", headers:["media_id","status"], statuses:AdminDashboardService_COMMON_STATUSES_, idLimit:100 }
];

function AdminDashboardService_error_(error) {
  var code = error && error.message;
  if (code !== "UNAUTHORIZED" && code !== "FORBIDDEN") code = "SERVER_ERROR";
  return { ok:false, error:{ code:code, message:code === "UNAUTHORIZED" ? "Sign in to continue." : code === "FORBIDDEN" ? "This role cannot perform this action." : "Dashboard data is unavailable." } };
}

function AdminDashboardService_validId_(value, limit) {
  return typeof value === "string" && value.length <= limit && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
}

function AdminDashboardService_count_(definition) {
  var table = SheetService_readTable_(definition.sheet, definition.headers);
  if (!table || !Array.isArray(table.rows)) throw new Error("DASHBOARD_SCHEMA");
  var occurrences = Object.create(null);
  table.rows.forEach(function (entry) {
    var row = entry && entry.values;
    var id = row && row[definition.id];
    if (AdminDashboardService_validId_(id, definition.idLimit)) occurrences[id] = (occurrences[id] || 0) + 1;
  });
  var count = 0;
  var skipped = 0;
  table.rows.forEach(function (entry) {
    var row = entry && entry.values;
    var id = row && row[definition.id];
    if (!AdminDashboardService_validId_(id, definition.idLimit) || occurrences[id] !== 1) { skipped += 1; return; }
    if (definition.statuses.indexOf(row.status) < 0) { skipped += 1; return; }
    if (definition.review) {
      try { AdminReviewService_validateStored_(row); }
      catch (_invalidReview) { skipped += 1; return; }
      if (row.status === "pending") count += 1;
      return;
    }
    if (row.status !== "deleted") count += 1;
  });
  return { count:count, skipped:skipped };
}

function adminGetDashboard_(token) {
  try {
    AuthService_requireAdmin_(token);
    var data = {
      total_places:0,
      total_routes:0,
      total_products:0,
      total_events:0,
      pending_reviews:0,
      total_gallery:0,
      warnings:[]
    };
    AdminDashboardService_DOMAINS_.forEach(function (definition) {
      var result = AdminDashboardService_count_(definition);
      data[definition.key] = result.count;
      if (result.skipped) data.warnings.push({ domain:definition.domain, code:AdminDashboardService_WARNING_CODE_, skipped_count:result.skipped });
    });
    return { ok:true, data:data, message:"success" };
  } catch (error) {
    return AdminDashboardService_error_(error);
  }
}
