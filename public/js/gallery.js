"use strict";

(function createGalleryPage(global) {
  const CATEGORIES = Object.freeze(["dam_lake", "mountain_nature", "community_life", "food_fruit", "activity_tradition"]);
  const MEDIA_TYPES = Object.freeze(["image", "video"]);
  const FILTER_KEYS = Object.freeze(["category", "media_type", "related_place_id"]);
  const STATE_NAMES = Object.freeze(["initial", "loading", "ready", "empty", "filtered-empty", "error", "invalid-filter", "malformed-response", "media-load-error"]);

  function validId(value) {
    const id = String(value || "").trim();
    return id.length > 0 && id.length <= 64 && /^[A-Za-z0-9_-]+$/.test(id);
  }

  const validateMediaId = validId;
  function validateCategory(value) { return CATEGORIES.includes(String(value || "").trim().toLowerCase()); }
  function validateMediaType(value) { return MEDIA_TYPES.includes(String(value || "").trim().toLowerCase()); }
  function normalizeMediaType(value) { const normalized = String(value || "").trim().toLowerCase(); return validateMediaType(normalized) ? normalized : ""; }

  function parseGalleryFilters(search = global.location?.search || "") {
    const params = new URLSearchParams(search || "");
    const filters = {};
    const invalid = [];
    const category = String(params.get("category") || "").trim().toLowerCase();
    const mediaType = String(params.get("media_type") || "").trim().toLowerCase();
    const relatedPlaceId = String(params.get("related_place_id") || "").trim();
    if (category) { if (validateCategory(category)) filters.category = category; else invalid.push("category"); }
    if (mediaType) { if (validateMediaType(mediaType)) filters.media_type = mediaType; else invalid.push("media_type"); }
    if (relatedPlaceId) { if (validId(relatedPlaceId)) filters.related_place_id = relatedPlaceId; else invalid.push("related_place_id"); }
    return { filters, invalid };
  }

  function filterGallery(items, filters = {}) {
    return (Array.isArray(items) ? items : []).filter((item) => {
      if (filters.category && item?.category !== filters.category) return false;
      if (filters.media_type && normalizeMediaType(item?.media_type) !== filters.media_type) return false;
      if (filters.related_place_id && String(item?.related_place_id || "").trim() !== filters.related_place_id) return false;
      return true;
    });
  }

  function clearFilters() { return {}; }

  function localized(item, field, lang = "th") {
    if (!item || !field) return "";
    const language = lang === "en" ? "en" : "th";
    return String(item[`${field}_${language}`] || item[`${field}_th`] || item[field] || "").trim();
  }

  function galleryCategoryOptions(lang = "th") {
    const language = lang === "en" ? "en" : "th";
    return (global.TakhunContentData?.listGalleryCategories?.() || [])
      .filter((category) => CATEGORIES.includes(String(category?.category_id || "")))
      .map((category) => ({ value: category.category_id, label: String(category[`name_${language}`] || category.name_th || "").trim() }));
  }

  function safeHttpUrl(value) {
    const candidate = String(value || "").trim();
    if (!candidate) return "";
    try {
      const url = new URL(candidate);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch (_error) { return ""; }
  }

  const safeMediaUrl = safeHttpUrl;
  const safeThumbnailUrl = safeHttpUrl;
  const safeExternalUrl = safeHttpUrl;

  function isDirectVideoUrl(value) {
    const safe = safeMediaUrl(value);
    if (!safe) return false;
    try { return /\.(?:mp4|webm|ogg)$/i.test(new URL(safe).pathname); }
    catch (_error) { return false; }
  }

  function normalizeBoolean(value) { return value === true || value === 1 || String(value).toLowerCase() === "true" || value === "1"; }
  function normalizeSortOrder(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function sortGalleryItems(items) {
    return (Array.isArray(items) ? items : []).map((item, index) => ({ item, index, featured: normalizeBoolean(item?.is_featured), order: normalizeSortOrder(item?.sort_order) }))
      .sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        if (a.order === null && b.order !== null) return 1;
        if (a.order !== null && b.order === null) return -1;
        if (a.order !== null && b.order !== null && a.order !== b.order) return a.order - b.order;
        return a.index - b.index;
      }).map((entry) => entry.item);
  }

  const encoded = (value) => encodeURIComponent(String(value || ""));
  function relatedPlaceUrl(placeId) { return `place-detail.html?id=${encoded(placeId)}`; }
  function mapUrl(placeId) { return `map.html?focus=${encoded(placeId)}`; }

  function normalizeGalleryResponse(data) {
    if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.items)) throw new Error("MALFORMED_RESPONSE");
    const items = data.items.map((item) => {
      if (!item || typeof item !== "object" || !validateMediaId(item.media_id) || !validateMediaType(item.media_type)) throw new Error("MALFORMED_RESPONSE");
      return { ...item, media_type: normalizeMediaType(item.media_type) };
    });
    return { items, total: Number.isFinite(Number(data.total)) ? Number(data.total) : items.length };
  }

  function resolveState({ initial = false, loading = false, invalidFilter = false, malformed = false, error = false, mediaLoadError = false, items = [], filtered = false } = {}) {
    if (initial) return "initial";
    if (loading) return "loading";
    if (invalidFilter) return "invalid-filter";
    if (malformed) return "malformed-response";
    if (error) return "error";
    if (mediaLoadError) return "media-load-error";
    if (!Array.isArray(items) || !items.length) return filtered ? "filtered-empty" : "empty";
    return "ready";
  }

  function setPageState(states, active) {
    if (!STATE_NAMES.includes(active) || !states?.[active]) return false;
    for (const name of STATE_NAMES) if (states[name]) states[name].hidden = name !== active;
    return true;
  }

  function createRequestGate() {
    let generation = 0;
    return Object.freeze({ begin() { generation += 1; return generation; }, isCurrent(value) { return value === generation; } });
  }

  function createViewerState() { return { isOpen: false, item: null, mode: "", returnFocus: null }; }
  function openViewerState(state, item, trigger = null) {
    const mediaType = normalizeMediaType(item?.media_type);
    let mode = "invalid";
    if (mediaType === "image" && validateMediaId(item?.media_id)) mode = "image";
    if (mediaType === "video" && isDirectVideoUrl(item?.video_url || item?.media_url)) mode = "video";
    else if (mediaType === "video" && safeExternalUrl(item?.video_url || item?.media_url)) mode = "external";
    return { ...createViewerState(), ...state, isOpen: true, item: item ? { ...item } : null, mode, returnFocus: trigger };
  }
  function closeViewerState(state) { return { ...createViewerState(), returnFocus: state?.returnFocus || null }; }

  function mockGallery(params = {}) {
    const items = global.TakhunContentData.listGallery();
    const filtered = filterGallery(items, params);
    return { items: sortGalleryItems(filtered).map((item) => ({ ...item })), total: filtered.length };
  }

  function t(key) { return global.TakhunI18n?.t(key) || key; }
  function format(key, values) { return String(t(key)).replace(/\{(\w+)\}/g, (_match, name) => String(values?.[name] ?? "")); }
  function make(tag, className, text) { const element = global.document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }

  function renderGalleryCategoryOptions(select, lang, selectedValue = "") {
    if (!select?.replaceChildren) return;
    const all = make("option", "", t("gallery.all_media"));
    all.value = "";
    const options = galleryCategoryOptions(lang).map((item) => {
      const option = make("option", "", item.label);
      option.value = item.value;
      return option;
    });
    select.replaceChildren(all, ...options);
    select.value = CATEGORIES.includes(selectedValue) ? selectedValue : "";
  }

  function initializePage() {
    const root = global.document?.querySelector?.(".gallery-page");
    if (!root || !global.TakhunApi?.getGallery) return;
    const main = global.document.querySelector("#main-content");
    const form = global.document.querySelector("[data-gallery-filters]");
    const categorySelect = form?.querySelector?.('[data-gallery-filter="category"]');
    const grid = global.document.querySelector("[data-gallery-grid]");
    const summary = global.document.querySelector("[data-gallery-summary]");
    const viewer = global.document.querySelector("[data-gallery-viewer]");
    const viewerMedia = global.document.querySelector("[data-gallery-viewer-media]");
    const viewerTitle = global.document.querySelector("[data-gallery-viewer-title]");
    const viewerCaption = global.document.querySelector("[data-gallery-viewer-caption]");
    const closeButton = global.document.querySelector("[data-gallery-viewer-close]");
    const stateNodes = {};
    global.document.querySelectorAll("[data-gallery-state]").forEach((node) => { stateNodes[node.dataset.galleryState] = node; });
    const gate = createRequestGate();
    let records = [];
    let filters = {};
    let viewerState = createViewerState();
    let viewerIndex = -1;

    function currentLang() { return global.TakhunI18n?.getCurrentLang?.() || "th"; }
    function setPrimaryState(name) { setPageState(stateNodes, name); }
    function filtersActive() { return FILTER_KEYS.some((key) => Boolean(filters[key])); }
    function syncControls() { form?.querySelectorAll?.("[data-gallery-filter]").forEach((control) => { control.value = filters[control.dataset.galleryFilter] || ""; }); }
    function filtersUrl() { const params = new URLSearchParams(); FILTER_KEYS.forEach((key) => { if (filters[key]) params.set(key, filters[key]); }); return `${global.location.pathname}${params.toString() ? `?${params}` : ""}`; }

    function fallbackMedia(name, messageKey = "gallery.invalid_media") {
      const fallback = make("div", "gallery-card__fallback", t(messageKey));
      fallback.setAttribute("role", "img");
      fallback.setAttribute("aria-label", format("gallery.image_alt", { name }));
      return fallback;
    }

    function videoSourceUrl(item) { return safeMediaUrl(item.video_url || item.media_url); }

    function renderCard(item, index) {
      const lang = currentLang();
      const name = localized(item, "title", lang) || localized(item, "caption", lang) || t("gallery.unnamed");
      const caption = localized(item, "caption", lang);
      const type = normalizeMediaType(item.media_type);
      const card = make("article", "gallery-card");
      const media = make("div", "gallery-card__media");
      const fallbackFactory = () => fallbackMedia(name);
      if (global.TakhunMedia?.renderImage) global.TakhunMedia.renderImage(media, { mediaId: global.TakhunMedia.mediaIdFor("gallery", item.media_id), type: "gallery", role: "gallery", className: "gallery-card__image", fallbackAlt: localized(item, "alt_text", lang) || format("gallery.image_alt", { name }), loading: "lazy", sizes: "(min-width: 1080px) 33vw, (min-width: 640px) 50vw, 100vw", lang, fallbackFactory });
      else media.append(fallbackFactory());
      media.append(make("span", "gallery-card__badge", t(type === "video" ? "gallery.video_label" : "gallery.image_label")));
      const content = make("div", "gallery-card__content");
      content.append(make("h2", "gallery-card__title", name));
      if (caption) content.append(make("p", "gallery-card__caption", caption));
      const meta = make("div", "gallery-card__meta");
      meta.append(make("span", "badge badge--muted", t(`gallery.categories.${item.category}`)));
      const credit = String(item.photographer_name || item.credit || "").trim();
      if (credit) meta.append(make("span", "", `${t(item.photographer_name ? "gallery.photographer" : "gallery.credit")}: ${credit}`));
      content.append(meta);
      const actions = make("div", "gallery-card__actions");
      const open = make("button", "button button--primary", t(type === "video" ? "gallery.watch_video" : "gallery.view_image"));
      open.type = "button";
      open.addEventListener("click", () => openViewer(index, open));
      actions.append(open);
      if (validatePlaceIdForLink(item.related_place_id)) {
        const related = make("a", "button button--ghost", t("gallery.view_related_place"));
        related.href = relatedPlaceUrl(item.related_place_id);
        const map = make("a", "button button--ghost", t("gallery.view_map"));
        map.href = mapUrl(item.related_place_id);
        actions.append(related, map);
      }
      content.append(actions);
      card.append(media, content);
      return card;
    }

    function validatePlaceIdForLink(value) { return validId(value); }

    function renderRecords() {
      grid.replaceChildren(...records.map(renderCard));
      summary.textContent = format("gallery.result_count", { count: records.length });
      setPrimaryState(resolveState({ items: records, filtered: filtersActive() }));
      syncControls();
    }

    function showMediaError() { closeViewer(false); setPrimaryState("media-load-error"); }

    function openViewer(index, trigger) {
      const item = records[index];
      viewerState = openViewerState(viewerState, item, trigger);
      viewerIndex = index;
      if (viewerState.mode === "invalid") { showMediaError(); return; }
      const lang = currentLang();
      const name = localized(item, "title", lang) || localized(item, "caption", lang) || t("gallery.unnamed");
      viewerTitle.textContent = name;
      viewerCaption.textContent = localized(item, "caption", lang);
      viewerMedia.replaceChildren();
      const mediaUrl = item.media_type === "image" ? "" : videoSourceUrl(item);
      if (viewerState.mode === "image") {
        const fallbackFactory = () => fallbackMedia(name, "gallery.media_load_failed");
        if (global.TakhunMedia?.renderImage) global.TakhunMedia.renderImage(viewerMedia, { mediaId: global.TakhunMedia.mediaIdFor("gallery", item.media_id), type: "gallery", role: "gallery", fallbackAlt: localized(item, "alt_text", lang) || format("gallery.image_alt", { name }), loading: "eager", sizes: "(min-width: 1280px) 72rem, 90vw", lang, fallbackFactory }); else viewerMedia.append(fallbackFactory());
      } else if (viewerState.mode === "video") {
        const video = make("video"); video.src = mediaUrl; video.controls = true; video.preload = "metadata"; video.setAttribute("playsinline", ""); video.addEventListener("error", showMediaError, { once: true }); viewerMedia.append(video);
      } else {
        const link = make("a", "button button--primary", t("gallery.external_video")); link.href = safeExternalUrl(mediaUrl); link.target = "_blank"; link.rel = "noopener noreferrer"; viewerMedia.append(link);
      }
      viewer.hidden = false;
      root.classList.add("has-modal");
      if (main) { main.setAttribute("aria-hidden", "true"); if ("inert" in main) main.inert = true; }
      closeButton.focus();
    }

    function closeViewer(restoreFocus = true) {
      if (!viewerState.isOpen && viewer.hidden) return;
      const focusTarget = viewerState.returnFocus;
      viewer.querySelector("video")?.pause?.();
      viewer.hidden = true;
      viewerMedia.replaceChildren();
      root.classList.remove("has-modal");
      if (main) { main.removeAttribute("aria-hidden"); if ("inert" in main) main.inert = false; }
      viewerState = closeViewerState(viewerState);
      if (restoreFocus && focusTarget?.focus) focusTarget.focus();
    }

    function moveViewer(offset) { if (!records.length) return; const next = (viewerIndex + offset + records.length) % records.length; const focusTarget = viewerState.returnFocus; closeViewer(false); openViewer(next, focusTarget); }

    async function fetchRecords() {
      const parsed = parseGalleryFilters(global.location.search);
      filters = parsed.filters;
      syncControls();
      if (parsed.invalid.length) { records = []; summary.textContent = ""; setPrimaryState("invalid-filter"); return; }
      const generation = gate.begin();
      setPrimaryState("loading");
      try {
        const data = await global.TakhunApi.getGallery({ ...filters, lang: currentLang() }, { mock: mockGallery });
        if (!gate.isCurrent(generation)) return;
        const normalized = normalizeGalleryResponse(data);
        records = sortGalleryItems(filterGallery(normalized.items, filters));
        renderRecords();
      } catch (error) {
        if (!gate.isCurrent(generation)) return;
        records = [];
        setPrimaryState(error?.message === "MALFORMED_RESPONSE" || error?.code === "MALFORMED_RESPONSE" ? "malformed-response" : "error");
      }
    }

    form?.addEventListener("submit", (event) => event.preventDefault());
    form?.addEventListener("change", (event) => {
      const control = event.target.closest?.("[data-gallery-filter]"); if (!control) return;
      const next = { ...filters, [control.dataset.galleryFilter]: String(control.value || "").trim() };
      filters = Object.fromEntries(Object.entries(next).filter(([, value]) => value));
      global.history?.pushState?.({}, "", filtersUrl());
      fetchRecords();
    });
    global.document.querySelectorAll("[data-gallery-clear]").forEach((button) => button.addEventListener("click", () => { filters = clearFilters(); global.history?.pushState?.({}, "", global.location.pathname); fetchRecords(); }));
    global.document.querySelector("[data-gallery-retry]")?.addEventListener("click", fetchRecords);
    global.document.querySelector("[data-gallery-back-to-grid]")?.addEventListener("click", renderRecords);
    closeButton?.addEventListener("click", () => closeViewer());
    global.document.querySelector("[data-gallery-viewer-backdrop]")?.addEventListener("click", () => closeViewer());
    global.document.querySelector("[data-gallery-previous]")?.addEventListener("click", () => moveViewer(-1));
    global.document.querySelector("[data-gallery-next]")?.addEventListener("click", () => moveViewer(1));
    global.document.addEventListener("keydown", (event) => { if (!viewerState.isOpen) return; if (event.key === "Escape") closeViewer(); if (event.key === "ArrowLeft") moveViewer(-1); if (event.key === "ArrowRight") moveViewer(1); });
    global.addEventListener?.("popstate", fetchRecords);
    global.document.addEventListener("takhun:languagechange", () => { global.TakhunI18n?.applyTranslations?.(global.document); renderGalleryCategoryOptions(categorySelect, currentLang(), filters.category); if (records.length) renderRecords(); if (viewerState.isOpen) openViewer(viewerIndex, viewerState.returnFocus); });
    renderGalleryCategoryOptions(categorySelect, currentLang(), filters.category);
    fetchRecords();
  }

  global.TakhunGallery = Object.freeze({
    validateMediaId, validateCategory, validateMediaType, normalizeMediaType, parseGalleryFilters,
    filterGallery, clearFilters, localized, safeMediaUrl, safeThumbnailUrl, safeExternalUrl,
    isDirectVideoUrl, normalizeBoolean, normalizeSortOrder, sortGalleryItems, relatedPlaceUrl,
    mapUrl, normalizeGalleryResponse, resolveState, setPageState, createRequestGate,
    createViewerState, openViewerState, closeViewerState, galleryCategoryOptions, mockGallery
  });
  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initializePage, { once: true }); else initializePage();
})(window);
