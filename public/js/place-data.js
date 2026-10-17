"use strict";

(function createPlaceRepositoryAdapter(global) {
  function repository() {
    const source = global.TakhunContentData;
    if (!source?.listPlaces || !source?.getPlaceById || !source?.getNearbyPlaces) {
      throw new Error("Canonical place content is unavailable.");
    }
    return source;
  }

  function listPlaces() { return repository().listPlaces(); }
  function getPlaceById(id) { return repository().getPlaceById(id); }
  function getNearbyPlaces(ids, currentId = "") { return repository().getNearbyPlaces(ids, currentId); }

  // F-07: the public places list and map show what admins publish (live backend), never the bundled snapshot.
  // There is deliberately no static fallback: a failed request shows the page's error/retry state.
  const LIVE_PAGE_SIZE = 100;
  const LIVE_MAX_PAGES = 20;

  async function fetchAllPlaces(lang) {
    const items = [];
    for (let page = 1; page <= LIVE_MAX_PAGES; page += 1) {
      const data = await global.TakhunApi.getPlaces({ lang, page, page_size: LIVE_PAGE_SIZE });
      if (!data || !Array.isArray(data.items) || !Number.isInteger(data.total_pages) || data.total_pages < 0) {
        throw new Error("Live place list is malformed.");
      }
      items.push(...data.items);
      if (page >= data.total_pages) return items;
    }
    throw new Error("Live place list is too large.");
  }

  function liveCoordinate(value) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
  function liveText(value) { return typeof value === "string" ? value : ""; }

  async function loadPublishedPlaces() {
    if (!global.TakhunApi?.getPlaces) throw new Error("Live place API is unavailable.");
    const [thai, english] = await Promise.all([fetchAllPlaces("th"), fetchAllPlaces("en")]);
    const englishById = new Map(english.filter((item) => item && typeof item.place_id === "string").map((item) => [item.place_id, item]));
    return thai.filter((item) => item && typeof item.place_id === "string" && item.place_id).map((item) => {
      const en = englishById.get(item.place_id) || {};
      const shortTh = liveText(item.short_description);
      const shortEn = liveText(en.short_description);
      return {
        place_id: item.place_id,
        status: "published",
        name_th: liveText(item.name_th) || liveText(item.name),
        name_en: liveText(item.name_en),
        // The backend already falls back to Thai when English is empty; keep "" so the page applies its own fallback.
        short_description_th: shortTh,
        short_description_en: shortEn && shortEn !== shortTh ? shortEn : "",
        district: liveText(item.district),
        category: liveText(item.category),
        route_group: liveText(item.route_group),
        latitude: liveCoordinate(item.latitude),
        longitude: liveCoordinate(item.longitude),
        google_maps_url: liveText(item.google_maps_url),
        phone: liveText(item.phone),
        is_featured: item.is_featured === true,
        is_main_route_point: item.is_main_route_point === true
      };
    });
  }

  global.TakhunPlaceData = Object.freeze({ listPlaces, getPlaceById, getNearbyPlaces, loadPublishedPlaces });
})(window);
