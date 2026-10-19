"use strict";
// F-18: /admin and /admin/ must open the Admin login page (Cloudflare Pages _redirects, clean URL target).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const lines = fs.readFileSync(path.join(root, "public/_redirects"), "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
const rules = lines.map((line) => line.split(/\s+/));
for (const rule of rules) {
  assert.equal(rule.length, 3, `rule must be "from to status": ${rule.join(" ")}`);
  assert.match(rule[0], /^\/[^\s]*$/, "source must be a site path");
  assert.match(rule[1], /^\/[^\s:]*$/, "target must stay on this site (no external redirect)");
  assert.ok(["301", "302"].includes(rule[2]), "only plain redirects");
}
for (const from of ["/admin", "/admin/"]) {
  const rule = rules.find((entry) => entry[0] === from);
  assert.ok(rule, `${from} must redirect`);
  assert.equal(rule[1], "/admin/login");
}
assert.ok(fs.existsSync(path.join(root, "public/admin/login.html")), "login page exists");
assert.equal(rules.length, 2, "no other redirects without review");
process.stdout.write("Redirect rules verified.\n");
