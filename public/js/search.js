"use strict";

(function createSearchFeature(global) {
  const SECTION_ORDER = Object.freeze(["places", "routes", "products", "events"]);
  const RESPONSE_ORDER = Object.freeze(["places", "products", "events", "routes"]);
  const ITEM_FIELDS = Object.freeze({
    places: Object.freeze(["place_id", "name", "short_description", "category", "district", "cover_image_url"]),
    routes: Object.freeze(["route_id", "name", "short_description", "duration", "travel_style", "cover_image_url"]),
    products: Object.freeze(["product_id", "name", "description", "category", "producer_name", "image_url"]),
    events: Object.freeze(["event_id", "title", "event_type", "event_date", "start_time", "end_time", "location", "image_url"])
  });
  const ID_FIELDS = Object.freeze({ places: "place_id", routes: "route_id", products: "product_id", events: "event_id" });
  const DETAIL_PAGES = Object.freeze({ places: "place-detail.html", routes: "route-detail.html", products: "product-detail.html", events: "event-detail.html" });
  const IMAGE_FIELDS = Object.freeze({ places: "cover_image_url", routes: "cover_image_url", products: "image_url", events: "image_url" });

  function normalizeQuery(value) {
    if (value === null || value === undefined) return "";
    try { return String(value).normalize("NFC").trim().replace(/\s+/gu, " "); }
    catch (_error) { return ""; }
  }

  function parseSearchQuery(search = global.location?.search || "") {
    try { return normalizeQuery(new URLSearchParams(String(search || "")).get("q")); }
    catch (_error) { return ""; }
  }

  function validateQuery(value) {
    const query = normalizeQuery(value);
    if (!query) return { valid: false, reason: "required", query };
    if (Array.from(query).length > 100) return { valid: false, reason: "too-long", query };
    return { valid: true, reason: "", query };
  }

  function searchUrl(pathname, value) {
    const path = String(pathname || "search.html").split(/[?#]/u)[0] || "search.html";
    const query = normalizeQuery(value);
    if (!query) return path;
    const params = new URLSearchParams();
    params.set("q", query);
    return `${path}?${params.toString()}`;
  }

  function writeSearchHistory(history, pathname, value, mode = "push") {
    const method = mode === "replace" ? "replaceState" : "pushState";
    history?.[method]?.({}, "", searchUrl(pathname, value));
  }

  function malformedResponse() {
    const error = new Error("MALFORMED_RESPONSE");
    error.code = "MALFORMED_RESPONSE";
    return error;
  }

  function hasExactKeys(value, fields) {
    if (!value || Array.isArray(value) || typeof value !== "object") return false;
    const keys = Object.keys(value);
    return keys.length === fields.length && fields.every((field) => keys.includes(field));
  }

  function parseDateParts(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(String(value || ""));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth ? { year, month, day } : null;
  }

  function validTime(value) { return /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(String(value || "")); }

  function formatEventDate(value, lang = "th") {
    const parts = parseDateParts(value);
    if (!parts) return "";
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", { dateStyle: "medium", timeZone: "UTC" }).format(date);
  }

  function formatTimeRange(startTime, endTime) {
    const start = String(startTime || "");
    const end = String(endTime || "");
    if (!validTime(start) || (end && !validTime(end))) return "";
    return end ? `${start}–${end}` : start;
  }

  function normalizeItem(section, item) {
    const fields = ITEM_FIELDS[section];
    if (!hasExactKeys(item, fields)) throw malformedResponse();
    const clone = {};
    fields.forEach((field) => {
      const value = item[field];
      if (field === "travel_style") {
        if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) throw malformedResponse();
        clone[field] = value.slice();
      } else {
        if (typeof value !== "string") throw malformedResponse();
        clone[field] = value;
      }
    });
    const primary = section === "events" ? clone.title : clone.name;
    if (!clone[ID_FIELDS[section]].trim() || !primary.trim()) throw malformedResponse();
    return clone;
  }

  function normalizeSearchResponse(data) {
    if (!hasExactKeys(data, ["places", "products", "events", "routes", "total"]) || !Number.isInteger(data.total) || data.total < 0) throw malformedResponse();
    const normalized = { places: [], products: [], events: [], routes: [], total: data.total };
    RESPONSE_ORDER.forEach((section) => {
      if (!Array.isArray(data[section])) throw malformedResponse();
      normalized[section] = data[section].map((item) => normalizeItem(section, item));
    });
    normalized.events = normalized.events.filter((event) => parseDateParts(event.event_date));
    if (data.total < shownCount(normalized)) throw malformedResponse();
    return normalized;
  }

  function shownCount(data) {
    return RESPONSE_ORDER.reduce((count, section) => count + (Array.isArray(data?.[section]) ? data[section].length : 0), 0);
  }

  function resultCountKind(data) { return Number(data?.total) > shownCount(data) ? "limited" : "exact"; }

  function detailUrl(section, id) {
    const page = DETAIL_PAGES[section];
    return page ? `${page}?id=${encodeURIComponent(String(id || "").trim())}` : "";
  }

  function safeImageUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
    } catch (_error) { return ""; }
  }

  function resolvePrimaryState(state) {
    return ["idle", "loading", "ready", "empty", "validation-error", "request-error"].includes(state) ? state : "request-error";
  }

  function setPrimaryState(stateMap, activeState) {
    if (!stateMap || !Object.prototype.hasOwnProperty.call(stateMap, activeState)) return false;
    Object.entries(stateMap).forEach(([state, element]) => { if (element) element.hidden = state !== activeState; });
    return true;
  }

  function emptyData() { return { places: [], products: [], events: [], routes: [], total: 0 }; }

  function createSearchController({ request, getLanguage = () => "th", onChange = () => {} } = {}) {
    if (typeof request !== "function") throw new TypeError("request is required");
    let generation = 0;
    let inFlightKey = "";
    let inFlightPromise = null;
    let inFlightFocusRequested = false;
    let snapshot = { state: "idle", query: "", data: emptyData(), validationReason: "", focusTarget: "", lang: getLanguage() === "en" ? "en" : "th" };

    function copySnapshot() {
      return { ...snapshot, data: normalizeSearchResponse(snapshot.data) };
    }
    function emit(next) {
      snapshot = { ...snapshot, ...next };
      onChange(copySnapshot());
    }
    function load(value, { reason = "initial" } = {}) {
      const validation = validateQuery(value);
      const lang = getLanguage() === "en" ? "en" : "th";
      if (!validation.valid) {
        generation += 1;
        inFlightKey = "";
        inFlightPromise = null;
        const showValidation = reason !== "idle";
        emit({ state: showValidation ? "validation-error" : "idle", query: validation.query, data: emptyData(), validationReason: showValidation ? validation.reason : "", focusTarget: reason === "submit" ? "error" : "", lang });
        return Promise.resolve(copySnapshot());
      }
      const key = `${validation.query}\u0000${lang}`;
      if (key === inFlightKey && inFlightPromise) {
        if (reason === "submit") inFlightFocusRequested = true;
        return inFlightPromise;
      }
      const token = ++generation;
      inFlightKey = key;
      inFlightFocusRequested = reason === "submit";
      emit({ state: "loading", query: validation.query, validationReason: "", focusTarget: "", lang });
      inFlightPromise = Promise.resolve().then(() => request({ keyword: validation.query, lang })).then((data) => {
        const normalized = normalizeSearchResponse(data);
        if (token !== generation) return copySnapshot();
        emit({ state: shownCount(normalized) ? "ready" : "empty", data: normalized, focusTarget: inFlightFocusRequested ? "results" : "" });
        return copySnapshot();
      }).catch((_error) => {
        if (token === generation) emit({ state: "request-error", data: emptyData(), focusTarget: inFlightFocusRequested ? "error" : "" });
        return copySnapshot();
      }).finally(() => {
        if (token === generation) { inFlightKey = ""; inFlightPromise = null; inFlightFocusRequested = false; }
      });
      return inFlightPromise;
    }
    function retry() { return load(snapshot.query, { reason: "retry" }); }
    function languageChanged() {
      if (!snapshot.query || ["idle", "validation-error"].includes(snapshot.state)) { emit({ focusTarget: "" }); return Promise.resolve(copySnapshot()); }
      return load(snapshot.query, { reason: "language" });
    }
    return Object.freeze({ load, retry, languageChanged, getSnapshot: copySnapshot });
  }

  function t(key) { return global.TakhunI18n?.t?.(key) || key; }
  function format(key, values = {}) { return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), t(key)); }
  function currentLang() { return global.TakhunI18n?.getCurrentLang?.() === "en" ? "en" : "th"; }
  function make(tag, className = "", text = "") {
    const element = global.document.createElement(tag);
    if (className) element.className = className;
    if (text !== "") element.textContent = text;
    return element;
  }
  function appendImage(mount, section, item, name) {
    const fallback = () => {
      const panel = make("span", "search-card__image-fallback", t("search.image_fallback"));
      panel.setAttribute("role", "img");
      panel.setAttribute("aria-label", format("search.image_alt", { name }));
      mount.replaceChildren(panel);
    };
    const imageUrl = safeImageUrl(item[IMAGE_FIELDS[section]]);
    if (!imageUrl) { fallback(); return; }
    const image = global.document.createElement("img");
    image.className = "search-card__image";
    image.src = imageUrl;
    image.alt = format("search.image_alt", { name });
    image.loading = "lazy";
    image.addEventListener("error", fallback, { once: true });
    mount.append(image);
  }

  function appendMeta(body, labelKey, value) {
    const text = Array.isArray(value) ? value.join(" · ") : String(value || "").trim();
    if (text) body.append(make("p", "search-card__meta", `${t(labelKey)}: ${text}`));
  }

  function renderCard(section, item) {
    const name = String(section === "events" ? item.title : item.name).trim();
    const card = make("article", "search-card");
    const media = make("a", "search-card__media");
    media.href = detailUrl(section, item[ID_FIELDS[section]]);
    media.setAttribute("aria-label", format("search.view_named", { name }));
    appendImage(media, section, item, name);
    const body = make("div", "search-card__body");
    const heading = make("h3", "search-card__title");
    const titleLink = make("a", "", name);
    titleLink.href = media.href;
    heading.append(titleLink);
    body.append(heading);
    const description = String(item.short_description || item.description || "").trim();
    if (description) body.append(make("p", "search-card__description", description));
    if (section === "places") { appendMeta(body, "search.meta_category", item.category); appendMeta(body, "search.meta_district", item.district); }
    if (section === "routes") { appendMeta(body, "search.meta_duration", item.duration); appendMeta(body, "search.meta_travel_style", item.travel_style); }
    if (section === "products") { appendMeta(body, "search.meta_category", item.category); appendMeta(body, "search.meta_producer", item.producer_name); }
    if (section === "events") {
      appendMeta(body, "search.event_date", formatEventDate(item.event_date, currentLang()));
      appendMeta(body, "search.event_time", formatTimeRange(item.start_time, item.end_time));
      appendMeta(body, "search.event_location", item.location);
    }
    const action = make("a", "button button--secondary search-card__action", t("search.view_details"));
    action.href = media.href;
    body.append(action);
    card.append(media, body);
    return card;
  }

  function initializeSearchPage() {
    const root = global.document?.querySelector?.(".search-page");
    if (!root || !global.TakhunApi?.searchAll) return;
    const form = global.document.querySelector("[data-search-form]");
    const input = global.document.querySelector("[data-search-input]");
    const states = Object.fromEntries(["idle", "loading", "ready", "empty", "validation-error", "request-error"].map((state) => [state, global.document.querySelector(`[data-search-state="${state}"]`)]));
    let lastSnapshot;

    function render(snapshot) {
      lastSnapshot = snapshot;
      input.value = snapshot.query;
      setPrimaryState(states, resolvePrimaryState(snapshot.state));
      if (snapshot.state === "validation-error") {
        const key = snapshot.validationReason === "too-long" ? "search.validation.too_long" : "search.validation.required";
        const heading = global.document.querySelector("[data-search-error-heading]");
        const message = global.document.querySelector("[data-search-validation-message]");
        heading.textContent = t(key); message.textContent = t(key);
      }
      if (snapshot.state === "ready") {
        const shown = shownCount(snapshot.data);
        const summaryKey = resultCountKind(snapshot.data) === "limited" ? "search.results_limited" : "search.results_exact";
        global.document.querySelector("[data-search-summary]").textContent = format(summaryKey, { count: new Intl.NumberFormat(currentLang()).format(shown), total: new Intl.NumberFormat(currentLang()).format(snapshot.data.total), max: 10 });
        SECTION_ORDER.forEach((section) => {
          const items = snapshot.data[section];
          const count = global.document.querySelector(`[data-search-count="${section}"]`);
          const grid = global.document.querySelector(`[data-search-grid="${section}"]`);
          const empty = global.document.querySelector(`[data-search-section-empty="${section}"]`);
          count.textContent = `(${new Intl.NumberFormat(currentLang()).format(items.length)})`;
          grid.replaceChildren(...items.map((item) => renderCard(section, item)));
          empty.textContent = t(`search.section_empty.${section}`);
          empty.hidden = items.length !== 0;
        });
      }
      global.TakhunI18n?.applyTranslations?.(root);
      if (snapshot.focusTarget === "results") global.document.querySelector(snapshot.state === "empty" ? "[data-search-empty-heading]" : "[data-search-results-heading]")?.focus();
      if (snapshot.focusTarget === "error") global.document.querySelector(snapshot.state === "validation-error" ? "[data-search-error-heading]" : "[data-search-request-error-heading]")?.focus();
    }

    const controller = createSearchController({
      request: (params) => global.TakhunApi.searchAll(params),
      getLanguage: currentLang,
      onChange: render
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const validation = validateQuery(input.value);
      input.value = validation.query;
      if (!validation.query) writeSearchHistory(global.history, global.location.pathname, "", "push");
      else if (validation.valid) writeSearchHistory(global.history, global.location.pathname, validation.query, "push");
      controller.load(validation.query, { reason: "submit" });
    });
    global.document.querySelector("[data-search-retry]")?.addEventListener("click", () => controller.retry());
    global.addEventListener?.("popstate", () => {
      const params = new URLSearchParams(global.location.search);
      controller.load(parseSearchQuery(params.toString()), { reason: params.has("q") ? "popstate" : "idle" });
    });
    global.document.addEventListener("takhun:languagechange", () => controller.languageChanged().then(() => { if (lastSnapshot && ["idle", "validation-error"].includes(lastSnapshot.state)) render(controller.getSnapshot()); }));
    const initialParams = new URLSearchParams(global.location.search);
    const initialQuery = parseSearchQuery(initialParams.toString());
    input.value = initialQuery;
    controller.load(initialQuery, { reason: initialParams.has("q") ? "initial" : "idle" });
  }

  global.TakhunSearch = Object.freeze({
    SECTION_ORDER, normalizeQuery, parseSearchQuery, validateQuery, searchUrl, writeSearchHistory,
    normalizeSearchResponse, shownCount, resultCountKind, detailUrl, safeImageUrl, parseDateParts,
    formatEventDate, formatTimeRange, resolvePrimaryState, setPrimaryState, createSearchController
  });

  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initializeSearchPage, { once: true });
  else initializeSearchPage();
})(window);
