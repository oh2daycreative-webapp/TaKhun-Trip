"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const modulePath = path.join(root, "public/admin/js/admin-place-map.js");
const editorPath = path.join(root, "public/admin/js/admin-place-edit.js");
const page = fs.readFileSync(path.join(root, "public/admin/place-edit.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public/css/admin-places.css"), "utf8");
const tests = [];

function test(name, fn) { tests.push({ name, fn }); }
function element(attributes = {}) {
  const listeners = new Map();
  return {
    value:"", hidden:false, disabled:false, checked:false, valid:true, validationMessage:"", textContent:"", href:"", target:"", rel:"", style:{}, attributes,
    addEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).concat(fn)); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; },
    setCustomValidity(message) { this.validationMessage = String(message); this.valid = !this.validationMessage; },
    async fire(type, extra = {}) { const event = Object.assign({ preventDefault() {} }, extra); for (const fn of listeners.get(type) || []) await fn(event); return event; },
    focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  };
}
function leaflet() {
  const calls = { maps:[], markers:[], tiles:[] };
  return { calls, api: {
    map(node) {
      const handlers = new Map();
      const map = {
        node, center:null, zoom:null, removed:false,
        setView(center, zoom) { this.center = center; this.zoom = zoom; return this; },
        panTo(center) { this.center = center; return this; },
        on(type, fn) { handlers.set(type, fn); return this; },
        fire(type, event) { return handlers.get(type)?.(event); },
        remove() { this.removed = true; }
      };
      calls.maps.push(map);
      return map;
    },
    tileLayer(url, options) { return { url, options, addTo(map) { this.map = map; calls.tiles.push(this); return this; } }; },
    marker(center, options) {
      const handlers = new Map();
      const marker = {
        center, options, map:null,
        setLatLng(next) { this.center = next; return this; },
        getLatLng() { return { lat:this.center[0], lng:this.center[1] }; },
        addTo(map) { this.map = map; calls.markers.push(this); return this; },
        on(type, fn) { handlers.set(type, fn); return this; },
        fire(type) { return handlers.get(type)?.(); },
        remove() { this.removed = true; }
      };
      return marker;
    }
  } };
}
function mapWindow(leafletApi) {
  const navigator = new Proxy({}, {
    get(target, name, receiver) { if (name === "geolocation") throw new Error("map accessed navigator.geolocation"); return Reflect.get(target, name, receiver); },
    has(target, name) { if (name === "geolocation") throw new Error("map inspected navigator.geolocation"); return Reflect.has(target, name); }
  });
  const forbidden = new Set(["TakhunAdminApi", "createPlace", "savePlaceDraft", "publishPlace"]);
  const target = { L:leafletApi, navigator, window:null };
  const window = new Proxy(target, {
    get(object, name, receiver) { if (forbidden.has(name)) throw new Error(`map accessed ${String(name)}`); return Reflect.get(object, name, receiver); },
    has(object, name) { if (forbidden.has(name)) throw new Error(`map inspected ${String(name)}`); return Reflect.has(object, name); }
  });
  target.window = window;
  return window;
}
function load(options = {}) {
  const source = fs.readFileSync(modulePath, "utf8");
  const latitudeInput = element(), longitudeInput = element();
  const mapElement = element({ "aria-label":"Coordinate picker map" }), statusElement = element(), openLink = element();
  latitudeInput.value = options.latitude ?? "";
  longitudeInput.value = options.longitude ?? "";
  const fixture = options.leaflet === false ? null : leaflet();
  const window = mapWindow(fixture && fixture.api);
  vm.runInContext(source, vm.createContext({ window, Number, String, encodeURIComponent }), { filename:"admin-place-map.js" });
  const component = window.TakhunAdminPlaceMap.init({ mapElement, latitudeInput, longitudeInput, statusElement, openLink });
  return { component, latitudeInput, longitudeInput, mapElement, statusElement, openLink, leaflet:fixture, window };
}
function parseAttributes(raw) {
  const attributes = {};
  for (const match of raw.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}
function pageElements(tagName) {
  return [...page.matchAll(new RegExp(`<${tagName}\\b([^>]*)>`, "gi"))].map((match) => ({ tagName:tagName.toUpperCase(), attributes:parseAttributes(match[1]), markup:match[0] }));
}
function pageElement(tagName, attributeName, value = undefined) {
  return pageElements(tagName).find((node) => Object.hasOwn(node.attributes, attributeName) && (value === undefined || node.attributes[attributeName] === value));
}
function labeledCoordinate(name) {
  for (const match of page.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/gi)) {
    const inputMatch = match[1].match(/<input\b([^>]*)>/i);
    if (!inputMatch) continue;
    const input = { tagName:"INPUT", attributes:parseAttributes(inputMatch[1]) };
    if (input.attributes.name === name) return { input, labelText:match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() };
  }
  return null;
}
function cssDeclarations(selector) {
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!match[1].split(",").map((part) => part.trim()).includes(selector)) continue;
    return Object.fromEntries([...match[2].matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)].map((part) => [part[1], part[2].trim()]));
  }
  return null;
}
function createEditorWithMap(options = {}) {
  const fixture = leaflet();
  const names = [...new Set([...page.matchAll(/<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"/g)].map((match) => match[1]))];
  const controls = Object.fromEntries(names.map((name) => [name, element()]));
  controls.name_th.value = "Create payload check";
  controls.latitude.value = options.latitude ?? "";
  controls.longitude.value = options.longitude ?? "";
  const form = element();
  form.elements = { namedItem:(name) => controls[name] };
  form.checkValidity = () => names.every((name) => controls[name].valid);
  form.reportCalls = 0;
  form.reportValidity = () => { form.reportCalls++; return form.checkValidity(); };
  const tabs = [element({ "data-admin-place-tab":"th" }), element({ "data-admin-place-tab":"en" })];
  const panels = [element({ "data-admin-place-panel":"th" }), element({ "data-admin-place-panel":"en" })];
  const nodes = {
    root:element(), form, status:element(), state:element(), fatal:element({ href:"places.html" }), identity:element(), id:element(), lifecycle:element(),
    save:element(), publish:element(), map:element(), mapStatus:element(), openMap:element(), tabs, panels, controls
  };
  const bySelector = new Map([
    ["[data-admin-content]", nodes.root], ["[data-admin-place-edit-form]", form], ["[data-admin-place-edit-status]", nodes.status],
    ["[data-admin-place-edit-state]", nodes.state], ["[data-admin-place-edit-fatal]", nodes.fatal], ["[data-admin-place-edit-identity]", nodes.identity],
    ["[data-admin-place-edit-id]", nodes.id], ["[data-admin-place-edit-lifecycle]", nodes.lifecycle], ["[data-admin-place-save]", nodes.save],
    ["[data-admin-place-publish]", nodes.publish], ["[data-admin-place-map]", nodes.map], ["[data-admin-place-map-status]", nodes.mapStatus],
    ["[data-admin-place-open-map]", nodes.openMap]
  ]);
  const document = {
    querySelector:(selector) => bySelector.get(selector),
    querySelectorAll:(selector) => selector.includes("tab]") ? tabs : panels,
    body:{ classList:{ contains:() => false } }, activeElement:null
  };
  for (const node of [...Object.values(nodes).filter((node) => node && !Array.isArray(node) && typeof node === "object"), ...tabs, ...panels, ...Object.values(controls)]) node.ownerDocument = document;
  const blankContent = Object.fromEntries(names.map((name) => [name, ""]));
  Object.assign(blankContent, { name_th:"Create payload check", latitude:options.latitude ?? "", longitude:options.longitude ?? "", tags:[], nearby_place_ids:[], is_featured:false, is_main_route_point:false, gallery_media_ids:[] });
  const calls = { createPlace:0, savePlaceDraft:0 };
  let createPayload = null, savePayload = null;
  const placeId = options.mode === "edit" ? "PLC-EDIT" : "PLC-CREATE";
  const writeResult = { place_id:placeId, status:"draft", working_version:1, entity_version:1, published_version:null, has_active_draft:true };
  const window = {
    window:null, document, L:fixture.api, location:{ search:options.mode === "edit" ? "?place_id=PLC-EDIT" : "", hash:"" }, history:{ replaceState() {} }, URLSearchParams,
    MutationObserver:function() { this.observe = () => {}; this.disconnect = () => {}; },
    TakhunAdminShell:{ init:async() => ({ status:"authenticated", admin:{ role:"editor" } }) },
    TakhunAdminAuth:{ readSession:() => ({ token:"T", role:"editor" }) },
    TakhunAdminApi:{
      createPlace:async(_token, payload) => { calls.createPlace++; createPayload = payload; return writeResult; },
      getPlaceDetail:async() => ({ ...writeResult, display_state:"draft", content:blankContent, capabilities:{ can_write:true, can_publish:true } }),
      savePlaceDraft:async(_token, payload) => { calls.savePlaceDraft++; savePayload = payload; return writeResult; },
      publishPlace:async() => { throw new Error("unexpected publishPlace"); }
    }
  };
  window.window = window;
  const context = vm.createContext({ window, URLSearchParams, MutationObserver:window.MutationObserver, Number, String, encodeURIComponent });
  vm.runInContext(fs.readFileSync(modulePath, "utf8"), context, { filename:"admin-place-map.js" });
  vm.runInContext(fs.readFileSync(editorPath, "utf8"), context, { filename:"admin-place-edit.js" });
  return { component:window.TakhunAdminPlaceEdit, nodes, fixture, calls, getCreatePayload:() => createPayload, getSavePayload:() => savePayload };
}

test("default viewport is exact and does not invent place coordinates", () => {
  const h = load(), map = h.leaflet.calls.maps[0];
  assert.deepEqual(Array.from(map.center), [8.9, 98.8]);
  assert.equal(map.zoom, 10);
  assert.equal(h.latitudeInput.value, "");
  assert.equal(h.longitudeInput.value, "");
  assert.equal(h.leaflet.calls.markers.length, 0);
  assert.equal(h.component.getValue(), null);
});
test("default viewport cannot contaminate the real Task 12 Create payload", async () => {
  const h = createEditorWithMap();
  await h.component.init();
  assert.deepEqual(Array.from(h.fixture.calls.maps[0].center), [8.9, 98.8]);
  assert.equal(h.fixture.calls.markers.length, 0);
  assert.equal(h.nodes.controls.latitude.value, "");
  assert.equal(h.nodes.controls.longitude.value, "");
  assert.equal(h.nodes.controls.latitude.validationMessage, "");
  assert.equal(h.nodes.controls.longitude.validationMessage, "");
  await h.nodes.form.fire("submit");
  assert.equal(h.calls.createPlace, 1);
  assert.equal(h.nodes.form.reportCalls, 0);
  assert.equal(h.getCreatePayload().content.latitude, "");
  assert.equal(h.getCreatePayload().content.longitude, "");
});
test("complete valid manual pair stays field-valid and retains numeric Save meaning in Create and Edit", async () => {
  for (const mode of ["create", "edit"]) {
    const h = createEditorWithMap({ mode, latitude:" +8.9 ", longitude:"098.8001" });
    await h.component.init();
    assert.equal(h.nodes.controls.latitude.validationMessage, "", `${mode} latitude`);
    assert.equal(h.nodes.controls.longitude.validationMessage, "", `${mode} longitude`);
    await h.nodes.form.fire("submit");
    const payload = mode === "create" ? h.getCreatePayload() : h.getSavePayload();
    assert.equal(h.calls.createPlace, mode === "create" ? 1 : 0);
    assert.equal(h.calls.savePlaceDraft, mode === "edit" ? 1 : 0);
    assert.equal(h.nodes.form.reportCalls, 0);
    assert.equal(payload.content.latitude, 8.9);
    assert.equal(payload.content.longitude, 98.8001);
  }
});
test("manual invalid and incomplete pairs set accessible validity on both coordinate fields", async () => {
  const h = load();
  assert.equal(h.latitudeInput.validationMessage, "");
  assert.equal(h.longitudeInput.validationMessage, "");
  const invalidPairs = [
    ["8.9", ""], ["", "98.8"],
    ["0x10", "98.8"], ["1e1", "98.8"], [".", "98.8"],
    ["NaN", "98.8"], ["Infinity", "98.8"], ["-Infinity", "98.8"],
    ["91", "98.8"], ["8.9", "181"]
  ];
  for (const [latitude, longitude] of invalidPairs) {
    h.latitudeInput.value = latitude;
    h.longitudeInput.value = longitude;
    await h.latitudeInput.fire("input");
    assert.notEqual(h.latitudeInput.validationMessage, "", `${latitude},${longitude} latitude validity`);
    assert.notEqual(h.longitudeInput.validationMessage, "", `${latitude},${longitude} longitude validity`);
  }
  h.latitudeInput.value = "";
  h.longitudeInput.value = "";
  await h.longitudeInput.fire("input");
  assert.equal(h.latitudeInput.validationMessage, "");
  assert.equal(h.longitudeInput.validationMessage, "");
  h.latitudeInput.value = "8.9";
  h.longitudeInput.value = "98.8001";
  await h.longitudeInput.fire("input");
  assert.equal(h.latitudeInput.validationMessage, "");
  assert.equal(h.longitudeInput.validationMessage, "");
});
test("real Task 12 Create and Edit submits report invalid coordinates without API writes", async () => {
  const invalidPairs = [
    ["8.9", ""], ["", "98.8"],
    ["0x10", "98.8"], ["NaN", "98.8"], ["Infinity", "98.8"], ["-Infinity", "98.8"],
    ["91", "98.8"], ["8.9", "181"]
  ];
  for (const mode of ["create", "edit"]) {
    for (const [latitude, longitude] of invalidPairs) {
      const h = createEditorWithMap({ mode, latitude, longitude });
      await h.component.init();
      assert.notEqual(h.nodes.controls.latitude.validationMessage, "", `${mode} ${latitude},${longitude} latitude validity`);
      assert.notEqual(h.nodes.controls.longitude.validationMessage, "", `${mode} ${latitude},${longitude} longitude validity`);
      await h.nodes.form.fire("submit");
      assert.equal(h.calls.createPlace, 0, `${mode} ${latitude},${longitude} createPlace`);
      assert.equal(h.calls.savePlaceDraft, 0, `${mode} ${latitude},${longitude} savePlaceDraft`);
      assert.equal(h.nodes.form.reportCalls, 1, `${mode} ${latitude},${longitude} reportValidity`);
    }
  }
});
test("manual valid decimal pair preserves exact text while positioning one marker", async () => {
  const h = load({ latitude:" +8.9 ", longitude:"098.8001" });
  await h.latitudeInput.fire("input");
  assert.equal(h.latitudeInput.value, " +8.9 ");
  assert.equal(h.longitudeInput.value, "098.8001");
  assert.deepEqual(Array.from(h.leaflet.calls.markers[0].center), [8.9, 98.8001]);
  assert.equal(h.component.getValue().latitude, 8.9);
  assert.equal(h.component.getValue().longitude, 98.8001);
});
test("manual coordinate grammar rejects JavaScript-only numeric strings", async () => {
  const h = load({ latitude:"8.9", longitude:"98.8" }), marker = h.leaflet.calls.markers[0];
  for (const [lat, lng] of [["0x10", "98.8"], ["0b10", "98.8"], ["0o10", "98.8"], ["1e1", "98.8"]]) {
    h.latitudeInput.value = lat;
    h.longitudeInput.value = lng;
    await h.latitudeInput.fire("input");
    assert.equal(h.component.getValue(), null, `${lat} must be rejected`);
    assert.deepEqual(Array.from(marker.center), [8.9, 98.8]);
    assert.equal(h.latitudeInput.value, lat);
    assert.equal(h.longitudeInput.value, lng);
  }
});
test("fresh blank and either partial pair never create a marker", () => {
  for (const [lat, lng] of [["", ""], ["", "98.8"], ["8.9", ""]]) {
    const h = load({ latitude:lat, longitude:lng });
    assert.equal(h.leaflet.calls.markers.length, 0);
    assert.equal(h.component.getValue(), null);
    assert.equal(h.latitudeInput.value, lat);
    assert.equal(h.longitudeInput.value, lng);
  }
});
test("invalid manual input cannot move a valid existing marker", async () => {
  const h = load({ latitude:"8.9", longitude:"98.8" }), marker = h.leaflet.calls.markers[0];
  for (const [lat, lng] of [["", ""], ["nope", "98.8"], ["NaN", "98.8"], ["Infinity", "98.8"], ["-Infinity", "98.8"], ["91", "98.8"], ["8.9", "181"]]) {
    h.latitudeInput.value = lat;
    h.longitudeInput.value = lng;
    await h.latitudeInput.fire("input");
    assert.strictEqual(h.leaflet.calls.markers[0], marker);
    assert.deepEqual(Array.from(marker.center), [8.9, 98.8]);
  }
});
test("map click canonically serializes coordinates and keeps singleton marker", async () => {
  const h = load(), map = h.leaflet.calls.maps[0];
  h.latitudeInput.value = "8.9";
  h.longitudeInput.value = "";
  await h.latitudeInput.fire("input");
  assert.notEqual(h.latitudeInput.validationMessage, "");
  assert.notEqual(h.longitudeInput.validationMessage, "");
  map.fire("click", { latlng:{ lat:8.9, lng:98.8 } });
  const marker = h.leaflet.calls.markers[0];
  assert.equal(h.latitudeInput.value, "8.900000");
  assert.equal(h.longitudeInput.value, "98.800000");
  assert.equal(h.latitudeInput.validationMessage, "");
  assert.equal(h.longitudeInput.validationMessage, "");
  map.fire("click", { latlng:{ lat:8.12345649, lng:98.1234565 } });
  assert.equal(h.latitudeInput.value, "8.123456");
  assert.equal(h.longitudeInput.value, "98.123457");
  assert.equal(h.leaflet.calls.markers.length, 1);
  assert.strictEqual(h.leaflet.calls.markers[0], marker);
});
test("invalid map clicks leave fields and singleton marker unchanged", () => {
  const fresh = load();
  for (const latlng of [{ lat:91, lng:98.8 }, { lat:8.9, lng:181 }, { lat:NaN, lng:98.8 }, { lat:8.9, lng:Infinity }, { lat:"0x10", lng:98.8 }]) fresh.leaflet.calls.maps[0].fire("click", { latlng });
  assert.equal(fresh.leaflet.calls.markers.length, 0);
  assert.equal(fresh.latitudeInput.value, "");
  assert.equal(fresh.longitudeInput.value, "");
  const h = load({ latitude:"8.9", longitude:"98.8" }), marker = h.leaflet.calls.markers[0];
  h.leaflet.calls.maps[0].fire("click", { latlng:{ lat:8.9, lng:-181 } });
  assert.deepEqual(Array.from(marker.center), [8.9, 98.8]);
  assert.equal(h.latitudeInput.value, "8.9");
  assert.equal(h.longitudeInput.value, "98.8");
});
test("marker drag uses deterministic canonical rounding and accepts boundaries", () => {
  const h = load(), map = h.leaflet.calls.maps[0];
  map.fire("click", { latlng:{ lat:-90, lng:-180 } });
  const marker = h.leaflet.calls.markers[0];
  marker.setLatLng([8.12345649, 98.1234565]);
  marker.fire("dragend");
  assert.equal(h.latitudeInput.value, "8.123456");
  assert.equal(h.longitudeInput.value, "98.123457");
  marker.setLatLng([90, 180]);
  marker.fire("dragend");
  assert.equal(h.latitudeInput.value, "90.000000");
  assert.equal(h.longitudeInput.value, "180.000000");
  assert.equal(h.leaflet.calls.markers.length, 1);
});
test("invalid wrapped and non-finite drags restore the singleton marker and preserve fields", () => {
  const h = load({ latitude:"8.9", longitude:"98.8" }), marker = h.leaflet.calls.markers[0];
  for (const point of [[8.9, 181], [NaN, 98.8], [8.9, Infinity]]) {
    marker.setLatLng(point);
    marker.fire("dragend");
    assert.deepEqual(Array.from(marker.center), [8.9, 98.8]);
    assert.equal(h.latitudeInput.value, "8.9");
    assert.equal(h.longitudeInput.value, "98.8");
    assert.equal(h.leaflet.calls.markers.length, 1);
  }
});
test("a later deliberate map interaction replaces preserved manual text", async () => {
  const h = load({ latitude:"8.9", longitude:"98.8001" });
  await h.longitudeInput.fire("input");
  assert.equal(h.latitudeInput.value, "8.9");
  h.leaflet.calls.maps[0].fire("click", { latlng:{ lat:7, lng:99 } });
  assert.equal(h.latitudeInput.value, "7.000000");
  assert.equal(h.longitudeInput.value, "99.000000");
});
test("repeated initialization reuses one map instance and singleton marker", () => {
  const h = load({ latitude:"8.9", longitude:"98.8" });
  const second = h.window.TakhunAdminPlaceMap.init({ mapElement:h.mapElement, latitudeInput:h.latitudeInput, longitudeInput:h.longitudeInput, statusElement:h.statusElement, openLink:h.openLink });
  assert.strictEqual(second, h.component);
  assert.equal(h.leaflet.calls.maps.length, 1);
  assert.equal(h.leaflet.calls.markers.length, 1);
});
test("safe Google Maps action is only enabled for a complete valid pair", async () => {
  const h = load({ latitude:"8.9", longitude:"98.8" });
  await h.latitudeInput.fire("input");
  assert.equal(h.openLink.hidden, false);
  assert.equal(h.openLink.target, "_blank");
  assert.equal(h.openLink.rel, "noopener noreferrer");
  assert.equal(h.openLink.href, "https://www.google.com/maps/search/?api=1&query=8.9%2C98.8");
  h.latitudeInput.value = "";
  await h.latitudeInput.fire("input");
  assert.equal(h.openLink.hidden, true);
  assert.equal(h.openLink.href, "");
});
test("missing Leaflet retains usable manual inputs without coordinate contamination", async () => {
  const h = load({ leaflet:false });
  assert.equal(h.latitudeInput.value, "");
  assert.equal(h.longitudeInput.value, "");
  assert.equal(h.latitudeInput.validationMessage, "");
  assert.equal(h.longitudeInput.validationMessage, "");
  assert.match(h.statusElement.textContent, /map/i);
  h.latitudeInput.value = "8.9";
  await h.latitudeInput.fire("input");
  assert.notEqual(h.latitudeInput.validationMessage, "");
  assert.notEqual(h.longitudeInput.validationMessage, "");
  h.longitudeInput.value = "98.8";
  await h.longitudeInput.fire("input");
  assert.equal(h.latitudeInput.value, "8.9");
  assert.equal(h.longitudeInput.value, "98.8");
  assert.equal(h.latitudeInput.validationMessage, "");
  assert.equal(h.longitudeInput.validationMessage, "");
  assert.equal(h.component.getValue().latitude, 8.9);
  assert.equal(h.component.getValue().longitude, 98.8);
});
test("throwing capability traps stay untouched during init manual click and drag", async () => {
  const h = load();
  h.latitudeInput.value = "8.9";
  h.longitudeInput.value = "98.8";
  await h.longitudeInput.fire("input");
  h.leaflet.calls.maps[0].fire("click", { latlng:{ lat:8, lng:99 } });
  h.leaflet.calls.markers[0].setLatLng([7, 100]).fire("dragend");
  assert.equal(h.latitudeInput.value, "7.000000");
  assert.equal(h.longitudeInput.value, "100.000000");
});
test("source security scan supplements executable capability traps", () => {
  const source = fs.readFileSync(modulePath, "utf8");
  assert.doesNotMatch(source, /TakhunAdminApi|createPlace|savePlaceDraft|publishPlace|navigator\.geolocation|\bfetch\s*\(|innerHTML|insertAdjacentHTML|\beval\s*\(|getPlaceMediaOptions|admin-place-media|gallery_media_ids/);
});
test("actual accessibility attributes and scoped zoom controls meet the map contract", () => {
  for (const name of ["latitude", "longitude"]) {
    const labeled = labeledCoordinate(name);
    assert.ok(labeled, `${name} must have an associated label`);
    assert.notEqual(labeled.labelText, "");
    assert.equal(labeled.input.attributes.inputmode, "decimal");
    assert.equal(labeled.input.attributes["aria-describedby"], "admin-place-map-status");
  }
  const map = pageElement("div", "data-admin-place-map");
  assert.equal(map.attributes.role, "region");
  assert.notEqual(map.attributes["aria-label"], "");
  assert.equal(map.attributes.tabindex, "0");
  assert.deepEqual(map.attributes["aria-describedby"].split(/\s+/), ["admin-place-map-help", "admin-place-map-status"]);
  const status = pageElement("p", "data-admin-place-map-status");
  assert.equal(status.attributes.id, "admin-place-map-status");
  assert.equal(status.attributes.role, "status");
  assert.equal(status.attributes["aria-live"], "polite");
  assert.equal(status.attributes["aria-atomic"], "true");
  const action = pageElement("a", "data-admin-place-open-map");
  assert.ok(action);
  assert.ok(Object.hasOwn(action.attributes, "hidden"));
  const zoom = cssDeclarations("[data-admin-place-map] .leaflet-control-zoom a");
  assert.ok(zoom, "Admin map must scope a Leaflet zoom-control size rule");
  assert.equal(zoom["min-width"], "44px");
  assert.equal(zoom["min-height"], "44px");
  const focus = cssDeclarations("[data-admin-place-map] .leaflet-control-zoom a:focus-visible");
  assert.ok(focus, "Admin map must scope a Leaflet zoom-control focus rule");
  assert.match(focus.outline, /^3px solid /);
  assert.ok(Number.parseFloat(focus["outline-offset"]) >= 2);
});

(async () => {
  let failures = 0;
  for (const item of tests) {
    try { await item.fn(); console.log(`PASS ${item.name}`); }
    catch (error) { failures++; console.error(`FAIL ${item.name}\n${error.stack || error}`); }
  }
  if (failures) process.exitCode = 1;
  else console.log(`Admin Place map verification passed: ${tests.length} tests.`);
})();
