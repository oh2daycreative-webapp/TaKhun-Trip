"use strict";
// Production config for the phase 1 uploads release (D29): public/js/config.js names the production media Worker,
// added only after that Worker was deployed and checked (runbook B-5). Never the staging Worker or r2.dev.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "config.js"), "utf8");
const context = vm.createContext({});
vm.runInContext(`${source}\nglobalThis.__config = APP_CONFIG;`, context);
const config = context.__config;

assert.equal(config.API_URL, "https://script.google.com/macros/s/AKfycbymATnCiu104DH1Sw8tfzNVCpXZDdnDnZHul2hTPJhdaBEHvdrzY3pL-rlYOk2Yuu5V2g/exec", "production API unchanged");
assert.equal(config.SITE_URL, "https://takhun-trip.pages.dev");
assert.equal(config.DEFAULT_LANG, "th");
assert.equal(config.MEDIA_ORIGIN, "https://takhun-media.oh2daycreative.workers.dev", "D25/D29: the production Worker");
const origin = new URL(config.MEDIA_ORIGIN);
assert.equal(origin.origin, config.MEDIA_ORIGIN, "a bare https origin: no path, no slash, no query");
assert.equal(origin.protocol, "https:");
assert.doesNotMatch(source, /takhun-media-staging|r2\.dev|AKfycbzlF57v/, "no staging Worker, r2.dev or staging API");
assert.deepEqual(Object.keys(config).sort(), ["API_URL", "DEFAULT_LANG", "MEDIA_ORIGIN", "SITE_URL"]);
assert.ok(Object.isFrozen(config));
console.log("Production config verification passed (MEDIA_ORIGIN = production Worker).");
