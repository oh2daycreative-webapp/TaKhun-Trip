"use strict";

(function createPlaceDetailPage(global) {
  const FAVORITES_KEY = "TAKHUN_FAVORITES";
  let memoryFavorites = null;

  function parsePlaceId(search) {
    return String(new URLSearchParams(search || "").get("id") || "").trim();
  }

  function validatePlaceId(id) {
    const value = String(id || "").trim();
    return /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value);
  }

  function findPublishedPlace(id) {
    if (!validatePlaceId(id)) return null;
    const place = global.TakhunPlaceData?.getPlaceById?.(String(id).trim());
    return place?.status === "published" ? place : null;
  }

  const PAGE_STATES = Object.freeze(["loading", "ready", "not-found", "error"]);
  function setPageState(mounts, nextState, root = null) {
    for (const mount of Object.values(mounts || {})) if (mount) mount.hidden = true;
    if (!PAGE_STATES.includes(nextState)) throw new Error(`Unknown page state: ${nextState}`);
    const target = mounts?.[nextState];
    if (!target) throw new Error(`Missing page state mount: ${nextState}`);
    target.hidden = false;
    if (root?.setAttribute) root.setAttribute("data-page-state", nextState);
    return nextState;
  }

  function resolvePage(search) {
    try {
      const place = findPublishedPlace(parsePlaceId(search));
      return place ? { state: "ready", place } : { state: "not-found", place: null };
    } catch (_error) {
      return { state: "error", place: null };
    }
  }

  function validHttpsUrl(value) {
    const url = String(value || "").trim();
    return /^https:\/\//i.test(url) ? url : "";
  }

  function hasCoordinates(place) {
    return place?.latitude !== null && place?.longitude !== null && Number.isFinite(Number(place?.latitude)) && Number.isFinite(Number(place?.longitude));
  }

  function getActionModel(place) {
    const id = String(place?.place_id || "").trim();
    const encodedId = encodeURIComponent(id);
    const phone = String(place?.phone || "").trim();
    return {
      detailMapUrl: hasCoordinates(place) ? `map.html?focus=${encodedId}` : "",
      googleMapsUrl: validHttpsUrl(place?.google_maps_url),
      phoneUrl: phone ? `tel:${phone.replace(/[^+\d]/g, "")}` : "",
      tripPlannerUrl: id ? `trip-planner.html?add=${encodedId}` : ""
    };
  }

  function normalizeFavorites(value) {
    return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))] : [];
  }

  function readFavorites() {
    if (memoryFavorites) return [...memoryFavorites];
    try { memoryFavorites = normalizeFavorites(JSON.parse(global.localStorage?.getItem(FAVORITES_KEY) || "[]")); }
    catch (_error) { memoryFavorites = []; }
    return [...memoryFavorites];
  }

  function writeFavorites(value) {
    memoryFavorites = normalizeFavorites(value);
    try { global.localStorage?.setItem(FAVORITES_KEY, JSON.stringify(memoryFavorites)); } catch (_error) { /* Memory state remains usable. */ }
    return [...memoryFavorites];
  }

  function toggleFavorite(placeId) {
    const id = String(placeId || "").trim();
    const current = readFavorites();
    if (!id) return current;
    return writeFavorites(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function sharePlace(payload) {
    try {
      if (typeof global.navigator?.share === "function") {
        await global.navigator.share(payload);
        return "shared";
      }
      if (typeof global.navigator?.clipboard?.writeText === "function") {
        await global.navigator.clipboard.writeText(payload.url);
        return "copied";
      }
      return "copy_failed";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      return "copy_failed";
    }
  }

  function t(key) { return global.TakhunI18n?.t?.(key) || key; }
  function format(key, values) { return String(t(key)).replace(/\{(\w+)\}/g, (_match, name) => String(values?.[name] ?? "")); }
  function localized(item, field, lang) { return global.TakhunI18n?.pickLangValue?.(item, field, lang) || String(item?.[`${field}_${lang}`] || item?.[`${field}_th`] || item?.[field] || ""); }
  function make(tag, className, text) {
    const element = global.document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function heading(id, text) { const title = make("h2", "detail-section__title", text); title.id = id; return title; }
  function labelFor(group, value) {
    const namespace = group === "district" ? "districts" : group === "category" ? "categories" : "route_groups";
    const translated = t(`places.${namespace}.${value}`);
    return translated.startsWith("places.") ? String(value || "").replaceAll("_", " ") : translated;
  }
  function showToast(message, type = "success") {
    let container = global.document.querySelector(".toast-container");
    if (!container) { container = make("div", "toast-container"); container.setAttribute("aria-live", "polite"); global.document.body.append(container); }
    const toast = make("div", `toast-message toast-message--${type}`, message);
    container.replaceChildren(toast);
    global.setTimeout(() => toast.remove(), 2600);
  }
  function fallbackMedia(name, hero = false) {
    const fallback = make("div", hero ? "detail-hero__fallback" : "detail-gallery__fallback", t("place_detail.image_fallback"));
    fallback.setAttribute("role", "img");
    fallback.setAttribute("aria-label", format("place_detail.image_alt", { name }));
    return fallback;
  }
  function appendImage(mount, mediaId, name, options = {}) {
    const fallbackFactory = () => {
      const fallback = fallbackMedia(name, options.hero);
      if (options.decorative) { fallback.setAttribute("aria-hidden", "true"); fallback.removeAttribute("role"); fallback.removeAttribute("aria-label"); }
      return fallback;
    };
    if (!global.TakhunMedia?.renderImage) { const fallback = fallbackFactory(); mount.append(fallback); return fallback; }
    return global.TakhunMedia.renderImage(mount, { mediaId, type: options.type || "place", role: options.hero ? "hero" : options.gallery ? "gallery" : "cover", className: options.className || "", decorative: options.decorative === true, loading: options.loading, fetchPriority: options.fetchPriority, sizes: options.sizes, fallbackAlt: options.fallbackAlt, lang: global.TakhunI18n?.getCurrentLang?.(), fallbackFactory });
  }

  function renderSummary(place, lang, mount, reviewSummary) {
    const name = localized(place, "name", lang);
    const badges = make("div", "detail-badges");
    for (const [group, value] of [["category", place.category], ["district", place.district], ["route_group", place.route_group]]) {
      if (value) badges.append(make("span", `badge ${group === "route_group" ? "badge--muted" : ""}`, labelFor(group, value)));
    }
    const title = make("h1", "detail-title", name); title.id = "page-title";
    const shortDescription = make("p", "detail-lead", localized(place, "short_description", lang));
    const review = make("p", "detail-review-summary");
    const summary = reviewSummary || {};
    const count = Number(summary.review_count || 0);
    review.textContent = reviewSummary === null ? "" : count ? format("place_detail.review_summary", { rating: Number(summary.average_rating).toFixed(1), count }) : t("place_detail.no_reviews");
    const actions = make("div", "detail-cta");
    const model = getActionModel(place);
    const links = [
      [model.detailMapUrl, "button button--secondary", "place_detail.view_map", false],
      [model.googleMapsUrl, "button button--primary", "place_detail.navigate", true],
      [model.phoneUrl, "button button--secondary", "place_detail.call", false],
      [model.tripPlannerUrl, "button button--accent", "place_detail.add_to_trip", false]
    ];
    for (const [href, className, key, external] of links) {
      if (!href) continue;
      const link = make("a", className, t(key)); link.href = href;
      if (external) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
      actions.append(link);
    }
    mount.replaceChildren(badges, title, shortDescription, review, actions);
  }

  function renderTextSections(place, lang) {
    const description = global.document.querySelector("[data-detail-description]");
    description.replaceChildren(heading("detail-description-title", t("place_detail.description")), make("p", "detail-copy", localized(place, "description", lang)));
    const highlights = global.document.querySelector("[data-detail-highlights]");
    const highlight = localized(place, "highlight", lang);
    highlights.hidden = !highlight; highlights.replaceChildren();
    if (highlight) highlights.append(heading("detail-highlights-title", t("place_detail.highlights")), make("p", "detail-highlight", highlight));
    const activities = global.document.querySelector("[data-detail-activities]");
    const activityValue = place[`activities_${lang}`] || place.activities_th || place.activities || [];
    const items = Array.isArray(activityValue) ? activityValue : String(activityValue || "").split("|").map((item) => item.trim()).filter(Boolean);
    activities.hidden = !items.length; activities.replaceChildren();
    if (items.length) { const list = make("ul", "detail-activity-list"); items.forEach((item) => list.append(make("li", "detail-activity-list__item", item))); activities.append(heading("detail-activities-title", t("place_detail.activities")), list); }
  }

  function renderVisitor(place, lang) {
    const mount = global.document.querySelector("[data-detail-visitor]");
    const fields = [["open_time", "place_detail.opening_time"], ["fee", "place_detail.fee"], ["recommended_duration", "place_detail.duration"], ["best_time", "place_detail.best_time"]];
    const grid = make("dl", "detail-visitor-grid");
    for (const [field, key] of fields) {
      const value = field === "recommended_duration" ? String(place[field] || "") : localized(place, field, lang);
      if (!value) continue;
      grid.append(make("dt", "detail-visitor-grid__label", t(key)), make("dd", "detail-visitor-grid__value", value));
    }
    mount.replaceChildren(heading("detail-visitor-title", t("place_detail.visitor_information")));
    if (grid.children.length) mount.append(grid); else mount.append(make("p", "detail-muted", t("place_detail.visitor_unavailable")));
  }

  function closeLightbox() {
    const dialog = global.document.querySelector("[data-detail-lightbox]");
    if (!dialog || dialog.hidden) return;
    const trigger = dialog._returnFocus;
    dialog.hidden = true; dialog.classList.remove("is-open");
    global.document.body.classList.remove("has-modal");
    trigger?.focus?.();
  }
  function openLightbox(source, name, trigger) {
    const dialog = global.document.querySelector("[data-detail-lightbox]");
    const media = dialog.querySelector("[data-lightbox-media]");
    media.replaceChildren(); appendImage(media, source, name, { className: "detail-lightbox__image" });
    dialog._returnFocus = trigger; dialog.hidden = false; dialog.classList.add("is-open");
    global.document.body.classList.add("has-modal");
    dialog.querySelector("[data-lightbox-close]")?.focus();
  }
  function renderGallery(place, lang) {
    const mount = global.document.querySelector("[data-detail-gallery]");
    mount.hidden = true;
    mount.replaceChildren();
  }

  function renderNearby(place, lang) {
    const mount = global.document.querySelector("[data-detail-nearby]");
    const nearby = Array.isArray(place.nearby_places) && place.nearby_places.length ? place.nearby_places : global.TakhunPlaceData?.getNearbyPlaces?.(place.nearby_place_ids, place.place_id) || [];
    mount.hidden = !nearby.length; mount.replaceChildren();
    if (!nearby.length) return;
    const grid = make("div", "detail-nearby-grid");
    nearby.forEach((item) => {
      const name = localized(item, "name", lang); const card = make("article", "place-card detail-nearby-card");
      const media = make("div", "detail-nearby-card__media"); appendImage(media, global.TakhunMedia?.mediaIdFor?.("place", item.place_id) || "", name, { className: "detail-nearby-card__image", decorative: true, loading: "lazy", sizes: "(min-width: 768px) 50vw, 100vw" });
      const content = make("div", "detail-nearby-card__content"); content.append(make("span", "badge", labelFor("category", item.category)), make("h3", "detail-nearby-card__title", name), make("p", "detail-nearby-card__copy", localized(item, "short_description", lang)));
      const link = make("a", "button button--secondary", t("places.view_details")); link.href = `place-detail.html?id=${encodeURIComponent(item.place_id)}`; content.append(link); card.append(media, content); grid.append(card);
    });
    mount.append(heading("detail-nearby-title", t("place_detail.nearby")), grid);
  }

  function renderMap(place) {
    const mount = global.document.querySelector("[data-detail-map]"); const model = getActionModel(place);
    mount.replaceChildren(heading("detail-map-title", t("place_detail.map")));
    const actions = make("div", "detail-map-actions");
    if (model.detailMapUrl) { const link = make("a", "button button--secondary", t("place_detail.view_map")); link.href = model.detailMapUrl; actions.append(link); }
    if (model.googleMapsUrl) { const link = make("a", "button button--primary", t("place_detail.navigate")); link.href = model.googleMapsUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; actions.append(link); }
    mount.append(actions.children.length ? actions : make("p", "detail-muted", t("place_detail.map_unavailable")));
  }

  function initializePage() {
    const root = global.document?.querySelector?.(".place-detail-page");
    if (!root) return;
    const mounts = { loading: global.document.querySelector("[data-detail-loading]"), "not-found": global.document.querySelector("[data-detail-not-found]"), error: global.document.querySelector("[data-detail-error]"), ready: global.document.querySelector("[data-detail-content]") };
    const reviewMounts = { idle: global.document.querySelector("[data-review-idle]"), loading: global.document.querySelector("[data-review-loading]"), empty: global.document.querySelector("[data-review-empty]"), error: global.document.querySelector("[data-review-error]"), ready: global.document.querySelector("[data-review-ready]") };
    const reviewElements = {
      summary: global.document.querySelector("[data-review-summary]"),
      list: global.document.querySelector("[data-review-list]"),
      pagination: global.document.querySelector("[data-review-pagination]"),
      previous: global.document.querySelector("[data-review-previous]"),
      next: global.document.querySelector("[data-review-next]"),
      indicator: global.document.querySelector("[data-review-page-indicator]"),
      retry: global.document.querySelector("[data-review-retry]"),
      heading: global.document.querySelector("#detail-reviews-title")
    };
    let currentPlace = null;
    let currentReviewSummary = null;
    const reviewsController = global.TakhunReviews.createController({
      mounts: reviewMounts,
      elements: reviewElements,
      getMockRows: () => currentPlace?.reviews || [],
      onSummary(summary) {
        currentReviewSummary = summary;
        if (currentPlace) renderSummary(currentPlace, global.TakhunI18n?.getCurrentLang?.() || "th", global.document.querySelector("[data-detail-summary]"), currentReviewSummary);
      }
    });

    function renderCached() {
      if (!currentPlace) return;
      const lang = global.TakhunI18n?.getCurrentLang?.() || "th"; const name = localized(currentPlace, "name", lang);
      global.document.title = format("place_detail.page_title", { name });
      const heroMedia = global.document.querySelector("[data-detail-hero-media]"); heroMedia.replaceChildren(); appendImage(heroMedia, global.TakhunMedia?.mediaIdFor?.("place", currentPlace.place_id) || "", name, { className: "detail-hero__image", hero: true, fallbackAlt: format("place_detail.image_alt", { name }), loading: "eager", fetchPriority: "high", sizes: "100vw" });
      renderSummary(currentPlace, lang, global.document.querySelector("[data-detail-summary]"), currentReviewSummary); renderTextSections(currentPlace, lang); renderVisitor(currentPlace, lang); renderGallery(currentPlace, lang); renderNearby(currentPlace, lang); renderMap(currentPlace);
      const favorite = global.document.querySelector("[data-detail-favorite]"); const saved = readFavorites().includes(currentPlace.place_id); favorite.classList.toggle("is-active", saved); favorite.setAttribute("aria-pressed", String(saved)); favorite.setAttribute("aria-label", format(saved ? "place_detail.favorite_remove" : "place_detail.favorite_add", { name })); favorite.querySelector("span").textContent = saved ? "♥" : "♡";
      setPageState(mounts, "ready", root);
    }

    async function render() {
      try {
        setPageState(mounts, "loading", root);
        currentPlace = null;
        currentReviewSummary = null;
        reviewsController.setPlace(null);
        const placeId = parsePlaceId(global.location.search);
        if (!validatePlaceId(placeId)) { currentPlace = null; global.document.title = t("place_detail.not_found_page_title"); setPageState(mounts, "not-found", root); return; }
        const lang = global.TakhunI18n?.getCurrentLang?.() || "th";
        currentPlace = await global.TakhunApi.getPlaceDetail(placeId, { lang }, { mock: () => findPublishedPlace(placeId) });
        if (!currentPlace) { global.document.title = t("place_detail.not_found_page_title"); setPageState(mounts, "not-found", root); return; }
        renderCached();
        await reviewsController.setPlace(currentPlace);
      } catch (error) {
        currentPlace = null;
        currentReviewSummary = null;
        reviewsController.setPlace(null);
        if (error?.code === "NOT_FOUND" || error?.code === "VALIDATION_ERROR") setPageState(mounts, "not-found", root);
        else setPageState(mounts, "error", root);
      }
    }
    global.document.querySelector("[data-detail-back]")?.addEventListener("click", () => global.history?.back?.());
    global.document.querySelector("[data-detail-favorite]")?.addEventListener("click", () => { if (!currentPlace) return; const saved = toggleFavorite(currentPlace.place_id).includes(currentPlace.place_id); showToast(t(saved ? "place_detail.favorite_added" : "place_detail.favorite_removed")); renderCached(); });
    global.document.querySelector("[data-detail-share]")?.addEventListener("click", async () => { if (!currentPlace) return; const lang = global.TakhunI18n?.getCurrentLang?.() || "th"; const name = localized(currentPlace, "name", lang); const result = await sharePlace({ title: format("place_detail.share_title", { name }), text: format("place_detail.share_text", { name }), url: global.location.href }); if (result === "copied") showToast(t("place_detail.copy_success")); if (result === "copy_failed") showToast(t("place_detail.copy_failed"), "error"); });
    global.document.querySelector("[data-detail-retry]")?.addEventListener("click", render);
    global.document.querySelector("[data-lightbox-close]")?.addEventListener("click", closeLightbox);
    global.document.querySelector("[data-lightbox-backdrop]")?.addEventListener("click", closeLightbox);
    global.document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeLightbox(); });
    global.document.addEventListener("takhun:languagechange", () => { global.TakhunI18n?.applyTranslations?.(global.document); renderCached(); reviewsController.handleLanguageChange(); });
    global.addEventListener?.("popstate", () => reviewsController.handlePopState());
    render();
  }

  global.TakhunPlaceDetail = Object.freeze({ parsePlaceId, validatePlaceId, findPublishedPlace, resolvePage, setPageState, getActionModel, readFavorites, writeFavorites, toggleFavorite, sharePlace });
  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initializePage, { once: true }); else initializePage();
})(window);
