"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const contentPages = [
  "index.html", "places.html", "place-detail.html", "map.html", "routes.html", "route-detail.html",
  "trip-planner.html", "products.html", "product-detail.html", "events.html", "event-detail.html",
  "gallery.html", "search.html", "favorites.html"
];

for (const page of contentPages) {
  const html = read(`public/${page}`);
  const contentIndex = html.indexOf('src="js/content-data.js"');
  const featureIndexes = ["home.js", "place-data.js", "routes.js", "trip-planner.js", "products.js", "events.js", "gallery.js", "search.js", "favorites.js"]
    .map((file) => html.indexOf(`src="js/${file}"`)).filter((index) => index >= 0);
  assert.ok(contentIndex >= 0, `${page} must load content-data.js`);
  assert.ok(featureIndexes.every((index) => contentIndex < index), `${page} must load content-data.js before feature modules`);
}

const homeHtml = read("public/index.html");
assert.match(homeHtml, /id="upcoming-events"/);
assert.match(homeHtml, /data-home-events-empty/);
assert.doesNotMatch(homeHtml, /0X-XXX-XXXX|contact@example\.com/);

const home = read("public/js/home.js");
assert.match(home, /TakhunContentData\.getHomeData/);
assert.match(home, /upcoming_events/);
assert.match(home, /renderEventCard/);
assert.doesNotMatch(home, /MOCK_HOME_RESPONSE|MOCK-PLACE|MOCK-ROUTE/);

const placeData = read("public/js/place-data.js");
assert.match(placeData, /TakhunContentData/);
assert.doesNotMatch(placeData, /DEMO_IMAGE|MOCK-PLACE|is_demo|8\.9\s*\+/);

const routes = read("public/js/routes.js");
assert.match(routes, /TakhunContentData\.listRoutes/);
assert.match(routes, /TakhunContentData\.getRouteById/);
assert.doesNotMatch(routes, /MOCK_ROUTES|MOCK-ROUTE|MOCK-PLACE/);

const products = read("public/js/products.js");
assert.match(products, /TakhunContentData\.listProducts/);
assert.match(products, /TakhunContentData\.getProductById/);
assert.doesNotMatch(products, /MOCK_PRODUCTS|example\.com|maps\.example|081 234 5678/);
assert.match(products, /if \(!validateDetailRequestId\(productId\)\) \{ setPageState\(states, "invalid-id"\); return; \}/, "invalid Product Detail IDs must stop before the API request");
assert.match(products, /data-product-detail-retry[^\n]+addEventListener\("click", fetchDetail\)/, "Product Detail retry must re-enter the loading request flow");
assert.match(products, /takhun:languagechange[^\n]+renderProductDetail\(product\)/, "Product Detail language changes must re-render content without reloading");
assert.doesNotMatch(products, /appendExternalAction\(actions,\s*t\("products\.navigate"\)/, "navigation must not render inside Product contact actions");
const productDetailHtml = read("public/product-detail.html");
assert.match(productDetailHtml, /data-product-contact[^>]*hidden/, "unverified Product contact cards must start hidden");
assert.doesNotMatch(productDetailHtml, /data-product-no-contact/, "Product Detail must not display a contact placeholder");

const events = read("public/js/events.js");
assert.match(events, /community_tourism/);
assert.match(events, /TakhunContentData\.listEvents/);
assert.match(events, /TakhunContentData\.getEventById/);
assert.doesNotMatch(events, /dateOffset\s*\(|mockEvent\s*\(|MOCK_EVENTS|MOCK-EVT|new Date\(\).*setDate/s);

const gallery = read("public/js/gallery.js");
for (const category of ["dam_lake", "mountain_nature", "community_life", "food_fruit", "activity_tradition"]) assert.match(gallery, new RegExp(category));
assert.match(gallery, /TakhunContentData\.listGallery/);
assert.doesNotMatch(gallery, /unsplash|interactive-examples|youtube\.com|javascript:alert|MOCK-GAL/i);
assert.match(gallery, /takhun:languagechange[^\n]+renderGalleryCategoryOptions/, "Gallery language changes must rebuild canonical category options without reload");
assert.doesNotMatch(read("public/gallery.html"), /value="(?:place|route|event|product|community|hero|other)"/, "legacy Gallery category options must not render");
assert.match(read("public/css/components.css"), /\.product-detail-page\s+\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/i, "Product Detail hidden states need a scoped display contract");

const search = read("public/js/search.js");
assert.match(search, /searchAll\(params,\s*\{\s*mock:/s);
assert.match(search, /TakhunContentData\.searchAll/);

const planner = read("public/js/trip-planner.js");
assert.match(planner, /const VERSION = 2/);
assert.match(planner, /TakhunContentData/);
assert.match(planner, /stale|migrat|canonical/i);
assert.doesNotMatch(planner, /MOCK-TRIP/);

const i18n = read("public/js/i18n.js");
assert.match(i18n, /MVP_CONTENT_COPY/);
assert.match(i18n, /community_tourism/);
assert.match(i18n, /dam_lake/);

console.log("Public content integration verification passed.");
