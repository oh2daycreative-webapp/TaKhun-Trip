"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "public/js/i18n.js"), "utf8");

function element(attributes = {}, textContent = "") {
  const values = { ...attributes };
  return {
    textContent,
    classList: {
      values: new Set(),
      toggle(name, enabled) { enabled ? this.values.add(name) : this.values.delete(name); },
      contains(name) { return this.values.has(name); }
    },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null; },
    setAttribute(name, value) { values[name] = String(value); },
    matches(selector) { return selector === "[data-lang]" && values["data-lang"] !== undefined; }
  };
}

function createEnvironment({ saved = null, getError = null, setError = null } = {}) {
  const events = [];
  const storage = new Map(saved === null ? [] : [["TAKHUN_LANG", saved]]);
  const meta = element({ name: "description", content: "คำอธิบายไทย", "data-i18n-attr": "content:pages.home.description" });
  const translatable = [];
  const listeners = new Map();
  const document = {
    title: "ชื่อไทย",
    documentElement: { lang: "th" },
    readyState: "complete",
    querySelector(selector) {
      if (selector === 'meta[name="description"]') return meta;
      if (selector === "title[data-i18n]") return translatable.find((item) => item.getAttribute("data-i18n")?.endsWith(".title")) || null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-i18n]") return translatable.filter((item) => item.getAttribute("data-i18n") !== null);
      if (selector === "[data-i18n-attr]") return translatable.filter((item) => item.getAttribute("data-i18n-attr") !== null).concat(meta);
      if (selector === "[data-lang]") return translatable.filter((item) => item.getAttribute("data-lang") !== null);
      return [];
    },
    addEventListener(type, handler) { listeners.set(type, handler); },
    dispatchEvent(event) { events.push(event); return true; }
  };
  const localStorage = {
    getItem(key) { if (getError) throw getError; return storage.get(key) ?? null; },
    setItem(key, value) { if (setError) throw setError; storage.set(key, String(value)); }
  };
  const context = {
    console,
    document,
    localStorage,
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    window: null
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "i18n.js" });
  return { api: context.TakhunI18n, document, events, storage, translatable, meta, listeners };
}

function test(name, callback) {
  try { callback(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

test("exposes the central public API", () => {
  const { api } = createEnvironment();
  for (const name of ["t", "getCurrentLang", "setCurrentLang", "applyTranslations", "pickLangValue", "initI18n"]) {
    assert.equal(typeof api?.[name], "function", `${name} must be public`);
  }
});

test("defaults to Thai and restores saved English", () => {
  assert.equal(createEnvironment().api.getCurrentLang(), "th");
  assert.equal(createEnvironment({ saved: "en" }).api.getCurrentLang(), "en");
  assert.equal(createEnvironment({ saved: "invalid" }).api.getCurrentLang(), "th");
});

test("continues in memory when Local Storage getItem or setItem throws", () => {
  assert.equal(createEnvironment({ getError: new Error("blocked") }).api.getCurrentLang(), "th");
  const environment = createEnvironment({ setError: new Error("blocked") });
  assert.equal(environment.api.setCurrentLang("en"), "en");
  assert.equal(environment.api.getCurrentLang(), "en");
});

test("falls back from English to Thai and then to the key", () => {
  const { api } = createEnvironment({ saved: "en" });
  assert.equal(api.t("test.th_only"), "ข้อความสำรอง");
  assert.equal(api.t("missing.everywhere"), "missing.everywhere");
});

test("picks localized data with Thai fallback", () => {
  const { api } = createEnvironment({ saved: "en" });
  assert.equal(api.pickLangValue({ name_th: "ไทย", name_en: "English" }, "name"), "English");
  assert.equal(api.pickLangValue({ name_th: "ไทย", name_en: "" }, "name"), "ไทย");
  assert.equal(api.pickLangValue(null, "name"), "");
});

test("translates text, metadata, safe attributes and rejects unsafe attributes", () => {
  const environment = createEnvironment({ saved: "en" });
  const text = element({ "data-i18n": "nav.home" }, "หน้าแรก");
  const safe = element({ "data-i18n-attr": "aria-label:actions.back_home", "aria-label": "กลับหน้าแรก" });
  const unsafe = element({ "data-i18n-attr": "href:nav.home", href: "safe.html" });
  const malformed = element({ "data-i18n-attr": "not-a-contract" });
  environment.translatable.push(text, safe, unsafe, malformed);
  environment.api.applyTranslations(environment.document);
  assert.equal(text.textContent, "Home");
  assert.equal(safe.getAttribute("aria-label"), "Back to Home");
  assert.equal(unsafe.getAttribute("href"), "safe.html");
  assert.equal(environment.meta.getAttribute("content"), "Discover Ban Ta Khun travel experiences, routes, nature, and local communities in one place.");
  assert.equal(environment.document.documentElement.lang, "en");
});

test("updates title, language controls, persistence and dispatches one change event", () => {
  const environment = createEnvironment();
  const title = element({ "data-i18n": "pages.home.title" }, "ชื่อไทย");
  const th = element({ "data-lang": "th", "aria-pressed": "true" }, "TH");
  const en = element({ "data-lang": "en", "aria-pressed": "false" }, "EN");
  environment.translatable.push(title, th, en);
  environment.api.setCurrentLang("en");
  environment.api.applyTranslations(environment.document);
  assert.equal(environment.storage.get("TAKHUN_LANG"), "en");
  assert.equal(environment.document.title, "Takhun Trip | Explore Ban Ta Khun in One Trip");
  assert.equal(th.getAttribute("aria-pressed"), "false");
  assert.equal(en.getAttribute("aria-pressed"), "true");
  assert.equal(en.classList.contains("is-active"), true);
  assert.deepEqual(environment.events.map((event) => [event.type, event.detail.lang, event.detail.previousLang]), [["takhun:languagechange", "en", "th"]]);
  environment.api.setCurrentLang("en");
  assert.equal(environment.events.length, 1);
});

test("initializes only once", () => {
  const environment = createEnvironment();
  environment.api.initI18n();
  environment.api.initI18n();
  assert.equal(environment.listeners.size, 1);
});

process.on("exit", () => {
  if (process.exitCode) return;
  process.stdout.write("i18n behavior verification passed.\n");
});

test("all public pages declare translated metadata", () => {
  const pages = ["index.html", "map.html", "routes.html", "route-detail.html", "places.html", "place-detail.html", "trip-planner.html", "products.html", "product-detail.html", "events.html", "event-detail.html", "gallery.html", "favorites.html", "about.html", "404.html"];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, "public", page), "utf8");
    assert.match(html, /<title\s+data-i18n="pages\.[^"]+\.title"/, `${page} title`);
    assert.match(html, /meta\s+name="description"[^>]*data-i18n-attr="content:pages\.[^"]+\.description"/, `${page} description`);
  }
});
