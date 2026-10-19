"use strict";
// Home page fixes (2026-10-20):
// - an element with the hidden attribute and a state class (.empty-state/.loading-state/.error-state) must not be shown.
//   Before the fix, ".loading-state, .empty-state, .error-state { display: grid }" overrode [hidden], so the home empty
//   boxes appeared below the place and route cards;
// - the home footer links to the products page (desktop had no link to it).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const css = ["main.css", "components.css", "mobile.css"].map((file) => fs.readFileSync(path.join(root, "public/css", file), "utf8"));
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");

// Static checks (no browser needed).
assert.match(css[1], /\.loading-state\[hidden\],\.empty-state\[hidden\],\.error-state\[hidden\]\{display:none\}/, "state classes respect [hidden]");
const footerInfo = /<h2 data-i18n="home\.footer_info">[\s\S]*?<\/ul>/.exec(html);
assert.ok(footerInfo, "footer info list exists");
assert.match(footerInfo[0], /<a href="products\.html" data-i18n="nav\.products">/, "footer links to products");
for (const selector of ["data-home-places-empty", "data-home-routes-empty", "data-home-events-empty"]) {
  assert.match(html, new RegExp(`class="home-section-empty empty-state" ${selector} role="status" hidden`), `${selector} starts hidden`);
}

// Cascade check: specificity of the fix must beat every display rule on the state classes, whatever the file order.
const specificity = (selector) => [(selector.match(/#/g) || []).length, (selector.match(/\.|\[|:(?!:)/g) || []).length];
const rules = css.join("\n").match(/[^{}]+\{[^{}]*display:[^;}]+[^{}]*\}/g) || [];
for (const rule of rules) {
  const selectors = rule.slice(0, rule.indexOf("{")).split(",").map((s) => s.trim());
  const display = /display:\s*([^;}]+)/.exec(rule)[1].trim();
  for (const selector of selectors) {
    if (!/^\.(?:loading|empty|error)-state$/.test(selector) || display === "none") continue;
    const [ids, classes] = specificity(selector);
    assert.ok(ids === 0 && classes < 2, `${selector} { display:${display} } must stay below the [hidden] fix (0,2,0)`);
  }
}
process.stdout.write("Home empty states respect hidden; footer links to products.\n");
