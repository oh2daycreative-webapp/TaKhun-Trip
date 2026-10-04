"use strict";

// Task 18 is deliberately a cross-consumer gate.  The focused suites own the
// detailed fake Sheet/browser harnesses; this file makes their final M7
// security boundaries executable together and proves the gate cannot quietly
// disappear from the repository runner.
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const normalizeSource = (source) => source.replace(/\r\n?/g, "\n");
const adminPlaceServiceSource = normalizeSource(read("apps-script/AdminPlaceService.gs"));
const plain = (value) => JSON.parse(JSON.stringify(value));
const runner = read("scripts/test.ps1");
const router = read("apps-script/Router.gs");
const adminApi = read("public/admin/js/admin-api.js");
const adminAuth = read("public/admin/js/admin-auth.js");
const schema = read("apps-script/AdminPlaceSchema.gs");

function test(name, run) {
  try {
    run();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

function exactActions(source) {
  const actions = [...source.matchAll(/(?:^|[^.\w$])action\s*===\s*"([^"]+)"/gm)].map((match) => match[1]);
  return [...new Set(actions)].sort();
}

function assertRouterBoundary(source) {
  const expected = [
    "submitReview", "adminLogin", "adminValidateSession", "adminLogout",
    "adminGetPlaces", "adminGetPlaceDetail", "adminCreatePlace", "adminSavePlaceDraft", "adminPublishPlace",
    "adminInspectPlaceDependencies", "adminDiagnosePlaceDependencies", "adminUnpublishPlace", "adminArchivePlace", "adminRestorePlace",
    "adminGetPlaceMediaOptions", "adminInspectPlaceCreateDestinations"
  ].sort();
  assert.deepEqual(exactActions(source), expected);
  assert.doesNotMatch(source, /\b(?:eval|Function)\s*\(|\[[^\]]*action[^\]]*\]\s*\(/);
  assert.doesNotMatch(source, /action\s*\.\s*(?:match|test|includes|startsWith|endsWith|search)\s*\(/);
}

function assertTransportBoundary(source) {
  for (const method of ["createPlace", "savePlaceDraft", "publishPlace", "unpublishPlace", "archivePlace", "restorePlace"]) {
    assert.match(source, new RegExp(`function ${method}\\(token, payload\\) \\{ return placeRequest\\(`));
  }
  assert.match(source, /headers: \{ "Content-Type": CONTENT_TYPE \}/);
  assert.doesNotMatch(source, /Authorization|\bGET\b|\bretr(?:y|ies|ied)\b/i);
  assert.equal((source.match(/global\.fetch\(/g) || []).length, 1);
  assert.match(source, /throw safeError\("MALFORMED_RESPONSE"\)/);
}

function assertMigrationBoundary(source, routerSource = router) {
  for (const name of ["setupAdminPlaceSchema", "inspectAdminPlaceStatusMigration", "migrateAdminPlaceLegacyStatuses", "verifyAdminPlaceStatusMigration"]) {
    assert.match(source, new RegExp(`function ${name}\\(`));
    assert.doesNotMatch(routerSource, new RegExp(`\\b${name}\\b`));
  }
}

function task18ServiceHarness() {
  const source = read("scripts/test-admin-place-service.js");
  const setup = source.slice(0, source.indexOf('test("')) + "\nglobalThis.__task18 = { loadTransactionBackend, writeContent, publicPlaceDetail, populatedRows, sheetRecord };";
  const sandbox = { require, process, console, __dirname, __filename: path.join(__dirname, "test-admin-place-service.js") };
  vm.runInNewContext(setup, sandbox, { filename: "task18-adapted-admin-place-service-harness.js" });
  return sandbox.__task18;
}

function realLifecycleSnapshot(harness, serviceSource) {
  const runtime = harness.loadTransactionBackend("PUBLISH", serviceSource ? { serviceSource } : {});
  const favorites = JSON.stringify(["TX-PLACE", "OTHER-PLACE"]);
  const publicName = () => harness.publicPlaceDetail(runtime).ok ? harness.publicPlaceDetail(runtime).data.name_th : null;
  const epoch = () => runtime.properties.get("PLACE_PUBLIC_CACHE_EPOCH");
  const write = (content, expected_version) => plain(runtime.context.adminSavePlaceDraft_("TOKEN", { place_id: "TX-PLACE", expected_version, content }));
  const publish = (expected_version) => plain(runtime.context.adminPublishPlace_("TOKEN", { place_id: "TX-PLACE", expected_version }));
  const unpublish = (expected_version) => plain(runtime.context.adminUnpublishPlace_("TOKEN", { place_id: "TX-PLACE", expected_version }));
  return { runtime, favorites, publicName, epoch, write, publish, unpublish };
}

test("Task 18 runner gate is mandatory", () => {
  assert.match(runner, /node \(Join-Path \$PSScriptRoot "test-admin-place-regressions\.js"\)\r?\nif \(\$LASTEXITCODE -ne 0\) \{ throw "Admin Place integrated regression verification failed\." \}/);
});

test("Router admits only the final body-only literal action surface", () => {
  assertRouterBoundary(router);
  for (const mutant of [
    `${router}\nif (action === "adminFuture") return createJsonResponse_(adminFuture_());`,
    router.replace('if (action === "adminSavePlaceDraft")', 'if (action.startsWith("admin"))'),
    `${router}\nhandlers[action](body.payload);`
  ]) assert.throws(() => assertRouterBoundary(mutant));
});

test("Admin transport keeps all lifecycle writes single POST body requests", () => {
  assertTransportBoundary(adminApi);
  for (const mutant of [
    adminApi.replace('headers: { "Content-Type": CONTENT_TYPE },', 'headers: { "Content-Type": CONTENT_TYPE, Authorization: "Bearer " + body.token },'),
    adminApi.replace('function restorePlace(token, payload) { return placeRequest("adminRestorePlace", token, versionPayload(payload, false)); }', ''),
    adminApi.replace('return parseEnvelope(body, rawText);', 'await global.fetch(endpoint, options); return parseEnvelope(body, rawText);')
  ]) assert.throws(() => assertTransportBoundary(mutant));
});

test("migration helpers remain non-routed", () => {
  assertMigrationBoundary(schema);
  assert.throws(() => assertMigrationBoundary(schema, `${router}\nfunction migrateAdminPlaceLegacyStatuses() {}`));
});

test("real Admin Place lifecycle shares Sheets Properties and Public projection", () => {
  const harness = task18ServiceHarness();
  const shared = realLifecycleSnapshot(harness);
  const content = harness.writeContent({ name_th: "Draft B", short_description_th: "Summary B", description_th: "Detail B" });
  assert.equal(shared.publicName(), "prior published"); assert.equal(shared.epoch(), "41");
  assert.equal(shared.write(content, 3).ok, true); assert.equal(shared.publicName(), "prior published"); assert.equal(shared.epoch(), "41");
  const staleBefore = JSON.stringify(shared.runtime.sheets);
  const stale = shared.write(content, 2); assert.equal(stale.error.code, "CONFLICT"); assert.equal(JSON.stringify(shared.runtime.sheets), staleBefore);
  assert.equal(shared.publish(4).ok, true); assert.equal(shared.publicName(), "Draft B"); assert.equal(shared.epoch(), "42");
  assert.equal(shared.unpublish(5).ok, true); assert.equal(shared.publicName(), null); assert.equal(shared.epoch(), "43");
  assert.equal(shared.runtime.sheets.place_drafts.rows.some((row) => row[0] === "TX-PLACE"), true); assert.equal(JSON.stringify(["TX-PLACE", "OTHER-PLACE"]), shared.favorites);

  const publishedArchive = harness.loadTransactionBackend("ARCHIVE"); assert.equal(plain(publishedArchive.context.adminArchivePlace_("TOKEN", { place_id: "TX-PLACE", expected_version: 4, confirmed: true })).ok, true); assert.equal(publishedArchive.properties.get("PLACE_PUBLIC_CACHE_EPOCH"), "42");
  const draftArchive = harness.loadTransactionBackend("ARCHIVE", { archiveDraftSource: true }); assert.equal(plain(draftArchive.context.adminArchivePlace_("TOKEN", { place_id: "TX-PLACE", expected_version: 4, confirmed: true })).ok, true); assert.equal(draftArchive.properties.get("PLACE_PUBLIC_CACHE_EPOCH"), "41");
  const restore = harness.loadTransactionBackend("RESTORE"); assert.equal(plain(restore.context.adminRestorePlace_("TOKEN", { place_id: "TX-PLACE", expected_version: 4 })).ok, true); assert.equal(restore.properties.get("PLACE_PUBLIC_CACHE_EPOCH"), "41"); assert.equal(restore.sheets.place_drafts.rows.some((row) => row[0] === "TX-PLACE"), true);

  const service = adminPlaceServiceSource;
  const leakPatch = service.replace('var placePatch = {\n          entity_version: nextVersion,', 'var placePatch = {\n          name_th: parameters.content.name_th,\n          entity_version: nextVersion,');
  assert.notEqual(leakPatch, service, "Published leak placePatch mutation target must match");
  const leak = leakPatch.replace('["entity_version", "updated_at", "updated_by"]', '["name_th", "entity_version", "updated_at", "updated_by"]');
  assert.notEqual(leak, leakPatch, "Published leak selective-update allowlist mutation target must match");
  assert.throws(() => { const mutant = realLifecycleSnapshot(harness, leak); assert.equal(mutant.write(content, 3).ok, true); assert.equal(mutant.publicName(), "prior published"); });
  const noPublishBump = service.replace('var nextEpoch = PlaceService_bumpCacheEpoch_();', 'var nextEpoch = PlaceService_cacheEpoch_();');
  assert.throws(() => { const mutant = realLifecycleSnapshot(harness, noPublishBump); assert.equal(mutant.write(content, 3).ok, true); assert.equal(mutant.publish(4).ok, true); assert.equal(mutant.epoch(), "42"); });
  const staleAccepted = service.replace('if (expectedVersion !== authoritativeVersion) throw new Error("CONFLICT");', 'if (false) throw new Error("CONFLICT");');
  assert.throws(() => { const mutant = realLifecycleSnapshot(harness, staleAccepted); assert.equal(mutant.write(content, 2).error.code, "CONFLICT"); });
});

test("all M7 component proofs run under the integrated gate", () => {
  const suites = [
    "test-admin-place-schema.js", "test-admin-place-service.js", "test-admin-api.js", "test-admin-auth.js",
    "test-admin-places.js", "test-admin-place-edit.js", "test-admin-place-map.js", "test-admin-place-media.js",
    "test-admin-places-accessibility.js", "test-place-service.js", "test-home-service.js", "test-search-service.js",
    "test-route-service.js", "test-product-service.js", "test-event-service.js", "test-review-service.js", "test-media.js", "test-favorites.js", "test-apps-script.js"
  ];
  for (const suite of suites) {
    const result = childProcess.spawnSync(process.execPath, [path.join(__dirname, suite)], { encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, `${suite}\n${result.stdout}\n${result.stderr}`);
  }
  for (const suite of ["test-place-detail.ps1", "test-favorites.ps1"]) {
    const result = childProcess.spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, suite)], { encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, `${suite}\n${result.stdout}\n${result.stderr}`);
  }
});

test("safe return remains place-id-only and read-only roles never become write roles", () => {
  assert.match(adminAuth, /return `\$\{PLACE_EDIT_PAGE\}\?place_id=\$\{encodeURIComponent\(placeId\)\}`/);
  assert.match(adminAuth, /PLACE_EDIT_FALLBACK = "places\.html"/);
  assert.doesNotMatch(adminAuth, /place-edit\.html\?edit=/);
  const editor = read("public/admin/js/admin-place-edit.js");
  assert.match(editor, /role === "super_admin" \|\| role === "editor"/);
  assert.match(editor, /if\s*\(!writable\(\)\s*&&\s*state\.mode\s*===\s*"create"\)/);
  assert.throws(() => {
    const mutant = editor.replace('role === "super_admin" || role === "editor"', 'role !== "viewer"');
    assert.match(mutant, /role === "super_admin" \|\| role === "editor"/);
  });
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("Admin Place integrated regression verification passed.\n");
