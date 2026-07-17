"use strict";

(function createTripPlanner(global) {
  const STORAGE_KEY = "TAKHUN_TRIP_PLAN";
  const VERSION = 2;
  const DURATIONS = Object.freeze(["half_day", "one_day", "two_days_one_night"]);
  const STYLES = Object.freeze(["nature", "community", "photo", "family", "activity", "food_cafe", "product", "adventure", "learning"]);
  const PLACE_FIELDS = Object.freeze(["place_id", "name_th", "name_en", "short_description_th", "short_description_en", "cover_image_url", "stop_order"]);

  function validId(value) {
    const id = String(value || "").trim();
    return id.length > 0 && id.length <= 64 && /^[A-Za-z0-9_-]+$/.test(id);
  }
  const validateRouteId = validId;
  const validatePlaceId = validId;

  function parseQuery(search = global.location?.search || "") {
    const params = new URLSearchParams(search || "");
    const routeValue = String(params.get("from_route") || "").trim();
    const placeValue = String(params.get("add") || "").trim();
    return {
      fromRoute: validId(routeValue) ? routeValue : "",
      add: validId(placeValue) ? placeValue : "",
      invalidFromRoute: Boolean(routeValue) && !validId(routeValue),
      invalidAdd: Boolean(placeValue) && !validId(placeValue)
    };
  }

  function cleanPlace(place) {
    if (!place || !validId(place.place_id)) return null;
    const clean = {};
    PLACE_FIELDS.forEach((field) => {
      if (place[field] !== undefined && place[field] !== null && String(place[field]).trim() !== "") clean[field] = String(place[field]).trim();
    });
    return clean;
  }

  function uniquePlaces(places) {
    const seen = new Set();
    return (Array.isArray(places) ? places : []).map(cleanPlace).filter((place) => {
      if (!place || seen.has(place.place_id)) return false;
      seen.add(place.place_id);
      return true;
    });
  }

  function createPlan() { return { duration_type: "", travel_style: [], route_id: "", places: [] }; }

  function normalizePlan(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
      duration_type: DURATIONS.includes(source.duration_type) ? source.duration_type : "",
      travel_style: [...new Set((Array.isArray(source.travel_style) ? source.travel_style : String(source.travel_style || "").split(/[|,]/)).filter((style) => STYLES.includes(style)))],
      route_id: validId(source.route_id) ? String(source.route_id).trim() : "",
      places: uniquePlaces(source.places)
    };
  }

  function numericOrder(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function sortRoutePlaces(places) {
    return (Array.isArray(places) ? places : []).map((place, index) => ({ place: { ...place }, index, order: numericOrder(place?.stop_order) }))
      .sort((a, b) => a.order === null && b.order === null ? a.index - b.index : a.order === null ? 1 : b.order === null ? -1 : a.order - b.order || a.index - b.index)
      .map((entry) => entry.place);
  }

  function templatePlaceIds(template) {
    const expanded = Array.isArray(template?.places) && template.places.length ? template.places.map((place) => place?.place_id) : (Array.isArray(template?.place_ids) ? template.place_ids : String(template?.place_ids || "").split(/[|,]/));
    return [...new Set(expanded.map((id) => String(id || "").trim()).filter(validId))];
  }

  function applyRoute(plan, route) {
    const next = normalizePlan({ ...normalizePlan(plan), route_id: route?.route_id, places: sortRoutePlaces(route?.places) });
    return { plan: next, applied: Boolean(next.route_id) };
  }

  function addPlace(plan, place) {
    const current = normalizePlan(plan);
    const clean = cleanPlace(place);
    if (!clean || current.places.some((item) => item.place_id === clean.place_id)) return { plan: current, added: false };
    return { plan: { ...current, places: [...current.places, clean] }, added: true };
  }

  function removePlace(plan, placeId) { const current = normalizePlan(plan); return { ...current, places: current.places.filter((place) => place.place_id !== String(placeId || "")) }; }
  function clearPlan() { return createPlan(); }
  function toStorageRecord(plan, now = new Date().toISOString()) { const clean = normalizePlan(plan); return { version: VERSION, duration_type: clean.duration_type, travel_style: clean.travel_style, route_id: clean.route_id, place_ids: clean.places.map((place) => place.place_id), places: clean.places, updated_at: now }; }

  function canonicalIds(listMethod, idField) {
    try { return new Set((global.TakhunContentData?.[listMethod]?.() || []).map((item) => String(item?.[idField] || "").trim()).filter(Boolean)); }
    catch (_error) { return new Set(); }
  }

  function migrateStoredPlan(value) {
    const clean = normalizePlan(value);
    const placeIds = canonicalIds("listPlaces", "place_id");
    const routeIds = canonicalIds("listRoutes", "route_id");
    const canonicalPlaces = clean.places.filter((place) => !place.place_id.startsWith("MOCK-") && (!placeIds.size || placeIds.has(place.place_id)));
    const canonicalRoute = !clean.route_id.startsWith("MOCK-") && (!routeIds.size || routeIds.has(clean.route_id)) ? clean.route_id : "";
    return { ...clean, route_id: canonicalRoute, places: canonicalPlaces };
  }

  function readStoredPlan(storage = global.localStorage) {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (!raw) return { plan: createPlan(), malformed: false };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { plan: createPlan(), malformed: true };
      const stale = parsed.version !== VERSION || JSON.stringify(parsed).includes("MOCK-");
      return { plan: migrateStoredPlan(parsed), malformed: false, migrated: stale };
    } catch (_error) { return { plan: createPlan(), malformed: true }; }
  }

  function writeStoredPlan(storage = global.localStorage, plan) {
    try { storage?.setItem(STORAGE_KEY, JSON.stringify(toStorageRecord(plan))); return true; }
    catch (_error) { return false; }
  }

  const encoded = (value) => encodeURIComponent(String(value || ""));
  function mapUrl(plan) { const routeId = String(plan?.route_id || "").trim(); const placeId = String(plan?.places?.[0]?.place_id || "").trim(); return routeId ? `map.html?route=${encoded(routeId)}` : placeId ? `map.html?focus=${encoded(placeId)}` : "map.html"; }
  function placeDetailUrl(placeId) { return `place-detail.html?id=${encoded(placeId)}`; }
  function sharePayload(_plan, url, title, text) { return { title: String(title || ""), text: String(text || ""), url: String(url || "") }; }
  function resolveState({ loading = false, places = [], error = null } = {}) { if (loading) return "loading"; if (error) return "error"; return Array.isArray(places) && places.length ? "ready" : "empty"; }

  function mockTemplates() {
    const items = (global.TakhunContentData?.listRoutes?.() || []).map((route) => ({
      template_id: `TRIP-${route.route_id}`, route_id: route.route_id,
      name_th: route.name_th, name_en: route.name_en,
      description_th: route.short_description_th, description_en: route.short_description_en,
      duration_type: "", travel_style: route.travel_style, places: route.places
    }));
    return { items, total: items.length };
  }

  function t(key) { return global.TakhunI18n?.t?.(`trip_planner.${key}`) || `trip_planner.${key}`; }
  function localized(item, field, lang) { return String(global.TakhunI18n?.pickLangValue?.(item, field, lang) || item?.[`${field}_${lang}`] || item?.[`${field}_th`] || item?.[field] || ""); }
  function make(tag, className = "", text = "") { const element = global.document.createElement(tag); element.className = className; element.textContent = text; return element; }

  function initialize() {
    const root = global.document?.querySelector?.("[data-trip-planner]");
    if (!root) return;
    const mounts = Object.fromEntries(["duration", "styles", "templates", "places", "status", "clear", "share", "map"].map((name) => [name, root.querySelector(`[data-planner-${name}]`)]));
    const restored = readStoredPlan();
    let plan = restored.plan;
    let templates = [];
    let notice = restored.malformed ? "storage_malformed" : "";
    let loading = true;
    let error = null;

    function lang() { return global.TakhunI18n?.getCurrentLang?.() || "th"; }
    function status(key = notice, type = "") { mounts.status.textContent = key ? t(key) : ""; mounts.status.dataset.type = type; }
    function save(message = "saved") { const ok = writeStoredPlan(global.localStorage, plan); notice = ok ? message : "save_failed"; status(notice, ok ? "success" : "error"); }
    function templateMatches(item) { return (!plan.duration_type || item.duration_type === plan.duration_type) && (!plan.travel_style.length || plan.travel_style.some((style) => (Array.isArray(item.travel_style) ? item.travel_style : String(item.travel_style || "").split("|")).includes(style))); }

    function renderChoices() {
      mounts.duration.replaceChildren();
      DURATIONS.forEach((value) => { const label = make("label", `planner-choice${plan.duration_type === value ? " is-selected" : ""}`); const input = make("input"); input.type = "radio"; input.name = "duration_type"; input.value = value; input.checked = plan.duration_type === value; input.addEventListener("change", () => { plan = { ...plan, duration_type: value }; save(); render(); }); label.append(input, make("span", "", t(`duration_${value}`))); mounts.duration.append(label); });
      const available = [...new Set(templates.flatMap((item) => Array.isArray(item.travel_style) ? item.travel_style : String(item.travel_style || "").split("|")).filter((style) => STYLES.includes(style)))];
      mounts.styles.replaceChildren();
      available.forEach((value) => { const button = make("button", `planner-chip${plan.travel_style.includes(value) ? " is-selected" : ""}`, t(`style_${value}`)); button.type = "button"; button.setAttribute("aria-pressed", String(plan.travel_style.includes(value))); button.addEventListener("click", () => { plan = { ...plan, travel_style: plan.travel_style.includes(value) ? plan.travel_style.filter((style) => style !== value) : [...plan.travel_style, value] }; save(); render(); }); mounts.styles.append(button); });
    }

    function renderTemplates() {
      mounts.templates.replaceChildren();
      const matches = templates.filter(templateMatches);
      if (loading) return mounts.templates.append(make("p", "planner-message", t("loading")));
      if (error) return mounts.templates.append(make("p", "planner-message planner-message--error", t("api_error")));
      if (!matches.length) return mounts.templates.append(make("p", "planner-message", t("no_template")));
      matches.forEach((item) => { const card = make("article", "planner-template"); card.append(make("h3", "", localized(item, "name", lang())), make("p", "", localized(item, "description", lang()))); const button = make("button", "button button--primary", t("use_template")); button.type = "button"; button.addEventListener("click", async () => { button.disabled = true; try { let places = Array.isArray(item.places) && item.places.length ? item.places : []; if (!places.length) places = await Promise.all(templatePlaceIds(item).map((placeId) => global.TakhunApi.getPlaceDetail(placeId, { lang: lang() }, { mock: () => { const place = global.TakhunPlaceData?.getPlaceById?.(placeId); if (!place || place.status !== "published") { const e = new Error("NOT_FOUND"); e.code = "NOT_FOUND"; throw e; } return place; } }))); plan = normalizePlan({ duration_type: item.duration_type, travel_style: item.travel_style, places }); save("template_added"); render(); } catch (_error) { status("action_failed", "error"); button.disabled = false; } }); card.append(button); mounts.templates.append(card); });
    }

    function renderPlaces() {
      mounts.places.replaceChildren();
      if (!plan.places.length) mounts.places.append(make("p", "planner-message", t("empty")));
      plan.places.forEach((place, index) => { const item = make("article", "planner-stop"); item.append(make("span", "planner-stop__number", String(index + 1))); const content = make("div", "planner-stop__content"); content.append(make("h3", "", localized(place, "name", lang()) || place.place_id), make("p", "", localized(place, "short_description", lang()))); const actions = make("div", "planner-stop__actions"); const detail = make("a", "button button--ghost", t("view_detail")); detail.href = placeDetailUrl(place.place_id); const map = make("a", "button button--ghost", t("open_map")); map.href = `map.html?focus=${encoded(place.place_id)}`; const remove = make("button", "button button--secondary", t("remove")); remove.type = "button"; remove.addEventListener("click", () => { plan = removePlace(plan, place.place_id); save("removed"); render(); }); actions.append(detail, map, remove); content.append(actions); item.append(content); mounts.places.append(item); });
      mounts.map.href = mapUrl(plan);
      mounts.clear.disabled = !plan.places.length;
    }

    function render() { renderChoices(); renderTemplates(); renderPlaces(); status(); }

    mounts.clear.addEventListener("click", () => { if (global.confirm(t("clear_confirm"))) { plan = clearPlan(); save("cleared"); render(); } });
    mounts.share.addEventListener("click", async () => {
      const payload = sharePayload(plan, global.location.href, t("share_title"), t("share_text").replace("{count}", plan.places.length));
      try { if (typeof global.navigator?.share === "function") { await global.navigator.share(payload); status("share_success", "success"); return; } if (typeof global.navigator?.clipboard?.writeText === "function") { await global.navigator.clipboard.writeText(payload.url); status("copy_success", "success"); return; } status("share_unavailable", "error"); } catch (shareError) { if (shareError?.name !== "AbortError") status("action_failed", "error"); }
    });
    global.document.addEventListener("takhun:languagechange", () => { global.TakhunI18n?.applyTranslations?.(global.document); render(); });

    (async () => {
      try {
        const data = await global.TakhunApi.getTripTemplates({ lang: lang() }, { mock: mockTemplates });
        templates = Array.isArray(data?.items) ? data.items : [];
        const query = parseQuery();
        if (query.invalidFromRoute) notice = "invalid_route";
        else if (query.fromRoute) { try { const route = await global.TakhunRoutes.loadRouteDetail(query.fromRoute, lang()); plan = applyRoute(plan, route).plan; notice = "route_added"; } catch (routeError) { notice = routeError?.code === "NOT_FOUND" ? "route_not_found" : "action_failed"; } }
        if (query.invalidAdd) notice = "invalid_place";
        else if (query.add) { try { const place = await global.TakhunApi.getPlaceDetail(query.add, { lang: lang() }, { mock: () => { const item = global.TakhunPlaceData?.getPlaceById?.(query.add); if (!item || item.status !== "published") { const e = new Error("NOT_FOUND"); e.code = "NOT_FOUND"; throw e; } return item; } }); const result = addPlace(plan, place); plan = result.plan; notice = result.added ? "place_added" : "duplicate"; } catch (placeError) { notice = placeError?.code === "NOT_FOUND" ? "place_not_found" : "action_failed"; } }
        writeStoredPlan(global.localStorage, plan);
      } catch (loadError) { error = loadError; }
      finally { loading = false; render(); }
    })();
  }

  global.TakhunTripPlanner = Object.freeze({ parseQuery, validateRouteId, validatePlaceId, sortRoutePlaces, templatePlaceIds, createPlan, normalizePlan, applyRoute, addPlace, removePlace, clearPlan, toStorageRecord, migrateStoredPlan, readStoredPlan, writeStoredPlan, mapUrl, placeDetailUrl, sharePayload, resolveState });
  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initialize, { once: true }); else initialize();
})(window);
