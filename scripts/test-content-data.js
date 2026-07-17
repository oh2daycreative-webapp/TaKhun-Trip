"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "public/js/content-data.js"), "utf8");
const context = { window: {}, Date };
vm.createContext(context);
vm.runInContext(source, context, { filename: "content-data.js" });

const content = context.window.TakhunContentData;
assert.ok(content, "content-data.js must expose TakhunContentData");

const places = content.listPlaces();
const routes = content.listRoutes();
const products = content.listProducts();
const events = content.listEvents();
const galleryCategories = content.listGalleryCategories();

assert.equal(places.length, 10);
assert.equal(routes.length, 4);
assert.equal(products.length, 7);
assert.equal(events.length, 1);
assert.equal(galleryCategories.length, 5);

const allIds = [
  ...places.map((item) => item.place_id),
  ...routes.map((item) => item.route_id),
  ...products.map((item) => item.product_id),
  ...events.map((item) => item.event_id)
];
assert.equal(new Set(allIds).size, allIds.length, "canonical IDs must be globally unique");
assert.ok(allIds.every((id) => !id.startsWith("MOCK-")), "canonical IDs must not use MOCK prefixes");

const placeIds = new Set(places.map((item) => item.place_id));
assert.equal(content.getPlaceById("BTK-005").name_th, "วัดเขาพัง");
assert.ok(places.every((item) => item.latitude === null && item.longitude === null));
assert.ok(routes.every((route) => route.places.every((stop) => placeIds.has(stop.place_id))));
assert.ok(products.every((product) => placeIds.has(product.related_place_id)));

const event = content.getEventById("EVENT-HEART-OF-HILLS-2026");
assert.equal(event.event_date, "2026-07-18");
assert.equal(event.start_time, "10:00");
assert.equal(event.end_time, "");
assert.equal(event.related_place_id, "BTK-004");
assert.equal(event.contact_phone, "0848437924");
assert.equal(event.register_url, "");
assert.equal(event.google_maps_url, "");
assert.equal(event.latitude, null);
assert.equal(event.longitude, null);
assert.match(event.description_th, /250 บาท/);
assert.match(event.description_th, /14\.00 น\./);
assert.equal(placeIds.has(event.related_place_id), true);

assert.deepEqual(
  Array.from(galleryCategories, (item) => item.category_id),
  ["dam_lake", "mountain_nature", "community_life", "food_fruit", "activity_tradition"]
);
assert.deepEqual(Array.from(content.listGallery()), []);

const searchEnglish = content.searchAll({ keyword: "Heart of the Hills", lang: "en" });
assert.equal(searchEnglish.events[0].event_id, event.event_id);
const searchThaiTitle = content.searchAll({ keyword: "ภูผาแห่งหัวใจ", lang: "th" });
assert.equal(searchThaiTitle.events[0].event_id, event.event_id);
const searchThaiLocation = content.searchAll({ keyword: "ตลาดคลองแสง", lang: "th" });
assert.equal(searchThaiLocation.events[0].event_id, event.event_id);

const homeBefore = content.getHomeData("th", new Date("2026-07-17T12:00:00+07:00"));
assert.equal(homeBefore.data.upcoming_events[0].event_id, event.event_id);
const homeOnDate = content.getHomeData("en", new Date("2026-07-18T12:00:00+07:00"));
assert.equal(homeOnDate.data.upcoming_events[0].event_id, event.event_id);
const homeAfter = content.getHomeData("th", new Date("2026-07-19T12:00:00+07:00"));
assert.equal(homeAfter.data.upcoming_events.length, 0);

const mutated = content.listPlaces();
mutated[0].name_th = "changed";
assert.notEqual(content.listPlaces()[0].name_th, "changed", "content reads must return defensive copies");

console.log("Canonical content data verification passed.");
