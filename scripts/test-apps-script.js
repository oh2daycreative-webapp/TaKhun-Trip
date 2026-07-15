"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const directory = path.join(__dirname, "../apps-script");
const files = fs.readdirSync(directory).filter((name) => name.endsWith(".gs")).sort();
const sources = files.map((name) => ({ name, source: fs.readFileSync(path.join(directory, name), "utf8") }));

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

const router = sources.find(({ name }) => name === "Router.gs").source;
const cases = [...router.matchAll(/case\s+"([^"]+)"\s*:/g)].map((match) => match[1]);
assert.equal(new Set(cases).size, cases.length, "Router must not contain duplicate action cases");
assert.deepEqual(cases.sort(), ["getEventDetail", "getEvents", "getGallery", "getMapPlaces", "getPlaceDetail", "getPlaces", "getProductDetail", "getProducts", "getReviews", "getRouteDetail", "getRoutes", "getTripTemplates"]);
assert.match(router, /action\s*===\s*"submitReview"/);
assert.match(router, /createJsonResponse_\(/);
assert.match(router, /UNKNOWN_ACTION/);
assert.match(router, /SERVER_ERROR/);
assert.doesNotMatch(router, /stack|spreadsheetId|_error\.(?:message|stack)/);

const calls = [];
const routerContext = {
  JSON,
  ContentService: {
    MimeType: { JSON: "application/json" },
    createTextOutput(text) { return { text, mime: "", setMimeType(mime) { this.mime = mime; return this; } }; }
  }
};
for (const action of cases) routerContext[`${action}_`] = (parameters) => { calls.push({ action, parameters }); return { ok: true, data: { action } }; };
routerContext.submitReview_ = (payload) => { calls.push({ action: "submitReview", payload }); return { ok: true, data: { review_id: "REV-TEST", status: "pending" } }; };
vm.createContext(routerContext);
vm.runInContext(sources.find(({ name }) => name === "ApiResponse.gs").source, routerContext, { filename: "apps-script/ApiResponse.gs" });
vm.runInContext(router, routerContext, { filename: "apps-script/Router.gs" });
for (const action of cases) {
  const output = routerContext.routeRequest_("GET", { parameter: { action, marker: "kept" } });
  assert.equal(output.mime, "application/json");
  assert.deepEqual(JSON.parse(output.text), { ok: true, data: { action } });
}
assert.equal(calls.length, cases.length);
assert.equal(calls.every((call) => call.parameters.marker === "kept"), true);
const submitted = JSON.parse(routerContext.routeRequest_("POST", { postData: { contents: JSON.stringify({ action: "submitReview", payload: { place_id: "P-1", rating: 5, comment: "good" } }) } }).text);
assert.deepEqual(submitted, { ok: true, data: { review_id: "REV-TEST", status: "pending" } });
assert.deepEqual(calls.at(-1).payload, { place_id: "P-1", rating: 5, comment: "good" });
assert.equal(JSON.parse(routerContext.routeRequest_("GET", { parameter: { action: "submitReview" } }).text).error.code, "UNKNOWN_ACTION");
assert.equal(JSON.parse(routerContext.routeRequest_("POST", { postData: { contents: JSON.stringify({ action: "getReviews", payload: {} }) } }).text).error.code, "UNKNOWN_ACTION");
assert.equal(JSON.parse(routerContext.routeRequest_("POST", {}).text).error.code, "VALIDATION_ERROR");
assert.equal(JSON.parse(routerContext.routeRequest_("POST", { postData: { contents: "{" } }).text).error.code, "VALIDATION_ERROR");
routerContext.submitReview_ = () => { throw new Error("sheet reviews spreadsheet id stack secret"); };
assert.deepEqual(JSON.parse(routerContext.routeRequest_("POST", { postData: { contents: JSON.stringify({ action: "submitReview", payload: {} }) } }).text), { ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดของระบบ" } });
routerContext.getGallery_ = () => { throw new Error("gallery / sheet / spreadsheet id / stack secret"); };
assert.deepEqual(JSON.parse(routerContext.routeRequest_("GET", { parameter: { action: "getGallery" } }).text), { ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดของระบบ" } });
assert.equal(JSON.parse(routerContext.routeRequest_("GET", { parameter: { action: "missing" } }).text).error.code, "UNKNOWN_ACTION");

process.stdout.write(`Apps Script static verification passed for ${files.length} files and ${declarations.size} unique functions.\n`);
