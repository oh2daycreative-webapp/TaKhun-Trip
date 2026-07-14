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
assert.deepEqual(cases.sort(), ["getMapPlaces", "getPlaceDetail", "getPlaces", "getRouteDetail", "getRoutes", "getTripTemplates"]);
assert.match(router, /createJsonResponse_\(/);
assert.match(router, /UNKNOWN_ACTION/);
assert.match(router, /SERVER_ERROR/);
assert.doesNotMatch(router, /stack|spreadsheetId|_error\.(?:message|stack)/);

process.stdout.write(`Apps Script static verification passed for ${files.length} files and ${declarations.size} unique functions.\n`);
