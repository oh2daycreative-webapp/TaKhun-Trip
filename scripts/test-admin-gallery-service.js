"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));

const HEADERS = ["media_id", "title_th", "title_en", "media_type", "category", "related_place_id", "image_url", "video_url", "thumbnail_url", "caption_th", "caption_en", "credit", "sort_order", "status", "created_at", "updated_at", "extension_note"];
const REVISION = /^r1-[a-f0-9]{64}$/;
const AUDIT_HEADERS = ["log_id", "admin_id", "action", "entity_type", "entity_id", "description", "created_at", "audit_id", "actor_admin_id", "occurred_at"];
const rows = () => [
  { media_id: "gallery-dam-lake-001", title_th: "เขื่อน", title_en: "Dam", media_type: "image", category: "dam_lake", related_place_id: "PLC-1", image_url: "", video_url: "", thumbnail_url: "", caption_th: "วิว", caption_en: "View", credit: "Owner", sort_order: 1, status: "published", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z", extension_note: "keep" },
  { media_id: "LEGACY-VIDEO", title_th: "วิดีโอ", title_en: "Video", media_type: "video", category: "event", related_place_id: "", image_url: "", video_url: "https://video.example/legacy.mp4", thumbnail_url: "", caption_th: "เดิม", caption_en: "Legacy", credit: "", sort_order: "", status: "published", created_at: "2026-01-03T00:00:00.000Z", updated_at: "2026-01-04T00:00:00.000Z", extension_note: "secret" },
  { media_id: "gallery-hidden", title_th: "ซ่อน", title_en: "", media_type: "image", category: "mountain_nature", related_place_id: "", image_url: "", video_url: "", thumbnail_url: "", caption_th: "", caption_en: "", credit: "", sort_order: 2, status: "hidden", created_at: "2026-01-05T00:00:00.000Z", updated_at: "2026-01-06T00:00:00.000Z", extension_note: "hidden" }
];

function manifestItem(media_id, overrides = {}) {
  return { media_id, entity_type: "gallery", entity_id: media_id.toUpperCase(), role: "gallery", alt_th: "ภาพ", alt_en: "Image", fallback: "assets/media/placeholders/gallery.svg", outputs: [{ width: 640, height: 427, path: `assets/media/generated/gallery/${media_id}-640.webp` }], ...overrides };
}

function table(values, headers = HEADERS) {
  return { headers: [...headers], headerMap: Object.fromEntries(headers.map((h, i) => [h, i])), rows: values.map((values, index) => ({ sourceRowNumber: index + 2, values })) };
}

function load(options = {}) {
  const data = options.rows || rows();
  const audits = (options.audits || []).map(row => ({ ...row }));
  const places = options.places || [{ place_id: "PLC-1", status: "published" }];
  const calls = { auth: 0, reads: 0, writes: 0, entityWrites: 0, invalidations: 0, releases: 0, flushes: 0 };
  const cacheValues = new Map();
  const cachePuts = [];
  const cacheStore = { get(key) { return cacheValues.has(key) ? cacheValues.get(key) : null; }, put(key, value, ttl) { cachePuts.push({ key, value, ttl }); cacheValues.set(key, value); }, remove(key) { cacheValues.delete(key); } };
  let uuidCounter = 0;
  const lock = { held: false, tryLock() { if (options.lockFailure) return false; this.held = true; return true; }, releaseLock() { calls.releases += 1; this.held = false; if (options.releaseFailure) throw new Error("release"); } };
  const sheetFor = name => ({
    getLastRow: () => name === "gallery" ? data.length + 1 : audits.length + 1,
    getRange: (_row, _column, _height, width) => ({
      getNumberFormats: () => [Array(width).fill("@").map((value, index) => options.badFormatIndex === index ? "0" : value)],
      getFormulas: () => [Array(width).fill("").map((value, index) => options.formulaIndex === index ? "=A1" : value)]
    })
  });
  const context = {
    JSON, Object, Array, String, Number, Math, Date, RegExp, isFinite, encodeURIComponent,
    CryptoService_utf8Bytes_: value => Array.from(Buffer.from(value, "utf8")),
    CryptoService_sha256_: bytes => Array.from(require("node:crypto").createHash("sha256").update(Buffer.from(bytes)).digest()),
    AuthService_requireAdmin_() { calls.auth += 1; if (options.authError || options.revokeUnderLock && lock.held && calls.auth > 1) throw new Error(options.authError || "UNAUTHORIZED"); return { admin_id: "ADM-1", role: options.role || "editor" }; },
    SheetService_readTable_(name) { calls.reads += 1; if (name === "gallery") { if (options.entityReadFailureAfterWrite && calls.entityWrites) throw new Error("READ_FAILURE"); const result = table(data, options.headers || HEADERS); if (options.corruptEntityReadback && calls.entityWrites && result.rows.length) result.rows[result.rows.length - 1].values.title_th = "CORRUPTED"; return result; } if (name === "places") return { headers: ["place_id", "status"], headerMap: { place_id: 0, status: 1 }, rows: places.map((values, index) => ({ sourceRowNumber: index + 2, values })) }; if (name === "activity_logs") { const values = options.corruptAuditReadback && calls.entityWrites ? audits.map(row => ({ ...row, action: "CORRUPTED_ACTION" })) : audits; return { headers: [...AUDIT_HEADERS], headerMap: Object.fromEntries(AUDIT_HEADERS.map((h, i) => [h, i])), rows: values.map((values, index) => ({ sourceRowNumber: index + 2, values })) }; } throw new Error("UNEXPECTED_READ"); },
    SheetService_getSheet_: sheetFor,
    SheetService_prepareAppendDestination_: (_sheet, headers) => ({ headers: [...headers] }),
    SheetService_appendObjectWithRow_(name, headers, record) { calls.writes += 1; if (name === "gallery") calls.entityWrites += 1; if (options.failWrite === name) throw new Error("WRITE_FAILURE"); const complete = Object.fromEntries(headers.map(field => [field, Object.prototype.hasOwnProperty.call(record, field) ? record[field] : ""])); (name === "gallery" ? data : audits).push(complete); if (name === "gallery" && options.throwAfterEntityWrite) throw new Error("LOST_RESPONSE"); return { sourceRowNumber: (name === "gallery" ? data.length : audits.length) + 1, values: complete }; },
    SheetService_replaceObjectAtRow_(name, rowNumber, record) { calls.writes += 1; if (name === "gallery") calls.entityWrites += 1; if (options.failWrite === name) throw new Error("WRITE_FAILURE"); if (name !== "gallery") throw new Error("UNEXPECTED_WRITE"); data[rowNumber - 2] = { ...record }; if (options.throwAfterEntityWrite) throw new Error("LOST_RESPONSE"); },
    ContentCacheService_invalidateUnderLock_() { calls.invalidations += 1; if (!lock.held) throw new Error("NOT_LOCKED"); if (options.cacheFailure) throw new Error("CONTENT_CACHE_INVALIDATION"); },
    CacheService: { getScriptCache: () => cacheStore },
    readSheetObjects_: name => name === "gallery" ? data : [],
    ApprovedMediaService_read_: () => ({ version: 1, items: options.manifest || [manifestItem("gallery-dam-lake-001"), manifestItem("place-wrong", { entity_type: "place", role: "gallery" }), manifestItem("gallery-cover", { role: "cover" })] }),
    ApprovedMediaService_projection_: item => ({ media_id: item.media_id, entity_type: item.entity_type, entity_id: item.entity_id, role: item.role, alt_th: item.alt_th, alt_en: item.alt_en, fallback: item.fallback, outputs: item.outputs.map(output => ({ ...output })) }),
    LockService: { getScriptLock() { return lock; } },
    SpreadsheetApp: { flush() { calls.flushes += 1; if (options.flushFailure) throw new Error("FLUSH_FAILURE"); } },
    Utilities: { getUuid() { uuidCounter += 1; return options.forcedUuid || `11111111-1111-4111-8111-${String(uuidCounter).padStart(12, "0")}`; } }
  };
  vm.createContext(context);
  vm.runInContext(read("apps-script/AdminGalleryService.gs"), context, { filename: "apps-script/AdminGalleryService.gs" });
  return { context, calls, data, audits, lock, cacheStore, cachePuts };
}

function test(name, fn) {
  try { fn(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

test("Gallery reads authorize all four roles and expose exact safe legacy-aware projections", () => {
  for (const role of ["super_admin", "editor", "reviewer", "viewer"]) {
    const h = load({ role });
    const list = plain(h.context.adminGetGallery_("TOKEN", { page: 1, page_size: 20 }));
    assert.equal(list.ok, true, role);
    assert.deepEqual(Object.keys(list.data), ["items", "page", "page_size", "total", "total_pages"]);
    assert.deepEqual(list.data.items.map(item => item.media_id), ["gallery-dam-lake-001", "LEGACY-VIDEO", "gallery-hidden"]);
    assert.deepEqual(Object.keys(list.data.items[0]), ["media_id", "title_th", "media_type", "category", "status", "revision", "created_at", "updated_at", "media_state"]);
    assert.match(list.data.items[0].revision, REVISION);
    assert.equal(list.data.items[1].media_state, "legacy_video");
    assert.equal(JSON.stringify(list).includes("extension_note"), false);
    const detail = plain(h.context.adminGetGalleryDetail_("TOKEN", { media_id: "LEGACY-VIDEO" }));
    assert.equal(detail.ok, true);
    assert.equal(detail.data.content.video_url, "https://video.example/legacy.mp4");
    assert.equal(detail.data.media_state, "legacy_video");
    assert.equal(h.calls.writes, 0);
  }
});

test("Gallery list validates exact filters and paginates deterministic Sheet order", () => {
  const h = load();
  const filtered = plain(h.context.adminGetGallery_("TOKEN", { keyword: "video", status: "published", media_type: "video", category: "event", page: 1, page_size: 1 }));
  assert.deepEqual(filtered.data.items.map(item => item.media_id), ["LEGACY-VIDEO"]);
  assert.deepEqual({ total: filtered.data.total, total_pages: filtered.data.total_pages }, { total: 1, total_pages: 1 });
  for (const payload of [null, { extra: true }, { page: 0 }, { page_size: 101 }, { media_type: "audio" }, { status: "missing" }, { category: 4 }]) {
    assert.equal(plain(h.context.adminGetGallery_("TOKEN", payload)).error.code, "VALIDATION_ERROR");
  }
});

test("Gallery detail rejects malformed and unknown identities without leaking rows", () => {
  const h = load();
  for (const payload of [{}, { media_id: "../bad" }, { media_id: "LEGACY-VIDEO", extra: true }]) assert.equal(plain(h.context.adminGetGalleryDetail_("TOKEN", payload)).error.code, "VALIDATION_ERROR");
  assert.equal(plain(h.context.adminGetGalleryDetail_("TOKEN", { media_id: "missing" })).error.code, "NOT_FOUND");
});

test("Gallery media options expose only approved gallery role assets with bounded pagination", () => {
  const h = load({ manifest: [manifestItem("gallery-b"), manifestItem("gallery-a"), manifestItem("place-wrong", { entity_type: "place" }), manifestItem("gallery-cover", { role: "cover" })] });
  const result = plain(h.context.adminGetGalleryMediaOptions_("TOKEN", { keyword: "gallery", page: 1, page_size: 1 }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.items.map(item => item.media_id), ["gallery-a"]);
  assert.deepEqual({ total: result.data.total, total_pages: result.data.total_pages }, { total: 2, total_pages: 2 });
  assert.equal(/source_file|sha256|bytes/.test(JSON.stringify(result)), false);
  for (const payload of [null, { role: "gallery" }, { keyword: 1 }, { page_size: 101 }]) assert.equal(plain(h.context.adminGetGalleryMediaOptions_("TOKEN", payload)).error.code, "VALIDATION_ERROR");
});

test("Gallery reads reject invalid sessions and unsupported roles", () => {
  assert.equal(plain(load({ authError: "UNAUTHORIZED" }).context.adminGetGallery_("TOKEN", {})).error.code, "UNAUTHORIZED");
  assert.equal(plain(load({ role: "unknown" }).context.adminGetGallery_("TOKEN", {})).error.code, "FORBIDDEN");
});

test("Gallery reads fail closed on malformed timestamps and unknown stored categories", () => {
  for (const row of [{ ...rows()[0], created_at: "not-a-date" }, { ...rows()[0], category: "invented" }]) {
    assert.equal(plain(load({ rows: [row] }).context.adminGetGallery_("TOKEN", {})).error.code, "SERVER_ERROR");
  }
});

test("Gallery revision covers canonical content and status but excludes timestamps and extensions", () => {
  const h = load(); const source = rows()[0];
  const first = h.context.AdminGalleryService_revision_(source);
  assert.match(first, REVISION);
  assert.equal(h.context.AdminGalleryService_revision_({ ...source }), first);
  assert.equal(h.context.AdminGalleryService_revision_({ ...source, updated_at: "2099-01-01T00:00:00.000Z", extension_note: "changed" }), first);
  for (const field of ["media_id", "title_th", "title_en", "media_type", "category", "related_place_id", "image_url", "video_url", "thumbnail_url", "caption_th", "caption_en", "credit", "sort_order", "status"]) {
    const changed = { ...source, [field]: field === "sort_order" ? 99 : `${source[field]}-changed` };
    assert.notEqual(h.context.AdminGalleryService_revision_(changed), first, field);
  }
});

test("Gallery create uses approved unused manifest identity and rejects unsafe authoring fields", () => {
  const valid = { media_id: "gallery-new", title_th: "ภาพใหม่", title_en: "New", category: "dam_lake", related_place_id: "PLC-1", caption_th: "คำบรรยาย", caption_en: "Caption", credit: "Owner", sort_order: 3 };
  const h = load({ manifest: [manifestItem("gallery-new")] });
  const result = plain(h.context.createGalleryItem_("TOKEN", valid));
  assert.equal(result.ok, true); assert.equal(result.data.media_id, "gallery-new"); assert.equal(result.data.status, "draft"); assert.equal(result.data.audit_status, "recorded");
  assert.equal(h.data.at(-1).media_type, "image"); assert.equal(h.data.at(-1).image_url, ""); assert.equal(h.calls.auth, 2); assert.equal(h.calls.invalidations, 1); assert.equal(h.audits.length, 1);
  for (const patch of [{ image_url: "https://evil.example/x" }, { thumbnail_url: "assets/x" }, { video_url: "https://video.example/x" }, { source_file: "media-source/x.jpg" }, { path: "C:/x.jpg" }, { raw_html: "<img>" }, { media_type: "video" }]) {
    const attempt = load({ manifest: [manifestItem("gallery-new")] });
    assert.equal(plain(attempt.context.createGalleryItem_("TOKEN", { ...valid, ...patch })).error.code, "VALIDATION_ERROR");
    assert.equal(attempt.calls.writes, 0);
  }
});

test("Gallery create rechecks duplicate identity manifest authority and authorization under lock", () => {
  const payload = { media_id: "gallery-dam-lake-001", title_th: "ซ้ำ", title_en: "", category: "dam_lake", related_place_id: "", caption_th: "", caption_en: "", credit: "", sort_order: "" };
  assert.equal(plain(load().context.createGalleryItem_("TOKEN", payload)).error.code, "DUPLICATE_ID");
  for (const manifest of [[], [manifestItem("gallery-dam-lake-001", { entity_type: "place" })], [manifestItem("gallery-dam-lake-001", { role: "cover" })]]) assert.equal(plain(load({ rows: [], manifest }).context.createGalleryItem_("TOKEN", payload)).error.code, "VALIDATION_ERROR");
  const revoked = load({ rows: [], manifest: [manifestItem("gallery-dam-lake-001")], revokeUnderLock: true });
  assert.equal(plain(revoked.context.createGalleryItem_("TOKEN", payload)).error.code, "UNAUTHORIZED"); assert.equal(revoked.calls.writes, 0); assert.equal(revoked.calls.releases, 1);
  for (const role of ["reviewer", "viewer"]) assert.equal(plain(load({ role }).context.createGalleryItem_("TOKEN", payload)).error.code, "FORBIDDEN");
});

test("Gallery image update uses revision lifecycle soft delete and preserves extensions", () => {
  const h = load(); const revision = h.context.AdminGalleryService_revision_(h.data[0]);
  const updated = plain(h.context.updateGalleryItem_("TOKEN", { media_id: "gallery-dam-lake-001", expected_revision: revision, caption_th: "แก้แล้ว" }));
  assert.equal(updated.ok, true); assert.equal(h.data[0].caption_th, "แก้แล้ว"); assert.equal(h.data[0].extension_note, "keep");
  const nextRevision = updated.data.revision;
  assert.equal(plain(h.context.updateGalleryItem_("TOKEN", { media_id: "gallery-dam-lake-001", expected_revision: revision, caption_th: "เก่า" })).error.code, "CONFLICT");
  const removed = plain(h.context.deleteGalleryItem_("TOKEN", { media_id: "gallery-dam-lake-001", expected_revision: nextRevision }));
  assert.equal(removed.ok, true); assert.equal(h.data[0].status, "deleted"); assert.equal(h.data.length, 3); assert.equal(h.data[0].extension_note, "keep");
  const restored = plain(h.context.updateGalleryItem_("TOKEN", { media_id: "gallery-dam-lake-001", expected_revision: removed.data.revision, status: "draft" }));
  assert.equal(restored.ok, true); assert.equal(h.data[0].status, "draft");
});

test("Gallery rejects normalized no-op updates before cache write flush or audit", () => {
  for (const patch of [{ caption_th: rows()[0].caption_th }, { category: rows()[0].category }, { caption_en: "   View   " }]) {
    const h = load(); const revision = h.context.AdminGalleryService_revision_(h.data[0]);
    const result = plain(h.context.updateGalleryItem_("TOKEN", { media_id: h.data[0].media_id, expected_revision: revision, ...patch }));
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.deepEqual({ invalidations: h.calls.invalidations, writes: h.calls.writes, flushes: h.calls.flushes, audits: h.audits.length }, { invalidations: 0, writes: 0, flushes: 0, audits: 0 });
  }
  const blankRow = { ...rows()[0], title_en: "" };
  const blank = load({ rows: [blankRow] }); const blankRevision = blank.context.AdminGalleryService_revision_(blank.data[0]);
  assert.equal(plain(blank.context.updateGalleryItem_("TOKEN", { media_id: blank.data[0].media_id, expected_revision: blankRevision, title_en: "   " })).error.code, "VALIDATION_ERROR");
  assert.deepEqual({ invalidations: blank.calls.invalidations, writes: blank.calls.writes, flushes: blank.calls.flushes, audits: blank.audits.length }, { invalidations: 0, writes: 0, flushes: 0, audits: 0 });
  const sameStatus = load(); const revision = sameStatus.context.AdminGalleryService_revision_(sameStatus.data[0]);
  assert.equal(plain(sameStatus.context.updateGalleryItem_("TOKEN", { media_id: sameStatus.data[0].media_id, expected_revision: revision, status: "published" })).error.code, "INVALID_TRANSITION");
  const changed = load(); const changedRevision = changed.context.AdminGalleryService_revision_(changed.data[0]);
  assert.equal(plain(changed.context.updateGalleryItem_("TOKEN", { media_id: changed.data[0].media_id, expected_revision: changedRevision, caption_th: "Real change" })).ok, true);
});

test("Gallery legacy videos are readable and lifecycle-only and cannot be republished", () => {
  const h = load(); const video = h.data[1]; const revision = h.context.AdminGalleryService_revision_(video);
  for (const patch of [{ title_th: "แก้" }, { category: "dam_lake" }, { video_url: "https://new.example/v.mp4" }]) assert.equal(plain(h.context.updateGalleryItem_("TOKEN", { media_id: video.media_id, expected_revision: revision, ...patch })).error.code, "VALIDATION_ERROR");
  const hidden = plain(h.context.updateGalleryItem_("TOKEN", { media_id: video.media_id, expected_revision: revision, status: "hidden" }));
  assert.equal(hidden.ok, true); assert.equal(h.data[1].video_url, "https://video.example/legacy.mp4");
  assert.equal(plain(h.context.updateGalleryItem_("TOKEN", { media_id: video.media_id, expected_revision: hidden.data.revision, status: "published" })).error.code, "INVALID_TRANSITION");
});

test("Gallery publishing requires canonical category complete content and current approved manifest", () => {
  const canonical = { ...rows()[0], status: "draft" };
  const h = load({ rows: [canonical], manifest: [manifestItem(canonical.media_id)] });
  const published = plain(h.context.updateGalleryItem_("TOKEN", { media_id: canonical.media_id, expected_revision: h.context.AdminGalleryService_revision_(canonical), status: "published" }));
  assert.equal(published.ok, true);
  for (const row of [{ ...canonical, category: "place" }, { ...canonical, title_th: "" }]) {
    const bad = load({ rows: [row], manifest: [manifestItem(row.media_id)] });
    assert.equal(plain(bad.context.updateGalleryItem_("TOKEN", { media_id: row.media_id, expected_revision: bad.context.AdminGalleryService_revision_(row), status: "published" })).error.code, "VALIDATION_ERROR");
  }
});

test("Gallery write uncertainty is non-retryable while audit-only failure is verified success", () => {
  const payload = { media_id: "gallery-new", title_th: "ภาพ", title_en: "", category: "dam_lake", related_place_id: "", caption_th: "", caption_en: "", credit: "", sort_order: "" };
  const uncertain = load({ rows: [], manifest: [manifestItem("gallery-new")], flushFailure: true });
  const failed = plain(uncertain.context.createGalleryItem_("TOKEN", payload));
  assert.deepEqual({ code: failed.error.code, retryable: failed.error.retryable, media_id: failed.error.media_id }, { code: "OUTCOME_UNKNOWN", retryable: false, media_id: "gallery-new" });
  const audit = load({ rows: [], manifest: [manifestItem("gallery-new")], failWrite: "activity_logs" });
  const success = plain(audit.context.createGalleryItem_("TOKEN", payload));
  assert.equal(success.ok, true); assert.equal(success.data.audit_status, "unconfirmed");
});

test("Gallery post-write faults retain exact uncertainty audit and known-success semantics", () => {
  const payload = { media_id: "gallery-new", title_th: "Image", title_en: "", category: "dam_lake", related_place_id: "", caption_th: "", caption_en: "", credit: "", sort_order: "" };
  for (const option of ["corruptEntityReadback", "entityReadFailureAfterWrite", "throwAfterEntityWrite"]) {
    const h = load({ rows: [], manifest: [manifestItem("gallery-new")], [option]: true });
    const result = plain(h.context.createGalleryItem_("TOKEN", payload));
    assert.deepEqual({ code: result.error.code, retryable: result.error.retryable, media_id: result.error.media_id }, { code: "OUTCOME_UNKNOWN", retryable: false, media_id: "gallery-new" }, option);
    assert.equal(h.calls.entityWrites, 1, `${option} must not retry the entity mutation`);
    assert.equal(h.calls.invalidations, 1, `${option} invalidates before the single mutation`);
  }
  const audit = load({ rows: [], manifest: [manifestItem("gallery-new")], corruptAuditReadback: true });
  const auditResult = plain(audit.context.createGalleryItem_("TOKEN", payload));
  assert.equal(auditResult.ok, true); assert.equal(auditResult.data.audit_status, "unconfirmed"); assert.equal(audit.calls.entityWrites, 1);
  const release = load({ rows: [], manifest: [manifestItem("gallery-new")], releaseFailure: true });
  const releaseResult = plain(release.context.createGalleryItem_("TOKEN", payload));
  assert.equal(releaseResult.ok, true); assert.equal(releaseResult.data.audit_status, "recorded"); assert.equal(release.calls.entityWrites, 1);
});

test("Gallery audit UUID collision fails before cache invalidation or entity mutation", () => {
  const collision = "11111111-1111-4111-8111-000000000999";
  const existing = Object.fromEntries(AUDIT_HEADERS.map(field => [field, ""])); existing.log_id = collision; existing.audit_id = collision;
  const h = load({ rows: [], manifest: [manifestItem("gallery-new")], audits: [existing], forcedUuid: collision });
  const payload = { media_id: "gallery-new", title_th: "Image", title_en: "", category: "dam_lake", related_place_id: "", caption_th: "", caption_en: "", credit: "", sort_order: "" };
  const result = plain(h.context.createGalleryItem_("TOKEN", payload));
  assert.equal(result.ok, false); assert.equal(result.error.code, "SERVER_ERROR");
  assert.deepEqual({ invalidations: h.calls.invalidations, entityWrites: h.calls.entityWrites, rows: h.data.length, audits: h.audits.length }, { invalidations: 0, entityWrites: 0, rows: 0, audits: 1 });
});

test("Gallery writer rejects unsafe destinations and preserves reordered physical extensions", () => {
  const payload = { media_id: "gallery-new", title_th: "Image", title_en: "", category: "dam_lake", related_place_id: "", caption_th: "", caption_en: "", credit: "", sort_order: "" };
  for (const options of [{ lockFailure: true }, { cacheFailure: true }, { formulaIndex: 1 }, { badFormatIndex: 1 }]) {
    const h = load({ rows: [], manifest: [manifestItem("gallery-new")], ...options });
    assert.equal(plain(h.context.createGalleryItem_("TOKEN", payload)).ok, false);
    assert.equal(h.calls.writes, 0);
  }
  for (const headers of [[...HEADERS, "TITLE_TH"], HEADERS.filter(header => header !== "status")]) {
    const h = load({ rows: [], manifest: [manifestItem("gallery-new")], headers });
    assert.equal(plain(h.context.createGalleryItem_("TOKEN", payload)).error.code, "SERVER_ERROR");
    assert.equal(h.calls.writes, 0);
  }
  const reordered = ["extension_note", ...HEADERS.filter(header => header !== "extension_note").reverse()];
  const h = load({ headers: reordered });
  const revision = h.context.AdminGalleryService_revision_(h.data[0]);
  assert.equal(plain(h.context.updateGalleryItem_("TOKEN", { media_id: h.data[0].media_id, expected_revision: revision, caption_en: "Changed" })).ok, true);
  assert.equal(h.data[0].extension_note, "keep");
});

test("real ContentCache generation composes Gallery mutation with fresh public reads", () => {
  const h = load();
  vm.runInContext(read("apps-script/ContentCacheService.gs"), h.context, { filename: "apps-script/ContentCacheService.gs" });
  vm.runInContext(read("apps-script/GalleryService.gs"), h.context, { filename: "apps-script/GalleryService.gs" });
  const before = plain(h.context.getGallery_({ category: "dam_lake", lang: "en" }));
  assert.equal(before.data.items[0].title, "Dam");
  const oldKey = h.cachePuts.find(entry => entry.ttl === 600).key;
  const revision = h.context.AdminGalleryService_revision_(h.data[0]);
  const update = plain(h.context.updateGalleryItem_("TOKEN", { media_id: h.data[0].media_id, expected_revision: revision, title_en: "Fresh Dam" }));
  assert.equal(update.ok, true);
  const after = plain(h.context.getGallery_({ category: "dam_lake", lang: "en" }));
  assert.equal(after.data.items[0].title, "Fresh Dam");
  const newKey = h.cachePuts.filter(entry => entry.ttl === 600).at(-1).key;
  assert.notEqual(newKey, oldKey);
  assert.equal(h.cacheStore.get(oldKey) !== null, true, "old entry may remain only under the unreachable old generation");

  const gated = load();
  vm.runInContext(read("apps-script/ContentCacheService.gs"), gated.context, { filename: "apps-script/ContentCacheService.gs" });
  vm.runInContext(read("apps-script/GalleryService.gs"), gated.context, { filename: "apps-script/GalleryService.gs" });
  gated.context.ContentCacheService_key_();
  const gatedOldKey = gated.context.GalleryService_cacheKey_("getGallery", { category: "dam_lake", lang: "en" });
  const gatedRevision = gated.context.AdminGalleryService_revision_(gated.data[0]);
  gated.context.GalleryService_cached_("getGallery", { category: "dam_lake", lang: "en" }, () => {
    const result = plain(gated.context.updateGalleryItem_("TOKEN", { media_id: gated.data[0].media_id, expected_revision: gatedRevision, title_en: "Mutation During Read" }));
    assert.equal(result.ok, true);
    return before;
  });
  assert.equal(gated.cachePuts.at(-1).key, gatedOldKey, "in-flight reader may populate only its captured old key");
  const gatedFresh = plain(gated.context.getGallery_({ category: "dam_lake", lang: "en" }));
  assert.equal(gatedFresh.data.items[0].title, "Mutation During Read");
  assert.notEqual(gated.cachePuts.at(-1).key, gatedOldKey, "new generation cannot reuse the in-flight reader's old key");
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("Admin Gallery service verification passed.\n");
