"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const directory = path.join(__dirname, "../apps-script");
const sources = fs.readdirSync(directory)
  .filter((name) => name.endsWith(".gs"))
  .sort()
  .map((name) => ({ name, source: fs.readFileSync(path.join(directory, name), "utf8") }));
const router = sources.find(({ name }) => name === "Router.gs").source;
const apiResponse = sources.find(({ name }) => name === "ApiResponse.gs").source;
const publicGetActions = [
  "getCategories", "getEventDetail", "getEvents", "getGallery", "getHomeData", "getMapPlaces",
  "getPlaceDetail", "getPlaces", "getProductDetail", "getProducts", "getReviews", "getRouteDetail",
  "getRoutes", "getSettings", "getTripTemplates", "searchAll"
];
const safeServerError = {
  ok: false,
  error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดของระบบ" }
};

for (const { name, source } of sources) {
  new vm.Script(source, { filename: `apps-script/${name}` });
  assert.doesNotMatch(source, /\beval\s*\(/, `${name} must not use eval`);
}

const declarations = new Map();
for (const { name, source } of sources) {
  for (const match of source.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) {
    const functionName = match[1];
    assert.equal(declarations.has(functionName), false, `duplicate Apps Script function ${functionName} in ${name} and ${declarations.get(functionName)}`);
    declarations.set(functionName, name);
  }
}

const postActions = [
  "adminGetProducts", "adminGetProductDetail", "createProduct", "updateProduct", "deleteProduct",
  "adminGetEvents", "adminGetEventDetail", "createEvent", "updateEvent", "deleteEvent",
  "submitReview", "adminLogin", "adminValidateSession", "adminLogout",
  "adminGetPlaces", "adminGetPlaceDetail", "adminCreatePlace", "adminSavePlaceDraft", "adminPublishPlace",
  "adminInspectPlaceDependencies", "adminUnpublishPlace", "adminArchivePlace", "adminRestorePlace",
  "adminGetPlaceMediaOptions", "adminInspectPlaceCreateDestinations"
];

function assertStaticPostActionAllowlist(source) {
  for (const pattern of [
    /(?:\/(?:\\\/|[^/\r\n])+\/[dgimsuvy]*|[A-Za-z_$][\w$]*)\s*\.\s*test\s*\(\s*(?:action|body\s*\.\s*action)\s*\)/,
    /(?:action|body\s*\.\s*action)\s*\.\s*(?:startsWith|endsWith|includes|match|search)\s*\(/,
    /(?:\[[^\]\r\n]*\]|[A-Za-z_$][\w$]*)\s*\.\s*(?:includes|indexOf|some|find)\s*\(\s*(?:action|body\s*\.\s*action)\b/,
    /\bif\s*\(\s*!?\s*[A-Za-z_$][\w$]*\s*\(\s*(?:action|body\s*\.\s*action)\s*(?:,|\))/
  ]) {
    assert.doesNotMatch(source, pattern, "Router must use only exact literal action equality branches");
  }
  assert.doesNotMatch(
    source,
    /\b[A-Za-z_$][\w$]*\s*\[\s*(?:action|body\s*\.\s*action)\s*\]\s*\(/,
    "Router must use static action branches"
  );
  const dispatchSource = source.replace(
    /\btypeof\s+(?:action|body\s*\.\s*action)\s*===\s*"[^"]+"/g,
    ""
  );
  const detected = [];
  for (const match of dispatchSource.matchAll(/(?:^|[^.\w$])(?:action|body\s*\.\s*action)\s*===\s*"([^"]+)"/gm)) {
    detected.push(match[1]);
  }
  for (const match of dispatchSource.matchAll(/"([^"]+)"\s*===\s*(?:action|body\s*\.\s*action)\b/g)) {
    detected.push(match[1]);
  }
  const actions = [...new Set(detected)].sort();
  assert.deepEqual(actions, [...postActions].sort(), "Router POST action comparisons must be exactly the approved allowlist");
}

const routerCases = [...router.matchAll(/case\s+"([^"]+)"\s*:/g)].map((match) => match[1]);
assert.equal(new Set(routerCases).size, routerCases.length, "Router must not contain duplicate action cases");
assert.deepEqual(routerCases.sort(), publicGetActions);
assertStaticPostActionAllowlist(router);
assert.throws(
  () => assertStaticPostActionAllowlist(`${router}\nif (action === "adminFuture") return createJsonResponse_(adminFuture_());`),
  /Router POST action comparisons must be exactly the approved allowlist/
);
assert.throws(
  () => assertStaticPostActionAllowlist(`${router}\nif (body.action === "adminFuture") return createJsonResponse_(adminFuture_(body.payload));`),
  /Router POST action comparisons must be exactly the approved allowlist/
);
assert.throws(
  () => assertStaticPostActionAllowlist(`${router}\nif ("adminFuture" === body.action) return createJsonResponse_(adminFuture_(body.payload));`),
  /Router POST action comparisons must be exactly the approved allowlist/
);
assert.doesNotThrow(() => assertStaticPostActionAllowlist(`${router}\nif (typeof body.action === "string") validateActionType_();`));
assert.doesNotThrow(() => assertStaticPostActionAllowlist(`${router}\nif (unrelatedField === "unrelated-value") keepUnrelated_();`));
assert.throws(
  () => assertStaticPostActionAllowlist(`${router}\nhandlers[action](body.payload);`),
  /Router must use static action branches/
);
assert.match(router, /createJsonResponse_\(/);
assert.match(router, /UNKNOWN_ACTION/);
assert.match(router, /SERVER_ERROR/);
assert.doesNotMatch(router, /stack|spreadsheetId|_error\.(?:message|stack)/);
assert.doesNotMatch(router, /\b(?:eval|Function)\s*\(/, "Router must not dynamically evaluate action names");
assert.doesNotMatch(router, /(?:this|globalThis)\s*\[\s*action\s*\]|\[\s*action\s*\]\s*\(/, "Router must use static action branches");
for (const editorOnlyName of ["setupAdminAuthSchema", "benchmarkAdminPbkdf2", "bootstrapFirstAdmin"]) {
  assert.doesNotMatch(router, new RegExp(`\\b${editorOnlyName}\\b`), `Router must not reference editor-only ${editorOnlyName}`);
}

function createRouterRuntime({ routerSource = router, json = JSON } = {}) {
  const calls = [];
  const context = {
    JSON: json,
    Object,
    Array,
    String,
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(text) { return { text, mime: "", setMimeType(mime) { this.mime = mime; return this; } }; }
    }
  };
  for (const action of publicGetActions) {
    context[`${action}_`] = (...args) => {
      calls.push({ action, args });
      return { ok: true, data: { action } };
    };
  }
  context.submitReview_ = (...args) => {
    calls.push({ action: "submitReview", args });
    return { ok: true, data: { review_id: "REV-TEST", status: "pending" } };
  };
  for (const action of ["adminLogin", "adminValidateSession", "adminLogout"]) {
    context[`${action}_`] = (...args) => {
      calls.push({ action, args });
      return { ok: true, data: { action } };
    };
  }
  for (const action of ["adminGetPlaces", "adminGetPlaceDetail", "adminCreatePlace", "adminSavePlaceDraft", "adminPublishPlace", "adminInspectPlaceDependencies", "adminUnpublishPlace", "adminArchivePlace", "adminRestorePlace", "adminGetPlaceMediaOptions", "adminInspectPlaceCreateDestinations"]) {
    context[`${action}_`] = (...args) => {
      calls.push({ action, args });
      return { ok: true, data: { action } };
    };
  }
  vm.createContext(context);
  vm.runInContext(apiResponse, context, { filename: "apps-script/ApiResponse.gs" });
  vm.runInContext(routerSource, context, { filename: "apps-script/Router.gs" });
  return { context, calls };
}

// Admin Place actions forward only the body token and payload, never query/header authority.
for (const action of ["adminGetPlaces", "adminGetPlaceDetail", "adminCreatePlace", "adminSavePlaceDraft", "adminPublishPlace", "adminInspectPlaceDependencies", "adminUnpublishPlace", "adminArchivePlace", "adminRestorePlace", "adminGetPlaceMediaOptions", "adminInspectPlaceCreateDestinations"]) {
  const runtime = createRouterRuntime();
  const token = "BODY_TOKEN";
  const payload = action === "adminGetPlaces" ? { status: "draft" } :
    action === "adminGetPlaceDetail" ? { place_id: "P-1", view: "working" } :
      action === "adminCreatePlace" ? { content: { marker: "create" } } :
        action === "adminSavePlaceDraft" ? { place_id: "P-1", expected_version: 3, content: { marker: "save" } } :
          action === "adminPublishPlace" || action === "adminUnpublishPlace" || action === "adminRestorePlace" ?
            { place_id: "P-1", expected_version: 3 } :
            action === "adminArchivePlace" ? { place_id: "P-1", expected_version: 3, confirmed: true } :
      { place_id: "P-1" };
  assert.deepEqual(post(runtime, { action, token, payload }, {
    parameter: { action: "adminLogout", token: "QUERY_TOKEN", payload: "QUERY_PAYLOAD" },
    headers: { Authorization: "Bearer HEADER_TOKEN" }, token: "EVENT_TOKEN", payload: "EVENT_PAYLOAD"
  }), { ok: true, data: { action } });
  assert.deepEqual(runtime.calls, [{ action, args: [token, payload] }]);
}

// Removing the Task 14 branch reconstructs the committed pre-Task-14 thirteen-action
// Router and must fail the current exact fourteen-action contract.
{
  const preTask14 = router.replace(/^\s*if \(action === "adminGetPlaceMediaOptions"\).*\r?\n/m, "");
  assert.throws(() => assertStaticPostActionAllowlist(preTask14), /Router POST action comparisons must be exactly the approved allowlist/);
}

// Removing the Task 9 branches reconstructs the committed pre-Task-9 ten-action
// Router and must fail the current exact thirteen-action contract.
{
  const preTask9 = router
    .replace(/^\s*if \(action === "adminUnpublishPlace"\).*\r?\n/m, "")
    .replace(/^\s*if \(action === "adminArchivePlace"\).*\r?\n/m, "")
    .replace(/^\s*if \(action === "adminRestorePlace"\).*\r?\n/m, "");
  assert.throws(() => assertStaticPostActionAllowlist(preTask9), /Router POST action comparisons must be exactly the approved allowlist/);
}

function response(output) {
  assert.equal(output.mime, "application/json", "Router must use the standard JSON content type");
  return JSON.parse(output.text);
}

function post(runtime, body, extraEvent = {}) {
  return response(runtime.context.routeRequest_("POST", {
    ...extraEvent,
    postData: { contents: typeof body === "string" ? body : JSON.stringify(body) }
  }));
}

function postEvent(runtime, event) {
  return response(runtime.context.routeRequest_("POST", event));
}

function assertBodyArgument(routerSource, action, body, event, expected) {
  const runtime = createRouterRuntime({ routerSource });
  assert.deepEqual(postEvent(runtime, {
    ...event,
    postData: { ...(event.postData || {}), contents: JSON.stringify(body) }
  }), { ok: true, data: { action } });
  assert.deepEqual(runtime.calls, [{ action, args: [expected] }]);
}

function createCountingJson() {
  const counter = { parseCalls: 0 };
  return {
    counter,
    json: {
      parse(value) { counter.parseCalls += 1; return JSON.parse(value); },
      stringify: JSON.stringify.bind(JSON)
    }
  };
}

function assertRouterParseCalls(routerSource, contents, expectedCalls) {
  const counting = createCountingJson();
  const runtime = createRouterRuntime({ routerSource, json: counting.json });
  postEvent(runtime, { postData: { contents } });
  assert.equal(counting.counter.parseCalls, expectedCalls, `Router must parse nonempty contents once: ${contents}`);
}

function assertSafeError(output, code) {
  assert.equal(output.ok, false);
  assert.equal(output.error.code, code);
  assert.equal("data" in output, false);
}

// The direct-body mutation is a real additional dispatch path, and the static allowlist rejects its source.
{
  const directBodyMutation = router.replace(
    '        if (action === "adminLogout") return createJsonResponse_(adminLogout_(body.token));',
    '        if (body.action === "adminFuture") return createJsonResponse_(adminFuture_(body.payload));\n' +
      '        if (action === "adminLogout") return createJsonResponse_(adminLogout_(body.token));'
  );
  assert.notEqual(directBodyMutation, router, "direct-body mutation target must match production Router source");
  const runtime = createRouterRuntime({ routerSource: directBodyMutation });
  runtime.context.adminFuture_ = (...args) => {
    runtime.calls.push({ action: "adminFuture", args });
    return { ok: true, data: { action: "adminFuture" } };
  };
  const payload = { sentinel: "future-route" };
  assert.deepEqual(post(runtime, { action: "adminFuture", payload }), { ok: true, data: { action: "adminFuture" } });
  assert.deepEqual(runtime.calls, [{ action: "adminFuture", args: [payload] }]);
  assert.throws(
    () => assertStaticPostActionAllowlist(directBodyMutation),
    /Router POST action comparisons must be exactly the approved allowlist/
  );
}

// Every broad/helper-gated mutation is executable, admits a ninth action, and must be rejected structurally.
for (const [label, branch, helper] of [
  ["regex test", '        if (/^adminFuture$/.test(action)) return createJsonResponse_(adminFuture_(body.payload));', ""],
  ["prefix test", '        if (action.startsWith("adminFuture")) return createJsonResponse_(adminFuture_(body.payload));', ""],
  [
    "allowlist includes",
    '        if (allowedActions.includes(action)) return createJsonResponse_(adminFuture_(body.payload));',
    '\nvar allowedActions = ["adminFuture"];\n'
  ],
  [
    "helper gate",
    '        if (isFutureAction_(action)) return createJsonResponse_(adminFuture_(body.payload));',
    '\nfunction isFutureAction_(candidate) { return candidate === "adminFuture"; }\n'
  ]
]) {
  const mutation = router.replace(
    '        if (action === "adminSavePlaceDraft") return createJsonResponse_(adminSavePlaceDraft_(body.token, body.payload));',
    '        if (action === "adminSavePlaceDraft") return createJsonResponse_(adminSavePlaceDraft_(body.token, body.payload));\n' + branch
  ) + helper;
  assert.notEqual(mutation, router, `${label} mutation target must match production Router source`);
  const runtime = createRouterRuntime({ routerSource: mutation });
  runtime.context.adminFuture_ = (...args) => {
    runtime.calls.push({ action: "adminFuture", args });
    return { ok: true, data: { action: "adminFuture" } };
  };
  const payload = { sentinel: label };
  assert.deepEqual(post(runtime, { action: "adminFuture", payload }), { ok: true, data: { action: "adminFuture" } });
  assert.deepEqual(runtime.calls, [{ action: "adminFuture", args: [payload] }]);
  assert.throws(
    () => assertStaticPostActionAllowlist(mutation),
    /Router must use only exact literal action equality branches/
  );
}

// Public GET contracts are independently snapshotted before Admin dispatch assertions.
{
  const runtime = createRouterRuntime();
  for (const action of publicGetActions) {
    assert.deepEqual(response(runtime.context.routeRequest_("GET", { parameter: { action, marker: "kept" } })), { ok: true, data: { action } });
  }
  assert.deepEqual(response(runtime.context.routeRequest_("GET", { parameter: { action: " getPlaces ", marker: "kept" } })), { ok: true, data: { action: "getPlaces" } });
  assert.equal(runtime.calls.length, publicGetActions.length + 1);
  assert.equal(runtime.calls.every(({ args }) => args.length === 1 && args[0].marker === "kept"), true);
  assertSafeError(response(runtime.context.routeRequest_("GET", { parameter: { action: "missing" } })), "UNKNOWN_ACTION");
}

// Existing review POST behavior remains body-driven and forwards only its payload.
{
  const runtime = createRouterRuntime();
  const payload = { place_id: "P-1", rating: 5, comment: "good" };
  assert.deepEqual(post(runtime, { action: "submitReview", payload }), { ok: true, data: { review_id: "REV-TEST", status: "pending" } });
  assert.deepEqual(runtime.calls, [{ action: "submitReview", args: [payload] }]);
  assertSafeError(response(runtime.context.routeRequest_("GET", { parameter: { action: "submitReview" } })), "UNKNOWN_ACTION");
}

// Legacy public POST query-only actions never enter body validation or GET dispatch.
{
  const runtime = createRouterRuntime();
  assertSafeError(response(runtime.context.routeRequest_("POST", { parameter: { action: "getPlaces" } })), "UNKNOWN_ACTION");
  assert.equal(runtime.calls.length, 0);
}

// Each pre-Task-3 POST action reaches exactly one bounded service argument from the JSON body.
{
  const runtime = createRouterRuntime();
  const loginPayload = { username: "  MiXeD_User  ", password: "\tP@ss Word  \n" };
  const token = "\tToKeN-Raw_Ab9  \n";
  const requests = [
    { body: { action: "submitReview", payload: { place_id: "P-1" } }, action: "submitReview", value: { place_id: "P-1" } },
    { body: { action: "adminLogin", payload: loginPayload, token: "ignore", unexpected: true }, action: "adminLogin", value: loginPayload },
    { body: { action: "adminValidateSession", token, payload: { ignored: true }, unexpected: true }, action: "adminValidateSession", value: token },
    { body: { action: "adminLogout", token, payload: { ignored: true }, unexpected: true }, action: "adminLogout", value: token }
  ];
  for (const { body, action } of requests) {
    assert.deepEqual(post(runtime, body), action === "submitReview"
      ? { ok: true, data: { review_id: "REV-TEST", status: "pending" } }
      : { ok: true, data: { action } });
  }
  assert.equal(runtime.calls.length, requests.length);
  for (let index = 0; index < requests.length; index += 1) {
    assert.equal(runtime.calls[index].action, requests[index].action);
    assert.equal(runtime.calls[index].args.length, 1);
    assert.deepEqual(runtime.calls[index].args[0], requests[index].value);
  }
}

// Admin forwarding preserves body bytes exactly; Router does not trim, lowercase, or fall back to event data.
for (const [action, body, expected] of [
  ["adminLogin", { action: "adminLogin", payload: { username: "  MiXeD_User  ", password: "\tP@ss Word  \n" } }, { username: "  MiXeD_User  ", password: "\tP@ss Word  \n" }],
  ["adminValidateSession", { action: "adminValidateSession", token: "\tToKeN-Raw_Ab9  \n" }, "\tToKeN-Raw_Ab9  \n"],
  ["adminLogout", { action: "adminLogout", token: "\tToKeN-Raw_Ab9  \n" }, "\tToKeN-Raw_Ab9  \n"]
]) {
  assertBodyArgument(router, action, body, {}, expected);
}
for (const [action, body, event] of [
  ["adminLogin", { action: "adminLogin" }, {
    parameter: { action: "adminLogout", payload: { username: "QUERY", password: "QUERY" }, token: "QUERY_TOKEN" },
    headers: { Authorization: "HEADER_TOKEN" }, payload: { username: "EVENT", password: "EVENT" }, token: "EVENT_TOKEN",
    postData: { payload: { username: "POSTDATA", password: "POSTDATA" }, token: "POSTDATA_TOKEN" }
  }],
  ["adminValidateSession", { action: "adminValidateSession" }, {
    parameter: { action: "adminLogin", payload: "QUERY_PAYLOAD", token: "QUERY_TOKEN" },
    headers: { Authorization: "HEADER_TOKEN" }, payload: "EVENT_PAYLOAD", token: "EVENT_TOKEN",
    postData: { payload: "POSTDATA_PAYLOAD", token: "POSTDATA_TOKEN" }
  }],
  ["adminLogout", { action: "adminLogout" }, {
    parameter: { action: "adminValidateSession", payload: "QUERY_PAYLOAD", token: "QUERY_TOKEN" },
    headers: { Authorization: "HEADER_TOKEN" }, payload: "EVENT_PAYLOAD", token: "EVENT_TOKEN",
    postData: { payload: "POSTDATA_PAYLOAD", token: "POSTDATA_TOKEN" }
  }]
]) {
  assertBodyArgument(router, action, body, event, undefined);
}

// Detector proofs: these realistic normalization and fallback mutations are rejected by the body contract.
assert.throws(
  () => assertBodyArgument(
    router.replace("adminLogin_(body.payload)", "adminLogin_({ username: body.payload.username.trim().toLowerCase(), password: body.payload.password.trim() })"),
    "adminLogin",
    { action: "adminLogin", payload: { username: "  MiXeD_User  ", password: "\tP@ss Word  \n" } },
    {},
    { username: "  MiXeD_User  ", password: "\tP@ss Word  \n" }
  ),
  /Expected values to be strictly deep-equal/
);
assert.throws(
  () => assertBodyArgument(
    router.replace("adminValidateSession_(body.token)", "adminValidateSession_(body.token.trim())"),
    "adminValidateSession",
    { action: "adminValidateSession", token: "\tToKeN-Raw_Ab9  \n" },
    {},
    "\tToKeN-Raw_Ab9  \n"
  ),
  /Expected values to be strictly deep-equal/
);
assert.throws(
  () => assertBodyArgument(
    router.replace("adminLogin_(body.payload)", "adminLogin_(body.payload || parameters.payload)"),
    "adminLogin",
    { action: "adminLogin" },
    { parameter: { payload: { username: "QUERY", password: "QUERY" } } },
    undefined
  ),
  /Expected values to be strictly deep-equal/
);
assert.throws(
  () => assertBodyArgument(
    router.replace("adminValidateSession_(body.token)", "adminValidateSession_(body.token || event.token)"),
    "adminValidateSession",
    { action: "adminValidateSession" },
    { token: "EVENT_TOKEN" },
    undefined
  ),
  /Expected values to be strictly deep-equal/
);
assert.throws(
  () => assertBodyArgument(
    router.replace("adminLogout_(body.token)", "adminLogout_(body.token || event.headers.Authorization || event.postData.token)"),
    "adminLogout",
    { action: "adminLogout" },
    { headers: { Authorization: "HEADER_TOKEN" }, postData: { token: "POSTDATA_TOKEN" } },
    undefined
  ),
  /Expected values to be strictly deep-equal/
);
assert.throws(
  () => assertBodyArgument(
    router.replace("adminLogout_(body.token)", "adminLogout_(body.token || event.postData.token)"),
    "adminLogout",
    { action: "adminLogout" },
    { postData: { token: "POSTDATA_TOKEN" } },
    undefined
  ),
  /Expected values to be strictly deep-equal/
);

// Query strings and headers cannot override a body-selected Admin action or add arguments.
for (const [action, body, expected] of [
  ["adminLogin", { action: "adminLogin", payload: { username: "body-user", password: "body-password" } }, { username: "body-user", password: "body-password" }],
  ["adminValidateSession", { action: "adminValidateSession", token: "BODY_TOKEN" }, "BODY_TOKEN"],
  ["adminLogout", { action: "adminLogout", token: "BODY_TOKEN" }, "BODY_TOKEN"]
]) {
  const runtime = createRouterRuntime();
  assert.deepEqual(post(runtime, body, {
    parameter: { action: "submitReview", token: "QUERY_TOKEN", payload: "query-payload" },
    headers: { Authorization: "Bearer HEADER_TOKEN" }
  }), { ok: true, data: { action } });
  assert.deepEqual(runtime.calls, [{ action, args: [expected] }]);
}

// Parse failures and non-object JSON are safe and never call any service.
for (const contents of [undefined, "", "   ", "{", "null", "[]", "true", "17", "\"primitive\""]) {
  const runtime = createRouterRuntime();
  const event = contents === undefined ? {} : { postData: { contents } };
  const output = response(runtime.context.routeRequest_("POST", event));
  assertSafeError(output, [undefined, "", "   ", "{"].includes(contents) ? "VALIDATION_ERROR" : "UNKNOWN_ACTION");
  assert.equal(runtime.calls.length, 0, `invalid body ${String(contents)} must not call a service`);
  assert.equal(JSON.stringify(output).includes("SENTINEL_PASSWORD_DO_NOT_LOG"), false);
}

// Router parses each nonempty string POST body exactly once, independently of response serialization.
for (const contents of [
  JSON.stringify({ action: "adminLogin", payload: { username: "operator", password: "password" } }),
  "{",
  "null",
  "[]",
  "true",
  "17",
  "\"primitive\""
]) {
  assertRouterParseCalls(router, contents, 1);
}
const parseTwiceForNonObjects = router.replace(
  '      action = body && typeof body === "object" && !Array.isArray(body) && typeof body.action === "string" ? body.action.trim() : "";',
  '      if (body === null || Array.isArray(body) || typeof body !== "object") JSON.parse(event.postData.contents);\n      action = body && typeof body === "object" && !Array.isArray(body) && typeof body.action === "string" ? body.action.trim() : "";'
);
for (const contents of ["null", "[]", "true", "17", "\"primitive\""]) {
  assert.throws(
    () => assertRouterParseCalls(parseTwiceForNonObjects, contents, 1),
    /Router must parse nonempty contents once/
  );
}
for (const event of [
  {},
  { postData: {} },
  { postData: { contents: null } },
  { postData: { contents: 7 } },
  { postData: { contents: "" } },
  { postData: { contents: " \t\n" } }
]) {
  const counting = createCountingJson();
  const runtime = createRouterRuntime({ json: counting.json });
  postEvent(runtime, event);
  assert.equal(counting.counter.parseCalls, 0, "Router must not parse absent, non-string, or blank contents");
}
{
  const runtime = createRouterRuntime();
  assertSafeError(response(runtime.context.routeRequest_("POST", { postData: {} })), "VALIDATION_ERROR");
  assert.equal(runtime.calls.length, 0, "a missing postData.contents must not call a service");
}
for (const body of [{}, { action: 7 }, { action: false }, { action: {} }, { action: "unknownAction", payload: "SENTINEL_PASSWORD_DO_NOT_LOG" }]) {
  const runtime = createRouterRuntime();
  const output = post(runtime, body);
  assertSafeError(output, "UNKNOWN_ACTION");
  assert.equal(runtime.calls.length, 0);
  assert.equal(JSON.stringify(output).includes("SENTINEL_PASSWORD_DO_NOT_LOG"), false);
}
for (const action of publicGetActions) {
  const runtime = createRouterRuntime();
  assertSafeError(post(runtime, { action, payload: {} }), "UNKNOWN_ACTION");
  assert.equal(runtime.calls.length, 0, `POST ${action} must not reuse a public GET route`);
}

// GET and query values cannot activate Admin actions or deliver URL/header tokens.
for (const action of ["adminLogin", "adminValidateSession", "adminLogout", "adminGetPlaces", "adminGetPlaceDetail", "adminCreatePlace", "adminSavePlaceDraft", "adminPublishPlace", "adminInspectPlaceDependencies", "adminUnpublishPlace", "adminArchivePlace", "adminRestorePlace", "adminGetPlaceMediaOptions", "adminInspectPlaceCreateDestinations"]) {
  for (const parameter of [
    { action, token: "T".repeat(43) },
    { method: action, token: "T".repeat(43) },
    { action: "missing", method: action, token: "T".repeat(43) }
  ]) {
    const runtime = createRouterRuntime();
    assertSafeError(response(runtime.context.routeRequest_("GET", { parameter, headers: { Authorization: "Bearer URL_TOKEN" } })), "UNKNOWN_ACTION");
    assert.equal(runtime.calls.some(({ action: called }) => called.startsWith("admin")), false);
  }
}

// Editor-only entry points stay unreachable through every Router input channel.
for (const editorOnlyName of ["setupAdminAuthSchema", "benchmarkAdminPbkdf2", "bootstrapFirstAdmin"]) {
  for (const attempt of [
    () => { const runtime = createRouterRuntime(); return { runtime, output: response(runtime.context.routeRequest_("GET", { parameter: { action: editorOnlyName } })) }; },
    () => { const runtime = createRouterRuntime(); return { runtime, output: post(runtime, { action: editorOnlyName }) }; },
    () => { const runtime = createRouterRuntime(); return { runtime, output: post(runtime, { action: "unknown", payload: { action: editorOnlyName } }, { parameter: { action: editorOnlyName, method: editorOnlyName } }) }; }
  ]) {
    const { runtime, output } = attempt();
    assertSafeError(output, "UNKNOWN_ACTION");
    assert.equal(runtime.calls.length, 0);
  }
}

// Every Admin exception is converted to the existing fixed server-safe envelope with no leak.
for (const action of ["adminLogin", "adminValidateSession", "adminLogout", "adminGetPlaces", "adminGetPlaceDetail", "adminCreatePlace", "adminSavePlaceDraft", "adminPublishPlace", "adminInspectPlaceDependencies", "adminUnpublishPlace", "adminArchivePlace", "adminRestorePlace", "adminGetPlaceMediaOptions", "adminInspectPlaceCreateDestinations"]) {
  for (const thrown of [
    new Error("ordinary failure"),
    "string failure",
    { detail: "object failure" },
    new Error("SENTINEL_PASSWORD_DO_NOT_LOG"),
    new Error("SENTINEL_RAW_TOKEN_DO_NOT_LOG"),
    new Error("stack internal Sheet spreadsheetId")
  ]) {
    const runtime = createRouterRuntime();
    runtime.context[`${action}_`] = () => { throw thrown; };
    const body = action === "adminLogin"
      ? { action, payload: { username: "operator", password: "SENTINEL_PASSWORD_DO_NOT_LOG" } }
      : { action, token: "SENTINEL_RAW_TOKEN_DO_NOT_LOG", payload: {} };
    const output = post(runtime, body);
    assert.deepEqual(output, safeServerError);
    for (const secret of ["SENTINEL_PASSWORD_DO_NOT_LOG", "SENTINEL_RAW_TOKEN_DO_NOT_LOG", "ordinary failure", "string failure", "object failure", "spreadsheetId", "internal Sheet", "stack"]) {
      assert.equal(JSON.stringify(output).includes(secret), false);
    }
  }
}

// Public exceptions retain the same sanitized response behavior.
for (const action of ["submitReview", "getGallery", "searchAll"]) {
  const runtime = createRouterRuntime();
  runtime.context[`${action}_`] = () => { throw new Error("sheet reviews spreadsheetId stack secret"); };
  const output = action === "submitReview"
    ? post(runtime, { action, payload: {} })
    : response(runtime.context.routeRequest_("GET", { parameter: { action } }));
  assert.deepEqual(output, safeServerError);
}

for (const migration of ["setupAdminPlaceSchema", "inspectAdminPlaceStatusMigration", "migrateAdminPlaceLegacyStatuses", "verifyAdminPlaceStatusMigration"]) {
  assert.doesNotMatch(router, new RegExp(`\\b${migration}\\b`), `Task 18 keeps ${migration} operator-only and non-routed`);
}

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write(`Apps Script Router verification passed for ${sources.length} files and ${declarations.size} unique functions.\n`);
