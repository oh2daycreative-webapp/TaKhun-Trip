"use strict";

(function createEventsFeature(global) {
  const EVENT_TYPES = Object.freeze([
    "launch", "festival", "community_market", "community_tourism", "learning", "seasonal", "otop", "tourism", "other"
  ]);
  const EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
  const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

  function parseEventId(search = global.location?.search || "") {
    return String(new URLSearchParams(search).get("id") || "").trim();
  }

  function validateEventId(value) {
    return EVENT_ID_PATTERN.test(String(value || "").trim());
  }

  function parseEventFilters(search = global.location?.search || "") {
    const params = new URLSearchParams(search);
    const filters = {};
    const invalid = [];
    const type = String(params.get("type") || "").trim();
    const month = String(params.get("month") || "").trim();
    if (type) EVENT_TYPES.includes(type) ? filters.type = type : invalid.push("type");
    if (month) MONTH_PATTERN.test(month) ? filters.month = month : invalid.push("month");
    return { filters, invalid };
  }

  function filterEvents(events, filters = {}) {
    const type = String(filters.type || "").trim();
    const month = String(filters.month || "").trim();
    return (Array.isArray(events) ? events : []).filter((event) => {
      if (type && String(event?.event_type || "") !== type) return false;
      if (month && !String(event?.event_date || "").startsWith(`${month}-`)) return false;
      return true;
    });
  }

  function malformedResponse() {
    const error = new Error("MALFORMED_RESPONSE");
    error.code = "MALFORMED_RESPONSE";
    return error;
  }

  function normalizeEventList(data) {
    if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.items)) throw malformedResponse();
    const items = data.items.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item) || !validateEventId(item.event_id) || !parseDateParts(item.event_date)) throw malformedResponse();
      return { ...item, event_id: String(item.event_id).trim() };
    }).filter((item) => !item.status || item.status === "published");
    return { items, total: items.length };
  }

  function normalizeEventDetail(data) {
    if (data === null) return null;
    if (!data || typeof data !== "object" || Array.isArray(data) || !validateEventId(data.event_id) || !parseDateParts(data.event_date)) throw malformedResponse();
    if (data.status && data.status !== "published") return null;
    return { ...data, event_id: String(data.event_id).trim() };
  }

  function localized(item, field, lang = "th") {
    if (!item || typeof item !== "object") return "";
    const normalizedLang = lang === "en" ? "en" : "th";
    return String(item[`${field}_${normalizedLang}`] || item[`${field}_th`] || item[field] || "").trim();
  }

  function normalizeBoolean(value) {
    if (value === true || value === 1) return true;
    return typeof value === "string" && ["true", "1"].includes(value.trim().toLowerCase());
  }

  function parseDateParts(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return { year, month, day, iso: `${match[1]}-${match[2]}-${match[3]}` };
  }

  function dateFromParts(parts) {
    return parts ? new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0) : null;
  }

  function formatEventDate(value, lang = "th") {
    const parts = parseDateParts(value);
    if (!parts) return "";
    const locale = lang === "en" ? "en-GB" : "th-TH-u-ca-buddhist";
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(dateFromParts(parts));
  }

  function validTime(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || "").trim());
    return match && Number(match[1]) <= 23 && Number(match[2]) <= 59 ? `${match[1]}:${match[2]}` : "";
  }

  function formatTimeRange(startTime, endTime) {
    const start = validTime(startTime);
    const end = validTime(endTime);
    if (!start) return "";
    return end ? `${start}–${end}` : start;
  }

  function classifyEvent(event, now = new Date()) {
    const parts = parseDateParts(event?.event_date);
    if (!parts || typeof now?.getTime !== "function" || Number.isNaN(now.getTime())) return "unknown";
    const eventKey = parts.year * 10000 + parts.month * 100 + parts.day;
    const todayKey = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    if (eventKey === todayKey) return "current";
    return eventKey > todayKey ? "upcoming" : "past";
  }

  function sortEvents(events, now = new Date()) {
    const rank = { current: 0, upcoming: 1, unknown: 2, past: 3 };
    return (Array.isArray(events) ? events : []).map((event, index) => ({ event, index })).sort((left, right) => {
      const leftState = classifyEvent(left.event, now);
      const rightState = classifyEvent(right.event, now);
      const stateDifference = rank[leftState] - rank[rightState];
      if (stateDifference) return stateDifference;
      const leftParts = parseDateParts(left.event?.event_date);
      const rightParts = parseDateParts(right.event?.event_date);
      const leftDate = leftParts ? Number(leftParts.iso.replaceAll("-", "")) : Number.POSITIVE_INFINITY;
      const rightDate = rightParts ? Number(rightParts.iso.replaceAll("-", "")) : Number.POSITIVE_INFINITY;
      const dateDifference = leftState === "past" ? rightDate - leftDate : leftDate - rightDate;
      if (dateDifference) return dateDifference;
      const featuredDifference = Number(normalizeBoolean(right.event?.is_featured)) - Number(normalizeBoolean(left.event?.is_featured));
      return featuredDifference || left.index - right.index;
    }).map(({ event }) => event);
  }

  function safePhoneHref(value) {
    const source = String(value || "").trim();
    if (!source || !/^\+?[\d\s().-]+$/.test(source)) return "";
    const normalized = `${source.startsWith("+") ? "+" : ""}${source.replace(/\D/g, "")}`;
    return normalized.replace(/\D/g, "").length >= 6 ? `tel:${normalized}` : "";
  }

  function safeExternalUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
    } catch (_error) {
      return "";
    }
  }

  function encoded(value) { return encodeURIComponent(String(value || "").trim()); }
  function eventDetailUrl(eventId) { return `event-detail.html?id=${encoded(eventId)}`; }
  function relatedPlaceUrl(placeId) { return `place-detail.html?id=${encoded(placeId)}`; }

  function mapUrl(event) {
    const direct = safeExternalUrl(event?.google_maps_url);
    if (direct) return direct;
    const rawLatitude = String(event?.latitude ?? "").trim();
    const rawLongitude = String(event?.longitude ?? "").trim();
    if (rawLatitude && rawLongitude) {
      const latitude = Number(rawLatitude);
      const longitude = Number(rawLongitude);
      if (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
      }
    }
    return validateEventId(event?.related_place_id) ? `map.html?focus=${encoded(event.related_place_id)}` : "";
  }

  function createRequestGate() {
    let latest = 0;
    return Object.freeze({
      begin() { latest += 1; return latest; },
      isCurrent(token) { return token === latest; }
    });
  }

  function filtersUrl(pathname, filters = {}) {
    const params = new URLSearchParams(filters);
    return `${pathname}${params.toString() ? `?${params}` : ""}`;
  }

  function partitionEvents(events, now = new Date()) {
    const sorted = sortEvents(events, now);
    if (sorted.some((event) => classifyEvent(event, now) === "unknown")) throw malformedResponse();
    return {
      upcoming: sorted.filter((event) => ["current", "upcoming"].includes(classifyEvent(event, now))),
      past: sorted.filter((event) => classifyEvent(event, now) === "past")
    };
  }

  function callActionLabel(phone, label) {
    return safePhoneHref(phone) ? `${label} ${String(phone).trim()}` : "";
  }

  function resolveListState({ loading = false, error = false, invalidFilter = false, items = [], filtered = false } = {}) {
    if (loading) return "loading";
    if (error) return "error";
    if (invalidFilter) return "invalid-filter";
    if (!Array.isArray(items) || items.length === 0) return filtered ? "filtered-empty" : "empty";
    return "ready";
  }

  function resolveDetailState({ idState = "valid", loading = false, error = false, event } = {}) {
    if (idState === "missing") return "missing-id";
    if (idState === "invalid") return "invalid-id";
    if (loading) return "loading";
    if (error) return "error";
    return event ? "ready" : "not-found";
  }

  function setPageState(stateMap, activeState) {
    if (!stateMap || !Object.prototype.hasOwnProperty.call(stateMap, activeState)) return false;
    Object.entries(stateMap).forEach(([state, element]) => { if (element) element.hidden = state !== activeState; });
    return true;
  }

  function mockGetEvents(params = {}) {
    let items = global.TakhunContentData.listEvents();
    if (params.status === "upcoming") items = items.filter((event) => ["current", "upcoming"].includes(classifyEvent(event)));
    if (params.status === "past") items = items.filter((event) => classifyEvent(event) === "past");
    items = filterEvents(items, { type: params.type, month: params.month });
    return { items: sortEvents(items), total: items.length };
  }

  function mockGetEventDetail(eventId) {
    return global.TakhunContentData.getEventById(eventId);
  }

  function t(key) { return global.TakhunI18n?.t?.(key) || key; }
  function format(key, values = {}) { return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), t(key)); }
  function currentLang() { return global.TakhunI18n?.getCurrentLang?.() || "th"; }
  function sectionCountText(count) {
    if (!Number.isSafeInteger(count) || count < 0) return "";
    return format(count === 1 ? "events.section_count_one" : "events.section_count_many", { count });
  }

  function make(tag, className = "", text = "") {
    const element = global.document.createElement(tag);
    if (className) element.className = className;
    if (text !== "") element.textContent = text;
    return element;
  }

  function typeLabel(value) {
    return EVENT_TYPES.includes(value) ? t(`events.types.${value}`) : "";
  }

  function statusLabel(event) {
    const status = classifyEvent(event);
    if (status === "current") return t("events.today");
    if (status === "upcoming") return t("events.upcoming_status");
    if (status === "past") return t("events.past");
    return "";
  }

  function appendEventImage(mount, event, name, detail = false) {
    const fallbackFactory = () => {
      const panel = make("span", detail ? "event-detail-page__image-fallback" : "event-card__image-fallback", t("events.image_fallback"));
      panel.setAttribute("role", "img");
      panel.setAttribute("aria-label", format("events.image_alt", { name }));
      return panel;
    };
    if (global.TakhunMedia?.renderImage) global.TakhunMedia.renderImage(mount, { mediaId: global.TakhunMedia.mediaIdFor("event", event.event_id), type: "event", role: "cover", className: detail ? "event-detail-page__image" : "event-card__image", alt: format("events.image_alt", { name }), loading: detail ? "eager" : "lazy", sizes: detail ? "100vw" : "(min-width: 768px) 50vw, 100vw", lang: global.TakhunI18n?.getCurrentLang?.(), fallbackFactory });
    else mount.append(fallbackFactory());
  }

  function appendMetaLine(mount, className, label, value, timeValue = "") {
    if (!value) return;
    const row = make("p", className);
    row.append(make("strong", "", `${label}: `));
    if (timeValue) {
      const time = make("time", "", value);
      time.dateTime = timeValue;
      row.append(time);
    } else {
      row.append(global.document.createTextNode(value));
    }
    mount.append(row);
  }

  function renderEventCard(event) {
    const lang = currentLang();
    const name = localized(event, "title", lang) || t("events.unnamed");
    const description = localized(event, "description", lang);
    const location = localized(event, "location", lang);
    const card = make("article", "event-card");
    const media = make("a", "event-card__media");
    media.href = eventDetailUrl(event.event_id);
    media.setAttribute("aria-label", format("events.view_named", { name }));
    appendEventImage(media, event, name);
    const state = statusLabel(event);
    if (state) media.append(make("span", `event-card__status event-card__status--${classifyEvent(event)}`, state));
    const body = make("div", "event-card__content");
    const badges = make("div", "event-card__badges");
    if (event.event_type && typeLabel(event.event_type)) badges.append(make("span", "event-card__type", typeLabel(event.event_type)));
    if (normalizeBoolean(event.is_featured)) badges.append(make("span", "event-card__featured", t("events.featured")));
    const title = make("h3", "event-card__title");
    const titleLink = make("a", "", name); titleLink.href = eventDetailUrl(event.event_id); title.append(titleLink);
    body.append(badges, title);
    const date = formatEventDate(event.event_date, lang);
    appendMetaLine(body, "event-card__date", t("events.date"), date, parseDateParts(event.event_date)?.iso || "");
    appendMetaLine(body, "event-card__time", t("events.time"), formatTimeRange(event.start_time, event.end_time));
    appendMetaLine(body, "event-card__venue", t("events.venue"), location);
    if (description) body.append(make("p", "event-card__description", description));
    const actions = make("div", "event-card__actions");
    const detail = make("a", "button button--primary", t("events.view_details")); detail.href = eventDetailUrl(event.event_id); actions.append(detail);
    body.append(actions); card.append(media, body);
    return card;
  }

  function initializeEventsList() {
    const root = global.document?.querySelector?.(".events-page");
    if (!root || !global.TakhunApi?.getEvents) return;
    const states = {
      loading: global.document.querySelector("[data-events-loading]"),
      ready: global.document.querySelector("[data-events-ready]"),
      empty: global.document.querySelector("[data-events-empty]"),
      "filtered-empty": global.document.querySelector("[data-events-filtered-empty]"),
      "invalid-filter": global.document.querySelector("[data-events-invalid-filter]"),
      error: global.document.querySelector("[data-events-error]")
    };
    const form = global.document.querySelector("[data-events-filter-form]");
    const upcomingCount = global.document.querySelector("[data-events-upcoming-count]");
    const pastCount = global.document.querySelector("[data-events-past-count]");
    const featuredSection = global.document.querySelector("[data-events-featured-section]");
    const featuredGrid = global.document.querySelector("[data-events-featured]");
    const pastSection = global.document.querySelector("[data-events-past-section]");
    const grid = global.document.querySelector("[data-events-grid]");
    let records = [];
    let filters = {};
    let isLoading = false;
    const requestGate = createRequestGate();

    function applyControls() {
      const type = form.querySelector('[data-event-filter="type"]');
      const selected = filters.type || "";
      const options = [make("option", "", t("events.all_types")), ...EVENT_TYPES.map((value) => make("option", "", typeLabel(value)))];
      options[0].value = "";
      EVENT_TYPES.forEach((value, index) => { options[index + 1].value = value; });
      type.replaceChildren(...options); type.value = selected;
      form.querySelector('[data-event-filter="month"]').value = filters.month || "";
    }

    function render() {
      const sorted = sortEvents(records);
      const groups = partitionEvents(sorted);
      featuredGrid.replaceChildren(...groups.upcoming.map(renderEventCard));
      featuredSection.hidden = groups.upcoming.length === 0;
      grid.replaceChildren(...groups.past.map(renderEventCard));
      pastSection.hidden = groups.past.length === 0;
      upcomingCount.textContent = groups.upcoming.length ? sectionCountText(groups.upcoming.length) : "";
      pastCount.textContent = groups.past.length ? sectionCountText(groups.past.length) : "";
      setPageState(states, resolveListState({ items: sorted, filtered: Object.keys(filters).length > 0 }));
      applyControls();
      global.TakhunI18n?.applyTranslations?.(root);
    }

    function readControls() {
      const next = {};
      for (const key of ["type", "month"]) {
        const value = String(form.querySelector(`[data-event-filter="${key}"]`)?.value || "").trim();
        if (value) next[key] = value;
      }
      return parseEventFilters(`?${new URLSearchParams(next)}`);
    }

    function syncUrl() {
      global.history?.replaceState?.({}, "", filtersUrl(global.location.pathname, filters));
    }

    async function fetchEvents() {
      const requestToken = requestGate.begin();
      isLoading = true;
      setPageState(states, "loading");
      try {
        const data = await global.TakhunApi.getEvents({ status: "all", ...filters, lang: currentLang() }, { mock: mockGetEvents });
        if (!requestGate.isCurrent(requestToken)) return;
        isLoading = false;
        records = normalizeEventList(data).items;
        global.document.querySelector("[data-events-demo-notice]").hidden = Boolean(String(global.APP_CONFIG?.API_URL || "").trim());
        render();
      } catch (_error) {
        if (requestGate.isCurrent(requestToken)) {
          isLoading = false;
          setPageState(states, "error");
        }
      }
    }

    function clearFilters() {
      filters = {};
      applyControls();
      syncUrl();
      fetchEvents();
    }

    const parsed = parseEventFilters(global.location.search);
    filters = parsed.filters;
    applyControls();
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const next = readControls();
      if (next.invalid.length) { setPageState(states, "invalid-filter"); return; }
      filters = next.filters; syncUrl(); fetchEvents();
    });
    global.document.querySelectorAll("[data-events-clear]").forEach((button) => button.addEventListener("click", clearFilters));
    global.document.querySelector("[data-events-retry]")?.addEventListener("click", fetchEvents);
    global.document.addEventListener("takhun:languagechange", () => { global.TakhunI18n?.applyTranslations?.(global.document); if (records.length && !isLoading) render(); else applyControls(); });
    if (parsed.invalid.length) setPageState(states, "invalid-filter"); else fetchEvents();
  }

  function appendAction(mount, label, href, primary = false) {
    if (!href) return;
    const link = make("a", `button ${primary ? "button--primary" : "button--secondary"}`, label);
    link.href = href;
    if (href.startsWith("http:") || href.startsWith("https:")) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
    mount.append(link);
  }

  function renderEventDetail(event) {
    const lang = currentLang();
    const name = localized(event, "title", lang) || t("events.unnamed");
    const location = localized(event, "location", lang);
    global.document.title = format("event_detail.page_title", { name });
    const media = global.document.querySelector("[data-event-detail-media]"); media.replaceChildren(); appendEventImage(media, event, name, true);
    const summary = global.document.querySelector("[data-event-detail-summary]"); summary.replaceChildren();
    const badges = make("div", "event-detail-page__badges");
    if (event.event_type && typeLabel(event.event_type)) badges.append(make("span", "event-detail-page__badge", typeLabel(event.event_type)));
    const state = statusLabel(event); if (state) badges.append(make("span", "event-detail-page__status", state));
    summary.append(badges, make("h1", "event-detail-page__title", name));
    appendMetaLine(summary, "event-detail-page__date", t("events.date"), formatEventDate(event.event_date, lang), parseDateParts(event.event_date)?.iso || "");
    appendMetaLine(summary, "event-detail-page__time", t("events.time"), formatTimeRange(event.start_time, event.end_time));
    appendMetaLine(summary, "event-detail-page__venue", t("events.venue"), location);
    if (event.contact_name) appendMetaLine(summary, "event-detail-page__organizer", t("event_detail.organizer"), String(event.contact_name).trim());

    const description = global.document.querySelector("[data-event-detail-description]");
    const descriptionTitle = make("h2", "", t("event_detail.description")); descriptionTitle.id = "event-description-title";
    description.replaceChildren(descriptionTitle, make("p", "", localized(event, "description", lang)));

    const actions = global.document.querySelector("[data-event-detail-actions]"); actions.replaceChildren();
    const phone = safePhoneHref(event.contact_phone);
    const registration = safeExternalUrl(event.register_url);
    const navigation = mapUrl(event);
    appendAction(actions, callActionLabel(event.contact_phone, t("event_detail.call")), phone);
    appendAction(actions, t("event_detail.register"), registration, true);
    appendAction(actions, t("event_detail.navigate"), navigation);
    global.document.querySelector("[data-event-no-contact]").hidden = Boolean(phone || String(event.contact_name || "").trim());
    global.document.querySelector("[data-event-no-registration]").hidden = Boolean(registration);

    const related = global.document.querySelector("[data-event-detail-related]"); related.replaceChildren();
    const relatedTitle = make("h2", "", t("event_detail.related_place")); relatedTitle.id = "event-related-title"; related.append(relatedTitle);
    const relatedId = String(event.related_place_id || "").trim();
    if (validateEventId(relatedId)) {
      const link = make("a", "button button--secondary", t("event_detail.view_related_place")); link.href = relatedPlaceUrl(relatedId); related.append(link);
    }
    related.hidden = !validateEventId(relatedId);
    global.document.querySelector("[data-event-detail-demo-notice]").hidden = Boolean(String(global.APP_CONFIG?.API_URL || "").trim());
  }

  function initializeEventDetail() {
    const root = global.document?.querySelector?.(".event-detail-page");
    if (!root || !global.TakhunApi?.getEventDetail) return;
    const states = {
      loading: global.document.querySelector("[data-event-detail-loading]"),
      ready: global.document.querySelector("[data-event-detail-ready]"),
      "missing-id": global.document.querySelector("[data-event-detail-missing]"),
      "invalid-id": global.document.querySelector("[data-event-detail-invalid]"),
      "not-found": global.document.querySelector("[data-event-detail-not-found]"),
      error: global.document.querySelector("[data-event-detail-error]")
    };
    const params = new URLSearchParams(global.location.search);
    const eventId = parseEventId();
    const idState = !params.has("id") ? "missing" : validateEventId(eventId) ? "valid" : "invalid";
    let record = null;

    async function fetchDetail() {
      const initialState = resolveDetailState({ idState });
      if (initialState === "missing-id" || initialState === "invalid-id") { setPageState(states, initialState); return; }
      setPageState(states, "loading");
      try {
        const data = await global.TakhunApi.getEventDetail(eventId, { lang: currentLang() }, { mock: ({ event_id: id }) => mockGetEventDetail(id) });
        record = normalizeEventDetail(data);
        const state = resolveDetailState({ event: record });
        if (state === "ready") renderEventDetail(record);
        setPageState(states, state);
      } catch (error) {
        setPageState(states, error?.code === "NOT_FOUND" ? "not-found" : "error");
      }
    }

    global.document.querySelector("[data-event-detail-retry]")?.addEventListener("click", fetchDetail);
    global.document.addEventListener("takhun:languagechange", () => { global.TakhunI18n?.applyTranslations?.(global.document); if (record) renderEventDetail(record); });
    fetchDetail();
  }

  global.TakhunEvents = Object.freeze({
    EVENT_TYPES, parseEventId, validateEventId, parseEventFilters, filterEvents, normalizeEventList,
    normalizeEventDetail, localized, normalizeBoolean, parseDateParts, formatEventDate, formatTimeRange,
    classifyEvent, sortEvents, safePhoneHref, safeExternalUrl, eventDetailUrl, relatedPlaceUrl, mapUrl,
    resolveListState, resolveDetailState, setPageState, mockGetEvents, mockGetEventDetail,
    createRequestGate, filtersUrl, partitionEvents, callActionLabel
  });

  if (global.document?.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", () => { initializeEventsList(); initializeEventDetail(); }, { once: true });
  } else {
    initializeEventsList(); initializeEventDetail();
  }
})(window);
