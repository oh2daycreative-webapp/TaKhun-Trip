"use strict";

(function createPublicApiClient(global) {
  const DEFAULT_TIMEOUT_MS = 12000;

  class PublicApiError extends Error {
    constructor(code, message = "API request failed.") {
      super(message);
      this.name = "PublicApiError";
      this.code = code;
    }
  }

  function apiBaseUrl() {
    return String(global.APP_CONFIG?.API_URL || "").trim();
  }

  function buildUrl(action, params = {}) {
    const base = apiBaseUrl();
    if (!base) throw new PublicApiError("CONFIG_ERROR");
    let url;
    try {
      url = new URL(base, global.location?.href);
    } catch (_error) {
      throw new PublicApiError("CONFIG_ERROR");
    }
    url.searchParams.set("action", String(action || ""));
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(String(key), String(value));
    });
    return url;
  }

  function validateEnvelope(result) {
    if (!result || Array.isArray(result) || typeof result !== "object" || typeof result.ok !== "boolean") {
      throw new PublicApiError("MALFORMED_RESPONSE");
    }
    if (result.ok && (result.data === undefined || result.data === null || typeof result.data !== "object")) {
      throw new PublicApiError("MALFORMED_RESPONSE");
    }
    if (!result.ok) {
      const serverCode = typeof result.error?.code === "string" && result.error.code ? result.error.code : "API_ERROR";
      throw new PublicApiError(serverCode);
    }
    return result.data;
  }

  async function requestJson(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = typeof global.AbortController === "function" ? new global.AbortController() : null;
    const timeout = controller ? global.setTimeout(() => controller.abort(), timeoutMs) : null;
    let response;
    try {
      response = await global.fetch(url.toString(), controller ? { signal: controller.signal } : {});
    } catch (error) {
      if (error?.name === "AbortError") throw new PublicApiError("TIMEOUT");
      throw new PublicApiError("NETWORK_ERROR");
    } finally {
      if (timeout !== null) global.clearTimeout(timeout);
    }
    if (!response?.ok) throw new PublicApiError("HTTP_ERROR");
    let result;
    try {
      result = await response.json();
    } catch (_error) {
      throw new PublicApiError("MALFORMED_RESPONSE");
    }
    return validateEnvelope(result);
  }

  async function get(action, params = {}, options = {}) {
    const base = apiBaseUrl();
    if (!base) {
      if (typeof options.mock !== "function") throw new PublicApiError("CONFIG_ERROR");
      return options.mock(params);
    }
    const url = buildUrl(action, params);
    return requestJson(url, Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS);
  }

  function getRoutes(params = {}, options = {}) {
    return get("getRoutes", params, options);
  }

  function getRouteDetail(routeId, params = {}, options = {}) {
    return get("getRouteDetail", { ...params, route_id: routeId }, options);
  }

  function getPlaceDetail(placeId, params = {}, options = {}) {
    return get("getPlaceDetail", { ...params, place_id: placeId }, options);
  }

  function getTripTemplates(params = {}, options = {}) {
    return get("getTripTemplates", params, options);
  }

  function getProducts(params = {}, options = {}) {
    return get("getProducts", params, options);
  }

  function getProductDetail(productId, params = {}, options = {}) {
    return get("getProductDetail", { ...params, product_id: productId }, options);
  }

  global.TakhunApi = Object.freeze({
    get,
    getRoutes,
    getRouteDetail,
    getPlaceDetail,
    getTripTemplates,
    getProducts,
    getProductDetail,
    buildUrl,
    validateEnvelope,
    PublicApiError
  });
})(window);
