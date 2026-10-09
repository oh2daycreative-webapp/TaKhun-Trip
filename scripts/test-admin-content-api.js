"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../public/admin/js/admin-api.js"), "utf8");
const token = "A".repeat(43), revision = "r1-" + "a".repeat(64), stamp = "2026-10-07T00:00:00.000Z";
const fields = {
  Product: "name_th name_en category producer_name related_place_id district description_th description_en price_range phone contact_url google_maps_url latitude longitude image_url tags is_featured sort_order".split(" "),
  Event: "title_th title_en event_type event_date start_time end_time location_th location_en related_place_id description_th description_en image_url contact_name contact_phone register_url google_maps_url latitude longitude is_featured".split(" ")
};
function harness(data, error, failure) {
  const calls = [], window = { APP_CONFIG: { API_URL: "https://api.example/exec" }, setTimeout, clearTimeout, AbortController,
    fetch: async (url, options) => { calls.push({ url, options }); if (failure) throw failure; return { ok: true, text: async () => JSON.stringify(error ? { ok: false, error } : { ok: true, data, message: "success" }) }; } };
  vm.runInNewContext(source, { window, URL });
  return { api: window.TakhunAdminApi, calls };
}
async function rejects(fn, code) { await assert.rejects(async () => fn(), error => error.code === code && error.message === "Admin API request failed."); }
(async () => {
  for (const entity of ["Product", "Event"]) {
    const idKey = entity.toLowerCase() + "_id", title = entity === "Product" ? "name_th" : "title_th", category = entity === "Product" ? "category" : "event_type";
    const content = Object.fromEntries(fields[entity].map(key => [key, ""]));
    Object.assign(content, { [title]: "Example", [category]: entity === "Product" ? "food" : "festival", description_th: "Description", is_featured: false });
    if (entity === "Event") Object.assign(content, { location_th: "Location", event_date: "2028-02-29" });
    const base = { [idKey]: "ID-1", status: "draft", revision, created_at: stamp, updated_at: stamp };
    const summary = { ...base, [title]: content[title], [category]: content[category] };
    const legacyBase = { ...base, created_at: "2026-07-11 10:00:00", updated_at: "2024-02-29 23:59:59" };
    assert.equal((await harness({ items: [{ ...legacyBase, [title]: content[title], [category]: content[category] }], total: 1, page: 1, page_size: 20, total_pages: 1 }).api[`get${entity}s`](token, {})).items.length, 1);
    assert.equal((await harness({ ...legacyBase, content }).api[`get${entity}Detail`](token, { [idKey]: "ID-1" })).created_at, legacyBase.created_at);
    for (const badStamp of ["2026-02-30 10:00:00", "2026-07-11T10:00:00", "arbitrary"]) {
      await rejects(() => harness({ ...base, created_at: badStamp, content }).api[`get${entity}Detail`](token, { [idKey]: "ID-1" }), "MALFORMED_RESPONSE");
    }
    for (const [method, payload, data, action] of [
      [`get${entity}s`, {}, { items: [summary], total: 1, page: 1, page_size: 20, total_pages: 1 }, `adminGet${entity}s`],
      [`get${entity}Detail`, { [idKey]: "ID-1" }, { ...base, content }, `adminGet${entity}Detail`],
      [`create${entity}`, content, { ...summary, audit_status: "unconfirmed" }, `create${entity}`],
      [`update${entity}`, { [idKey]: "ID-1", expected_revision: revision, status: "published" }, { ...summary, status: "published", audit_status: "recorded" }, `update${entity}`],
      [`delete${entity}`, { [idKey]: "ID-1", expected_revision: revision }, { ...summary, status: "deleted", audit_status: "recorded" }, `delete${entity}`]
    ]) {
      const h = harness(data);
      assert.equal(typeof h.api[method], "function", `${method} export`);
      assert.equal(JSON.stringify(await h.api[method](token, payload)), JSON.stringify(data));
      assert.equal(h.calls.length, 1);
      assert.deepEqual(JSON.parse(h.calls[0].options.body), { action, token, payload });
      assert.equal(h.calls[0].options.method, "POST");
      const malformed = harness({ ...data, private_column: "secret" });
      await rejects(() => malformed.api[method](token, payload), "MALFORMED_RESPONSE");
    }
    for (const patch of [{ role: "editor" }, { is_featured: "false" }, { latitude: "8" }, { [title]: "bad\ud800" }, { [title]: " =SUM(A1)" }, { image_url: "https://127.1/x" }, { image_url: "https://example.123" }, { image_url: "https://example.com/%0a" }, ...(entity === "Event" ? [{ event_date: "2027-02-29" }, { end_time: "12:00" }] : [{ tags: "one|one" }, { sort_order: -1 }])]) {
      const h = harness({});
      await rejects(() => h.api[`create${entity}`](token, { ...content, ...patch }), "VALIDATION_ERROR");
      assert.equal(h.calls.length, 0);
    }
    for (const bad of [{}, { [idKey]: "ID-1", expected_revision: revision }, { [idKey]: "ID-1", expected_revision: "bad", status: "draft" }]) {
      await rejects(() => harness({}).api[`update${entity}`](token, bad), "VALIDATION_ERROR");
    }
    for (const code of ["CONFLICT", "INVALID_TRANSITION", "DUPLICATE_ID"]) await rejects(() => harness(null, { code, message: "private" }).api[`create${entity}`](token, content), code);
    await rejects(() => harness(null, { code: "CONTENT_LOCK", message: "private" }).api[`create${entity}`](token, content), "SERVER_ERROR");
    const unknown = harness(null, { code: "OUTCOME_UNKNOWN", message: "private", retryable: false, [idKey]: "ID-1" });
    await assert.rejects(unknown.api[`create${entity}`](token, content), e => e.code === "OUTCOME_UNKNOWN" && e[idKey] === "ID-1" && e.retryable === false && !JSON.stringify(e).includes("private"));
    assert.equal(unknown.calls.length, 1);
    await rejects(() => harness(null, { code: "OUTCOME_UNKNOWN", message: "private", retryable: true, [idKey]: "ID-1" }).api[`create${entity}`](token, content), "MALFORMED_RESPONSE");
    for (const failure of [new Error("network secret"), { name: "AbortError" }]) {
      const h = harness(null, null, failure);
      await rejects(() => h.api[`create${entity}`](token, content), failure.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR");
      assert.equal(h.calls.length, 1, "uncertain mutations never retry");
    }
    for (const payload of [{ page: "1" }, { page: 1000001 }, { page_size: 101 }, { status: "unknown" }, { keyword: "a".repeat(201) }, { role: "viewer" }]) {
      const h = harness({});
      await rejects(() => h.api[`get${entity}s`](token, payload), "VALIDATION_ERROR");
      assert.equal(h.calls.length, 0);
    }
    await rejects(() => harness({ ...base, content: { ...content, private: "secret" } }).api[`get${entity}Detail`](token, { [idKey]: "ID-1" }), "MALFORMED_RESPONSE");
    await rejects(() => harness({ ...base, [idKey]: "OTHER", content }).api[`get${entity}Detail`](token, { [idKey]: "ID-1" }), "MALFORMED_RESPONSE");
    await rejects(() => harness(null, { code: "OUTCOME_UNKNOWN", message: "private", retryable: false, [idKey]: "ID-1" }).api[`get${entity}s`](token, {}), "MALFORMED_RESPONSE");
    // A legacy record remains readable for explicit repair; publishing validation is server-owned.
    const legacy = { ...base, content: { ...content, description_th: "=legacy", image_url: "javascript:legacy" } };
    assert.equal((await harness(legacy).api[`get${entity}Detail`](token, { [idKey]: "ID-1" })).content.description_th, "=legacy");
  }
  const routeFields = "name_th name_en slug short_description_th short_description_en description_th description_en duration travel_style cover_image_url map_focus_lat map_focus_lng is_featured sort_order".split(" ");
  const stopFields = "route_place_id place_id day_number stop_order start_time end_time note_th note_en status".split(" ");
  const routeContent = Object.fromEntries(routeFields.map(key => [key, ""]));
  Object.assign(routeContent, {
    name_th: "Route", short_description_th: "Short", description_th: "Description", slug: "route-one",
    travel_style: "nature|slow_travel", cover_image_url: "https://example.com/route.jpg",
    map_focus_lat: 8.9, map_focus_lng: 98.5, is_featured: false, sort_order: 0
  });
  const routeStops = [
    { route_place_id: "REL-1", place_id: "PLACE-1", day_number: 1, stop_order: 1, start_time: "09:00", end_time: "10:00", note_th: "First", note_en: "", status: "draft" },
    { route_place_id: "", place_id: "PLACE-2", day_number: "", stop_order: 2, start_time: "", end_time: "", note_th: "", note_en: "", status: "draft" }
  ];
  const routeBase = { route_id: "ROUTE-1", status: "draft", revision, created_at: stamp, updated_at: stamp };
  const routeSummary = { ...routeBase, name_th: "Route", travel_style: "nature|slow_travel" };
  const routeDetail = { ...routeBase, content: routeContent, stops: routeStops };
  for (const [method, payload, data, action] of [
    ["getRoutes", { keyword: "Route", status: "draft", page: 1, page_size: 20 }, { items: [routeSummary], page: 1, page_size: 20, total: 1, total_pages: 1 }, "adminGetRoutes"],
    ["getRouteDetail", { route_id: "ROUTE-1" }, routeDetail, "adminGetRouteDetail"],
    ["createRoute", { content: routeContent, stops: routeStops, status: "draft" }, { ...routeSummary, audit_status: "unconfirmed" }, "createRoute"],
    ["updateRoute", { route_id: "ROUTE-1", expected_revision: revision, content: routeContent, stops: routeStops, status: "draft" }, { ...routeSummary, audit_status: "recorded" }, "updateRoute"],
    ["deleteRoute", { route_id: "ROUTE-1", expected_revision: revision }, { ...routeSummary, status: "deleted", audit_status: "recorded" }, "deleteRoute"]
  ]) {
    const h = harness(data);
    assert.equal(typeof h.api[method], "function", `${method} export`);
    assert.equal(JSON.stringify(await h.api[method](token, payload)), JSON.stringify(data));
    assert.equal(h.calls.length, 1);
    assert.deepEqual(JSON.parse(h.calls[0].options.body), { action, token, payload });
    assert.equal(h.calls[0].options.method, "POST");
    await rejects(() => harness({ ...data, private_column: "secret" }).api[method](token, payload), "MALFORMED_RESPONSE");
  }
  for (const [payload, patch] of [
    [{ content: { ...routeContent, private: "secret" } }, null],
    [{ content: { ...routeContent, name_th: " =SUM(A1)" } }, null],
    [{ content: { ...routeContent, slug: "Bad Slug" } }, null],
    [{ content: { ...routeContent, slug: "a".repeat(201) } }, null],
    [{ content: { ...routeContent, cover_image_url: "https://127.1/x" } }, null],
    [{ content: { ...routeContent, map_focus_lat: 91 } }, null],
    [{ content: { ...routeContent, map_focus_lng: "98" } }, null],
    [{ content: { ...routeContent, map_focus_lng: "" } }, null],
    [{ content: { ...routeContent, map_focus_lat: "" } }, null],
    [{ content: { ...routeContent, is_featured: "false" } }, null],
    [{ content: { ...routeContent, sort_order: -1 } }, null],
    [{ content: { ...routeContent, travel_style: "nature|nature" } }, null],
    [{ content: { ...routeContent, travel_style: "Nature" } }, null],
    [{ content: { ...routeContent, travel_style: "nature||lake" } }, null],
    [{ content: { ...routeContent, travel_style: "a".repeat(501) } }, null],
    [{ content: routeContent, route_id: "ROUTE-1" }, null]
  ]) {
    const h = harness({});
    await rejects(() => h.api.createRoute(token, patch ? { ...payload, ...patch } : payload), "VALIDATION_ERROR");
    assert.equal(h.calls.length, 0);
  }
  for (const coordinates of [
    { map_focus_lat: "", map_focus_lng: "" },
    { map_focus_lat: 8.9, map_focus_lng: 98.5 },
    { map_focus_lat: 0, map_focus_lng: 0 }
  ]) {
    const h = harness({ ...routeSummary, audit_status: "recorded" });
    await h.api.createRoute(token, { content: { ...routeContent, ...coordinates } });
    const sent = JSON.parse(h.calls[0].options.body).payload.content;
    assert.equal(sent.map_focus_lat, coordinates.map_focus_lat);
    assert.equal(sent.map_focus_lng, coordinates.map_focus_lng);
  }
  for (const payload of [{ page: "1" }, { page: 1000001 }, { page_size: 101 }, { status: "all" }, { keyword: "a".repeat(201) }, { category: "nature" }]) {
    const h = harness({});
    await rejects(() => h.api.getRoutes(token, payload), "VALIDATION_ERROR");
    assert.equal(h.calls.length, 0);
  }
  for (const stops of [
    [{ ...routeStops[0], stop_order: 2 }],
    [routeStops[0], { ...routeStops[1], place_id: "PLACE-1" }],
    [routeStops[0], { ...routeStops[1], route_place_id: "REL-1" }],
    [{ ...routeStops[0], day_number: 0 }],
    [{ ...routeStops[0], start_time: "9:00" }],
    [{ ...routeStops[0], start_time: "10:00", end_time: "10:00" }],
    [{ ...routeStops[0], start_time: "", end_time: "10:00" }],
    [{ ...routeStops[0], status: "published" }],
    [{ ...routeStops[0], private: "secret" }]
  ]) {
    const h = harness({});
    await rejects(() => h.api.createRoute(token, { content: routeContent, stops }), "VALIDATION_ERROR");
    assert.equal(h.calls.length, 0);
  }
  await rejects(() => harness({}).api.createRoute(token, { content: routeContent, stops: Array.from({ length: 101 }, (_, index) => ({ ...routeStops[0], route_place_id: "", place_id: `P-${index}`, stop_order: index + 1 })) }), "VALIDATION_ERROR");
  for (const stops of [null, false, "", 0]) {
    const h = harness({});
    await rejects(() => h.api.updateRoute(token, { route_id: "ROUTE-1", expected_revision: revision, stops }), "VALIDATION_ERROR");
    assert.equal(h.calls.length, 0);
  }
  for (const bad of [
    {},
    { route_id: "ROUTE-1", expected_revision: revision },
    { route_id: "ROUTE-1", expected_revision: "bad", status: "draft" },
    { route_id: "ROUTE-1", expected_revision: revision, content: { name_th: "partial" } }
  ]) await rejects(() => harness({}).api.updateRoute(token, bad), "VALIDATION_ERROR");
  await rejects(() => harness({ ...routeDetail, stops: [{ ...routeStops[0], stop_order: 2 }] }).api.getRouteDetail(token, { route_id: "ROUTE-1" }), "MALFORMED_RESPONSE");
  await rejects(() => harness({ ...routeDetail, stops: [routeStops[0], { ...routeStops[1], place_id: "PLACE-1" }] }).api.getRouteDetail(token, { route_id: "ROUTE-1" }), "MALFORMED_RESPONSE");
  await rejects(() => harness({ ...routeDetail, stops: [routeStops[0], { ...routeStops[1], route_place_id: "REL-1" }] }).api.getRouteDetail(token, { route_id: "ROUTE-1" }), "MALFORMED_RESPONSE");
  await rejects(() => harness({ ...routeDetail, stops: [{ ...routeStops[0], status: "published" }] }).api.getRouteDetail(token, { route_id: "ROUTE-1" }), "MALFORMED_RESPONSE");
  await rejects(() => harness({ ...routeDetail, content: { ...routeContent, private: "secret" } }).api.getRouteDetail(token, { route_id: "ROUTE-1" }), "MALFORMED_RESPONSE");
  for (const code of ["CONFLICT", "INVALID_TRANSITION"]) await rejects(() => harness(null, { code, message: "private" }).api.updateRoute(token, { route_id: "ROUTE-1", expected_revision: revision, status: "published" }), code);
  await rejects(() => harness(null, { code: "CONTENT_LOCK", message: "private" }).api.updateRoute(token, { route_id: "ROUTE-1", expected_revision: revision, status: "published" }), "SERVER_ERROR");
  const uncertainRoute = harness(null, { code: "OUTCOME_UNKNOWN", message: "private", retryable: false, route_id: "ROUTE-1" });
  await assert.rejects(uncertainRoute.api.updateRoute(token, { route_id: "ROUTE-1", expected_revision: revision, status: "published" }), error => error.code === "OUTCOME_UNKNOWN" && error.route_id === "ROUTE-1" && error.retryable === false && !JSON.stringify(error).includes("private"));
  assert.equal(uncertainRoute.calls.length, 1);
  for (const error of [
    { code: "OUTCOME_UNKNOWN", message: "private", retryable: true, route_id: "ROUTE-1" },
    { code: "OUTCOME_UNKNOWN", message: "private", retryable: false, route_id: "bad id" },
    { code: "OUTCOME_UNKNOWN", message: "private", retryable: false, route_id: "ROUTE-1", details: "secret" }
  ]) await rejects(() => harness(null, error).api.updateRoute(token, { route_id: "ROUTE-1", expected_revision: revision, status: "published" }), "MALFORMED_RESPONSE");
  for (const failure of [new Error("network secret"), { name: "AbortError" }]) {
    const h = harness(null, null, failure);
    await rejects(() => h.api.createRoute(token, { content: routeContent }), failure.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR");
    assert.equal(h.calls.length, 1, "uncertain Route mutations never retry");
  }
  for (const [stored, expected] of [["", false], [false, false], [true, true]]) {
    const detail = await harness({ ...routeDetail, content: { ...routeContent, is_featured: stored } }).api.getRouteDetail(token, { route_id: "ROUTE-1" });
    assert.equal(detail.content.is_featured, expected, `legacy is_featured ${JSON.stringify(stored)} normalizes safely`);
  }
  for (const malformed of ["false", 0, null]) {
    await rejects(() => harness({ ...routeDetail, content: { ...routeContent, is_featured: malformed } }).api.getRouteDetail(token, { route_id: "ROUTE-1" }), "MALFORMED_RESPONSE");
  }
  const galleryContent = { title_th: "Gallery", title_en: "", category: "dam_lake", related_place_id: "", caption_th: "", caption_en: "", credit: "", sort_order: 0, image_url: "", thumbnail_url: "", video_url: "", media_type: "image" };
  const galleryBase = { media_id: "gallery-one", title_th: "Gallery", media_type: "image", category: "dam_lake", status: "draft", revision, created_at: stamp, updated_at: stamp, media_state: "approved_image" };
  const galleryDetail = { ...galleryBase, content: galleryContent };
  const galleryOption = { media_id: "gallery-one", entity_type: "gallery", entity_id: "GALLERY-ONE", role: "gallery", alt_th: "ภาพ", alt_en: "Image", fallback: "assets/media/placeholders/gallery.svg", outputs: [{ width: 640, height: 427, path: "assets/media/generated/gallery/gallery-one-640.webp" }] };
  for (const [method, payload, data, action] of [
    ["getGallery", { category: "dam_lake", status: "draft", media_type: "image", page: 1, page_size: 20 }, { items: [galleryBase], page: 1, page_size: 20, total: 1, total_pages: 1 }, "adminGetGallery"],
    ["getGalleryDetail", { media_id: "gallery-one" }, galleryDetail, "adminGetGalleryDetail"],
    ["getGalleryMediaOptions", { page: 1, page_size: 20 }, { items: [galleryOption], page: 1, page_size: 20, total: 1, total_pages: 1 }, "adminGetGalleryMediaOptions"],
    ["createGalleryItem", { media_id: "gallery-one", title_th: "Gallery", title_en: "", category: "dam_lake", related_place_id: "", caption_th: "", caption_en: "", credit: "", sort_order: 0 }, { ...galleryBase, audit_status: "recorded" }, "createGalleryItem"],
    ["updateGalleryItem", { media_id: "gallery-one", expected_revision: revision, status: "published" }, { ...galleryBase, status: "published", audit_status: "recorded" }, "updateGalleryItem"],
    ["deleteGalleryItem", { media_id: "gallery-one", expected_revision: revision }, { ...galleryBase, status: "deleted", audit_status: "unconfirmed" }, "deleteGalleryItem"]
  ]) {
    const h = harness(data);
    assert.equal(typeof h.api[method], "function", `${method} export`);
    assert.equal(JSON.stringify(await h.api[method](token, payload)), JSON.stringify(data));
    assert.deepEqual(JSON.parse(h.calls[0].options.body), { action, token, payload });
  }
  for (const forbidden of ["image_url", "thumbnail_url", "video_url", "source_path", "filesystem_path", "html"]) {
    const h = harness({});
    await rejects(() => h.api.createGalleryItem(token, { media_id: "gallery-one", title_th: "Gallery", title_en: "", category: "dam_lake", related_place_id: "", caption_th: "", caption_en: "", credit: "", sort_order: 0, [forbidden]: forbidden === "html" ? "<b>x</b>" : "https://example.com/x" }), "VALIDATION_ERROR");
    assert.equal(h.calls.length, 0);
  }
  await rejects(() => harness({}).api.createGalleryItem(token, { media_id: "gallery-one", title_th: "Gallery", title_en: "", category: "legacy", related_place_id: "", caption_th: "", caption_en: "", credit: "", sort_order: 0 }), "VALIDATION_ERROR");
  assert.equal((await harness({ ...galleryDetail, content: { ...galleryContent, sort_order: "" } }).api.getGalleryDetail(token, { media_id: "gallery-one" })).content.sort_order, "");
  const uncertainGallery = harness(null, { code: "OUTCOME_UNKNOWN", message: "private", retryable: false, media_id: "gallery-one" });
  await assert.rejects(uncertainGallery.api.updateGalleryItem(token, { media_id: "gallery-one", expected_revision: revision, status: "published" }), error => error.code === "OUTCOME_UNKNOWN" && error.media_id === "gallery-one" && error.retryable === false);
  for (const malformed of [
    { ...galleryBase, status: "published", audit_status: "recorded" },
    { ...galleryBase, media_type: "video", media_state: "legacy_video", audit_status: "recorded" }
  ]) await rejects(() => harness(malformed).api.createGalleryItem(token, { media_id: "gallery-one", title_th: "Gallery", title_en: "", category: "dam_lake", related_place_id: "", caption_th: "", caption_en: "", credit: "", sort_order: 0 }), "MALFORMED_RESPONSE");
  for (const content of [
    { ...galleryContent, media_type: "video" },
    { ...galleryContent, category: "mountain_nature" },
    { ...galleryContent, title_th: "Contradiction" }
  ]) await rejects(() => harness({ ...galleryDetail, content }).api.getGalleryDetail(token, { media_id: "gallery-one" }), "MALFORMED_RESPONSE");
  const legacyVideoDetail = { ...galleryDetail, media_id: "LEGACY-VIDEO", media_type: "video", media_state: "legacy_video", category: "event", title_th: "Legacy", content: { ...galleryContent, media_type: "video", category: "event", title_th: "Legacy", video_url: "https://video.example/legacy.mp4" } };
  assert.equal((await harness(legacyVideoDetail).api.getGalleryDetail(token, { media_id: "LEGACY-VIDEO" })).media_state, "legacy_video");
  const legacyRoute = { ...routeDetail, created_at: "2026-07-11 10:00:00", updated_at: "2024-02-29 23:59:59", content: { ...routeContent, description_th: "=legacy", cover_image_url: "javascript:legacy", travel_style: "Legacy Value", map_focus_lat: 999, sort_order: -1 } };
  assert.equal((await harness(legacyRoute).api.getRouteDetail(token, { route_id: "ROUTE-1" })).content.description_th, "=legacy");
  const admin = { admin_id: "ADM-123e4567-e89b-12d3-a456-426614174000", username: "operator", display_name: "Operator", role: "super_admin" };
  await rejects(() => harness({ admin, expires_at: "2026-07-11 10:00:00" }).api.validateSession(token), "MALFORMED_RESPONSE");
  console.log("Admin Product/Event/Route API contracts passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
