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
  const admin = { admin_id: "ADM-123e4567-e89b-12d3-a456-426614174000", username: "operator", display_name: "Operator", role: "super_admin" };
  await rejects(() => harness({ admin, expires_at: "2026-07-11 10:00:00" }).api.validateSession(token), "MALFORMED_RESPONSE");
  console.log("Admin Product/Event API contracts passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
