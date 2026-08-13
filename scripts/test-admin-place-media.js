"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const modulePath = path.join(root, "public/admin/js/admin-place-media.js");
assert.ok(fs.existsSync(modulePath), "Task 14 media module must exist");
const source = fs.readFileSync(modulePath, "utf8");
const editorSource = fs.readFileSync(path.join(root, "public/admin/js/admin-place-edit.js"), "utf8");
const editorPage = fs.readFileSync(path.join(root, "public/admin/place-edit.html"), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function element(tag = "div") {
  const listeners = new Map();
  return {
    tagName: tag.toUpperCase(), children: [], dataset: {}, attributes: {}, hidden: false, disabled: false,
    textContent: "", className: "", parentNode: null,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; },
    removeAttribute(name) { delete this.attributes[name]; },
    append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } },
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); },
    addEventListener(name, listener) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(listener); },
    async fire(name) { for (const listener of listeners.get(name) || []) await listener({ preventDefault() {} }); },
    querySelectorAll(selector) {
      const result = [];
      const visit = (node) => { for (const child of node.children || []) { if (selector === "button" && child.tagName === "BUTTON") result.push(child); visit(child); } };
      visit(this); return result;
    }
  };
}

function media(media_id, role = "gallery", entity_id = "PLC-A", overrides = {}) {
  return {
    media_id, entity_type: "place", entity_id, role, alt_th: `ภาพ ${media_id}`, alt_en: media_id,
    fallback: role === "cover" ? "assets/media/placeholders/cover.svg" : "assets/media/placeholders/gallery.svg",
    outputs: [{ width: 640, height: 427, path: `assets/media/generated/places/${media_id}-640.webp` }], ...overrides
  };
}

function load() {
  const document = { createElement: (tag) => element(tag) };
  const window = { document }; window.window = window;
  vm.runInContext(source, vm.createContext({ window }), { filename: "admin-place-media.js" });
  return { api: window.TakhunAdminPlaceMedia, document };
}

function mounts() {
  return {
    root: element(), hero: element(), options: element(), selected: element(), status: element(),
    searchForm: element(), searchInput: element("input"), searchButton: element("button"),
    previous: element("button"), next: element("button"), page: element()
  };
}

async function test(name, fn) {
  try { await fn(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

(async () => {
  await test("module exposes one frozen narrow interface and contains no auth transport or unsafe sink", () => {
    const { api } = load();
    assert.deepEqual(Object.keys(api), ["init"]);
    assert.equal(Object.isFrozen(api), true);
    assert.doesNotMatch(source, /\bfetch\s*\(|localStorage|sessionStorage|innerHTML|createPlace|savePlaceDraft|publishPlace|token/i);
    assert.match(source, /textContent/);
  });

  await test("editor owns Create gating and sends only selector ordered IDs through its existing Save flow", () => {
    assert.match(editorPage, /admin-place-media\.js/);
    assert.match(editorPage, /data-admin-place-media-hero/);
    assert.match(editorPage, /data-admin-place-media-options/);
    assert.match(editorPage, /data-admin-place-media-selected/);
    assert.doesNotMatch(editorPage, /type="(?:url|file)"[^>]*(?:hero|gallery)|(?:hero|gallery)[^>]*type="(?:url|file)"/i);
    assert.match(editorSource, /state\.mediaComponent\s*\?\s*state\.mediaComponent\.getSelected\(\)/);
    assert.match(editorSource, /content\[key\]\s*=\s*ids\.length\s*\?\s*ids\s*:\s*""/);
    assert.match(editorSource, /mode:state\.mode,\s*placeId:state\.placeId/);
    assert.match(editorSource, /getPlaceMediaOptions\(token,payload\)/);
    assert.doesNotMatch(editorSource, /\bfetch\s*\(/);
  });

  await test("bare Create mode never loads options and exposes derived unavailable Hero and Gallery states", async () => {
    const { api } = load(); const nodes = mounts(); let loads = 0;
    const component = await api.init({ mode: "create", placeId: "", selectedIds: [], mounts: nodes, loadOptions: async () => { loads += 1; return { items: [] }; } });
    assert.equal(loads, 0);
    assert.deepEqual(plain(component.getSelected()), []);
    assert.match(nodes.hero.textContent, /สร้างสถานที่|บันทึก/i);
    assert.match(nodes.status.textContent, /สร้างสถานที่|ยังไม่พร้อม/i);
    assert.equal(nodes.options.hidden, true);
    for (const node of [nodes.searchForm, nodes.previous, nodes.next, nodes.page]) assert.equal(node.hidden, true);
    for (const control of [nodes.searchInput, nodes.searchButton, nodes.previous, nodes.next]) assert.equal(control.disabled, true);
  });

  await test("Edit loads once, shows same-Place derived cover, reflects Draft order and safely filters options", async () => {
    const { api } = load(); const nodes = mounts(); const calls = [];
    const component = await api.init({
      mode: "edit", placeId: "PLC-A", hero: media("place-plc-a-cover", "cover"), selectedIds: ["place-plc-a-gallery-b"], mounts: nodes,
      loadOptions: async (payload) => { calls.push(payload); return { items: [
        media("place-plc-a-gallery-b"), media("place-plc-a-gallery-a"),
        media("place-plc-other-gallery", "gallery", "PLC-OTHER"), media("place-plc-a-bad-role", "cover")
      ], page: 1, page_size: 20, total: 4, total_pages: 1 }; }
    });
    assert.deepEqual(plain(calls), [{ place_id: "PLC-A", role: "gallery", page: 1, page_size: 20 }]);
    assert.match(nodes.hero.children[0].textContent, /place-plc-a-cover/);
    assert.equal(nodes.hero.children[1].src, "assets/media/generated/places/place-plc-a-cover-640.webp");
    assert.deepEqual(plain(component.getSelected()), ["place-plc-a-gallery-b"]);
    assert.equal(nodes.options.textContent.includes("PLC-OTHER"), false);
    assert.equal(nodes.options.querySelectorAll("button").every((button) => button.getAttribute("aria-label") && !button.innerHTML), true);
    assert.equal(nodes.options.children.every((button) => button.children[0].src.startsWith("assets/media/generated/places/")), true);
    for (const node of [nodes.searchForm, nodes.previous, nodes.next, nodes.page]) assert.equal(node.hidden, false);
    assert.equal(nodes.searchInput.disabled, false);
    assert.equal(nodes.searchButton.disabled, false);
  });

  await test("Gallery add remove and keyboard buttons preserve visible request order without duplicates", async () => {
    const { api } = load(); const nodes = mounts();
    const component = await api.init({ mode: "edit", placeId: "PLC-A", selectedIds: ["gallery-b"], mounts: nodes,
      loadOptions: async () => ({ items: [media("gallery-a"), media("gallery-b"), media("gallery-c")], page: 1, page_size: 100, total: 3, total_pages: 1 }) });
    assert.equal(component.add("gallery-a"), true);
    assert.equal(component.add("gallery-a"), false);
    assert.equal(component.add("unknown-gallery"), false);
    assert.deepEqual(plain(component.getSelected()), ["gallery-b", "gallery-a"]);
    assert.equal(component.move("gallery-a", -1), true);
    assert.deepEqual(plain(component.getSelected()), ["gallery-a", "gallery-b"]);
    assert.equal(component.move("gallery-a", -1), false);
    assert.equal(component.remove("gallery-a"), true);
    assert.deepEqual(plain(component.getSelected()), ["gallery-b"]);
    assert.match(nodes.status.textContent, /1.*50/);
  });

  await test("Gallery enforces the 50-item limit and treats malicious labels as text", async () => {
    const { api } = load(); const nodes = mounts();
    const items = Array.from({ length: 51 }, (_value, index) => media(`gallery-${index + 1}`, "gallery", "PLC-A", index === 0 ? { alt_th: "<img src=x onerror=alert(1)>" } : {}));
    const component = await api.init({ mode: "edit", placeId: "PLC-A", selectedIds: items.slice(0, 50).map((item) => item.media_id), mounts: nodes,
      loadOptions: async () => ({ items, page: 1, page_size: 100, total: 51, total_pages: 1 }) });
    assert.equal(component.add("gallery-51"), false);
    assert.equal(component.getSelected().length, 50);
    assert.match(nodes.status.textContent, /50.*50/);
    const renderedText = (node) => [node.textContent, ...(node.children || []).map(renderedText)].join(" ");
    assert.equal(renderedText(nodes.root).includes("onerror"), false);
    assert.equal(renderedText(nodes.options).includes("<img src=x onerror=alert(1)>"), true, "fixture must reach text-only rendering");
  });

  await test("Gallery search pagination empty and failure states use the explicit media loader only", async () => {
    const { api } = load(); const nodes = mounts(); const calls = [];
    const pages = [
      { items: [media("gallery-a")], page: 1, page_size: 20, total: 21, total_pages: 2 },
      { items: [media("gallery-b")], page: 2, page_size: 20, total: 21, total_pages: 2 },
      { items: [], page: 1, page_size: 20, total: 0, total_pages: 0 }
    ];
    const component = await api.init({ mode: "edit", placeId: "PLC-A", selectedIds: [], mounts: nodes,
      loadOptions: async (payload) => { calls.push(payload); const next = pages.shift(); if (!next) throw new Error("private failure"); return next; } });
    assert.equal(await component.next(), true);
    assert.equal(await component.search("waterfall"), true);
    assert.equal(nodes.root.getAttribute("data-media-state"), "empty");
    assert.equal(await component.search("retry"), false);
    assert.equal(nodes.root.getAttribute("data-media-state"), "error");
    assert.match(nodes.status.textContent, /ไม่สามารถโหลด/);
    assert.throws(() => component.getSelected(), /MEDIA_OPTIONS_UNAVAILABLE/);
    assert.deepEqual(plain(calls), [
      { place_id: "PLC-A", role: "gallery", page: 1, page_size: 20 },
      { place_id: "PLC-A", role: "gallery", page: 2, page_size: 20 },
      { place_id: "PLC-A", role: "gallery", page: 1, page_size: 20, keyword: "waterfall" },
      { place_id: "PLC-A", role: "gallery", page: 1, page_size: 20, keyword: "retry" }
    ]);
  });

  await test("reinitializing after an authoritative reload leaves only the latest media controls active", async () => {
    const { api } = load();
    const nodes = {
      ...mounts(),
      searchInput: element("input"), searchButton: element("button"),
      previous: element("button"), next: element("button"), page: element()
    };
    const firstCalls = [];
    const secondCalls = [];
    await api.init({
      mode: "edit", placeId: "PLC-A", selectedIds: [], mounts: nodes,
      loadOptions: async (payload) => {
        firstCalls.push(payload);
        return { items: [], page: payload.page, page_size: 20, total: 0, total_pages: 0 };
      }
    });
    await api.init({
      mode: "edit", placeId: "PLC-A", selectedIds: [], mounts: nodes,
      loadOptions: async (payload) => {
        secondCalls.push(payload);
        return { items: [], page: payload.page, page_size: 20, total: 0, total_pages: 0 };
      }
    });
    nodes.searchInput.value = "waterfall";
    await nodes.searchButton.fire("click");
    assert.deepEqual(plain(firstCalls), [
      { place_id: "PLC-A", role: "gallery", page: 1, page_size: 20 }
    ], "a superseded component must not issue another media read");
    assert.deepEqual(plain(secondCalls), [
      { place_id: "PLC-A", role: "gallery", page: 1, page_size: 20 },
      { place_id: "PLC-A", role: "gallery", page: 1, page_size: 20, keyword: "waterfall" }
    ]);
  });

  await test("a superseded media response cannot overwrite the latest authoritative reload", async () => {
    const { api } = load();
    const nodes = mounts();
    let resolveFirst;
    const firstInit = api.init({
      mode: "edit", placeId: "PLC-A", selectedIds: [], mounts: nodes,
      loadOptions: () => new Promise((resolve) => { resolveFirst = resolve; })
    });
    assert.equal(typeof resolveFirst, "function");
    await api.init({
      mode: "edit", placeId: "PLC-A", selectedIds: [], mounts: nodes,
      loadOptions: async () => ({
        items: [media("gallery-current")], page: 1, page_size: 20, total: 1, total_pages: 1
      })
    });
    assert.match(nodes.options.children[0].getAttribute("aria-label"), /gallery-current/);
    resolveFirst({ items: [media("gallery-stale")], page: 1, page_size: 20, total: 1, total_pages: 1 });
    await firstInit;
    assert.match(nodes.options.children[0].getAttribute("aria-label"), /gallery-current/);
    assert.doesNotMatch(nodes.options.children[0].getAttribute("aria-label"), /gallery-stale/);
  });

  await test("within one selector the newest search response wins over an older pending response", async () => {
    const { api } = load();
    const nodes = mounts();
    let resolveOlder;
    const component = await api.init({
      mode: "edit", placeId: "PLC-A", selectedIds: [], mounts: nodes,
      loadOptions: async (payload) => {
        if (!payload.keyword) return { items: [], page: 1, page_size: 20, total: 0, total_pages: 0 };
        if (payload.keyword === "older") return new Promise((resolve) => { resolveOlder = resolve; });
        return { items: [media("gallery-newest")], page: 1, page_size: 20, total: 1, total_pages: 1 };
      }
    });
    const older = component.search("older");
    assert.equal(typeof resolveOlder, "function");
    assert.equal(await component.search("newest"), true);
    assert.match(nodes.options.children[0].getAttribute("aria-label"), /gallery-newest/);
    resolveOlder({ items: [media("gallery-older")], page: 1, page_size: 20, total: 1, total_pages: 1 });
    assert.equal(await older, false);
    assert.match(nodes.options.children[0].getAttribute("aria-label"), /gallery-newest/);
    assert.doesNotMatch(nodes.options.children[0].getAttribute("aria-label"), /gallery-older/);
  });

  await test("within one selector a superseded request error cannot replace the newest ready state", async () => {
    const { api } = load();
    const nodes = mounts();
    let rejectOlder;
    const component = await api.init({
      mode: "edit", placeId: "PLC-A", selectedIds: [], mounts: nodes,
      loadOptions: async (payload) => {
        if (!payload.keyword) return { items: [], page: 1, page_size: 20, total: 0, total_pages: 0 };
        if (payload.keyword === "older") return new Promise((_resolve, reject) => { rejectOlder = reject; });
        return { items: [media("gallery-newest")], page: 1, page_size: 20, total: 1, total_pages: 1 };
      }
    });
    const older = component.search("older");
    assert.equal(typeof rejectOlder, "function");
    assert.equal(await component.search("newest"), true);
    rejectOlder(new Error("private stale failure"));
    assert.equal(await older, false);
    assert.equal(nodes.root.getAttribute("data-media-state"), "ready");
    assert.deepEqual(plain(component.getSelected()), []);
    assert.match(nodes.options.children[0].getAttribute("aria-label"), /gallery-newest/);
  });
})();
