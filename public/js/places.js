"use strict";

(function createPlacesPage(global) {
  const FAVORITES_KEY = "TAKHUN_FAVORITES";
  const PAGE_SIZE = 12;
  const FILTER_KEYS = Object.freeze(["district", "category", "route_group"]);
  const DEMO_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 520'%3E%3Cdefs%3E%3ClinearGradient id='g' x2='1' y2='1'%3E%3Cstop stop-color='%2300796B'/%3E%3Cstop offset='1' stop-color='%2318B7B5'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='800' height='520' fill='url(%23g)'/%3E%3Cpath d='M0 420 180 210l120 125 130-190 160 205 95-105 115 175' fill='%23064E3B' opacity='.72'/%3E%3Ccircle cx='650' cy='115' r='58' fill='%23FDBA2D'/%3E%3Ctext x='40' y='480' fill='white' font-size='36' font-family='sans-serif'%3EDEMO%3C/text%3E%3C/svg%3E";

  const DEMO_PLACES = Object.freeze([
    demo("001", "จุดชมธรรมชาติตัวอย่าง 1", "Sample Nature Stop 1", "ban_ta_khun", "nature", "main_point_1", true, true, true),
    demo("002", "ชุมชนท่องเที่ยวตัวอย่าง 2", "Sample Community Stop 2", "ban_ta_khun", "community_tourism", "main_point_1", true, false, true),
    demo("003", "จุดชมวิวตัวอย่าง 3", "Sample Viewpoint 3", "ban_ta_khun", "viewpoint", "main_point_2", false, true, false),
    demo("004", "คาเฟ่ตัวอย่าง 4", "Sample Café 4", "ban_ta_khun", "food_cafe", "main_point_2", true, false, false),
    demo("005", "กิจกรรมกลางแจ้งตัวอย่าง 5", "Sample Outdoor Activity 5", "khiri_rat_nikhom", "activity", "", false, true, true),
    demo("006", "พื้นที่ธรรมชาติตัวอย่าง 6", "Sample Nature Area 6", "khiri_rat_nikhom", "nature", "", true, false, false),
    demo("007", "ชุมชนตัวอย่าง 7", "Sample Community 7", "khiri_rat_nikhom", "community_tourism", "", false, false, true),
    demo("008", "จุดชมวิวตัวอย่าง 8", "Sample Viewpoint 8", "phanom", "viewpoint", "nearby_phanom", true, true, false),
    demo("009", "กิจกรรมตัวอย่าง 9", "Sample Activity 9", "phanom", "activity", "nearby_phanom", false, false, false),
    demo("010", "คาเฟ่ตัวอย่าง 10", "Sample Café 10", "phanom", "food_cafe", "nearby_phanom", true, false, true),
    demo("011", "เส้นทางธรรมชาติตัวอย่าง 11", "Sample Nature Trail 11", "ban_ta_khun", "nature", "main_point_1", false, true, false),
    demo("012", "กิจกรรมชุมชนตัวอย่าง 12", "Sample Community Activity 12", "ban_ta_khun", "community_tourism", "main_point_2", true, false, false),
    demo("013", "จุดพักตัวอย่าง 13", "Sample Rest Stop 13", "ban_ta_khun", "viewpoint", "main_point_1", false, false, false),
    { ...demo("014", "ข้อมูลร่างตัวอย่าง", "Sample Draft", "ban_ta_khun", "nature", "main_point_1", false, false, false), status: "draft" }
  ]);

  function demo(id, nameTh, nameEn, district, category, routeGroup, image, coordinates, navigation) {
    return Object.freeze({
      place_id: `MOCK-PLACE-${id}`, name_th: nameTh, name_en: nameEn,
      district, province: "สุราษฎร์ธานี", route_group: routeGroup, category,
      short_description_th: "ข้อความสาธิตสำหรับทดสอบหน้ารายการ ไม่ใช่รายละเอียดสถานที่ที่ได้รับการยืนยัน",
      short_description_en: "Demo copy for testing the list page; this is not verified place information.",
      cover_image_url: image ? DEMO_IMAGE : "", phone: "",
      google_maps_url: navigation ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nameEn)}` : "",
      latitude: coordinates ? 8.9 + Number(id) / 1000 : null,
      longitude: coordinates ? 98.9 + Number(id) / 1000 : null,
      coordinate_status: coordinates ? "approximate" : "no_coordinate",
      is_featured: false, is_main_route_point: false, sort_order: Number(id), status: "published"
    });
  }

  function createPageState() {
    return { records: [], filters: { keyword: "", district: "", category: "", route_group: "" }, page: 1, status: "idle", error: null };
  }

  async function loadPlaces() {
    return DEMO_PLACES.map((place) => ({ ...place }));
  }

  function getFilterOptions(records) {
    const published = records.filter((place) => place?.status === "published");
    const unique = (field) => [...new Set(published.map((place) => String(place?.[field] || "").trim()).filter(Boolean))].sort();
    return { districts: unique("district"), categories: unique("category"), routeGroups: unique("route_group") };
  }

  function parseQuery(search, options) {
    const params = new URLSearchParams(search || "");
    const allowed = { district: options?.districts || [], category: options?.categories || [], route_group: options?.routeGroups || [] };
    return {
      keyword: String(params.get("keyword") || "").trim(),
      district: allowed.district.includes(params.get("district")) ? params.get("district") : "",
      category: allowed.category.includes(params.get("category")) ? params.get("category") : "",
      route_group: allowed.route_group.includes(params.get("route_group")) ? params.get("route_group") : ""
    };
  }

  function localized(place, field, lang) {
    if (global.TakhunI18n?.pickLangValue) return global.TakhunI18n.pickLangValue(place, field, lang);
    return String(place?.[`${field}_${lang}`] || place?.[`${field}_th`] || "");
  }

  function filterPlaces(records, filters, lang = "th") {
    const keyword = String(filters?.keyword || "").trim().toLocaleLowerCase();
    return records.filter((place) => {
      if (place?.status !== "published") return false;
      if (filters?.district && place.district !== filters.district) return false;
      if (filters?.category && place.category !== filters.category) return false;
      if (filters?.route_group && place.route_group !== filters.route_group) return false;
      if (!keyword) return true;
      const searchable = [localized(place, "name", lang), localized(place, "name", "th"), localized(place, "short_description", lang), localized(place, "short_description", "th")].join(" ").toLocaleLowerCase();
      return searchable.includes(keyword);
    });
  }

  function paginatePlaces(records, page = 1, pageSize = PAGE_SIZE) {
    const shown = records.slice(0, Math.max(1, page) * pageSize);
    return { items: shown, hasMore: shown.length < records.length, total: records.length, shown: shown.length };
  }

  function detailUrl(placeId) { return `place-detail.html?id=${encodeURIComponent(String(placeId || ""))}`; }
  function canOpenMap(place) { return Number.isFinite(Number(place?.latitude)) && Number.isFinite(Number(place?.longitude)) && place?.latitude !== null && place?.longitude !== null; }

  let memoryFavorites = null;
  function normalizeFavorites(value) { return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))] : []; }
  function readFavorites() {
    if (memoryFavorites) return [...memoryFavorites];
    try { memoryFavorites = normalizeFavorites(JSON.parse(global.localStorage?.getItem(FAVORITES_KEY) || "[]")); }
    catch (_error) { memoryFavorites = []; }
    return [...memoryFavorites];
  }
  function writeFavorites(value) {
    memoryFavorites = normalizeFavorites(value);
    try { global.localStorage?.setItem(FAVORITES_KEY, JSON.stringify(memoryFavorites)); } catch (_error) { /* memory fallback */ }
    return [...memoryFavorites];
  }
  function toggleFavorite(placeId) {
    const id = String(placeId || "").trim();
    const current = readFavorites();
    return writeFavorites(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function t(key) { return global.TakhunI18n?.t(key) || key; }
  function format(key, values) { return String(t(key)).replace(/\{(\w+)\}/g, (_match, name) => String(values?.[name] ?? "")); }
  function make(tag, className, text) { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
  function labelFor(group, value) {
    const namespace = group === "district" ? "districts" : group === "category" ? "categories" : "route_groups";
    const translated = t(`places.${namespace}.${value}`);
    return translated.startsWith("places.") ? value.replaceAll("_", " ") : translated;
  }

  function initializePage() {
    const root = document.querySelector(".places-page");
    if (!root) return;
    const state = createPageState();
    const grid = document.querySelector("[data-places-grid]");
    const stateMount = document.querySelector("[data-places-state]");
    const summary = document.querySelector("[data-results-summary]");
    const search = document.querySelector("[data-places-search]");
    const clear = document.querySelector("[data-search-clear]");
    const loadMore = document.querySelector("[data-load-more]");
    let options = { districts: [], categories: [], routeGroups: [] };
    let debounceTimer;

    function setStatus(status, messageKey, retry = false) {
      state.status = status; stateMount.replaceChildren();
      stateMount.hidden = status === "ready";
      stateMount.setAttribute("role", status === "error" ? "alert" : "status");
      if (status === "ready") return;
      const panel = make("div", `${status}-state`);
      panel.append(make("p", `${status}-state__description`, t(messageKey)));
      if (retry) { const button = make("button", "button button--secondary", t("places.retry")); button.type = "button"; button.addEventListener("click", fetchRecords); panel.append(button); }
      stateMount.append(panel);
    }

    function renderFilters() {
      const groups = { district: options.districts, category: options.categories, route_group: options.routeGroups };
      for (const [group, values] of Object.entries(groups)) {
        const mount = document.querySelector(`[data-filter-options="${group}"]`); if (!mount) continue;
        mount.replaceChildren();
        for (const value of ["", ...values]) {
          const active = state.filters[group] === value;
          const button = make("button", `chip${active ? " is-active" : ""}`, value ? labelFor(group, value) : t("places.all"));
          button.type = "button"; button.dataset.filterValue = value; button.setAttribute("aria-pressed", String(active));
          button.addEventListener("click", () => { state.filters[group] = value; state.page = 1; syncUrl("push"); render(); });
          mount.append(button);
        }
      }
    }

    function fallbackMedia(name) { const fallback = make("div", "place-card__image-fallback", t("places.image_fallback")); fallback.setAttribute("role", "img"); fallback.setAttribute("aria-label", format("places.image_alt", { name })); return fallback; }
    function renderCard(place, favorites) {
      const lang = global.TakhunI18n?.getCurrentLang?.() || "th";
      const name = localized(place, "name", lang); const description = localized(place, "short_description", lang);
      const card = make("article", "place-card place-card--listing");
      const media = make("div", "place-card__image-wrap");
      if (place.cover_image_url) { const image = document.createElement("img"); image.className = "place-card__image"; image.src = place.cover_image_url; image.alt = format("places.image_alt", { name }); image.addEventListener("error", () => media.replaceChildren(fallbackMedia(name)), { once: true }); media.append(image); } else media.append(fallbackMedia(name));
      const saved = favorites.includes(place.place_id);
      const favorite = make("button", `favorite-btn place-card__favorite${saved ? " is-active" : ""}`, saved ? "♥" : "♡"); favorite.type = "button"; favorite.setAttribute("aria-pressed", String(saved)); favorite.setAttribute("aria-label", format(saved ? "places.favorite_remove" : "places.favorite_add", { name }));
      favorite.addEventListener("click", () => { const next = toggleFavorite(place.place_id); showToast(t(next.includes(place.place_id) ? "places.favorite_added" : "places.favorite_removed")); render(); });
      media.append(favorite);
      const content = make("div", "place-card__content");
      const badges = make("div", "place-card__badges"); badges.append(make("span", "badge badge--primary", labelFor("category", place.category)));
      if (place.route_group) badges.append(make("span", "badge badge--muted", labelFor("route_group", place.route_group)));
      content.append(badges, make("h3", "place-card__title", name), make("p", "place-card__meta", labelFor("district", place.district)), make("p", "place-card__description", description));
      const actions = make("div", "place-card__actions"); const detail = make("a", "button button--primary", t("places.view_details")); detail.href = detailUrl(place.place_id); actions.append(detail);
      if (canOpenMap(place)) { const map = make("a", "button button--ghost", t("places.view_map")); map.href = `map.html?focus=${encodeURIComponent(place.place_id)}`; actions.append(map); }
      if (place.google_maps_url) { const navigate = make("a", "button button--secondary", t("places.navigate")); navigate.href = place.google_maps_url; navigate.target = "_blank"; navigate.rel = "noopener noreferrer"; actions.append(navigate); }
      content.append(actions); card.append(media, content); return card;
    }

    function render() {
      const lang = global.TakhunI18n?.getCurrentLang?.() || "th";
      const filtered = filterPlaces(state.records, state.filters, lang); const page = paginatePlaces(filtered, state.page);
      grid.replaceChildren(...page.items.map((place) => renderCard(place, readFavorites())));
      const hasFilters = Object.values(state.filters).some(Boolean);
      setStatus(page.total ? "ready" : "empty", hasFilters ? "places.empty_filtered" : "places.empty_all");
      summary.textContent = format("places.results_summary", { total: page.total, shown: page.shown });
      loadMore.hidden = !page.hasMore; clear.hidden = !state.filters.keyword; search.value = state.filters.keyword;
      renderFilters();
    }

    function syncUrl(mode = "replace") {
      const params = new URLSearchParams();
      for (const key of ["keyword", ...FILTER_KEYS]) if (state.filters[key]) params.set(key, state.filters[key]);
      const url = `${global.location.pathname}${params.toString() ? `?${params}` : ""}`;
      global.history?.[mode === "push" ? "pushState" : "replaceState"]?.({}, "", url);
    }

    async function fetchRecords() {
      grid.replaceChildren(); summary.textContent = t("places.loading"); loadMore.hidden = true; setStatus("loading", "places.loading");
      try { state.records = await loadPlaces(); options = getFilterOptions(state.records); state.filters = parseQuery(global.location.search, options); state.page = 1; render(); }
      catch (error) { state.error = error; setStatus("error", "places.error", true); }
    }

    search.addEventListener("input", () => { clearTimeout(debounceTimer); clear.hidden = !search.value; debounceTimer = setTimeout(() => { state.filters.keyword = search.value.trim(); state.page = 1; syncUrl("replace"); render(); }, 250); });
    clear.addEventListener("click", () => { clearTimeout(debounceTimer); search.value = ""; state.filters.keyword = ""; state.page = 1; syncUrl("replace"); render(); search.focus(); });
    loadMore.addEventListener("click", () => { state.page += 1; render(); });
    global.addEventListener("popstate", () => { state.filters = parseQuery(global.location.search, options); state.page = 1; render(); });
    document.addEventListener("takhun:languagechange", () => { global.TakhunI18n?.applyTranslations(document); render(); });
    fetchRecords();
  }

  function showToast(message) {
    let container = document.querySelector(".toast-container");
    if (!container) { container = make("div", "toast-container"); container.setAttribute("aria-live", "polite"); document.body.append(container); }
    const toast = make("div", "toast-message toast-message--success", message); container.replaceChildren(toast); global.setTimeout(() => toast.remove(), 2400);
  }

  global.TakhunPlaces = Object.freeze({ loadPlaces, parseQuery, filterPlaces, getFilterOptions, paginatePlaces, detailUrl, canOpenMap, readFavorites, writeFavorites, toggleFavorite, createPageState });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializePage, { once: true }); else initializePage();
})(window);
