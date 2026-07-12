"use strict";

(function createPlacesPage(global) {
  const FAVORITES_KEY = "TAKHUN_FAVORITES";
  const PAGE_SIZE = 12;
  const FILTER_KEYS = Object.freeze(["district", "category", "route_group"]);
  function createPageState() {
    return { records: [], filters: { keyword: "", district: "", category: "", route_group: "" }, page: 1, status: "idle", error: null };
  }

  async function loadPlaces() {
    if (!global.TakhunPlaceData?.listPlaces) throw new Error("Shared mock place data is unavailable.");
    return global.TakhunPlaceData.listPlaces();
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
