"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const modulePath = path.join(root, "public/admin/js/admin-shell.js");
assert.ok(fs.existsSync(modulePath), "public/admin/js/admin-shell.js must exist before Admin shell contracts can run");

const source = fs.readFileSync(modulePath, "utf8");
const css = fs.readFileSync(path.join(root, "public/css/admin.css"), "utf8");
const pageFixtures = [
  ["dashboard", "ภาพรวมระบบ"],
  ["places", "จัดการสถานที่"],
  ["place-edit", "เพิ่มหรือแก้ไขสถานที่"],
  ["routes", "จัดการเส้นทาง"],
  ["products", "จัดการสินค้าและบริการ"],
  ["events", "จัดการกิจกรรม"],
  ["reviews", "จัดการรีวิว"],
  ["gallery", "จัดการแกลเลอรี"],
  ["settings", "ตั้งค่าระบบ"],
  ["404", "404 — ไม่พบหน้า Admin"]
];
const normalPageKeys = pageFixtures.slice(0, -1).map(([key]) => key).filter((key) => key !== "place-edit");
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function occurrences(value, pattern) {
  return (value.match(pattern) || []).length;
}

function minimumPixelsForSelector(cssText, selector, property) {
  let minimum = null;
  for (const match of cssText.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(",").map((value) => value.trim());
    if (!selectors.includes(selector)) continue;
    const declaration = new RegExp(`${property}\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)px`, "gi");
    for (const value of match[2].matchAll(declaration)) minimum = Number(value[1]);
  }
  return minimum;
}

function assertMinimumTarget(cssText, selector, widthRequired) {
  const height = minimumPixelsForSelector(cssText, selector, "min-height");
  assert.equal(height !== null && height >= 44, true, `${selector} must have an effective min-height of at least 44px`);
  if (widthRequired) {
    const width = minimumPixelsForSelector(cssText, selector, "min-width");
    assert.equal(width !== null && width >= 44, true, `${selector} must have an effective min-width of at least 44px`);
  }
}

function htmlFor(key) {
  return fs.readFileSync(path.join(root, `public/admin/${key}.html`), "utf8");
}

function classList(initial) {
  const values = new Set(initial || []);
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    contains(name) { return values.has(name); },
    toggle(name, force) {
      const enabled = force === undefined ? !values.has(name) : Boolean(force);
      if (enabled) values.add(name); else values.delete(name);
      return enabled;
    },
    toString() { return [...values].join(" "); }
  };
}

function makeElement(tagName, attributes) {
  const attrs = new Map(Object.entries(attributes || {}).map(([key, value]) => [key, String(value)]));
  const listeners = new Map();
  const element = {
    tagName: String(tagName || "div").toUpperCase(),
    children: [],
    parentElement: null,
    classList: classList((attrs.get("class") || "").split(/\s+/).filter(Boolean)),
    hidden: attrs.has("hidden"),
    disabled: attrs.has("disabled"),
    textContent: "",
    focused: false,
    appendChild(child) {
      if (child.parentElement && child.parentElement !== element) {
        child.parentElement.children = child.parentElement.children.filter((candidate) => candidate !== child);
      }
      child.parentElement = element;
      element.children.push(child);
      return child;
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    async dispatch(type, event) {
      const value = Object.assign({
        type,
        target: element,
        currentTarget: element,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }
      }, event || {});
      for (const listener of listeners.get(type) || []) await listener(value);
      return value;
    },
    setAttribute(name, value) {
      attrs.set(name, String(value));
      if (name === "hidden") element.hidden = true;
      if (name === "disabled") element.disabled = true;
    },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    hasAttribute(name) { return attrs.has(name); },
    removeAttribute(name) {
      attrs.delete(name);
      if (name === "hidden") element.hidden = false;
      if (name === "disabled") element.disabled = false;
    },
    focus() {
      if (element.ownerDocument) {
        if (element.ownerDocument.activeElement) element.ownerDocument.activeElement.focused = false;
        element.ownerDocument.activeElement = element;
      }
      element.focused = true;
    },
    contains(candidate) {
      if (candidate === element) return true;
      return element.children.some((child) => child.contains(candidate));
    },
    querySelectorAll(selector) {
      const matches = [];
      const selectors = selector.split(",").map((part) => part.trim());
      function isMatch(candidate) {
        return selectors.some((part) => {
          if (part === "a[href]") return candidate.tagName === "A" && candidate.hasAttribute("href");
          if (part === "button:not([disabled])") return candidate.tagName === "BUTTON" && !candidate.disabled;
          if (part === '[tabindex]:not([tabindex="-1"])') return candidate.hasAttribute("tabindex") && candidate.getAttribute("tabindex") !== "-1";
          return false;
        });
      }
      function visit(candidate) {
        if (isMatch(candidate) && !candidate.hidden) matches.push(candidate);
        candidate.children.forEach(visit);
      }
      element.children.forEach(visit);
      return matches;
    },
    _listeners: listeners,
    _attributes: attrs
  };
  return element;
}

function makeHarness(options) {
  const config = options || {};
  const elements = {
    shell: makeElement("div", { "data-admin-shell": "", hidden: "", "aria-hidden": "true" }),
    skip: makeElement("a", { "data-admin-skip": "", href: "#admin-main", hidden: "" }),
    guard: makeElement("section", { "data-admin-guard": "", role: "status" }),
    guardMessage: makeElement("p", { "data-admin-guard-message": "" }),
    retry: makeElement("button", { "data-admin-retry": "", hidden: "" }),
    login: makeElement("a", { "data-admin-login-link": "", href: "login.html", hidden: "" }),
    drawer: makeElement("aside", { "data-admin-drawer": "", id: "admin-drawer", hidden: "", "aria-hidden": "true", role: "dialog", "aria-modal": "true", "aria-label": "แถบนำทางผู้ดูแล" }),
    opener: makeElement("button", { "data-admin-drawer-open": "", "aria-expanded": "false", "aria-controls": "admin-drawer" }),
    close: makeElement("button", { "data-admin-drawer-close": "" }),
    backdrop: makeElement("div", { "data-admin-backdrop": "", hidden: "" }),
    header: makeElement("header", { "data-admin-header": "" }),
    main: makeElement("main", { "data-admin-main": "", id: "admin-main" }),
    content: makeElement("section", { "data-admin-content": "", hidden: "", "aria-hidden": "true" }),
    nav: makeElement("nav", { "data-admin-nav": "" }),
    displayName: makeElement("span", { "data-admin-display-name": "" }),
    role: makeElement("span", { "data-admin-role": "" }),
    logout: makeElement("button", { "data-admin-logout": "" }),
    publicLink: makeElement("a", { "data-admin-public-link": "", href: "../index.html" }),
    account: makeElement("div", { "data-admin-account": "" }),
    accountDesktop: makeElement("div", { "data-admin-account-desktop": "" }),
    accountMobile: makeElement("div", { "data-admin-account-mobile": "" })
  };
  elements.drawer.appendChild(elements.close);
  elements.drawer.appendChild(elements.nav);
  elements.drawer.appendChild(elements.accountMobile);
  elements.header.appendChild(elements.accountDesktop);
  elements.accountMobile.appendChild(elements.account);
  elements.account.appendChild(elements.displayName);
  elements.account.appendChild(elements.role);
  elements.account.appendChild(elements.publicLink);
  elements.account.appendChild(elements.logout);
  const selectorMap = new Map([
    ["[data-admin-shell]", elements.shell], ["[data-admin-skip]", elements.skip],
    ["[data-admin-guard]", elements.guard], ["[data-admin-guard-message]", elements.guardMessage],
    ["[data-admin-retry]", elements.retry], ["[data-admin-login-link]", elements.login],
    ["[data-admin-drawer]", elements.drawer], ["[data-admin-drawer-open]", elements.opener],
    ["[data-admin-drawer-close]", elements.close], ["[data-admin-backdrop]", elements.backdrop],
    ["[data-admin-header]", elements.header], ["[data-admin-main]", elements.main],
    ["[data-admin-content]", elements.content], ["[data-admin-nav]", elements.nav],
    ["[data-admin-display-name]", elements.displayName], ["[data-admin-role]", elements.role],
    ["[data-admin-logout]", elements.logout], ["[data-admin-public-link]", elements.publicLink],
    ["[data-admin-account]", elements.account], ["[data-admin-account-desktop]", elements.accountDesktop],
    ["[data-admin-account-mobile]", elements.accountMobile]
  ]);
  const documentListeners = new Map();
  const body = makeElement("body", { "data-admin-page": config.page || "places", class: "admin-body admin-auth-pending" });
  const document = {
    body,
    activeElement: null,
    querySelector(selector) { return selectorMap.get(selector) || null; },
    createElement(tagName) {
      const created = makeElement(tagName);
      created.ownerDocument = document;
      return created;
    },
    addEventListener(type, listener) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(listener);
    },
    async dispatch(type, event) {
      const value = Object.assign({ type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }, event || {});
      for (const listener of documentListeners.get(type) || []) await listener(value);
      return value;
    }
  };
  Object.values(elements).forEach((element) => { element.ownerDocument = document; });
  body.ownerDocument = document;
  body.appendChild(elements.skip);
  body.appendChild(elements.guard);
  body.appendChild(elements.shell);
  elements.shell.appendChild(elements.header);
  elements.shell.appendChild(elements.drawer);
  elements.shell.appendChild(elements.backdrop);
  elements.shell.appendChild(elements.main);
  elements.main.appendChild(elements.content);
  const authCalls = { guard: 0, authenticatedCallbacks: 0, retryCallbacks: 0, logout: 0 };
  const guardResults = (config.guardResults || [{ status: "authenticated", admin: { display_name: "ผู้ดูแล", role: "editor" } }]).slice();
  const auth = {
    async guardProtectedPage(callbacks) {
      authCalls.guard += 1;
      const result = config.guardDeferred
        ? await config.guardDeferred.promise
        : guardResults.shift() || { status: "unconfirmed", code: "NETWORK_ERROR" };
      if (result.status === "authenticated") {
        authCalls.authenticatedCallbacks += 1;
        callbacks.onAuthenticated(result);
      }
      if (result.status === "unconfirmed") {
        authCalls.retryCallbacks += 1;
        callbacks.onRetry(result);
      }
      return result;
    },
    async logout() {
      authCalls.logout += 1;
      if (config.logoutDeferred) return config.logoutDeferred.promise;
      return { status: "confirmed" };
    }
  };
  const media = { matches: Boolean(config.desktop), addEventListener() {} };
  const context = vm.createContext({ window: { document, TakhunAdminAuth: auth, matchMedia: () => media }, document, console });
  context.window.window = context.window;
  vm.runInContext(config.sourceOverride || source, context, { filename: "admin-shell.js" });
  return { shell: context.window.TakhunAdminShell, document, elements, authCalls };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function assertGuardPendingIsHidden(harness) {
  assert.equal(harness.elements.shell.hidden, true, "pending guard must keep the shell hidden");
  assert.equal(harness.elements.shell.getAttribute("aria-hidden"), "true", "pending shell must stay outside the accessibility tree");
  assert.equal(harness.elements.content.hidden, true, "pending guard must keep protected content hidden");
  assert.equal(harness.elements.content.getAttribute("aria-hidden"), "true", "pending content must stay outside the accessibility tree");
  assert.equal(harness.document.body.classList.contains("admin-auth-pending"), true);
  assert.equal(harness.document.body.classList.contains("admin-authenticated"), false);
  assert.equal(harness.elements.displayName.textContent, "");
  assert.equal(harness.elements.role.textContent, "");
  assert.equal(harness.elements.guard.hidden, false);
  assert.match(harness.elements.guardMessage.textContent, /กำลังตรวจสอบสิทธิ์ผู้ดูแล/);
  assert.equal(harness.elements.skip.hidden, true);
  assert.equal(harness.elements.shell.contains(harness.elements.nav), true);
  assert.equal(harness.elements.shell.contains(harness.elements.account), true);
  assert.equal(harness.elements.shell.contains(harness.elements.logout), true);
  assert.equal(harness.elements.shell.contains(harness.elements.publicLink), true);
  assert.equal(harness.authCalls.authenticatedCallbacks, 0);
}

test("all protected pages declare the source guard and one semantic shared shell contract", () => {
  for (const [key, heading] of pageFixtures) {
    const html = htmlFor(key);
    assert.match(html, new RegExp(`<body class="admin-body admin-auth-pending" data-admin-page="${key}">`));
    assert.equal(occurrences(html, /<a class="admin-skip-link"/g), 1, `${key}: skip link`);
    assert.match(html, /class="admin-skip-link"[^>]+href="#admin-main"[^>]+data-admin-skip[^>]+hidden/);
    assert.equal(occurrences(html, /<header\b/g), 1, `${key}: header`);
    assert.equal(occurrences(html, /<nav\b/g), key === "places" ? 2 : 1, `${key}: nav`);
    assert.equal(occurrences(html, /<main\b/g), 1, `${key}: main`);
    assert.equal(occurrences(html, /<h1\b/g), 1, `${key}: h1`);
    assert.match(html, new RegExp(`<h1 id="page-title" data-admin-page-title>${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h1>`));
    assert.match(html, /<div class="admin-shell" data-admin-shell hidden aria-hidden="true">/);
    assert.match(html, /<aside[^>]+data-admin-sidebar[^>]+data-admin-drawer[^>]+hidden[^>]+aria-hidden="true"/);
    assert.match(html, /<aside[^>]+data-admin-drawer[^>]+role="dialog"[^>]+aria-modal="true"[^>]+aria-label="[^"]+"/);
    assert.match(html, /<nav[^>]+data-admin-nav/);
    assert.match(html, /<section[^>]+data-admin-content[^>]+hidden[^>]+aria-hidden="true"/);
    assert.match(html, /<section[^>]+data-admin-guard[^>]+role="status"[^>]+aria-live="polite"/);
    assert.match(html, /data-admin-guard-message[^>]*>กำลังตรวจสอบสิทธิ์ผู้ดูแล/);
    assert.equal(occurrences(html, /data-admin-logout/g), 1, `${key}: logout`);
    assert.equal(occurrences(html, /data-admin-public-link/g), 1, `${key}: public link`);
    assert.match(html, /data-admin-public-link href="\.\.\/index\.html"/);
    assert.doesNotMatch(html, /(?:token|session|password)=/i);
    assert.doesNotMatch(html, /\\n/, `${key}: literal escaped newline`);
  }
});

test("all protected pages load exact dependencies in safe order and explicitly initialize the shell", () => {
  const ordered = ["../js/config.js", "js/admin-api.js", "js/admin-auth.js", "js/admin-shell.js"];
  for (const [key] of pageFixtures) {
    const html = htmlFor(key);
    const positions = ordered.map((src) => html.indexOf(`<script src="${src}" defer></script>`));
    assert.equal(positions.every((position) => position >= 0), true, `${key}: missing dependency`);
    assert.equal(positions.every((position, index) => index === 0 || positions[index - 1] < position), true, `${key}: script order`);
    if (["places", "place-edit", "products", "events"].includes(key)) {
      const content = key === "products" || key === "events";
      const controller = content ? "admin-content-ui" : key === "places" ? "admin-places" : "admin-place-edit";
      const initializer = content ? "TakhunAdminContentUI" : key === "places" ? "TakhunAdminPlaces" : "TakhunAdminPlaceEdit";
      const controllerPosition = html.indexOf(`<script src="js/${controller}.js" defer></script>`);
      assert.equal(controllerPosition > positions[positions.length - 1], true, `${key}: controller dependency`);
      assert.equal(occurrences(html, new RegExp(`${initializer}\\.init\\(\\)`, "g")), 1, `${key}: controller init invocation`);
      assert.equal(occurrences(html, /TakhunAdminShell\.init\(\)/g), 0, `${key}: shell init is controller-owned`);
    } else {
      assert.equal(occurrences(html, /TakhunAdminShell\.init\(\)/g), 1, `${key}: init invocation`);
    }
    assert.equal(html.indexOf("admin-auth-pending") < positions[0], true, `${key}: guard must precede scripts`);
  }
});

test("protected placeholders retain Milestone intent without metrics CRUD moderation or settings UI", () => {
  const forbidden = /(?:metric|analytics|chart|<table\b|<form\b|data-admin-(?:count|create|edit|delete|publish|upload)|เพิ่ม|แก้ไข|ลบ|เผยแพร่|อัปโหลด|อนุมัติรีวิว|จัดการบทบาท|language-switch)/i;
  for (const [key] of pageFixtures) {
    const html = htmlFor(key);
    if (["places", "place-edit", "products", "events"].includes(key)) continue;
    assert.match(html, /class="placeholder"/);
    if (key !== "404") assert.match(html, /หน้านี้อยู่ระหว่างการจัดเตรียม/);
    else assert.match(html, /ไม่พบหน้า Admin/);
    assert.doesNotMatch(html, forbidden, `${key}: out-of-scope UI`);
  }
});

test("module exposes only frozen init and excludes independent authentication or unsafe sinks", () => {
  const harness = makeHarness();
  assert.deepEqual(Object.keys(harness.shell), ["init"]);
  assert.equal(Object.isFrozen(harness.shell), true);
  assert.doesNotMatch(source, /localStorage|sessionStorage|\btoken\b|\bpassword\b|TakhunAdminApi|console\.|\beval\s*\(|new\s+Function|\.innerHTML|setInterval|setTimeout/i);
  assert.match(source, /TakhunAdminAuth\.guardProtectedPage/);
  assert.match(source, /TakhunAdminAuth\.logout/);
});

test("authenticated init renders safe identity as text, activates one normal route, and reveals protected content", async () => {
  const harness = makeHarness({
    page: "reviews",
    guardResults: [{ status: "authenticated", admin: { display_name: '<img src=x onerror="steal()">', role: "editor", admin_id: "ADM-SECRET", email: "secret@example.com" } }]
  });
  const result = await harness.shell.init();
  assert.equal(result.status, "authenticated");
  assert.equal(harness.elements.displayName.textContent, '<img src=x onerror="steal()">');
  assert.equal(harness.elements.role.textContent, "editor");
  assert.equal(`${harness.elements.displayName.textContent} ${harness.elements.role.textContent}`.includes("ADM-SECRET"), false);
  assert.equal(`${harness.elements.displayName.textContent} ${harness.elements.role.textContent}`.includes("secret@example.com"), false);
  assert.equal(harness.elements.shell.hidden, false);
  assert.equal(harness.elements.shell.getAttribute("aria-hidden"), "false");
  assert.equal(harness.elements.content.hidden, false);
  assert.equal(harness.elements.content.getAttribute("aria-hidden"), "false");
  assert.equal(harness.elements.guard.hidden, true);
  assert.equal(harness.elements.skip.hidden, false);
  const links = harness.elements.nav.children;
  assert.equal(links.length, 8);
  assert.deepEqual(links.map((link) => link.getAttribute("data-admin-nav-key")), normalPageKeys);
  assert.equal(links.filter((link) => link.getAttribute("aria-current") === "page").length, 1);
  assert.equal(links.find((link) => link.getAttribute("aria-current") === "page").getAttribute("href"), "reviews.html");
});

test("404 keeps all normal navigation inactive", async () => {
  const harness = makeHarness({ page: "404" });
  await harness.shell.init();
  assert.equal(harness.elements.nav.children.length, 8);
  assert.equal(harness.elements.nav.children.some((link) => link.hasAttribute("aria-current")), false);
});

test("one account block occupies the desktop header and returns to the mobile drawer", async () => {
  const desktop = makeHarness({ desktop: true });
  await desktop.shell.init();
  assert.equal(desktop.elements.account.parentElement, desktop.elements.accountDesktop);
  assert.equal(desktop.elements.drawer.hidden, false);
  assert.equal(desktop.elements.drawer.getAttribute("aria-hidden"), "false");
  await desktop.elements.opener.dispatch("click");
  assert.equal(desktop.elements.opener.getAttribute("aria-expanded"), "false");

  const mobile = makeHarness({ desktop: false });
  await mobile.shell.init();
  assert.equal(mobile.elements.account.parentElement, mobile.elements.accountMobile);
  assert.equal(mobile.elements.drawer.hidden, true);
});

test("mobile drawer exposes modal semantics while the desktop sidebar does not", async () => {
  const mobile = makeHarness({ desktop: false });
  await mobile.shell.init();
  await mobile.elements.opener.dispatch("click");
  assert.equal(mobile.elements.drawer.getAttribute("role"), "dialog");
  assert.equal(mobile.elements.drawer.getAttribute("aria-modal"), "true");
  assert.equal(mobile.elements.drawer.getAttribute("aria-label"), "แถบนำทางผู้ดูแล");

  const desktop = makeHarness({ desktop: true });
  await desktop.shell.init();
  assert.equal(desktop.elements.drawer.hasAttribute("role"), false);
  assert.equal(desktop.elements.drawer.hasAttribute("aria-modal"), false);
  assert.equal(desktop.elements.drawer.getAttribute("aria-label"), "แถบนำทางผู้ดูแล");
});

test("unconfirmed guard keeps both shell and content hidden and retry is explicit and busy-safe", async () => {
  const harness = makeHarness({
    guardResults: [
      { status: "unconfirmed", code: "NETWORK_ERROR" },
      { status: "authenticated", admin: { display_name: "ผู้ดูแลระบบ", role: "admin" } }
    ]
  });
  assert.equal((await harness.shell.init()).status, "unconfirmed");
  assert.equal(harness.elements.shell.hidden, true);
  assert.equal(harness.elements.shell.getAttribute("aria-hidden"), "true");
  assert.equal(harness.elements.content.hidden, true);
  assert.equal(harness.elements.content.getAttribute("aria-hidden"), "true");
  assert.equal(harness.elements.retry.hidden, false);
  assert.equal(harness.elements.login.hidden, false);
  assert.match(harness.elements.guardMessage.textContent, /ตรวจสอบสิทธิ์ไม่สำเร็จ/);
  const first = harness.elements.retry.dispatch("click");
  const second = harness.elements.retry.dispatch("click");
  await Promise.all([first, second]);
  assert.equal(harness.authCalls.guard, 2);
  assert.equal(harness.elements.shell.hidden, false);
  assert.equal(harness.elements.retry.disabled, false);
  assert.equal(harness.elements.retry.getAttribute("aria-busy"), "false");
});

test("an unresolved authoritative guard keeps every authenticated shell surface hidden until success", async () => {
  const guardDeferred = deferred();
  const harness = makeHarness({ guardDeferred });
  const initialization = harness.shell.init();
  await Promise.resolve();

  assertGuardPendingIsHidden(harness);

  guardDeferred.resolve({ status: "authenticated", admin: { display_name: "ผู้ดูแลภายหลัง", role: "editor" } });
  assert.equal((await initialization).status, "authenticated");
  assert.equal(harness.authCalls.authenticatedCallbacks, 1);
  assert.equal(harness.elements.shell.hidden, false);
  assert.equal(harness.elements.content.hidden, false);
  assert.equal(harness.elements.displayName.textContent, "ผู้ดูแลภายหลัง");
  assert.equal(harness.elements.role.textContent, "editor");
  assert.equal(harness.elements.guard.hidden, true);
  assert.equal(harness.document.body.classList.contains("admin-authenticated"), true);
});

test("an unresolved authoritative guard followed by a transient result never reveals protected content", async () => {
  const guardDeferred = deferred();
  const harness = makeHarness({ guardDeferred });
  const initialization = harness.shell.init();
  await Promise.resolve();

  assertGuardPendingIsHidden(harness);

  guardDeferred.resolve({ status: "unconfirmed", code: "NETWORK_ERROR" });
  assert.equal((await initialization).status, "unconfirmed");
  assert.equal(harness.authCalls.authenticatedCallbacks, 0);
  assert.equal(harness.authCalls.retryCallbacks, 1);
  assert.equal(harness.elements.shell.hidden, true);
  assert.equal(harness.elements.content.hidden, true);
  assert.equal(harness.elements.retry.hidden, false);
  assert.equal(harness.elements.login.hidden, false);
});

test("pending-state assertions reject an executable premature-reveal mutation", async () => {
  const mutantSource = source.replace(
    /showPending\(\);\r?\n    try \{/,
    'showPending();\n    showAuthenticated({ admin: { display_name: "premature", role: "mutant" } });\n    try {'
  );
  assert.notEqual(mutantSource, source, "premature-reveal mutation must be installed");
  const guardDeferred = deferred();
  const harness = makeHarness({ guardDeferred, sourceOverride: mutantSource });
  const initialization = harness.shell.init();
  await Promise.resolve();

  let pendingAssertionReached = false;
  assert.throws(() => {
    pendingAssertionReached = true;
    assertGuardPendingIsHidden(harness);
  }, /pending guard must keep the shell hidden/);
  assert.equal(pendingAssertionReached, true);

  guardDeferred.resolve({ status: "authenticated", admin: { display_name: "ภายหลัง", role: "editor" } });
  await initialization;
});

test("mobile drawer synchronizes ARIA overlay scroll focus and traps Tab in both directions", async () => {
  const harness = makeHarness();
  await harness.shell.init();
  await harness.elements.opener.dispatch("click");
  assert.equal(harness.elements.opener.getAttribute("aria-expanded"), "true");
  assert.equal(harness.elements.drawer.hidden, false);
  assert.equal(harness.elements.drawer.getAttribute("aria-hidden"), "false");
  assert.equal(harness.elements.backdrop.hidden, false);
  assert.equal(harness.document.body.classList.contains("admin-drawer-open"), true);
  assert.equal(harness.elements.header.hasAttribute("inert"), true);
  assert.equal(harness.elements.main.hasAttribute("inert"), true);
  assert.equal(harness.document.activeElement, harness.elements.close);

  const focusables = harness.elements.drawer.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  last.focus();
  const forward = await harness.document.dispatch("keydown", { key: "Tab", shiftKey: false });
  assert.equal(forward.defaultPrevented, true);
  assert.equal(harness.document.activeElement, first);
  first.focus();
  const reverse = await harness.document.dispatch("keydown", { key: "Tab", shiftKey: true });
  assert.equal(reverse.defaultPrevented, true);
  assert.equal(harness.document.activeElement, last);
});

test("mobile drawer makes every background focus region inert and restores it on close", async () => {
  const harness = makeHarness();
  await harness.shell.init();
  assert.equal(harness.elements.skip.hasAttribute("inert"), false);
  await harness.elements.opener.dispatch("click");
  assert.equal(harness.elements.skip.hasAttribute("inert"), true);
  assert.equal(harness.elements.header.hasAttribute("inert"), true);
  assert.equal(harness.elements.main.hasAttribute("inert"), true);
  await harness.elements.close.dispatch("click");
  assert.equal(harness.elements.skip.hasAttribute("inert"), false);
  assert.equal(harness.elements.header.hasAttribute("inert"), false);
  assert.equal(harness.elements.main.hasAttribute("inert"), false);
});

test("mobile drawer recaptures forward and reverse Tab when focus starts outside", async () => {
  const harness = makeHarness();
  await harness.shell.init();
  await harness.elements.opener.dispatch("click");
  const focusables = harness.elements.drawer.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  harness.elements.skip.focus();
  const forward = await harness.document.dispatch("keydown", { key: "Tab", shiftKey: false });
  assert.equal(forward.defaultPrevented, true);
  assert.equal(harness.document.activeElement, first);

  harness.elements.skip.focus();
  const reverse = await harness.document.dispatch("keydown", { key: "Tab", shiftKey: true });
  assert.equal(reverse.defaultPrevented, true);
  assert.equal(harness.document.activeElement, last);
});

test("drawer closes on Escape backdrop and nav activation, restores focus, and ignores closed Escape and inside clicks", async () => {
  const harness = makeHarness();
  await harness.shell.init();
  const closedEscape = await harness.document.dispatch("keydown", { key: "Escape" });
  assert.equal(closedEscape.defaultPrevented, false);
  await harness.elements.opener.dispatch("click");
  await harness.elements.drawer.dispatch("click");
  assert.equal(harness.elements.drawer.hidden, false);
  const escape = await harness.document.dispatch("keydown", { key: "Escape" });
  assert.equal(escape.defaultPrevented, true);
  assert.equal(harness.elements.drawer.hidden, true);
  assert.equal(harness.elements.opener.getAttribute("aria-expanded"), "false");
  assert.equal(harness.elements.backdrop.hidden, true);
  assert.equal(harness.document.body.classList.contains("admin-drawer-open"), false);
  assert.equal(harness.elements.header.hasAttribute("inert"), false);
  assert.equal(harness.elements.main.hasAttribute("inert"), false);
  assert.equal(harness.document.activeElement, harness.elements.opener);

  await harness.elements.opener.dispatch("click");
  await harness.elements.backdrop.dispatch("click");
  assert.equal(harness.elements.drawer.hidden, true);
  assert.equal(harness.document.activeElement, harness.elements.opener);

  await harness.elements.opener.dispatch("click");
  await harness.elements.nav.children[0].dispatch("click");
  assert.equal(harness.elements.drawer.hidden, true);
});

test("focus trap handles a single focusable drawer control and is inactive while closed", async () => {
  const harness = makeHarness();
  await harness.shell.init();
  harness.elements.nav.children.forEach((link) => { link.hidden = true; });
  harness.elements.publicLink.hidden = true;
  harness.elements.logout.hidden = true;
  await harness.elements.opener.dispatch("click");
  harness.elements.close.focus();
  const trapped = await harness.document.dispatch("keydown", { key: "Tab", shiftKey: false });
  assert.equal(trapped.defaultPrevented, true);
  assert.equal(harness.document.activeElement, harness.elements.close);
  await harness.elements.close.dispatch("click");
  const untrapped = await harness.document.dispatch("keydown", { key: "Tab", shiftKey: false });
  assert.equal(untrapped.defaultPrevented, false);
});

test("logout delegates once while busy without reading authentication material", async () => {
  const logoutDeferred = deferred();
  const harness = makeHarness({ logoutDeferred });
  await harness.shell.init();
  const first = harness.elements.logout.dispatch("click");
  const second = harness.elements.logout.dispatch("click");
  await Promise.resolve();
  assert.equal(harness.authCalls.logout, 1);
  assert.equal(harness.elements.logout.disabled, true);
  assert.equal(harness.elements.logout.getAttribute("aria-busy"), "true");
  logoutDeferred.resolve({ status: "confirmed" });
  await Promise.all([first, second]);
});

test("Admin CSS provides source hiding, desktop and mobile layouts, touch targets, focus and reduced motion", () => {
  assert.match(css, /\.admin-auth-pending\s+\[data-admin-shell\][^{]*\{[^}]*display:\s*none\s*!important/i);
  assert.match(css, /\[data-admin-shell\]\[aria-hidden="true"\][^{]*\{[^}]*display:\s*none\s*!important/i);
  assert.match(css, /\.admin-shell__sidebar/);
  assert.match(css, /\.admin-shell__backdrop/);
  assert.match(css, /\.admin-nav__link\[aria-current="page"\][^{]*\{[^}]*(?:font-weight|border|box-shadow)/i);
  assert.match(css, /\.admin-drawer-toggle[^{]*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/i);
  assert.match(css, /\.admin-logout[^{]*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/i);
  assert.match(css, /\.admin-nav__link[^{]*\{[^}]*min-height:\s*44px/i);
  assert.match(css, /\.admin-shell[^\n]*:focus-visible/);
  assert.match(css, /@media\s*\(max-width:\s*899px\)/i);
  assert.match(css, /@media\s*\(min-width:\s*900px\)/i);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i);
  assert.match(css, /prefers-reduced-motion[^}]+transition:\s*none\s*!important/is);
});

test("each required Admin shell control has its own applicable minimum target rule", () => {
  assertMinimumTarget(css, ".admin-drawer-toggle", true);
  assertMinimumTarget(css, ".admin-drawer-close", true);
  assertMinimumTarget(css, ".admin-logout", true);
  assertMinimumTarget(css, ".admin-nav__link", false);
});

test("drawer-close target assertions reject removal from the shared 44px sizing rule", () => {
  const mutantCss = css.replace(
    /\.admin-drawer-toggle,\s*\.admin-drawer-close(?=\s*\{)/,
    ".admin-drawer-toggle"
  );
  assert.notEqual(mutantCss, css, "drawer-close sizing mutation must be installed");
  assertMinimumTarget(mutantCss, ".admin-drawer-toggle", true);
  assertMinimumTarget(mutantCss, ".admin-logout", true);
  assertMinimumTarget(mutantCss, ".admin-nav__link", false);
  assert.throws(
    () => assertMinimumTarget(mutantCss, ".admin-drawer-close", true),
    /\.admin-drawer-close must have an effective min-height of at least 44px/
  );
});

test("Admin focus indicators use surface-specific high-contrast outlines", () => {
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  function declarationsFor(selector) {
    const block = blocks.find((match) => match[1].split(",").map((value) => value.trim()).includes(selector));
    return block ? block[2] : "";
  }

  for (const selector of [
    ".admin-shell__header a:focus-visible",
    ".admin-shell__header button:focus-visible",
    ".admin-main a:focus-visible",
    ".admin-main button:focus-visible",
    ".admin-guard a:focus-visible",
    ".admin-guard button:focus-visible",
    ".admin-skip-link:focus-visible"
  ]) {
    assert.match(declarationsFor(selector), /outline:\s*3px solid var\(--color-primary-dark\)/, `${selector}: dark outline on light surface`);
  }
  for (const selector of [
    ".admin-shell__sidebar a:focus-visible",
    ".admin-shell__sidebar button:focus-visible"
  ]) {
    assert.match(declarationsFor(selector), /outline:\s*3px solid var\(--color-accent\)/, `${selector}: accent outline on dark drawer`);
  }
});

(async () => {
  let failures = 0;
  for (const entry of tests) {
    try {
      await entry.fn();
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${entry.name}`);
      console.error(error && error.stack ? error.stack : error);
    }
  }
  if (failures) {
    console.error(`Admin shell verification failed: ${failures} of ${tests.length} tests.`);
    process.exitCode = 1;
  } else {
    console.log(`Admin shell verification passed: ${tests.length} tests across ${pageFixtures.length} protected pages.`);
  }
})();
