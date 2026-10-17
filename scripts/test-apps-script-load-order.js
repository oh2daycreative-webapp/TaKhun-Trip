"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const appsScriptDirectory = path.join(root, "apps-script");
const observedStagingOrder = fs.readdirSync(appsScriptDirectory)
  .filter((name) => name.endsWith(".gs"))
  .sort((left, right) => left.localeCompare(right, "en"));
const allowlist = [
  "site_name", "site_slogan_th", "site_slogan_en", "default_language",
  "main_email", "main_phone", "facebook_url", "line_url", "logo_url",
  "hero_image_url", "reviews_enabled", "events_enabled"
];

function crossFileInitializerDependencies() {
  const declarations = new Map();
  const initializers = [];
  for (const name of observedStagingOrder) {
    const source = fs.readFileSync(path.join(appsScriptDirectory, name), "utf8");
    for (const match of source.matchAll(/^var\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]*?);/gm)) {
      declarations.set(match[1], name);
      initializers.push({ file: name, variable: match[1], source: match[2] });
    }
  }
  const dependencies = [];
  for (const initializer of initializers) {
    for (const match of initializer.source.matchAll(/\b[A-Za-z_$][\w$]*_\b/g)) {
      const owner = declarations.get(match[0]);
      if (owner && owner !== initializer.file) {
        dependencies.push(`${initializer.file}:${initializer.variable}->${owner}:${match[0]}`);
      }
    }
  }
  return [...new Set(dependencies)].sort();
}

function settingsValues() {
  return [
    ["setting_key", "setting_value", "updated_at"],
    ["site_name", "Takhun Trip staging", "2026-01-01 00:00:00"],
    ["site_slogan_th", "Synthetic Thai slogan", "2026-01-01 00:00:00"],
    ["site_slogan_en", "Synthetic English slogan", "2026-01-01 00:00:00"],
    ["default_language", "th", "2026-01-01 00:00:00"],
    ["main_email", "synthetic@example.invalid", "2026-01-01 00:00:00"],
    ["main_phone", "", "2026-01-01 00:00:00"],
    ["facebook_url", "", "2026-01-01 00:00:00"],
    ["line_url", "", "2026-01-01 00:00:00"],
    ["logo_url", "", "2026-01-01 00:00:00"],
    ["hero_image_url", "", "2026-01-01 00:00:00"],
    ["reviews_enabled", true, "2026-01-01 00:00:00"],
    ["events_enabled", false, "2026-01-01 00:00:00"]
  ];
}

function load(order) {
  const values = settingsValues();
  const formulas = values.map((row) => row.map(() => ""));
  const cache = new Map();
  const context = {
    console, JSON, Object, Math, Number, String, Boolean, Array, Date, RegExp,
    Error, Map, Set, encodeURIComponent, decodeURIComponent, isFinite, parseInt,
    CacheService: { getScriptCache: () => ({
      get: (key) => cache.has(key) ? cache.get(key) : null,
      put: (key, value) => cache.set(key, value),
      remove: (key) => cache.delete(key)
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "staging-spreadsheet-id" }) },
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: (name) => name === "settings" ? {
        getLastRow: () => values.length,
        getLastColumn: () => values[0].length,
        getDataRange: () => ({ getValues: () => values, getFormulas: () => formulas })
      } : null }),
      flush() {}
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(text) {
        return { text, mime: null, setMimeType(mime) { this.mime = mime; return this; } };
      }
    }
  };
  vm.createContext(context);
  // Apps Script binds project-wide `var` names before evaluating file initializers.
  // Prebinding reproduces the observed undefined-global failure instead of Node's
  // otherwise earlier ReferenceError for a declaration in a later file.
  for (const name of observedStagingOrder) {
    const source = fs.readFileSync(path.join(appsScriptDirectory, name), "utf8");
    for (const match of source.matchAll(/^var\s+([A-Za-z_$][\w$]*)\s*=/gm)) {
      if (!Object.prototype.hasOwnProperty.call(context, match[1])) context[match[1]] = undefined;
    }
  }
  for (const name of order) {
    const source = fs.readFileSync(path.join(appsScriptDirectory, name), "utf8");
    vm.runInContext(source, context, { filename: `apps-script/${name}` });
  }
  return context;
}

function assertRuntime(order, label) {
  const context = load(order);
  assert.deepEqual(Array.from(context.SettingsService_PUBLIC_KEYS_), allowlist, `${label}: public allowlist changed`);
  assert.deepEqual(Array.from(context.AdminSettingsService_KEYS_), allowlist, `${label}: admin allowlist changed`);
  const reviewDomain = context.AdminDashboardService_domains_().find((domain) => domain.domain === "reviews");
  assert.deepEqual(Array.from(reviewDomain.headers), [
    "review_id", "place_id", "reviewer_name", "is_anonymous", "rating", "comment",
    "admin_reply", "status", "created_at", "updated_at", "approved_at", "approved_by"
  ], `${label}: Dashboard review headers must resolve after project initialization`);
  assert.deepEqual(Array.from(reviewDomain.statuses), ["pending", "approved", "hidden", "deleted"], `${label}: Dashboard review statuses must resolve after project initialization`);
  const output = context.doGet({ parameter: { action: "getSettings" } });
  assert.equal(output.mime, "application/json", `${label}: Router must emit JSON`);
  const response = JSON.parse(output.text);
  assert.equal(response.ok, true, `${label}: public Settings read must succeed`);
  assert.deepEqual(Object.keys(response.data), allowlist, `${label}: Router must expose exactly the public allowlist`);
  assert.equal(response.data.reviews_enabled, true);
  assert.equal(response.data.events_enabled, false);
}

assert.equal(observedStagingOrder[9], "AdminSettingsService.gs", "observed staging order changed unexpectedly");
assert.equal(observedStagingOrder[27], "SettingsService.gs", "observed staging order changed unexpectedly");
assert.deepEqual(crossFileInitializerDependencies(), [], "top-level initializers must not read globals declared in another file");
assertRuntime(observedStagingOrder, "observed alphabetical staging order");
assertRuntime([...observedStagingOrder].reverse(), "reverse order");
assertRuntime([
  "AdminSettingsService.gs",
  ...observedStagingOrder.filter((name) => name !== "AdminSettingsService.gs" && name !== "SettingsService.gs"),
  "SettingsService.gs"
], "dependent-first boundary order");

process.stdout.write(`Apps Script load-order verification passed for ${observedStagingOrder.length} release files in 3 orders.\n`);
