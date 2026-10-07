var AdminProductService_FIELDS_ = ["name_th", "name_en", "category", "producer_name", "related_place_id", "district", "description_th", "description_en", "price_range", "phone", "contact_url", "google_maps_url", "latitude", "longitude", "image_url", "tags", "is_featured", "sort_order"];

function AdminProductService_domain_() {
  return { entity: "product", table: "products", id: "product_id", prefix: "PROD-", fields: AdminProductService_FIELDS_, title: "name_th", category: "category", categories: ProductService_CATEGORIES_, validate: AdminProductService_validate_ };
}

function AdminProductService_validate_(record) {
  var normalized = {};
  Object.keys(record).forEach(function (key) { normalized[key] = record[key]; });
  AdminProductService_FIELDS_.forEach(function (field) {
    var value = record[field];
    if (["contact_url", "google_maps_url", "image_url"].indexOf(field) >= 0) normalized[field] = AdminContentService_url_(value);
    else if (field === "is_featured") { if (typeof value !== "boolean") throw new Error("VALIDATION_ERROR"); }
    else if (field === "sort_order") { if (value !== "" && (!Number.isSafeInteger(value) || value < 0)) throw new Error("VALIDATION_ERROR"); }
    else if (field !== "latitude" && field !== "longitude") normalized[field] = AdminContentService_text_(value);
  });
  if (!normalized.name_th || !normalized.description_th || ProductService_CATEGORIES_.indexOf(normalized.category) < 0) throw new Error("VALIDATION_ERROR");
  if (normalized.district && ProductService_DISTRICTS_.indexOf(normalized.district) < 0) throw new Error("VALIDATION_ERROR");
  if (normalized.tags) {
    var tags = normalized.tags.split("|").map(function (tag) { return AdminContentService_text_(tag, 200); });
    if (tags.length > 100 || tags.some(function (tag, i) { return !tag || tags.indexOf(tag) !== i; })) throw new Error("VALIDATION_ERROR");
    normalized.tags = tags.join("|");
  }
  AdminContentService_coordinates_(normalized);
  return normalized;
}

function adminGetProducts_(token, payload) { return AdminContentService_execute_(token, false, function () { return AdminContentService_list_(AdminProductService_domain_(), payload); }); }
function adminGetProductDetail_(token, payload) { return AdminContentService_execute_(token, false, function () { return AdminContentService_detail_(AdminProductService_domain_(), payload); }); }
function createProduct_(token, payload) { return AdminContentService_execute_(token, true, function (admin) { return AdminContentService_create_(AdminProductService_domain_(), admin, payload); }); }
function updateProduct_(token, payload) { return AdminContentService_execute_(token, true, function (admin) { return AdminContentService_update_(AdminProductService_domain_(), admin, payload, false); }); }
function deleteProduct_(token, payload) { return AdminContentService_execute_(token, true, function (admin) { return AdminContentService_update_(AdminProductService_domain_(), admin, payload, true); }); }
