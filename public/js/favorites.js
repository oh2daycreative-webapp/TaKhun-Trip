"use strict";

(function createFavoritesPage(global) {
  const STORAGE_KEY = "TAKHUN_FAVORITES";
  const STATE_NAMES = Object.freeze(["initial", "loading", "ready", "empty", "partial-error", "error", "malformed-storage-recovered"]);

  function validatePlaceId(value) {
    const id = String(value || "").trim();
    return id.length > 0 && id.length <= 64 && /^[A-Za-z0-9_-]+$/.test(id);
  }

  function sanitizeFavorites(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter((id) => {
      if (!validatePlaceId(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function parseFavoritesStorage(raw) {
    if (raw === null || raw === undefined || raw === "") return { ids: [], recovered: false };
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return { ids: [], recovered: true };
      return { ids: sanitizeFavorites(parsed), recovered: false };
    } catch (_error) { return { ids: [], recovered: true }; }
  }

  function serializeFavorites(value) { return JSON.stringify(sanitizeFavorites(value)); }
  function filterCanonicalFavorites(value, records = global.TakhunContentData?.listPlaces?.() || []) {
    const canonical = new Set((Array.isArray(records) ? records : []).map((item) => String(item?.place_id || "").trim()).filter(Boolean));
    return sanitizeFavorites(value).filter((id) => !id.startsWith("MOCK-") && (!canonical.size || canonical.has(id)));
  }
  function removeFavorite(value, placeId) { const id = String(placeId || "").trim(); return sanitizeFavorites(value).filter((item) => item !== id); }
  const encoded = (value) => encodeURIComponent(String(value || ""));
  function detailUrl(placeId) { return `place-detail.html?id=${encoded(placeId)}`; }
  function mapUrl(placeId) { return `map.html?focus=${encoded(placeId)}`; }
  function tripPlannerUrl(placeId) { return `trip-planner.html?add=${encoded(placeId)}`; }

  async function loadPlaceDetailsLimited(value, loader, concurrency = 4) {
    const ids = sanitizeFavorites(value);
    const results = new Array(ids.length);
    let nextIndex = 0;
    const workerCount = Math.min(ids.length, Math.max(1, Math.floor(Number(concurrency) || 1)));
    async function worker() {
      while (nextIndex < ids.length) {
        const index = nextIndex;
        nextIndex += 1;
        const placeId = ids[index];
        try {
          const place = await loader(placeId);
          if (!place || typeof place !== "object" || Array.isArray(place) || String(place.place_id || "").trim() !== placeId) throw new Error("MALFORMED_RESPONSE");
          results[index] = { placeId, status: "fulfilled", place };
        }
        catch (error) { results[index] = { placeId, status: "rejected", error }; }
      }
    }
    await Promise.all(Array.from({ length: workerCount }, worker));
    return results;
  }

  function mergeLoadedPlaces(ids, results) {
    const fulfilled = new Map((Array.isArray(results) ? results : []).filter((entry) => entry?.status === "fulfilled" && entry.place && validatePlaceId(entry.placeId)).map((entry) => [entry.placeId, entry.place]));
    return sanitizeFavorites(ids).map((id) => fulfilled.get(id)).filter(Boolean);
  }

  function classifyLoadResults(results) {
    const list = Array.isArray(results) ? results : [];
    if (!list.length) return "empty";
    const fulfilled = list.filter((entry) => entry?.status === "fulfilled").length;
    if (fulfilled === list.length) return "ready";
    return fulfilled ? "partial-error" : "error";
  }

  function createGenerationGate() {
    let generation = 0;
    return Object.freeze({ next() { generation += 1; return generation; }, invalidate() { generation += 1; return generation; }, isCurrent(value) { return value === generation; } });
  }

  function parseStorageEvent(event) {
    if (event?.key !== STORAGE_KEY) return { handled: false, ids: [], recovered: false };
    const parsed = parseFavoritesStorage(event.newValue);
    return { handled: true, ids: parsed.ids, recovered: parsed.recovered };
  }

  function resolveState({ initial = false, loading = false, ids = [], results = null, recovered = false } = {}) {
    if (initial) return "initial";
    if (loading) return "loading";
    if (recovered && (!Array.isArray(ids) || !ids.length)) return "malformed-storage-recovered";
    if (Array.isArray(results)) return classifyLoadResults(results);
    if (!Array.isArray(ids) || !ids.length) return "empty";
    return "loading";
  }

  function setPageState(states, active) {
    if (!STATE_NAMES.includes(active) || !states?.[active]) return false;
    for (const name of STATE_NAMES) if (states[name]) states[name].hidden = name !== active;
    return true;
  }

  function safeImageUrl(value) {
    const candidate = String(value || "").trim();
    if (!candidate) return "";
    try { const url = new URL(candidate); return url.protocol === "http:" || url.protocol === "https:" ? url.href : ""; }
    catch (_error) { return ""; }
  }

  function t(key) { return global.TakhunI18n?.t(key) || key; }
  function format(key, values) { return String(t(key)).replace(/\{(\w+)\}/g, (_match, name) => String(values?.[name] ?? "")); }
  function make(tag, className, text) { const element = global.document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
  function localized(place, field, lang) { return String(place?.[`${field}_${lang}`] || place?.[`${field}_th`] || place?.[field] || "").trim(); }

  function initializePage() {
    const root = global.document?.querySelector?.(".favorites-page");
    if (!root || !global.TakhunApi?.getPlaceDetail) return;
    const count = global.document.querySelector("[data-favorites-count]");
    const stateNodes = {};
    global.document.querySelectorAll("[data-favorites-state]").forEach((node) => { stateNodes[node.dataset.favoritesState] = node; });
    const gate = createGenerationGate();
    let ids = [];
    let results = [];
    let places = [];

    function currentLang() { return global.TakhunI18n?.getCurrentLang?.() || "th"; }
    function setPrimaryState(name) { setPageState(stateNodes, name); }
    function updateCount() { count.textContent = format(ids.length === 1 ? "favorites.saved_count_one" : "favorites.saved_count_many", { count: ids.length }); }

    function readStorage() {
      try { return parseFavoritesStorage(global.localStorage?.getItem(STORAGE_KEY) ?? null); }
      catch (_error) { return { ids: [], recovered: true }; }
    }

    function writeStorage(nextIds) {
      try { global.localStorage?.setItem(STORAGE_KEY, serializeFavorites(nextIds)); return true; }
      catch (_error) { return false; }
    }

    function fallbackMedia(name) { const fallback = make("div", "favorite-place-card__fallback", t("favorites.image_fallback")); fallback.setAttribute("role", "img"); fallback.setAttribute("aria-label", format("favorites.image_alt", { name })); return fallback; }

    function renderCard(place) {
      const lang = currentLang();
      const placeId = String(place?.place_id || "").trim();
      const name = localized(place, "name", lang) || t("favorites.unnamed");
      const description = localized(place, "short_description", lang);
      const card = make("article", "favorite-place-card place-card");
      const media = make("div", "favorite-place-card__media");
      const imageUrl = safeImageUrl(place?.cover_image_url);
      if (imageUrl) { const image = make("img", "favorite-place-card__image"); image.src = imageUrl; image.alt = format("favorites.image_alt", { name }); image.loading = "lazy"; image.addEventListener("error", () => media.replaceChildren(fallbackMedia(name)), { once: true }); media.append(image); }
      else media.append(fallbackMedia(name));
      const content = make("div", "favorite-place-card__content");
      content.append(make("h2", "favorite-place-card__title", name));
      if (place?.category) content.append(make("span", "badge badge--primary", String(place.category).replaceAll("_", " ")));
      if (description) content.append(make("p", "favorite-place-card__description", description));
      const actions = make("div", "favorite-place-card__actions");
      const detail = make("a", "button button--primary", t("favorites.view_details")); detail.href = detailUrl(placeId);
      const map = make("a", "button button--ghost", t("favorites.open_map")); map.href = mapUrl(placeId);
      const trip = make("a", "button button--secondary", t("favorites.add_to_trip")); trip.href = tripPlannerUrl(placeId);
      const remove = make("button", "button favorite-place-card__remove", t("favorites.remove_saved")); remove.type = "button"; remove.setAttribute("aria-label", `${t("favorites.remove_saved")}: ${name}`); remove.addEventListener("click", () => removeSaved(placeId));
      actions.append(detail, map, trip, remove);
      content.append(actions);
      card.append(media, content);
      return card;
    }

    function renderPlaces(state) {
      const mount = stateNodes[state]?.querySelector?.("[data-favorites-grid]");
      if (mount) mount.replaceChildren(...places.map(renderCard));
      updateCount();
      setPrimaryState(state);
    }

    function toast(message) { const mount = global.document.querySelector("[data-favorites-toast]"); if (!mount) return; const item = make("div", "toast-message toast-message--success", message); mount.replaceChildren(item); global.setTimeout?.(() => item.remove(), 2400); }

    function mockPlace(placeId) {
      const place = global.TakhunPlaceData?.getPlaceById?.(placeId);
      if (!place || place.status !== "published") { const error = new Error("NOT_FOUND"); error.code = "NOT_FOUND"; throw error; }
      return place;
    }

    async function loadIds(nextIds, recovered = false) {
      const sanitized = sanitizeFavorites(nextIds);
      ids = filterCanonicalFavorites(sanitized);
      const staleRecovered = recovered || ids.length !== sanitized.length;
      if (ids.length !== sanitized.length) writeStorage(ids);
      updateCount();
      const generation = gate.next();
      if (!ids.length) { results = []; places = []; setPrimaryState(staleRecovered ? "malformed-storage-recovered" : "empty"); return; }
      setPrimaryState("loading");
      const loaded = await loadPlaceDetailsLimited(ids, (placeId) => global.TakhunApi.getPlaceDetail(placeId, {}, { mock: () => mockPlace(placeId) }), 4);
      if (!gate.isCurrent(generation)) return;
      results = loaded;
      places = mergeLoadedPlaces(ids, results);
      const state = classifyLoadResults(results);
      if (state === "error") { setPrimaryState("error"); return; }
      renderPlaces(state);
    }

    function removeSaved(placeId) {
      const nextIds = removeFavorite(ids, placeId);
      if (!writeStorage(nextIds)) return;
      gate.invalidate();
      ids = nextIds;
      results = results.filter((entry) => entry.placeId !== placeId);
      places = places.filter((place) => place.place_id !== placeId);
      toast(t("favorites.removed"));
      if (!ids.length) { updateCount(); setPrimaryState("empty"); return; }
      renderPlaces(classifyLoadResults(results));
    }

    global.document.querySelector("[data-favorites-retry]")?.addEventListener("click", () => loadIds(ids));
    global.document.addEventListener("takhun:languagechange", () => { global.TakhunI18n?.applyTranslations?.(global.document); if (places.length) renderPlaces(classifyLoadResults(results)); else updateCount(); });
    global.addEventListener?.("storage", (event) => { const parsed = parseStorageEvent(event); if (parsed.handled) loadIds(parsed.ids, parsed.recovered); });
    const stored = readStorage();
    loadIds(stored.ids, stored.recovered);
  }

  global.TakhunFavorites = Object.freeze({
    STORAGE_KEY, validatePlaceId, sanitizeFavorites, parseFavoritesStorage, serializeFavorites, filterCanonicalFavorites,
    removeFavorite, detailUrl, mapUrl, tripPlannerUrl, loadPlaceDetailsLimited,
    mergeLoadedPlaces, classifyLoadResults, createGenerationGate, parseStorageEvent,
    resolveState, setPageState
  });
  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initializePage, { once: true }); else initializePage();
})(window);
