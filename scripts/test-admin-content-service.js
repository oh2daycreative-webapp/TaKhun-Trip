"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const root = path.join(__dirname, "..");
const plain = value => JSON.parse(JSON.stringify(value));
const productFields = "name_th name_en category producer_name related_place_id district description_th description_en price_range phone contact_url google_maps_url latitude longitude image_url tags is_featured sort_order".split(" ");
const eventFields = "title_th title_en event_type event_date start_time end_time location_th location_en related_place_id description_th description_en image_url contact_name contact_phone register_url google_maps_url latitude longitude is_featured".split(" ");
const auditFields = "log_id admin_id action entity_type entity_id description created_at audit_id actor_admin_id occurred_at".split(" ");
const statuses = ["draft", "published", "hidden", "archived", "deleted"];
const transitions = { draft: ["published", "archived", "deleted"], published: ["hidden", "archived", "deleted"], hidden: ["draft", "published", "archived", "deleted"], archived: ["draft", "deleted"], deleted: ["draft"] };
function content(kind, overrides = {}) {
  return { ...Object.fromEntries((kind === "Product" ? productFields : eventFields).map(k => [k, ""])),
    ...(kind === "Product" ? { name_th: "Honey", category: "honey", sort_order: 1 } : { title_th: "Market", event_type: "community_market", event_date: "2028-02-29", location_th: "Village" }),
    description_th: "Local community", is_featured: false, ...overrides };
}
function harness(options = {}) {
  let held = false, uuid = 0;
  const effects = [], cacheValues = new Map();
  const tables = {};
  for (const [name, fields] of Object.entries({ products: ["product_id", ...productFields, "status", "created_at", "updated_at"], events: ["event_id", ...eventFields, "status", "created_at", "updated_at"], activity_logs: auditFields, places: ["place_id", "status"] })) {
    tables[name] = [fields.slice()];
  }
  tables.places.push(["PLC-1", "published"], ["PLC-DRAFT", "draft"], ["PLC-ARCHIVED", "archived"]);
  const sheet = name => ({
    getName: () => name,
    getLastRow: () => tables[name].length,
    getLastColumn: () => tables[name][0].length,
    getMaxRows: () => 1000,
    getDataRange: () => ({ getValues: () => {
      if (options.failRead === name) throw Error("PRIVATE SHEET DETAILS");
      return tables[name].map(row => row.slice());
    } }),
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nr }, (_, ri) => Array.from({ length: nc }, (_, ci) => tables[name][r - 1 + ri]?.[c - 1 + ci] ?? "")),
      getNumberFormats: () => [Array.from({ length: nc }, (_, ci) => options.badFormat ? "General" : tables[name][0][c - 1 + ci] === "is_featured" ? options.booleanFormat || "0" : "@")],
      getFormulas: () => [Array(nc).fill(options.formula ? "=1+1" : "")],
      setValues: rows => {
        assert.equal(held, true, "all writes hold the script lock");
        effects.push({ name, r, rows: plain(rows) });
        if (options.failWrite === name) throw Error("PRIVATE WRITE DETAILS");
        rows.forEach((row, ri) => { tables[name][r - 1 + ri] ||= Array(tables[name][0].length).fill(""); row.forEach((v, ci) => { tables[name][r - 1 + ri][c - 1 + ci] = v; }); });
        if (options.corruptWrite === name) tables[name][r - 1][1] = "corrupted";
        if (options.corruptExtra === name) tables[name][r - 1][tables[name][0].indexOf("internal_note")] = "corrupted";
        if (options.throwAfterWrite === name) throw Error("LOST WRITE RESPONSE");
        if (options.readFailureAfterWrite === name) options.failRead = name;
      }
    })
  });
  const cache = {
    get: k => { if (options.cacheReadFail) throw Error("cache unavailable"); return cacheValues.get(k) ?? null; },
    put: (k, v) => { if (options.cachePutFail) throw Error("cache unavailable"); cacheValues.set(k, v); },
    remove: k => { if (options.cacheRemoveFail) throw Error("cache unavailable"); cacheValues.delete(k); }
  };
  const context = { console, Date, JSON, Object, Array, String, Number, Math, RegExp, isFinite, encodeURIComponent,
    Utilities: { getUuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}` },
    CacheService: { getScriptCache: () => cache },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (held || options.lockFail) return false; held = true; options.onLock?.(); return true; }, releaseLock: () => { held = false; if (options.releaseFail) throw Error("release failed"); } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: name => tables[name] ? sheet(name) : null }), flush: () => {} },
    getAppConfig_: () => ({ spreadsheetId: "local-test-only" }),
    AuthService_requireAdmin_: token => { if (!["viewer", "reviewer", "editor", "super_admin"].includes(token) || options.revoked) throw Error("UNAUTHORIZED"); return { admin_id: "ADM-1", role: options.role || token }; },
    createJsonResponse_: x => x,
    PLACE_PUBLIC_CACHE_EPOCH_PROPERTY_: "PLACE_PUBLIC_CACHE_EPOCH"
  };
  vm.createContext(context);
  for (const name of ["CryptoService", "SheetService", "ContentCacheService", "PlaceService", "ProductService", "EventService", "RouteService", "GalleryService", "HomeService", "SearchService", "AdminContentService", "AdminProductService", "AdminEventService", "Router"]) {
    const file = path.join(root, "apps-script", name + ".gs");
    if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  function call(action, token, payload) { assert.equal(typeof context[action + "_"], "function", action + " must exist"); return plain(context[action + "_"](token, payload)); }
  return { context, options, effects, tables, cacheValues, call, cache, sheet };
}
let checks = 0;
function test(name, run) { run(); checks++; console.log("PASS " + name); }
function error(result, code) { assert.equal(result.ok, false, JSON.stringify(result)); assert.equal(result.error.code, code); assert.doesNotMatch(JSON.stringify(result), /PRIVATE|stack|local-test-only/); }
for (const kind of ["Product", "Event"]) {
  const table = kind.toLowerCase() + "s", idKey = kind.toLowerCase() + "_id";
  const create = h => { const r = h.call("create" + kind, "editor", content(kind)); assert.equal(r.ok, true, JSON.stringify(r)); return r.data; };
  test(kind + " create/detail/list/update and stale editor", () => {
    const h = harness(), first = create(h);
    assert.equal(first.status, "draft"); assert.match(first.revision, /^r1-[a-f0-9]{64}$/);
    assert.equal(first.audit_status, "recorded");
    assert.equal(h.call("adminGet" + kind + "Detail", "viewer", { [idKey]: first[idKey] }).data.revision, first.revision);
    assert.equal(h.call("adminGet" + kind + "s", "reviewer", {}).data.total, 1);
    const payload = { [idKey]: first[idKey], expected_revision: first.revision, description_th: "Updated" };
    const update = h.call("update" + kind, "super_admin", payload); assert.equal(update.ok, true);
    assert.notEqual(update.data.revision, first.revision);
    error(h.call("update" + kind, "editor", payload), "CONFLICT");
    assert.equal(h.tables.activity_logs.length, 3);
    assert.equal(h.effects.filter(e => e.name === table).length, 2);
  });
  for (const from of statuses) for (const to of statuses) test(`${kind} lifecycle ${from} -> ${to}`, () => {
    const h = harness(), first = create(h), headers = h.tables[table][0];
    h.tables[table][1][headers.indexOf("status")] = from;
    const current = h.call("adminGet" + kind + "Detail", "editor", { [idKey]: first[idKey] }).data;
    const r = h.call("update" + kind, "editor", { [idKey]: first[idKey], expected_revision: current.revision, status: to });
    if (transitions[from].includes(to)) { assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.data.status, to); }
    else error(r, "INVALID_TRANSITION");
    assert.equal(h.tables[table].length, 2, "never remove a retained row");
    const rows = h.context.readSheetObjects_(table);
    const visible = h.context[kind + "Service_publishedCopies_"](rows);
    assert.equal(visible.length, (r.ok ? to : from) === "published" ? 1 : 0);
  });
  test(kind + " authentication and roles on all actions", () => {
    const h = harness(), first = create(h);
    const actions = { ["adminGet" + kind + "s"]: {}, ["adminGet" + kind + "Detail"]: { [idKey]: first[idKey] }, ["create" + kind]: content(kind), ["update" + kind]: { [idKey]: first[idKey], expected_revision: first.revision, description_th: "edit" }, ["delete" + kind]: { [idKey]: first[idKey], expected_revision: first.revision } };
    for (const [action, payload] of Object.entries(actions)) {
      for (const token of [undefined, "", "invalid", { role: "super_admin" }]) error(h.call(action, token, payload), "UNAUTHORIZED");
      for (const token of ["viewer", "reviewer"]) {
        const r = h.call(action, token, payload);
        if (action.startsWith("adminGet")) assert.equal(r.ok, true); else error(r, "FORBIDDEN");
      }
    }
    h.options.revoked = true;
    error(h.call("create" + kind, "editor", content(kind)), "UNAUTHORIZED");
    assert.equal(h.tables.activity_logs.length, 2);
  });
  test(kind + " exact payload and domain validation", () => {
    const h = harness();
    for (const patch of [{ bogus: 1 }, { [idKey]: "fake" }, { created_at: "fake" }, { updated_at: "fake" }, { role: "super_admin" }, { status: "published" }, { is_featured: "true" }, { latitude: "8" }, { latitude: 91, longitude: 20 }, { longitude: 20 }, { description_th: "=IMPORTXML(\"private\")" }, { contact_url: "javascript:alert(1)" }, { image_url: "//evil.test/img" }, { related_place_id: "../x" }, { related_place_id: "MISSING" }, { related_place_id: "PLC-ARCHIVED" }, ...(kind === "Product" ? [{ category: "unknown" }, { district: "unknown" }, { sort_order: -1 }, { price_range: 4 }] : [{ event_type: "unknown" }, { event_date: "2027-02-29" }, { event_date: "2028-04-31" }, { event_date: "0000-01-01" }, { start_time: "24:00" }, { start_time: "12:00", end_time: "11:59" }, { end_time: "12:00" }, { end_date: "2028-03-01" }])]) {
      error(h.call("create" + kind, "editor", content(kind, patch)), "VALIDATION_ERROR");
    }
    assert.equal(h.effects.length, 0);
  });
  test(kind + " duplicate generated ID fails closed", () => {
    const h = harness(); h.context.Utilities.getUuid = () => "00000000-0000-4000-8000-000000000001";
    create(h); error(h.call("create" + kind, "editor", content(kind)), "DUPLICATE_ID");
    assert.equal(h.tables[table].length, 2);
  });
  test(kind + " soft delete and safe restoration", () => {
    const h = harness(), first = create(h);
    const deleted = h.call("delete" + kind, "editor", { [idKey]: first[idKey], expected_revision: first.revision });
    assert.equal(deleted.data.status, "deleted");
    error(h.call("update" + kind, "editor", { [idKey]: first[idKey], expected_revision: deleted.data.revision, description_th: "edit" }), "INVALID_TRANSITION");
    const restored = h.call("update" + kind, "editor", { [idKey]: first[idKey], expected_revision: deleted.data.revision, status: "draft" });
    assert.equal(restored.data.status, "draft");
  });
  test(kind + " lifecycle retention forbids simultaneous content edits", () => {
    for (const from of statuses) for (const to of ["archived", "deleted", "draft"]) {
      if (!transitions[from].includes(to)) continue;
      const h = harness(), first = create(h), headers = h.tables[table][0];
      h.tables[table][1][headers.indexOf("status")] = from;
      const current = h.call("adminGet" + kind + "Detail", "editor", { [idKey]: first[idKey] }).data;
      const before = JSON.stringify(h.tables);
      error(h.call("update" + kind, "editor", { [idKey]: first[idKey], expected_revision: current.revision, status: to, description_th: "replace" }), "INVALID_TRANSITION");
      assert.equal(JSON.stringify(h.tables), before);
    }
  });
  for (const failure of ["failWrite", "throwAfterWrite", "corruptWrite", "readFailureAfterWrite"]) test(kind + " unknown outcome " + failure, () => {
    const h = harness({ [failure]: table });
    const r = h.call("create" + kind, "editor", content(kind)); error(r, "OUTCOME_UNKNOWN");
    assert.equal(r.error.retryable, false); assert.ok(r.error[idKey]);
    assert.equal(h.effects.filter(e => e.name === table).length, 1, "never retry");
    assert.equal(h.tables.activity_logs.length, 1);
  });
  test(kind + " audit failure is verified entity success with warning", () => {
    const h = harness({ failWrite: "activity_logs" });
    const r = h.call("create" + kind, "editor", content(kind)); assert.equal(r.ok, true); assert.equal(r.data.audit_status, "unconfirmed");
    assert.equal(h.tables[table].length, 2);
  });
  test(kind + " lock release failure preserves known success", () => {
    const h = harness({ releaseFail: true }); create(h); assert.equal(h.tables[table].length, 2);
  });
  test(kind + " preflight lock/schema/formats/cache failures do not mutate", () => {
    for (const options of [{ lockFail: true }, { badFormat: true }, { cacheRemoveFail: true }]) {
      const h = harness(options); error(h.call("create" + kind, "editor", content(kind)), "SERVER_ERROR"); assert.equal(h.effects.length, 0);
    }
    const h = harness(); h.tables[table][0].pop(); error(h.call("create" + kind, "editor", content(kind)), "SERVER_ERROR"); assert.equal(h.effects.length, 0);
  });
  test(kind + " update and lifecycle uncertain outcomes never retry or report clean failure", () => {
    for (const action of ["update" + kind, "delete" + kind]) for (const failure of ["failWrite", "throwAfterWrite", "corruptWrite", "readFailureAfterWrite"]) {
      const h = harness(), first = create(h), before = h.effects.length;
      h.options[failure] = table;
      const payload = { [idKey]: first[idKey], expected_revision: first.revision, ...(action.startsWith("update") ? { description_th: "update" } : {}) };
      const r = h.call(action, "editor", payload); error(r, "OUTCOME_UNKNOWN"); assert.equal(r.error[idKey], first[idKey]);
      assert.equal(h.effects.length, before + 1); assert.equal(h.tables.activity_logs.length, 2);
    }
  });
  test(kind + " audit warnings on update/delete; audit schema fails preflight", () => {
    for (const action of ["update" + kind, "delete" + kind]) for (const failure of ["failWrite", "throwAfterWrite", "corruptWrite", "readFailureAfterWrite"]) {
      const h = harness(), first = create(h); h.options[failure] = "activity_logs";
      const r = h.call(action, "editor", { [idKey]: first[idKey], expected_revision: first.revision, ...(action.startsWith("update") ? { description_th: "update" } : {}) });
      assert.equal(r.ok, true); assert.equal(r.data.audit_status, "unconfirmed");
      assert.equal(h.tables[table].length, 2);
    }
    const h = harness(); h.tables.activity_logs[0].pop(); error(h.call("create" + kind, "editor", content(kind)), "SERVER_ERROR"); assert.equal(h.effects.length, 0);
  });
  test(kind + " Place references are unique/available, publishing requires public Place", () => {
    const h = harness();
    const r = h.call("create" + kind, "editor", content(kind, { related_place_id: "PLC-DRAFT" })); assert.equal(r.ok, true, JSON.stringify(r));
    const first = r.data, payload = { [idKey]: first[idKey], expected_revision: first.revision, status: "published" };
    error(h.call("update" + kind, "editor", payload), "VALIDATION_ERROR");
    const published = h.call("update" + kind, "editor", { ...payload, related_place_id: "PLC-1" }); assert.equal(published.ok, true);
    h.tables.places.push(["PLC-1", "published"]);
    error(h.call("update" + kind, "editor", { [idKey]: first[idKey], expected_revision: published.data.revision, description_th: "update" }), "VALIDATION_ERROR");
    assert.equal(h.call("update" + kind, "editor", { [idKey]: first[idKey], expected_revision: published.data.revision, related_place_id: "" }).ok, true);
  });
  test(kind + " malformed mutation envelopes and filters fail without writes", () => {
    const h = harness(), first = create(h), original = JSON.stringify(h.tables);
    for (const payload of [null, [], {}, { [idKey]: "../bad", expected_revision: first.revision }, { [idKey]: first[idKey], expected_revision: 1 }, { [idKey]: first[idKey], expected_revision: first.revision }, { [idKey]: first[idKey], expected_revision: first.revision, status: null }, { [idKey]: first[idKey], expected_revision: first.revision, created_at: "spoof" }, { [idKey]: first[idKey], expected_revision: first.revision, permissions: { write: true } }]) error(h.call("update" + kind, "editor", payload), "VALIDATION_ERROR");
    for (const payload of [{ page: 0 }, { page: "1" }, { page_size: 101 }, { status: "pending" }, { keyword: [] }, { token: "spoof" }]) error(h.call("adminGet" + kind + "s", "editor", payload), "VALIDATION_ERROR");
    error(h.call("adminGet" + kind + "Detail", "editor", { [idKey]: "MISSING" }), "NOT_FOUND");
    error(h.call("delete" + kind, "editor", { [idKey]: first[idKey], expected_revision: first.revision, status: "draft" }), "VALIDATION_ERROR");
    assert.equal(JSON.stringify(h.tables), original);
  });
  test(kind + " URL and formula validation applies to every delivered field", () => {
    const h = harness(), fields = kind === "Product" ? productFields : eventFields;
    const urlFields = fields.filter(f => f.endsWith("_url"));
    for (const field of urlFields) for (const value of ["javascript:alert(1)", "data:text/html,secret", "file:///secret", "//evil.example/path", "https://user:pass@evil.example", "https://good.example\\@evil.example", "https://good.example/%0aevil", "https://good.example:99999/", "https://"]) error(h.call("create" + kind, "editor", content(kind, { [field]: value })), "VALIDATION_ERROR");
    for (const field of fields.filter(f => typeof content(kind)[f] === "string" && !["latitude", "longitude", "sort_order"].includes(f))) for (const value of ["=1+1", " \t@SUM(1)", "\n+IMPORTXML(1)", "-1+1", "'escaped", "text\u0000more"]) error(h.call("create" + kind, "editor", content(kind, { [field]: value })), "VALIDATION_ERROR");
    assert.equal(h.effects.length, 0);
    const valid = h.call("create" + kind, "editor", content(kind, Object.fromEntries(urlFields.map(f => [f, "https://example.test/path?q=1#anchor"])))); assert.equal(valid.ok, true);
  });
  test(kind + " lost success response reconciles through list and detail without recreating", () => {
    const h = harness(); h.call("create" + kind, "editor", content(kind)); // Deliberately discard response.
    const list = h.call("adminGet" + kind + "s", "viewer", { keyword: kind === "Product" ? "Honey" : "Market", status: "draft", page: 1, page_size: 1 });
    assert.equal(list.data.total, 1);
    const detail = h.call("adminGet" + kind + "Detail", "viewer", { [idKey]: list.data.items[0][idKey] });
    assert.equal(detail.data.content.description_th, "Local community"); assert.equal(h.tables[table].length, 2);
    const audit = Object.fromEntries(h.tables.activity_logs[0].map((field, i) => [field, h.tables.activity_logs[1][i]]));
    assert.equal(audit.action, "CREATE"); assert.equal(audit.entity_type, kind.toLowerCase()); assert.equal(audit.actor_admin_id, "ADM-1"); assert.equal(audit.log_id, audit.audit_id); assert.equal(audit.admin_id, audit.actor_admin_id); assert.equal(audit.created_at, audit.occurred_at);
    assert.deepEqual(JSON.parse(audit.description), { status: detail.data.status, revision: detail.data.revision });
  });
}
test("boolean formats and formulas fail before mutations; unrelated columns are retained and verified", () => {
  for (const kind of ["Product", "Event"]) {
    const table = kind.toLowerCase() + "s", idKey = kind.toLowerCase() + "_id";
    for (const options of [{ booleanFormat: "@" }, { booleanFormat: "General" }, { formula: true }]) {
      const h = harness(options); error(h.call("create" + kind, "editor", content(kind)), "SERVER_ERROR"); assert.equal(h.effects.length, 0);
    }
    const h = harness({ booleanFormat: "0.###############" });
    const first = h.call("create" + kind, "editor", content(kind)).data;
    h.tables[table][0].push("internal_note"); h.tables[table][1].push("Keep private");
    const next = h.call("update" + kind, "editor", { [idKey]: first[idKey], expected_revision: first.revision, description_th: "New" });
    assert.equal(next.ok, true); assert.equal(h.tables[table][1].at(-1), "Keep private"); assert.doesNotMatch(JSON.stringify(next), /Keep private/);
    h.options.corruptExtra = table;
    error(h.call("update" + kind, "editor", { [idKey]: first[idKey], expected_revision: next.data.revision, description_th: "New again" }), "OUTCOME_UNKNOWN");
  }
});

test("explicit protected POST routes; query tokens never authorize", () => {
  const h = harness();
  for (const kind of ["Product", "Event"]) for (const prefix of ["adminGet", "create", "update", "delete"]) {
    const actions = prefix === "adminGet" ? ["adminGet" + kind + "s", "adminGet" + kind + "Detail"] : [prefix + kind];
    for (const action of actions) {
      const route = (method, event) => plain(h.context.routeRequest_(method, event));
      error(route("GET", { parameter: { action, token: "editor" } }), "UNKNOWN_ACTION");
      error(route("POST", { parameter: { action, token: "editor" } }), "UNKNOWN_ACTION");
      error(route("POST", { parameter: { token: "editor" }, postData: { contents: JSON.stringify({ action, payload: {} }) } }), "UNAUTHORIZED");
      const r = route("POST", { postData: { contents: JSON.stringify({ action, token: "editor", payload: prefix === "create" ? content(kind) : {} }) } });
      if (prefix === "create" || action.endsWith("s")) assert.equal(r.ok, true, action); else error(r, "VALIDATION_ERROR");
    }
  }
  for (const action of ["AdminContentService_write", "setupAdminPlaceSchema", "adminGetProductsAnything", "deleteRow"]) error(plain(h.context.routeRequest_("POST", { postData: { contents: JSON.stringify({ action, token: "editor", payload: {} }) } })), "UNKNOWN_ACTION");
});

test("revision is deterministic, covers every editable field and ignores metadata", () => {
  const h = harness();
  for (const kind of ["Product", "Event"]) {
    const d = h.context["Admin" + kind + "Service_domain_"]();
    const row = { ...content(kind), [d.id]: "ID-1", status: "draft", updated_at: "yesterday" };
    const revision = h.context.AdminContentService_revision_(d, row);
    const reversed = Object.fromEntries(Object.entries(row).reverse());
    assert.equal(h.context.AdminContentService_revision_(d, reversed), revision);
    assert.equal(h.context.AdminContentService_revision_(d, { ...row, updated_at: "today", created_at: "other", internal: "secret" }), revision);
    for (const field of [d.id, ...d.fields, "status"]) assert.notEqual(h.context.AdminContentService_revision_(d, { ...row, [field]: row[field] === true ? false : row[field] === false ? true : String(row[field]) + "changed" }), revision, field);
    const canonical = [d.entity, 1, ...[d.id, ...d.fields, "status"].map(f => [f, typeof row[f], row[f]])];
    assert.equal(revision, "r1-" + crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex"));
  }
});

test("actual public cache consumers become fresh after every mutation", () => {
  const h = harness();
  h.tables.routes = [["route_id", "status"]]; h.tables.gallery = [["media_id", "status"]];
  // Use empty Places for public projection; reference-specific cases are separate.
  h.tables.places = [["place_id", "status"]];
  for (const kind of ["Product", "Event"]) {
    const idKey = kind.toLowerCase() + "_id";
    let current = h.call("create" + kind, "editor", content(kind, { is_featured: true })).data;
    const readers = [() => h.context["get" + kind + "s_"]({}), () => h.context["get" + kind + "Detail_"]({ [idKey]: current[idKey] }), () => h.context.getHomeData_({}), () => h.context.searchAll_({ keyword: kind === "Product" ? "Honey" : "Market" })];
    for (const status of ["published", "hidden", "published", "archived", "draft", "deleted", "draft"]) {
      readers.forEach(read => read());
      const priorKeys = new Set(h.cacheValues.keys());
      const priorGeneration = h.context.ContentCacheService_key_();
      current = h.call("update" + kind, "editor", { [idKey]: current[idKey], expected_revision: current.revision, status }).data;
      assert.ok(current);
      assert.notEqual(h.context.ContentCacheService_key_(), priorGeneration);
      const results = readers.map(read => plain(read()));
      assert.equal(results[0].data.items.some(row => row[idKey] === current[idKey]), status === "published");
      assert.equal(results[1].ok, status === "published");
      assert.equal(results[2].ok, true, JSON.stringify(results[2]));
      assert.equal(results[3].ok, true);
      assert.equal(results[2].data[kind === "Product" ? "featured_products" : "upcoming_events"].some(row => row[idKey] === current[idKey]), status === "published");
      assert.equal(results[3].data[kind.toLowerCase() + "s"].some(row => row[idKey] === current[idKey]), status === "published");
      assert.ok([...h.cacheValues.keys()].some(key => !priorKeys.has(key) && key.startsWith("public:")));
    }
  }
});

test("cache eviction and in-flight readers cannot revive prior cached content", () => {
  const h = harness();
  const before = h.context.ContentCacheService_key_();
  h.cacheValues.delete("content-public-generation-v1");
  assert.notEqual(h.context.ContentCacheService_key_(), before);
  const lock = h.context.LockService.getScriptLock(); assert.equal(lock.tryLock(), true);
  h.context.ContentCacheService_invalidateUnderLock_();
  assert.throws(() => h.context.ContentCacheService_key_(), /CONTENT_CACHE_BUSY/);
  const r = h.context.getProducts_({}); assert.equal(r.ok, true);
  assert.equal([...h.cacheValues.keys()].some(k => k.startsWith("public:")), false);
  lock.releaseLock();
  assert.notEqual(h.context.ContentCacheService_key_(), before);
});

test("recheck authentication and revision after waiting for lock", () => {
  const h = harness();
  const first = h.call("createProduct", "editor", content("Product")).data;
  h.options.onLock = () => { h.tables.products[1][1] = "Other editor"; };
  error(h.call("updateProduct", "editor", { product_id: first.product_id, expected_revision: first.revision, name_th: "Overwrite" }), "CONFLICT");
  h.options.onLock = () => { h.options.revoked = true; };
  error(h.call("createEvent", "editor", content("Event")), "UNAUTHORIZED");
});

test("real AuthService enforces session expiry, revocation, inactivity and roles", () => {
  for (const kind of ["Product", "Event"]) for (const scenario of ["viewer", "reviewer", "editor", "super_admin", "expired", "revoked", "inactive", "fabricated"]) {
    const h = harness(), c = h.context;
    vm.runInContext(fs.readFileSync(path.join(root, "apps-script/Config.gs"), "utf8"), c);
    vm.runInContext(fs.readFileSync(path.join(root, "apps-script/AuthService.gs"), "utf8"), c);
    c.getAppConfig_ = () => ({ spreadsheetId: "local-test-only" });
    const token = Buffer.alloc(32, 7).toString("base64url"), now = Date.now();
    const admin = { admin_id: "ADM-11111111-1111-4111-8111-111111111111", username: "operator", display_name: "Operator", email: "", password_algorithm: "pbkdf2_sha256", password_hash: Buffer.alloc(32, 1).toString("base64url"), password_salt: Buffer.alloc(16, 2).toString("base64url"), password_iterations: 120000, role: ["viewer", "reviewer", "editor", "super_admin"].includes(scenario) ? scenario : "editor", status: scenario === "inactive" ? "inactive" : "active", last_login_at: "", created_at: new Date(now - 10000).toISOString(), updated_at: new Date(now - 10000).toISOString() };
    const session = { session_id: "SES-22222222-2222-4222-8222-222222222222", admin_id: admin.admin_id, token_hash: crypto.createHash("sha256").update(token).digest("base64url"), created_at: new Date(now - 3600000).toISOString(), expires_at: new Date(scenario === "expired" ? now - 1 : now + 3600000).toISOString(), revoked_at: scenario === "revoked" ? new Date(now - 1).toISOString() : "", last_seen_at: new Date(now - 1000).toISOString() };
    session.created_at = new Date(Date.parse(session.expires_at) - 8 * 3600000).toISOString();
    session.last_seen_at = session.created_at;
    h.tables.admins = [Object.keys(admin), Object.values(admin)]; h.tables.admin_sessions = [Object.keys(session), Object.values(session)];
    const r = h.call("create" + kind, scenario === "fabricated" ? Buffer.alloc(32, 9).toString("base64url") : token, content(kind));
    if (["editor", "super_admin"].includes(scenario)) assert.equal(r.ok, true, JSON.stringify(r));
    else error(r, ["viewer", "reviewer"].includes(scenario) ? "FORBIDDEN" : "UNAUTHORIZED");
    const read = h.call("adminGet" + kind + "s", token, {});
    if (["expired", "revoked", "inactive"].includes(scenario)) error(read, "UNAUTHORIZED"); else assert.equal(read.ok, true);
  }
});

for (const kind of ["Product", "Event"]) {
  const table = kind.toLowerCase() + "s", idKey = kind.toLowerCase() + "_id";
  function storedFeatured(value) {
    const h = harness(), created = h.call("create" + kind, "editor", content(kind)).data;
    h.tables[table][1][h.tables[table][0].indexOf("is_featured")] = value;
    return { h, id: created[idKey] };
  }
  test(kind + " stored blank is canonical false for detail/list/revision without read writes", () => {
    const { h, id } = storedFeatured("");
    const before = JSON.stringify(h.tables), writes = h.effects.length;
    const detail = h.call("adminGet" + kind + "Detail", "viewer", { [idKey]: id });
    assert.equal(detail.ok, true); assert.equal(detail.data.content.is_featured, false);
    const list = h.call("adminGet" + kind + "s", "reviewer", {});
    assert.equal(list.data.items[0].revision, detail.data.revision);
    assert.equal(JSON.stringify(h.tables), before); assert.equal(h.effects.length, writes);
    h.tables[table][1][h.tables[table][0].indexOf("is_featured")] = false;
    const booleanDetail = h.call("adminGet" + kind + "Detail", "viewer", { [idKey]: id }).data;
    assert.equal(booleanDetail.revision, detail.data.revision, "blank and false have identical canonical content");
    assert.equal(h.context[kind + "Service_storedBoolean_"](""), false, "public semantics are unchanged");
  });
  test(kind + " stored blank supports partial updates and every draft lifecycle transition", () => {
    for (const patch of [{ description_th: "Legacy edit" }, { status: "published" }, { status: "archived" }, { status: "deleted" }]) {
      const { h, id } = storedFeatured("");
      const current = h.call("adminGet" + kind + "Detail", "editor", { [idKey]: id }).data;
      const result = h.call("update" + kind, "editor", { [idKey]: id, expected_revision: current.revision, ...patch });
      assert.equal(result.ok, true, JSON.stringify(result));
      const detail = h.call("adminGet" + kind + "Detail", "editor", { [idKey]: id }).data;
      assert.equal(detail.content.is_featured, false); assert.equal(detail.revision, result.data.revision);
      assert.equal(h.tables[table][1][h.tables[table][0].indexOf("is_featured")], false);
    }
  });
  test(kind + " explicit featured request Boolean remains strict for create and update", () => {
    for (const value of [false, true, "", "false", 0, 1, null]) {
      const h = harness(), valid = typeof value === "boolean";
      const created = h.call("create" + kind, "editor", content(kind, { is_featured: value }));
      if (valid) assert.equal(created.ok, true); else { error(created, "VALIDATION_ERROR"); assert.equal(h.effects.length, 0); }
      const legacy = storedFeatured("");
      const current = legacy.h.call("adminGet" + kind + "Detail", "editor", { [idKey]: legacy.id }).data;
      const before = JSON.stringify(legacy.h.tables);
      const updated = legacy.h.call("update" + kind, "editor", { [idKey]: legacy.id, expected_revision: current.revision, is_featured: value });
      if (valid) {
        assert.equal(updated.ok, true);
        assert.equal(legacy.h.call("adminGet" + kind + "Detail", "editor", { [idKey]: legacy.id }).data.content.is_featured, value);
      } else { error(updated, "VALIDATION_ERROR"); assert.equal(JSON.stringify(legacy.h.tables), before); }
    }
  });
  test(kind + " stored true/false retain meaning; malformed featured values are not repaired", () => {
    for (const value of [true, false, "false", "TRUE", " ", 0, 1, null]) {
      const { h, id } = storedFeatured(value), before = JSON.stringify(h.tables);
      const domain = h.context["Admin" + kind + "Service_domain_"]();
      const normalized = h.context.AdminContentService_table_(domain).rows[0].values;
      assert.equal(normalized.is_featured, value);
      const detail = h.call("adminGet" + kind + "Detail", "editor", { [idKey]: id });
      assert.equal(JSON.stringify(h.tables), before);
      if (value === null) { error(detail, "SERVER_ERROR"); continue; }
      assert.equal(detail.data.content.is_featured, value);
      const result = h.call("update" + kind, "editor", { [idKey]: id, expected_revision: detail.data.revision, description_th: "Another edit" });
      if (typeof value === "boolean") {
        assert.equal(result.ok, true);
        assert.equal(h.call("adminGet" + kind + "Detail", "editor", { [idKey]: id }).data.content.is_featured, value);
      } else { error(result, "VALIDATION_ERROR"); assert.equal(JSON.stringify(h.tables), before); }
    }
  });
  test(kind + " URLs accept ordinary DNS/canonical IPv4 and reject invalid numeric hosts", () => {
    const fields = (kind === "Product" ? productFields : eventFields).filter(field => field.endsWith("_url"));
    const accepted = ["https://example.com/path?q=1#part", "http://example.com/", "https://maps.app.goo.gl/path", "https://sub-domain.example.co.th/", "https://EXAMPLE.COM:443/", "https://example.com:1/", "http://example.com:65535/", "https://192.0.2.1/", "http://0.0.0.0:80/", "https://255.255.255.255/", "https://123.example.com/", "https://example.xn--p1ai/"];
    const rejected = ["https://999.999.999.999/", "https://example.123/", "https://256.0.0.1/", "https://1.2.3.256/", "https://127.1/", "https://1.2.3.4.5/", "https://01.2.3.4/", "https://0x7f.0.0.1/", "https://example.0x123/", "https://1.2.3.0xff/", "https://example..com/", "https://-example.com/", "https://example.com-/", "https://example_com.test/", "https://[::1]/", "javascript:alert(1)", "ftp://example.com/", "//example.com/", "https://user:pass@example.com/", "https://example.com:0/", "https://example.com:65536/", "https://example.com:abc/"];
    for (const field of fields) {
      for (const url of accepted) {
        const h = harness(), r = h.call("create" + kind, "editor", content(kind, { [field]: url }));
        assert.equal(r.ok, true, `${field}: ${url} ${JSON.stringify(r)}`);
      }
      for (const url of rejected) {
        const h = harness(); error(h.call("create" + kind, "editor", content(kind, { [field]: url })), "VALIDATION_ERROR"); assert.equal(h.effects.length, 0);
      }
    }
  });
}

for (const kind of ["Product", "Event"]) {
  const table = kind.toLowerCase() + "s", idKey = kind.toLowerCase() + "_id";
  const title = kind === "Product" ? "name_th" : "title_th";
  test(kind + " old reader can finish after mutation without reviving its old cache generation", () => {
    const h = harness();
    let current = h.call("create" + kind, "editor", content(kind)).data;
    current = h.call("update" + kind, "editor", { [idKey]: current[idKey], expected_revision: current.revision, status: "published" }).data;
    const originalRead = h.context.readSheetObjects_, oldGeneration = h.context.ContentCacheService_key_();
    let interleaved = false;
    h.context.readSheetObjects_ = name => {
      const snapshot = originalRead(name);
      if (name === table && !interleaved) {
        interleaved = true;
        const mutation = h.call("update" + kind, "editor", { [idKey]: current[idKey], expected_revision: current.revision, [title]: "Changed title" });
        assert.equal(mutation.ok, true);
      }
      return snapshot;
    };
    const old = h.context["get" + kind + "s_"]({});
    h.context.readSheetObjects_ = originalRead;
    assert.equal(interleaved, true);
    assert.equal(old.data.items[0][kind === "Product" ? "name" : "title"], kind === "Product" ? "Honey" : "Market");
    assert.ok([...h.cacheValues.keys()].some(key => key.startsWith("public:") && key.includes(oldGeneration)), "old response was cached after the mutation");
    const fresh = h.context["get" + kind + "s_"]({});
    assert.equal(fresh.data.items[0][kind === "Product" ? "name" : "title"], "Changed title");
    assert.notEqual(h.context.ContentCacheService_key_(), oldGeneration);
  });
  test(kind + " silent cache invalidation failure prevents entity/audit writes", () => {
    const h = harness(); h.context.ContentCacheService_key_(); h.cache.remove = () => {};
    error(h.call("create" + kind, "editor", content(kind)), "SERVER_ERROR");
    assert.equal(h.effects.length, 0); assert.equal(h.tables[table].length, 1); assert.equal(h.tables.activity_logs.length, 1);
  });
  test(kind + " entity and audit flush exceptions preserve uncertainty semantics without retries", () => {
    for (const stage of [1, 2]) {
      const h = harness(); let flushes = 0;
      h.context.SpreadsheetApp.flush = () => { if (++flushes === stage) throw Error("PRIVATE flush details"); };
      const r = h.call("create" + kind, "editor", content(kind));
      assert.equal(h.effects.filter(effect => effect.name === table).length, 1);
      assert.equal(h.tables[table].length, 2);
      if (stage === 1) {
        error(r, "OUTCOME_UNKNOWN"); assert.equal(r.error.retryable, false); assert.ok(r.error[idKey]);
        assert.equal(h.tables.activity_logs.length, 1);
      } else {
        assert.equal(r.ok, true); assert.equal(r.data.audit_status, "unconfirmed");
        assert.equal(h.tables.activity_logs.length, 2); assert.equal(h.effects.length, 2);
      }
      assert.equal(flushes, stage);
    }
  });
  test(kind + " published content/featured/date edits refresh list/detail/Home/Search caches", () => {
    const h = harness();
    h.tables.routes = [["route_id", "status"]]; h.tables.gallery = [["media_id", "status"]]; h.tables.places = [["place_id", "status"]];
    h.context.EventService_today_ = () => "2026-10-07";
    const oldName = "Original unique title", newName = "Changed " + kind;
    let current = h.call("create" + kind, "editor", content(kind, { [title]: oldName, is_featured: true })).data;
    current = h.call("update" + kind, "editor", { [idKey]: current[idKey], expected_revision: current.revision, status: "published" }).data;
    const list = params => h.context["get" + kind + "s_"](params).data.items;
    const detail = () => h.context["get" + kind + "Detail_"]({ [idKey]: current[idKey] }).data;
    const home = () => h.context.getHomeData_({}).data[kind === "Product" ? "featured_products" : "upcoming_events"];
    const search = keyword => h.context.searchAll_({ keyword }).data[table];
    assert.equal(list({}).length, 1); assert.equal(list({ featured: true }).length, 1);
    assert.equal(detail().description, "Local community"); assert.equal(home().length, 1);
    assert.equal(search(oldName).length, 1); assert.equal(search(newName).length, 0);
    if (kind === "Event") { assert.equal(list({ status: "upcoming" }).length, 1); assert.equal(list({ status: "past" }).length, 0); }
    const updated = h.call("update" + kind, "editor", { [idKey]: current[idKey], expected_revision: current.revision, [title]: newName, description_th: "New description", is_featured: false, ...(kind === "Event" ? { event_date: "2026-10-06" } : {}) });
    assert.equal(updated.ok, true);
    assert.equal(list({})[0][kind === "Product" ? "name" : "title"], newName);
    assert.equal(list({ featured: true }).length, 0); assert.equal(detail().description, "New description");
    assert.equal(home().length, 0); assert.equal(search(oldName).length, 0); assert.equal(search(newName).length, 1);
    if (kind === "Event") {
      assert.equal(detail().event_date, "2026-10-06"); assert.equal(search(newName)[0].event_date, "2026-10-06");
      assert.equal(list({ status: "upcoming" }).length, 0); assert.equal(list({ status: "past" }).length, 1);
    }
  });
}

test("content generation get/put failures preserve uncached reads for all affected consumers", () => {
  for (const mode of ["cacheReadFail", "cachePutFail"]) {
    const h = harness();
    h.tables.routes = [["route_id", "status"]]; h.tables.gallery = [["media_id", "status"]]; h.tables.places = [["place_id", "status"]];
    h.context.EventService_today_ = () => "2026-10-07";
    const ids = {};
    for (const kind of ["Product", "Event"]) {
      const idKey = kind.toLowerCase() + "_id";
      const created = h.call("create" + kind, "editor", content(kind, { is_featured: true })).data;
      ids[idKey] = created[idKey];
      assert.equal(h.call("update" + kind, "editor", { [idKey]: created[idKey], expected_revision: created.revision, status: "published" }).ok, true);
    }
    h.cacheValues.clear(); h.options[mode] = true;
    for (const kind of ["Product", "Event"]) {
      const idKey = kind.toLowerCase() + "_id";
      assert.equal(h.context["get" + kind + "s_"]({}).data.items.length, 1);
      assert.equal(h.context["get" + kind + "Detail_"]({ [idKey]: ids[idKey] }).ok, true);
    }
    const home = h.context.getHomeData_({}); assert.equal(home.ok, true); assert.equal(home.data.featured_products.length, 1); assert.equal(home.data.upcoming_events.length, 1);
    assert.equal(h.context.searchAll_({ keyword: "Honey" }).data.products.length, 1);
    assert.equal(h.context.searchAll_({ keyword: "Market" }).data.events.length, 1);
    assert.equal(h.cacheValues.size, 0, "failed generation initialization must not cache under a default namespace");
  }
});

test("Event calendar leap-century boundaries and equal-time rejection", () => {
  for (const [date, valid] of [["1900-02-29", false], ["2000-02-29", true], ["2100-02-29", false], ["2400-02-29", true]]) {
    const h = harness(), r = h.call("createEvent", "editor", content("Event", { event_date: date }));
    if (valid) assert.equal(r.ok, true); else { error(r, "VALIDATION_ERROR"); assert.equal(h.effects.length, 0); }
  }
  const h = harness(); error(h.call("createEvent", "editor", content("Event", { start_time: "10:00", end_time: "10:00" })), "VALIDATION_ERROR"); assert.equal(h.effects.length, 0);
});

if (require.main === module) console.log(`${checks} Admin content checks passed.`);
module.exports = { harness, content, productFields, eventFields, test, error };
