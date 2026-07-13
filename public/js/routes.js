"use strict";

(function createRoutesPages(global) {
  const MOCK_ROUTES = Object.freeze([
    Object.freeze({
      route_id: "MOCK-ROUTE-002",
      name_th: "เส้นทางตัวอย่างธรรมชาติและภาพถ่าย",
      name_en: "Sample Nature and Photo Route",
      short_description_th: "ข้อมูลสาธิตสำหรับทดสอบการ์ดเส้นทางทั่วไป",
      short_description_en: "Demo content for testing a standard route card.",
      description_th: "รายละเอียดตัวอย่างสำหรับทดสอบโครงสร้างหน้าเส้นทางเท่านั้น",
      description_en: "Sample content used only to test the route page structure.",
      duration: "ครึ่งวัน",
      travel_style: Object.freeze(["nature", "photo"]),
      cover_image_url: "",
      is_featured: false
    }),
    Object.freeze({
      route_id: "MOCK-ROUTE-001",
      name_th: "เส้นทางตัวอย่างบ้านตาขุน",
      name_en: "Sample Ban Ta Khun Route",
      short_description_th: "เส้นทางสาธิตสำหรับตรวจการเรียงจุดแวะและการแสดงผลสองภาษา",
      short_description_en: "A demo route for testing stop order and bilingual rendering.",
      description_th: "ข้อมูลทั้งหมดในเส้นทางนี้เป็นข้อมูลสาธิตและยังไม่ได้รับการยืนยัน",
      description_en: "All information on this route is demo content and has not been verified.",
      duration: "1 วัน",
      travel_style: Object.freeze(["nature", "community", "photo"]),
      cover_image_url: "",
      is_featured: true,
      places: Object.freeze([
        Object.freeze({ place_id: "MOCK-PLACE-010", stop_order: "10", name_th: "จุดแวะตัวอย่างลำดับสิบ", name_en: "Sample Stop Ten", short_description_th: "จุดแวะสาธิตสำหรับทดสอบลำดับแบบตัวเลข", short_description_en: "A demo stop for numeric ordering tests.", cover_image_url: "", phone: "", google_maps_url: "" }),
        Object.freeze({ place_id: "MOCK-PLACE-INVALID", stop_order: "later", name_th: "จุดแวะตัวอย่างไม่มีลำดับ", name_en: "Sample Unordered Stop", short_description_th: "รายการนี้ตั้งใจใช้ลำดับไม่ถูกต้องเพื่อทดสอบการวางไว้ท้ายรายการ", short_description_en: "This intentionally invalid order tests stable placement at the end.", cover_image_url: "", phone: "", google_maps_url: "" }),
        Object.freeze({ place_id: "MOCK-PLACE-002", stop_order: "2", name_th: "จุดแวะตัวอย่างลำดับสอง", name_en: "Sample Stop Two", short_description_th: "จุดแวะสาธิตที่ต้องแสดงก่อนลำดับสิบ", short_description_en: "A demo stop that must appear before stop ten.", cover_image_url: "", phone: "", google_maps_url: "" })
      ])
    }),
    Object.freeze({
      route_id: "MOCK-ROUTE-EMPTY",
      name_th: "เส้นทางตัวอย่างที่ยังไม่มีจุดแวะ",
      name_en: "Sample Route Without Stops",
      short_description_th: "ใช้ทดสอบสถานะเส้นทางที่ยังไม่มีจุดแวะ",
      short_description_en: "Used to test a route without stops.",
      description_th: "ข้อมูลสาธิตสำหรับทดสอบ Empty State ของ Timeline",
      description_en: "Demo content for the empty timeline state.",
      duration: "",
      travel_style: Object.freeze([]),
      cover_image_url: "",
      is_featured: false,
      places: Object.freeze([])
    })
  ]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function parseRouteId(search = global.location?.search || "") {
    return String(new URLSearchParams(search || "").get("id") || "").trim();
  }

  function validateRouteId(id) {
    const value = String(id || "").trim();
    return value.length > 0 && value.length <= 64 && /^[A-Za-z0-9_-]+$/.test(value);
  }

  function promoteFeaturedRoutes(routes) {
    const records = Array.isArray(routes) ? routes.map((route) => ({ ...route })) : [];
    return [
      ...records.filter((route) => route.is_featured === true),
      ...records.filter((route) => route.is_featured !== true)
    ];
  }

  function numericStopOrder(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function sortRouteStops(stops) {
    return (Array.isArray(stops) ? stops : [])
      .map((stop, index) => ({ value: { ...stop }, index, order: numericStopOrder(stop?.stop_order) }))
      .sort((left, right) => {
        if (left.order === null && right.order === null) return left.index - right.index;
        if (left.order === null) return 1;
        if (right.order === null) return -1;
        return left.order - right.order || left.index - right.index;
      })
      .map((entry) => entry.value);
  }

  function encoded(value) {
    return encodeURIComponent(String(value || ""));
  }

  function detailUrl(routeId) { return `route-detail.html?id=${encoded(routeId)}`; }
  function mapUrl(routeId) { return `map.html?route=${encoded(routeId)}`; }
  function tripPlannerUrl(routeId) { return `trip-planner.html?from_route=${encoded(routeId)}`; }
  function placeDetailUrl(placeId) { return `place-detail.html?id=${encoded(placeId)}`; }

  function resolveListState({ loading = false, items = [], error = null } = {}) {
    if (loading) return "loading";
    if (error) return "error";
    return Array.isArray(items) && items.length ? "ready" : "empty";
  }

  function resolveDetailState({ loading = false, id = "", route = null, error = null } = {}) {
    if (loading) return "loading";
    if (!validateRouteId(id)) return "invalid-id";
    if (error?.code === "NOT_FOUND") return "not-found";
    if (error) return "error";
    return route ? "ready" : "not-found";
  }

  function setPageState(mounts, state) {
    if (!mounts || !Object.prototype.hasOwnProperty.call(mounts, state)) throw new Error(`Unknown route page state: ${state}`);
    Object.entries(mounts).forEach(([key, mount]) => { if (mount) mount.hidden = key !== state; });
    return state;
  }

  function mockGetRoutes() {
    const items = MOCK_ROUTES.map(({ places: _places, ...route }) => route);
    return { items: clone(items), total: items.length };
  }

  function mockGetRouteDetail(routeId) {
    const found = MOCK_ROUTES.find((route) => route.route_id === String(routeId || "").trim());
    return found ? clone(found) : null;
  }

  async function loadRoutes(lang) {
    if (!global.TakhunApi?.getRoutes) throw new Error("API_CLIENT_UNAVAILABLE");
    return global.TakhunApi.getRoutes({ lang }, { mock: mockGetRoutes });
  }

  async function loadRouteDetail(routeId, lang) {
    if (!validateRouteId(routeId)) return null;
    if (!global.TakhunApi?.getRouteDetail) throw new Error("API_CLIENT_UNAVAILABLE");
    return global.TakhunApi.getRouteDetail(routeId, { lang }, {
      mock: () => {
        const route = mockGetRouteDetail(routeId);
        if (route) return route;
        const error = new Error("NOT_FOUND");
        error.code = "NOT_FOUND";
        throw error;
      }
    });
  }

  function t(key) { return global.TakhunI18n?.t?.(key) || key; }
  function format(key, values = {}) { return String(t(key)).replace(/\{(\w+)\}/g, (_match, name) => String(values[name] ?? "")); }
  function localized(item, field, lang) {
    const translated = global.TakhunI18n?.pickLangValue?.(item, field, lang) || item?.[`${field}_${lang}`] || item?.[`${field}_th`];
    return String(translated || item?.[field] || "").trim();
  }
  function make(tag, className = "", text) {
    const element = global.document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function listValue(value) {
    if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
    return String(value || "").split(/[|,]/).map((item) => item.trim()).filter(Boolean);
  }
  function isAllowedImageUrl(value) {
    const url = String(value || "").trim();
    return /^https:\/\//i.test(url) || /^data:image\/svg\+xml,/i.test(url);
  }
  function isMockMode() { return !String(global.APP_CONFIG?.API_URL || "").trim(); }
  function styleLabel(style) {
    const key = `routes_page.styles.${style}`;
    const label = t(key);
    return label === key ? String(style || "").replaceAll("_", " ") : label;
  }
  function appendImage(mount, source, name, className) {
    const fallback = () => {
      const panel = make("span", `${className}-fallback`, t("routes_page.image_fallback"));
      panel.setAttribute("role", "img");
      panel.setAttribute("aria-label", format("routes_page.image_alt", { name }));
      mount.replaceChildren(panel);
    };
    if (!isAllowedImageUrl(source)) { fallback(); return; }
    const image = global.document.createElement("img");
    image.className = className;
    image.src = source;
    image.alt = format("routes_page.image_alt", { name });
    image.loading = "lazy";
    image.addEventListener("error", fallback, { once: true });
    mount.append(image);
  }
  function renderStyles(route, className = "route-explorer-card__styles") {
    const styles = make("ul", className);
    styles.setAttribute("aria-label", t("routes_page.styles_label"));
    listValue(route?.travel_style).forEach((style) => styles.append(make("li", "chip", styleLabel(style))));
    return styles;
  }
  function renderRouteCard(route, featured = false) {
    const lang = global.TakhunI18n?.getCurrentLang?.() || "th";
    const name = localized(route, "name", lang);
    const card = make("article", `route-explorer-card${featured ? " route-explorer-card--featured" : ""}`);
    const mediaLink = make("a", "route-explorer-card__media");
    mediaLink.href = detailUrl(route.route_id);
    mediaLink.setAttribute("aria-label", format("routes_page.view_route_named", { name }));
    appendImage(mediaLink, route.cover_image_url, name, "route-explorer-card__image");
    if (featured) mediaLink.append(make("span", "route-explorer-card__featured-label", t("routes_page.featured_label")));
    const body = make("div", "route-explorer-card__body");
    const title = make("h3", "route-explorer-card__title");
    const titleLink = make("a", "", name); titleLink.href = detailUrl(route.route_id); title.append(titleLink);
    body.append(title);
    if (route.duration) {
      const duration = make("p", "route-explorer-card__duration");
      duration.append(make("span", "", t("routes_page.duration_label")), make("strong", "", String(route.duration)));
      body.append(duration);
    }
    const styles = renderStyles(route);
    if (styles.children.length) body.append(styles);
    const description = localized(route, "short_description", lang);
    if (description) body.append(make("p", "route-explorer-card__description", description));
    const actions = make("div", "route-explorer-card__actions");
    const detail = make("a", "button button--primary", t("routes_page.view_route")); detail.href = detailUrl(route.route_id);
    const map = make("a", "button button--secondary", t("routes_page.open_map")); map.href = mapUrl(route.route_id);
    actions.append(detail, map); body.append(actions); card.append(mediaLink, body);
    return card;
  }

  function initializeRoutesList() {
    const root = global.document?.querySelector?.(".routes-page");
    if (!root) return;
    const mounts = {
      loading: global.document.querySelector("[data-routes-loading]"),
      ready: global.document.querySelector("[data-routes-ready]"),
      empty: global.document.querySelector("[data-routes-empty]"),
      error: global.document.querySelector("[data-routes-error]")
    };
    let records = [];

    function render() {
      const ordered = promoteFeaturedRoutes(records);
      const featuredIndex = ordered.findIndex((route) => route.is_featured === true);
      const featured = featuredIndex >= 0 ? ordered[featuredIndex] : null;
      const remaining = featured ? ordered.filter((_route, index) => index !== featuredIndex) : ordered;
      const featuredSection = global.document.querySelector("[data-routes-featured-section]");
      const featuredMount = global.document.querySelector("[data-routes-featured]");
      const grid = global.document.querySelector("[data-routes-grid]");
      featuredSection.hidden = !featured;
      featuredMount.replaceChildren(...(featured ? [renderRouteCard(featured, true)] : []));
      grid.replaceChildren(...remaining.map((route) => renderRouteCard(route)));
      global.document.querySelector(".routes-page__all").hidden = remaining.length === 0;
      setPageState(mounts, resolveListState({ items: records }));
    }

    async function fetchRoutes() {
      setPageState(mounts, "loading");
      try {
        const lang = global.TakhunI18n?.getCurrentLang?.() || "th";
        const data = await loadRoutes(lang);
        if (!data || !Array.isArray(data.items)) throw new Error("INVALID_ROUTE_LIST");
        records = data.items.map((route) => ({ ...route }));
        global.document.querySelector("[data-routes-demo-notice]").hidden = !isMockMode();
        render();
      } catch (_error) {
        records = [];
        setPageState(mounts, "error");
      }
    }

    global.document.querySelector("[data-routes-retry]")?.addEventListener("click", fetchRoutes);
    global.document.addEventListener("takhun:languagechange", () => {
      global.TakhunI18n?.applyTranslations?.(global.document);
      if (records.length) render();
    });
    fetchRoutes();
  }

  function appendDetailImage(mount, route, name) {
    const fallback = () => {
      const panel = make("div", "route-detail-page__image-fallback", t("route_detail.image_fallback"));
      panel.setAttribute("role", "img"); panel.setAttribute("aria-label", format("route_detail.image_alt", { name }));
      mount.replaceChildren(panel);
    };
    if (!isAllowedImageUrl(route.cover_image_url)) { fallback(); return; }
    const image = global.document.createElement("img"); image.className = "route-detail-page__image"; image.src = route.cover_image_url; image.alt = format("route_detail.image_alt", { name });
    image.addEventListener("error", fallback, { once: true }); mount.append(image);
  }
  function renderRouteDetail(route) {
    const lang = global.TakhunI18n?.getCurrentLang?.() || "th";
    const name = localized(route, "name", lang);
    global.document.title = format("route_detail.page_title", { name });
    const media = global.document.querySelector("[data-route-detail-media]"); media.replaceChildren(); appendDetailImage(media, route, name);
    const summary = global.document.querySelector("[data-route-detail-summary]");
    const title = make("h1", "route-detail-page__title", name);
    const meta = make("div", "route-detail-page__meta");
    if (route.duration) { const item = make("p", ""); item.append(make("span", "", t("route_detail.duration")), make("strong", "", String(route.duration))); meta.append(item); }
    const styles = renderStyles(route, "route-detail-page__styles");
    summary.replaceChildren(title); if (meta.children.length) summary.append(meta); if (styles.children.length) summary.append(styles);
    global.document.querySelector("[data-route-detail-description]").textContent = localized(route, "description", lang) || localized(route, "short_description", lang);
    global.document.querySelector("[data-route-map-link]").href = mapUrl(route.route_id);
    global.document.querySelector("[data-route-trip-link]").href = tripPlannerUrl(route.route_id);
    global.document.querySelector("[data-route-detail-demo-notice]").hidden = !isMockMode();

    const timeline = global.document.querySelector("[data-route-timeline]");
    const empty = global.document.querySelector("[data-route-timeline-empty]");
    const stops = sortRouteStops(route.places);
    timeline.replaceChildren(...stops.map((stop, index) => {
      const stopName = localized(stop, "name", lang);
      const item = make("article", "route-stop");
      const rail = make("div", "route-stop__rail"); rail.append(make("span", "route-stop__number", String(index + 1)), make("span", "route-stop__line"));
      const card = make("div", "route-stop__card");
      const mediaMount = make("div", "route-stop__media");
      const imageFallback = () => { const fallback = make("span", "route-stop__image-fallback", t("routes_page.image_fallback")); fallback.setAttribute("role", "img"); fallback.setAttribute("aria-label", format("route_detail.stop_image_alt", { name: stopName })); mediaMount.replaceChildren(fallback); };
      if (isAllowedImageUrl(stop.cover_image_url)) { const image = global.document.createElement("img"); image.src = stop.cover_image_url; image.alt = format("route_detail.stop_image_alt", { name: stopName }); image.loading = "lazy"; image.addEventListener("error", imageFallback, { once: true }); mediaMount.append(image); } else imageFallback();
      const body = make("div", "route-stop__body"); body.append(make("p", "route-stop__eyebrow", format("route_detail.stop_number", { number: index + 1 })), make("h3", "route-stop__title", stopName));
      const copy = localized(stop, "short_description", lang); if (copy) body.append(make("p", "route-stop__description", copy));
      const actions = make("div", "route-stop__actions");
      if (stop.place_id) { const place = make("a", "button button--secondary", t("route_detail.view_place")); place.href = placeDetailUrl(stop.place_id); actions.append(place); }
      if (String(stop.phone || "").trim()) { const call = make("a", "button button--ghost", t("route_detail.call")); call.href = `tel:${String(stop.phone).replace(/[^+\d]/g, "")}`; actions.append(call); }
      body.append(actions); card.append(mediaMount, body); item.append(rail, card); return item;
    }));
    empty.hidden = stops.length > 0;
  }

  function initializeRouteDetail() {
    const root = global.document?.querySelector?.(".route-detail-page");
    if (!root) return;
    const mounts = {
      loading: global.document.querySelector("[data-route-detail-loading]"),
      ready: global.document.querySelector("[data-route-detail-ready]"),
      "invalid-id": global.document.querySelector("[data-route-detail-invalid]"),
      "not-found": global.document.querySelector("[data-route-detail-not-found]"),
      error: global.document.querySelector("[data-route-detail-error]")
    };
    const id = parseRouteId();
    let route = null;

    function renderCached() {
      if (!route) return;
      renderRouteDetail(route);
      setPageState(mounts, "ready");
    }
    async function fetchDetail() {
      const initialState = resolveDetailState({ loading: false, id });
      if (initialState === "invalid-id") { setPageState(mounts, initialState); return; }
      setPageState(mounts, "loading");
      try {
        const lang = global.TakhunI18n?.getCurrentLang?.() || "th";
        route = await loadRouteDetail(id, lang);
        const state = resolveDetailState({ id, route });
        if (state !== "ready") { setPageState(mounts, state); return; }
        renderCached();
      } catch (error) {
        route = null;
        setPageState(mounts, resolveDetailState({ id, error }));
      }
    }
    global.document.querySelector("[data-route-detail-retry]")?.addEventListener("click", fetchDetail);
    global.document.addEventListener("takhun:languagechange", () => { global.TakhunI18n?.applyTranslations?.(global.document); renderCached(); });
    fetchDetail();
  }

  const api = {
    parseRouteId,
    validateRouteId,
    promoteFeaturedRoutes,
    sortRouteStops,
    detailUrl,
    mapUrl,
    tripPlannerUrl,
    placeDetailUrl,
    resolveListState,
    resolveDetailState,
    setPageState,
    mockGetRoutes,
    mockGetRouteDetail,
    loadRoutes,
    loadRouteDetail
  };

  global.TakhunRoutes = Object.freeze(api);
  if (global.document?.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", () => { initializeRoutesList(); initializeRouteDetail(); }, { once: true });
  } else {
    initializeRoutesList(); initializeRouteDetail();
  }
})(window);
