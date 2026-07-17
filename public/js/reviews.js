"use strict";

(function createPublicReviews(global) {
  const PAGE_SIZE = 10;
  const REVIEW_STATES = Object.freeze(["idle", "loading", "ready", "empty", "error"]);

  function validatePlaceId(value) {
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value.trim());
  }

  function parseReviewPage(search) {
    const raw = new URLSearchParams(String(search || "")).get("review_page");
    if (raw === null || !/^\d+$/.test(raw)) return 1;
    const page = Number(raw);
    return Number.isSafeInteger(page) && page >= 1 ? page : 1;
  }

  function setState(mounts, state) {
    Object.values(mounts || {}).forEach((mount) => { if (mount) mount.hidden = true; });
    if (!REVIEW_STATES.includes(state) || !mounts?.[state]) throw new Error("Unknown review state");
    mounts[state].hidden = false;
    return state;
  }

  function normalizeResponse(value, placeId) {
    const total = value?.total;
    const count = value?.summary?.review_count;
    const average = value?.summary?.average_rating;
    if (!value || !Array.isArray(value.items) || !Number.isInteger(total) || total < 0 || value.items.length > total || !Number.isInteger(count) || count < 0 || count !== total || typeof average !== "number" || !Number.isFinite(average) || average < 0 || average > 5 || (count === 0 && average !== 0)) {
      throw new Error("Invalid review response");
    }
    const items = value.items.map((item) => {
      const valid = item && typeof item.review_id === "string" && item.review_id.trim() &&
        typeof item.place_id === "string" && item.place_id === placeId &&
        typeof item.reviewer_name === "string" && typeof item.is_anonymous === "boolean" &&
        (item.is_anonymous || item.reviewer_name.trim()) && typeof item.rating === "number" &&
        Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5 &&
        typeof item.comment === "string" && item.comment.trim() && typeof item.admin_reply === "string" &&
        typeof item.created_at === "string";
      if (!valid) throw new Error("Invalid review response");
      return {
        review_id: item.review_id,
        place_id: item.place_id,
        reviewer_name: item.reviewer_name,
        is_anonymous: item.is_anonymous,
        rating: item.rating,
        comment: item.comment,
        admin_reply: item.admin_reply,
        created_at: item.created_at
      };
    });
    return { items, summary: { average_rating: average, review_count: count }, total };
  }

  function parseCreatedAt(value) {
    if (typeof value !== "string") return null;
    const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
    if (!match) return null;
    const parts = match.slice(1).map(Number);
    const [year, month, day, hour, minute, second] = parts;
    if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date;
  }

  function formatReviewDate(value, lang) {
    const date = parseCreatedAt(value);
    if (!date) return "";
    return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "th-TH", {
      year: "numeric", month: "long", day: "numeric", timeZone: "UTC"
    }).format(date);
  }

  function buildMockResponse(placeId, rows, page = 1, pageSize = PAGE_SIZE) {
    const approved = (Array.isArray(rows) ? rows : []).filter((row) => row?.status === "approved").map((row) => {
      const rating = row?.rating;
      const anonymous = row?.is_anonymous === true;
      const reviewerName = typeof row?.reviewer_name === "string" ? row.reviewer_name : "";
      const comment = typeof row?.comment === "string" ? row.comment : typeof row?.comment_th === "string" ? row.comment_th : typeof row?.comment_en === "string" ? row.comment_en : "";
      const adminReply = typeof row?.admin_reply === "string" ? row.admin_reply : typeof row?.admin_reply_th === "string" ? row.admin_reply_th : typeof row?.admin_reply_en === "string" ? row.admin_reply_en : "";
      if (typeof row?.review_id !== "string" || !row.review_id.trim() || !Number.isInteger(rating) || rating < 1 || rating > 5 || !comment.trim() || (!anonymous && !reviewerName.trim())) return null;
      return { review_id: row.review_id, place_id: placeId, reviewer_name: reviewerName, is_anonymous: anonymous, rating, comment, admin_reply: adminReply, created_at: typeof row.created_at === "string" ? row.created_at : "" };
    }).filter(Boolean);
    const total = approved.length;
    const ratingTotal = approved.reduce((sum, review) => sum + review.rating, 0);
    const start = (page - 1) * pageSize;
    return {
      items: approved.slice(start, start + pageSize),
      summary: { average_rating: total ? Math.round((ratingTotal / total) * 10) / 10 : 0, review_count: total },
      total
    };
  }

  function formatMessage(i18n, key, values) {
    return String(i18n?.t?.(key) || key).replace(/\{(\w+)\}/g, (_match, name) => String(values?.[name] ?? ""));
  }

  function createController(options = {}) {
    const api = options.api || global.TakhunApi;
    const i18n = options.i18n || global.TakhunI18n;
    const documentRef = options.document || global.document;
    const locationRef = options.location || global.location;
    const historyRef = options.history || global.history;
    const mounts = options.mounts || {};
    const elements = options.elements || {};
    const onSummary = typeof options.onSummary === "function" ? options.onSummary : function () {};
    const getMockRows = typeof options.getMockRows === "function" ? options.getMockRows : function () { return []; };
    const inFlight = new Map();
    let generation = 0;
    let currentPlaceId = "";
    let currentPage = 1;
    let currentModel = null;

    function make(tag, className, text) {
      const element = documentRef.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }

    function currentLang() { return i18n?.getCurrentLang?.() === "en" ? "en" : "th"; }

    function renderRating(rating) {
      const wrapper = make("span", "review-card__rating");
      wrapper.setAttribute("role", "img");
      wrapper.setAttribute("aria-label", formatMessage(i18n, "place_detail.review_rating_label", { rating }));
      const stars = make("span", "review-card__stars", `${"★".repeat(rating)}${"☆".repeat(5 - rating)}`);
      stars.setAttribute("aria-hidden", "true");
      const fallback = make("span", "review-card__rating-text", `${rating}/5`);
      fallback.setAttribute("aria-hidden", "true");
      wrapper.append(stars, fallback);
      return wrapper;
    }

    function renderModel(model, focusHeading) {
      const lang = currentLang();
      elements.list?.replaceChildren();
      if (model.total === 0) {
        elements.summary?.replaceChildren();
        if (elements.pagination) elements.pagination.hidden = true;
        setState(mounts, "empty");
        onSummary(model.summary);
        return;
      }

      if (elements.summary) {
        elements.summary.textContent = formatMessage(i18n, "place_detail.review_summary_full", {
          average: model.summary.average_rating.toFixed(1), count: model.summary.review_count
        });
      }
      model.items.forEach((review) => {
        const card = make("article", "review-card detail-review-card");
        const header = make("div", "review-card__header");
        const name = review.is_anonymous ? formatMessage(i18n, "place_detail.anonymous_reviewer") : review.reviewer_name;
        header.append(make("h3", "review-card__name", name), renderRating(review.rating));
        card.append(header, make("p", "review-card__comment", review.comment));
        if (review.admin_reply.trim()) {
          const reply = make("div", "review-card__reply");
          reply.append(
            make("h4", "review-card__reply-title", formatMessage(i18n, "place_detail.review_admin_reply")),
            make("p", "review-card__reply-text", review.admin_reply)
          );
          card.append(reply);
        }
        const dateText = formatReviewDate(review.created_at, lang);
        if (dateText) card.append(make("p", "review-card__date", dateText));
        elements.list?.append(card);
      });

      const pageCount = Math.max(1, Math.ceil(model.total / PAGE_SIZE));
      if (elements.previous) {
        elements.previous.disabled = currentPage <= 1;
        elements.previous.textContent = formatMessage(i18n, "place_detail.review_previous");
        elements.previous.setAttribute("aria-label", formatMessage(i18n, "place_detail.review_previous_label"));
      }
      if (elements.next) {
        elements.next.disabled = currentPage >= pageCount;
        elements.next.textContent = formatMessage(i18n, "place_detail.review_next");
        elements.next.setAttribute("aria-label", formatMessage(i18n, "place_detail.review_next_label"));
      }
      if (elements.indicator) elements.indicator.textContent = formatMessage(i18n, "place_detail.review_page_indicator", { page: currentPage, pages: pageCount });
      if (elements.pagination) elements.pagination.hidden = model.total <= PAGE_SIZE;
      setState(mounts, "ready");
      onSummary(model.summary);
      if (focusHeading) elements.heading?.focus?.();
    }

    function writePageToUrl(page, mode) {
      const url = new URL(locationRef.href);
      url.searchParams.set("review_page", String(page));
      const target = `${url.pathname}${url.search}${url.hash}`;
      if (mode === "push") historyRef?.pushState?.({}, "", target);
      if (mode === "replace") historyRef?.replaceState?.({}, "", target);
    }

    function hasInvalidReviewPage(search) {
      const raw = new URLSearchParams(String(search || "")).get("review_page");
      return raw !== null && (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1);
    }

    function loadPage(page, optionsForLoad = {}) {
      if (!validatePlaceId(currentPlaceId)) {
        generation += 1;
        currentModel = null;
        onSummary(null);
        setState(mounts, "idle");
        return Promise.resolve("idle");
      }
      const requestPage = Number.isSafeInteger(page) && page >= 1 ? page : 1;
      const key = `${currentPlaceId}|${requestPage}|${PAGE_SIZE}`;
      if (inFlight.has(key)) return inFlight.get(key);
      const token = ++generation;
      currentPage = requestPage;
      currentModel = null;
      onSummary(null);
      elements.list?.replaceChildren();
      elements.summary?.replaceChildren();
      if (elements.pagination) elements.pagination.hidden = true;
      setState(mounts, "loading");
      let apiResult;
      try {
        apiResult = api.getReviews(
          currentPlaceId,
          { page: requestPage, page_size: PAGE_SIZE },
          { mock: () => buildMockResponse(currentPlaceId, getMockRows(), requestPage, PAGE_SIZE) }
        );
      } catch (error) {
        apiResult = Promise.reject(error);
      }
      const request = Promise.resolve(apiResult).then((raw) => {
        if (token !== generation) return "stale";
        const normalized = normalizeResponse(raw, currentPlaceId);
        const pageCount = Math.ceil(normalized.total / PAGE_SIZE);
        if (normalized.total > 0 && requestPage > pageCount && optionsForLoad.allowNormalize !== false) {
          writePageToUrl(pageCount, "replace");
          return loadPage(pageCount, { ...optionsForLoad, allowNormalize: false });
        }
        if (normalized.total > 0 && requestPage <= pageCount && normalized.items.length === 0) throw new Error("Invalid review response");
        currentModel = normalized;
        renderModel(normalized, optionsForLoad.focus === true);
        return normalized.total ? "ready" : "empty";
      }).catch((_error) => {
        if (token !== generation) return "stale";
        currentModel = null;
        onSummary(null);
        setState(mounts, "error");
        return "error";
      }).finally(() => {
        if (inFlight.get(key) === request) inFlight.delete(key);
      });
      inFlight.set(key, request);
      return request;
    }

    function goToPage(page) {
      if (!currentModel) return Promise.resolve("idle");
      const pageCount = Math.max(1, Math.ceil(currentModel.total / PAGE_SIZE));
      const target = Math.min(Math.max(1, page), pageCount);
      if (target === currentPage) return Promise.resolve("unchanged");
      writePageToUrl(target, "push");
      return loadPage(target, { focus: true });
    }

    elements.previous?.addEventListener?.("click", () => goToPage(currentPage - 1));
    elements.next?.addEventListener?.("click", () => goToPage(currentPage + 1));
    elements.retry?.addEventListener?.("click", () => retry());

    function setPlace(place) {
      const nextPlaceId = typeof place?.place_id === "string" ? place.place_id.trim() : "";
      if (nextPlaceId !== currentPlaceId) generation += 1;
      currentPlaceId = nextPlaceId;
      if (!validatePlaceId(currentPlaceId)) {
        currentModel = null;
        onSummary(null);
        setState(mounts, "idle");
        return Promise.resolve("idle");
      }
      if (hasInvalidReviewPage(locationRef.search)) writePageToUrl(1, "replace");
      return loadPage(parseReviewPage(locationRef.search));
    }

    function retry() { return loadPage(currentPage, { focus: true }); }
    function handlePopState() {
      if (hasInvalidReviewPage(locationRef.search)) writePageToUrl(1, "replace");
      return loadPage(parseReviewPage(locationRef.search), { focus: true });
    }
    function handleLanguageChange() { if (currentModel) renderModel(currentModel, false); }

    return Object.freeze({ setPlace, retry, handlePopState, handleLanguageChange, goToPage });
  }

  global.TakhunReviews = Object.freeze({
    PAGE_SIZE,
    validatePlaceId,
    parseReviewPage,
    setState,
    normalizeResponse,
    parseCreatedAt,
    formatReviewDate,
    buildMockResponse,
    createController
  });
})(window);
