"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourcePath = path.join(__dirname, "../public/js/about.js");
assert.equal(fs.existsSync(sourcePath), true, "missing public/js/about.js");
const source = fs.readFileSync(sourcePath, "utf8");
const html = fs.readFileSync(path.join(__dirname, "../public/about.html"), "utf8");

assert.doesNotMatch(html, /data-about-hero-image/, "About must not keep a competing static hero image");
assert.match(html, /class="about-page__hero-media" aria-hidden="true"/);
assert.match(html, /data-about-hero-fallback/);
assert.equal((source.match(/fetchPriority:\s*"high"/g) || []).length, 1);
assert.match(source, /mediaIdFor\("shared", "shared-about-project"\)/);
assert.match(source, /decorative:\s*true[\s\S]*?loading:\s*"eager"[\s\S]*?fetchPriority:\s*"high"[\s\S]*?sizes:\s*"100vw"/);
assert.doesNotMatch(source, /renderImage\([\s\S]*?hero_image_url/);

function loadAbout() {
  const context = {
    URL, console,
    document: { readyState: "loading", addEventListener() {}, querySelector() { return null; } },
    window: null
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "about.js" });
  return context.TakhunAbout;
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const api = loadAbout();

for (const name of [
  "normalizeSettingsResponse", "localizedSlogan", "safeHttpUrl", "safeImageUrl",
  "safePhoneHref", "safeEmail", "mailtoUrl", "hasContact", "sectionVisibility",
  "normalizeState", "isEmptySettings", "createRequestGate", "createAboutController", "mockSettings"
]) assert.equal(typeof api[name], "function", `missing helper ${name}`);

{
  const input = {
    site_name: " Takhun Trip ", site_slogan_th: " เที่ยวตาขุน ", site_slogan_en: " Discover ",
    main_phone: " 077 123 456 ", main_email: " hello@example.com ", facebook_url: "https://facebook.com/takhun",
    line_url: "https://line.me/ti/p/example", logo_url: "https://cdn.example/logo.png", hero_image_url: "https://cdn.example/hero.jpg",
    reviews_enabled: true, events_enabled: "true", unknown_field: "must disappear"
  };
  const snapshot = JSON.stringify(input);
  const normalized = plain(api.normalizeSettingsResponse(input));
  assert.equal(JSON.stringify(input), snapshot);
  assert.deepEqual(normalized, {
    site_name: "Takhun Trip", site_slogan_th: "เที่ยวตาขุน", site_slogan_en: "Discover",
    main_phone: "077 123 456", main_email: "hello@example.com", facebook_url: "https://facebook.com/takhun",
    line_url: "https://line.me/ti/p/example", logo_url: "https://cdn.example/logo.png", hero_image_url: "https://cdn.example/hero.jpg",
    reviews_enabled: true, events_enabled: true
  });
  assert.throws(() => api.normalizeSettingsResponse([]), (error) => error?.code === "MALFORMED_RESPONSE");
}

assert.equal(api.localizedSlogan({ site_slogan_th: "ไทย", site_slogan_en: "English" }, "th"), "ไทย");
assert.equal(api.localizedSlogan({ site_slogan_th: "ไทย", site_slogan_en: "English" }, "en"), "English");
assert.equal(api.localizedSlogan({ site_slogan_th: "", site_slogan_en: "English" }, "th"), "English");
assert.equal(api.localizedSlogan({ site_slogan_th: "ไทย", site_slogan_en: "" }, "en"), "ไทย");
assert.equal(api.localizedSlogan({}, "en"), "");

for (const value of ["https://example.com/path", "http://example.com/path"]) {
  assert.equal(api.safeHttpUrl(value), value);
  assert.equal(api.safeImageUrl(value), value);
}
for (const value of ["javascript:alert(1)", "data:text/html,x", "ftp://example.com/x", "file:///tmp/x", "/relative", ""]) {
  assert.equal(api.safeHttpUrl(value), "");
  assert.equal(api.safeImageUrl(value), "");
}

assert.equal(api.safePhoneHref("+66 (0)77-123-456"), "tel:+66077123456");
assert.equal(api.safePhoneHref("077 123 456"), "tel:077123456");
for (const value of ["call-me", "077123456;alert(1)", "javascript:1", "+1\n555", "123"]) assert.equal(api.safePhoneHref(value), "");

assert.equal(api.safeEmail(" Hello.User+trip@example.co.th "), "Hello.User+trip@example.co.th");
assert.equal(api.mailtoUrl("hello@example.com"), "mailto:hello%40example.com");
for (const value of ["bad", "a@@example.com", "a b@example.com", "a@example", "a@example.com\nBcc:x@y.com"]) {
  assert.equal(api.safeEmail(value), "");
  assert.equal(api.mailtoUrl(value), "");
}

assert.equal(api.hasContact({ main_phone: "077 123 456" }), true);
assert.equal(api.hasContact({ main_email: "hello@example.com" }), true);
assert.equal(api.hasContact({ facebook_url: "javascript:bad" }), false);
assert.equal(api.hasContact({}), false);
assert.deepEqual(plain(api.sectionVisibility({ main_phone: "077 123 456", hero_image_url: "javascript:bad" })), { contact: true, heroImage: false });

for (const state of ["initial", "loading", "ready", "empty", "error", "malformed-response"]) assert.equal(api.normalizeState(state), state);
assert.equal(api.normalizeState("unknown"), "error");
assert.equal(api.isEmptySettings({}), true);
assert.equal(api.isEmptySettings({ reviews_enabled: true }), true);
assert.equal(api.isEmptySettings({ site_name: "Takhun Trip" }), false);

{
  const gate = api.createRequestGate();
  const first = gate.begin();
  const second = gate.begin();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
}

async function controllerTests() {
  {
    let calls = 0;
    const changes = [];
    const controller = api.createAboutController(async () => { calls += 1; return { site_name: "Takhun Trip", site_slogan_th: "ไทย", site_slogan_en: "English" }; }, (snapshot) => changes.push(plain(snapshot)));
    assert.equal(controller.getSnapshot().state, "initial");
    await controller.load();
    assert.equal(controller.getSnapshot().state, "ready");
    assert.equal(calls, 1);
    controller.setLanguage("en");
    assert.equal(controller.getSnapshot().slogan, "English");
    assert.equal(calls, 1, "language render must not call API again");
    await controller.retry();
    assert.equal(calls, 2, "retry must call API again");
    assert.ok(changes.some((entry) => entry.state === "loading"));
  }

  {
    const empty = api.createAboutController(async () => ({}));
    await empty.load();
    assert.equal(empty.getSnapshot().state, "empty");
    const malformed = api.createAboutController(async () => []);
    await malformed.load();
    assert.equal(malformed.getSnapshot().state, "malformed-response");
    const failed = api.createAboutController(async () => { throw new Error("secret internal detail"); });
    await failed.load();
    assert.equal(failed.getSnapshot().state, "error");
  }

  {
    const pending = [];
    const controller = api.createAboutController(() => new Promise((resolve) => pending.push(resolve)));
    const first = controller.load();
    const second = controller.retry();
    pending[1]({ site_name: "Newest" });
    await second;
    pending[0]({ site_name: "Stale" });
    await first;
    assert.equal(controller.getSnapshot().settings.site_name, "Newest");
  }

  process.stdout.write("About behavior verification passed.\n");
}

controllerTests().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
