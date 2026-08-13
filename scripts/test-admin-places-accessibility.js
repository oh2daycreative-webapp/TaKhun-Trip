"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const places = fs.readFileSync(path.join(root, "public/admin/places.html"), "utf8");
const edit = fs.readFileSync(path.join(root, "public/admin/place-edit.html"), "utf8");
const placesSource = fs.readFileSync(path.join(root, "public/admin/js/admin-places.js"), "utf8");
const editSource = fs.readFileSync(path.join(root, "public/admin/js/admin-place-edit.js"), "utf8");
const mapSource = fs.readFileSync(path.join(root, "public/admin/js/admin-place-map.js"), "utf8");
const mediaSource = fs.readFileSync(path.join(root, "public/admin/js/admin-place-media.js"), "utf8");
const css = fs.readFileSync(path.join(root, "public/css/admin-places.css"), "utf8");
const runner = fs.readFileSync(path.join(root, "scripts/test.ps1"), "utf8");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function count(text, pattern) { return (text.match(pattern) || []).length; }
function blockFor(selector) {
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (match[1].split(",").map((value) => value.trim()).includes(selector)) return match[2];
  }
  return "";
}
function minimumTarget(selector) {
  const declarations = blockFor(selector);
  assert.match(declarations, /min-width:\s*44px/i, `${selector} min-width`);
  assert.match(declarations, /min-height:\s*44px/i, `${selector} min-height`);
}
function mediaNode(tag = "div") {
  const attributes = {};
  return { tagName:tag.toUpperCase(), children:[], hidden:false, disabled:false, textContent:"", setAttribute(name,value){attributes[name]=String(value);}, getAttribute(name){return Object.hasOwn(attributes,name)?attributes[name]:null;}, append(...nodes){this.children.push(...nodes);}, replaceChildren(...nodes){this.children=[];this.append(...nodes);}, addEventListener(){}, focus(){this.focused=true;} };
}
function approvedMedia(mediaId) { return { media_id:mediaId, entity_type:"place", entity_id:"PLC-A", role:"gallery", alt_th:mediaId, alt_en:"", fallback:"assets/media/placeholders/gallery.svg", outputs:[{width:320,height:213,path:`assets/media/generated/places/${mediaId}-320.webp`}] }; }

test("Places pages retain one primary heading and native protected landmarks", () => {
  for (const [name, html] of [["list", places], ["editor", edit]]) {
    assert.equal(count(html, /<h1\b/gi), 1, `${name} h1 count`);
    assert.equal(count(html, /<header\b/gi), 1, `${name} header count`);
    assert.equal(count(html, /<main\b/gi), 1, `${name} main count`);
    assert.match(html, /<nav\b[^>]*aria-label=/i, `${name} labelled navigation`);
    assert.match(html, /data-admin-shell[^>]*hidden[^>]*aria-hidden="true"/i, `${name} protected shell hidden`);
  }
});

test("List exposes native filter table card and pagination semantics without duplicate live output", () => {
  assert.match(places, /<form\b[^>]*data-admin-places-filters[^>]*aria-label=/i);
  for (const id of ["admin-places-keyword", "admin-places-category", "admin-places-status"]) {
    assert.match(places, new RegExp(`<label[^>]*for="${id}"`));
    assert.match(places, new RegExp(`id="${id}"`));
  }
  assert.match(places, /<table\b[^>]*data-admin-places-table/);
  assert.match(places, /<caption\b/);
  assert.equal(count(places, /<th\b[^>]*scope="col"/g), 5);
  assert.match(places, /<ul\b[^>]*data-admin-places-cards[^>]*aria-label=/);
  assert.match(places, /<nav\b[^>]*data-admin-places-pagination[^>]*aria-label=/);
  assert.equal(count(places, /data-admin-places-announcement/g), 1);
  assert.match(places, /data-admin-places-announcement[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
});

test("Editor labels controls and exposes a grouped validation summary associated with invalid fields", () => {
  const namedControls = [...edit.matchAll(/<(input|select|textarea)\b[^>]*\bname="([^"]+)"[^>]*>/g)]
    .filter((match) => !/\bhidden\b/.test(match[0]));
  assert.equal(namedControls.length, 40);
  for (const match of namedControls) {
    const before = edit.slice(Math.max(0, match.index - 180), match.index);
    assert.match(before, /<label(?:\s[^>]*)?>[\s\S]*$/i, `${match[2]} has a visible label`);
  }
  assert.match(edit, /id="admin-place-validation-summary"[^>]*data-admin-place-validation-summary[^>]*role="alert"[^>]*aria-live="assertive"[^>]*tabindex="-1"[^>]*hidden/i);
  assert.match(editSource, /aria-invalid/);
  assert.match(editSource, /admin-place-validation-summary/);
});

test("Tabs dialogs map and read-only content keep native semantic alternatives", () => {
  assert.match(edit, /role="tablist"/);
  assert.equal(count(edit, /role="tab"/g), 2);
  assert.equal(count(edit, /role="tabpanel"/g), 2);
  for (const id of ["place-tab-th", "place-tab-en"]) assert.match(edit, new RegExp(`id="${id}"[^>]*aria-controls=`));
  assert.equal(count(edit, /<dialog\b[^>]*aria-labelledby="[^"]+"[^>]*aria-describedby="[^"]+"/g), 4);
  assert.match(edit, /data-admin-place-map[^>]*role="region"[^>]*aria-label=/);
  assert.match(edit, /name="latitude"[^>]*aria-describedby="admin-place-map-status"/);
  assert.match(edit, /name="longitude"[^>]*aria-describedby="admin-place-map-status"/);
  assert.match(editSource, /associateCoordinateHelp\(\)/);
  assert.match(editSource, /ids\.unshift\("admin-place-map-help"\)/);
  assert.match(edit, /data-admin-place-readonly[^>]*aria-labelledby=/);
  assert.match(editSource, /make\("dl"/);
});

test("Every Task 17 action family has an individual 44px target and visible focus treatment", () => {
  for (const selector of [
    ".admin-places__search", ".admin-places__create", ".admin-places__retry", ".admin-places__page", ".admin-places__action",
    ".admin-place-edit__tabs [role=\"tab\"]", ".admin-place-edit__actions .button", ".admin-place-edit__submit .button",
    ".admin-place-media__option", ".admin-place-media__move", ".admin-place-media__remove", ".admin-place-media__pagination button",
    ".admin-place-dialog__actions .button"
  ]) minimumTarget(selector);
  assert.match(css, /\.admin-place-edit\s+:focus-visible\s*\{[^}]*outline:\s*3px solid/i);
  assert.match(css, /\[data-admin-place-map\]\s+\.leaflet-control-zoom a:focus-visible\s*\{[^}]*outline:/i);
});

test("Responsive rules preserve mobile cards desktop table and narrow editor reflow", () => {
  assert.match(css, /@media\s*\(max-width:\s*699px\)[^{]*\{[\s\S]*?\.admin-places__table-wrap\s*\{[^}]*display:\s*none/i);
  assert.match(css, /@media\s*\(max-width:\s*699px\)[\s\S]*?\.admin-places__cards\s*\{[^}]*display:\s*grid/i);
  assert.match(css, /@media\s*\(min-width:\s*700px\)[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/i);
  assert.match(css, /@media\s*\(max-width:\s*560px\)[\s\S]*?\.admin-place-media__selected-item\s*\{[^}]*grid-template-columns:\s*1fr/i);
  assert.match(css, /\.admin-place-dialog\s*\{[^}]*width:\s*min\(42rem,\s*calc\(100% - 2rem\)\)[^}]*max-height:/i);
  assert.match(css, /overflow-wrap:\s*anywhere/i);
  assert.doesNotMatch(css, /(?:html|body|\.admin-main)[^{]*\{[^}]*overflow-x:\s*hidden/i);
});

test("A 360px viewport policy rejects fixed-width overflow and keeps narrow surfaces bounded", () => {
  const viewport=360;
  for(const match of css.matchAll(/(?:^|[;{])\s*(?:min-)?width:\s*(\d+)px/gi)) assert.ok(Number(match[1])<=viewport,`fixed width ${match[1]}px exceeds ${viewport}px`);
  assert.equal(Math.min(42*16,viewport-2*16),328);
  assert.match(blockFor(".admin-place-edit"),/width:\s*100%[\s\S]*min-width:\s*0[\s\S]*box-sizing:\s*border-box/i);
  assert.match(blockFor(".admin-place-edit__section"),/min-width:\s*0[\s\S]*box-sizing:\s*border-box/i);
  assert.match(css, /@media\s*\(max-width:\s*560px\)[\s\S]*?\.admin-place-media__selected-item\s*\{[^}]*grid-template-columns:\s*1fr/i);
});

test("Reduced motion and textual state prevent motion or color-only meaning", () => {
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i);
  assert.match(css, /prefers-reduced-motion[\s\S]*transition:\s*none\s*!important/i);
  assert.match(css, /\.admin-places__status\s*\{[^}]*(?:border|font-weight)/i);
  assert.match(placesSource, /ฉบับร่าง/);
  assert.match(placesSource, /เผยแพร่แล้ว/);
  assert.match(placesSource, /เก็บถาวร/);
});

test("Map and media retain keyboard alternatives and action-specific announcements", () => {
  assert.match(mapSource, /latitudeInput\.addEventListener\("input"/);
  assert.match(mapSource, /longitudeInput\.addEventListener\("input"/);
  assert.doesNotMatch(mapSource, /geolocation/);
  assert.match(mediaSource, /aria-pressed/);
  assert.match(mediaSource, /เลื่อน.*ขึ้น/);
  assert.match(mediaSource, /เลื่อน.*ลง/);
  assert.match(mediaSource, /announce\([^)]*(?:เลื่อน|นำออก|เลือก)/);
  assert.match(mediaSource, /\.focus\(\)/);
});

test("Removing an off-page selected medium restores focus to the announced result", async () => {
  assert.match(edit,/data-admin-place-media-status[^>]*role="status"[^>]*tabindex="-1"/);
  const document = { createElement:(tag)=>mediaNode(tag) };
  const window = { document }; window.window=window;
  vm.runInContext(mediaSource,vm.createContext({window}),{filename:"admin-place-media.js"});
  const mounts={root:mediaNode(),hero:mediaNode(),options:mediaNode(),selected:mediaNode("ol"),status:mediaNode(),searchForm:mediaNode(),searchInput:mediaNode("input"),searchButton:mediaNode("button"),previous:mediaNode("button"),next:mediaNode("button"),page:mediaNode()};
  const component=await window.TakhunAdminPlaceMedia.init({mode:"edit",placeId:"PLC-A",selectedIds:["gallery-off-page"],mounts,loadOptions:async()=>({items:[approvedMedia("gallery-current-page")],page:1,page_size:20,total:2,total_pages:1})});
  assert.equal(component.remove("gallery-off-page"),true);
  assert.equal(mounts.status.focused,true);
  assert.match(mounts.status.textContent,/นำออก.*0.*50/);
});

test("Task 17 runner and security boundaries stay exact", () => {
  assert.equal(count(runner, /test-admin-places-accessibility\.js/g), 1);
  for (const source of [placesSource, editSource, mapSource, mediaSource]) {
    assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|new\s+Function/);
  }
  assert.doesNotMatch(editSource + mapSource + mediaSource, /\bfetch\s*\(|sessionStorage|localStorage/);
  assert.doesNotMatch(editSource + placesSource, /Task\s*18|bulk|import|export/i);
});

let failures = 0;
(async()=>{for (const entry of tests) {
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
  console.error(`Admin Places accessibility verification failed: ${failures} of ${tests.length} tests.`);
  process.exitCode = 1;
} else {
  console.log(`Admin Places accessibility verification passed: ${tests.length} tests.`);
}})();
