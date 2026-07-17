"use strict";

(function createProductsFeature(global) {
  const PRODUCT_CATEGORIES = Object.freeze([
    "food", "souvenir", "herbal", "honey", "handicraft", "fruit",
    "community_activity", "tourism_service", "accommodation", "transport"
  ]);
  const DISTRICTS = Object.freeze(["ban_ta_khun", "khiri_rat_nikhom", "phanom"]);
  const PRODUCT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

  function parseProductId(search = global.location?.search || "") {
    return String(new URLSearchParams(search).get("id") || "").trim();
  }

  function validateProductId(value) {
    return PRODUCT_ID_PATTERN.test(String(value || "").trim());
  }

  function validateDetailRequestId(value, hasConfiguredApi = Boolean(String(global.APP_CONFIG?.API_URL || "").trim())) {
    const id = String(value || "").trim();
    return validateProductId(id) && (hasConfiguredApi || /^PROD-[A-Za-z0-9_-]+$/.test(id));
  }

  function parseProductFilters(search = global.location?.search || "") {
    const params = new URLSearchParams(search);
    const filters = {};
    const invalid = [];
    const category = String(params.get("category") || "").trim();
    const district = String(params.get("district") || "").trim();
    const relatedPlaceId = String(params.get("related_place_id") || "").trim();
    if (category) PRODUCT_CATEGORIES.includes(category) ? filters.category = category : invalid.push("category");
    if (district) DISTRICTS.includes(district) ? filters.district = district : invalid.push("district");
    if (relatedPlaceId) validateProductId(relatedPlaceId) ? filters.related_place_id = relatedPlaceId : invalid.push("related_place_id");
    return { filters, invalid };
  }

  function filterProducts(products, filters = {}) {
    const entries = Object.entries(filters).filter(([, value]) => value !== "" && value !== null && value !== undefined);
    return (Array.isArray(products) ? products : []).filter((product) => entries.every(([key, value]) => String(product?.[key] || "") === String(value)));
  }

  function malformedResponse() {
    const error = new Error("MALFORMED_RESPONSE");
    error.code = "MALFORMED_RESPONSE";
    return error;
  }

  function normalizeProductList(data) {
    if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.items)) throw malformedResponse();
    const items = data.items.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item) || !validateProductId(item.product_id)) throw malformedResponse();
      return { ...item, product_id: String(item.product_id).trim() };
    });
    const parsedTotal = Number(data.total);
    return { items, total: Number.isFinite(parsedTotal) && parsedTotal >= 0 ? parsedTotal : items.length };
  }

  function normalizeProductDetail(data) {
    if (data === null) return null;
    if (!data || typeof data !== "object" || Array.isArray(data) || !validateProductId(data.product_id)) throw malformedResponse();
    return { ...data, product_id: String(data.product_id).trim() };
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

  function sortProducts(products) {
    return (Array.isArray(products) ? products : []).map((product, index) => ({ product, index })).sort((left, right) => {
      const featuredDifference = Number(normalizeBoolean(right.product?.is_featured)) - Number(normalizeBoolean(left.product?.is_featured));
      if (featuredDifference) return featuredDifference;
      const leftRawOrder = left.product?.sort_order;
      const rightRawOrder = right.product?.sort_order;
      const leftOrder = leftRawOrder === null || leftRawOrder === undefined || String(leftRawOrder).trim() === "" ? Number.NaN : Number(leftRawOrder);
      const rightOrder = rightRawOrder === null || rightRawOrder === undefined || String(rightRawOrder).trim() === "" ? Number.NaN : Number(rightRawOrder);
      const safeLeft = Number.isFinite(leftOrder) ? leftOrder : Number.POSITIVE_INFINITY;
      const safeRight = Number.isFinite(rightOrder) ? rightOrder : Number.POSITIVE_INFINITY;
      return safeLeft - safeRight || left.index - right.index;
    }).map(({ product }) => product);
  }

  function priceState(product) {
    const raw = product?.price_range;
    const value = raw === null || raw === undefined ? "" : String(raw).trim();
    return !value || value === "0" ? { kind: "contact", value: "" } : { kind: "value", value };
  }

  function safePhoneHref(value) {
    const source = String(value || "").trim();
    if (!source || !/^\+?[\d\s().-]+$/.test(source)) return "";
    const normalized = `${source.startsWith("+") ? "+" : ""}${source.replace(/\D/g, "")}`;
    return normalized.replace(/^\+\+/, "+").replace(/^\+(?=\D)/, "").replace(/^$/, "") && normalized.replace(/\D/g, "").length >= 6 ? `tel:${normalized}` : "";
  }

  function safeExternalUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
    } catch (_error) {
      return "";
    }
  }

  function productContactModel(product) {
    const phone = String(product?.phone || "").trim();
    const phoneHref = safePhoneHref(phone);
    const contactHref = safeExternalUrl(product?.contact_url);
    const actions = [];
    if (phoneHref) actions.push({ kind: "phone", href: phoneHref, value: phone });
    if (contactHref) actions.push({ kind: "contact", href: contactHref, value: "" });
    return { visible: actions.length > 0, actions };
  }

  function encoded(value) { return encodeURIComponent(String(value || "").trim()); }
  function detailUrl(productId) { return `product-detail.html?id=${encoded(productId)}`; }
  function relatedPlaceUrl(placeId) { return `place-detail.html?id=${encoded(placeId)}`; }

  function mapUrl(product) {
    const direct = safeExternalUrl(product?.google_maps_url);
    if (direct) return direct;
    const rawLatitude = String(product?.latitude ?? "").trim();
    const rawLongitude = String(product?.longitude ?? "").trim();
    if (rawLatitude && rawLongitude) {
      const latitude = Number(rawLatitude);
      const longitude = Number(rawLongitude);
      if (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
      }
    }
    const relatedPlaceId = product?.related_place?.place_id || product?.related_place_id;
    return validateProductId(relatedPlaceId) ? `map.html?focus=${encoded(relatedPlaceId)}` : "";
  }

  function resolveListState({ loading = false, error = false, items = [], filtered = false } = {}) {
    if (loading) return "loading";
    if (error) return "error";
    if (!Array.isArray(items) || items.length === 0) return filtered ? "filtered-empty" : "empty";
    return "ready";
  }

  function resolveDetailState({ loading = false, error = false, validId = true, product } = {}) {
    if (!validId) return "invalid-id";
    if (loading) return "loading";
    if (error) return "error";
    return product ? "ready" : "not-found";
  }

  function setPageState(stateMap, activeState) {
    if (!stateMap || !Object.prototype.hasOwnProperty.call(stateMap, activeState)) return false;
    Object.entries(stateMap).forEach(([state, element]) => { if (element) element.hidden = state !== activeState; });
    return true;
  }

  function mockGetProducts(params = {}) {
    const filters = {};
    for (const key of ["category", "district", "related_place_id"]) if (params[key]) filters[key] = params[key];
    const items = sortProducts(filterProducts(global.TakhunContentData.listProducts(), filters));
    return { items, total: items.length };
  }

  function mockGetProductDetail(productId) {
    const product = global.TakhunContentData.getProductById(productId);
    if (!product) return null;
    const detail = { ...product };
    if (detail.related_place_id) detail.related_place = { place_id: detail.related_place_id, name: "" };
    return detail;
  }

  function t(key) { return global.TakhunI18n?.t?.(key) || key; }
  function format(key, values = {}) { return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), t(key)); }
  function currentLang() { return global.TakhunI18n?.getCurrentLang?.() || "th"; }

  function make(tag, className = "", text = "") {
    const element = global.document.createElement(tag);
    if (className) element.className = className;
    if (text !== "") element.textContent = text;
    return element;
  }

  function appendProductImage(mount, product, name, detail = false) {
    const fallbackFactory = () => {
      const panel = make("span", detail ? "product-detail-page__image-fallback" : "product-card__image-fallback", t("products.image_fallback"));
      panel.setAttribute("role", "img");
      panel.setAttribute("aria-label", format("products.image_alt", { name }));
      return panel;
    };
    if (global.TakhunMedia?.renderImage) global.TakhunMedia.renderImage(mount, { mediaId: global.TakhunMedia.mediaIdFor("product", product.product_id), type: "product", role: "product", className: detail ? "product-detail-page__image" : "product-card__image", alt: format("products.image_alt", { name }), loading: detail ? "eager" : "lazy", sizes: detail ? "100vw" : "(min-width: 768px) 33vw, 100vw", lang: global.TakhunI18n?.getCurrentLang?.(), fallbackFactory });
    else mount.append(fallbackFactory());
  }

  function categoryLabel(value) { return t(`products.categories.${value}`); }
  function districtLabel(value) { return t(`products.districts.${value}`); }

  function renderProductCard(product) {
    const lang = currentLang();
    const name = localized(product, "name", lang) || t("products.unnamed");
    const description = localized(product, "description", lang);
    const card = make("article", "product-card");
    const media = make("a", "product-card__media");
    media.href = detailUrl(product.product_id);
    media.setAttribute("aria-label", format("products.view_named", { name }));
    appendProductImage(media, product, name);
    if (normalizeBoolean(product.is_featured)) media.append(make("span", "product-card__featured", t("products.featured_badge")));
    const body = make("div", "product-card__content");
    const meta = make("div", "product-card__meta");
    if (product.category) meta.append(make("span", "product-card__badge", categoryLabel(product.category)));
    if (product.district) meta.append(make("span", "product-card__district", districtLabel(product.district)));
    const title = make("h3", "product-card__title");
    const titleLink = make("a", "", name); titleLink.href = detailUrl(product.product_id); title.append(titleLink);
    body.append(meta, title);
    if (product.producer_name) body.append(make("p", "product-card__producer", `${t("products.producer")}: ${product.producer_name}`));
    if (description) body.append(make("p", "product-card__description", description));
    const price = priceState(product);
    if (price.kind === "value") body.append(make("p", "product-card__price product-card__price--value", price.value));
    const actions = make("div", "product-card__actions");
    const detail = make("a", "button button--primary", t("products.view_details")); detail.href = detailUrl(product.product_id); actions.append(detail);
    const phone = safePhoneHref(product.phone);
    const contact = safeExternalUrl(product.contact_url);
    if (phone) { const call = make("a", "button button--ghost", t("products.call")); call.href = phone; actions.append(call); }
    else if (contact) { const link = make("a", "button button--ghost", t("products.contact")); link.href = contact; link.target = "_blank"; link.rel = "noopener noreferrer"; actions.append(link); }
    body.append(actions); card.append(media, body);
    return card;
  }

  function initializeProductsList() {
    const root = global.document?.querySelector?.(".products-page");
    if (!root || !global.TakhunApi?.getProducts) return;
    const states = {
      loading: global.document.querySelector("[data-products-loading]"),
      ready: global.document.querySelector("[data-products-ready]"),
      empty: global.document.querySelector("[data-products-empty]"),
      "filtered-empty": global.document.querySelector("[data-products-filtered-empty]"),
      error: global.document.querySelector("[data-products-error]")
    };
    const form = global.document.querySelector("[data-products-filter-form]");
    const invalidNotice = global.document.querySelector("[data-products-invalid-filter]");
    const summary = global.document.querySelector("[data-products-summary]");
    const featuredSection = global.document.querySelector("[data-products-featured-section]");
    const featuredGrid = global.document.querySelector("[data-products-featured]");
    const grid = global.document.querySelector("[data-products-grid]");
    let records = [];
    let filters = {};

    function populateSelect(select, values, key) {
      const selected = select.value;
      const options = [make("option", "", t("products.all")), ...values.map((value) => make("option", "", key === "category" ? categoryLabel(value) : districtLabel(value)))];
      options[0].value = "";
      values.forEach((value, index) => { options[index + 1].value = value; });
      select.replaceChildren(...options); select.value = selected;
    }

    function applyControls() {
      const category = form.querySelector('[data-product-filter="category"]');
      const district = form.querySelector('[data-product-filter="district"]');
      populateSelect(category, PRODUCT_CATEGORIES, "category");
      populateSelect(district, DISTRICTS, "district");
      category.value = filters.category || "";
      district.value = filters.district || "";
      form.querySelector('[data-product-filter="related_place_id"]').value = filters.related_place_id || "";
    }

    function render() {
      const sorted = sortProducts(records);
      const featured = sorted.filter((product) => normalizeBoolean(product.is_featured));
      featuredGrid.replaceChildren(...featured.map(renderProductCard));
      featuredSection.hidden = featured.length === 0;
      grid.replaceChildren(...sorted.map(renderProductCard));
      summary.textContent = format("products.results_summary", { count: sorted.length });
      setPageState(states, resolveListState({ items: sorted, filtered: Object.keys(filters).length > 0 }));
      applyControls();
      global.TakhunI18n?.applyTranslations?.(root);
    }

    function readControls() {
      const next = {};
      for (const key of ["category", "district", "related_place_id"]) {
        const value = String(form.querySelector(`[data-product-filter="${key}"]`)?.value || "").trim();
        if (value) next[key] = value;
      }
      const parsed = parseProductFilters(`?${new URLSearchParams(next)}`);
      invalidNotice.hidden = parsed.invalid.length === 0;
      return parsed.filters;
    }

    function syncUrl() {
      const params = new URLSearchParams(filters);
      const url = `${global.location.pathname}${params.toString() ? `?${params}` : ""}`;
      global.history?.replaceState?.({}, "", url);
    }

    async function fetchProducts() {
      setPageState(states, "loading");
      try {
        const data = await global.TakhunApi.getProducts({ ...filters, lang: currentLang() }, { mock: mockGetProducts });
        records = normalizeProductList(data).items;
        global.document.querySelector("[data-products-demo-notice]").hidden = Boolean(String(global.APP_CONFIG?.API_URL || "").trim());
        render();
      } catch (_error) {
        setPageState(states, "error");
      }
    }

    const parsed = parseProductFilters(global.location.search);
    filters = parsed.filters;
    invalidNotice.hidden = parsed.invalid.length === 0;
    applyControls();
    form.addEventListener("submit", (event) => { event.preventDefault(); filters = readControls(); syncUrl(); fetchProducts(); });
    global.document.querySelectorAll("[data-products-clear]").forEach((button) => button.addEventListener("click", () => { filters = {}; invalidNotice.hidden = true; applyControls(); syncUrl(); fetchProducts(); }));
    global.document.querySelector("[data-products-retry]")?.addEventListener("click", fetchProducts);
    global.document.addEventListener("takhun:languagechange", () => { global.TakhunI18n?.applyTranslations?.(global.document); if (records.length) render(); else applyControls(); });
    fetchProducts();
  }

  function appendExternalAction(mount, label, href) {
    if (!href) return;
    const link = make("a", "button button--secondary", label); link.href = href;
    if (href.startsWith("http:" ) || href.startsWith("https:")) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
    mount.append(link);
  }

  function renderProductDetail(product) {
    const lang = currentLang();
    const name = localized(product, "name", lang) || t("products.unnamed");
    global.document.title = format("product_detail.page_title", { name });
    const media = global.document.querySelector("[data-product-detail-media]"); media.replaceChildren(); appendProductImage(media, product, name, true);
    const summary = global.document.querySelector("[data-product-detail-summary]"); summary.replaceChildren();
    if (product.category) summary.append(make("span", "product-detail-page__badge", categoryLabel(product.category)));
    summary.append(make("h1", "product-detail-page__title", name));
    if (product.producer_name) summary.append(make("p", "product-detail-page__producer", `${t("products.producer")}: ${product.producer_name}`));
    const price = priceState(product); if (price.kind === "value") summary.append(make("p", "product-detail-page__price product-detail-page__price--value", price.value));
    const description = global.document.querySelector("[data-product-detail-description]");
    const descriptionTitle = make("h2", "", t("product_detail.description")); descriptionTitle.id = "product-description-title";
    description.replaceChildren(descriptionTitle, make("p", "", localized(product, "description", lang) || t("product_detail.description_empty")));
    const actions = global.document.querySelector("[data-product-contact-actions]"); actions.replaceChildren();
    const contactModel = productContactModel(product);
    contactModel.actions.forEach((action) => appendExternalAction(actions, action.kind === "phone" ? `${t("products.call")} ${action.value}` : t("products.contact"), action.href));
    global.document.querySelector("[data-product-contact]").hidden = !contactModel.visible;
    const related = global.document.querySelector("[data-product-related]"); related.replaceChildren();
    const relatedId = String(product.related_place?.place_id || product.related_place_id || "").trim();
    if (validateProductId(relatedId)) {
      const relatedName = localized(product.related_place, "name", lang);
      const relatedTitle = make("h2", "", t("product_detail.related_place")); relatedTitle.id = "product-related-title"; related.append(relatedTitle);
      if (relatedName) related.append(make("p", "", relatedName));
      const link = make("a", "button button--secondary", t("product_detail.view_related_place")); link.href = relatedPlaceUrl(relatedId); related.append(link);
      related.hidden = false;
    } else {
      const relatedTitle = make("h2", "", t("product_detail.related_place")); relatedTitle.id = "product-related-title";
      related.append(relatedTitle, make("p", "", t("product_detail.no_related_place")));
      related.hidden = false;
    }
    global.document.querySelector("[data-product-detail-demo-notice]").hidden = Boolean(String(global.APP_CONFIG?.API_URL || "").trim());
  }

  function initializeProductDetail() {
    const root = global.document?.querySelector?.(".product-detail-page");
    if (!root || !global.TakhunApi?.getProductDetail) return;
    const states = {
      loading: global.document.querySelector("[data-product-detail-loading]"),
      ready: global.document.querySelector("[data-product-detail-ready]"),
      "invalid-id": global.document.querySelector("[data-product-detail-invalid]"),
      "not-found": global.document.querySelector("[data-product-detail-not-found]"),
      error: global.document.querySelector("[data-product-detail-error]")
    };
    const productId = parseProductId();
    let product = null;

    async function fetchDetail() {
      if (!validateDetailRequestId(productId)) { setPageState(states, "invalid-id"); return; }
      setPageState(states, "loading");
      try {
        const data = await global.TakhunApi.getProductDetail(productId, { lang: currentLang() }, { mock: ({ product_id: id }) => mockGetProductDetail(id) });
        product = normalizeProductDetail(data);
        const state = resolveDetailState({ validId: true, product });
        if (state === "ready") renderProductDetail(product);
        setPageState(states, state);
      } catch (error) {
        setPageState(states, error?.code === "NOT_FOUND" ? "not-found" : "error");
      }
    }

    global.document.querySelector("[data-product-detail-retry]")?.addEventListener("click", fetchDetail);
    global.document.addEventListener("takhun:languagechange", () => { global.TakhunI18n?.applyTranslations?.(global.document); if (product) renderProductDetail(product); });
    fetchDetail();
  }

  global.TakhunProducts = Object.freeze({
    parseProductId, validateProductId, parseProductFilters, filterProducts, normalizeProductList,
    normalizeProductDetail, localized, normalizeBoolean, sortProducts, priceState, safePhoneHref,
    safeExternalUrl, detailUrl, relatedPlaceUrl, mapUrl, resolveListState, resolveDetailState,
    mockGetProducts, mockGetProductDetail, setPageState, productContactModel, validateDetailRequestId
  });

  if (global.document?.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", () => { initializeProductsList(); initializeProductDetail(); }, { once: true });
  } else {
    initializeProductsList(); initializeProductDetail();
  }
})(window);
