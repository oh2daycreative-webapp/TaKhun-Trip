"use strict";

(function createPlaceDetailPage(global) {
  const FAVORITES_KEY = "TAKHUN_FAVORITES";
  let memoryFavorites = null;

  function parsePlaceId(search) {
    return String(new URLSearchParams(search || "").get("id") || "").trim();
  }

  function validatePlaceId(id) {
    const value = String(id || "").trim();
    return value.length > 0 && value.length <= 64 && /^[A-Za-z0-9_-]+$/.test(value);
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

  function getApprovedReviews(reviews) {
    return (Array.isArray(reviews) ? reviews : []).filter((review) => review?.status === "approved" && Number(review?.rating) >= 1 && Number(review?.rating) <= 5 && String(review?.comment || review?.comment_th || "").trim());
  }

  function normalizeReviewResponse(value) {
    const total = value?.total;
    const count = value?.summary?.review_count;
    const average = value?.summary?.average_rating;
    if (!value || !Array.isArray(value.items) || !Number.isInteger(total) || total < 0 || !Number.isInteger(count) || count < 0 || count !== total || typeof average !== "number" || !Number.isFinite(average) || average < 0 || average > 5 || (count === 0 && average !== 0)) throw new Error("Invalid review response");
    const items = value.items.filter((review) => review?.status === undefined || review.status === "approved");
    if (items.some((review) => !review || !String(review.review_id || "").trim() || !String(review.place_id || "").trim() || typeof review.reviewer_name !== "string" || typeof review.is_anonymous !== "boolean" || typeof review.rating !== "number" || !Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5 || typeof review.comment !== "string" || !review.comment.trim() || typeof review.admin_reply !== "string" || typeof review.created_at !== "string")) throw new Error("Invalid review response");
    return {
      items,
      summary: { average_rating: average, review_count: count },
      total
    };
  }

  function mockReviewResponse(place) {
    const items = getApprovedReviews(place?.reviews).map((review) => ({
      review_id: String(review.review_id || ""), place_id: String(review.place_id || place?.place_id || ""), reviewer_name: String(review.reviewer_name || ""),
      is_anonymous: Boolean(review.is_anonymous), rating: Number(review.rating), comment: String(review.comment || review.comment_th || review.comment_en || ""),
      admin_reply: String(review.admin_reply || review.admin_reply_th || review.admin_reply_en || ""), created_at: String(review.created_at || "")
    }));
    const total = items.length;
    const average = total ? Math.round((items.reduce((sum, review) => sum + Number(review.rating), 0) / total) * 10) / 10 : 0;
    return { items, summary: { average_rating: average, review_count: total }, total };
  }

  async function fetchReviews(place, api = global.TakhunApi) {
    const result = await api.getReviews(place.place_id, { page: 1, page_size: 20 }, { mock: () => mockReviewResponse(place) });
    return normalizeReviewResponse(result);
  }

  function validateReviewPayload(value) {
    const source = value || {};
    const payload = {
      place_id: String(source.place_id || "").trim(),
      reviewer_name: String(source.reviewer_name || "").trim(),
      is_anonymous: source.is_anonymous === undefined ? false : source.is_anonymous,
      rating: Number(source.rating),
      comment: String(source.comment || "").trim()
    };
    const ok = validatePlaceId(payload.place_id) && typeof payload.is_anonymous === "boolean" && Number.isInteger(payload.rating) && payload.rating >= 1 && payload.rating <= 5 && payload.comment.length > 0 && payload.comment.length <= 1000;
    return { ok, payload };
  }

  function createReviewSubmitHandler(options = {}) {
    const getPlace = options.getPlace || (() => null);
    const api = options.api || global.TakhunApi;
    const translate = options.translate || t;
    let submitInFlight = false;
    return async function handleReviewSubmit(event) {
      event.preventDefault();
      const currentPlace = getPlace();
      if (!currentPlace || submitInFlight) return "ignored";
      const form = event.currentTarget;
      const button = form.querySelector("[data-review-submit]");
      const status = form.querySelector("[data-review-status]");
      const validation = validateReviewPayload({
        place_id: currentPlace.place_id,
        reviewer_name: form.querySelector("[data-review-name]")?.value,
        is_anonymous: Boolean(form.querySelector("[data-review-anonymous]")?.checked),
        rating: form.querySelector("[data-review-rating]")?.value,
        comment: form.querySelector("[data-review-comment]")?.value
      });
      if (!validation.ok) {
        status.textContent = validation.payload.comment ? translate("place_detail.review_rating_invalid") : translate("place_detail.review_comment_required");
        return "invalid";
      }
      submitInFlight = true; button.disabled = true; button.textContent = translate("place_detail.review_submitting"); status.textContent = "";
      try {
        await api.submitReview(validation.payload, { mock: () => ({ review_id: "MOCK-REVIEW-SUBMITTED", status: "pending" }) });
        form.reset(); status.textContent = translate("place_detail.review_success");
        return "success";
      } catch (_error) {
        status.textContent = translate("place_detail.review_submit_error");
        return "error";
      } finally {
        submitInFlight = false; button.disabled = false; button.textContent = translate("place_detail.review_submit");
      }
    };
  }

  const REVIEW_STATES = Object.freeze(["loading", "empty", "error", "ready"]);
  function setReviewState(mounts, nextState) {
    Object.values(mounts || {}).forEach((mount) => { if (mount) mount.hidden = true; });
    if (!REVIEW_STATES.includes(nextState) || !mounts?.[nextState]) throw new Error("Unknown review state");
    mounts[nextState].hidden = false;
    return nextState;
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
  function appendImage(mount, source, name, options = {}) {
    if (!source) { mount.append(fallbackMedia(name, options.hero)); return null; }
    const image = global.document.createElement("img");
    image.className = options.className || "";
    image.src = source;
    image.alt = format("place_detail.image_alt", { name });
    if (options.lazy) image.loading = "lazy";
    image.addEventListener("error", () => mount.replaceChildren(fallbackMedia(name, options.hero)), { once: true });
    mount.append(image);
    return image;
  }

  function renderSummary(place, lang, mount) {
    const name = localized(place, "name", lang);
    const badges = make("div", "detail-badges");
    for (const [group, value] of [["category", place.category], ["district", place.district], ["route_group", place.route_group]]) {
      if (value) badges.append(make("span", `badge ${group === "route_group" ? "badge--muted" : ""}`, labelFor(group, value)));
    }
    const title = make("h1", "detail-title", name); title.id = "page-title";
    const shortDescription = make("p", "detail-lead", localized(place, "short_description", lang));
    const review = make("p", "detail-review-summary");
    const summary = place.reviews_summary || place.review_summary || {};
    const count = Number(summary.review_count || 0);
    review.textContent = count ? format("place_detail.review_summary", { rating: Number(summary.average_rating).toFixed(1), count }) : t("place_detail.no_reviews");
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
    const urls = Array.isArray(place.gallery_image_urls) ? place.gallery_image_urls : [];
    mount.hidden = !urls.length; mount.replaceChildren();
    if (!urls.length) return;
    const name = localized(place, "name", lang); const grid = make("div", "detail-gallery-grid");
    urls.forEach((source, index) => {
      const button = make("button", "detail-gallery__button"); button.type = "button"; button.setAttribute("aria-label", format("place_detail.open_gallery_image", { number: index + 1, name }));
      const media = make("span", "detail-gallery__media"); appendImage(media, source, name, { className: "detail-gallery__image", lazy: true }); button.append(media);
      button.addEventListener("click", () => openLightbox(source, name, button)); grid.append(button);
    });
    mount.append(heading("detail-gallery-title", t("place_detail.gallery")), grid);
  }

  function renderNearby(place, lang) {
    const mount = global.document.querySelector("[data-detail-nearby]");
    const nearby = Array.isArray(place.nearby_places) && place.nearby_places.length ? place.nearby_places : global.TakhunPlaceData?.getNearbyPlaces?.(place.nearby_place_ids, place.place_id) || [];
    mount.hidden = !nearby.length; mount.replaceChildren();
    if (!nearby.length) return;
    const grid = make("div", "detail-nearby-grid");
    nearby.forEach((item) => {
      const name = localized(item, "name", lang); const card = make("article", "place-card detail-nearby-card");
      const media = make("div", "detail-nearby-card__media"); appendImage(media, item.cover_image_url, name, { className: "detail-nearby-card__image", lazy: true });
      const content = make("div", "detail-nearby-card__content"); content.append(make("span", "badge", labelFor("category", item.category)), make("h3", "detail-nearby-card__title", name), make("p", "detail-nearby-card__copy", localized(item, "short_description", lang)));
      const link = make("a", "button button--secondary", t("places.view_details")); link.href = `place-detail.html?id=${encodeURIComponent(item.place_id)}`; content.append(link); card.append(media, content); grid.append(card);
    });
    mount.append(heading("detail-nearby-title", t("place_detail.nearby")), grid);
  }

  function renderReviews(response, lang) {
    const mount = global.document.querySelector("[data-review-ready]"); const reviews = response?.items || [];
    mount.replaceChildren();
    const list = make("div", "detail-review-list");
    reviews.forEach((review) => {
      const card = make("article", "review-card detail-review-card");
      const name = review.is_anonymous ? t("place_detail.anonymous_reviewer") : String(review.reviewer_name || t("place_detail.demo_reviewer"));
      const header = make("div", "review-card__header"); header.append(make("h3", "review-card__name", name), make("span", "review-card__rating", `${"★".repeat(Number(review.rating))} ${review.rating}/5`));
      card.append(header, make("p", "review-card__comment", localized(review, "comment", lang)));
      if (review.admin_reply) card.append(make("p", "review-card__reply", String(review.admin_reply)));
      if (review.created_at) card.append(make("p", "review-card__date", String(review.created_at)));
      list.append(card);
    });
    mount.append(list);
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
    const reviewMounts = { loading: global.document.querySelector("[data-review-loading]"), empty: global.document.querySelector("[data-review-empty]"), error: global.document.querySelector("[data-review-error]"), ready: global.document.querySelector("[data-review-ready]") };
    let currentPlace = null;
    let currentReviews = null;

    function renderCached() {
      if (!currentPlace) return;
      const lang = global.TakhunI18n?.getCurrentLang?.() || "th"; const name = localized(currentPlace, "name", lang);
      global.document.title = format("place_detail.page_title", { name });
      const heroMedia = global.document.querySelector("[data-detail-hero-media]"); heroMedia.replaceChildren(); appendImage(heroMedia, currentPlace.cover_image_url, name, { className: "detail-hero__image", hero: true });
      renderSummary(currentPlace, lang, global.document.querySelector("[data-detail-summary]")); renderTextSections(currentPlace, lang); renderVisitor(currentPlace, lang); renderGallery(currentPlace, lang); renderNearby(currentPlace, lang); renderMap(currentPlace);
      if (currentReviews) renderReviews(currentReviews, lang);
      const favorite = global.document.querySelector("[data-detail-favorite]"); const saved = readFavorites().includes(currentPlace.place_id); favorite.classList.toggle("is-active", saved); favorite.setAttribute("aria-pressed", String(saved)); favorite.setAttribute("aria-label", format(saved ? "place_detail.favorite_remove" : "place_detail.favorite_add", { name })); favorite.querySelector("span").textContent = saved ? "♥" : "♡";
      setPageState(mounts, "ready", root);
    }

    async function loadReviews() {
      if (!currentPlace) return;
      currentReviews = null;
      setReviewState(reviewMounts, "loading");
      try {
        currentReviews = await fetchReviews(currentPlace);
        currentPlace = { ...currentPlace, reviews_summary: currentReviews.summary };
        renderSummary(currentPlace, global.TakhunI18n?.getCurrentLang?.() || "th", global.document.querySelector("[data-detail-summary]"));
        if (!currentReviews.items.length) setReviewState(reviewMounts, "empty");
        else { renderReviews(currentReviews, global.TakhunI18n?.getCurrentLang?.() || "th"); setReviewState(reviewMounts, "ready"); }
      } catch (_error) {
        setReviewState(reviewMounts, "error");
      }
    }

    async function render() {
      try {
        setPageState(mounts, "loading", root);
        const placeId = parsePlaceId(global.location.search);
        if (!validatePlaceId(placeId)) { currentPlace = null; global.document.title = t("place_detail.not_found_page_title"); setPageState(mounts, "not-found", root); return; }
        const lang = global.TakhunI18n?.getCurrentLang?.() || "th";
        currentPlace = await global.TakhunApi.getPlaceDetail(placeId, { lang }, { mock: () => findPublishedPlace(placeId) });
        if (!currentPlace) { global.document.title = t("place_detail.not_found_page_title"); setPageState(mounts, "not-found", root); return; }
        renderCached();
        await loadReviews();
      } catch (error) {
        currentPlace = null;
        if (error?.code === "NOT_FOUND" || error?.code === "VALIDATION_ERROR") setPageState(mounts, "not-found", root);
        else setPageState(mounts, "error", root);
      }
    }
    global.document.querySelector("[data-detail-back]")?.addEventListener("click", () => global.history?.back?.());
    global.document.querySelector("[data-detail-favorite]")?.addEventListener("click", () => { if (!currentPlace) return; const saved = toggleFavorite(currentPlace.place_id).includes(currentPlace.place_id); showToast(t(saved ? "place_detail.favorite_added" : "place_detail.favorite_removed")); renderCached(); });
    global.document.querySelector("[data-detail-share]")?.addEventListener("click", async () => { if (!currentPlace) return; const lang = global.TakhunI18n?.getCurrentLang?.() || "th"; const name = localized(currentPlace, "name", lang); const result = await sharePlace({ title: format("place_detail.share_title", { name }), text: format("place_detail.share_text", { name }), url: global.location.href }); if (result === "copied") showToast(t("place_detail.copy_success")); if (result === "copy_failed") showToast(t("place_detail.copy_failed"), "error"); });
    global.document.querySelector("[data-detail-retry]")?.addEventListener("click", render);
    global.document.querySelector("[data-review-retry]")?.addEventListener("click", loadReviews);
    global.document.querySelector("[data-review-form]")?.addEventListener("submit", createReviewSubmitHandler({ getPlace: () => currentPlace }));
    global.document.querySelector("[data-lightbox-close]")?.addEventListener("click", closeLightbox);
    global.document.querySelector("[data-lightbox-backdrop]")?.addEventListener("click", closeLightbox);
    global.document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeLightbox(); });
    global.document.addEventListener("takhun:languagechange", () => { global.TakhunI18n?.applyTranslations?.(global.document); renderCached(); });
    render();
  }

  global.TakhunPlaceDetail = Object.freeze({ parsePlaceId, validatePlaceId, findPublishedPlace, resolvePage, setPageState, getActionModel, readFavorites, writeFavorites, toggleFavorite, getApprovedReviews, normalizeReviewResponse, validateReviewPayload, fetchReviews, createReviewSubmitHandler, setReviewState, sharePlace });
  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initializePage, { once: true }); else initializePage();
})(window);
