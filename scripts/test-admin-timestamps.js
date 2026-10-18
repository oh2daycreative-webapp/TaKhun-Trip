"use strict";
// F-22: Admin lists/details show Thai local date/time, never a raw UTC ISO string or a raw sheet timestamp.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const files = { routes: "public/admin/js/admin-routes.js", reviews: "public/admin/js/admin-reviews.js" };
const helpers = {};
for (const [name, file] of Object.entries(files)) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const match = /function thaiDateTime\(value\)\{.*?\}\}\n/s.exec(source);
  assert.ok(match, `${file} defines thaiDateTime`);
  helpers[name] = match[0];
}
assert.equal(helpers.routes, helpers.reviews, "both pages use the same formatter");
const thaiDateTime = new Function(`${helpers.routes}; return thaiDateTime;`)();
const expected = (date) => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
// Route updated_at: UTC ISO instant 01:46Z = 08:46 Bangkok.
assert.equal(thaiDateTime("2026-10-18T01:46:25.344Z"), expected(new Date("2026-10-18T01:46:25.344Z")));
assert.match(thaiDateTime("2026-10-18T01:46:25.344Z"), /2569.*08:46/);
// Review created_at: Bangkok wall time, independent of the viewer's time zone.
assert.match(thaiDateTime("2026-07-14 10:00:00"), /2569.*10:00/);
assert.equal(thaiDateTime(""), "-");
assert.equal(thaiDateTime("not a date"), "not a date");
const routes = fs.readFileSync(path.join(root, files.routes), "utf8");
const reviews = fs.readFileSync(path.join(root, files.reviews), "utf8");
assert.match(routes, /`แก้ไขล่าสุด \$\{thaiDateTime\(item\.updated_at\)\}`/);
assert.match(reviews, /\$\{thaiDateTime\(record\.created_at\)\}/);
process.stdout.write("Admin timestamp formatting verified.\n");
