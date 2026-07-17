"use strict";

(function createPublicMap(global) {
  const FAVORITES_KEY = "TAKHUN_FAVORITES";
  const PRIMARY_STATES = Object.freeze(["loading", "ready", "empty", "error", "leaflet-unavailable"]);
  const CATEGORY_SYMBOLS = Object.freeze({ nature: "♧", community_tourism: "⌂", viewpoint: "◉", temple_culture: "◇", food_cafe: "☕", activity: "✦" });
  let memoryFavorites = [];
  let tileFailed = false;

  const state = {
    map: null, tileLayer: null, places: [], markerPlaces: [], filtered: [], markers: new Map(),
    category: "", district: "", keyword: "", selectedPlaceId: "", focusOrigin: null,
    categories: [], districts: [], initialBounds: null, debounceTimer: null,
    userLocation: null, userLocationMarker: null, locationRequestPending: false, locationStatus: "idle"
  };

  function normalizeCoordinate(value) {
    if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function isValidCoordinatePair(latitude, longitude) {
    const lat = normalizeCoordinate(latitude);
    const lng = normalizeCoordinate(longitude);
    return lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  function hasMapCoordinates(place) {
    return place?.coordinate_status !== "no_coordinate" && isValidCoordinatePair(place?.latitude, place?.longitude);
  }

  function toRadians(value) { return Number(value) * (Math.PI / 180); }
  function haversineDistanceKm(lat1, lng1, lat2, lng2) {
    if (!isValidCoordinatePair(lat1, lng1) || !isValidCoordinatePair(lat2, lng2)) return null;
    const latitude1 = toRadians(normalizeCoordinate(lat1)); const latitude2 = toRadians(normalizeCoordinate(lat2));
    const deltaLatitude = latitude2 - latitude1; const deltaLongitude = toRadians(normalizeCoordinate(lng2) - normalizeCoordinate(lng1));
    const intermediate = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
    const bounded = Math.min(1, Math.max(0, intermediate));
    return 6371 * 2 * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
  }

  function formatApproximateDistance(distanceKm, lang = global.TakhunI18n?.getCurrentLang?.() || "th") {
    if (distanceKm === null || distanceKm === undefined || (typeof distanceKm === "string" && distanceKm.trim() === "")) return "";
    const distance = Number(distanceKm);
    if (!Number.isFinite(distance) || distance < 0) return "";
    const normalizedLang = lang === "en" ? "en" : "th";
    if (distance < 0.01) return normalizedLang === "th" ? "< 10 ม." : "< 10 m";
    if (distance < 1) {
      const meters = Math.round((distance * 1000) / 10) * 10;
      if (meters < 1000) { const formatted = new Intl.NumberFormat(normalizedLang === "th" ? "th-TH" : "en-US", { maximumFractionDigits: 0 }).format(meters); return normalizedLang === "th" ? `${formatted} ม.` : `${formatted} m`; }
    }
    const formatted = new Intl.NumberFormat(normalizedLang === "th" ? "th-TH" : "en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(distance);
    return normalizedLang === "th" ? `${formatted} กม.` : `${formatted} km`;
  }

  function distanceFromUser(place, userLocation) {
    if (!hasMapCoordinates(place) || !isValidCoordinatePair(userLocation?.latitude, userLocation?.longitude)) return null;
    return haversineDistanceKm(userLocation.latitude, userLocation.longitude, place.latitude, place.longitude);
  }

  function deriveDistanceSortedPlaces(records, userLocation) {
    const source = Array.isArray(records) ? records : [];
    if (!isValidCoordinatePair(userLocation?.latitude, userLocation?.longitude)) return [...source];
    return source.map((place, index) => ({ place, index, distance: distanceFromUser(place, userLocation) })).sort((left, right) => {
      if (left.distance === null && right.distance === null) return left.index - right.index;
      if (left.distance === null) return 1;
      if (right.distance === null) return -1;
      return left.distance - right.distance || left.index - right.index;
    }).map(({ place }) => place);
  }

  function getPublishedPlaces(records) { return (Array.isArray(records) ? records : []).filter((place) => place?.status === "published"); }
  function getMarkerPlaces(records) { return getPublishedPlaces(records).filter(hasMapCoordinates); }

  function pick(item, field, lang) {
    return global.TakhunI18n?.pickLangValue?.(item, field, lang) || item?.[`${field}_${lang || "th"}`] || item?.[`${field}_th`] || "";
  }

  function filterPlaces(records, filters = {}, lang = global.TakhunI18n?.getCurrentLang?.() || "th") {
    const keyword = String(filters.keyword || "").trim().toLocaleLowerCase(lang === "th" ? "th" : "en");
    return getPublishedPlaces(records).filter((place) => {
      if (filters.category && place.category !== filters.category) return false;
      if (filters.district && place.district !== filters.district) return false;
      if (!keyword) return true;
      const haystack = [pick(place, "name", lang), pick(place, "short_description", lang), pick(place, "description", lang), place.category, place.district].join(" ").toLocaleLowerCase(lang === "th" ? "th" : "en");
      return haystack.includes(keyword);
    });
  }

  function validateIdentifier(value) { const id = String(value || "").trim(); return id.length > 0 && id.length <= 64 && /^[A-Za-z0-9_-]+$/.test(id); }
  function parseQuery(search = global.location?.search || "") {
    const params = new URLSearchParams(search);
    return { focus: String(params.get("focus") || "").trim(), category: String(params.get("category") || "").trim(), district: String(params.get("district") || "").trim(), keyword: String(params.get("keyword") || "").trim(), route: String(params.get("route") || "").trim() };
  }

  function resolveFocus(id) {
    if (!validateIdentifier(id)) return { state: "not-found", place: null };
    try {
      const place = global.TakhunPlaceData?.getPlaceById?.(String(id).trim());
      if (!place || place.status !== "published") return { state: "not-found", place: null };
      return hasMapCoordinates(place) ? { state: "ready", place } : { state: "no-coordinate", place };
    } catch (_error) { return { state: "not-found", place: null }; }
  }

  function reconcileFocusFilters(place, filters = {}, lang = global.TakhunI18n?.getCurrentLang?.() || "th") {
    const current = { category: filters.category || "", district: filters.district || "", keyword: filters.keyword || "" };
    return filterPlaces([place], current, lang).length ? current : { category: "", district: "", keyword: "" };
  }

  function validHttpsUrl(value) { const url = String(value || "").trim(); return /^https:\/\//i.test(url) ? url : ""; }
  function getActionModel(place) {
    const id = encodeURIComponent(String(place?.place_id || ""));
    const direct = validHttpsUrl(place?.google_maps_url);
    const lat = normalizeCoordinate(place?.latitude); const lng = normalizeCoordinate(place?.longitude);
    const navigationUrl = direct || (hasMapCoordinates(place) ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}` : "");
    const phone = String(place?.phone || "").trim(); const phoneDigits = phone.replace(/[^\d+]/g, "");
    return { detailUrl: id ? `place-detail.html?id=${id}` : "", navigationUrl, phoneUrl: phoneDigits ? `tel:${phoneDigits}` : "" };
  }

  function normalizeFavorites(value) { return [...new Set((Array.isArray(value) ? value : []).filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))]; }
  function readFavorites() {
    try { const raw = global.localStorage?.getItem(FAVORITES_KEY); memoryFavorites = normalizeFavorites(raw ? JSON.parse(raw) : memoryFavorites); }
    catch (_error) { memoryFavorites = normalizeFavorites(memoryFavorites); }
    return [...memoryFavorites];
  }
  function toggleFavorite(id) {
    const placeId = String(id || "").trim(); let favorites = readFavorites();
    favorites = favorites.includes(placeId) ? favorites.filter((item) => item !== placeId) : [...favorites, placeId];
    memoryFavorites = normalizeFavorites(favorites);
    try { global.localStorage?.setItem(FAVORITES_KEY, JSON.stringify(memoryFavorites)); } catch (_error) { /* memory fallback */ }
    return [...memoryFavorites];
  }

  function setPrimaryState(mounts, next) {
    Object.values(mounts || {}).forEach((node) => { if (node) node.hidden = true; });
    if (!PRIMARY_STATES.includes(next) || !mounts?.[next]) throw new Error(`Unknown map state: ${next}`);
    mounts[next].hidden = false; return next;
  }
  function hasLeaflet() { return Boolean(global.L && typeof global.L.map === "function"); }
  function noteTileError() { tileFailed = true; return tileFailed; }
  function preserveInteractiveState(value) {
    const snapshot = { category: value?.category || "", district: value?.district || "", keyword: value?.keyword || "", selectedPlaceId: value?.selectedPlaceId || "" };
    if (value && Object.prototype.hasOwnProperty.call(value, "userLocation")) snapshot.userLocation = value.userLocation ? { ...value.userLocation } : null;
    if (value && Object.prototype.hasOwnProperty.call(value, "locationRequestPending")) snapshot.locationRequestPending = Boolean(value.locationRequestPending);
    if (value && Object.prototype.hasOwnProperty.call(value, "locationStatus")) snapshot.locationStatus = value.locationStatus || "idle";
    return snapshot;
  }

  function t(key) { return global.TakhunI18n?.t?.(key) || key; }
  function format(key, params = {}) { return Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), t(key)); }
  function approximateDistanceText(place) { const distance = distanceFromUser(place, state.userLocation); const formatted = formatApproximateDistance(distance); return formatted ? format("map.approximate_distance", { distance: formatted }) : ""; }
  function label(group, value) { return t(`places.${group}.${value}`); }
  function make(tag, className = "", text = "") { const node = global.document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
  function mounts() { return { loading: document.querySelector("[data-map-loading]"), ready: document.querySelector("[data-map-ready]"), empty: document.querySelector("[data-map-empty]"), error: document.querySelector("[data-map-error]"), "leaflet-unavailable": document.querySelector("[data-map-leaflet-unavailable]") }; }
  function showToast(message) { const host = document.querySelector("[data-map-toast]"); if (!host) return; const toast = make("div", "toast-message", message); host.replaceChildren(toast); global.setTimeout(() => toast.remove(), 2600); }

  function normalizeAccuracy(value) {
    if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
    const accuracy = Number(value);
    return Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null;
  }
  function hasGeolocation() { return typeof global.navigator?.geolocation?.getCurrentPosition === "function"; }
  function locationStatusFromError(error) {
    if (Number(error?.code) === 1) return "denied";
    if (Number(error?.code) === 3) return "timeout";
    return "unavailable";
  }
  function getLocationSnapshot() {
    return { userLocation: state.userLocation ? { ...state.userLocation } : null, locationRequestPending: state.locationRequestPending, locationStatus: state.locationStatus, hasUserLocationMarker: Boolean(state.userLocationMarker) };
  }
  function locationStatusKey(status) {
    return ({ loading: "map.location_loading_status", ready: "map.location_success", denied: "map.location_denied", unavailable: "map.location_unavailable", timeout: "map.location_timeout", unsupported: "map.location_unsupported" })[status] || "";
  }
  function renderLocationControl() {
    const button = document.querySelector("[data-map-current-location]"); const labelNode = document.querySelector("[data-map-location-label]"); const statusNode = document.querySelector("[data-map-location-status]");
    const loading = state.locationStatus === "loading"; const unsupported = state.locationStatus === "unsupported"; const labelText = t(loading ? "map.current_location_loading" : "map.current_location");
    if (button) { button.disabled = loading || unsupported; button.setAttribute("aria-busy", String(loading)); button.setAttribute("aria-label", labelText); }
    if (labelNode) labelNode.textContent = labelText;
    if (statusNode) { const key = locationStatusKey(state.locationStatus); statusNode.textContent = key ? t(key) : ""; statusNode.hidden = !key; statusNode.setAttribute("role", ["denied", "unavailable", "timeout", "unsupported"].includes(state.locationStatus) ? "alert" : "status"); }
  }
  function restoreLocationButtonFocus() { const button = document.querySelector("[data-map-current-location]"); if (button?.focus) button.focus({ preventScroll: true }); }
  function updateUserLocationMarkerAccessibility(marker) {
    if (!marker) return marker; const accessibleLabel = t("map.user_location_marker_label"); const element = marker.getElement?.();
    if (marker.options) { marker.options.title = accessibleLabel; marker.options.alt = accessibleLabel; }
    if (element) { element.setAttribute("role", "img"); element.setAttribute("aria-label", accessibleLabel); element.setAttribute("title", accessibleLabel); }
    return marker;
  }
  function upsertUserLocationMarker(map, existingMarker, location) {
    if (!map || !global.L?.marker || !global.L?.divIcon || !isValidCoordinatePair(location?.latitude, location?.longitude)) return existingMarker || null;
    const latlng = [normalizeCoordinate(location.latitude), normalizeCoordinate(location.longitude)];
    if (existingMarker?.setLatLng) { existingMarker.setLatLng(latlng); return updateUserLocationMarkerAccessibility(existingMarker); }
    const accessibleLabel = t("map.user_location_marker_label");
    const icon = global.L.divIcon({ className: "map-user-location-marker", html: '<span class="map-user-location-marker__halo" aria-hidden="true"></span><span class="map-user-location-marker__symbol" aria-hidden="true">◎</span>', iconSize: [36, 36], iconAnchor: [18, 18] });
    const marker = global.L.marker(latlng, { icon, title: accessibleLabel, alt: accessibleLabel, keyboard: true }); marker.addTo(map); marker.on?.("add", () => updateUserLocationMarkerAccessibility(marker)); return updateUserLocationMarkerAccessibility(marker);
  }
  function focusUserLocation(map, location) {
    if (!map?.setView || !isValidCoordinatePair(location?.latitude, location?.longitude)) return false;
    const currentZoom = Number(map.getZoom?.()); const zoom = Number.isFinite(currentZoom) ? Math.max(currentZoom, 14) : 14;
    map.setView([normalizeCoordinate(location.latitude), normalizeCoordinate(location.longitude)], zoom); return true;
  }
  function finishLocationRequest(status) { state.locationRequestPending = false; state.locationStatus = status; renderLocationControl(); restoreLocationButtonFocus(); }
  function handleLocationSuccess(position) {
    const latitude = normalizeCoordinate(position?.coords?.latitude); const longitude = normalizeCoordinate(position?.coords?.longitude);
    if (!isValidCoordinatePair(latitude, longitude)) { finishLocationRequest("unavailable"); return false; }
    state.userLocation = { latitude, longitude, accuracy: normalizeAccuracy(position?.coords?.accuracy) };
    if (state.map) state.userLocationMarker = upsertUserLocationMarker(state.map, state.userLocationMarker, state.userLocation);
    focusUserLocation(state.map, state.userLocation); renderList(); const selected = state.places.find((place) => place.place_id === state.selectedPlaceId); if (selected) renderPreview(selected, state.focusOrigin, { focus: false }); finishLocationRequest("ready"); return true;
  }
  function handleLocationError(error) { finishLocationRequest(locationStatusFromError(error)); return false; }
  function requestCurrentLocation() {
    if (state.locationRequestPending) return false;
    if (!hasGeolocation()) { state.locationStatus = "unsupported"; renderLocationControl(); return false; }
    state.locationRequestPending = true; state.locationStatus = "loading"; renderLocationControl();
    global.navigator.geolocation.getCurrentPosition(handleLocationSuccess, handleLocationError, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }); return true;
  }
  function bindCurrentLocationControl(button) { if (!button?.addEventListener) return false; button.addEventListener("click", requestCurrentLocation); return true; }

  function uniqueMarkerValues(field) { return [...new Set(state.markerPlaces.map((place) => String(place?.[field] || "").trim()).filter(Boolean))].sort(); }
  function renderChips(host, values, group, active) {
    if (!host) return; const fragment = document.createDocumentFragment();
    [{ value: "", text: t("map.all") }, ...values.map((value) => ({ value, text: label(group, value) }))].forEach(({ value, text }) => {
      const button = make("button", `chip${active === value ? " is-active" : ""}`, text); button.type = "button"; button.dataset.filterValue = value; button.setAttribute("aria-pressed", String(active === value)); fragment.append(button);
    }); host.replaceChildren(fragment);
  }

  function renderFilters() { renderChips(document.querySelector("[data-map-category-filters]"), state.categories, "categories", state.category); renderChips(document.querySelector("[data-map-district-filters]"), state.districts, "districts", state.district); }
  function updateUrl(mode = "replace") { const params = new URLSearchParams(); if (state.category) params.set("category", state.category); if (state.district) params.set("district", state.district); if (state.keyword) params.set("keyword", state.keyword); const url = `${global.location.pathname}${params.size ? `?${params}` : ""}`; global.history?.[`${mode}State`]?.({}, "", url); }

  function createActionLink(text, href, className, external = false) { const link = make("a", className, text); link.href = href; if (external) { link.target = "_blank"; link.rel = "noopener noreferrer"; } return link; }
  function addFavoriteButton(container, place, compact = false) {
    const name = pick(place, "name"); const saved = readFavorites().includes(place.place_id); const button = make("button", `${compact ? "map-list-card__favorite" : "map-preview__favorite"}${saved ? " is-active" : ""}`, saved ? "♥" : "♡"); button.type = "button"; button.setAttribute("aria-pressed", String(saved)); button.setAttribute("aria-label", format(saved ? "map.favorite_remove" : "map.favorite_add", { name }));
    button.addEventListener("click", () => { const nowSaved = toggleFavorite(place.place_id).includes(place.place_id); showToast(t(nowSaved ? "map.favorite_added" : "map.favorite_removed")); renderList(); if (state.selectedPlaceId === place.place_id) renderPreview(place, state.focusOrigin); }); container.append(button);
  }

  function renderList() {
    const host = document.querySelector("[data-map-fallback-list]"); if (!host) return; const fragment = document.createDocumentFragment();
    deriveDistanceSortedPlaces(state.filtered, state.userLocation).forEach((place) => {
      const card = make("article", "map-list-card"); const body = make("div", "map-list-card__body"); const title = make("h3", "", pick(place, "name")); const meta = make("p", "map-list-card__meta", `${label("categories", place.category)} · ${label("districts", place.district)}`); const coordinate = make("p", "map-list-card__coordinate", t(hasMapCoordinates(place) ? "map.has_coordinate" : "map.no_coordinate")); const actions = make("div", "map-list-card__actions"); const model = getActionModel(place);
      const distanceText = approximateDistanceText(place); const distance = distanceText ? make("p", "map-list-card__distance", distanceText) : null;
      actions.append(createActionLink(t("map.view_details"), model.detailUrl, "button button--ghost")); if (model.navigationUrl) actions.append(createActionLink(t("map.navigate"), model.navigationUrl, "button button--secondary", true)); if (model.phoneUrl) actions.append(createActionLink(t("map.call"), model.phoneUrl, "button button--ghost")); addFavoriteButton(actions, place, true); body.append(title, meta, coordinate); if (distance) body.append(distance); body.append(actions); card.append(body); fragment.append(card);
    }); host.replaceChildren(fragment); const count = document.querySelector("[data-map-results]"); if (count) count.textContent = format("map.result_count", { count: state.filtered.length }); const notice = document.querySelector("[data-map-distance-sort-notice]"); if (notice) notice.hidden = !state.filtered.length || !isValidCoordinatePair(state.userLocation?.latitude, state.userLocation?.longitude);
  }

  function closePreview(returnFocus = true) { const preview = document.querySelector("[data-map-preview]"); if (preview) { preview.hidden = true; preview.replaceChildren(); } const previous = state.selectedPlaceId; state.selectedPlaceId = ""; updateSelectedMarkers(); if (returnFocus && state.focusOrigin?.focus) state.focusOrigin.focus(); state.focusOrigin = null; return previous; }
  function renderPreview(place, origin, options = {}) {
    const host = document.querySelector("[data-map-preview]"); if (!host) return; state.selectedPlaceId = place.place_id; state.focusOrigin = origin || state.focusOrigin; const name = pick(place, "name"); const header = make("div", "map-preview__header"); const close = make("button", "map-preview__close", "×"); close.type = "button"; close.setAttribute("aria-label", t("map.close")); close.addEventListener("click", () => closePreview()); header.append(make("h2", "", name), close); header.querySelector("h2").id = "map-preview-title";
    const media = make("div", "map-preview__media"); if (validHttpsUrl(place.cover_image_url) || /^data:image\/svg\+xml,/i.test(String(place.cover_image_url || ""))) { const image = make("img"); image.src = place.cover_image_url; image.alt = name; image.addEventListener("error", () => media.replaceChildren(make("span", "", t("map.image_fallback"))), { once: true }); media.append(image); } else media.append(make("span", "", t("map.image_fallback")));
    const meta = make("p", "map-preview__meta", `${label("categories", place.category)} · ${label("districts", place.district)}`); const copy = make("p", "", pick(place, "short_description")); const coordinate = make("p", "map-preview__coordinate", t("map.coordinate_approximate")); const distanceText = approximateDistanceText(place); const distance = distanceText ? make("p", "map-preview__distance", distanceText) : null; const body = make("div", "map-preview__body"); body.append(media, meta, copy, coordinate); if (distance) body.append(distance); const actions = make("div", "map-preview__actions"); const model = getActionModel(place); actions.append(createActionLink(t("map.view_details"), model.detailUrl, "button button--primary")); if (model.navigationUrl) actions.append(createActionLink(t("map.navigate"), model.navigationUrl, "button button--secondary", true)); if (model.phoneUrl) actions.append(createActionLink(t("map.call"), model.phoneUrl, "button button--ghost")); addFavoriteButton(actions, place); host.replaceChildren(header, body, actions); host.hidden = false; if (options.focus !== false) host.focus(); updateSelectedMarkers();
  }

  function markerHtml(place) { const category = String(place.category || "other"); return `<span class="map-marker__symbol" aria-hidden="true">${CATEGORY_SYMBOLS[category] || "●"}</span>`; }
  function createMarker(place) {
    const name = pick(place, "name"); const category = label("categories", place.category); const icon = global.L.divIcon({ className: `map-marker map-marker--${place.category}`, html: markerHtml(place), iconSize: [42, 48], iconAnchor: [21, 44] });
    const marker = global.L.marker([normalizeCoordinate(place.latitude), normalizeCoordinate(place.longitude)], { icon, title: name, keyboard: true }); marker.addTo(state.map); marker.on("click", () => renderPreview(place, marker.getElement?.())); marker.on("add", () => { const element = marker.getElement?.(); if (!element) return; element.setAttribute("role", "button"); element.setAttribute("tabindex", "0"); element.setAttribute("aria-label", format("map.marker_label", { name, category })); element.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); renderPreview(place, element); } }); }); return marker;
  }
  function updateSelectedMarkers() { state.markers.forEach((marker, id) => { const element = marker.getElement?.(); element?.classList.toggle("is-selected", id === state.selectedPlaceId); element?.setAttribute("aria-pressed", String(id === state.selectedPlaceId)); }); }
  function renderMarkers() { state.markers.forEach((marker) => marker.remove()); state.markers.clear(); const ids = new Set(state.filtered.filter(hasMapCoordinates).map((place) => place.place_id)); state.markerPlaces.filter((place) => ids.has(place.place_id)).forEach((place) => state.markers.set(place.place_id, createMarker(place))); }
  function visibleLatLngs() { return state.filtered.filter(hasMapCoordinates).map((place) => [normalizeCoordinate(place.latitude), normalizeCoordinate(place.longitude)]); }
  function fitVisible() { if (!state.map) return; const latlngs = visibleLatLngs(); if (!latlngs.length) return; if (latlngs.length === 1) state.map.setView(latlngs[0], 13); else state.map.fitBounds(latlngs, { padding: [36, 36], maxZoom: 14 }); }

  function renderLegend() { const host = document.querySelector("[data-map-legend-list]"); if (!host) return; const fragment = document.createDocumentFragment(); state.categories.forEach((category) => { const item = make("li"); const symbol = make("span", `map-legend__symbol map-legend__symbol--${category}`, CATEGORY_SYMBOLS[category] || "●"); symbol.setAttribute("aria-hidden", "true"); item.append(symbol, make("span", "", label("categories", category))); fragment.append(item); }); host.replaceChildren(fragment); }
  function applyFilters({ fit = true, url = true } = {}) { state.filtered = filterPlaces(state.places, state, global.TakhunI18n?.getCurrentLang?.()); if (state.selectedPlaceId && !state.filtered.some((place) => place.place_id === state.selectedPlaceId)) closePreview(false); renderFilters(); renderList(); if (state.map) renderMarkers(); setPrimaryState(mounts(), state.filtered.length ? (hasLeaflet() ? "ready" : "leaflet-unavailable") : "empty"); if (fit && state.map) fitVisible(); if (url) updateUrl("replace"); }

  function showFocusNotices(query) { const notFound = document.querySelector("[data-map-focus-not-found]"); const noCoordinate = document.querySelector("[data-map-focus-no-coordinate]"); const route = document.querySelector("[data-map-route-unavailable]"); if (notFound) notFound.hidden = true; if (noCoordinate) noCoordinate.hidden = true; if (route) route.hidden = !query.route; if (!query.focus) return; const result = resolveFocus(query.focus); if (result.state === "not-found") { if (notFound) notFound.hidden = false; return; } if (result.state === "no-coordinate") { if (noCoordinate) noCoordinate.hidden = false; return; } if (!state.filtered.some((place) => place.place_id === result.place.place_id)) return; const marker = state.markers.get(result.place.place_id); state.map?.setView([normalizeCoordinate(result.place.latitude), normalizeCoordinate(result.place.longitude)], 14); renderPreview(result.place, marker?.getElement?.()); }

  function initLeaflet() { if (!hasLeaflet()) return false; if (state.map) return true; state.map = global.L.map("map", { scrollWheelZoom: false }); state.tileLayer = global.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors", maxZoom: 19 }); state.tileLayer.on("tileerror", () => { noteTileError(); const notice = document.querySelector("[data-map-tile-unavailable]"); if (notice) notice.hidden = false; }); state.tileLayer.addTo(state.map); return true; }
  function hydrateQuery(query) { state.category = state.categories.includes(query.category) ? query.category : ""; state.district = state.districts.includes(query.district) ? query.district : ""; state.keyword = query.keyword; const input = document.querySelector("[data-map-search]"); if (input) input.value = state.keyword; }

  function render() {
    setPrimaryState(mounts(), "loading"); closePreview(false);
    try { if (!global.TakhunPlaceData?.listPlaces) throw new Error("Shared place data unavailable"); state.places = getPublishedPlaces(global.TakhunPlaceData.listPlaces()); state.markerPlaces = getMarkerPlaces(state.places); state.categories = uniqueMarkerValues("category"); state.districts = uniqueMarkerValues("district"); const query = parseQuery(); hydrateQuery(query); const focus = resolveFocus(query.focus); if (focus.state === "ready") Object.assign(state, reconcileFocusFilters(focus.place, state)); renderLegend(); const leafletReady = initLeaflet(); applyFilters({ fit: leafletReady, url: false }); showFocusNotices(query); }
    catch (_error) { state.places = []; state.filtered = []; renderList(); setPrimaryState(mounts(), "error"); }
  }

  function bind() {
    const locationButton = document.querySelector("[data-map-current-location]"); bindCurrentLocationControl(locationButton); if (!hasGeolocation()) state.locationStatus = "unsupported"; renderLocationControl();
    document.querySelector("[data-map-category-filters]")?.addEventListener("click", (event) => { const button = event.target.closest("[data-filter-value]"); if (!button) return; state.category = button.dataset.filterValue; applyFilters(); });
    document.querySelector("[data-map-district-filters]")?.addEventListener("click", (event) => { const button = event.target.closest("[data-filter-value]"); if (!button) return; state.district = button.dataset.filterValue; applyFilters(); });
    document.querySelector("[data-map-search]")?.addEventListener("input", (event) => { global.clearTimeout(state.debounceTimer); state.debounceTimer = global.setTimeout(() => { state.keyword = event.target.value.trim(); applyFilters(); }, 250); });
    document.querySelector("[data-map-clear-search]")?.addEventListener("click", () => { const input = document.querySelector("[data-map-search]"); if (input) input.value = ""; state.keyword = ""; applyFilters(); input?.focus(); });
    document.querySelector("[data-map-reset]")?.addEventListener("click", () => { fitVisible(); });
    document.querySelectorAll("[data-map-retry]").forEach((button) => button.addEventListener("click", render));
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && state.selectedPlaceId) closePreview(); });
    document.addEventListener("takhun:languagechange", () => { const snapshot = preserveInteractiveState(state); global.TakhunI18n?.applyTranslations?.(document); Object.assign(state, snapshot); renderLegend(); renderMarkers(); renderFilters(); renderList(); renderLocationControl(); updateUserLocationMarkerAccessibility(state.userLocationMarker); const selected = state.places.find((place) => place.place_id === state.selectedPlaceId); if (selected) renderPreview(selected, state.markers.get(selected.place_id)?.getElement?.(), { focus: false }); });
    global.addEventListener?.("popstate", () => { const query = parseQuery(); hydrateQuery(query); applyFilters({ url: false }); showFocusNotices(query); });
  }

  const api = { normalizeCoordinate, isValidCoordinatePair, normalizeAccuracy, toRadians, haversineDistanceKm, formatApproximateDistance, distanceFromUser, deriveDistanceSortedPlaces, getPublishedPlaces, getMarkerPlaces, filterPlaces, validateIdentifier, parseQuery, resolveFocus, reconcileFocusFilters, validHttpsUrl, getActionModel, readFavorites, toggleFavorite, setPrimaryState, hasLeaflet, noteTileError, preserveInteractiveState, hasGeolocation, locationStatusFromError, getLocationSnapshot, upsertUserLocationMarker, focusUserLocation, requestCurrentLocation, bindCurrentLocationControl };
  global.TakhunMap = Object.freeze(api);
  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", () => { bind(); render(); }); else if (global.document?.querySelector?.("[data-map-canvas]")) { bind(); render(); }
})(window);
