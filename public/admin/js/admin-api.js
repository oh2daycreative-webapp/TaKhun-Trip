"use strict";

(function createAdminApiClient(global) {
  const CONTENT_TYPE = "text/plain;charset=utf-8";
  const REQUEST_TIMEOUT_MS = 12000;
  const SAFE_MESSAGE = "Admin API request failed.";
  const BACKEND_ERROR_CODES = Object.freeze([
    "VALIDATION_ERROR",
    "UNAUTHORIZED",
    "RATE_LIMITED",
    "SERVER_ERROR",
    "FORBIDDEN"
  ]);
  const ADMIN_ROLES = Object.freeze(["super_admin", "editor", "reviewer", "viewer"]);
  const ADMIN_ID_PATTERN = /^ADM-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;
  const TOKEN_PATTERN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
  const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  class AdminApiError extends Error {
    constructor(code) {
      super(SAFE_MESSAGE);
      this.name = "AdminApiError";
      this.code = code;
      if (Object.prototype.hasOwnProperty.call(this, "stack")) delete this.stack;
    }
  }

  function safeError(code) {
    return new AdminApiError(code);
  }

  function exactKeys(value, expected) {
    if (!value || Array.isArray(value) || typeof value !== "object") return false;
    const actual = Object.keys(value).sort();
    const wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
  }

  function apiEndpoint() {
    let config = global.APP_CONFIG;
    try {
      if (typeof APP_CONFIG !== "undefined") config = APP_CONFIG;
    } catch (_configError) { /* Use the window property when no lexical binding exists. */ }
    const configured = String(config && config.API_URL || "").trim();
    if (!configured) throw safeError("CONFIG_ERROR");
    try {
      const endpoint = new URL(configured);
      if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") throw new Error("unsupported");
      if (endpoint.username || endpoint.password) throw new Error("credentials");
      return endpoint.toString();
    } catch (_urlError) {
      throw safeError("CONFIG_ERROR");
    }
  }

  function validTimestamp(value) {
    if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) return false;
    try {
      return new Date(value).toISOString() === value;
    } catch (_dateError) {
      return false;
    }
  }

  function validUnicodeLength(value, minimum, maximum) {
    if (typeof value !== "string" || value.length > maximum * 2) return false;
    let count = 0;
    for (let index = 0; index < value.length; index += 1) {
      const unit = value.charCodeAt(index);
      if (unit >= 0xD800 && unit <= 0xDBFF) {
        if (index + 1 >= value.length) return false;
        const next = value.charCodeAt(index + 1);
        if (next < 0xDC00 || next > 0xDFFF) return false;
        index += 1;
      } else if (unit >= 0xDC00 && unit <= 0xDFFF) {
        return false;
      }
      count += 1;
      if (count > maximum) return false;
    }
    return count >= minimum;
  }

  function safeAdmin(value) {
    if (!exactKeys(value, ["admin_id", "username", "display_name", "role"])) return null;
    if (typeof value.admin_id !== "string" || !ADMIN_ID_PATTERN.test(value.admin_id)) return null;
    if (typeof value.username !== "string" || !USERNAME_PATTERN.test(value.username)) return null;
    if (!validUnicodeLength(value.display_name, 1, 100)) return null;
    if (!ADMIN_ROLES.includes(value.role)) return null;
    return {
      admin_id: value.admin_id,
      username: value.username,
      display_name: value.display_name,
      role: value.role
    };
  }

  function validateSuccess(action, data) {
    if (action === "adminLogin") {
      if (!exactKeys(data, ["admin", "token", "expires_at"])) throw safeError("MALFORMED_RESPONSE");
      const admin = safeAdmin(data.admin);
      if (!admin || typeof data.token !== "string" || !TOKEN_PATTERN.test(data.token) || !validTimestamp(data.expires_at)) {
        throw safeError("MALFORMED_RESPONSE");
      }
      return { admin, token: data.token, expires_at: data.expires_at };
    }
    if (action === "adminValidateSession") {
      if (!exactKeys(data, ["admin", "expires_at"])) throw safeError("MALFORMED_RESPONSE");
      const admin = safeAdmin(data.admin);
      if (!admin || !validTimestamp(data.expires_at)) throw safeError("MALFORMED_RESPONSE");
      return { admin, expires_at: data.expires_at };
    }
    if (action === "adminLogout" && exactKeys(data, [])) return {};
    throw safeError("MALFORMED_RESPONSE");
  }

  function parseEnvelope(action, rawText) {
    let result;
    try {
      result = JSON.parse(rawText);
    } catch (_parseError) {
      throw safeError("MALFORMED_RESPONSE");
    }
    if (!result || Array.isArray(result) || typeof result !== "object" || typeof result.ok !== "boolean") {
      throw safeError("MALFORMED_RESPONSE");
    }
    if (result.ok) {
      if (!exactKeys(result, ["ok", "data", "message"]) || typeof result.message !== "string") {
        throw safeError("MALFORMED_RESPONSE");
      }
      return validateSuccess(action, result.data);
    }
    if (!exactKeys(result, ["ok", "error"]) || !exactKeys(result.error, ["code", "message"]) ||
        typeof result.error.code !== "string" || !result.error.code || typeof result.error.message !== "string") {
      throw safeError("MALFORMED_RESPONSE");
    }
    const code = BACKEND_ERROR_CODES.includes(result.error.code) ? result.error.code : "SERVER_ERROR";
    throw safeError(code);
  }

  async function request(body) {
    const endpoint = apiEndpoint();
    const controller = typeof global.AbortController === "function" ? new global.AbortController() : null;
    const timer = controller ? global.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
    const options = {
      method: "POST",
      headers: { "Content-Type": CONTENT_TYPE },
      body: JSON.stringify(body)
    };
    if (controller) options.signal = controller.signal;
    try {
      let response;
      try {
        response = await global.fetch(endpoint, options);
      } catch (error) {
        if (error && error.name === "AbortError") throw safeError("TIMEOUT");
        throw safeError("NETWORK_ERROR");
      }
      if (!response || response.ok !== true) throw safeError("HTTP_ERROR");
      let rawText;
      try {
        rawText = await response.text();
      } catch (error) {
        if (error && error.name === "AbortError") throw safeError("TIMEOUT");
        throw safeError("MALFORMED_RESPONSE");
      }
      return parseEnvelope(body.action, rawText);
    } finally {
      if (timer !== null) global.clearTimeout(timer);
    }
  }

  function login(username, password) {
    return request({ action: "adminLogin", payload: { username, password } });
  }

  function validateSession(token) {
    return request({ action: "adminValidateSession", token });
  }

  function logout(token) {
    return request({ action: "adminLogout", token });
  }

  global.TakhunAdminApi = Object.freeze({ login, validateSession, logout });
})(window);
