"use strict";

(function createAboutPage(global) {
  const STRING_FIELDS = Object.freeze([
    "site_name", "site_slogan_th", "site_slogan_en", "main_phone", "main_email",
    "facebook_url", "line_url", "logo_url", "hero_image_url"
  ]);
  const BOOLEAN_FIELDS = Object.freeze(["reviews_enabled", "events_enabled"]);
  const STATE_NAMES = Object.freeze(["initial", "loading", "ready", "empty", "error", "malformed-response"]);

  function malformedResponseError() {
    const error = new Error("MALFORMED_RESPONSE");
    error.code = "MALFORMED_RESPONSE";
    return error;
  }

  function normalizeBoolean(value) {
    return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
  }

  function normalizeSettingsResponse(value) {
    if (!value || Array.isArray(value) || typeof value !== "object") throw malformedResponseError();
    const settings = {};
    for (const field of STRING_FIELDS) settings[field] = String(value[field] ?? "").trim();
    for (const field of BOOLEAN_FIELDS) settings[field] = normalizeBoolean(value[field]);
    return Object.freeze(settings);
  }

  function localizedSlogan(settings, lang = "th") {
    const source = settings && typeof settings === "object" ? settings : {};
    const primary = lang === "en" ? "site_slogan_en" : "site_slogan_th";
    const fallback = lang === "en" ? "site_slogan_th" : "site_slogan_en";
    return String(source[primary] || source[fallback] || "").trim();
  }

  function safeHttpUrl(value) {
    const candidate = String(value || "").trim();
    if (!candidate) return "";
    try {
      const url = new URL(candidate);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch (_error) {
      return "";
    }
  }

  const safeImageUrl = safeHttpUrl;

  function safePhoneHref(value) {
    const candidate = String(value || "").trim();
    if (!candidate || /[\r\n]/.test(candidate) || !/^\+?[\d\s().-]+$/.test(candidate)) return "";
    const hasPlus = candidate.startsWith("+");
    const digits = candidate.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) return "";
    return `tel:${hasPlus ? "+" : ""}${digits}`;
  }

  function safeEmail(value) {
    const candidate = String(value || "").trim();
    if (!candidate || candidate.length > 254 || /[\r\n\s]/.test(candidate)) return "";
    return /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(candidate) ? candidate : "";
  }

  function mailtoUrl(value) {
    const email = safeEmail(value);
    return email ? `mailto:${encodeURIComponent(email)}` : "";
  }

  function hasContact(settings) {
    const source = settings && typeof settings === "object" ? settings : {};
    return Boolean(
      safePhoneHref(source.main_phone) || safeEmail(source.main_email)
      || safeHttpUrl(source.facebook_url) || safeHttpUrl(source.line_url)
    );
  }

  function sectionVisibility(settings) {
    const source = settings && typeof settings === "object" ? settings : {};
    return Object.freeze({ contact: hasContact(source), heroImage: Boolean(safeImageUrl(source.hero_image_url)) });
  }

  function normalizeState(value) {
    return STATE_NAMES.includes(value) ? value : "error";
  }

  function isEmptySettings(settings) {
    const source = settings && typeof settings === "object" ? settings : {};
    return !STRING_FIELDS.some((field) => String(source[field] || "").trim());
  }

  function createRequestGate() {
    let generation = 0;
    return Object.freeze({
      begin() { generation += 1; return generation; },
      isCurrent(token) { return token === generation; }
    });
  }

  function createAboutController(loadSettings, onChange = () => {}) {
    if (typeof loadSettings !== "function") throw new TypeError("loadSettings must be a function");
    const gate = createRequestGate();
    let state = "initial";
    let settings = Object.freeze({});
    let lang = "th";
    let requestCount = 0;

    function getSnapshot() {
      return Object.freeze({ state, settings, lang, slogan: localizedSlogan(settings, lang), requestCount });
    }

    function emit() {
      const snapshot = getSnapshot();
      onChange(snapshot);
      return snapshot;
    }

    async function load() {
      const token = gate.begin();
      requestCount += 1;
      state = "loading";
      emit();
      try {
        const normalized = normalizeSettingsResponse(await loadSettings());
        if (!gate.isCurrent(token)) return getSnapshot();
        settings = normalized;
        state = isEmptySettings(normalized) ? "empty" : "ready";
      } catch (error) {
        if (!gate.isCurrent(token)) return getSnapshot();
        settings = Object.freeze({});
        state = error?.code === "MALFORMED_RESPONSE" || error?.message === "MALFORMED_RESPONSE" ? "malformed-response" : "error";
      }
      return emit();
    }

    function setLanguage(value) {
      lang = value === "en" ? "en" : "th";
      return emit();
    }

    return Object.freeze({ load, retry: load, setLanguage, getSnapshot });
  }

  function mockSettings() {
    return {
      site_name: "Takhun Trip",
      site_slogan_th: "เที่ยวบ้านตาขุน ครบในทริปเดียว",
      site_slogan_en: "Discover Ban Ta Khun in One Trip",
      main_phone: "",
      main_email: "oh2daycreative@gmail.com",
      facebook_url: "",
      line_url: "",
      logo_url: "",
      hero_image_url: "",
      reviews_enabled: true,
      events_enabled: true
    };
  }

  function configuredApiUrl() {
    try {
      if (typeof APP_CONFIG !== "undefined") return String(APP_CONFIG?.API_URL || "").trim();
    } catch (_error) { /* Fall through to the window property. */ }
    return String(global.APP_CONFIG?.API_URL || "").trim();
  }

  function initializePage() {
    const root = global.document?.querySelector?.("[data-about-page]");
    if (!root) return;

    const stateRegions = Array.from(root.querySelectorAll("[data-about-state]"));
    const siteName = root.querySelector("[data-about-site-name]");
    const slogan = root.querySelector("[data-about-slogan]");
    const heroImage = root.querySelector("[data-about-hero-image]");
    const heroFallback = root.querySelector("[data-about-hero-fallback]");
    const heroMedia = root.querySelector(".about-page__hero-media");
    const logo = root.querySelector("[data-about-logo]");
    const logoWrap = root.querySelector("[data-about-logo-wrap]");
    const contactSection = root.querySelector("[data-about-contact-section]");
    const mockNotice = root.querySelector("[data-about-mock-notice]");
    const t = (key) => global.TakhunI18n?.t?.(key) || key;

    function setState(state) {
      const normalized = normalizeState(state);
      stateRegions.forEach((region) => { region.hidden = region.dataset.aboutState !== normalized; });
      root.setAttribute("aria-busy", normalized === "loading" ? "true" : "false");
    }

    function setImage(image, fallback, _value, altKey) {
      const mount = heroMedia;
      image.hidden = false;
      if (!global.TakhunMedia?.renderImage || !mount) { image.hidden = true; if (fallback) fallback.hidden = false; return; }
      global.TakhunMedia.renderImage(mount, { mediaId: global.TakhunMedia.mediaIdFor("shared", "shared-about-project"), type: "shared", role: "hero", className: "about-page__hero-image", alt: t(altKey), loading: "eager", sizes: "100vw", lang: global.TakhunI18n?.getCurrentLang?.(), fallbackFactory: () => { fallback.hidden = false; return fallback; } });
    }

    function setContact(type, href, value = "") {
      const link = root.querySelector(`[data-about-contact="${type}"]`);
      if (!link) return;
      link.hidden = !href;
      link.removeAttribute("href");
      if (!href) return;
      link.href = href;
      const valueNode = link.querySelector("[data-about-contact-value]");
      if (valueNode) valueNode.textContent = value;
    }

    function renderReady(settings, lang) {
      const name = String(settings.site_name || "").trim() || t("about_page.fallback_site_name");
      siteName.textContent = name;
      slogan.textContent = localizedSlogan(settings, lang);
      slogan.hidden = !slogan.textContent;
      setImage(heroImage, heroFallback, settings.hero_image_url, "about_page.hero_alt");

      const logoUrl = "";
      logoWrap.hidden = true;
      logo.removeAttribute("src");
      if (logoUrl) {
        logo.alt = t("about_page.logo_alt");
        logo.src = logoUrl;
        logo.addEventListener("error", () => { logo.removeAttribute("src"); logoWrap.hidden = true; }, { once: true });
      }

      const phoneHref = safePhoneHref(settings.main_phone);
      const email = safeEmail(settings.main_email);
      setContact("phone", phoneHref, settings.main_phone);
      setContact("email", mailtoUrl(email), email);
      setContact("facebook", safeHttpUrl(settings.facebook_url));
      setContact("line", safeHttpUrl(settings.line_url));
      contactSection.hidden = !hasContact(settings);
      mockNotice.hidden = Boolean(configuredApiUrl());
    }

    function render(snapshot) {
      setState(snapshot.state);
      if (snapshot.state === "ready") renderReady(snapshot.settings, snapshot.lang);
    }

    const controller = createAboutController(
      () => global.TakhunApi.getSettings({ mock: mockSettings }),
      render
    );

    root.querySelectorAll("[data-about-retry]").forEach((button) => button.addEventListener("click", controller.retry));
    global.document.addEventListener("takhun:languagechange", (event) => {
      global.TakhunI18n?.applyTranslations?.(global.document);
      controller.setLanguage(event?.detail?.lang || global.TakhunI18n?.getCurrentLang?.());
    });
    controller.setLanguage(global.TakhunI18n?.getCurrentLang?.());
    controller.load();
  }

  global.TakhunAbout = Object.freeze({
    normalizeSettingsResponse, localizedSlogan, safeHttpUrl, safeImageUrl, safePhoneHref,
    safeEmail, mailtoUrl, hasContact, sectionVisibility, normalizeState, isEmptySettings,
    createRequestGate, createAboutController, mockSettings
  });
  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initializePage, { once: true });
  else initializePage();
})(window);
