"use strict";

(function createHomePage(global) {
  const SECTION_KEYS = Object.freeze([
    "featured_routes", "featured_places", "featured_products", "upcoming_events", "gallery_preview"
  ]);
  const PRIMARY_STATES = Object.freeze(["loading", "ready", "empty", "error"]);
  const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
  const DURATION_KEYS = Object.freeze({
    "ครึ่งวัน": "trip_planner.duration_half_day",
    "1 วัน": "trip_planner.duration_one_day",
    "2 วัน 1 คืน": "trip_planner.duration_two_days_one_night"
  });

  const HOME_DATA = Object.freeze({
    tripInspiration: Object.freeze([
      Object.freeze({ name_th: "ธรรมชาติ", name_en: "Nature", detail_th: "น้ำใส ภูเขา และอากาศดี", detail_en: "Clear water, mountains, and fresh air", href: "places.html?category=nature", tone: "nature", icon: "leaf" }),
      Object.freeze({ name_th: "ชุมชน", name_en: "Community", detail_th: "เรื่องเล่าจากคนในพื้นที่", detail_en: "Stories shared by local people", href: "places.html?category=community", tone: "community", icon: "community" }),
      Object.freeze({ name_th: "อาหาร", name_en: "Food", detail_th: "รสชาติใต้แบบบ้านตาขุน", detail_en: "Southern flavors from Ban Ta Khun", href: "products.html?category=food", tone: "food", icon: "food" }),
      Object.freeze({ name_th: "คาเฟ่", name_en: "Cafés", detail_th: "จิบกาแฟท่ามกลางวิว", detail_en: "Coffee with a scenic view", href: "places.html?category=cafe", tone: "cafe", icon: "cup" }),
      Object.freeze({ name_th: "ครอบครัว", name_en: "Family", detail_th: "กิจกรรมสนุกสำหรับทุกวัย", detail_en: "Activities for every generation", href: "routes.html?type=family", tone: "family", icon: "family" })
    ])
  });

  const MOCK_HOME_RESPONSE = Object.freeze({
    ok: true,
    data: Object.freeze({
      featured_routes: Object.freeze([
        Object.freeze({ route_id: "MOCK-ROUTE-001", name: "เชี่ยวหลานในหนึ่งวัน", short_description: "ทะเลสาบ เขาสามเกลอ และสันเขื่อน", duration: "1 วัน", travel_style: Object.freeze(["nature", "photo"]), cover_image_url: "", is_featured: true }),
        Object.freeze({ route_id: "MOCK-ROUTE-002", name: "หัวใจแห่งเขาเทพพิทักษ์", short_description: "สะพานแขวน ภูเขารูปหัวใจ และชุมชน", duration: "ครึ่งวัน", travel_style: Object.freeze(["community", "photo"]), cover_image_url: "", is_featured: true })
      ]),
      featured_places: Object.freeze([
        Object.freeze({ place_id: "MOCK-PLACE-001", name: "ทะเลสาบเชี่ยวหลาน", category: "nature", short_description: "ล่องเรือผ่านผืนน้ำสีมรกตและแนวภูเขาหินปูน", cover_image_url: "", is_featured: true }),
        Object.freeze({ place_id: "MOCK-PLACE-002", name: "ภูเขารูปหัวใจ", category: "viewpoint", short_description: "จุดชมวิวโดดเด่นใกล้ชุมชนบ้านเขาเทพพิทักษ์", cover_image_url: "", is_featured: true }),
        Object.freeze({ place_id: "MOCK-PLACE-003", name: "เขื่อนรัชชประภา", category: "nature", short_description: "ชมวิวกว้างจากสันเขื่อนและรับลมเย็น", cover_image_url: "", is_featured: true })
      ]),
      featured_products: Object.freeze([]),
      upcoming_events: Object.freeze([]),
      gallery_preview: Object.freeze([])
    }),
    message: "success"
  });

  function malformedResponse() {
    const error = new Error("MALFORMED_RESPONSE");
    error.code = "MALFORMED_RESPONSE";
    return error;
  }

  function normalizeLang(value) { return value === "en" ? "en" : "th"; }
  function isObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function exactKeys(value, keys) {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
  }
  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
    return value;
  }
  function validStringFields(item, fields) { return fields.every((field) => typeof item[field] === "string"); }
  function validatePlace(item) {
    return isObject(item) && typeof item.place_id === "string" && SAFE_ID.test(item.place_id)
      && validStringFields(item, ["name", "category", "short_description", "cover_image_url"])
      && typeof item.is_featured === "boolean";
  }
  function validateRoute(item) {
    return isObject(item) && typeof item.route_id === "string" && SAFE_ID.test(item.route_id)
      && validStringFields(item, ["name", "short_description", "duration", "cover_image_url"])
      && Array.isArray(item.travel_style) && item.travel_style.every((style) => typeof style === "string")
      && typeof item.is_featured === "boolean";
  }

  function normalizeHomeResponse(response) {
    if (!isObject(response) || response.ok !== true || !isObject(response.data) || !exactKeys(response.data, SECTION_KEYS)) throw malformedResponse();
    if (!SECTION_KEYS.every((key) => Array.isArray(response.data[key]))) throw malformedResponse();
    if (!response.data.featured_places.every(validatePlace) || !response.data.featured_routes.every(validateRoute)) throw malformedResponse();
    const data = Object.fromEntries(SECTION_KEYS.map((key) => [key, cloneValue(response.data[key])]));
    data.featured_places = data.featured_places.slice(0, 4);
    data.featured_routes = data.featured_routes.slice(0, 2);
    return { ok: true, data, message: typeof response.message === "string" ? response.message : "success" };
  }

  function resolveHomeState({ loading = false, error = null, places = [], routes = [] } = {}) {
    if (loading) return "loading";
    if (error) return "error";
    return (Array.isArray(places) && places.length) || (Array.isArray(routes) && routes.length) ? "ready" : "empty";
  }

  function setPrimaryState(mounts, state) {
    if (!PRIMARY_STATES.includes(state) || !mounts?.[state]) {
      if (mounts) Object.values(mounts).flatMap((mount) => Array.isArray(mount) ? mount : [mount]).forEach((mount) => { if (mount) mount.hidden = true; });
      throw new Error(`Unknown home state: ${state}`);
    }
    Object.entries(mounts).forEach(([name, value]) => {
      (Array.isArray(value) ? value : [value]).forEach((mount) => { if (mount) mount.hidden = name !== state; });
    });
    return state;
  }

  function safeImageUrl(value) {
    const candidate = String(value || "").trim();
    if (!candidate) return "";
    try {
      const url = new URL(candidate);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch (_error) { return ""; }
  }

  function encoded(value) { return encodeURIComponent(String(value || "")); }
  function placeDetailUrl(placeId) { return `place-detail.html?id=${encoded(placeId)}`; }
  function routeDetailUrl(routeId) { return `route-detail.html?id=${encoded(routeId)}`; }
  function translatedOrRaw(key, raw, translate) {
    const label = String(translate(key));
    return label === key ? String(raw || "") : label;
  }
  function categoryLabel(value, translate) { return translatedOrRaw(`places.categories.${value}`, value, translate); }
  function durationLabel(value, translate) {
    const raw = String(value || "");
    const key = DURATION_KEYS[raw];
    return key ? translatedOrRaw(key, raw, translate) : raw;
  }
  function styleLabel(value, translate) { return translatedOrRaw(`routes_page.styles.${value}`, value, translate); }

  function mapPlace(place, translate) {
    return {
      id: place.place_id,
      title: place.name,
      category: categoryLabel(place.category, translate),
      description: place.short_description,
      href: placeDetailUrl(place.place_id),
      imageUrl: safeImageUrl(place.cover_image_url),
      featured: place.is_featured === true
    };
  }

  function mapRoute(route, translate) {
    return {
      id: route.route_id,
      title: route.name,
      description: route.short_description,
      duration: durationLabel(route.duration, translate),
      styles: route.travel_style.map((style) => styleLabel(style, translate)),
      href: routeDetailUrl(route.route_id),
      imageUrl: safeImageUrl(route.cover_image_url),
      featured: route.is_featured === true
    };
  }

  function localizedInspiration(lang) {
    const language = normalizeLang(lang);
    return HOME_DATA.tripInspiration.map((item) => ({
      name: item[`name_${language}`] || item.name_th,
      detail: item[`detail_${language}`] || item.detail_th,
      href: item.href,
      tone: item.tone,
      icon: item.icon
    }));
  }

  function mockHomeResponse(lang) {
    const response = cloneValue(MOCK_HOME_RESPONSE);
    if (normalizeLang(lang) === "en") {
      const placeCopy = [
        ["Cheow Lan Lake", "Cruise across emerald water framed by limestone mountains"],
        ["Heart-shaped Mountain", "A distinctive viewpoint near the Khao Thep Phithak community"],
        ["Ratchaprapha Dam", "Enjoy wide dam views and a refreshing breeze"]
      ];
      const routeCopy = [
        ["Cheow Lan in One Day", "The lake, limestone formations, and the dam viewpoint"],
        ["The Heart of Khao Thep Phithak", "The suspension bridge, heart-shaped mountain, and community"]
      ];
      response.data.featured_places.forEach((item, index) => { [item.name, item.short_description] = placeCopy[index]; });
      response.data.featured_routes.forEach((item, index) => { [item.name, item.short_description] = routeCopy[index]; });
    }
    return response;
  }

  function createHomeController({ loadHome, onChange = () => {}, initialLang = "th" } = {}) {
    if (typeof loadHome !== "function") throw new TypeError("loadHome must be a function");
    let state = "loading";
    let lang = normalizeLang(initialLang);
    let response = null;
    let generation = 0;
    let loadedLang = "";
    let active = null;
    const inFlight = new Map();

    function getSnapshot() {
      return Object.freeze({
        state,
        lang,
        places: response ? response.data.featured_places : [],
        routes: response ? response.data.featured_routes : [],
        pending: Boolean(active)
      });
    }
    function emit() { const snapshot = getSnapshot(); onChange(snapshot); return snapshot; }

    function load({ force = false } = {}) {
      const requestLang = lang;
      if (active?.lang === requestLang) return active.promise;
      if (!force && loadedLang === requestLang && (state === "ready" || state === "empty")) return Promise.resolve(getSnapshot());
      const token = ++generation;
      state = "loading";
      response = null;
      emit();
      let source = force ? null : inFlight.get(requestLang);
      if (!source) {
        try { source = Promise.resolve(loadHome(requestLang)); }
        catch (error) { source = Promise.reject(error); }
        inFlight.set(requestLang, source);
        const clearSource = () => { if (inFlight.get(requestLang) === source) inFlight.delete(requestLang); };
        source.then(clearSource, clearSource);
      }
      let promise;
      promise = source.then((value) => {
        const normalized = normalizeHomeResponse(value);
        if (token !== generation) return getSnapshot();
        if (active?.promise === promise) active = null;
        response = normalized;
        loadedLang = requestLang;
        state = resolveHomeState({ places: normalized.data.featured_places, routes: normalized.data.featured_routes });
        return emit();
      }).catch((_error) => {
        if (token !== generation) return getSnapshot();
        if (active?.promise === promise) active = null;
        response = null;
        loadedLang = "";
        state = "error";
        return emit();
      });
      active = { lang: requestLang, promise };
      return promise;
    }

    function setLanguage(value) {
      const nextLang = normalizeLang(value);
      if (nextLang === lang) return active?.promise || Promise.resolve(getSnapshot());
      lang = nextLang;
      return load();
    }

    return Object.freeze({ load, retry: () => load({ force: true }), setLanguage, getSnapshot });
  }

  const ICON_PATHS = Object.freeze({
    arrow: "M5 12h14m-6-6 6 6-6 6",
    pin: "M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z",
    clock: "M12 7v5l3 2",
    leaf: "M19 4C11 4 5 8 5 15c0 2 1 4 3 5 0-6 4-10 9-12-4 3-7 7-8 12 7 0 11-5 10-16Z",
    community: "M3 20c0-4 2-7 6-7s6 3 6 7m0-5c3 0 5 2 5 5",
    food: "M7 3v18m10-18c-3 3-3 8 0 10v8",
    cup: "M4 7h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V7Zm13 2h2a3 3 0 0 1 0 6h-2",
    family: "M2 20c0-5 2-8 6-8s6 3 6 8m0-6c4 0 6 2 6 6"
  });

  function t(key) { return global.TakhunI18n?.t?.(key) || key; }
  function format(key, values = {}) {
    return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), String(t(key)));
  }
  function make(tag, className = "", text = "") {
    const element = global.document.createElement(tag);
    if (className) element.className = className;
    if (text !== "") element.textContent = text;
    return element;
  }
  function createIcon(name, className = "") {
    const svg = global.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = global.document.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    if (className) svg.setAttribute("class", className);
    path.setAttribute("d", ICON_PATHS[name] || ICON_PATHS.arrow);
    svg.append(path);
    return svg;
  }
  function imageFallback(name) {
    const fallback = make("span", "home-card__image-fallback", t("home.image_fallback"));
    fallback.setAttribute("role", "img");
    fallback.setAttribute("aria-label", format("home.image_alt", { name }));
    return fallback;
  }
  function appendImage(mount, source, name) {
    const safe = safeImageUrl(source);
    const fallback = () => mount.replaceChildren(imageFallback(name));
    if (!safe) { fallback(); return; }
    const image = make("img", "home-card__image");
    image.src = safe;
    image.alt = format("home.image_alt", { name });
    image.loading = "lazy";
    image.addEventListener("error", fallback, { once: true });
    mount.append(image);
  }

  function renderPlaceCard(item) {
    const place = mapPlace(item, t);
    const card = make("article", "place-card");
    const media = make("div", "place-card__media home-card__media");
    appendImage(media, place.imageUrl, place.title);
    if (place.featured) media.append(make("span", "place-card__badge", t("home.featured_badge")));
    const content = make("div", "place-card__content");
    const category = make("p", "place-card__category", place.category);
    category.prepend(createIcon("pin"));
    const link = make("a", "text-link", t("home.view_place"));
    link.href = place.href;
    link.setAttribute("aria-label", format("home.view_place_named", { name: place.title }));
    link.append(createIcon("arrow"));
    content.append(category, make("h3", "", place.title));
    if (place.description) content.append(make("p", "", place.description));
    content.append(link);
    card.append(media, content);
    return card;
  }

  function renderRouteCard(item) {
    const route = mapRoute(item, t);
    const card = make("article", "route-card");
    const media = make("div", "route-card__media home-card__media");
    appendImage(media, route.imageUrl, route.title);
    if (route.featured) media.append(make("span", "route-card__type", t("home.featured_badge")));
    const content = make("div", "route-card__content");
    content.append(make("h3", "", route.title));
    if (route.description) content.append(make("p", "", route.description));
    const meta = make("div", "route-card__meta home-route-meta");
    if (route.duration) {
      const duration = make("span", "", route.duration);
      duration.prepend(createIcon("clock"));
      meta.append(duration);
    }
    if (route.styles.length) {
      const styles = make("ul", "home-route-styles");
      styles.setAttribute("aria-label", t("home.route_styles"));
      route.styles.forEach((style) => styles.append(make("li", "chip", style)));
      meta.append(styles);
    }
    if (meta.children.length) content.append(meta);
    const link = make("a", "button button--outline", t("home.view_route"));
    link.href = route.href;
    link.setAttribute("aria-label", format("home.view_route_named", { name: route.title }));
    link.append(createIcon("arrow"));
    content.append(link);
    card.append(media, content);
    return card;
  }

  function renderInspiration(lang) {
    const mount = global.document.querySelector("#trip-inspiration");
    if (!mount) return;
    mount.replaceChildren(...localizedInspiration(lang).map((item) => {
      const link = make("a", `inspiration-card inspiration-card--${item.tone}`);
      link.href = item.href;
      link.setAttribute("aria-label", format("home.inspiration_named", { name: item.name, detail: item.detail }));
      const icon = make("span", "inspiration-card__icon");
      icon.append(createIcon(item.icon));
      const text = make("span");
      text.append(make("strong", "", item.name), make("small", "", item.detail));
      link.append(icon, text, createIcon("arrow", "inspiration-card__arrow"));
      return link;
    }));
  }

  function initializePage() {
    if (!global.document?.querySelector?.(".home-page")) return;
    const mounts = Object.fromEntries(PRIMARY_STATES.map((state) => [state, [...global.document.querySelectorAll(`[data-home-state="${state}"]`)]]));
    const placesMount = global.document.querySelector("#featured-places");
    const routesMount = global.document.querySelector("#recommended-routes");
    const placesEmpty = global.document.querySelector("[data-home-places-empty]");
    const routesEmpty = global.document.querySelector("[data-home-routes-empty]");
    const retryButtons = [...global.document.querySelectorAll("[data-home-retry]")];

    function render(snapshot) {
      setPrimaryState(mounts, snapshot.state);
      retryButtons.forEach((button) => { button.disabled = snapshot.state === "loading" || snapshot.pending; });
      if (snapshot.state === "ready") {
        placesMount.replaceChildren(...snapshot.places.map(renderPlaceCard));
        routesMount.replaceChildren(...snapshot.routes.map(renderRouteCard));
        placesEmpty.hidden = snapshot.places.length > 0;
        routesEmpty.hidden = snapshot.routes.length > 0;
      } else if (snapshot.state === "empty" || snapshot.state === "error") {
        placesMount.replaceChildren();
        routesMount.replaceChildren();
      }
    }

    const controller = createHomeController({
      initialLang: global.TakhunI18n?.getCurrentLang?.(),
      loadHome(lang) {
        if (!global.TakhunApi?.getHomeData) throw new Error("API_CLIENT_UNAVAILABLE");
        return global.TakhunApi.getHomeData({ lang }, { mock: (params) => mockHomeResponse(params.lang) });
      },
      onChange: render
    });

    retryButtons.forEach((button) => button.addEventListener("click", controller.retry));
    global.document.addEventListener("takhun:languagechange", (event) => {
      const lang = normalizeLang(event?.detail?.lang || global.TakhunI18n?.getCurrentLang?.());
      global.TakhunI18n?.applyTranslations?.(global.document);
      renderInspiration(lang);
      controller.setLanguage(lang);
    });
    const initialLang = normalizeLang(global.TakhunI18n?.getCurrentLang?.());
    renderInspiration(initialLang);
    controller.load();
  }

  global.TakhunHome = Object.freeze({
    HOME_DATA, MOCK_HOME_RESPONSE, normalizeLang, normalizeHomeResponse, resolveHomeState,
    setPrimaryState, safeImageUrl, placeDetailUrl, routeDetailUrl, categoryLabel,
    durationLabel, styleLabel, mapPlace, mapRoute, localizedInspiration, mockHomeResponse, createHomeController
  });
  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initializePage, { once: true });
  else if (global.document) initializePage();
})(window);
