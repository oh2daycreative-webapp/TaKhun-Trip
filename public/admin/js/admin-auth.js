"use strict";

(function createAdminBrowserAuth(global) {
  const STORAGE_KEY = "TAKHUN_ADMIN_SESSION";
  const DEFAULT_RETURN = "dashboard.html";
  const LOGIN_PAGE = "login.html";
  const ALLOWED_RETURN_PAGES = Object.freeze([
    "dashboard.html",
    "places.html",
    "routes.html",
    "products.html",
    "events.html",
    "reviews.html",
    "gallery.html",
    "settings.html",
    "404.html"
  ]);
  const ROLES = Object.freeze(["super_admin", "editor", "reviewer", "viewer"]);
  const ADMIN_ID_PATTERN = /^ADM-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;
  const TOKEN_PATTERN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
  const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const TRANSIENT_CODES = Object.freeze(["TIMEOUT", "NETWORK_ERROR", "HTTP_ERROR", "MALFORMED_RESPONSE", "SERVER_ERROR"]);
  const AUTH_INVALID_CODES = Object.freeze(["UNAUTHORIZED", "VALIDATION_ERROR", "FORBIDDEN"]);
  const SAFE_API_CODES = Object.freeze([
    "CONFIG_ERROR",
    "VALIDATION_ERROR",
    "UNAUTHORIZED",
    "RATE_LIMITED",
    "SERVER_ERROR",
    "FORBIDDEN",
    "TIMEOUT",
    "NETWORK_ERROR",
    "HTTP_ERROR",
    "MALFORMED_RESPONSE"
  ]);
  let validationGeneration = 0;

  function exactKeys(value, expected) {
    if (!value || Array.isArray(value) || typeof value !== "object") return false;
    const actual = Object.keys(value).sort();
    const wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
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

  function validTimestamp(value, requireFuture) {
    if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) return false;
    try {
      if (new Date(value).toISOString() !== value) return false;
      return !requireFuture || Date.now() < Date.parse(value);
    } catch (_dateError) {
      return false;
    }
  }

  function validSession(value, requireFuture) {
    return exactKeys(value, ["admin_id", "display_name", "role", "token", "expires_at"]) &&
      typeof value.admin_id === "string" && ADMIN_ID_PATTERN.test(value.admin_id) &&
      validUnicodeLength(value.display_name, 1, 100) &&
      ROLES.includes(value.role) &&
      typeof value.token === "string" && TOKEN_PATTERN.test(value.token) &&
      validTimestamp(value.expires_at, requireFuture);
  }

  function safeServerAdmin(value) {
    if (!exactKeys(value, ["admin_id", "username", "display_name", "role"])) return null;
    if (typeof value.admin_id !== "string" || !ADMIN_ID_PATTERN.test(value.admin_id)) return null;
    if (typeof value.username !== "string" || !USERNAME_PATTERN.test(value.username)) return null;
    if (!validUnicodeLength(value.display_name, 1, 100) || !ROLES.includes(value.role)) return null;
    return {
      admin_id: value.admin_id,
      username: value.username,
      display_name: value.display_name,
      role: value.role
    };
  }

  function storageObject() {
    try {
      const storage = global.sessionStorage;
      return storage && typeof storage.getItem === "function" && typeof storage.setItem === "function" &&
        typeof storage.removeItem === "function" ? storage : null;
    } catch (_storageError) {
      return null;
    }
  }

  function removeStoredValue() {
    const storage = storageObject();
    if (!storage) return false;
    try {
      storage.removeItem(STORAGE_KEY);
      return true;
    } catch (_removeError) {
      return false;
    }
  }

  function readSession() {
    const storage = storageObject();
    if (!storage) return null;
    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch (_readError) {
      return null;
    }
    let value;
    try {
      value = raw === null ? null : JSON.parse(raw);
    } catch (_parseError) {
      removeStoredValue();
      return null;
    }
    if (!validSession(value, true)) {
      removeStoredValue();
      return null;
    }
    return {
      admin_id: value.admin_id,
      display_name: value.display_name,
      role: value.role,
      token: value.token,
      expires_at: value.expires_at
    };
  }

  function writeSession(value) {
    if (!validSession(value, true)) return { ok: false, code: "STORAGE_ERROR" };
    const storage = storageObject();
    if (!storage) return { ok: false, code: "STORAGE_ERROR" };
    const stored = {
      admin_id: value.admin_id,
      display_name: value.display_name,
      role: value.role,
      token: value.token,
      expires_at: value.expires_at
    };
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(stored));
      return { ok: true };
    } catch (_writeError) {
      return { ok: false, code: "STORAGE_ERROR" };
    }
  }

  function clearSession() {
    return removeStoredValue() ? { ok: true } : { ok: false, code: "STORAGE_ERROR" };
  }

  function logoutTokenState() {
    const storage = storageObject();
    if (!storage) return { status: "unavailable" };
    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch (_readError) {
      return { status: "unavailable" };
    }
    if (raw === null) return { status: "missing" };
    let value;
    try {
      value = JSON.parse(raw);
    } catch (_parseError) {
      return { status: "invalid" };
    }
    if (value && !Array.isArray(value) && typeof value === "object" &&
        typeof value.token === "string" && TOKEN_PATTERN.test(value.token)) {
      return { status: "found", token: value.token };
    }
    return { status: "invalid" };
  }

  function decodedCandidateIsUnsafe(candidate) {
    let decoded = candidate;
    for (let pass = 0; pass < 3; pass += 1) {
      if (/[\u0000-\u001F\u007F\\]/.test(decoded)) return true;
      if (/%(?:00|0a|0d|2e|2f|5c)/i.test(decoded)) return true;
      let next;
      try {
        next = decodeURIComponent(decoded);
      } catch (_decodeError) {
        return true;
      }
      if (next === decoded) break;
      decoded = next;
    }
    if (/[\u0000-\u001F\u007F\\]/.test(decoded) || /(^|\/)\.\.?($|[/?#])/.test(decoded)) return true;
    if (/(?:^|[?&#;=])[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048](?:$|[&#;])/.test(decoded)) return true;
    return /(?:^|[?&#;])[^=&#;]*(?:token|password|passwd|credential|session|auth|username)[^=&#;]*(?:=|$)/i.test(decoded);
  }

  function safeReturnPath(candidate) {
    if (typeof candidate !== "string" || !candidate || candidate !== candidate.trim()) return DEFAULT_RETURN;
    if (candidate.startsWith("//") || decodedCandidateIsUnsafe(candidate)) return DEFAULT_RETURN;
    let current;
    let target;
    try {
      current = new URL(global.location.href);
      target = new URL(candidate, current);
    } catch (_urlError) {
      return DEFAULT_RETURN;
    }
    if (target.origin !== current.origin || target.username || target.password) return DEFAULT_RETURN;
    if (target.protocol !== "https:" && target.protocol !== "http:") return DEFAULT_RETURN;
    const slash = current.pathname.lastIndexOf("/");
    const directory = current.pathname.slice(0, slash + 1);
    if (!target.pathname.startsWith(directory)) return DEFAULT_RETURN;
    const basename = target.pathname.slice(directory.length);
    if (!basename || basename.includes("/") || !ALLOWED_RETURN_PAGES.includes(basename)) return DEFAULT_RETURN;
    if (basename === LOGIN_PAGE) return DEFAULT_RETURN;
    return `${basename}${target.search}${target.hash}`;
  }

  function replaceLocation(target) {
    try {
      if (!global.location || typeof global.location.replace !== "function") return false;
      global.location.replace(target);
      return true;
    } catch (_navigationError) {
      return false;
    }
  }

  function apiCode(error) {
    return error && SAFE_API_CODES.includes(error.code) ? error.code : "SERVER_ERROR";
  }

  function safeLoginAdmin(admin) {
    return { admin_id: admin.admin_id, display_name: admin.display_name, role: admin.role };
  }

  async function login(username, password, returnCandidate) {
    let response;
    try {
      response = await global.TakhunAdminApi.login(username, password);
    } catch (error) {
      return { status: "error", code: apiCode(error) };
    }
    if (!exactKeys(response, ["admin", "token", "expires_at"])) return { status: "error", code: "MALFORMED_RESPONSE" };
    const admin = safeServerAdmin(response.admin);
    const session = admin ? {
      admin_id: admin.admin_id,
      display_name: admin.display_name,
      role: admin.role,
      token: response.token,
      expires_at: response.expires_at
    } : null;
    if (!session || !validSession(session, true)) return { status: "error", code: "MALFORMED_RESPONSE" };
    validationGeneration += 1;
    const persisted = writeSession(session);
    if (!persisted.ok) return { status: "error", code: "STORAGE_ERROR" };
    const redirect = safeReturnPath(returnCandidate);
    replaceLocation(redirect);
    return { status: "authenticated", admin: safeLoginAdmin(admin), expires_at: session.expires_at, redirect };
  }

  async function validateCurrentSession() {
    const generation = ++validationGeneration;
    const local = readSession();
    if (!local) return { status: "unauthenticated" };
    let response;
    try {
      response = await global.TakhunAdminApi.validateSession(local.token);
    } catch (error) {
      if (generation !== validationGeneration) return { status: "stale" };
      const code = apiCode(error);
      if (AUTH_INVALID_CODES.includes(code)) {
        clearSession();
        return { status: "unauthenticated" };
      }
      return { status: "unconfirmed", code: TRANSIENT_CODES.includes(code) ? code : "SERVER_ERROR" };
    }
    if (generation !== validationGeneration) return { status: "stale" };
    if (!exactKeys(response, ["admin", "expires_at"])) return { status: "unconfirmed", code: "MALFORMED_RESPONSE" };
    const admin = safeServerAdmin(response.admin);
    if (!admin || !validTimestamp(response.expires_at, false)) return { status: "unconfirmed", code: "MALFORMED_RESPONSE" };
    if (admin.admin_id !== local.admin_id || response.expires_at !== local.expires_at) {
      clearSession();
      return { status: "unauthenticated" };
    }
    if (Date.now() >= Date.parse(local.expires_at)) {
      clearSession();
      return { status: "unauthenticated" };
    }
    const refreshed = {
      admin_id: local.admin_id,
      display_name: admin.display_name,
      role: admin.role,
      token: local.token,
      expires_at: local.expires_at
    };
    if (!writeSession(refreshed).ok) return { status: "unconfirmed", code: "STORAGE_ERROR" };
    return { status: "authenticated", admin, expires_at: local.expires_at };
  }

  function currentReturnPath() {
    try {
      return safeReturnPath(global.location.href);
    } catch (_locationError) {
      return DEFAULT_RETURN;
    }
  }

  function loginRedirectTarget() {
    return `${LOGIN_PAGE}?return=${encodeURIComponent(currentReturnPath())}`;
  }

  async function guardProtectedPage(options) {
    const callbacks = options && typeof options === "object" ? options : {};
    const result = await validateCurrentSession();
    if (result.status === "authenticated") {
      if (typeof callbacks.onAuthenticated === "function") callbacks.onAuthenticated(result);
    } else if (result.status === "unauthenticated") {
      replaceLocation(loginRedirectTarget());
    } else if (result.status === "unconfirmed" && typeof callbacks.onRetry === "function") {
      callbacks.onRetry(result);
    }
    return result;
  }

  async function redirectAuthenticatedLogin(options) {
    const callbacks = options && typeof options === "object" ? options : {};
    const result = await validateCurrentSession();
    if (result.status === "authenticated") {
      replaceLocation(safeReturnPath(callbacks.returnPath));
    } else if (result.status === "unauthenticated") {
      if (typeof callbacks.onLoginAvailable === "function") callbacks.onLoginAvailable(result);
    } else if (result.status === "unconfirmed" && typeof callbacks.onRetry === "function") {
      callbacks.onRetry(result);
    }
    return result;
  }

  async function logout() {
    const tokenState = logoutTokenState();
    validationGeneration += 1;
    let status = tokenState.status === "missing" ? "confirmed" : "unconfirmed";
    try {
      if (tokenState.status === "found") {
        let firstCode = null;
        try {
          const response = await global.TakhunAdminApi.logout(tokenState.token);
          if (!exactKeys(response, [])) firstCode = "MALFORMED_RESPONSE";
          else status = "confirmed";
        } catch (error) {
          firstCode = apiCode(error);
        }
        if (firstCode) {
          status = "unconfirmed";
          if (TRANSIENT_CODES.includes(firstCode)) {
            try {
              const response = await global.TakhunAdminApi.logout(tokenState.token);
              if (exactKeys(response, [])) status = "confirmed";
            } catch (_retryError) {
              status = "unconfirmed";
            }
          }
        }
      }
    } finally {
      const cleared = clearSession();
      replaceLocation(LOGIN_PAGE);
      if (!cleared.ok) return { status: "local-clear-failed", code: "STORAGE_ERROR" };
    }
    return { status };
  }

  global.TakhunAdminAuth = Object.freeze({
    readSession,
    writeSession,
    clearSession,
    safeReturnPath,
    login,
    validateCurrentSession,
    guardProtectedPage,
    redirectAuthenticatedLogin,
    logout
  });
})(window);
